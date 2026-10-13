import { useCallback, useEffect, useRef, useState } from "react";
import { micErrorMessage } from "./speech";

/**
 * Records the microphone in the browser (no speech service needed) and detects speech from the
 * real audio level. Used when the browser's own speech-to-text is unavailable; the recording is
 * then transcribed by the backend.
 *
 * - `speaking`: voice is above the noise floor right now.
 * - `heardAt`: time of the last voice (drives the same silence countdown as browser recognition).
 * - `hasSpeech`: some speech was captured since start().
 * - `cut()` returns the phrase recorded since the last cut as a WAV Blob, so it can be transcribed
 *   while the candidate keeps talking (null if that stretch has under PHRASE_MIN_MS of voice).
 * - `stop()` returns whatever is left after the last cut (or null if nothing more was said).
 */

const TARGET_RATE = 16000;
const MAX_SECONDS = 240;
const SPEECH_MIN_MS = 250; // ignore clicks and bumps shorter than this
const PHRASE_MIN_MS = 1500; // don't send phrases with less voice than this on their own

// A tiny worklet that hands raw samples to the page. Loaded from a Blob so no extra file is needed.
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("rehearse-tap", Tap);
`;

function encodeWav(chunks, rate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  // Resample to 16 kHz (linear interpolation): small uploads, plenty for speech.
  const ratio = rate / TARGET_RATE;
  const outLen = Math.floor(total / ratio);
  const input = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    input.set(c, off);
    off += c.length;
  }
  const view = new DataView(new ArrayBuffer(44 + outLen * 2));
  const str = (o, s) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + outLen * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, outLen * 2, true);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const a = input[j] || 0;
    const b = input[j + 1] ?? a;
    const s = Math.max(-1, Math.min(1, a + (b - a) * (pos - j)));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

export const recorderSupported =
  typeof window !== "undefined" &&
  window.isSecureContext &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  Boolean(window.AudioContext || window.webkitAudioContext) &&
  typeof AudioWorkletNode !== "undefined";

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heardAt, setHeardAt] = useState(0);
  const [hasSpeech, setHasSpeech] = useState(false);
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const ref = useRef(null);
  const startingRef = useRef(null); // { cancelled } while getUserMedia / worklet setup is in flight

  const teardown = useCallback(() => {
    if (startingRef.current) startingRef.current.cancelled = true;
    const r = ref.current;
    ref.current = null;
    if (!r) return null;
    r.node.port.onmessage = null;
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close();
    setRecording(false);
    setSpeaking(false);
    return r;
  }, []);

  const start = useCallback(async () => {
    if (ref.current || startingRef.current || blocked) return;
    const pending = { cancelled: false };
    startingRef.current = pending;
    setError(null);
    setHasSpeech(false);
    setHeardAt(0);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      startingRef.current = null;
      setError(micErrorMessage(err));
      setBlocked(true);
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } catch {
      startingRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      setError("This browser can't record audio here. You can type your answers.");
      setBlocked(true);
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    startingRef.current = null;
    if (pending.cancelled) {
      // The mic was switched off while it was still starting.
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      return;
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "rehearse-tap");
    source.connect(node);

    const r = {
      ctx, stream, node,
      chunks: [], // audio since the last cut
      samples: 0,
      floor: 0.01, smooth: 0, voiceSince: 0, lastPaint: 0,
      speech: false, // any speech since start()
      segVoice: 0, // seconds of voice in the current phrase
    };
    ref.current = r;
    setRecording(true);

    node.port.onmessage = (e) => {
      const data = e.data;
      if (ref.current !== r) return;
      r.chunks.push(data);
      r.samples += data.length;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      r.smooth = r.smooth * 0.8 + rms * 0.2;
      // Track the background noise level slowly, so the speech threshold adapts to the room.
      if (r.smooth < r.floor * 1.5) r.floor = r.floor * 0.98 + r.smooth * 0.02;
      const threshold = Math.max(0.012, r.floor * 3);
      const now = Date.now();
      const voiced = r.smooth > threshold;
      if (voiced) {
        r.segVoice += data.length / ctx.sampleRate;
        if (!r.voiceSince) r.voiceSince = now;
        if (now - r.voiceSince >= SPEECH_MIN_MS) {
          if (!r.speech) {
            r.speech = true;
            setHasSpeech(true);
          }
          if (now - r.lastPaint > 150) {
            r.lastPaint = now;
            setHeardAt(now);
            setSpeaking(true);
          }
        }
      } else if (r.voiceSince) {
        r.voiceSince = 0;
        setSpeaking(false);
      }
      if (r.samples / ctx.sampleRate > MAX_SECONDS) setError("That answer is very long; send it now or keep it shorter.");
    };
  }, [blocked]);

  /** Stops recording and returns the WAV (null if no speech was captured). */
  /** Hands over the phrase recorded since the last cut (called during a short pause). */
  const cut = useCallback(() => {
    const r = ref.current;
    if (!r || r.segVoice * 1000 < PHRASE_MIN_MS) return null;
    const blob = encodeWav(r.chunks, r.ctx.sampleRate);
    r.chunks = [];
    r.segVoice = 0;
    return blob;
  }, []);

  /** Stops recording and returns what's left after the last cut. */
  const stop = useCallback(() => {
    const r = teardown();
    if (!r || !r.speech || r.segVoice * 1000 < SPEECH_MIN_MS) return null;
    return encodeWav(r.chunks, r.ctx.sampleRate);
  }, [teardown]);

  const cancel = useCallback(() => {
    teardown();
  }, [teardown]);

  const retry = useCallback(() => {
    setBlocked(false);
    setError(null);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  return { supported: recorderSupported, recording, speaking, heardAt, hasSpeech, error, blocked, start, cut, stop, cancel, retry };
}
