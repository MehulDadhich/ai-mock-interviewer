import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A small playhead for scripted, sample-data scenes. Returns the time in ms.
 * Updates at most every `step` ms (no need to re-render at 60fps for text and state swaps).
 * `loop`: wrap at `duration`; otherwise stop at the end and report `ended`.
 */
export function useTimeline({ duration, playing, loop = true, step = 50 }) {
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    const tick = (now) => {
      // rAF timestamps can precede the effect's performance.now(); never go backwards,
      // and don't jump ahead after the tab was in the background.
      tRef.current += Math.min(100, Math.max(0, now - last));
      last = now;
      if (tRef.current >= duration) {
        if (loop) tRef.current %= duration;
        else {
          tRef.current = duration;
          setT(duration);
          setEnded(true);
          return;
        }
      }
      if (now - lastPaint >= step) {
        lastPaint = now;
        setT(tRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration, loop, step]);

  const seek = useCallback((ms) => {
    tRef.current = Math.max(0, Math.min(duration, ms));
    setT(tRef.current);
    setEnded(tRef.current >= duration);
  }, [duration]);

  return { t, ended, seek };
}

/** Which segment of a [{ at, ... }] list (sorted by `at`) the playhead is in. */
export function segmentAt(list, t) {
  let i = 0;
  while (i + 1 < list.length && t >= list[i + 1].at) i++;
  return { index: i, item: list[i], local: t - list[i].at };
}

/** First n words of a sentence, for speech appearing word by word. */
export function wordsUpTo(text, fraction) {
  const words = text.split(" ");
  const n = Math.max(0, Math.min(words.length, Math.round(words.length * fraction)));
  return words.slice(0, n).join(" ");
}
