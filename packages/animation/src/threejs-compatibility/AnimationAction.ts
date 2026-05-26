import type { AnimationClipThreeCompat, ThreeCompatLoopMode } from "./AnimationClip";

export class AnimationActionThreeCompat {
  time = 0;
  weight = 1;
  paused = false;
  playing = false;
  loop: ThreeCompatLoopMode = "repeat";

  constructor(public readonly clip: AnimationClipThreeCompat) {}

  play(): this { this.playing = true; this.paused = false; return this; }
  pause(): this { this.paused = true; return this; }
  stop(): this { this.playing = false; this.time = 0; return this; }

  scrub(time: number): this {
    this.time = Math.max(0, Math.min(this.clip.duration, time));
    return this;
  }

  crossFadeTo(next: AnimationActionThreeCompat, alpha: number): void {
    const clamped = Math.max(0, Math.min(1, alpha));
    this.weight = 1 - clamped;
    next.weight = clamped;
    next.play();
  }
}
