import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { spring, swap } from "../motion";
import { MockInterview, SampleBadge } from "./Mocks";
import { SAMPLE_EXCHANGES, STATES } from "./samples";

const ANSWER = SAMPLE_EXCHANGES[0].answer;
const ANSWERS = {
  speaking: "",
  listening: "",
  hearing: ANSWER.split(" ").slice(0, 11).join(" "),
  counting: ANSWER,
  sending: ANSWER,
  typing: "I cut the export feature because",
};

/** Interactive tour of the real interview states, with sample content. */
export default function StateExplorer() {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [touched, setTouched] = useState(false);

  // Walk through the states on its own until the visitor picks one.
  useEffect(() => {
    if (!inView || touched || reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % STATES.length), 3200);
    return () => clearInterval(t);
  }, [inView, touched, reduce]);

  const state = STATES[i];
  return (
    <div ref={ref} className="explorer">
      <ol className="state-list" aria-label="Interview states">
        {STATES.map((s, n) => (
          <li key={s.id}>
            <button
              type="button"
              className={`state-item ${n === i ? "is-on" : ""}`}
              aria-pressed={n === i}
              onClick={() => {
                setTouched(true);
                setI(n);
              }}
            >
              <span className="state-n">{String(n + 1).padStart(2, "0")}</span>
              <span className="state-name">{s.name}</span>
              {n === i && <motion.span layoutId="state-mark" className="state-mark" transition={spring} />}
            </button>
          </li>
        ))}
      </ol>
      <div className="explorer-view">
        <SampleBadge />
        <MockInterview state={state} answer={ANSWERS[state.id]} active={inView} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={state.id} className="explorer-about" {...swap}>{state.about}</motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
