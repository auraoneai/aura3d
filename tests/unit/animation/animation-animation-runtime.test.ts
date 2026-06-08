import { describe, expect, it } from "vitest";
import {
  AnimationClipRegistry,
  AnimationController,
  summarizeAnimationAnimationMotion,
  validateAnimationClipMap,
  type AnimationPose,
  type AnimationAnimationTimelineBinding
} from "../../../packages/animation/src";

type AnimationTestClipId = "Talk" | "Idle" | "Wave" | "Walk" | "Reach";

describe("animation animation runtime helpers", () => {
  it("binds speak, listen, gesture, walk, and action timeline states to clips", () => {
    const registry = new AnimationClipRegistry<AnimationTestClipId, never, AnimationPose>([
      { id: "Talk", duration: 1, tags: ["speak"], sample: () => ({ bones: {} }) },
      { id: "Idle", duration: 1, tags: ["listen"], sample: () => ({ bones: {} }) },
      { id: "Wave", duration: 1, tags: ["gesture"], sample: () => ({ bones: {} }) },
      { id: "Walk", duration: 1, tags: ["walk"], sample: () => ({ bones: {} }) },
      { id: "Reach", duration: 1, tags: ["action"], sample: () => ({ bones: {} }) }
    ]);
    const controller = new AnimationController(registry);
    const bindings: readonly AnimationAnimationTimelineBinding<AnimationTestClipId>[] = [
      { action: "speak", clipId: "Talk", loop: true, restartOnEnter: false },
      { action: "listen", clipId: "Idle", loop: true, restartOnEnter: false },
      { action: "gesture", clipId: "Wave", loop: "once", restartOnEnter: true },
      { action: "walk", clipId: "Walk", loop: true, restartOnEnter: false },
      { action: "action", clipId: "Reach", loop: "once", restartOnEnter: true }
    ];

    expect(controller.bindAnimationTimelineAction("speak", bindings, 0.2)).toMatchObject({ action: "speak", clipId: "Talk" });
    expect(controller.bindAnimationTimelineAction("listen", bindings, 0.4)).toMatchObject({ action: "listen", clipId: "Idle" });
    expect(controller.bindAnimationTimelineAction("gesture", bindings, 0.6)).toMatchObject({ action: "gesture", clipId: "Wave" });
    expect(controller.bindAnimationTimelineAction("walk", bindings, 0.8)).toMatchObject({ action: "walk", clipId: "Walk" });
    expect(controller.bindAnimationTimelineAction("action", bindings, 1)).toMatchObject({ action: "action", clipId: "Reach" });
  });

  it("validates animation clip maps and requires segmented fallback for missing clips", () => {
    const registry = new AnimationClipRegistry([
      { id: "Talk", duration: 1 },
      { id: "Idle", duration: 1 },
      { id: "Wave", duration: 1 },
      { id: "Walk", duration: 1 }
    ]);

    expect(validateAnimationClipMap(registry, {
      clipMap: { speak: "Talk", listen: "Idle", gesture: "Wave", walk: "Walk", action: "Reach" }
    })).toMatchObject({
      ok: false,
      missingClipIds: ["Reach"]
    });
    expect(validateAnimationClipMap(registry, {
      clipMap: { speak: "Talk", listen: "Idle", gesture: "Wave", walk: "Walk", action: "Reach" },
      segmentedFallbackDeclared: true
    })).toMatchObject({
      ok: true,
      segmentedFallbackDeclared: true,
      missingClipIds: ["Reach"]
    });
  });

  it("rejects static pose samples masquerading as animation animation", () => {
    const staticReport = summarizeAnimationAnimationMotion([
      { timeSeconds: 0, tracksApplied: 0, skinningPalettesUpdated: 0, animatedSubjects: 0, stride: 0 },
      { timeSeconds: 0.1, tracksApplied: 0, skinningPalettesUpdated: 0, animatedSubjects: 0, stride: 0 },
      { timeSeconds: 0.2, tracksApplied: 0, skinningPalettesUpdated: 0, animatedSubjects: 0, stride: 0 }
    ], { minimumSamples: 3, minimumTimeRangeSeconds: 0.18, minimumPoseDiversityScore: 0.02 });
    const animatedReport = summarizeAnimationAnimationMotion([
      { timeSeconds: 0, tracksApplied: 1, skinningPalettesUpdated: 1, animatedSubjects: 1, stride: 0 },
      { timeSeconds: 0.1, tracksApplied: 2, skinningPalettesUpdated: 1, animatedSubjects: 1, stride: 0.08 },
      { timeSeconds: 0.22, tracksApplied: 1, skinningPalettesUpdated: 1, animatedSubjects: 1, stride: 0.19 }
    ], { minimumSamples: 3, minimumTimeRangeSeconds: 0.18, minimumPoseDiversityScore: 0.02 });

    expect(staticReport).toMatchObject({
      kind: "animation-animation-motion-quality",
      healthy: false,
      staticPoseRejected: true
    });
    expect(staticReport.issues).toEqual(expect.arrayContaining(["no active track, skinning, or subject motion"]));
    expect(animatedReport).toMatchObject({ healthy: true, staticPoseRejected: false, issues: [] });
  });
});
