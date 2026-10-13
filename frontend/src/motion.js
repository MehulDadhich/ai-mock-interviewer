// Shared motion language. Entrances ease out; exits are quicker than entrances.
// Only transform and opacity are animated. MotionConfig reducedMotion="user" (App) softens all of it.

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
};

export const dur = { fast: 0.18, base: 0.32, slow: 0.6, story: 0.9 };

export const spring = { type: "spring", stiffness: 420, damping: 34 }; // snappy: pills, underlines
export const softSpring = { type: "spring", stiffness: 160, damping: 26 }; // panels, scenes

export const page = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: ease.out } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: ease.inOut } },
};

export const stagger = (gap = 0.06, delay = 0) => ({
  initial: {},
  animate: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const rise = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.slow, ease: ease.out } },
};

// Reveal once when scrolled into view.
export const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: dur.slow, ease: ease.out },
};

export const swap = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: dur.fast, ease: ease.inOut } },
};
