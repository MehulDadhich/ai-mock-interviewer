import { createContext, useCallback, useContext, useMemo, useState } from "react";

// The current interview session. Mirrored to sessionStorage so /report survives a refresh.
// status: "ready" (just created) | "left" (the interview page was left mid-way) | "ended".
// A session restored after a reload can't resume mid-interview (the transcript lived in memory),
// so anything that isn't "ended" comes back as "left".

const KEY = "rehearse.session";
const SessionContext = createContext(null);

function restore() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (!s?.id) return null;
    return { ...s, status: s.status === "ended" ? "ended" : "left" };
  } catch {
    return null;
  }
}

function persist(s) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session still works for this page load */
  }
}

export function SessionProvider({ children }) {
  const [session, setSessionState] = useState(restore);

  const setSession = useCallback((next) => {
    setSessionState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      persist(value);
      return value;
    });
  }, []);

  const setStatus = useCallback(
    (status) => setSession((s) => (s && s.status !== status ? { ...s, status } : s)),
    [setSession]
  );

  const value = useMemo(() => ({ session, setSession, setStatus }), [session, setSession, setStatus]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
