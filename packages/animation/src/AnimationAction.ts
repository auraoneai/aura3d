import { AnimationClip } from "./AnimationClip.js";
import { collectAnimationEvents, DEFAULT_MAX_ANIMATION_EVENTS, MAX_ANIMATION_EVENT_CATCH_UP, type AnimationEvent } from "./AnimationEvents.js";
import { AnimationTrack } from "./AnimationTrack.js";

export type LoopMode = "once" | "repeat" | "pingpong";

export type AnimationActionSnapshot = {
  readonly clipName: string;
  readonly duration: number;
  readonly time: number;
  readonly weight: number;
  readonly timeScale: number;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly loopMode: LoopMode;
  /**
   * Playback details are included for inspection. Use `serialize()` rather than
   * `snapshot()` when the result must be restored: serialization also verifies
   * and records the complete clip identity.
   */
  readonly state?: {
    readonly version: 1;
    readonly clipIdentity?: string;
    /** `null` represents unlimited repetitions in JSON. */
    readonly repetitions: number | null;
    readonly clampWhenFinished: boolean;
    readonly maxEventCatchUp: number;
    readonly pingPongForward: boolean;
    readonly loopsCompleted: number;
    readonly fade: { readonly duration: number; readonly elapsed: number; readonly startWeight: number; readonly targetWeight: number } | null;
    readonly warp: { readonly duration: number; readonly elapsed: number; readonly from: number; readonly to: number } | null;
    readonly lastPlaybackDelta: number;
    readonly signals: {
      readonly loopDelta: number;
      readonly finishedDirection: -1 | 0 | 1;
      /** `null` represents an unrepresentably large event overflow. */
      readonly eventOverflow: number | null;
    };
  };
  /** Optional derived field used by the glTF binding; it is not an enabled flag. */
  readonly active?: boolean;
};

/**
 * Playback signals an {@link AnimationAction} produced during `update` and that
 * the owning {@link AnimationMixer} drains to fire its `loop`/`finished`
 * events (three's `AnimationMixer` event contract). `loopDelta` is signed by
 * playback direction; `finishedDirection` is `0` while the action still runs.
 */
export type AnimationActionPlaybackSignals = {
  readonly loopDelta: number;
  readonly finishedDirection: -1 | 0 | 1;
  /** Marker occurrences omitted because the per-update catch-up limit was reached. */
  readonly eventOverflow: number;
};

type WarpSegment = {
  readonly distance: number;
  readonly duration: number;
  readonly elapsed: number;
  readonly from: number;
  readonly to: number;
  readonly inWarp: boolean;
};

export class AnimationAction {
  readonly clip: AnimationClip;
  time = 0;
  weight = 1;
  /**
   * Signed playback-rate multiplier. Negative values play the clip backwards —
   * three's `action.timeScale = -1` semantics (SA-01). Repeat loops wrap at the
   * start boundary, `once` finishes at time 0 with direction `-1`, and pingpong
   * bounces at both ends.
   */
  timeScale = 1;
  loopMode: LoopMode = "repeat";
  /**
   * Number of clip wraps the action performs before finishing (three's
   * `action.repetitions`). `Infinity` loops forever; `once` mode always
   * finishes after a single pass regardless of this value.
   */
  repetitions = Infinity;
  /**
   * When `true` (three's `clampWhenFinished`), finishing pauses the action with
   * `time` clamped to the boundary it crossed instead of stopping it, so the
   * last evaluated pose persists for blending.
   */
  clampWhenFinished = false;
  playing = false;
  paused = false;
  /** Maximum marker callbacks produced by one update. Excess is reported in playback signals. */
  maxEventCatchUp = DEFAULT_MAX_ANIMATION_EVENTS;
  /** Signed unwrapped clip-time distance actually traveled by the last update. */
  lastPlaybackDelta = 0;
  private pingPongForward = true;
  private loopsCompleted = 0;
  private signalLoopDelta = 0;
  private signalFinishedDirection: -1 | 0 | 1 = 0;
  private signalEventOverflow = 0;
  private fadeDuration = 0;
  private fadeElapsed = 0;
  private fadeStartWeight = 1;
  private fadeTargetWeight = 1;
  private warpState: { duration: number; elapsed: number; from: number; to: number } | null = null;

  constructor(clip: AnimationClip) {
    this.clip = clip;
  }

  play(): this {
    if (this.clip.duration === 0) {
      console.warn(`AnimationAction.play: clip "${this.clip.name}" has zero duration; update will emit no samples or events.`);
    } else if (this.clip.tracks.length === 0) {
      console.warn(`AnimationAction.play: clip "${this.clip.name}" has no tracks; update will emit events but apply no values.`);
    }
    if (!this.playing && !this.paused) {
      // Restarting a stopped or finished action (three's _activateAction → _reset).
      this.time = 0;
      this.pingPongForward = true;
      this.loopsCompleted = 0;
      this.signalLoopDelta = 0;
      this.signalFinishedDirection = 0;
      this.signalEventOverflow = 0;
    }
    this.playing = true;
    this.paused = false;
    return this;
  }

  pause(): this {
    if (!this.playing) {
      console.warn(`AnimationAction.pause: action for clip "${this.clip.name}" is not playing; nothing to pause.`);
    }
    this.paused = true;
    return this;
  }

  stop(): this {
    this.playing = false;
    this.paused = false;
    this.time = 0;
    this.pingPongForward = true;
    this.loopsCompleted = 0;
    this.lastPlaybackDelta = 0;
    this.signalLoopDelta = 0;
    this.signalFinishedDirection = 0;
    this.signalEventOverflow = 0;
    this.fadeDuration = 0;
    this.warpState = null;
    return this;
  }

  setWeight(weight: number): this {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error("AnimationAction weight must be finite and non-negative.");
    }
    this.weight = weight;
    return this;
  }

  setTimeScale(timeScale: number): this {
    if (!Number.isFinite(timeScale)) {
      throw new Error("AnimationAction timeScale must be finite.");
    }
    this.timeScale = timeScale;
    return this;
  }

  /**
   * three's `setLoop(mode, repetitions)`: sets the wrap mode and, when
   * provided, how many boundary crossings the action performs before emitting
   * `finished`. `once` ignores `repetitions` (a single pass by definition);
   * `repeat`/`pingpong` default to `Infinity`.
   */
  setLoop(loopMode: LoopMode, repetitions?: number): this {
    if (loopMode !== "once" && loopMode !== "repeat" && loopMode !== "pingpong") {
      throw new Error(`AnimationAction.setLoop: unknown loop mode ${String(loopMode)}.`);
    }
    if (repetitions !== undefined) {
      if (!(repetitions === Infinity) && (!Number.isFinite(repetitions) || repetitions < 0)) {
        throw new Error(`AnimationAction.setLoop: repetitions must be a non-negative number or Infinity, got ${repetitions}.`);
      }
      this.repetitions = repetitions;
    }
    this.loopMode = loopMode;
    return this;
  }

  reset(): this {
    this.time = 0;
    this.paused = false;
    this.pingPongForward = true;
    this.loopsCompleted = 0;
    this.signalLoopDelta = 0;
    this.signalFinishedDirection = 0;
    this.signalEventOverflow = 0;
    this.lastPlaybackDelta = 0;
    return this;
  }

  /** Copy the phase and reflected direction of another action, optionally scaling its phase. */
  synchronizePlayback(other: AnimationAction, normalized = false): this {
    if (!(other instanceof AnimationAction)) throw new Error("AnimationAction.synchronizePlayback: expected an AnimationAction.");
    this.time = normalized
      ? (other.clip.duration > 0 ? other.time / other.clip.duration * this.clip.duration : 0)
      : Math.min(other.time, this.clip.duration);
    this.pingPongForward = other.pingPongForward;
    this.loopsCompleted = other.loopsCompleted;
    this.timeScale = other.timeScale;
    this.warpState = null;
    return this;
  }

  seek(time: number): this {
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("AnimationAction.seek: time must be finite and non-negative.");
    }
    const clamped = this.clip.duration > 0 ? Math.min(time, this.clip.duration) : 0;
    if (this.clip.duration > 0 && time > this.clip.duration) {
      console.warn(`AnimationAction.seek: time ${time} exceeds clip "${this.clip.name}" duration ${this.clip.duration}; clamped to the duration.`);
    }
    this.time = clamped;
    return this;
  }

  fadeTo(weight: number, duration: number): this {
    if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(weight) || weight < 0) {
      throw new Error("AnimationAction fade target and duration must be valid.");
    }
    this.fadeStartWeight = this.weight;
    this.fadeTargetWeight = weight;
    this.fadeDuration = duration;
    this.fadeElapsed = 0;
    if (duration === 0) {
      this.weight = weight;
    }
    return this;
  }

  /** Linearly interpolate the signed playback rate over unpaused mixer time. */
  warp(startTimeScale: number, endTimeScale: number, duration: number): this {
    if (![startTimeScale, endTimeScale, duration].every(Number.isFinite) ||
        !Number.isFinite(endTimeScale - startTimeScale) || duration < 0) {
      throw new Error("AnimationAction.warp: rates and duration must be finite, and duration must be non-negative.");
    }
    if (duration === 0) {
      this.warpState = null;
      this.timeScale = endTimeScale;
    } else {
      this.warpState = { duration, elapsed: 0, from: startTimeScale, to: endTimeScale };
    }
    return this;
  }

  /** @internal Convert travel through a monotonic linear-rate segment to mixer time. */
  static consumedWarpDuration(
    segment: Pick<WarpSegment, "distance" | "duration" | "from" | "to">,
    travelled: number
  ): number {
    return consumedWarpDuration(segment, travelled);
  }

  /**
   * Advances playback by `delta` seconds scaled by `timeScale` (signed — a
   * negative product reverses the playhead) and returns the clip marker events
   * crossed. Loop boundaries the action wraps across are recorded for the
   * mixer to consume via {@link consumePlaybackSignals}; when `repetitions` is
   * exhausted or a `once` action reaches its end boundary the action finishes:
   * with `clampWhenFinished` it pauses clamped to that boundary (the last pose
   * keeps blending), otherwise it stops.
   */
  update(delta: number): readonly AnimationEvent[] {
    if (!Number.isFinite(delta)) {
      throw new Error("AnimationAction.update: delta must be finite.");
    }
    if (!Number.isFinite(this.weight) || this.weight < 0) {
      throw new Error("AnimationAction.update: weight must be finite and non-negative; call AnimationAction.setWeight with a valid value.");
    }
    if (!Number.isFinite(this.timeScale)) {
      throw new Error("AnimationAction.update: timeScale must be finite; call AnimationAction.setTimeScale with a valid value.");
    }
    if (this.playing && this.fadeDuration > 0) {
      this.fadeElapsed = Math.min(this.fadeDuration, this.fadeElapsed + Math.abs(delta));
      const t = this.fadeElapsed / this.fadeDuration;
      this.weight = this.fadeStartWeight + (this.fadeTargetWeight - this.fadeStartWeight) * t;
      if (this.fadeElapsed === this.fadeDuration) {
        this.fadeDuration = 0;
      }
    }
    this.lastPlaybackDelta = 0;
    if (!this.playing || this.paused || this.clip.duration === 0) {
      return [];
    }
    if (!Number.isSafeInteger(this.maxEventCatchUp) || this.maxEventCatchUp < 0 || this.maxEventCatchUp > MAX_ANIMATION_EVENT_CATCH_UP) throw new Error(`AnimationAction.update: maxEventCatchUp must be an integer from 0 to ${MAX_ANIMATION_EVENT_CATCH_UP}.`);
    const warp = this.warpState;
    if (!warp) {
      const scaledDelta = delta * this.timeScale;
      if (!Number.isFinite(scaledDelta)) throw new Error("AnimationAction.update: scaled delta must be finite.");
      return scaledDelta === 0 ? [] : this.advancePlayback(scaledDelta, this.maxEventCatchUp);
    }
    const segments = AnimationAction.warpSegments(delta, warp);
    const events: AnimationEvent[] = [];
    for (const segment of segments) {
      if (!this.playing || this.paused) break;
      const previousDelta = this.lastPlaybackDelta;
      if (segment.distance !== 0) {
        for (const event of this.advancePlayback(segment.distance, this.maxEventCatchUp - events.length)) events.push(event);
      }
      const finished = !this.playing || this.paused;
      if (segment.inWarp) {
        const consumed = finished
          ? consumedWarpDuration(segment, Math.abs(this.lastPlaybackDelta - previousDelta))
          : segment.duration;
        warp.elapsed = Math.min(warp.duration, segment.elapsed + consumed);
        if (warp.elapsed === warp.duration) {
          this.timeScale = warp.to;
          this.warpState = null;
        }
      }
      if (finished) break;
    }
    if (this.warpState === null && warp.to === 0 && this.playing) this.paused = true;
    return events;
  }

  /** @internal Integrate monotonic parts separately so a rate reversal retains marker crossings. */
  static warpSegments(
    delta: number,
    warp: { readonly duration: number; readonly elapsed: number; readonly from: number; readonly to: number }
  ): WarpSegment[] {
    const amount = Math.abs(delta);
    const span = Math.min(amount, warp.duration - warp.elapsed);
    const endElapsed = warp.elapsed + span;
    const rateAt = (elapsed: number): number => warp.from + (warp.to - warp.from) * (elapsed / warp.duration);
    const startRate = rateAt(warp.elapsed);
    const endRate = rateAt(endElapsed);
    const direction = delta < 0 ? -1 : 1;
    const segments: WarpSegment[] = [];
    const add = (elapsed: number, duration: number, from: number, to: number, inWarp: boolean): void => {
      const distance = direction * duration * (from / 2 + to / 2);
      if (!Number.isFinite(distance)) throw new Error("AnimationAction.update: warped playback span must be finite.");
      segments.push({ elapsed, duration, from, to, inWarp, distance });
    };
    if ((startRate < 0 && endRate > 0) || (startRate > 0 && endRate < 0)) {
      const firstSpan = span * (-startRate / (endRate - startRate));
      add(warp.elapsed, firstSpan, startRate, 0, true);
      add(warp.elapsed + firstSpan, span - firstSpan, 0, endRate, true);
    } else {
      add(warp.elapsed, span, startRate, endRate, true);
    }
    if (endElapsed === warp.duration) {
      add(warp.duration, amount - span, warp.to, warp.to, false);
    }
    return segments;
  }

  private advancePlayback(scaledDelta: number, maxEvents: number): readonly AnimationEvent[] {
    const previous = this.time;
    const duration = this.clip.duration;
    if (!Number.isFinite(previous) || previous < 0 || previous > duration) throw new Error("AnimationAction.update: time must be finite and within the clip duration.");
    if (this.loopMode !== "once" && this.loopMode !== "repeat" && this.loopMode !== "pingpong") throw new Error("AnimationAction.update: unknown loop mode.");
    if (this.repetitions !== Infinity && (!Number.isFinite(this.repetitions) || this.repetitions < 0)) throw new Error("AnimationAction.update: repetitions must be non-negative or Infinity.");
    const sign = scaledDelta > 0 ? 1 : -1;
    const direction = this.loopMode === "pingpong" && !this.pingPongForward ? -sign : sign;
    const phase = this.loopMode === "pingpong" && !this.pingPongForward ? 2 * duration - previous : previous;
    let distance = Math.abs(scaledDelta);
    const first = direction > 0 ? duration - previous : previous;
    // Repeated decimal frame intervals often land one ulp below a boundary.
    // Normalize only within floating-point rounding error of that boundary.
    const nearest = first + Math.round((distance - first) / duration) * duration;
    const tolerance = Math.min(duration * 1e-12, 8 * Number.EPSILON * Math.max(duration, distance, Math.abs(previous), Number.MIN_VALUE));
    if (nearest >= 0 && Number.isFinite(nearest) && Math.abs(distance - nearest) <= tolerance) distance = nearest;
    const available = this.loopMode === "once" ? 1 : Math.max(1, Math.ceil(this.repetitions - this.loopsCompleted));
    let crossings = 0;
    if (this.loopMode === "repeat" && sign < 0) {
      // The reverse seam is entered when moving past zero; arriving exactly at
      // zero leaves that endpoint visible until the next update.
      if (distance > first) crossings = Math.ceil((distance - first) / duration);
      // A finite action must nevertheless finish as soon as it reaches its
      // final boundary. Waiting for seam entry would leave it playing at zero
      // until a subsequent nonzero update and defer the finished signal.
      if (available !== Infinity && distance >= first) {
        const arrivals = 1 + Math.floor((distance - first) / duration);
        if (arrivals >= available) crossings = available;
      }
    } else if (distance >= first) {
      crossings = 1 + Math.floor((distance - first) / duration);
    }
    const finished = crossings > 0 && crossings >= available;
    if (finished) crossings = available;
    if (!Number.isSafeInteger(crossings)) throw new Error("AnimationAction.update: playback crosses more than the safe boundary count.");
    const travelled = finished ? first + (crossings - 1) * duration : distance;
    if (!Number.isSafeInteger(this.loopsCompleted + crossings) || !Number.isFinite(phase) ||
        !Number.isFinite(phase + sign * travelled) || (this.loopMode === "pingpong" && !Number.isFinite(2 * duration))) {
      throw new Error("AnimationAction.update: playback span exceeds the supported numeric range.");
    }
    this.lastPlaybackDelta += sign * travelled;
    let next = previous + direction * travelled;
    if (crossings > 0) {
      const tail = finished ? 0 : travelled - first - (crossings - 1) * duration;
      if (this.loopMode === "pingpong") {
        const odd = crossings % 2 === 1;
        const boundary = direction > 0 ? (odd ? duration : 0) : (odd ? 0 : duration);
        next = boundary + (odd ? -direction : direction) * tail;
        if (odd && !finished) this.pingPongForward = !this.pingPongForward;
      } else {
        const boundary = direction > 0 ? duration : 0;
        next = finished ? boundary : (direction > 0 ? 0 : duration) + direction * tail;
      }
      this.signalLoopDelta += sign * (crossings - (finished ? 1 : 0));
      this.loopsCompleted += crossings;
    }
    this.time = Math.max(0, Math.min(duration, next));
    if (finished) this.finish(sign);
    const traversal = collectAnimationEvents(
      this.clip.events, this.clip.name, phase, phase + sign * travelled, duration,
      this.loopMode, this.loopsCompleted - crossings + (this.loopMode === "pingpong" && first === 0 && crossings > 0 && !finished ? 1 : 0),
      maxEvents, finished
    );
    this.signalEventOverflow += traversal.overflow;
    return traversal.events;
  }

  /**
   * Drains the `loop`/`finished` signals accumulated by the last `update`. The
   * owning {@link AnimationMixer} calls this once per update per action; direct
   * `AnimationAction` users may drain it themselves to observe the same
   * transitions without a mixer.
   */
  consumePlaybackSignals(): AnimationActionPlaybackSignals {
    const signals: AnimationActionPlaybackSignals = {
      loopDelta: this.signalLoopDelta,
      finishedDirection: this.signalFinishedDirection,
      eventOverflow: this.signalEventOverflow
    };
    this.signalLoopDelta = 0;
    this.signalFinishedDirection = 0;
    this.signalEventOverflow = 0;
    return signals;
  }

  private finish(direction: -1 | 1): void {
    this.signalFinishedDirection = direction;
    if (this.clampWhenFinished) {
      this.paused = true;
    } else {
      this.playing = false;
    }
  }

  snapshot(): AnimationActionSnapshot {
    return {
      clipName: this.clip.name,
      duration: this.clip.duration,
      time: this.time,
      weight: this.weight,
      timeScale: this.timeScale,
      playing: this.playing,
      paused: this.paused,
      loopMode: this.loopMode,
      state: {
        version: 1,
        repetitions: this.repetitions === Infinity ? null : this.repetitions,
        clampWhenFinished: this.clampWhenFinished,
        maxEventCatchUp: this.maxEventCatchUp,
        pingPongForward: this.pingPongForward,
        loopsCompleted: this.loopsCompleted,
        fade: this.fadeDuration > 0 ? {
          duration: this.fadeDuration, elapsed: this.fadeElapsed,
          startWeight: this.fadeStartWeight, targetWeight: this.fadeTargetWeight
        } : null,
        warp: this.warpState ? { ...this.warpState } : null,
        lastPlaybackDelta: this.lastPlaybackDelta,
        signals: {
          loopDelta: this.signalLoopDelta,
          finishedDirection: this.signalFinishedDirection,
          eventOverflow: this.signalEventOverflow === Infinity ? null : this.signalEventOverflow
        }
      }
    };
  }

  /**
   * Capture a JSON-safe, restorable action state. The identity covers the full
   * clip, including keyframes, interpolation and event payloads; custom clip
   * implementations and non-JSON event payloads cannot be silently dropped.
   */
  serialize(): AnimationActionSnapshot {
    const snapshot = this.snapshot();
    const serialized: AnimationActionSnapshot = {
      ...snapshot,
      state: { ...snapshot.state!, clipIdentity: animationClipIdentity(this.clip) }
    };
    parseActionSnapshot(serialized, this.clip);
    rejectActionNegativeZero(serialized);
    return serialized;
  }

  /**
   * Restore in place without calling `play()`, emitting events, or applying a
   * pose. Pre-versioned snapshots retain their fields but start with unlimited
   * repetitions, forward reflection, no transition and no pending signals.
   */
  restore(snapshot: AnimationActionSnapshot): this {
    const parsed = parseActionSnapshot(snapshot, this.clip);
    this.time = parsed.time;
    this.weight = parsed.weight;
    this.timeScale = parsed.timeScale;
    this.playing = parsed.playing;
    this.paused = parsed.paused;
    this.loopMode = parsed.loopMode;
    this.repetitions = parsed.repetitions;
    this.clampWhenFinished = parsed.clampWhenFinished;
    this.maxEventCatchUp = parsed.maxEventCatchUp;
    this.pingPongForward = parsed.pingPongForward;
    this.loopsCompleted = parsed.loopsCompleted;
    this.fadeDuration = parsed.fade?.duration ?? 0;
    this.fadeElapsed = parsed.fade?.elapsed ?? 0;
    this.fadeStartWeight = parsed.fade?.startWeight ?? parsed.weight;
    this.fadeTargetWeight = parsed.fade?.targetWeight ?? parsed.weight;
    this.warpState = parsed.warp ? { ...parsed.warp } : null;
    this.lastPlaybackDelta = parsed.lastPlaybackDelta;
    this.signalLoopDelta = parsed.signals.loopDelta;
    this.signalFinishedDirection = parsed.signals.finishedDirection;
    this.signalEventOverflow = parsed.signals.eventOverflow;
    return this;
  }
}

type RestoredAction = {
  time: number; weight: number; timeScale: number; playing: boolean; paused: boolean; loopMode: LoopMode;
  repetitions: number; clampWhenFinished: boolean; maxEventCatchUp: number; pingPongForward: boolean;
  loopsCompleted: number;
  fade: { duration: number; elapsed: number; startWeight: number; targetWeight: number } | null;
  warp: { duration: number; elapsed: number; from: number; to: number } | null;
  lastPlaybackDelta: number;
  signals: { loopDelta: number; finishedDirection: -1 | 0 | 1; eventOverflow: number };
};

function rejectActionNegativeZero(value: unknown): void {
  if (typeof value === "number" && Object.is(value, -0)) {
    throw new Error("AnimationAction.serialize: negative zero cannot round-trip through JSON.");
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) rejectActionNegativeZero(nested);
  }
}

/** Invert the integral of a monotonic linear rate on one warp segment. */
function consumedWarpDuration(segment: Pick<WarpSegment, "distance" | "duration" | "from" | "to">, travelled: number): number {
  const total = Math.abs(segment.distance);
  if (total === 0) return segment.duration;
  const ratio = Math.min(1, Math.max(0, travelled / total));
  if (ratio === 0) return 0;
  if (ratio >= 1 - 8 * Number.EPSILON) return segment.duration;
  const scale = Math.max(Math.abs(segment.from), Math.abs(segment.to));
  const from = Math.abs(segment.from) / scale;
  const to = Math.abs(segment.to) / scale;
  const area = ratio * (from / 2 + to / 2);
  const denominator = from + Math.sqrt(Math.max(0, from * from + 2 * (to - from) * area));
  const fraction = denominator === 0 ? 0 : 2 * area / denominator;
  return segment.duration * Math.max(0, Math.min(1, fraction));
}

function actionRecord(value: unknown, label: string, allowed: readonly string[], required: readonly string[] = allowed): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`AnimationAction.restore: ${label} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(descriptors).some(key =>
    !allowed.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error(`AnimationAction.restore: ${label} contains unsupported fields or callbacks.`);
  }
  if (required.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key))) {
    throw new Error(`AnimationAction.restore: ${label} is missing required fields.`);
  }
  return value as Record<string, unknown>;
}

function actionNumber(value: unknown, label: string, minimum = -Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`AnimationAction.restore: ${label} must be a finite number${minimum === 0 ? " >= 0" : ""}.`);
  }
  return value;
}

function actionBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`AnimationAction.restore: ${label} must be boolean.`);
  return value;
}

function parseActionSnapshot(input: AnimationActionSnapshot, clip: AnimationClip): RestoredAction {
  const baseKeys = ["clipName", "duration", "time", "weight", "timeScale", "playing", "paused", "loopMode"];
  const inputRecord = actionRecord(input, "snapshot", [...baseKeys, "state", "active"], baseKeys);
  if (inputRecord.clipName !== clip.name || inputRecord.duration !== clip.duration) {
    throw new Error("AnimationAction.restore: clip name and duration must match.");
  }
  const time = actionNumber(inputRecord.time, "time", 0);
  if (time > clip.duration) throw new Error("AnimationAction.restore: time exceeds clip duration.");
  const weight = actionNumber(inputRecord.weight, "weight", 0);
  const timeScale = actionNumber(inputRecord.timeScale, "timeScale");
  const playing = actionBoolean(inputRecord.playing, "playing");
  const paused = actionBoolean(inputRecord.paused, "paused");
  const loopMode = inputRecord.loopMode;
  if (loopMode !== "once" && loopMode !== "repeat" && loopMode !== "pingpong") throw new Error("AnimationAction.restore: invalid loop mode.");
  if ("active" in inputRecord && (typeof inputRecord.active !== "boolean" || inputRecord.active !== (playing && !paused && weight > 0))) {
    throw new Error("AnimationAction.restore: active must agree with playback state.");
  }
  const base: RestoredAction = {
    time, weight, timeScale, playing, paused, loopMode, repetitions: Infinity, clampWhenFinished: false,
    maxEventCatchUp: DEFAULT_MAX_ANIMATION_EVENTS, pingPongForward: true, loopsCompleted: 0,
    fade: null, warp: null, lastPlaybackDelta: 0,
    signals: { loopDelta: 0, finishedDirection: 0, eventOverflow: 0 }
  };
  if (!("state" in inputRecord)) return base;
  const state = actionRecord(inputRecord.state, "state", [
    "version", "clipIdentity", "repetitions", "clampWhenFinished", "maxEventCatchUp", "pingPongForward",
    "loopsCompleted", "fade", "warp", "lastPlaybackDelta", "signals"
  ]);
  if (state.version !== 1) throw new Error("AnimationAction.restore: unsupported state version.");
  if (typeof state.clipIdentity !== "string" || state.clipIdentity !== animationClipIdentity(clip)) {
    throw new Error("AnimationAction.restore: clip identity does not match; use serialize() for restorable snapshots.");
  }
  base.repetitions = state.repetitions === null ? Infinity : actionNumber(state.repetitions, "repetitions", 0);
  base.clampWhenFinished = actionBoolean(state.clampWhenFinished, "clampWhenFinished");
  base.pingPongForward = actionBoolean(state.pingPongForward, "pingPongForward");
  base.maxEventCatchUp = actionNumber(state.maxEventCatchUp, "maxEventCatchUp", 0);
  if (!Number.isSafeInteger(base.maxEventCatchUp) || base.maxEventCatchUp > MAX_ANIMATION_EVENT_CATCH_UP) throw new Error("AnimationAction.restore: invalid maxEventCatchUp.");
  base.loopsCompleted = actionNumber(state.loopsCompleted, "loopsCompleted", 0);
  if (!Number.isSafeInteger(base.loopsCompleted)) throw new Error("AnimationAction.restore: invalid loopsCompleted.");
  base.lastPlaybackDelta = actionNumber(state.lastPlaybackDelta, "lastPlaybackDelta");
  if (state.fade !== null) {
    const fade = actionRecord(state.fade, "fade", ["duration", "elapsed", "startWeight", "targetWeight"]);
    const duration = actionNumber(fade.duration, "fade duration", 0);
    const elapsed = actionNumber(fade.elapsed, "fade elapsed", 0);
    if (duration === 0 || elapsed >= duration) throw new Error("AnimationAction.restore: invalid fade interval.");
    base.fade = { duration, elapsed, startWeight: actionNumber(fade.startWeight, "fade startWeight", 0), targetWeight: actionNumber(fade.targetWeight, "fade targetWeight", 0) };
  }
  if (state.warp !== null) {
    const warp = actionRecord(state.warp, "warp", ["duration", "elapsed", "from", "to"]);
    const duration = actionNumber(warp.duration, "warp duration", 0);
    const elapsed = actionNumber(warp.elapsed, "warp elapsed", 0);
    const from = actionNumber(warp.from, "warp from");
    const to = actionNumber(warp.to, "warp to");
    if (duration === 0 || elapsed >= duration || !Number.isFinite(to - from)) throw new Error("AnimationAction.restore: invalid warp interval.");
    base.warp = { duration, elapsed, from, to };
  }
  const signals = actionRecord(state.signals, "signals", ["loopDelta", "finishedDirection", "eventOverflow"]);
  const loopDelta = actionNumber(signals.loopDelta, "loopDelta");
  const finishedDirection = signals.finishedDirection;
  const eventOverflow = signals.eventOverflow === null ? Infinity : actionNumber(signals.eventOverflow, "eventOverflow", 0);
  if (!Number.isSafeInteger(loopDelta) || (finishedDirection !== -1 && finishedDirection !== 0 && finishedDirection !== 1) ||
      (eventOverflow !== Infinity && !Number.isSafeInteger(eventOverflow))) throw new Error("AnimationAction.restore: invalid playback signals.");
  base.signals = { loopDelta, finishedDirection, eventOverflow };
  return base;
}

/**
 * A canonical, collision-free clip identity rather than a name/duration hash.
 * It deliberately rejects accessors, custom implementations, callbacks and
 * values that JSON would change or discard.
 */
function animationClipIdentity(clip: AnimationClip): string {
  if (Object.getPrototypeOf(clip) !== AnimationClip.prototype ||
      !hasOnlyDataFields(clip, ["name", "tracks", "events", "duration"])) {
    throw new Error("AnimationAction.serialize: custom clip implementations cannot be serialized.");
  }
  assertAnimationArray(clip.tracks);
  const tracks = clip.tracks.map(track => {
    if (Object.getPrototypeOf(track) !== AnimationTrack.prototype ||
        !hasOnlyDataFields(track, ["target", "valueType", "valueSize", "keyframes", "duration"])) {
      throw new Error("AnimationAction.serialize: custom track implementations cannot be serialized.");
    }
    return { target: track.target, valueType: track.valueType, valueSize: track.valueSize, duration: track.duration, keyframes: track.keyframes };
  });
  return canonicalAnimationJSON({ name: clip.name, duration: clip.duration, tracks, events: clip.events }, new Set(), 0);
}

function hasOnlyDataFields(value: object, allowed: readonly string[]): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(descriptors).every(key => allowed.includes(key) && "value" in descriptors[key]! && descriptors[key]!.enumerable);
}

function assertAnimationArray(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) {
    throw new Error("AnimationAction.serialize: clip contains a nonserializable array.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== value.length + 1 || keys.some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
    throw new Error("AnimationAction.serialize: clip contains a sparse or nonserializable array.");
  }
  for (let index = 0; index < value.length; index++) {
    const item = descriptors[String(index)];
    if (!item || !("value" in item) || !item.enumerable) throw new Error("AnimationAction.serialize: clip contains a sparse or nonserializable array.");
  }
}

function canonicalAnimationJSON(value: unknown, ancestors: Set<object>, depth: number): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  if (typeof value !== "object" || depth > 128) throw new Error("AnimationAction.serialize: clip contains a nonserializable value or callback.");
  if (ancestors.has(value)) throw new Error("AnimationAction.serialize: clip contains a cycle.");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(value).length) throw new Error("AnimationAction.serialize: clip contains a nonserializable object.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  ancestors.add(value);
  try {
    if (array) {
      assertAnimationArray(value);
      return `[${value.map((entry: unknown) => canonicalAnimationJSON(entry, ancestors, depth + 1)).join(",")}]`;
    }
    const keys = Object.keys(descriptors).sort();
    if (keys.some(key => !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
      throw new Error("AnimationAction.serialize: clip contains an accessor or nonserializable property.");
    }
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalAnimationJSON(descriptors[key]!.value, ancestors, depth + 1)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
