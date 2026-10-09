// Animation controllers + clip dispatch — extracted from boot.ts for 14-LOC.
import { AnimationController, type AuraAnimationAssetLike } from "@aura3d/engine";
import { GUARD_CLIPS } from "../gameplay/guard";
import { THIEF_CLIPS } from "../gameplay/thief";
import { assets } from "../../../../src/aura-assets";
import type { GalleryCtx } from "./state";

export function createGalleryAnim(ctx: GalleryCtx) {
  const thiefAnimation = new AnimationController<string>({
    id: "thief-animation",
    clipRegistry: assets.showcaseRunnerGirl as unknown as AuraAnimationAssetLike,
    requiredClips: [THIEF_CLIPS.idle, THIEF_CLIPS.walk, THIEF_CLIPS.sneak, THIEF_CLIPS.sprint, THIEF_CLIPS.lift, THIEF_CLIPS.carry],
    suppressRootMotion: true
  });
  const guardAnimations: Array<AnimationController<string> | null> = [
    null,
    new AnimationController<string>({
      id: "guard-2-animation",
      clipRegistry: assets.showcaseExpressiveRobot as unknown as AuraAnimationAssetLike,
      requiredClips: [GUARD_CLIPS.idle, GUARD_CLIPS.walk, GUARD_CLIPS.run],
      suppressRootMotion: true
    })
  ];
  
  function playThiefClip(clip: string): void {
    if (ctx.thiefClipActive === clip) return;
    ctx.thiefClipActive = clip;
    try {
      thiefAnimation.crossFade(clip, 0.12, { loop: "loop" });
    } catch {
      /* diagnostics surface binding issues; never break the frame loop */
    }
  }
  function playGuardClip(guardId: string, controllerIndex: number, clip: string): void {
    const controller = guardAnimations[controllerIndex];
    if (!controller || ctx.guardClipActive.get(guardId) === clip) return;
    ctx.guardClipActive.set(guardId, clip);
    try {
      controller.crossFade(clip, 0.12, { loop: "loop" });
    } catch {
      /* as above */
    }
  }

  return { thiefAnimation, guardAnimations, playThiefClip, playGuardClip };
}
