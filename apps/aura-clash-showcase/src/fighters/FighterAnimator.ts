import { AnimationStateMachine, type AnimationStateSnapshot } from "../animation/AnimationStateMachine";
import type { FighterAnimationState } from "../animation/FighterAnimationMap";
import { getAnimationClipMap } from "../animation/FighterAnimationMap";
import type { CombatAction } from "../state/GameTypes";

export interface FighterAnimatorSnapshot extends AnimationStateSnapshot {
  preferredClips: string[];
  loop: boolean;
  blendMs: number;
}

const actionToAnimation: Record<CombatAction, FighterAnimationState> = {
  idle: "idle",
  move: "walk",
  jump: "jump",
  dash: "dash",
  guard: "guard",
  light: "light",
  heavy: "heavy",
  special: "special",
  hitstun: "hitstun",
  knockdown: "defeat",
  victory: "victory",
  defeat: "defeat",
};

export class FighterAnimator {
  private readonly machine = new AnimationStateMachine();

  applyAction(action: CombatAction, atMs: number, reason = "combat-action"): FighterAnimatorSnapshot {
    const snapshot = this.machine.transition(actionToAnimation[action], reason, atMs);
    const clip = getAnimationClipMap(snapshot.current);
    return {
      ...snapshot,
      preferredClips: clip.preferredClips,
      loop: clip.loop,
      blendMs: clip.blendMs,
    };
  }

  release(atMs: number): FighterAnimatorSnapshot {
    const snapshot = this.machine.releaseToIdle(atMs);
    const clip = getAnimationClipMap(snapshot.current);
    return {
      ...snapshot,
      preferredClips: clip.preferredClips,
      loop: clip.loop,
      blendMs: clip.blendMs,
    };
  }
}
