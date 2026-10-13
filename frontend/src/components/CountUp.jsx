import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ease } from "../motion";

/** Counts up to a known, final value once it's on screen. Never used for values that aren't real yet. */
export default function CountUp({ value, duration = 1.4 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) return setShown(value);
    if (!inView) return;
    const controls = animate(0, value, { duration, ease: ease.out, onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value, reduce, inView, duration]);
  return <span ref={ref}>{shown}</span>;
}
