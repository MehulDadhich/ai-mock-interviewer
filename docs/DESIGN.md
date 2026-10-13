# Rehearse — design direction

This file records the design exploration behind the current UI, the direction that won, and the rules the code follows. Visual explorations (15 landing concepts, A–O) live on the private design canvas; this document records the decision.

## 1. Ten directions explored

Scores are out of 10: **Orig**inality · **Prem**ium feel · **Use**ability · **Mot**ion quality · **Iden**tity · **A11y** · **Feas**ibility.

| # | Concept | Philosophy and feel | Colour / type | Signature motion | Interview + report idea | Orig | Prem | Use | Mot | Iden | A11y | Feas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Cinematic Interview Room** | A title sequence. The interview feels consequential. | Near-black, warm key light, one amber; condensed serif titles | Light sweeps across type; letterboxed scene cuts | Question as a film title card; report as end credits | 7 | 8 | 5 | 9 | 6 | 5 | 6 |
| 2 | **Intelligence Instrument** | A precision instrument: calm, exact, measured. | Graphite, cyan signal, mono everywhere | Orbiting dials, calibrated gauges | Oscilloscope answer view; report as instrument panel | 6 | 7 | 6 | 8 | 5 | 6 | 6 |
| 3 | **Editorial Brutalism** | Indie magazine meets AI: loud and confident. | Paper, black, signal red; huge grotesk | Hard cuts, oversized type sliding on scroll | Question set at 120px; report as a printed review | 8 | 6 | 6 | 6 | 8 | 7 | 8 |
| 4 | **Quiet Luxury** | Restraint and whitespace: premium through precision. | Bone, ink, one hairline accent; high-contrast serif | Slow fades, letter-spacing breathing | Minimal single column; report as a letter | 5 | 9 | 8 | 5 | 4 | 9 | 9 |
| 5 | **Live Performance** | Interviewing as performance: stage and spotlight. | Velvet red, brass, black; theatrical serif | Curtains, spotlight that follows the cursor | Cue cards; report as reviews | 8 | 7 | 5 | 8 | 7 | 5 | 6 |
| 6 | **Spatial Interface** | Depth and layers: floating panes in perspective. | Cool neutrals, glass; geometric sans | Parallax planes, perspective tilts | Floating question pane; report in layered stacks | 6 | 7 | 5 | 8 | 4 | 4 | 5 |
| 7 | **Adaptive Intelligence** | The UI evolves with the user's progress. | Shifts from cool to warm as you progress; humanist sans | Palette and density change per stage | State-tinted interview; report "arrives" in the final palette | 7 | 6 | 7 | 7 | 5 | 6 | 6 |
| 8 | **Swiss Precision × AI** | Grid, hierarchy, mathematical spacing. | White, black, one red; neo-grotesk + mono | Precise wipes along grid lines | Strict 12-column interview; tabular report | 5 | 8 | 9 | 6 | 6 | 9 | 9 |
| 9 | **Personal Training Studio** | Supportive coach, not judge. | Warm clay, sage; rounded sans | Encouraging micro-celebrations | Coach notes beside you; report framed as next reps | 5 | 6 | 9 | 6 | 5 | 8 | 9 |
| 10 | **Future of Voice** | Voice is the brand; the mic is the hero. | Dark, one vivid live colour; mono labels | An audio line that responds to speech states | Waveform-centred interview; report reads the "recording" | 8 | 7 | 7 | 9 | 8 | 6 | 7 |

What scored low and why: Cinematic and Live Performance were memorable, but their drama slows people down and puts contrast at risk. Spatial and Instrument looked generic "AI" and were the hardest to keep readable. Quiet Luxury and Swiss were the most usable, but on their own neither has a face.

## 2. The chosen direction: **Golden Hour** (owner's pick)

Earlier, "Live Script" (an editorial hybrid of 3, 8 and 10) was built first. After comparing 15 landing concepts on the design canvas, the owner chose **concept O, Golden Hour**, and the whole app now follows it. Live Script remains in git history (commit `38f6131`).

**Idea.** A practice session is one day:
- **Dawn:** pick a role.
- **Noon:** answer out loud.
- **Golden hour:** the follow-up.
- **Night:** the debrief.

On the landing page, the day passes as you scroll: a sun arcs across the sky and sets, then a moon and stars come out for the debrief. Each app page lives at its own time of day:
- `/practice` is dawn.
- `/interview` is noon, a calm, bright sky for concentrating.
- `/report` is night.

**Signature motion**
- **Rising horizons:** each new sky rises like a horizon whose edge tracks the top of its section. Text therefore always sits on its own sky, never on a muddy blend of two. This uses transform only.
- **The sun:** it moves on a scroll-linked arc, with slow rays at dawn.
- **Hills:** the dawn hills drift with parallax and dissolve into the noon sky.
- **The voice line:** it carries over from the earlier direction and shows the real interview state.

**Why it works**
- The colour carries the story, so even a static screenshot reads as "Rehearse".
- Every time of day has its own text colours, each checked against its sky.

## 3. System

| Token group | Decision |
|---|---|
| Colour | `data-sky="dawn | noon | gold | night"` scopes redefine the same roles: `--ink`, `--ink-2`, `--ink-3`, `--accent`, `--live`, `--live-text`, `--surface`, `--field`, `--rule`, and `--d1` to `--d5` for the dimension bars. Every text role is AA (4.5:1 or better) against the lightest and darkest stops of its own sky. |
| Type | **DM Serif Display** for headlines, questions and scores. **Inter** (variable) for UI and long text (answers, transcripts, stronger answers). Labels are Inter at 12px, 600 weight, uppercase, with 0.14em letter-spacing. Both fonts are bundled with the app (`@fontsource`). |
| Shape | Frosted, sunlit panels (24px radius, blur 14px, soft inner highlight). Pills for controls. |
| Space | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Containers 1200 / 760 px. Gutter `clamp(16px, 4vw, 40px)`. |
| Motion | Shared in `src/motion.js`: durations, easings, springs, and the page, rise, stagger and reveal variants. The sky is driven by Framer Motion `useScroll` / `useTransform`, which works in every browser, with no CSS scroll-timeline dependency. With reduced motion, the fixed sky is removed and each section gets its own colour band. Exits are faster than entrances. |
| Breakpoints | 480 / 600 / 900 / 960. |

## 4. Rules the code follows

- The voice line only shows "listening" when `SpeechRecognition` is genuinely running, and "hearing you" only on real interim results.
- The silence threshold stays at the existing **2.8s** (`SILENCE_MS`). Typing always works, and typing switches that answer to manual send.
- Landing-page, film and demo content uses sample data and is labelled "Sample". There are no testimonials, user counts or logos.
- The sky is decorative (`aria-hidden`). State is always given in text.
