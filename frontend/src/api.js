// Same origin in production (Vercel routes /api/* to the backend service); the local backend in `npm run dev`.
// An empty VITE_API_URL also means same origin (e.g. under `vercel dev`).
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8001" : "")).replace(/\/$/, "");

// Slightly longer than the backend's own AI timeouts, so the server's message usually wins.
const TIMEOUT_MS = { default: 60000, report: 170000 };

async function post(path, body, { signal, timeout = TIMEOUT_MS.default } = {}) {
  const timer = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  let res;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw Object.assign(new Error("Cancelled."), { cancelled: true });
    if (timer.aborted) throw new Error("The server took too long to respond. Please try again.");
    throw new Error("Can't reach the server. Is the backend running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI validation errors arrive as an array of {msg}
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg).join(". ")
      : data.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

async function transcribe(blob) {
  let res;
  try {
    res = await fetch(BASE + "/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: blob,
      signal: AbortSignal.timeout(50000),
    });
  } catch {
    throw Object.assign(new Error("Couldn't send the recording to the server. Try again, or type your answer."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.detail || `Transcription failed (${res.status})`), { status: res.status });
  return data.text || "";
}

export const api = {
  transcribe,
  start: (config, opts) => post("/api/sessions", config, opts),
  answer: (id, answer) => post(`/api/sessions/${id}/answer`, { answer }),
  end: (id, answer, reason = "submitted") => post(`/api/sessions/${id}/end`, { answer: answer || "", reason }),
  report: (id) => post(`/api/sessions/${id}/report`, undefined, { timeout: TIMEOUT_MS.report }),
};
