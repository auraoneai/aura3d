import type { AudioClip } from "./AudioClip";
import type { AudioContextLike } from "./AudioContextManager";

export type AudioSourceState = "idle" | "playing" | "paused" | "stopped";

export interface AudioSourceOptions {
  /** The context, destination and clip are borrowed; the source owns its gain and buffer nodes. */
  readonly context: AudioContextLike;
  readonly destination?: AudioNode;
  readonly clip?: AudioClip;
  readonly loop?: boolean;
  /** Seconds into the buffer. An end of zero means the clip's end, as in Web Audio. */
  readonly loopStart?: number;
  readonly loopEnd?: number;
  /** Playback pitch offset in cents. */
  readonly detune?: number;
  readonly volume?: number;
}

/** A reusable decoded-buffer voice. It does not own or close its context, destination or clip. */
export class AudioSource {
  clip?: AudioClip;
  readonly gain: GainNode;

  private stateRef: AudioSourceState = "idle";
  private node?: AudioBufferSourceNode;
  private activeClip?: AudioClip;
  private disposed = false;
  private loopRef: boolean;
  private loopStartRef: number;
  private loopEndRef: number;
  private playbackRateRef = 1;
  private detuneRef: number;
  private offsetSeconds = 0;
  /** Unconsumed buffer seconds of an active sprite; undefined means unrestricted. */
  private spriteRemaining?: number;
  private startedAt = 0;
  private anchorTime = 0;
  private activeStarted = false;
  private sourceStartOffset = 0;
  private loopEntered = false;
  // Resuming after the loop's end needs a non-looping node: Web Audio clamps
  // a looping node's start offset to loopEnd and would otherwise rewind it.
  private suppressLoopOnResume = false;
  private scheduledStop?: number;
  private rateStart = 1;
  private rateTarget = 1;
  private rateChangedAt = 0;
  private rateTimeConstant = 0;
  /** Whether the current node's rate parameter has a scheduled timeline. */
  private rateAutomated = false;

  constructor(private readonly options: AudioSourceOptions) {
    this.clip = options.clip;
    this.loopRef = options.loop ?? false;
    this.loopStartRef = options.loopStart ?? 0;
    this.loopEndRef = options.loopEnd ?? 0;
    validateLoop(this.loopStartRef, this.loopEndRef, this.clip?.duration);
    this.detuneRef = validateDetune(options.detune ?? 0);
    const volume = validateVolume(options.volume ?? 1);
    this.gain = options.context.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(options.destination ?? options.context.destination);
  }

  get state(): AudioSourceState {
    return this.stateRef;
  }

  get loop(): boolean { return this.loopRef; }
  set loop(value: boolean) {
    this.assertAlive();
    this.capture(this.options.context.currentTime);
    this.loopRef = value;
    this.suppressLoopOnResume = value && this.suppressLoopOnResume;
    if (!value) this.loopEntered = false;
    if (this.node) this.node.loop = value && !this.suppressLoopOnResume;
  }

  get loopStart(): number { return this.loopStartRef; }
  get loopEnd(): number { return this.loopEndRef; }

  /** Update the loop in buffer seconds; zero end selects the clip duration. */
  setLoopRegion(start: number, end = 0): void {
    this.assertAlive();
    validateLoop(start, end, (this.activeClip ?? this.clip)?.duration);
    this.capture(this.options.context.currentTime);
    this.loopStartRef = start;
    this.loopEndRef = end;
    if (this.node) {
      this.node.loopStart = start;
      this.node.loopEnd = end;
      if (this.suppressLoopOnResume && this.offsetSeconds < (end || this.activeClip?.duration || 0)) {
        this.suppressLoopOnResume = false;
        this.node.loop = this.loopRef;
      }
    }
  }

  /** Configured playback-rate target. Assigning it is equivalent to an immediate rate change. */
  get playbackRate(): number { return this.playbackRateRef; }
  set playbackRate(rate: number) { this.setPlaybackRate(rate); }

  /** Estimated continuous-clock position in buffer seconds, excluding render-quantum rounding. */
  get positionSeconds(): number {
    return this.positionAt(this.options.context.currentTime).position;
  }

  get detune(): number { return this.detuneRef; }
  set detune(cents: number) { this.setDetune(cents); }

  /** Apply detune in cents to the active voice and retain it for subsequent plays. */
  setDetune(cents: number): void {
    this.assertAlive();
    validateDetune(cents);
    if (this.node && !this.node.detune && cents !== 0) throw new Error("Audio context does not support source detune");
    this.capture(this.options.context.currentTime);
    this.detuneRef = cents;
    const param = this.node?.detune;
    if (param) param.value = cents;
  }

  /**
   * Ramps the running source with Web Audio's exponential target curve
   * (τ = rampMs/3). Position integrates that curve rather than assuming the
   * destination rate applied for the whole interval.
   */
  setPlaybackRate(rate: number, rampMs = 0): void {
    this.assertAlive();
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError("Audio source playback rate must be a positive finite number");
    }
    if (!Number.isFinite(rampMs) || rampMs < 0) throw new RangeError("Audio source rate ramp must be a non-negative finite number");
    const now = this.options.context.currentTime;
    this.capture(now);
    const currentRate = this.rateAt(now);
    const priorRamp = this.rateTimeConstant > 0;
    this.playbackRateRef = rate;
    const param = this.node?.playbackRate;
    if (param && priorRamp) {
      param.cancelScheduledValues?.(now);
    }
    if (param && rampMs > 0 && typeof param.setTargetAtTime === "function") {
      if (priorRamp) param.setValueAtTime?.(currentRate, now);
      this.rateStart = currentRate;
      this.rateTarget = rate;
      this.rateChangedAt = now;
      this.rateTimeConstant = rampMs / 3000;
      param.setTargetAtTime(rate, now, this.rateTimeConstant);
      this.rateAutomated = true;
    } else {
      this.rateStart = rate;
      this.rateTarget = rate;
      this.rateChangedAt = now;
      this.rateTimeConstant = 0;
      if (param) {
        // A past automation event continues to determine AudioParam's value;
        // assigning `.value` cannot reliably replace a running target curve.
        if (this.rateAutomated && typeof param.setValueAtTime === "function") param.setValueAtTime(rate, now);
        else param.value = rate;
      }
    }
  }

  /** `when` is an absolute AudioContext time; zero starts immediately. */
  play(when = 0): void {
    this.assertAlive();
    if (!this.clip) throw new Error("Cannot play an AudioSource without an AudioClip");
    if (!Number.isFinite(when) || when < 0) throw new RangeError("Audio source start time must be a non-negative finite number");
    validateLoop(this.loopStartRef, this.loopEndRef, this.clip.duration);
    const resumeRamp = this.stateRef === "paused" && this.rateTimeConstant > 0;
    const heldRate = resumeRamp ? this.rateStart : this.playbackRateRef;
    const heldTimeConstant = this.rateTimeConstant;
    const wasStarted = this.activeStarted;
    const wasInLoop = this.loopEntered;
    const source = this.options.context.createBufferSource();
    if (!source.detune && this.detuneRef !== 0) throw new Error("Audio context does not support source detune");
    this.stopNode();
    source.buffer = this.clip.buffer;
    const offset = Math.min(this.offsetSeconds, Math.max(0, this.clip.duration - Number.EPSILON));
    this.suppressLoopOnResume = this.stateRef === "paused" && wasStarted && this.loopRef && !wasInLoop &&
      offset >= (this.loopEndRef || this.clip.duration);
    source.loop = this.loopRef && !this.suppressLoopOnResume;
    source.loopStart = this.loopStartRef;
    source.loopEnd = this.loopEndRef;
    if (source.playbackRate) source.playbackRate.value = heldRate;
    if (source.detune) source.detune.value = this.detuneRef;
    source.connect(this.gain);
    const now = this.options.context.currentTime;
    this.startedAt = Math.max(now, when);
    this.anchorTime = now;
    this.offsetSeconds = offset;
    this.activeStarted = false;
    this.sourceStartOffset = offset;
    this.loopEntered = false;
    this.activeClip = this.clip;
    this.rateStart = heldRate;
    this.rateTarget = this.playbackRateRef;
    this.rateChangedAt = now;
    this.rateTimeConstant = resumeRamp && typeof source.playbackRate?.setTargetAtTime === "function" ? heldTimeConstant : 0;
    this.rateAutomated = this.rateTimeConstant > 0;
    if (this.rateTimeConstant > 0) source.playbackRate.setTargetAtTime(this.rateTarget, now, this.rateTimeConstant);
    else if (source.playbackRate) {
      source.playbackRate.value = this.playbackRateRef;
      this.rateStart = this.playbackRateRef;
    }
    this.scheduledStop = undefined;
    source.onended = () => {
      if (this.node !== source) return;
      this.node = undefined;
      this.rateAutomated = false;
      source.onended = null;
      source.disconnect();
      this.activeClip = undefined;
      this.scheduledStop = undefined;
      this.stateRef = "stopped";
      this.offsetSeconds = 0;
      this.spriteRemaining = undefined;
    };
    this.node = source;
    this.stateRef = "playing";
    try {
      if (this.spriteRemaining === undefined) source.start(when, offset);
      else source.start(when, offset, this.spriteRemaining);
    } catch (error) {
      source.onended = null;
      this.node = undefined;
      this.rateAutomated = false;
      this.activeClip = undefined;
      this.stateRef = "stopped";
      this.offsetSeconds = 0;
      this.spriteRemaining = undefined;
      // A failed start must not leave an owned connection or replace the
      // original start error with a secondary disconnect failure.
      try { source.disconnect(); } catch { /* preserve the start error */ }
      throw error;
    }
  }

  /** An immediate stop clears the position; a future stop remains connected until onended. */
  stop(when = 0): void {
    if (this.disposed) return;
    if (!Number.isFinite(when) || when < 0) throw new RangeError("Audio source stop time must be a non-negative finite number");
    if (this.node && when > this.options.context.currentTime) {
      const source = this.node;
      // Only change the estimated deadline after the native node accepts it.
      // A failed replacement must retain any previously accepted stop time.
      source.stop(when);
      if (this.node === source) this.scheduledStop = when;
      return;
    }
    try {
      this.stopNode();
    } finally {
      this.offsetSeconds = 0;
      this.spriteRemaining = undefined;
      if (this.stateRef !== "idle") this.stateRef = "stopped";
    }
  }

  pause(): void {
    this.assertAlive();
    if (!this.node || this.stateRef !== "playing") return;
    const now = this.options.context.currentTime;
    if (this.scheduledStop !== undefined && now >= this.scheduledStop) {
      this.stop();
      return;
    }
    this.capture(now);
    if (this.spriteRemaining === 0 || (this.activeClip && this.offsetSeconds >= this.activeClip.duration &&
        (!this.loopRef || !this.loopEntered))) {
      this.stop();
      return;
    }
    this.rateStart = this.rateAt(now);
    this.rateChangedAt = now;
    this.stopNode();
    this.stateRef = "paused";
  }

  resume(): void {
    this.assertAlive();
    if (this.stateRef === "paused") this.play();
  }

  playSprite(offsetSeconds: number, durationSeconds: number, when = 0): void {
    this.assertAlive();
    if (!this.clip) throw new Error("Cannot play an audio sprite without an AudioClip");
    if (!Number.isFinite(offsetSeconds) || offsetSeconds < 0 || offsetSeconds >= this.clip.duration) throw new RangeError("Audio sprite offset must fall within the clip duration");
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || offsetSeconds + durationSeconds > this.clip.duration) throw new RangeError("Audio sprite duration must be positive and remain within the clip");
    if (!Number.isFinite(when) || when < 0) throw new RangeError("Audio source start time must be a non-negative finite number");
    validateLoop(this.loopStartRef, this.loopEndRef, this.clip.duration);
    const oldOffset = this.offsetSeconds;
    const oldRemaining = this.spriteRemaining;
    const oldNode = this.node;
    const oldState = this.stateRef;
    this.offsetSeconds = offsetSeconds;
    this.spriteRemaining = durationSeconds;
    try { this.play(when); }
    catch (error) {
      // Validation or node creation can fail before the previous voice stops.
      if (this.node === oldNode && this.stateRef === oldState) {
        this.offsetSeconds = oldOffset;
        this.spriteRemaining = oldRemaining;
      }
      throw error;
    }
  }

  fade(from: number, to: number, durationSeconds: number): void {
    this.assertAlive();
    if (![from, to, durationSeconds].every(Number.isFinite) || from < 0 || to < 0 || durationSeconds < 0) throw new RangeError("Audio fade values must be finite and non-negative");
    const now = this.options.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(from, now);
    this.gain.gain.linearRampToValueAtTime(to, now + durationSeconds);
  }

  setVolume(value: number): void {
    this.assertAlive();
    validateVolume(value);
    // A direct AudioParam value write does not cancel scheduled fades. Make
    // this immediate setter authoritative over any earlier automation.
    const now = this.options.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(value, now);
  }

  dispose(): void {
    if (this.disposed) return;
    try {
      this.stop();
    } finally {
      this.disposed = true;
      this.gain.disconnect();
    }
  }

  private capture(now: number): void {
    if (this.stateRef !== "playing" || !this.node) return;
    const result = this.positionAt(now);
    this.offsetSeconds = result.position;
    if (this.spriteRemaining !== undefined) this.spriteRemaining = Math.max(0, this.spriteRemaining - result.consumed);
    this.activeStarted = result.started;
    this.sourceStartOffset = result.startOffset;
    this.loopEntered = result.loopEntered;
    this.anchorTime = now;
  }

  private positionAt(now: number): { position: number; consumed: number; started: boolean; startOffset: number; loopEntered: boolean } {
    const unchanged = () => ({ position: this.offsetSeconds, consumed: 0, started: this.activeStarted, startOffset: this.sourceStartOffset, loopEntered: this.loopEntered });
    if (this.stateRef !== "playing" || !this.node || !this.activeClip) return unchanged();
    const end = Math.min(now, this.scheduledStop ?? Infinity);
    if (end < this.startedAt || (this.scheduledStop !== undefined && this.scheduledStop <= this.startedAt)) return unchanged();
    const duration = this.activeClip.duration;
    const loopEnd = this.loopEndRef || duration;
    const looping = this.loopRef && !this.suppressLoopOnResume;
    let started = this.activeStarted;
    let startOffset = this.sourceStartOffset;
    let offset = this.offsetSeconds;
    if (!started) {
      // Web Audio clamps an initial offset beyond the loop to loopEnd. Such
      // playback has not entered the loop and continues toward the buffer end.
      if (looping && offset >= loopEnd) offset = loopEnd;
      startOffset = offset;
      started = true;
    }
    const start = Math.max(this.anchorTime, this.startedAt);
    const elapsed = end > start ? this.integratedRate(start, end) * Math.pow(2, this.detuneRef / 1200) : 0;
    const available = Math.min(elapsed, this.spriteRemaining ?? Infinity);
    let loopEntered = looping && this.loopEntered;
    if (looping && !loopEntered) {
      const next = offset + available;
      loopEntered = (startOffset < loopEnd && next >= this.loopStartRef) ||
        (startOffset >= loopEnd && next < loopEnd);
    }
    const remainingClip = loopEntered ? Infinity : Math.max(0, duration - offset);
    const consumed = Math.min(available, remainingClip);
    let position = offset + consumed;
    if (loopEntered && loopEnd > this.loopStartRef && (position >= loopEnd || position < this.loopStartRef)) {
      const length = loopEnd - this.loopStartRef;
      position = this.loopStartRef + (((position - this.loopStartRef) % length + length) % length);
    } else {
      position = Math.min(duration, position);
    }
    return { position, consumed, started, startOffset, loopEntered };
  }

  private rateAt(time: number): number {
    if (this.rateTimeConstant <= 0 || time <= this.rateChangedAt) return this.rateStart;
    return this.rateTarget + (this.rateStart - this.rateTarget) * Math.exp(-(time - this.rateChangedAt) / this.rateTimeConstant);
  }

  private integratedRate(start: number, end: number): number {
    if (this.rateTimeConstant <= 0) return (end - start) * this.rateTarget;
    const tau = this.rateTimeConstant;
    const before = Math.max(0, Math.min(end, this.rateChangedAt) - start) * this.rateStart;
    const from = Math.max(start, this.rateChangedAt);
    if (end <= from) return before;
    return before + this.rateTarget * (end - from) + (this.rateStart - this.rateTarget) * tau *
      (Math.exp(-(from - this.rateChangedAt) / tau) - Math.exp(-(end - this.rateChangedAt) / tau));
  }

  private stopNode(): void {
    if (!this.node) return;
    const source = this.node;
    this.node = undefined;
    this.rateAutomated = false;
    this.activeClip = undefined;
    this.scheduledStop = undefined;
    source.onended = null;
    try { source.stop(); } finally { source.disconnect(); }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Cannot use a disposed AudioSource");
  }
}

function validateLoop(start: number, end: number, duration?: number): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || (end !== 0 && end <= start) ||
      (duration !== undefined && (start > duration || end > duration || (start === duration && duration > 0)))) {
    throw new RangeError("Audio loop region must be ordered and lie within the clip");
  }
}

function validateDetune(cents: number): number {
  const factor = Math.pow(2, cents / 1200);
  if (!Number.isFinite(cents) || !Number.isFinite(factor) || factor <= 0) throw new RangeError("Audio detune must yield a finite positive playback ratio");
  return cents;
}

function validateVolume(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Audio source volume must be a non-negative finite number");
  return value;
}
