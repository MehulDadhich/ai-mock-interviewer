// Shared facts about voice support in this browser.

export const Recognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/**
 * The interview is in English, so recognise English. Keep the browser's own English variant
 * (en-IN, en-GB…) for better accuracy; otherwise use en-US. A non-English browser language
 * (e.g. hi-IN) would make English answers come back empty or garbled.
 */
export function recognitionLang() {
  const langs = typeof navigator !== "undefined" ? [...(navigator.languages || []), navigator.language] : [];
  return langs.find((l) => l && l.toLowerCase().startsWith("en")) || "en-US";
}

/** Problems we can detect before trying the mic. Returns a message, or null if nothing obvious is wrong. */
export function voiceEnvironmentProblem() {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return `Browsers only allow the microphone on https or localhost. Open the app at http://localhost:${location.port || "5173"} instead of ${location.host}.`;
  }
  // Without the browser's speech service we can still record and transcribe on the server.
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioWorkletNode !== "undefined";
  if (!Recognition && !canRecord) {
    return "This browser can't use the microphone for answers. Use Chrome or Edge for voice, or type your answers.";
  }
  return null;
}

/** Plain-language messages for SpeechRecognition error codes. */
export const RECOGNITION_ERRORS = {
  "not-allowed":
    "Microphone access is blocked. Click the lock (or mic) icon in the address bar, allow the microphone, then try again.",
  "service-not-allowed":
    "The browser blocked the speech service. In Chrome or Edge, allow the microphone for this site; some browsers (like Brave) don't allow it at all.",
  "audio-capture": "No working microphone found. Check it's plugged in and selected as the input device in your system sound settings.",
  network: "The speech service couldn't be reached. It needs an internet connection, and some browsers (like Brave) block it.",
  "language-not-supported": "Speech recognition doesn't support this language setting. It will use US English instead.",
};

/** Plain-language messages for getUserMedia errors (the microphone itself). */
export function micErrorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked. Click the lock (or mic) icon in the address bar, allow the microphone, and test again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone found. Plug one in, or pick a working input in your system sound settings.";
    case "NotReadableError":
    case "AbortError":
      return "The microphone is busy or failed to start. Close other apps using it (Zoom, Teams, Discord) and test again.";
    default:
      return `The microphone couldn't start (${err?.name || "unknown error"}).`;
  }
}
