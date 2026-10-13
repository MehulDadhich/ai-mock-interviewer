import { motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { spring } from "../motion";
import Wordmark from "./Wordmark";

const STEPS = [
  { path: "/practice", label: "Set up" },
  { path: "/interview", label: "Interview" },
  { path: "/report", label: "Debrief" },
];

const ANCHORS = [
  { href: "#how", label: "How it works" },
  { href: "#film", label: "The film" },
  { href: "#debrief", label: "The debrief" },
];

function LandingNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav aria-label="Sections" className="nav-anchors">
        {ANCHORS.map((a) => (
          <a key={a.href} href={a.href} className="nav-link">{a.label}</a>
        ))}
      </nav>
      <div className="nav-actions">
        <Link to="/practice" className="btn btn-primary btn-sm">
          Start practising <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <motion.nav
          id="mobile-nav"
          aria-label="Sections"
          className="mobile-nav"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {ANCHORS.map((a) => (
            <a key={a.href} href={a.href} className="mobile-link" onClick={() => setOpen(false)}>{a.label}</a>
          ))}
        </motion.nav>
      )}
    </>
  );
}

function Progress({ pathname }) {
  const current = STEPS.findIndex((s) => s.path === pathname);
  return (
    <nav aria-label="Progress">
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li
            key={s.path}
            className={`step ${i === current ? "is-current" : ""} ${i < current ? "is-done" : ""}`}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="step-label">{s.label}</span>
            {i === current && <motion.span layoutId="step-underline" className="step-underline" transition={spring} />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function Header({ landing }) {
  const { pathname } = useLocation();
  return (
    <header className={`header ${landing ? "is-landing" : "is-app"}`}>
      <div className="container header-inner">
        {pathname === "/interview" ? (
          // No way out mid-interview: it ends when it's complete or submitted.
          <span className="brand"><Wordmark /></span>
        ) : (
          <Link to="/" className="brand" aria-label="Rehearse home">
            <Wordmark />
          </Link>
        )}
        {landing ? <LandingNav /> : <Progress pathname={pathname} />}
      </div>
    </header>
  );
}
