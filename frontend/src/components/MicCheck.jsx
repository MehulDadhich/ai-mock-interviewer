import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Recognition, RECOGNITION_ERRORS, micErrorMessage, recognitionLang, voiceEnvironmentProblem } from "../hooks/speech";
import { useRecorder } from "../hooks/useRecorder";
import { swap } from "../motion";

const TEST_MS = 15000;
const SOUND_THRESHOLD = 0.04; // RMS level that counts as "we can hear something"
const SERVICE_ERRORS = new Set(["network", "service-not-allowed", "language-not-supported"]);
const browserSpeechUsable = Boolean(Recognition) && !(typeof navigator !== "undefined" && navigator.brave);

/**
 * A 15-second microphone test: permission, a live input level (real audio, via Web Audio),
 * and a speech-to-text check with the same settings the interview uses.
 * Every failure is reported in plain words, so the user knows exactly what to fix.
 */
export default function MicCheck() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { allowed, sound, heard, problem }
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [via, setVia] = useState("browser"); // which speech-to-text path is being tested
  const [note, setNote] = useState(null);
  const cleanupRef = useRef(null);
  const recorder = useRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    recorderRef.current.cancel();
    setRunning(false);
  }, []);

  // Fallback path: record, then let the server transcribe once the speaker pauses.
  const switchToServer = useCallback(() => {
    setVia("server");
    setNote("Your browser's speech service isn't reachable, so Rehearse will record your answers and transcribe them on its server. Testing that now: say the sentence.");
    setResult((r) => ({ ...r, problem: null }));
    recorderRef.current.start();
  }, []);

  useEffect(() => {
    if (!(running && via === "server" && recorder.hasSpeech && !recorder.speaking)) return;
    const t = setTimeout(async () => {
      const blob = recorderRef.current.stop();
      if (!blob) return;
      setNote("Transcribing on the server…");
      try {
        const text = await api.transcribe(blob);
        if (text.trim()) {
          setHeard(text.trim());
          setResult((r) => ({ ...r, heard: true, problem: null }));
          setNote("Server transcription works. Your answers will be transcribed each time you pause.");
        } else {
          setNote(null);
          setResult((r) => ({ ...r, problem: "The server couldn't make out any words. Speak a full sentence close to the mic." }));
        }
      } catch (err) {
        setNote(null);
        setResult((r) => ({ ...r, problem: err.message }));
      }
      cleanupRef.current?.();
      cleanupRef.current = null;
      setRunning(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [running, via, recorder.hasSpeech, recorder.speaking]);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setHeard("");
    setLevel(0);
    setNote(null);
    setVia("browser");
    const envProblem = voiceEnvironmentProblem();
    if (envProblem && (!window.isSecureContext || !Recognition)) {
      setResult({ allowed: false, sound: false, heard: false, problem: envProblem });
      return;
    }
    setResult({ allowed: false, sound: false, heard: false, problem: envProblem });
    setRunning(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setResult({ allowed: false, sound: false, heard: false, problem: micErrorMessage(err) });
      setRunning(false);
      return;
    }
    setResult((r) => ({ ...r, allowed: true }));

    // Live input level from the actual microphone.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let last = 0;
    const tick = (now) => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (rms > SOUND_THRESHOLD) setResult((r) => (r.sound ? r : { ...r, sound: true }));
      if (now - last > 60) {
        last = now;
        setLevel(Math.min(1, rms * 6));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Speech-to-text with the interview's settings.
    let rec = null;
    if (!browserSpeechUsable) {
      switchToServer();
    } else {
      rec = new Recognition();
      rec.lang = recognitionLang();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        if (text.trim()) {
          setHeard(text.trim());
          setResult((r) => ({ ...r, heard: true }));
        }
      };
      rec.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        console.warn("Mic test: speech recognition error:", e.error);
        if (SERVICE_ERRORS.has(e.error)) {
          switchToServer();
          return;
        }
        setResult((r) => ({ ...r, problem: RECOGNITION_ERRORS[e.error] || `Speech recognition failed (${e.error}).` }));
      };
      try {
        rec.start();
      } catch (err) {
        setResult((r) => ({ ...r, problem: `Speech recognition couldn't start (${err.message}).` }));
      }
    }

    const timer = setTimeout(() => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      recorderRef.current.cancel();
      setRunning(false);
    }, TEST_MS);

    cleanupRef.current = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      try {
        rec?.abort();
      } catch {
        /* already stopped */
      }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      setLevel(0);
    };
  };

  const done = result && !running;
  const verdict = !result
    ? null
    : result.heard
      ? "Your mic works and speech is being transcribed. You're ready."
      : done && result.allowed && !result.sound
        ? "The browser can use your mic, but no sound came through. Check the input device and volume in your system sound settings."
        : done && result.sound && !result.problem
          ? "Sound came through but no words were recognised. Speak a full sentence close to the mic, or check your internet connection."
          : null;

  return (
    <div className="miccheck">
      <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={running ? stop : start}>
        <Mic size={16} aria-hidden="true" /> {running ? "Stop test" : result ? "Test again" : "Test your microphone"}
      </button>

      <AnimatePresence initial={false}>
        {result && (
          <motion.div {...swap} className="miccheck-body">
            {running && (
              <>
                <p className="miccheck-say">Say: “I’m testing my microphone for Rehearse.”</p>
                <div className="meter" aria-hidden="true">
                  <span style={{ transform: `scaleX(${level})` }} />
                </div>
              </>
            )}
            <ul className="miccheck-steps">
              <Step ok={result.allowed} pending={running && !result.allowed}>Microphone allowed</Step>
              <Step ok={result.sound} pending={running && !result.sound}>Sound coming in</Step>
              <Step ok={result.heard} pending={running && !result.heard}>
                Words recognised{via === "server" ? " (by the server)" : ""}
              </Step>
            </ul>
            {note && <p className="miccheck-note" role="status">{note}</p>}
            {heard && <p className="miccheck-heard">“{heard}”</p>}
            {result.problem && <p className="miccheck-problem" role="alert">{result.problem}</p>}
            {verdict && <p className="miccheck-verdict" role="status">{verdict}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Step({ ok, pending, children }) {
  return (
    <li className={ok ? "is-ok" : pending ? "is-pending" : "is-no"}>
      {ok ? <Check size={14} aria-hidden="true" /> : pending ? <span className="dotpulse" aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      <span>{children}</span>
      <span className="sr-only">{ok ? ": yes" : pending ? ": checking" : ": no"}</span>
    </li>
  );
}
