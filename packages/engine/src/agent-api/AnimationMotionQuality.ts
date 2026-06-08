import {
  createPromptAnimationIssue,
  promptAnimationContractVersion,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";

export const animationMotionQualitySchemaVersion = "aura3d-animation-motion-quality/v1" as const;

export type AnimationMotionQualityStatus = "pass" | "fail";
export type AnimationMotionRegionKind = "head" | "torso" | "arm" | "hand" | "leg" | "mouth" | "prop" | "background";
export type AnimationMotionSegmentKind = "establishing" | "dialogue" | "action" | "camera" | "transition";

export interface AnimationMotionFrameRegionSample {
  readonly id: PromptAnimationId;
  readonly kind: AnimationMotionRegionKind;
  readonly characterId?: PromptAnimationId | undefined;
  readonly visible: boolean;
  readonly delta: number;
  readonly mouthDelta?: number | undefined;
}

export interface AnimationMotionFrameSample {
  readonly frame: number;
  readonly time: PromptAnimationSeconds;
  readonly frameHash: string;
  readonly globalDelta: number;
  readonly cameraMoveExpected?: boolean | undefined;
  readonly regions: readonly AnimationMotionFrameRegionSample[];
}

export interface AnimationMotionSegmentInput {
  readonly id: PromptAnimationId;
  readonly shotId?: PromptAnimationId | undefined;
  readonly kind: AnimationMotionSegmentKind;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly characterIds?: readonly PromptAnimationId[] | undefined;
  readonly cameraMoveExpected?: boolean | undefined;
}

export interface AnimationMotionQualityThresholds {
  readonly minFrameHashChanges: number;
  readonly minGlobalDelta: number;
  readonly minRegionDelta: number;
  readonly minMouthDelta: number;
  readonly minIndependentRegionKinds: number;
  readonly maxGlobalOnlyFrameRatio: number;
}

export interface AnimationMotionSegmentReport {
  readonly id: PromptAnimationId;
  readonly shotId?: PromptAnimationId | undefined;
  readonly kind: AnimationMotionSegmentKind;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly frameCount: number;
  readonly frameHashChanges: number;
  readonly averageGlobalDelta: number;
  readonly averageLocalRegionDelta: number;
  readonly movingRegionKinds: readonly AnimationMotionRegionKind[];
  readonly movingCharacterIds: readonly PromptAnimationId[];
  readonly mouthMotionCharacterIds: readonly PromptAnimationId[];
  readonly globalOnlyFrameRatio: number;
  readonly cameraMoveExpected: boolean;
  readonly pass: boolean;
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface AnimationMotionQualityReport {
  readonly artifact: "animation-motion-quality";
  readonly schemaVersion: typeof animationMotionQualitySchemaVersion;
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly generatedAt?: string | undefined;
  readonly frameRate: PromptAnimationFrameRate;
  readonly frameCount: number;
  readonly status: AnimationMotionQualityStatus;
  readonly thresholds: AnimationMotionQualityThresholds;
  readonly frameHashChanges: number;
  readonly globalOnlyMotion: boolean;
  readonly segments: readonly AnimationMotionSegmentReport[];
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface CreateAnimationMotionQualityReportInput {
  readonly episodeId: PromptAnimationId;
  readonly frameRate: PromptAnimationFrameRate;
  readonly frames: readonly AnimationMotionFrameSample[];
  readonly segments: readonly AnimationMotionSegmentInput[];
  readonly generatedAt?: string | undefined;
  readonly thresholds?: Partial<AnimationMotionQualityThresholds> | undefined;
}

export const defaultAnimationMotionQualityThresholds: AnimationMotionQualityThresholds = {
  minFrameHashChanges: 2,
  minGlobalDelta: 0.01,
  minRegionDelta: 0.025,
  minMouthDelta: 0.015,
  minIndependentRegionKinds: 2,
  maxGlobalOnlyFrameRatio: 0.6
};

export function createAnimationMotionQualityReport(
  input: CreateAnimationMotionQualityReportInput
): AnimationMotionQualityReport {
  const thresholds = { ...defaultAnimationMotionQualityThresholds, ...input.thresholds };
  const sortedFrames = [...input.frames].sort((a, b) => a.frame - b.frame);
  const frameHashChanges = countFrameHashChanges(sortedFrames);
  const segments = input.segments.map((segment) => analyzeAnimationMotionSegment(segment, sortedFrames, thresholds));
  const issues: PromptAnimationValidationIssue[] = [];

  if (sortedFrames.length === 0) {
    issues.push(createPromptAnimationIssue("error", "animation-motion-frames-missing", "Motion quality requires sampled frames."));
  }
  if (frameHashChanges < thresholds.minFrameHashChanges) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-frame-hashes-static",
        `Motion quality requires at least ${thresholds.minFrameHashChanges} frame hash changes.`
      )
    );
  }
  if (segments.length === 0) {
    issues.push(
      createPromptAnimationIssue("error", "animation-motion-segments-missing", "Motion quality requires timeline segments.")
    );
  }
  issues.push(...segments.flatMap((segment) => segment.issues));

  const globalOnlyMotion =
    segments.length > 0 && segments.every((segment) => segment.globalOnlyFrameRatio > thresholds.maxGlobalOnlyFrameRatio);
  if (globalOnlyMotion) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-global-only",
        "Motion appears to be global-only still-image motion instead of independent character or object animation."
      )
    );
  }

  return {
    artifact: "animation-motion-quality",
    schemaVersion: animationMotionQualitySchemaVersion,
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    generatedAt: input.generatedAt,
    frameRate: input.frameRate,
    frameCount: sortedFrames.length,
    status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass",
    thresholds,
    frameHashChanges,
    globalOnlyMotion,
    segments,
    issues
  };
}

export function validateAnimationMotionQuality(
  report: AnimationMotionQualityReport
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  if (report.schemaVersion !== animationMotionQualitySchemaVersion) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-schema-version-unknown",
        `Unknown animation motion quality schema "${report.schemaVersion}".`
      )
    );
  }
  if (report.status !== "pass") {
    issues.push(
      createPromptAnimationIssue("error", "animation-motion-status-fail", "Animation motion quality report did not pass.")
    );
  }
  if (report.globalOnlyMotion) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-global-only",
        "Animation motion quality report detected global-only still-image motion."
      )
    );
  }
  return [...issues, ...report.issues];
}

function analyzeAnimationMotionSegment(
  segment: AnimationMotionSegmentInput,
  frames: readonly AnimationMotionFrameSample[],
  thresholds: AnimationMotionQualityThresholds
): AnimationMotionSegmentReport {
  const segmentFrames = frames.filter((frame) => frame.frame >= segment.startFrame && frame.frame <= segment.endFrame);
  const issues: PromptAnimationValidationIssue[] = [];
  const allRegions = segmentFrames.flatMap((frame) => frame.regions.filter((region) => region.visible));
  const movingRegions = allRegions.filter((region) => region.delta >= thresholds.minRegionDelta);
  const movingRegionKinds = uniqueSorted(movingRegions.map((region) => region.kind));
  const movingCharacterIds = uniqueSorted(movingRegions.flatMap((region) => (region.characterId ? [region.characterId] : [])));
  const mouthMotionCharacterIds = uniqueSorted(
    allRegions.flatMap((region) =>
      region.kind === "mouth" && (region.mouthDelta ?? region.delta) >= thresholds.minMouthDelta && region.characterId
        ? [region.characterId]
        : []
    )
  );
  const globalOnlyFrames = segmentFrames.filter((frame) => {
    const maxLocalDelta = Math.max(0, ...frame.regions.filter((region) => region.visible).map((region) => region.delta));
    return frame.globalDelta >= thresholds.minGlobalDelta && maxLocalDelta < thresholds.minRegionDelta;
  });
  const frameHashChanges = countFrameHashChanges(segmentFrames);
  const averageGlobalDelta = average(segmentFrames.map((frame) => frame.globalDelta));
  const averageLocalRegionDelta = average(allRegions.map((region) => region.delta));
  const globalOnlyFrameRatio = segmentFrames.length === 0 ? 1 : globalOnlyFrames.length / segmentFrames.length;
  const cameraMoveExpected = Boolean(segment.cameraMoveExpected ?? segmentFrames.some((frame) => frame.cameraMoveExpected));

  if (segmentFrames.length === 0) {
    issues.push(
      createPromptAnimationIssue("error", "animation-motion-segment-frames-missing", `Motion segment "${segment.id}" has no sampled frames.`, {
        path: `segments.${segment.id}`
      })
    );
  }
  if ((segment.kind === "action" || segment.kind === "dialogue") && movingRegionKinds.length < thresholds.minIndependentRegionKinds) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-independent-regions-missing",
        `Motion segment "${segment.id}" requires at least ${thresholds.minIndependentRegionKinds} independently moving region kinds.`,
        { path: `segments.${segment.id}` }
      )
    );
  }
  if (segment.kind === "dialogue" && mouthMotionCharacterIds.length === 0) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-mouth-missing",
        `Dialogue segment "${segment.id}" requires mouth-region motion.`,
        { path: `segments.${segment.id}` }
      )
    );
  }
  if (globalOnlyFrameRatio > thresholds.maxGlobalOnlyFrameRatio && !cameraMoveExpected && segment.kind !== "transition") {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-motion-segment-global-only",
        `Motion segment "${segment.id}" looks like global-only still-image movement.`,
        { path: `segments.${segment.id}` }
      )
    );
  }

  return {
    id: segment.id,
    shotId: segment.shotId,
    kind: segment.kind,
    startFrame: segment.startFrame,
    endFrame: segment.endFrame,
    frameCount: segmentFrames.length,
    frameHashChanges,
    averageGlobalDelta,
    averageLocalRegionDelta,
    movingRegionKinds,
    movingCharacterIds,
    mouthMotionCharacterIds,
    globalOnlyFrameRatio,
    cameraMoveExpected,
    pass: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

function countFrameHashChanges(frames: readonly AnimationMotionFrameSample[]): number {
  let changes = 0;
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index]?.frameHash !== frames[index - 1]?.frameHash) changes += 1;
  }
  return changes;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values)).sort();
}
