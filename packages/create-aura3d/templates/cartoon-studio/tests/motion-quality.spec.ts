import { expect, test } from "@playwright/test";
import { createCartoonMotionQualityArtifact, createCartoonVisualAcceptanceArtifact } from "../src/episode-renderer";

test("motion quality rejects still-image wobble and requires regional character motion", () => {
  const motion = createCartoonMotionQualityArtifact();

  expect(motion).toMatchObject({
    artifact: "cartoon-motion-quality",
    videoPath: "episode.webm",
    globalOnlyMotion: false,
    flatLayerMotion: false,
    cameraMotionDeclared: true,
    rejectedEvidence: {
      stillImageWobbleAccepted: false,
      subtitleOverStillAccepted: false,
      sourceOnlyAccepted: false
    }
  });
  expect(motion.independentRegionMotionSegments).toBeGreaterThanOrEqual(2);
  expect(motion.characterRegionMotionSegments).toBeGreaterThanOrEqual(2);
  expect(motion.bodyRegionMotionSegments).toBeGreaterThanOrEqual(2);
  expect(motion.mouthMotionSegments).toBeGreaterThanOrEqual(2);
  expect(motion.regions.some((region) => region.kind === "mouth" && region.movesDuringDialogue)).toBe(true);
  expect(motion.regions.some((region) => region.kind === "limb" && region.movesDuringAction)).toBe(true);
});

test("visual acceptance requires both characters and refuses source-only publish evidence", () => {
  const visual = createCartoonVisualAcceptanceArtifact();

  expect(visual).toMatchObject({
    artifact: "cartoon-visual-acceptance",
    ok: true,
    visualOk: true,
    encodedVideoPresent: true,
    notTrue3DAccepted: false,
    sourceOnlyAcceptedAsPublishProof: false,
    requiredHumanReview: true,
    visibleCharacterCount: 2,
    globalOnlyMotion: false,
    flatLayerMotion: false,
    reviewerRequiredBeforePublish: true
  });
  expect(visual.frameHashChanges).toBeGreaterThan(1);
  expect(visual.motionSegments.every((segment) => segment.independentRegionMotion)).toBe(true);
});
