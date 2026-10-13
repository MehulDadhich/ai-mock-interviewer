import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, FileText, Keyboard, LoaderCircle, Mic, ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import MicCheck from "../components/MicCheck";
import Segmented from "../components/Segmented";
import { voiceEnvironmentProblem } from "../hooks/speech";
import { useExtensionWatch } from "../hooks/useExtensions";
import { rise, stagger, swap } from "../motion";
import { useSession } from "../session";

const SENIORITY = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
];
const TYPES = [
  { value: "behavioral", label: "Behavioral", hint: "Stories about how you work: conflict, ownership, failure." },
  { value: "technical", label: "Technical", hint: "Concepts, design and trade-offs for the role." },
  { value: "mixed", label: "Mixed", hint: "A blend of both, like most real first rounds." },
];
const LENGTHS = [3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }));
const ROLE_IDEAS = ["Frontend Engineer", "Data Scientist", "Product Manager", "ML Engineer", "UX Designer"];

const voiceProblem = voiceEnvironmentProblem();
const voiceSupported = !voiceProblem;

function Field({ n, label, htmlFor, hint, children }) {
  return (
    <motion.div variants={rise} className="cue">
      <span className="cue-num" aria-hidden="true">{n}</span>
      <div className="cue-body">
        {htmlFor ? (
          <label className="cue-label" htmlFor={htmlFor}>{label}</label>
        ) : (
          <span className="cue-label">{label}</span>
        )}
        {hint && <p className="cue-hint">{hint}</p>}
        {children}
      </div>
    </motion.div>
  );
}

export default function Practice() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { session, setSession } = useSession();
  const prior = state?.config || session?.config || {};

  const [role, setRole] = useState(prior.role || "");
  const [seniority, setSeniority] = useState(prior.seniority || "mid");
  const [type, setType] = useState(prior.interview_type || "mixed");
  const [length, setLength] = useState(prior.num_questions || 5);
  const [jd, setJd] = useState(prior.job_description || "");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [slow, setSlow] = useState(false);
  const abortRef = useRef(null);
  const roleErrorId = useId();
  const extensions = useExtensionWatch();
  const blocked = extensions.found.length > 0;

  // If the interviewer takes a while, say so and offer a way out.
  useEffect(() => {
    if (!loading) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(t);
  }, [loading]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const roleError = touched && role.trim().length < 2 ? "Enter the role you're interviewing for." : null;
  const typeHint = TYPES.find((t) => t.value === type)?.hint;
  const levelLabel = SENIORITY.find((s) => s.value === seniority)?.label;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (blocked) return;
    if (role.trim().length < 2) {
      document.getElementById("role")?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    const config = {
      role: role.trim(),
      seniority,
      interview_type: type,
      num_questions: length,
      job_description: jd.trim(),
    };
    // Ask for the mic here: a permission prompt on the interview page would take focus and count as leaving it.
    if (voiceSupported && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* declined or no mic: answers can still be typed */
      }
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const turn = await api.start(config, { signal: controller.signal });
      setSession({ id: turn.session_id, config, firstTurn: turn, status: "ready" });
      navigate("/interview");
    } catch (err) {
      if (!err.cancelled) setError(err.message);
      setLoading(false);
    }
  };

  return (
    <motion.form className="container practice" onSubmit={submit} noValidate variants={stagger(0.06)} initial="initial" animate="animate">
      <div className="practice-main">
        <motion.header variants={rise} className="practice-head">
          <span className="daychip"><i /> Dawn · 01 · Pick a role</span>
          <h1 className="h1">Who are you <em>interviewing</em> to be?</h1>
          <p className="lede">Five quick choices. Defaults are sensible, so the only thing you have to fill in is the role.</p>
        </motion.header>

        <Field n="01" label="Role" htmlFor="role">
          <input
            id="role"
            className={`input input-lg ${roleError ? "is-invalid" : ""}`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onBlur={() => role && setTouched(true)}
            placeholder="e.g. Backend Engineer"
            maxLength={80}
            autoComplete="organization-title"
            aria-invalid={Boolean(roleError)}
            aria-describedby={roleError ? roleErrorId : undefined}
          />
          <AnimatePresence>
            {roleError && (
              <motion.p {...swap} id={roleErrorId} className="field-error">{roleError}</motion.p>
            )}
          </AnimatePresence>
          <div className="chips" role="group" aria-label="Role suggestions">
            {ROLE_IDEAS.map((r) => (
              <button key={r} type="button" className={`chip ${role === r ? "is-on" : ""}`} aria-pressed={role === r} onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field n="02" label="Level">
          <Segmented label="Level" hideLabel value={seniority} options={SENIORITY} onChange={setSeniority} />
        </Field>

        <Field n="03" label="Style" hint={typeHint}>
          <Segmented label="Style" hideLabel value={type} options={TYPES} onChange={setType} />
        </Field>

        <Field n="04" label="Questions" hint="Main questions. The interviewer may add up to two follow-ups to each.">
          <Segmented label="Number of questions" hideLabel value={length} options={LENGTHS} onChange={setLength} />
        </Field>

        <Field n="05" label={<>Job description <span className="optional">optional</span></>} htmlFor="jd" hint="Paste the posting and the questions will follow it.">
          <textarea
            id="jd"
            className="input textarea"
            rows={5}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job posting here."
            maxLength={6000}
          />
          <p className="counter" aria-live="off">{jd.length.toLocaleString()} / 6,000</p>
        </Field>
      </div>

      <motion.aside variants={rise} className="callsheet" aria-labelledby="callsheet-title">
        <div className="callsheet-inner panel">
          <p className="kicker" id="callsheet-title">Your interview</p>
          <p className="callsheet-role">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={role.trim() || "empty"} {...swap} className={role.trim() ? "" : "is-empty"}>
                {role.trim() || "Your role"}
              </motion.span>
            </AnimatePresence>
          </p>
          <dl className="sheet">
            <div><dt>Level</dt><dd>{levelLabel}</dd></div>
            <div><dt>Style</dt><dd>{TYPES.find((t) => t.value === type)?.label}</dd></div>
            <div><dt>Questions</dt><dd>{length} + follow-ups</dd></div>
            <div>
              <dt>Job description</dt>
              <dd>{jd.trim() ? <><FileText size={14} aria-hidden="true" /> Attached</> : "None"}</dd>
            </div>
            <div>
              <dt>Answers</dt>
              <dd>
                {voiceSupported ? (
                  <><Mic size={14} aria-hidden="true" /> Voice, typing anytime</>
                ) : (
                  <><Keyboard size={14} aria-hidden="true" /> Typing</>
                )}
              </dd>
            </div>
          </dl>

          <ul className="sheet-notes">
            <li><Check size={14} aria-hidden="true" /> The mic opens by itself when it's your turn.</li>
            <li><Check size={14} aria-hidden="true" /> Pause for about three seconds and your answer is sent.</li>
            <li><ShieldAlert size={14} aria-hidden="true" /> Stay on this tab. Leaving it is a warning, and the third warning submits and ends the interview.</li>
            {voiceProblem && <li className="warn-note">{voiceProblem}</li>}
          </ul>

          <MicCheck />

          {blocked && (
            <div className="ext-block" role="alert">
              <p className="ext-block-title"><ShieldAlert size={16} aria-hidden="true" /> Turn off browser extensions to start</p>
              <p>
                Found: {extensions.found.join(", ")}. Turn it off for this site, or open Rehearse in a private window
                (extensions are off there by default), then reload.
              </p>
              <button type="button" className="link-btn" onClick={() => window.location.reload()}>Reload and check again</button>
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading || blocked}>
            {loading ? (
              <><LoaderCircle className="spin" size={18} aria-hidden="true" /> Preparing your interviewer</>
            ) : (
              <>Begin interview <ArrowRight size={18} aria-hidden="true" /></>
            )}
          </button>
          <AnimatePresence>
            {slow && (
              <motion.div {...swap} className="slow-note" role="status">
                <p>Still preparing. The AI service is slower than usual right now; this can take up to a minute.</p>
                <button type="button" className="link-btn" onClick={() => abortRef.current?.abort()}>Cancel</button>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="fine">Your browser will ask for the microphone once. You can pause it at any time.</p>
        </div>
      </motion.aside>
    </motion.form>
  );
}
