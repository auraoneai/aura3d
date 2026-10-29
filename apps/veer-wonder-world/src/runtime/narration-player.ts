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
import type { AudioClipRef, LineRef, SpeakerId } from "../types.js";
import type { AudioMixer, VoiceHandle, VoiceIntent } from "./audio-mixer.js";

/** Grace added to a recorded clip's remaining time before the safety timer ends the line. */
export const SAFETY_MS = 1500;

/** Caption time used when `estimateMs` gives no usable number (matches beat-runner's DEFAULT_LINE_MS). */
export const FALLBACK_LINE_MS = 2600;

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
  isPaused(): boolean;
  dispose(): void;
}

interface ActiveLine {
  readonly line: LineRef;
  readonly token: number;
  mode: NarrationMode;
  handle: VoiceHandle | null;
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

  function clipFor(key: string): AudioClipRef | undefined {
    if (muted) return undefined;
    try {
      return options.clip(key);
    } catch {
      return undefined;
    }
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
    const ref = clipFor(key);
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
      return {
        key: line.line.key,
        speaker: line.line.speaker,
        mode: line.mode,
        paused: line.segmentStart === null,
        elapsedMs: elapsed(line),
        durationMs: line.lengthMs > 0 ? line.lengthMs : estimate(line.line.key)
      };
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
