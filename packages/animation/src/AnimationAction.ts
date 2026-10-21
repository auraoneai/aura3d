import type { AnimationClip } from "./AnimationClip.js";
import { eventsBetween, type AnimationEvent } from "./AnimationEvents.js";

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
  private pingPongForward = true;
  private loopsCompleted = 0;
  private signalLoopDelta = 0;
  private signalFinishedDirection: -1 | 0 | 1 = 0;
  private fadeDuration = 0;
  private fadeElapsed = 0;
  private fadeStartWeight = 1;
  private fadeTargetWeight = 1;

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
    return this;
  }

  seek(time: number): this {
    if (!Number.isFinite(time)) {
      throw new Error("AnimationAction.seek: time must be finite.");
    }
    const clamped = this.clip.duration > 0 ? Math.max(0, Math.min(time, this.clip.duration)) : 0;
    if (this.clip.duration > 0 && (time < 0 || time > this.clip.duration)) {
      console.warn(`AnimationAction.seek: time ${time} outside clip "${this.clip.name}" range [0, ${this.clip.duration}]; clamped to ${clamped}.`);
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
    if (this.fadeDuration > 0) {
      this.fadeElapsed = Math.min(this.fadeDuration, this.fadeElapsed + Math.abs(delta));
      const t = this.fadeElapsed / this.fadeDuration;
      this.weight = this.fadeStartWeight + (this.fadeTargetWeight - this.fadeStartWeight) * t;
      if (this.fadeElapsed === this.fadeDuration) {
        this.fadeDuration = 0;
      }
    }
    if (!this.playing || this.paused || this.clip.duration === 0) {
      return [];
    }
    const previous = this.time;
    const scaledDelta = delta * this.timeScale;
    const duration = this.clip.duration;
    let looped = false;
    let next: number;
    if (this.loopMode === "repeat") {
      next = previous + scaledDelta;
      if (next >= duration || next < 0) {
        const loopDelta = Math.floor(next / duration);
        next -= duration * loopDelta;
        this.loopsCompleted += Math.abs(loopDelta);
        looped = true;
        if (this.loopsCompleted >= this.repetitions) {
          next = scaledDelta >= 0 ? duration : 0;
          this.finish(scaledDelta >= 0 ? 1 : -1);
        } else {
          // three dispatches 'loop' for intermediate wraps but 'finished'
          // instead of 'loop' on the wrap that exhausts repetitions.
          this.signalLoopDelta += loopDelta;
        }
      }
    } else if (this.loopMode === "once") {
      next = previous + scaledDelta;
      if (scaledDelta !== 0) {
        if (next >= duration) {
          next = duration;
          this.finish(1);
        } else if (next <= 0) {
          next = 0;
          this.finish(-1);
        }
      }
    } else {
      // pingpong: clip time bounces between the 0 and duration boundaries; each
      // reflection counts one repetition (three's loopCount parity).
      next = this.pingPongForward ? previous + scaledDelta : previous - scaledDelta;
      let crossings = 0;
      let exhausted = false;
      while (!exhausted && (next > duration || next < 0)) {
        next = next > duration ? 2 * duration - next : -next;
        this.pingPongForward = !this.pingPongForward;
        crossings++;
        if (this.loopsCompleted + crossings >= this.repetitions) {
          exhausted = true;
        }
      }
      if (!exhausted) {
        // Landing exactly on the boundary the playhead moves toward counts as a
        // wrap (three counts t === duration as a completed loop).
        const clipVelocity = this.pingPongForward ? scaledDelta : -scaledDelta;
        if ((clipVelocity > 0 && next === duration) || (clipVelocity < 0 && next === 0)) {
          this.pingPongForward = !this.pingPongForward;
          crossings++;
          if (this.loopsCompleted + crossings >= this.repetitions) {
            exhausted = true;
          }
        }
      }
      this.loopsCompleted += crossings;
      if (crossings > 0 && !exhausted) {
        this.signalLoopDelta += scaledDelta < 0 ? -crossings : crossings;
        looped = true;
      }
      if (exhausted) {
        // The final parity selects which boundary the clip clamps to (three's
        // loopCount odd/even → duration/0).
        next = this.pingPongForward ? duration : 0;
        this.finish(scaledDelta >= 0 ? 1 : -1);
      }
    }
    this.time = next;
    if (this.clip.events.length === 0) {
      return [];
    }
    return eventsBetween(this.clip.events, this.clip.name, previous, next, this.clip.duration, looped);
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
      finishedDirection: this.signalFinishedDirection
    };
    this.signalLoopDelta = 0;
    this.signalFinishedDirection = 0;
    return signals;
  }

  private finish(direction: -1 | 1): void {
    if (this.signalFinishedDirection !== 0) {
      return;
    }
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
      loopMode: this.loopMode
    };
  }
}
