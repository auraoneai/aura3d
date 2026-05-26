import { AnimationActionThreeCompat } from "./AnimationAction";
import type { AnimationClipThreeCompat } from "./AnimationClip";

export class AnimationMixerThreeCompat {
  readonly actions: AnimationActionThreeCompat[] = [];
  time = 0;

  clipAction(clip: AnimationClipThreeCompat): AnimationActionThreeCompat {
    const existing = this.actions.find((action) => action.clip === clip);
    if (existing) return existing;
    const action = new AnimationActionThreeCompat(clip);
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
