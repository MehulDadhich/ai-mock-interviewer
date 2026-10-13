import { AnimatePresence, motion } from "framer-motion";
import { Check, FileText, Mic } from "lucide-react";
import CountUp from "../components/CountUp";
import VoiceLine from "../components/VoiceLine";
import { Dimensions, ScoreRule } from "../components/ScoreParts";
import { swap } from "../motion";
import { SAMPLE_CONFIG, SAMPLE_EXCHANGES, SAMPLE_REPORT } from "./samples";

/** Faithful, static-data representations of the real screens, for the landing page. */

export function SampleBadge({ children = "Sample" }) {
  return <span className="sample-badge">{children}</span>;
}

export function MockCallSheet({ typed }) {
  const role = typed ?? SAMPLE_CONFIG.role;
  return (
    <div className="mock panel mock-sheet">
      <p className="mono-label">Your interview</p>
      <p className="mock-role">{role}<span className="caret" aria-hidden="true" /></p>
      <dl className="sheet">
        <div><dt>Level</dt><dd>{SAMPLE_CONFIG.level}</dd></div>
        <div><dt>Style</dt><dd>{SAMPLE_CONFIG.style}</dd></div>
        <div><dt>Questions</dt><dd>{SAMPLE_CONFIG.questions} + follow-ups</dd></div>
        <div><dt>Job description</dt><dd><FileText size={14} aria-hidden="true" /> Attached</dd></div>
        <div><dt>Answers</dt><dd><Mic size={14} aria-hidden="true" /> Voice, typing anytime</dd></div>
      </dl>
      <span className="btn btn-primary btn-block mock-btn" aria-hidden="true">Begin interview</span>
    </div>
  );
}

export function MockInterview({ state, answer, question = SAMPLE_EXCHANGES[0].question, kind = SAMPLE_EXCHANGES[0].kind, active = true }) {
  const live = state.line === "listening" || state.line === "hearing" || state.line === "counting";
  return (
    <div className="mock panel mock-interview">
      <p className="mono-label">{kind}</p>
      <p className="speaker-tag"><span className="speaker-dot" aria-hidden="true" /> Interviewer</p>
      <p className="mock-question">{question}</p>
      <div className={`iv-signal is-${state.line}`}>
        <VoiceLine mode={state.line} countdown={2.1} countKey={state.id} active={active} />
        <div className="iv-state">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={state.tag} className={`state-tag ${live ? "is-live" : ""}`} {...swap}>
              {live && <span className="rec" aria-hidden="true" />}
              {state.tag}
            </motion.span>
          </AnimatePresence>
          <span className="state-text">{state.text}</span>
        </div>
      </div>
      <p className="speaker-tag you">You</p>
      <p className={`mock-answer ${answer ? "" : "is-empty"}`}>{answer || "Just start talking. Your words appear here, or type instead."}</p>
    </div>
  );
}

export function MockReport({ compact = false }) {
  const r = SAMPLE_REPORT;
  return (
    <div className={`mock panel mock-report ${compact ? "is-compact" : ""}`}>
      <p className="mono-label">Debrief · Mid Frontend Engineer</p>
      <div className="report-score">
        <div className="score score-sm">
          <span className="score-num"><CountUp value={r.overall} /></span>
          <span className="score-of">/100</span>
        </div>
        <span className="tag tag-cue">{r.readiness}</span>
      </div>
      <ScoreRule value={r.overall} />
      {!compact && <p className="mock-summary">{r.summary}</p>}
      <Dimensions items={compact ? r.dimensions.map(({ name, score }) => ({ name, score })) : r.dimensions} />
      {!compact && (
        <div className="mock-qa">
          <p className="qa-q">{r.question.question} <span className="qa-score">{r.question.score}<span className="muted">/10</span></span></p>
          <div className="qa-cols">
            <div>
              <p className="mini-label good">What worked</p>
              <ul className="bullets">{r.question.worked.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <p className="mini-label warn">To improve</p>
              <ul className="bullets">{r.question.improve.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </div>
        </div>
      )}
      {!compact && (
        <p className="mock-foot"><Check size={14} aria-hidden="true" /> Every answer also gets a stronger version to compare with.</p>
      )}
    </div>
  );
}
