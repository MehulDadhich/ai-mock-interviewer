import { motion } from "framer-motion";
import { useId } from "react";
import { spring } from "../motion";

/** Accessible single-choice control (radiogroup) with a sliding highlight. */
export default function Segmented({ label, hideLabel = false, value, options, onChange }) {
  const id = useId();

  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  };

  return (
    <div className="field">
      <span className={hideLabel ? "sr-only" : "field-label"} id={`${id}-label`}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`${id}-label`} onKeyDown={onKeyDown}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              id={`${id}-${o.value}`}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className={`segment ${active ? "is-active" : ""}`}
              onClick={() => onChange(o.value)}
            >
              {active && <motion.span layoutId={`${id}-pill`} className="segment-pill" transition={spring} />}
              <span className="segment-text">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
