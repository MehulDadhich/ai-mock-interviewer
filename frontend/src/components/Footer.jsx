import { Link } from "react-router-dom";
import Wordmark from "./Wordmark";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <Wordmark />
        <p className="footer-note">
          A voice-first mock interviewer. Questions and debriefs are written by an AI model on Groq; speech is handled by your browser.
        </p>
        <nav aria-label="Footer" className="footer-links">
          <Link to="/practice">Start practising</Link>
          <a href="/#how">How it works</a>
          <a href="/#film">The film</a>
          <a href="/#debrief">The debrief</a>
        </nav>
      </div>
    </footer>
  );
}
