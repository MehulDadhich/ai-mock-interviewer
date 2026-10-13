import { motion } from "framer-motion";
import { ease } from "../motion";

/** Score as a rule on a 0–100 scale: the voice line, resolved. */
export function ScoreRule({ value }) {
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="score-rule" aria-hidden="true">
      <motion.span
        className="score-rule-fill"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct }}
        transition={{ duration: 1.4, ease: ease.out }}
      />
      <span className="score-rule-ticks" />
    </div>
  );
}

export function Dimensions({ items }) {
  return (
    <ul className="dims">
      {items.map((d, i) => {
        const score = Math.max(0, Math.min(10, d.score));
        return (
          <li key={d.name} className="dim">
            <span className="dim-name">{d.name}</span>
            <span className="dim-track" aria-hidden="true">
              <motion.span
                className="dim-fill"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: score / 10 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: ease.out }}
              />
            </span>
            <span className="dim-score">{d.score}<span className="muted">/10</span></span>
            {d.comment && <p className="dim-comment">{d.comment}</p>}
          </li>
        );
      })}
    </ul>
  );
}
