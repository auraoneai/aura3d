import { evaluateFrameVisualQuality, type FrameVisualMetrics, type FrameVisualQualityThresholds } from "../FrameVisualMetrics.js";

export interface AnimationFrameVisualInput {
  readonly id: string;
  readonly metrics: FrameVisualMetrics;
  readonly characterCount?: number | undefined;
  readonly captionOccluded?: boolean | undefined;
  readonly routeChromeVisible?: boolean | undefined;
  readonly debugOverlayVisible?: boolean | undefined;
}

export interface AnimationFrameVisualQuality {
  readonly id: string;
  readonly ok: boolean;
  readonly failures: readonly string[];
}

export interface AnimationVisualQualityReport {
  readonly kind: "animation-visual-quality";
  readonly ok: boolean;
  readonly frames: readonly AnimationFrameVisualQuality[];
  readonly visibleCharacterCount: number;
  readonly blockers: readonly string[];
}

export interface AnimationVisualQualityOptions {
  readonly thresholds?: FrameVisualQualityThresholds | undefined;
  readonly minVisibleCharacters?: number | undefined;
}

export function createAnimationVisualQualityReport(
  frames: readonly AnimationFrameVisualInput[],
  options: AnimationVisualQualityOptions = {}
): AnimationVisualQualityReport {
  const thresholds = options.thresholds ?? defaultAnimationVisualQualityThresholds;
  const frameResults = frames.map((frame): AnimationFrameVisualQuality => {
    const base = evaluateFrameVisualQuality(frame.metrics, thresholds);
    const failures = [
      ...base.failures,
      frame.captionOccluded ? "caption occludes important action" : undefined,
      frame.routeChromeVisible ? "route chrome is visible" : undefined,
      frame.debugOverlayVisible ? "debug overlay is visible" : undefined
    ].filter((failure): failure is string => Boolean(failure));
    return { id: frame.id, ok: failures.length === 0, failures };
  });
  const visibleCharacterCount = Math.max(0, ...frames.map((frame) => frame.characterCount ?? 0));
  const blockers = [
    ...frameResults.flatMap((frame) => frame.failures.map((failure) => `${frame.id}: ${failure}`)),
    visibleCharacterCount < (options.minVisibleCharacters ?? 2)
      ? `visibleCharacterCount ${visibleCharacterCount} < ${options.minVisibleCharacters ?? 2}`
      : undefined
  ].filter((blocker): blocker is string => Boolean(blocker));
  return {
    kind: "animation-visual-quality",
    ok: blockers.length === 0,
    frames: frameResults,
    visibleCharacterCount,
    blockers
  };
}

export const defaultAnimationVisualQualityThresholds: FrameVisualQualityThresholds = {
  minNonDarkRatio: 0.08,
  minSalientRatio: 0.035,
  minOccupiedAreaRatio: 0.08,
  minOccupiedQuadrants: 2,
  minColorBuckets: 6,
  maxDominantBucketRatio: 0.92,
  maxFlatPixelRatio: 0.98,
  minLocalContrastRatio: 0.002
};
