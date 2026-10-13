import { useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import VoiceLine from "../components/VoiceLine";
import { SampleBadge } from "./Mocks";
import { SAMPLE_EXCHANGES } from "./samples";
import { segmentAt, useTimeline, wordsUpTo } from "./useTimeline";

// One exchange of the sample script, in ms.
const BEATS = [
  { at: 0, line: "speaking", tag: "Interviewer speaking" },
  { at: 3000, line: "listening", tag: "Listening" },
  { at: 3900, line: "hearing", tag: "Hearing you" },
  { at: 8100, line: "counting", tag: "Sending in 2" },
  { at: 10200, line: "sending", tag: "Thinking" },
];
const EXCHANGE = 11400;

export default function ScriptPanel() {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const { t } = useTimeline({ duration: EXCHANGE * SAMPLE_EXCHANGES.length, playing: inView && !reduce });

  // Reduced motion: one complete, still frame.
  const ex = reduce ? 0 : Math.floor(t / EXCHANGE);
  const local = reduce ? 9000 : t % EXCHANGE;
  const { item: beat } = segmentAt(BEATS, local);
  const cur = SAMPLE_EXCHANGES[ex];

  const qFrac = Math.min(1, local / 1800);
  const aFrac = local < 3900 ? 0 : Math.min(1, (local - 3900) / 4000);
  const said = wordsUpTo(cur.answer, aFrac);
  const words = said.split(" ");
  // The last couple of words are still "interim" (grey) while speech is coming in.
  const interimCount = beat.line === "hearing" && aFrac < 1 ? 2 : 0;
  const settled = words.slice(0, Math.max(0, words.length - interimCount)).join(" ");
  const interim = words.slice(Math.max(0, words.length - interimCount)).join(" ");
  const live = ["listening", "hearing", "counting"].includes(beat.line);

  return (
    <figure ref={ref} className="script panel" aria-labelledby="script-cap">
      <figcaption id="script-cap" className="script-cap">
        <SampleBadge>Sample exchange</SampleBadge>
        <span className="sr-only">An interviewer asks a question, the candidate answers out loud, and the interviewer follows up.</span>
      </figcaption>
      <div aria-hidden="true">
        {ex > 0 && (
          <div className="script-row is-past">
            <span className="script-time">00:41</span>
            <span className="script-who">You</span>
            <p className="script-text">{SAMPLE_EXCHANGES[ex - 1].answer}</p>
          </div>
        )}
        <div className="script-row">
          <span className="script-time">{ex ? "01:02" : "00:31"}</span>
          <span className="script-who">Interviewer</span>
          <p className="script-text script-q">
            <span className="mono-label script-kind">{cur.kind}</span>
            {wordsUpTo(cur.question, qFrac)}
          </p>
        </div>
        <div className="script-row">
          <span className="script-time">{ex ? "01:09" : "00:36"}</span>
          <span className="script-who is-you">You</span>
          <p className="script-text script-a">
            {settled} {interim && <span className="interim">{interim}</span>}
            {beat.line === "hearing" && <span className="caret" />}
            {!said && <span className="placeholder">Just start talking…</span>}
          </p>
        </div>
        <div className={`script-signal iv-signal is-${beat.line}`}>
          <VoiceLine mode={beat.line} countdown={2.1} countKey={`${ex}-${beat.at}`} active={inView} />
          <span className={`state-tag ${live ? "is-live" : ""}`}>
            {live && <span className="rec" />}
            {beat.tag}
          </span>
        </div>
      </div>
    </figure>
  );
}
