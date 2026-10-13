import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Printer, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import CountUp from "../components/CountUp";
import { Dimensions, ScoreRule } from "../components/ScoreParts";
import { ease, reveal, rise, stagger } from "../motion";
import { useSession } from "../session";

const READINESS_TONE = {
  Ready: "good",
  "Almost there": "cue",
  "Needs practice": "warn",
  "Not yet": "live",
};

const STAGES = ["Re-reading your answers", "Scoring five dimensions", "Writing notes per question", "Drafting stronger answers"];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STAGES.length - 1)), 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="container narrow state-page" role="status">
      <p className="kicker">Debrief</p>
      <h1 className="h2">Writing your debrief</h1>
      <div className="progress-line" aria-hidden="true"><span /></div>
      <AnimatePresence mode="wait">
        <motion.p
          key={i}
          className="mono-label"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
        >
          {STAGES[i]}…
        </motion.p>
      </AnimatePresence>
      <p className="muted">This usually takes 20 to 60 seconds.</p>
    </div>
  );
}

function QuestionItem({ q, index, open, onToggle }) {
  const id = `q-${index}`;
  return (
    <li className={`qa ${open ? "is-open" : ""}`}>
      <h3 className="qa-h">
        <button type="button" className="qa-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="qa-num">{String(index + 1).padStart(2, "0")}</span>
          <span className="qa-q">{q.question}</span>
          <span className="qa-score">{q.score}<span className="muted">/10</span></span>
          <motion.span className="qa-chev" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronDown size={18} aria-hidden="true" />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            className="qa-body"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <div className="qa-cols">
              <div>
                <p className="mini-label good">What worked</p>
                <ul className="bullets">{q.what_worked.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="mini-label warn">To improve</p>
                <ul className="bullets">{q.to_improve.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
            <figure className="stronger">
              <figcaption className="mini-label">A stronger answer</figcaption>
              <blockquote>{q.stronger_answer}</blockquote>
            </figure>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function Report() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(0);
  const [printing, setPrinting] = useState(false);
  const requested = useRef(null);

  // Ended by the third warning before any answer: there's nothing to write a debrief about.
  const nothingToReview = session?.endedBy?.reason === "warnings" && session.endedBy.answers === 0;

  const load = useCallback(async () => {
    if (!session || nothingToReview) return;
    setError(null);
    try {
      setReport(await api.report(session.id));
    } catch (err) {
      setError(err.message);
    }
  }, [session, nothingToReview]);

  useEffect(() => {
    if (!session || requested.current === session.id) return; // StrictMode runs effects twice in dev
    requested.current = session.id;
    load();
  }, [session, load]);

  if (!session) {
    return (
      <div className="container narrow state-page">
        <p className="kicker">Debrief</p>
        <h1 className="h2">No debrief yet.</h1>
        <p className="lede">Your debrief appears here once you finish an interview.</p>
        <div className="actions">
          <Link to="/practice" className="btn btn-primary">Start practising <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </div>
    );
  }

  if (nothingToReview) {
    return (
      <div className="container narrow state-page">
        <p className="kicker">Interview ended</p>
        <h1 className="h2">The interview was ended after 3 warnings.</h1>
        <p className="lede">
          It was submitted automatically before you answered any question, so there's nothing to give feedback on.
          Stay on the interview tab, with extensions off, and try again.
        </p>
        <div className="actions">
          <Link to="/practice" state={{ config: session.config }} className="btn btn-primary">
            Start again <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container narrow state-page">
        <p className="kicker">Debrief</p>
        <h1 className="h2">The debrief didn't come through.</h1>
        <p className="form-error" role="alert">{error}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={load}>Try again</button>
          <Link to="/practice" state={{ config: session.config }} className="btn btn-ghost">Start over</Link>
        </div>
      </div>
    );
  }
  if (!report) return <Loading />;

  const { config } = session;
  const tone = READINESS_TONE[report.readiness] || "cue";

  const printAll = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 450);
  };

  return (
    <motion.div className="container report" variants={stagger(0.08)} initial="initial" animate="animate">
      <section className="report-head">
        <motion.p variants={rise} className="report-kicker">
          <span className="daychip"><i /> Night · The debrief</span>
          <span className="mono-label">{config.seniority} {config.role} · {config.interview_type}</span>
        </motion.p>
        <motion.div variants={rise} className="report-score">
          <div className="score" aria-label={`Overall score ${report.overall_score} out of 100`}>
            <span className="score-num"><CountUp value={report.overall_score} /></span>
            <span className="score-of">/100</span>
          </div>
          <span className={`tag tag-${tone}`}>{report.readiness}</span>
        </motion.div>
        <motion.div variants={rise}><ScoreRule value={report.overall_score} /></motion.div>
        <motion.p variants={rise} className="summary">{report.summary}</motion.p>
      </section>

      <motion.section {...reveal} className="report-section" aria-labelledby="dims">
        <h2 className="section-title" id="dims">Five dimensions</h2>
        <Dimensions items={report.dimensions} />
      </motion.section>

      <motion.section {...reveal} className="report-section" aria-labelledby="per-q">
        <h2 className="section-title" id="per-q">Question by question</h2>
        <ol className="qa-list">
          {report.questions.map((q, i) => (
            <QuestionItem key={i} q={q} index={i} open={printing || open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </ol>
      </motion.section>

      {report.next_steps.length > 0 && (
        <motion.section {...reveal} className="report-section" aria-labelledby="next">
          <h2 className="section-title" id="next">Practise next</h2>
          <ol className="next">
            {report.next_steps.map((s, i) => (
              <li key={i}><span className="next-num">{String(i + 1).padStart(2, "0")}</span><span>{s}</span></li>
            ))}
          </ol>
        </motion.section>
      )}

      <div className="actions no-print">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate("/practice", { state: { config } })}>
          <RotateCcw size={18} aria-hidden="true" /> Practise again
        </button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={printAll}>
          <Printer size={18} aria-hidden="true" /> Save as PDF
        </button>
      </div>
    </motion.div>
  );
}
