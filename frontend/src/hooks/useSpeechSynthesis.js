import { useCallback, useEffect, useRef, useState } from "react";

const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

// Natural-sounding voices first, then any English voice.
const PREFERRED = [/natural/i, /aria|jenny|guy/i, /google (us|uk) english/i, /samantha|daniel|karen/i];

function pickVoice(voices) {
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  for (const pattern of PREFERRED) {
    const match = english.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  return english[0] || null;
}

/** Browser text-to-speech. Free, no API key. */
export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef(null);
  const tokenRef = useRef(0); // identifies the current utterance so stale callbacks are ignored

  useEffect(() => {
    if (!synth) return;
    const load = () => (voiceRef.current = pickVoice(synth.getVoices()));
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      tokenRef.current++;
      synth.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    tokenRef.current++;
    synth?.cancel();
    setSpeaking(false);
  }, []);

  /** Speaks `text`; `onEnd` runs once when this utterance finishes (not when it's cancelled). */
  const speak = useCallback((text, { onEnd } = {}) => {
    if (!synth || !text) {
      onEnd?.();
      return;
    }
    const token = ++tokenRef.current;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1;
    u.onstart = () => token === tokenRef.current && setSpeaking(true);
    const finish = () => {
      if (token !== tokenRef.current) return;
      setSpeaking(false);
      onEnd?.();
    };
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  }, []);

  return { supported: Boolean(synth), speaking, speak, cancel };
}
