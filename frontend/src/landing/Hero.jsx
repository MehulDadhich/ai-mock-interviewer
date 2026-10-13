import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Fragment, useRef } from "react";
import { Link } from "react-router-dom";
import { ease } from "../motion";

const HEADLINE = ["Rehearse", "before", "the", "day", "begins."];
const ROLES = ["Product Manager", "Frontend Engineer", "Data Scientist", "UX Designer", "Backend Engineer"];

/** Dawn: the day starts by picking a role. */
export default function Hero({ horizonRef }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Hills drift at different speeds as dawn scrolls away.
  const far = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const mid = useTransform(scrollYProgress, [0, 1], [0, 45]);

  return (
    <section ref={ref} className="band band-dawn hero" data-sky="dawn" aria-labelledby="hero-title">
      <div className="container hero-inner">
        <motion.span
          className="daychip"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: ease.out }}
        >
          <i /> Dawn · 01 · Pick a role
        </motion.span>
        <h1 id="hero-title" className="display hero-title" aria-label="Rehearse before the day begins.">
          {HEADLINE.map((w, i) => (
            <Fragment key={w}>
              <motion.span
                aria-hidden="true"
                className={i >= 3 ? "word em" : "word"}
                initial={{ opacity: 0, y: "0.35em" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.15 + i * 0.12, ease: ease.out }}
              >
                {w}
              </motion.span>{" "}
            </Fragment>
          ))}
        </h1>
        <motion.p
          className="lede hero-lede"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.75, ease: ease.out }}
        >
          A mock interview you answer out loud. It listens, follows up when you’re vague, and writes you a debrief
          you can act on.
        </motion.p>
        <motion.div
          className="actions hero-actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.9, ease: ease.out }}
        >
          <Link to="/practice" className="btn btn-primary btn-lg">
            Start practising <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a href="#film" className="btn btn-ghost btn-lg">
            <Play size={16} aria-hidden="true" /> Watch the film
          </a>
        </motion.div>
        <motion.div
          className="hero-roles"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.05, ease: ease.out }}
        >
          <p className="mono-label" id="roles-label">Or start with a role</p>
          <ul className="chips" aria-labelledby="roles-label">
            {ROLES.map((r) => (
              <li key={r}>
                <Link className="chip" to="/practice" state={{ config: { role: r } }}>{r}</Link>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* The noon sky rises from the hill crests (horizonRef), and each hill fades into it at the foot. */}
      <span ref={horizonRef} className="horizon-mark" aria-hidden="true" />
      <div className="hills" aria-hidden="true">
        <svg width="0" height="0" focusable="false">
          <defs>
            {[["hf1", "#F4A49A", 0.7], ["hf2", "#E98A8C", 0.75], ["hf3", "#F9B9A8", 1]].map(([id, c, o]) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.35" stopColor={c} stopOpacity={o} />
                <stop offset="1" stopColor={c} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
        </svg>
        <motion.svg style={{ y: far }} viewBox="0 0 1440 260" preserveAspectRatio="none">
          <path d="M0 150 C 220 70 420 90 640 140 S 1080 60 1440 120 L1440 260 L0 260Z" fill="url(#hf1)" />
        </motion.svg>
        <motion.svg style={{ y: mid }} viewBox="0 0 1440 260" preserveAspectRatio="none">
          <path d="M0 190 C 260 130 520 220 760 180 S 1200 120 1440 170 L1440 260 L0 260Z" fill="url(#hf2)" />
        </motion.svg>
        <svg viewBox="0 0 1440 260" preserveAspectRatio="none">
          <path d="M0 230 C 300 190 600 250 900 220 S 1260 200 1440 225 L1440 260 L0 260Z" fill="url(#hf3)" />
        </svg>
      </div>
    </section>
  );
}
