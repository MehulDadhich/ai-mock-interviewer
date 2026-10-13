import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CornerDownLeft, Flag, LoaderCircle, Mic, MicOff, Repeat, RotateCcw, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import RevealText from "../components/RevealText";
import VoiceLine from "../components/VoiceLine";
import { useExtensionWatch } from "../hooks/useExtensions";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { Recognition, voiceEnvironmentProblem } from "../hooks/speech";
import { recorderSupported, useRecorder } from "../hooks/useRecorder";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { ease, swap } from "../motion";
import { useSession } from "../session";

// Silence after the candidate's last words before the answer is sent automatically.
const SILENCE_MS = 2800;
// Short pauses mid-sentence are normal; only show the countdown once a pause lasts this long.
const COUNTDOWN_AFTER_MS = 700;
// Recording fallback: a pause this long ends a phrase, which is transcribed while you keep talking.
const PHRASE_PAUSE_MS = 600;
// ...but at most one phrase in flight, and no more often than this, to stay under Groq's rate limits.
const PHRASE_MIN_GAP_MS = 5000;
// Transcriptions that hit a rate limit or a hiccup are retried after these waits, so no words are lost.
const PHRASE_RETRY_MS = [2000, 5000];
const RETRYABLE = new Set([0, 429, 502, 503, 504]);
// While waiting on the server, "Sending" turns into "Thinking" after this long.
const THINKING_AFTER_MS = 700;
// Leaving the tab (or an extension showing up) is a warning; this one submits and ends the interview.
const MAX_WARNINGS = 3;

const recognitionSupported =
  typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
const envProblem = voiceEnvironmentProblem();
// Browser speech-service failures that the server-side transcription fallback can get around.
const SERVICE_ERRORS = new Set(["network", "service-not-allowed", "language-not-supported"]);
const browserSpeechUsable = Boolean(Recognition) && !(typeof navigator !== "undefined" && navigator.brave);

const pad = (n) => String(n).padStart(2, "0");
const join = (a, b) => [a.trim(), b.trim()].filter(Boolean).join(" ");
const clock = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;

function metaLabel(turn) {
  if (turn.kind === "closing") return "Wrap-up";
  const q = `Question ${pad(turn.question_number)} / ${pad(turn.total_questions)}`;
  return turn.kind === "follow_up" ? `Follow-up · ${q}` : q;
}

export default function InterviewRoute() {
  const { session } = useSession();
  if (!session) return <Navigate to="/practice" replace />;
  if (session.status === "ended") return <Navigate to="/report" replace />;
  if (session.status === "left") return <Interrupted session={session} />;
  return <Interview key={session.id} session={session} />;
}

/** Shown when an interview page is re-entered after leaving it (back button, reload). */
function Interrupted({ session }) {
  const navigate = useNavigate();
  const { setStatus } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const getFeedback = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.end(session.id);
      setStatus("ended");
      navigate("/report");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="container narrow state-page">
      <p className="kicker">Interview paused</p>
      <h1 className="h2">This interview was interrupted.</h1>
      <p className="lede">
        The page was left or reloaded, so the live session can't pick up where it stopped. You can get feedback on the
        answers you already gave, or start again.
      </p>
      {error && <p className="form-error" role="alert">{error} If you hadn't answered anything yet, start a new interview.</p>}
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={getFeedback} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
          Get feedback so far
        </button>
        <Link to="/practice" state={{ config: session.config }} className="btn btn-ghost">
          <RotateCcw size={18} aria-hidden="true" /> Start again
        </Link>
      </div>
    </div>
  );
}

function Interview({ session }) {
  const navigate = useNavigate();
  const { setSession, setStatus } = useSession();
  const voice = recognitionSupported || recorderSupported;

  const [current, setCurrent] = useState(session.firstTurn);
  const [turns, setTurns] = useState([
    { speaker: "interviewer", text: session.firstTurn.message, kind: "question", question: 1 },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const [warning, setWarning] = useState(null); // { n, kind: "tab" | "extension", names } shown until dismissed
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(!voice);
  const [micPaused, setMicPaused] = useState(!voice); // the candidate's privacy switch; persists across questions
  const [manual, setManual] = useState(false); // typed into this answer: no dictation, no auto-send
  const [readyFor, setReadyFor] = useState(null); // the interviewer line that has finished being delivered
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  // "browser": the browser's own speech-to-text (live words as you speak).
  // "server": record here and transcribe on the backend after each answer (works when the browser's speech service doesn't).
  const [engine, setEngine] = useState(() => (browserSpeechUsable || !recorderSupported ? "browser" : "server"));
  const [transcribing, setTranscribing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const tts = useSpeechSynthesis();
  const stt = useSpeechRecognition();
  const rec = useRecorder();
  const server = engine === "server";
  // Phrase transcriptions in flight for the current answer, applied to the draft in spoken order.
  const phrasesRef = useRef({ gen: 0, next: 0, applied: 0, results: new Map(), pending: new Set(), failed: false, lastCut: 0 });
  const dictatingRef = useRef(false); // true while the draft is being fed by the mic
  const draftRef = useRef(draft);
  const mutedRef = useRef(muted);
  const submitRef = useRef(null);
  const endRef = useRef(null);
  const warningsRef = useRef(0);
  const activeRef = useRef(true);
  const logRef = useRef(null);
  draftRef.current = draft;
  mutedRef.current = muted;

  const answers = turns.filter((t) => t.speaker === "candidate").length;
  const value = !server && stt.listening && !manual ? join(draft, stt.interim) : draft;
  const voiceAvailable = server ? rec.supported && !rec.blocked : stt.supported && !stt.blocked;
  const listeningNow = server ? rec.recording : stt.listening;
  // Tied to the message itself, so a new question is "not ready" in the very render it arrives.
  const ready = readyFor === current.message;
  const micOff = micPaused || manual;

  // Proctoring applies from the first question until the interview is complete or submitted.
  const active = !current.done && !ending;
  activeRef.current = active;

  const wantListen = voiceAvailable && ready && !tts.speaking && !micOff && !sending && !ending && !current.done;

  let phase;
  if (current.done) phase = "done";
  else if (sending || ending) phase = "sending";
  else if (!voiceAvailable) phase = "chat";
  else if (tts.speaking || !ready) phase = "speaking";
  else if (micPaused) phase = "paused";
  else if (manual) phase = "manual";
  else if (listeningNow) phase = "listening";
  else phase = "starting";

  // Each new interviewer line: speak it, then open the mic once it's finished.
  useEffect(() => {
    const message = current.message;
    setManual(false);
    if (mutedRef.current || !tts.supported) {
      setReadyFor(message);
      return;
    }
    tts.speak(message, { onEnd: () => setReadyFor(message) });
    // Some browsers never fire `end`; don't leave the candidate waiting on a silent interviewer.
    const words = message.split(/\s+/).length;
    const fallback = setTimeout(() => setReadyFor(message), words * 450 + 2500);
    return () => clearTimeout(fallback);
  }, [current.message]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the browser's speech service can't be reached, switch to recording + server transcription.
  useEffect(() => {
    if (!server && stt.blocked && SERVICE_ERRORS.has(stt.code) && recorderSupported) {
      setEngine("server");
      setNotice("Your browser's speech service isn't reachable, so Rehearse now records each answer and transcribes it when you pause.");
    }
  }, [server, stt.blocked, stt.code]);

  // Keep the mic open whenever the candidate could be answering; close it otherwise
  // (while the interviewer talks, while sending, when paused or typing, after the end).
  useEffect(() => {
    if (server) {
      if (wantListen && !rec.recording) rec.start();
      else if (!wantListen && rec.recording) rec.cancel();
      return;
    }
    if (wantListen && !stt.listening) {
      dictatingRef.current = true;
      stt.start(draftRef.current);
    } else if (!wantListen && stt.listening) {
      stt.stop();
    }
  }, [wantListen, stt.listening, rec.recording, server]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mic transcript flows into the draft.
  useEffect(() => {
    if (dictatingRef.current) setDraft(stt.text);
  }, [stt.text]);

  // Auto-send after a pause, measured from the last words recognised (or, when recording, the last voice heard).
  const heardAt = server ? rec.heardAt : stt.heardAt;
  const armed =
    phase === "listening" && !confirmEnd && !warning && heardAt > 0 && (server ? rec.hasSpeech && !rec.speaking : Boolean(value.trim()));
  useEffect(() => {
    if (!armed) return;
    const left = SILENCE_MS - (Date.now() - heardAt);
    const send = setTimeout(() => submitRef.current?.(), Math.max(0, left));
    const tick = setInterval(() => setNow(Date.now()), 200);
    setNow(Date.now());
    return () => {
      clearTimeout(send);
      clearInterval(tick);
    };
  }, [armed, heardAt]);
  const silentFor = armed ? now - heardAt : 0;
  const counting = armed && silentFor >= COUNTDOWN_AFTER_MS;
  const secondsLeft = Math.max(1, Math.ceil((SILENCE_MS - silentFor) / 1000));

  // "Sending" becomes "Thinking" if the server takes a moment.
  useEffect(() => {
    if (!sending) return setThinking(false);
    const t = setTimeout(() => setThinking(true), THINKING_AFTER_MS);
    return () => clearTimeout(t);
  }, [sending]);

  // Interview clock (stops at the end).
  useEffect(() => {
    if (current.done) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [current.done, startedAt]);

  // Keep the newest transcript entry in view (only scrolls the panel, never the page).
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const toggleMute = () => {
    if (!muted) {
      tts.cancel();
      setReadyFor(current.message);
    }
    setMuted((m) => !m);
  };

  const toggleMic = () => {
    if (micOff) {
      setMicPaused(false);
      setManual(false);
    } else {
      setMicPaused(true);
    }
  };

  const submit = async (override) => {
    const answer = (override ?? value).trim();
    if (!answer || (sending && override === undefined)) return;
    dictatingRef.current = false;
    stt.stop();
    tts.cancel();
    setSending(true);
    setError(null);
    try {
      const turn = await api.answer(session.id, answer);
      setTurns((t) => [
        ...t,
        { speaker: "candidate", text: answer, kind: "answer", question: current.question_number },
        { speaker: "interviewer", text: turn.message, kind: turn.kind, question: turn.question_number },
      ]);
      setDraft("");
      draftRef.current = "";
      resetPhrases();
      setCurrent(turn);
    } catch (err) {
      setDraft(answer);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };
  // ---- Recording fallback: phrases are transcribed while the candidate is still talking ----
  const resetPhrases = () => {
    const p = phrasesRef.current;
    phrasesRef.current = { gen: p.gen + 1, next: 0, applied: 0, results: new Map(), pending: new Set(), failed: false, lastCut: 0 };
  };

  const transcribeWithRetry = async (blob) => {
    for (let i = 0; ; i++) {
      try {
        return await api.transcribe(blob);
      } catch (err) {
        if (i >= PHRASE_RETRY_MS.length || !RETRYABLE.has(err.status)) throw err;
        await new Promise((r) => setTimeout(r, PHRASE_RETRY_MS[i]));
      }
    }
  };

  const transcribePhrase = (blob) => {
    const p = phrasesRef.current;
    const index = p.next++;
    const job = transcribeWithRetry(blob)
      .then((text) => text, (err) => {
        p.failed = true;
        setError(err.message);
        return "";
      })
      .then((text) => {
        if (phrasesRef.current !== p) return; // the answer was already sent or discarded
        p.results.set(index, text);
        // Apply finished phrases in the order they were spoken.
        let added = "";
        while (p.results.has(p.applied)) {
          added = join(added, p.results.get(p.applied));
          p.results.delete(p.applied);
          p.applied++;
        }
        if (added) {
          draftRef.current = join(draftRef.current, added);
          setDraft(draftRef.current);
        }
      });
    p.pending.add(job);
    job.finally(() => p.pending.delete(job));
  };

  // A short pause ends a phrase: send it off now instead of waiting for the whole answer.
  useEffect(() => {
    if (!(server && rec.recording && rec.hasSpeech && !rec.speaking)) return;
    const t = setTimeout(() => {
      const p = phrasesRef.current;
      // Busy or too soon: keep recording; this audio goes out with the next phrase.
      if (p.pending.size || Date.now() - p.lastCut < PHRASE_MIN_GAP_MS) return;
      const blob = rec.cut();
      if (!blob) return;
      p.lastCut = Date.now();
      transcribePhrase(blob);
    }, PHRASE_PAUSE_MS);
    return () => clearTimeout(t);
  }, [server, rec.recording, rec.hasSpeech, rec.speaking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server engine send: transcribe the last phrase, wait for any still in flight, then send the text.
  const submitRecording = async () => {
    const last = rec.stop();
    if (last) transcribePhrase(last);
    const p = phrasesRef.current;
    setNotice(null);
    setSending(true);
    setTranscribing(true);
    while (p.pending.size) await Promise.all([...p.pending]);
    setTranscribing(false);
    const answer = draftRef.current.trim();
    if (!answer) {
      setSending(false);
      if (!p.failed) setNotice("Sorry, that didn't come through clearly. Please answer again, or type it.");
      return;
    }
    await submit(answer);
  };
  submitRef.current = server ? submitRecording : () => submit();

  const finish = (endedBy) => {
    if (endedBy) setSession((s) => ({ ...s, status: "ended", endedBy }));
    else setStatus("ended");
    navigate("/report");
  };

  // End now: submit the answer in progress (typed, dictated or still being transcribed), then go to the debrief.
  // `forced`: the last warning was used up, so this happens without asking (and even with no answers yet).
  const endInterview = async ({ forced = false } = {}) => {
    setConfirmEnd(false);
    setError(null);
    setNotice(null);
    dictatingRef.current = false;
    // An answer already on its way to the server is recorded by that request, not here.
    let answer = sending ? "" : value.trim();
    setEnding(true);
    if (server && rec.recording) {
      const last = rec.stop(); // before any await, so the mic effect doesn't discard it
      if (last) transcribePhrase(last);
    }
    stt.stop();
    tts.cancel();
    const p = phrasesRef.current;
    if (p.pending.size) {
      setTranscribing(true);
      while (p.pending.size) await Promise.all([...p.pending]);
      setTranscribing(false);
      if (!sending) answer = draftRef.current.trim();
    }
    if (!answers && !answer && !forced) {
      setEnding(false);
      setError("Answer at least one question first, so there's something to give feedback on.");
      return;
    }
    try {
      await api.end(session.id, answer, forced ? "warnings" : "submitted");
      finish(forced ? { reason: "warnings", warnings: warningsRef.current, answers: answers + (answer ? 1 : 0) } : null);
    } catch (err) {
      setError(err.message);
      setEnding(false);
    }
  };
  endRef.current = endInterview;

  // ---- Proctoring: leaving the tab or window, or an extension appearing, is a warning ----
  const violation = (kind, names = []) => {
    if (!activeRef.current) return;
    const n = ++warningsRef.current;
    setWarnings(n);
    setConfirmEnd(false);
    if (n >= MAX_WARNINGS) {
      setWarning(null);
      endRef.current({ forced: true });
    } else {
      setWarning({ n, kind, names });
    }
  };
  const violationRef = useRef(violation);
  violationRef.current = violation;

  useEffect(() => {
    // Switching tabs fires both `blur` and `visibilitychange`; count them as one departure.
    let away = false;
    const leave = () => {
      if (away) return;
      away = true;
      violationRef.current("tab");
    };
    const back = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) away = false;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave() : back());
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useExtensionWatch({ enabled: active, onNew: (names) => violationRef.current("extension", names) });

  // The interview ends only when it's complete or submitted: reloading, closing the tab and the
  // back button are held off while it's running.
  useEffect(() => {
    if (!active) return;
    const onUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const guard = () => window.history.pushState({ ...window.history.state, rehearseGuard: true }, "", window.location.href);
    const onPop = () => {
      guard();
      setNotice("The interview stays open until you finish it, or press End interview to submit it.");
    };
    if (!window.history.state?.rehearseGuard) guard();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("popstate", onPop);
    };
  }, [active]);

  useEffect(() => {
    if (!warning) return;
    const onKey = (e) => e.key === "Escape" && setWarning(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [warning]);

  useEffect(() => {
    if (!confirmEnd) return;
    const onKey = (e) => e.key === "Escape" && setConfirmEnd(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEnd]);

  const hearing = phase === "listening" && (server ? rec.speaking : Boolean(stt.interim.trim()));

  // One source of truth for the state: graphic, label and sentence all come from here.
  const view = {
    done: { line: "done", tag: "Complete", text: "That's the interview." },
    sending: transcribing
      ? { line: "sending", tag: "Transcribing", text: "Turning your answer into text…" }
      : ending
      ? { line: "sending", tag: "Ending", text: "Submitting your answers and wrapping up…" }
      : thinking
      ? { line: "sending", tag: "Thinking", text: "The interviewer is considering your answer…" }
      : { line: "sending", tag: "Sending", text: "Sending your answer…" },
    chat: { line: "paused", tag: "Typing", text: "Type your answer, then send it." },
    speaking: tts.speaking
      ? { line: "speaking", tag: "Interviewer speaking", text: "Listen to the question. The mic opens when it ends." }
      : { line: "idle", tag: "Next question", text: "Next question…" },
    paused: { line: "paused", tag: "Mic paused", text: "Mic paused. Type, or resume the mic." },
    manual: { line: "paused", tag: "Typing", text: "Typing this answer. Send it when you're ready." },
    starting: { line: "idle", tag: "Opening mic", text: "Opening the mic…" },
    listening: counting
      ? { line: "counting", tag: `Sending in ${secondsLeft}`, text: "Keep talking to add more." }
      : hearing
        ? { line: "hearing", tag: "Hearing you", text: server ? "Your words appear below after each short pause." : "Your words appear below as you speak." }
        : server
          ? { line: "listening", tag: "Listening", text: rec.hasSpeech ? "Still listening…" : "Just start talking." }
          : value.trim()
          ? { line: "listening", tag: "Listening", text: "Still listening…" }
          : { line: "listening", tag: "Listening", text: "Just start talking." },
  }[phase];

  const total = current.total_questions;
  const live = phase === "listening";

  return (
    <div className="interview">
      <div className="container iv-bar">
        <div className="iv-progress">
          <p className="mono-label" id="question-heading"><span className="noon-mark" aria-hidden="true" />{metaLabel(current)}</p>
          <ol className="ticks" aria-label={`Progress: question ${current.question_number} of ${total}`}>
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              const state = current.done || n < current.question_number ? "done" : n === current.question_number ? "now" : "";
              return <li key={n} className={`tick ${state}`} />;
            })}
          </ol>
        </div>
        <div className="iv-tools">
          {warnings > 0 && !current.done && (
            <span className="warn-count" aria-label={`Warnings: ${warnings} of ${MAX_WARNINGS}`}>
              <ShieldAlert size={14} aria-hidden="true" /> {warnings}/{MAX_WARNINGS}
            </span>
          )}
          <span className="timecode" aria-label={`Elapsed ${clock(elapsed)}`}>{clock(elapsed)}</span>
          {tts.supported && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => tts.speak(current.message)} disabled={muted || sending} aria-label="Replay question">
                <Repeat size={16} aria-hidden="true" /> <span className="hide-xs">Replay</span>
              </button>
              <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? "Unmute interviewer" : "Mute interviewer"} aria-pressed={muted}>
                {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
              </button>
            </>
          )}
          {!current.done && (
            <button
              type="button"
              className="btn btn-end btn-sm"
              onClick={() => setConfirmEnd((c) => !c)}
              disabled={ending || sending}
              aria-expanded={confirmEnd}
              aria-controls="end-confirm"
            >
              {ending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Flag size={16} aria-hidden="true" />}
              <span>{ending ? "Ending…" : <>End<span className="hide-xs"> interview</span></>}</span>
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {confirmEnd && (
          <motion.div
            className="container"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: ease.out } }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
          >
            <div className="end-confirm" id="end-confirm" role="region" aria-labelledby="end-confirm-title">
              <div>
                <p className="end-confirm-title" id="end-confirm-title">End the interview now?</p>
                <p className="end-confirm-text">
                  {answers || value.trim() || (server && rec.hasSpeech)
                    ? "The answer you're giving now is submitted too, and you'll get feedback on everything so far."
                    : "You haven't answered yet. Answer at least one question to get feedback."}
                </p>
              </div>
              <div className="end-confirm-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(false)}>
                  Keep going
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => endInterview()}
                  disabled={!answers && !value.trim() && !(server && rec.hasSpeech)}
                  autoFocus
                >
                  Submit and end <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {warning && (
          <motion.div
            className="warn-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <motion.div
              className="warn-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="warn-title"
              aria-describedby="warn-text"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: ease.out } }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            >
              <p className="warn-kicker"><ShieldAlert size={16} aria-hidden="true" /> Warning {warning.n} of {MAX_WARNINGS}</p>
              <h2 className="warn-title" id="warn-title">
                {warning.kind === "tab" ? "You left the interview." : "A browser extension was detected."}
              </h2>
              <p className="warn-text" id="warn-text">
                {warning.kind === "tab"
                  ? "Switching tabs or windows isn't allowed while the interview is running."
                  : `Extensions aren't allowed during the interview. Turn off ${warning.names.join(", ")}.`}{" "}
                {MAX_WARNINGS - warning.n === 1
                  ? "One more warning and your interview is submitted and ended automatically."
                  : `${MAX_WARNINGS - warning.n} more warnings and your interview is submitted and ended automatically.`}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setWarning(null)} autoFocus>
                Back to the interview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="container iv-grid">
        <section className="iv-stage" aria-labelledby="question-heading">
          <p className="speaker-tag">
            <span className="speaker-dot" aria-hidden="true" /> Interviewer
          </p>
          <div className="question-wrap">
            <AnimatePresence mode="wait">
              <motion.div key={current.message} exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}>
                <RevealText text={current.message} className="question" />
              </motion.div>
            </AnimatePresence>
            <p className="sr-only" aria-live="polite">{sending ? "" : current.message}</p>
          </div>

          <div className={`iv-signal is-${view.line}`}>
            <VoiceLine
              mode={view.line}
              countdown={(SILENCE_MS - COUNTDOWN_AFTER_MS) / 1000}
              countKey={stt.heardAt}
            />
            <div className="iv-state">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={view.tag} className={`state-tag ${live ? "is-live" : ""}`} {...swap}>
                  {live && <span className="rec" aria-hidden="true" />}
                  {view.tag}
                </motion.span>
              </AnimatePresence>
              <span className="state-text" role="status">{view.text}</span>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {current.done ? (
              <motion.div
                key="done"
                className="iv-answer done-panel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.out } }}
              >
                <p className="done-text">Your debrief is ready to be written.</p>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => finish()}>
                  See your debrief <ArrowRight size={18} aria-hidden="true" />
                </button>
              </motion.div>
            ) : (
              <motion.div key="answer" className="iv-answer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <label className="speaker-tag you" htmlFor="answer">You</label>
                <textarea
                  id="answer"
                  className={`answer-box ${live ? "is-live" : ""}`}
                  rows={4}
                  value={value}
                  disabled={sending || ending}
                  onChange={(e) => {
                    // Typing takes over this answer: stop dictation so nothing is sent mid-sentence.
                    dictatingRef.current = false;
                    setManual(true);
                    setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={
                    !voiceAvailable
                      ? "Type your answer."
                      : server
                        ? "Just start talking. Your words appear here as you go, or type instead."
                        : "Just start talking. Your words appear here, or type instead."
                  }
                  maxLength={6000}
                />

                <div className="answer-bar">
                  <span className="kbd-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send</span>
                  <span className="spacer" />
                  {voiceAvailable && (
                    <button type="button" className="btn btn-ghost" onClick={toggleMic} aria-pressed={micOff} disabled={sending}>
                      {micOff ? <Mic size={16} aria-hidden="true" /> : <MicOff size={16} aria-hidden="true" />}
                      {micOff ? "Resume mic" : "Pause mic"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => (server && rec.recording ? submitRecording() : submit())}
                    disabled={(!value.trim() && !(server && rec.hasSpeech)) || sending}
                  >
                    {sending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <CornerDownLeft size={18} aria-hidden="true" />}
                    {live ? "Send now" : "Send answer"}
                  </button>
                </div>

                {notice && <p className="voice-note info">{notice}</p>}
                {!voiceAvailable && !stt.blocked && !rec.blocked && (
                  <p className="voice-note">{envProblem || "Voice answers aren't available in this browser. You can type every answer here instead."}</p>
                )}
                {!server && stt.blocked && (
                  <p className="voice-note">
                    {stt.error}{" "}
                    <button type="button" className="link-btn" onClick={stt.retry}>Try the mic again</button>
                  </p>
                )}
                {server && rec.blocked && (
                  <p className="voice-note">
                    {rec.error}{" "}
                    <button type="button" className="link-btn" onClick={rec.retry}>Try the mic again</button>
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className="form-error" role="alert">{error}</p>}

        </section>

        <aside className="log panel" aria-label="Transcript">
          <p className="mono-label">The script</p>
          <ol className="log-list" ref={logRef}>
            <AnimatePresence initial={false}>
              {turns.map((t, i) => (
                <motion.li
                  key={i}
                  className={`log-item ${t.speaker}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: ease.out } }}
                >
                  <span className="log-who">
                    {t.speaker === "interviewer" ? (t.kind === "follow_up" ? `Follow-up · Q${t.question}` : t.kind === "closing" ? "Closing" : `Interviewer · Q${t.question}`) : "You"}
                  </span>
                  <p className="log-text">{t.text}</p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </aside>
      </div>
    </div>
  );
}
