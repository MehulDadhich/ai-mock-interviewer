import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * The voice line: Rehearse's signature. One ink stroke whose shape *is* the interview state.
 *
 * mode:
 *   speaking  – the interviewer is talking (ink, medium wave)
 *   listening – the mic is genuinely open, nothing heard yet (near-flat breath)
 *   hearing   – speech is coming in right now (live red, full wave)
 *   counting  – silence after speech; a red rule fills over `countdown` seconds, then the answer sends
 *   sending   – answer submitted; a dot travels along the line
 *   paused    – mic off / typing (dashed, still)
 *   idle/done – flat, still
 *
 * Callers must only pass listening/hearing when recognition is actually running.
 * State is always also given as text elsewhere; this graphic is aria-hidden.
 */

const W = 1000;
const H = 120;
const N = 72;
const AMP = { idle: 0, done: 0, paused: 0, listening: 0.05, speaking: 0.5, hearing: 0.9, counting: 0, sending: 0 };

function shape(t, amp, seed) {
  let d = "";
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * W;
    const u = i / N;
    const env = Math.sin(Math.PI * u) ** 1.4; // taper to the ends
    const y =
      Math.sin(u * 13 + t * 3.1 + seed) * 0.5 +
      Math.sin(u * 29 - t * 4.7 + seed * 2) * 0.32 +
      Math.sin(u * 61 + t * 7.3) * 0.18;
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${(H / 2 + y * env * amp * (H * 0.44)).toFixed(1)}`;
  }
  return d;
}

const FLAT = `M0 ${H / 2}L${W} ${H / 2}`;

export default function VoiceLine({ mode = "idle", countdown = 0, countKey, className = "", active = true }) {
  const reduce = useReducedMotion();
  const rootRef = useRef(null);
  const onScreen = useInView(rootRef);
  const running = active && onScreen; // no animation work while off screen
  const pathRef = useRef(null);
  const ampRef = useRef(0);
  const target = AMP[mode] ?? 0;
  const seed = useRef(Math.random() * 10).current;

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    if (reduce || !running) {
      // Still frame: a calm, fixed shape that still differs by state.
      ampRef.current = target;
      path.setAttribute("d", target > 0 ? shape(0.6, Math.min(target, 0.5), seed) : FLAT);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now) => {
      const a = ampRef.current;
      const next = a + (target - a) * 0.08;
      ampRef.current = Math.abs(next - target) < 0.002 ? target : next;
      path.setAttribute("d", ampRef.current > 0.002 ? shape((now - t0) / 1000, ampRef.current, seed) : FLAT);
      // Keep running while moving; stop once flat and settled.
      if (ampRef.current > 0 || target > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, running, seed]);

  return (
    <div ref={rootRef} className={`voiceline vl-${mode} ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" focusable="false">
        <path ref={pathRef} className="vl-path" d={FLAT} vectorEffect="non-scaling-stroke" />
        <AnimatePresence>
          {mode === "counting" && (
            <motion.path
              key={countKey}
              className="vl-count"
              d={FLAT}
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: countdown, ease: "linear" }}
            />
          )}
        </AnimatePresence>
      </svg>
      {mode === "sending" && (
        // A full-width track slides by its own width, so the centred dot travels end to end (transform only).
        <motion.span
          className="vl-track"
          initial={{ x: "-50%" }}
          animate={{ x: "50%" }}
          transition={{ duration: 1.1, repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
        >
          <span className="vl-dot" />
        </motion.span>
      )}
    </div>
  );
}
