import { motion } from "framer-motion";
import { ease } from "../motion";

/** Reveals text word by word, the way a spoken question lands. */
export default function RevealText({ text, as: Tag = "p", className }) {
  const words = text.split(/\s+/);
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={`${i}-${w}`}
          aria-hidden="true"
          className="word"
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.4, delay: Math.min(i * 0.03, 1.2), ease: ease.out }}
        >
          {w}{" "}
        </motion.span>
      ))}
    </Tag>
  );
}
