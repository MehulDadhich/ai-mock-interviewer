import { AnimatePresence, motion, useInView } from "framer-motion";
import { Captions, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reveal } from "../motion";
import { MockCallSheet, MockInterview, MockReport, SampleBadge } from "./Mocks";
import { SAMPLE_CONFIG, SAMPLE_EXCHANGES, STATES } from "./samples";
import { segmentAt, useTimeline, wordsUpTo } from "./useTimeline";

/**
 * "The film": a 24-second, captioned walkthrough rendered from the real screen designs with sample data.
 * It is not a screen recording; it's labelled as an illustrative sample.
 */

const DURATION = 24000;
// Each chapter happens at its own time of day, like the rest of the product.
const CHAPTERS = [
  { at: 0, title: "Set up", sky: "dawn" },
  { at: 6000, title: "Answer", sky: "noon" },
  { at: 13000, title: "Follow-up", sky: "gold" },
  { at: 18000, title: "Debrief", sky: "night" },
];
const CAPTIONS = [
  { at: 0, text: "Choose a role and level. Paste the job description if you have one." },
  { at: 6000, text: "The interviewer asks out loud." },
  { at: 8500, text: "The mic is already on. You just answer." },
  { at: 13000, text: "Pause for about three seconds and your answer is sent." },
  { at: 15500, text: "Vague answers get a follow-up." },
  { at: 18000, text: "Then a written debrief: five dimensions and notes on every answer." },
];
const S = Object.fromEntries(STATES.map((s) => [s.id, s]));
const clock = (ms) => `00:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;

function Scene({ t, active }) {
  const { index } = segmentAt(CHAPTERS, t);
  const [q1, q2] = SAMPLE_EXCHANGES;
  let body;
  if (index === 0) {
    const typed = SAMPLE_CONFIG.role.slice(0, Math.floor(Math.min(1, t / 2200) * SAMPLE_CONFIG.role.length));
    body = <MockCallSheet typed={typed} />;
  } else if (index === 1) {
    const state = t < 8500 ? S.speaking : S.hearing;
    const answer = t < 8500 ? "" : wordsUpTo(q1.answer, (t - 8500) / 4000);
    body = <MockInterview state={state} answer={answer} active={active} />;
  } else if (index === 2) {
    body =
      t < 15500 ? (
        <MockInterview state={t < 14600 ? S.counting : S.sending} answer={q1.answer} active={active} />
      ) : (
        <MockInterview state={S.speaking} question={q2.question} kind={q2.kind} answer="" active={active} />
      );
  } else {
    body = <MockReport compact />;
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={index}
        className="film-scene"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.45 } }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      >
        <FitToFrame>{body}</FitToFrame>
      </motion.div>
    </AnimatePresence>
  );
}

/** Scales a scene down (never up) so it always fits inside the film frame. */
function FitToFrame({ children }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    const frame = el?.closest(".film-frame");
    if (!el || !frame) return;
    const fit = () => {
      // Keep clear of the sample badge (top) and the caption bar (bottom).
      const room = frame.clientHeight - 48 - 64;
      setScale(Math.min(1, room / el.offsetHeight));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="film-fit" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      {children}
    </div>
  );
}

export default function Film() {
  const frameRef = useRef(null);
  const inView = useInView(frameRef, { amount: 0.3 });
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cc, setCc] = useState(true);
  const { t, ended, seek } = useTimeline({ duration: DURATION, playing: playing && inView, loop: false });

  useEffect(() => {
    if (ended) setPlaying(false);
  }, [ended]);

  const play = () => {
    if (ended) seek(0);
    setStarted(true);
    setPlaying(true);
  };
  const toggle = () => (playing ? setPlaying(false) : play());
  const caption = segmentAt(CAPTIONS, t).item.text;
  const chapter = segmentAt(CHAPTERS, t).index;

  return (
    <section id="film" className="film" aria-labelledby="film-title">
      <div>
        <motion.div className="section-head" {...reveal}>
          <span className="daychip"><i /> The film · 24 seconds</span>
          <h2 id="film-title" className="h2">One interview, <em>dawn to dusk.</em></h2>
        </motion.div>

        <motion.div {...reveal} className="film-shell">
          <div ref={frameRef} className="film-frame" data-sky={started ? CHAPTERS[chapter].sky : "dawn"}>
            {CHAPTERS.map((c, i) => (
              <motion.span
                key={c.sky}
                className={`film-sky film-sky-${c.sky}`}
                aria-hidden="true"
                initial={false}
                animate={{ opacity: (started ? chapter : 0) >= i ? 1 : 0 }}
                transition={{ duration: 0.9 }}
              />
            ))}
            <SampleBadge>Sample session · illustrative</SampleBadge>
            {started ? (
              <Scene t={t} active={playing} />
            ) : (
              <div className="film-poster">
                <p className="mono-label">How Rehearse works</p>
                <p className="film-poster-title">Pick a role at dawn. <em>Read the verdict by night.</em></p>
                <button type="button" className="film-big-play" onClick={play} aria-label="Play the film">
                  <Play size={28} aria-hidden="true" />
                </button>
              </div>
            )}
            {started && cc && (
              <p className="film-caption" aria-live="off">
                <span>{caption}</span>
              </p>
            )}
          </div>

          <div className="film-controls">
            <button type="button" className="icon-btn icon-btn-solid" onClick={toggle} aria-label={playing ? "Pause film" : ended ? "Replay film" : "Play film"}>
              {playing ? <Pause size={18} aria-hidden="true" /> : ended ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            </button>
            <span className="timecode">{clock(t)} / {clock(DURATION)}</span>
            <input
              type="range"
              className="scrubber"
              min={0}
              max={DURATION}
              step={100}
              value={Math.round(t)}
              onChange={(e) => {
                setStarted(true);
                seek(Number(e.target.value));
              }}
              aria-label="Seek"
              aria-valuetext={`${clock(t)} of ${clock(DURATION)}, ${CHAPTERS[chapter].title}`}
              style={{ "--p": `${(t / DURATION) * 100}%` }}
            />
            <button type="button" className={`icon-btn ${cc ? "is-on" : ""}`} onClick={() => setCc((c) => !c)} aria-pressed={cc} aria-label="Captions">
              <Captions size={18} aria-hidden="true" />
            </button>
          </div>

          <ol className="chapters" aria-label="Chapters">
            {CHAPTERS.map((c, i) => (
              <li key={c.title}>
                <button
                  type="button"
                  className={`chapter ${i === chapter && started ? "is-on" : ""}`}
                  onClick={() => {
                    seek(c.at);
                    setStarted(true);
                    setPlaying(true);
                  }}
                >
                  <span className="timecode">{clock(c.at)}</span> {c.title}
                </button>
              </li>
            ))}
          </ol>
          <p className="sr-only">
            Transcript of the film: {CAPTIONS.map((c) => c.text).join(" ")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
