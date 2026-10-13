import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Keyboard, Mic, Timer } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { LandingSky } from "../components/Sky";
import { reveal, stagger } from "../motion";
import Film from "./Film";
import Hero from "./Hero";
import { MockReport, SampleBadge } from "./Mocks";
import ScriptPanel from "./ScriptPanel";
import StateExplorer from "./StateExplorer";

const STEPS = [
  { icon: Mic, title: "The mic opens on your turn", body: "No button to press. When the interviewer finishes speaking, you’re live." },
  { icon: Timer, title: "Pause about three seconds to send", body: "Finish the thought, breathe, and your answer goes on its own. Keep talking and it waits." },
  { icon: Keyboard, title: "Typing is always there", body: "Somewhere noisy? Start typing at any moment. Nothing is sent until you choose." },
];

const card = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
};

function Noon() {
  return (
    <section id="how" className="band band-noon day" data-sky="noon" aria-labelledby="noon-title">
      <div className="container">
        <motion.div className="day-head center" {...reveal}>
          <span className="daychip"><i /> Noon · 02 · Answer out loud</span>
          <h2 id="noon-title" className="h2">Just speak. <em>It’s already listening.</em></h2>
        </motion.div>

        <motion.div {...reveal} className="noon-script">
          <ScriptPanel />
        </motion.div>

        <motion.ul className="steps3" variants={stagger(0.12)} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.3 }}>
          {STEPS.map(({ icon: Icon, title, body }) => (
            <motion.li
              key={title}
              className="panel step-card"
              variants={{ initial: card.initial, animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } } }}
            >
              <Icon size={28} strokeWidth={1.8} aria-hidden="true" className="step-icon" />
              <h3 className="h3">{title}</h3>
              <p>{body}</p>
            </motion.li>
          ))}
        </motion.ul>

        <motion.div className="day-head explorer-head" {...reveal}>
          <h2 className="h2 h2-sm">Always clear about what it’s <em>doing.</em></h2>
          <p className="lede">
            Rehearse always shows whether it is speaking, listening, hearing you or thinking, in words as well as in the line.
            Pick a state to see it.
          </p>
        </motion.div>
        <StateExplorer />
      </div>
    </section>
  );
}

function Gold({ innerRef }) {
  return (
    <section ref={innerRef} className="band band-gold day" data-sky="gold" aria-labelledby="gold-title">
      <div className="container">
        <div className="gold-grid">
          <motion.div {...reveal}>
            <span className="daychip"><i /> Golden hour · 03 · The follow-up</span>
            <h2 id="gold-title" className="h2">The light turns. <em>So do the questions.</em></h2>
            <p className="lede">
              Vague answers get a second, sharper question, the way a real interviewer would push. Up to two per question,
              never more.
            </p>
          </motion.div>
          <motion.figure {...card} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="panel followup">
            <SampleBadge />
            <span className="mono-label followup-label">Follow-up · Question 02</span>
            <p className="followup-q">You said “we shipped it”. Which part was <em>your</em> call?</p>
          </motion.figure>
        </div>
        <Film />
      </div>
    </section>
  );
}

function Night({ innerRef }) {
  return (
    <section ref={innerRef} id="debrief" className="band band-night day night" data-sky="night" aria-labelledby="night-title">
      <div className="container">
        <div className="night-grid">
          <motion.div {...reveal}>
            <span className="daychip"><i /> Night · 04 · The debrief</span>
            <h2 id="night-title" className="h2">Sleep on a score <em>you can use.</em></h2>
            <p className="lede">
              A score out of 100, five dimensions, notes on every answer, and a stronger version of each to compare with your own.
            </p>
          </motion.div>
          <motion.div {...card} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="night-report">
            <SampleBadge>Sample debrief</SampleBadge>
            <MockReport compact />
          </motion.div>
        </div>

        <motion.div className="final" {...reveal}>
          <h2 className="display final-title">Tomorrow, <em>you’ll sound ready.</em></h2>
          <Link to="/practice" className="btn btn-sun btn-lg">
            Start practising <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p className="fine">Works best in Chrome or Edge with a microphone. Typing works everywhere.</p>
        </motion.div>
      </div>
    </section>
  );
}

export default function Landing() {
  const reduce = useReducedMotion();
  const noonRef = useRef(null);
  const goldRef = useRef(null);
  const nightRef = useRef(null);

  // Warm up the setup screen once the landing page has settled, so "Start practising" opens instantly.
  useEffect(() => {
    const t = setTimeout(() => import("../practice/Practice"), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`landing ${reduce ? "is-still" : "is-live"}`}>
      <LandingSky noonRef={noonRef} goldRef={goldRef} nightRef={nightRef} />
      <Hero horizonRef={noonRef} />
      <Noon />
      <Gold innerRef={goldRef} />
      <Night innerRef={nightRef} />
    </div>
  );
}
