import type { AnimationClip } from "./AnimationClip.js";
import { eventsBetween, type AnimationEvent } from "./AnimationEvents.js";

export type LoopMode = "once" | "repeat" | "pingpong";

export type AnimationActionSnapshot = {
  readonly clipName: string;
  readonly time: number;
  readonly weight: number;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly loopMode: LoopMode;
};

export class AnimationAction {
  readonly clip: AnimationClip;
  time = 0;
  weight = 1;
  timeScale = 1;
  loopMode: LoopMode = "repeat";
  playing = false;
  paused = false;
  private pingPongForward = true;
  private fadeDuration = 0;
  private fadeElapsed = 0;
  private fadeStartWeight = 1;
  private fadeTargetWeight = 1;

  constructor(clip: AnimationClip) {
    this.clip = clip;
  }

  play(): this {
    this.playing = true;
    this.paused = false;
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  stop(): this {
    this.playing = false;
    this.paused = false;
    this.time = 0;
    return this;
  }

  setWeight(weight: number): this {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error("AnimationAction weight must be finite and non-negative.");
    }
    this.weight = weight;
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

  update(delta: number): readonly AnimationEvent[] {
    if (!Number.isFinite(delta) || delta < 0) {
      throw new Error("AnimationAction delta must be finite and non-negative.");
    }
    if (this.fadeDuration > 0) {
      this.fadeElapsed = Math.min(this.fadeDuration, this.fadeElapsed + delta);
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
    let next = previous + scaledDelta;
    let looped = false;
    if (this.loopMode === "repeat") {
      while (next > this.clip.duration) {
        next -= this.clip.duration;
        looped = true;
      }
    } else if (this.loopMode === "once") {
      next = Math.min(next, this.clip.duration);
      if (next === this.clip.duration) {
        this.playing = false;
      }
    } else {
      if (this.pingPongForward) {
        while (next > this.clip.duration) {
          next = this.clip.duration - (next - this.clip.duration);
          this.pingPongForward = false;
          looped = true;
        }
      } else {
        next = previous - scaledDelta;
        while (next < 0) {
          next = -next;
          this.pingPongForward = true;
          looped = true;
        }
      }
    }
    this.time = next;
    if (this.clip.events.length === 0) {
      return [];
    }
    return eventsBetween(this.clip.events, this.clip.name, previous, next, this.clip.duration, looped);
  }

  snapshot(): AnimationActionSnapshot {
    return {
      clipName: this.clip.name,
      time: this.time,
      weight: this.weight,
      playing: this.playing,
      paused: this.paused,
      loopMode: this.loopMode
    };
  }
}
