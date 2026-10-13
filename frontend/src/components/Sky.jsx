import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useMemo } from "react";

/**
 * The Golden Hour sky. Decorative only (aria-hidden), fixed behind the content.
 *  - <PageSky tone>: a still sky for one time of day (app pages).
 *  - <LandingSky refs>: the day passes as you scroll. Each new sky rises like a horizon whose
 *    edge tracks its section's top, so a section's text always sits on its own sky (no muddy blends).
 * Only transform and opacity animate.
 */

const STAR_COUNT = 44;

function Stars({ style }) {
  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        left: `${((i * 37.7) % 100).toFixed(1)}%`,
        top: `${((i * 23.3) % 64).toFixed(1)}%`,
        delay: `${((i % 7) * 0.45).toFixed(2)}s`,
        size: i % 5 === 0 ? 3 : 2,
      })),
    []
  );
  return (
    <motion.div className="stars" style={style}>
      {stars.map((s, i) => (
        <i key={i} className="star" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
      ))}
    </motion.div>
  );
}

export function PageSky({ tone }) {
  return (
    <div className={`sky sky-page sky-${tone}`} aria-hidden="true">
      <span className="sky-fill" />
      {tone === "night" ? (
        <>
          <Stars />
          <span className="moon moon-page" />
        </>
      ) : (
        <span className={`sun sun-${tone}`} />
      )}
    </div>
  );
}

function useArrival(ref) {
  // 0 when the section's top is 15% below the viewport (so the soft horizon is still hidden), 1 at the top.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 1.15", "start start"] });
  return scrollYProgress;
}

// The layer's solid edge sits exactly at the section's top: it moves from 115vh to 0 as the section rises.
const RISE = ["115vh", "0vh"];

export function LandingSky({ noonRef, goldRef, nightRef }) {
  const reduce = useReducedMotion();
  const noon = useArrival(noonRef);
  const gold = useArrival(goldRef);
  const night = useArrival(nightRef);
  const { scrollYProgress: p } = useScroll();

  // The sun's arc over the whole day.
  const at = [0, 0.16, 0.34, 0.52, 0.68, 0.8];
  const x = useTransform(p, at, ["50vw", "30vw", "58vw", "76vw", "88vw", "96vw"]);
  const y = useTransform(p, at, ["40vh", "14vh", "8vh", "24vh", "62vh", "100vh"]);
  const scale = useTransform(p, at, [1.15, 0.9, 0.72, 0.92, 1.2, 1.3]);
  const sunColor = useTransform(p, at, ["#FFE7B8", "#FFF2CF", "#FFFBEA", "#FFC56E", "#FF8A5C", "#FF6B57"]);
  const noonY = useTransform(noon, [0, 1], RISE);
  const goldY = useTransform(gold, [0, 1], RISE);
  const nightY = useTransform(night, [0, 1], RISE);
  const sunOpacity = useTransform(night, [0.3, 0.8], [1, 0]);
  const raysOpacity = useTransform(p, [0, 0.12], [1, 0]);
  const moonY = useTransform(night, [0.5, 1], [40, 0]);
  const moonOpacity = useTransform(night, [0.5, 1], [0, 1]);

  if (reduce) return null; // sections fall back to their own colour bands

  return (
    <div className="sky sky-landing" aria-hidden="true">
      <span className="sky-layer sk-dawn" />
      <motion.span className="sky-layer sk-noon" style={{ y: noonY }} />
      <motion.span className="sky-layer sk-gold" style={{ y: goldY }} />
      <motion.span className="sky-layer sk-night" style={{ y: nightY }} />
      <Stars style={{ opacity: night }} />
      <motion.span className="moon" style={{ opacity: moonOpacity, y: moonY }} />
      <motion.div className="sun-track" style={{ x, y, opacity: sunOpacity }}>
        <motion.span className="rays" style={{ opacity: raysOpacity }} />
        <motion.span
          className="sun"
          style={{ scale, backgroundColor: sunColor }}
          initial={{ y: 160, opacity: 0.4 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>
    </div>
  );
}
