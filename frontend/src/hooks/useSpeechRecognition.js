import { useCallback, useEffect, useRef, useState } from "react";
import { Recognition, RECOGNITION_ERRORS, recognitionLang } from "./speech";

const join = (a, b) => [a.trim(), b.trim()].filter(Boolean).join(" ");

/**
 * Browser speech-to-text (Chrome, Edge, Safari). Free, no API key.
 * `text` holds finalised speech; `interim` holds words still being recognised.
 * `heardAt` is the time of the last result with new content (used for silence detection).
 * `blocked` is set after a fatal error (permission denied, no mic) and stops auto-restarts.
 */
export function useSpeechRecognition({ lang = recognitionLang() } = {}) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [heardAt, setHeardAt] = useState(0);
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [code, setCode] = useState(null); // the last fatal error code, e.g. "network"
  const recRef = useRef(null);
  const wantRef = useRef(false); // Chrome ends sessions on its own after silence; restart while still wanted

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  const start = useCallback(
    (seed = "") => {
      if (!Recognition || blocked) return;
      const previous = recRef.current;
      recRef.current = null;
      previous?.abort();
      setError(null);
      setText(seed);
      setInterim("");
      setHeardAt(0);

      const rec = new Recognition();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e) => {
        if (recRef.current !== rec) return;
        let final = "";
        let pending = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else pending += r[0].transcript;
        }
        if (final) setText((t) => join(t, final));
        setInterim(pending);
        if (final.trim() || pending.trim()) setHeardAt(Date.now());
      };
      rec.onerror = (e) => {
        if (recRef.current !== rec) return;
        if (e.error === "no-speech" || e.error === "aborted") return;
        console.warn("Speech recognition error:", e.error, e.message || "");
        wantRef.current = false;
        setCode(e.error);
        setError(
          RECOGNITION_ERRORS[e.error] || `Speech recognition stopped (${e.error}). You can keep typing, or try the mic again.`
        );
        setBlocked(true);
      };
      rec.onend = () => {
        if (recRef.current !== rec) return; // a newer session replaced this one
        if (wantRef.current) {
          try {
            rec.start();
            return;
          } catch {
            /* fall through and stop */
          }
        }
        setListening(false);
        setInterim("");
      };

      recRef.current = rec;
      wantRef.current = true;
      try {
        rec.start();
        setListening(true);
      } catch {
        wantRef.current = false;
        setCode(e.error);
        setError("Couldn't start the microphone. You can keep typing.");
      }
    },
    [lang, blocked]
  );

  // Let the user try again after fixing permissions.
  const retry = useCallback(() => {
    setBlocked(false);
    setError(null);
  }, []);

  useEffect(
    () => () => {
      wantRef.current = false;
      const rec = recRef.current;
      recRef.current = null;
      rec?.abort();
    },
    []
  );

  return { supported: Boolean(Recognition), listening, text, interim, heardAt, error, code, blocked, start, stop, retry };
}
