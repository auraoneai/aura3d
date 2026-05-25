import { AnimationActionV5 } from "./AnimationAction";
import type { AnimationClipV5 } from "./AnimationClip";

export class AnimationMixerV5 {
  readonly actions: AnimationActionV5[] = [];
  time = 0;

  clipAction(clip: AnimationClipV5): AnimationActionV5 {
    const existing = this.actions.find((action) => action.clip === clip);
    if (existing) return existing;
    const action = new AnimationActionV5(clip);
    this.actions.push(action);
    return action;
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    for (const action of this.actions) {
      if (!action.playing || action.paused) continue;
      action.time += deltaSeconds;
      if (action.time > action.clip.duration) action.time = action.loop === "once" ? action.clip.duration : action.time % action.clip.duration;
    }
  }
}
