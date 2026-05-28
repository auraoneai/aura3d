import type { CinematicPngStats } from "./pngStats";

export interface CinematicColorGate {
  readonly id: string;
  readonly pass: boolean;
  readonly actual: number;
  readonly threshold: number;
  readonly detail: string;
}

export function evaluateCinematicColorMetrics(stats: CinematicPngStats): readonly CinematicColorGate[] {
  const pixelCount = stats.width * stats.height;
  return [
    minGate("non-black-pixels", stats.nonBlackPixels / Math.max(1, pixelCount), 0.16, "Screenshot has enough non-black rendered pixels."),
    minGate("color-variety", stats.uniqueColorBuckets, 64, "Screenshot has enough color variety for cinematic evidence."),
    minGate("local-contrast", stats.localContrast, 10, "Screenshot has readable local contrast."),
    minGate("saturation", stats.saturatedPixelCoverage, 0.015, "Screenshot includes visible colored light/material variation.")
  ];
}

function minGate(id: string, actual: number, threshold: number, detail: string): CinematicColorGate {
  return {
    id,
    pass: actual >= threshold,
    actual: Number(actual.toFixed(6)),
    threshold,
    detail
  };
}
