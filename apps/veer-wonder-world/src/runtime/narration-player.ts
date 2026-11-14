// Wonder World narration player (PRD 04 B05, PRD 03 section 4).
//
// Recorded voice lines on the mixer's shared AudioContext, one line at a time:
// `play()` always ends the current line first, and the mixer also ends any
// other voice, so two voices never overlap. Music ducks while a recorded line
// is (about to be) audible; silent caption-only lines do not duck.
//
// Every played line ends with exactly one `onEnd(key)`, unless it was stopped
// or replaced first:
// - recorded clip: when the clip ends. A safety timer (remaining clip time +
//   SAFETY_MS) still ends the line if the browser never reports the end;
// - missing clip, muted narration, locked/unavailable audio, or a clip that
//   fails to load or start: on caption timing, `estimateMs(key)` after the line
//   began (time already spent counts; silence always completes);
// - `onEnd` is never called synchronously from play()/resume()/setMuted(), so
//   the app may feed it straight back into the episode director.
//
// Pause: `pause()` holds the player (the current line, and any line played
// while paused, which starts on resume()). The player also follows
// `mixer.pauseAll()`/`resumeAll()`, so a pause from either side freezes both
// the audio and the caption clock. RESUME CONTINUES the line: recorded audio
// carries on from where it stopped and caption timing continues with the
// remaining milliseconds. Nothing restarts. `replay()` is the explicit restart.
//
// `stop()` cancels the line WITHOUT `onEnd` (skip, all done, route change).
// Callbacks that arrive after stop(), a newer play() or dispose() are ignored,
// and a clip that finishes loading after its line was stopped, replaced, muted
// or ended is never started (the mixer asks the line's intent first; a line
// paused while its clip loaded gets the voice held until resume()).
// After dispose() no timer, audio, duck or mixer subscription is left behind.
//
// Cue timing for the stage's talking pulse: onStart(line) and onEnd(key) bracket
// the line, and timing() reports mode, pause and elapsed/expected length. The
// pulse is a squash/bob while the line plays; it is never lip sync.
//
// Pure runtime code: time comes only from `now`, timers only from `schedule`.
import type { AudioClipRef, LineRef, SpeakerId, VisemeCode, VisemeCue } from "../types.js";
import type { AudioMixer, VoiceHandle, VoiceIntent } from "./audio-mixer.js";

/** Grace added to a recorded clip's remaining time before the safety timer ends the line. */
export const SAFETY_MS = 1500;

/** Caption time used when `estimateMs` gives no usable number (matches beat-runner's DEFAULT_LINE_MS). */
export const FALLBACK_LINE_MS = 2600;

/** Step size of the pre-baked 20 Hz RMS speech envelope (`AudioClipRef.env`). */
export const SPEECH_ENVELOPE_STEP_MS = 50;

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP: Int8Array = (() => {
  const table = new Int8Array(128);
  table.fill(-1);
  for (let i = 0; i < BASE64_CHARS.length; i += 1) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Pure browser-and-worker-safe Base64 decoder for `AudioClipRef.env` (`Uint8Array` of 20 Hz RMS bytes `[0..255]`).
 * Uses no Node `Buffer`, no DOM globals, and zero type assertions.
 */
export function decodeSpeechEnvelope(envBase64: string | undefined): Uint8Array {
  if (!envBase64 || envBase64.length === 0) return new Uint8Array(0);
  const sextets: number[] = [];
  for (let i = 0; i < envBase64.length; i += 1) {
    const code = envBase64.charCodeAt(i);
    if (code === 61) break; // '=' padding
    if (code < 128) {
      const val = BASE64_LOOKUP[code] ?? -1;
      if (val >= 0) sextets.push(val);
    }
  }
  const byteLength = Math.floor((sextets.length * 3) / 4);
  if (byteLength <= 0) return new Uint8Array(0);
  const out = new Uint8Array(byteLength);
  let outIndex = 0;
  for (let i = 0; i + 1 < sextets.length && outIndex < byteLength; i += 4) {
    const a = sextets[i] ?? 0;
    const b = sextets[i + 1] ?? 0;
    const c = sextets[i + 2] ?? 0;
    const d = sextets[i + 3] ?? 0;
    out[outIndex] = ((a << 2) | (b >> 4)) & 0xff;
    outIndex += 1;
    if (outIndex < byteLength && i + 2 < sextets.length) {
      out[outIndex] = (((b & 0x0f) << 4) | (c >> 2)) & 0xff;
      outIndex += 1;
    }
    if (outIndex < byteLength && i + 3 < sextets.length) {
      out[outIndex] = (((c & 0x03) << 6) | d) & 0xff;
      outIndex += 1;
    }
  }
  return out;
}

/** Gentle deterministic syllable cadence used when `AudioClipRef.env` is absent (synthetic test clips / caption mode). */
export function fallbackSpeechEnvelopeAt(elapsedMs: number, durationMs = 0): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const sec = elapsedMs / 1000;
  const syllable = 0.5 * (1 - Math.cos(2 * Math.PI * 3.1 * sec));
  const phrase = 0.58 + 0.42 * Math.sin(2 * Math.PI * 0.85 * sec + 0.5);
  const fadeIn = Math.min(1, elapsedMs / 80);
  const fadeOut = durationMs > 120 ? Math.min(1, Math.max(0.12, (durationMs - elapsedMs) / 140)) : 1;
  const raw = (0.18 + 0.72 * syllable * phrase) * fadeIn * fadeOut;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/**
 * Samples a 20 Hz (`50 ms` step) RMS envelope smoothly in `[0, 1]` with linear interpolation
 * between consecutive 50 ms samples, falling back gracefully when `env` is absent.
 */
export function sampleSpeechEnvelope(
  env: Uint8Array | string | null | undefined,
  elapsedMs: number,
  durationMs = 0
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const bytes = typeof env === "string" ? decodeSpeechEnvelope(env) : env;
  if (bytes && bytes.length > 0) {
    const stepPos = elapsedMs / SPEECH_ENVELOPE_STEP_MS;
    const i0 = Math.floor(stepPos);
    if (i0 >= bytes.length) return 0;
    const i1 = Math.min(bytes.length - 1, i0 + 1);
    const frac = stepPos - i0;
    const v0 = (bytes[i0] ?? 0) / 255;
    const v1 = (bytes[i1] ?? 0) / 255;
    const interpolated = v0 + (v1 - v0) * frac;
    return interpolated < 0 ? 0 : interpolated > 1 ? 1 : interpolated;
  }
  return fallbackSpeechEnvelopeAt(elapsedMs, durationMs);
}

export interface SampledViseme {
  readonly viseme: VisemeCode;
  readonly openness: number;
}

/**
 * Samples a timed viseme track at `elapsedMs` (`tMs <= elapsedMs < endMs`).
 * Returns `null` when `visemes` is `undefined` so the 20 Hz RMS envelope fallback drives mouths;
 * returns `{ viseme: "rest", openness: 0 }` when `visemes` is defined and no cue covers `elapsedMs`.
 */
export function sampleVisemeTrack(
  visemes: readonly VisemeCue[] | undefined,
  elapsedMs: number
): SampledViseme | null {
  if (visemes === undefined) return null;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return { viseme: "rest", openness: 0 };
  for (let i = 0; i < visemes.length; i += 1) {
    const cue = visemes[i];
    if (cue && elapsedMs >= cue.tMs && elapsedMs < cue.endMs) {
      return { viseme: cue.viseme, openness: cue.openness };
    }
  }
  return { viseme: "rest", openness: 0 };
}

/** The part of the mixer the narration player uses. */
export type NarrationMixer = Pick<AudioMixer, "canPlayVoice" | "startVoice" | "duck" | "isPaused" | "onPauseChange">;

export interface NarrationPlayerOptions {
  readonly mixer: NarrationMixer;
  /** Recorded clip for a line key in the current locale, or undefined (caption timing). */
  readonly clip: (key: string) => AudioClipRef | undefined;
  /** Called synchronously when a line starts (show the caption, start the talking pulse). */
  readonly onStart: (line: LineRef) => void;
  /** Called once when a line finishes (send LINE_DONE). Never called for stopped lines. */
  readonly onEnd: (key: string) => void;
  /** Caption-only length of a line in ms. */
  readonly estimateMs: (key: string) => number;
  /** Current time in ms (any monotonic clock). */
  readonly now: () => number;
  /** Runs `fn` after `ms`; returns a cancel function. */
  readonly schedule: (fn: () => void, ms: number) => () => void;
}

/**
 * - `waiting`: played while paused; decides audio or caption on resume.
 * - `loading`: a recorded clip is being fetched/decoded (music already ducked).
 * - `audio`: the recorded clip is playing.
 * - `caption`: no audible clip; the line runs on caption timing.
 */
export type NarrationMode = "waiting" | "loading" | "audio" | "caption";

export interface NarrationTiming {
  readonly key: string;
  readonly speaker: SpeakerId;
  readonly mode: NarrationMode;
  readonly paused: boolean;
  /** Line time spent while not paused (ms). */
  readonly elapsedMs: number;
  /** Expected length (ms): the clip duration when audio plays, else the caption estimate. */
  readonly durationMs: number;
  /** Normalized 20 Hz syllable-envelope speech energy in `[0, 1]` (`0` while paused or waiting). */
  readonly speechEnergy: number;
  /** Sampled viseme cue when `clip.visemes` is defined, else `null` for RMS envelope fallback. */
  readonly viseme: SampledViseme | null;
}

export interface NarrationPlayer {
  /** Ends the current line (no onEnd for it) and starts `line`. */
  play(line: LineRef): void;
  /** Cancels the current line without onEnd. */
  stop(): void;
  /** Holds the player until resume(); the current line keeps its position. */
  pause(): void;
  /** Continues the held line from where it stopped. */
  resume(): void;
  /** Muted lines run on caption timing; muting mid-line keeps the line's remaining time. */
  setMuted(muted: boolean): void;
  current(): LineRef | null;
  /** Restarts the current line (or the last one) from the beginning. False when there is none. */
  replay(): boolean;
  timing(): NarrationTiming | null;
  /** Current 20 Hz syllable-envelope speech energy in `[0, 1]` (`0` when silent or paused). */
  speechEnergy(): number;
  /** Current sampled viseme cue when `clip.visemes` is defined, else `null`. */
  viseme(): SampledViseme | null;
  isPaused(): boolean;
  dispose(): void;
}

interface ActiveLine {
  readonly line: LineRef;
  readonly token: number;
  mode: NarrationMode;
  handle: VoiceHandle | null;
  envelope: Uint8Array | null;
  visemes: readonly VisemeCue[] | undefined;
  ducking: boolean;
  /** Active ms banked before the current running segment. */
  bankedMs: number;
  /** now() when the current running segment began; null while paused. */
  segmentStart: number | null;
  /** Active-time deadline (ms since the line began) at which the timer ends the line. */
  deadlineMs: number;
  /** Expected length for timing(); 0 until known. */
  lengthMs: number;
  cancelTimer: (() => void) | null;
}

function positiveMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function createNarrationPlayer(options: NarrationPlayerOptions): NarrationPlayer {
  const { mixer, now, schedule } = options;
  let active: ActiveLine | null = null;
  let lastLine: LineRef | null = null;
  let tokens = 0;
  let muted = false;
  let callerPaused = false;
  let mixerPaused = mixer.isPaused();
  let disposed = false;

  const unsubscribe = mixer.onPauseChange((paused) => {
    if (disposed) return;
    mixerPaused = paused;
    sync();
  });

  function isPaused(): boolean {
    return callerPaused || mixerPaused;
  }

  function estimate(key: string): number {
    let ms = Number.NaN;
    try {
      ms = options.estimateMs(key);
    } catch {
      ms = Number.NaN;
    }
    return Number.isFinite(ms) && ms >= 0 ? ms : FALLBACK_LINE_MS;
  }

  function rawClipFor(key: string): AudioClipRef | undefined {
    try {
      return options.clip(key);
    } catch {
      return undefined;
    }
  }

  function clipFor(key: string): AudioClipRef | undefined {
    if (muted) return undefined;
    return rawClipFor(key);
  }

  function elapsed(line: ActiveLine): number {
    return line.bankedMs + (line.segmentStart === null ? 0 : Math.max(0, now() - line.segmentStart));
  }

  function clearTimer(line: ActiveLine): void {
    const cancel = line.cancelTimer;
    line.cancelTimer = null;
    cancel?.();
  }

  /** (Re)arms the end timer for the line's deadline; nothing runs while paused. */
  function arm(line: ActiveLine): void {
    clearTimer(line);
    if (line.segmentStart === null) return;
    const wait = Math.max(0, line.deadlineMs - elapsed(line));
    line.cancelTimer = schedule(() => {
      line.cancelTimer = null;
      finish(line);
    }, wait);
  }

  function setDuck(line: ActiveLine, on: boolean): void {
    if (line.ducking === on) return;
    line.ducking = on;
    mixer.duck(on);
  }

  /** Lets go of a line without onEnd. */
  function release(line: ActiveLine): void {
    clearTimer(line);
    const handle = line.handle;
    line.handle = null;
    handle?.stop();
    setDuck(line, false);
    if (active === line) active = null;
  }

  function finish(line: ActiveLine): void {
    if (disposed || active !== line) return;
    release(line);
    options.onEnd(line.line.key);
  }

  /** Switches a line to caption timing with an active-time deadline. */
  function toCaption(line: ActiveLine, deadlineMs: number): void {
    const handle = line.handle;
    line.handle = null;
    handle?.stop();
    line.mode = "caption";
    line.deadlineMs = deadlineMs;
    line.lengthMs = deadlineMs;
    setDuck(line, false);
    arm(line);
  }

  /** Decides audio or caption for a running line and starts it. */
  function begin(line: ActiveLine): void {
    const key = line.line.key;
    const metaRef = muted ? rawClipFor(key) : clipFor(key);
    line.visemes = metaRef?.visemes;
    if (metaRef?.env) {
      const decoded = decodeSpeechEnvelope(metaRef.env);
      line.envelope = decoded.length > 0 ? decoded : null;
    } else {
      line.envelope = null;
    }
    const ref = muted ? undefined : metaRef;
    if (!ref || !mixer.canPlayVoice()) {
      toCaption(line, estimate(key));
      return;
    }
    const clipMs = positiveMs(ref.durationMs);
    line.mode = "loading";
    line.lengthMs = clipMs > 0 ? clipMs : estimate(key);
    line.deadlineMs = Math.max(line.lengthMs, estimate(key)) + SAFETY_MS;
    setDuck(line, true);
    arm(line);
    const token = line.token;
    let request: Promise<VoiceHandle | null>;
    // Asked by the mixer once the clip is ready: a line stopped, replaced, muted
    // or timed out meanwhile never sounds, and a paused one starts held.
    const intent = (): VoiceIntent => {
      if (disposed || active !== line || line.mode !== "loading") return "drop";
      return line.segmentStart === null ? "hold" : "play";
    };
    try {
      request = mixer.startVoice(
        ref,
        () => {
          if (active === line && line.mode === "audio") finish(line);
        },
        intent
      );
    } catch {
      toCaption(line, estimate(key));
      return;
    }
    request.then(
      (handle) => voiceReady(token, handle),
      () => voiceReady(token, null)
    );
  }

  function voiceReady(token: number, handle: VoiceHandle | null): void {
    const line = active;
    if (disposed || !line || line.token !== token || line.mode !== "loading") {
      handle?.stop();
      return;
    }
    if (!handle) {
      toCaption(line, estimate(line.line.key));
      return;
    }
    line.handle = handle;
    line.mode = "audio";
    line.lengthMs = handle.durationMs;
    // Re-base the safety deadline on when the clip really started.
    line.deadlineMs = elapsed(line) + Math.max(0, handle.durationMs - handle.positionMs()) + SAFETY_MS;
    if (line.segmentStart === null) handle.pause();
    arm(line);
  }

  /** Applies the player's pause state to the current line. */
  function sync(): void {
    const line = active;
    if (!line) return;
    if (isPaused()) {
      if (line.segmentStart === null) return;
      line.bankedMs = elapsed(line);
      line.segmentStart = null;
      clearTimer(line);
      line.handle?.pause();
      return;
    }
    if (line.segmentStart !== null) return;
    line.segmentStart = now();
    if (line.mode === "waiting") {
      begin(line);
      return;
    }
    line.handle?.resume();
    arm(line);
  }

  function play(line: LineRef): void {
    if (disposed) return;
    const previous = active;
    if (previous) release(previous);
    tokens += 1;
    const entry: ActiveLine = {
      line,
      token: tokens,
      mode: "waiting",
      handle: null,
      envelope: null,
      visemes: undefined,
      ducking: false,
      bankedMs: 0,
      segmentStart: isPaused() ? null : now(),
      deadlineMs: 0,
      lengthMs: 0,
      cancelTimer: null
    };
    active = entry;
    lastLine = line;
    try {
      options.onStart(line);
    } finally {
      // onStart may have stopped or replaced this line; a throwing onStart still lets the line end.
      if (!disposed && active === entry && entry.mode === "waiting" && entry.segmentStart !== null) begin(entry);
    }
  }

  return {
    play,

    stop(): void {
      const line = active;
      if (line) release(line);
    },

    pause(): void {
      if (disposed) return;
      callerPaused = true;
      sync();
    },

    resume(): void {
      if (disposed) return;
      callerPaused = false;
      sync();
    },

    setMuted(next: boolean): void {
      if (disposed || muted === next) return;
      muted = next;
      const line = active;
      if (!next || !line || (line.mode !== "audio" && line.mode !== "loading")) return;
      // Muting mid-line keeps the line's timing: the rest of the clip becomes caption time.
      const handle = line.handle;
      const deadline = handle
        ? elapsed(line) + Math.max(0, handle.durationMs - handle.positionMs())
        : estimate(line.line.key);
      toCaption(line, deadline);
    },

    current: () => active?.line ?? null,

    replay(): boolean {
      if (disposed) return false;
      const line = active?.line ?? lastLine;
      if (!line) return false;
      play(line);
      return true;
    },

    timing(): NarrationTiming | null {
      const line = active;
      if (!line) return null;
      const pausedNow = line.segmentStart === null;
      const elapsedMs = elapsed(line);
      const durationMs = line.lengthMs > 0 ? line.lengthMs : estimate(line.line.key);
      const handlePos = line.mode === "audio" && line.handle ? line.handle.positionMs() : 0;
      const sampleMs = handlePos > 0 ? handlePos : elapsedMs;
      const energy = pausedNow || line.mode === "waiting"
        ? 0
        : sampleSpeechEnvelope(line.envelope, sampleMs, durationMs);
      const viseme = line.visemes === undefined
        ? null
        : pausedNow || line.mode === "waiting"
          ? { viseme: "rest" as const, openness: 0 }
          : sampleVisemeTrack(line.visemes, sampleMs);
      return {
        key: line.line.key,
        speaker: line.line.speaker,
        mode: line.mode,
        paused: pausedNow,
        elapsedMs,
        durationMs,
        speechEnergy: energy,
        viseme
      };
    },

    speechEnergy(): number {
      const line = active;
      if (!line || line.segmentStart === null || line.mode === "waiting") return 0;
      const elapsedMs = elapsed(line);
      const durationMs = line.lengthMs > 0 ? line.lengthMs : estimate(line.line.key);
      const handlePos = line.mode === "audio" && line.handle ? line.handle.positionMs() : 0;
      const sampleMs = handlePos > 0 ? handlePos : elapsedMs;
      return sampleSpeechEnvelope(line.envelope, sampleMs, durationMs);
    },

    viseme(): SampledViseme | null {
      const line = active;
      if (!line || line.visemes === undefined) return null;
      if (line.segmentStart === null || line.mode === "waiting") {
        return { viseme: "rest", openness: 0 };
      }
      const elapsedMs = elapsed(line);
      const handlePos = line.mode === "audio" && line.handle ? line.handle.positionMs() : 0;
      const sampleMs = handlePos > 0 ? handlePos : elapsedMs;
      return sampleVisemeTrack(line.visemes, sampleMs);
    },

    isPaused,

    dispose(): void {
      if (disposed) return;
      const line = active;
      if (line) release(line);
      disposed = true;
      lastLine = null;
      unsubscribe();
    }
  };
}
