import type { AnimationClipV5, V5LoopMode } from "./AnimationClip";

export class AnimationActionV5 {
  time = 0;
  weight = 1;
  paused = false;
  playing = false;
  loop: V5LoopMode = "repeat";

  constructor(public readonly clip: AnimationClipV5) {}

  play(): this { this.playing = true; this.paused = false; return this; }
  pause(): this { this.paused = true; return this; }
  stop(): this { this.playing = false; this.time = 0; return this; }

  scrub(time: number): this {
    this.time = Math.max(0, Math.min(this.clip.duration, time));
    return this;
  }

  crossFadeTo(next: AnimationActionV5, alpha: number): void {
    const clamped = Math.max(0, Math.min(1, alpha));
    this.weight = 1 - clamped;
    next.weight = clamped;
    next.play();
  }
}
