import { describe, expect, it } from "vitest";
import {
  analyzeRgbaFrameMotionRegions,
  createAnimationMaterialStyle,
  createAnimationRenderPreset,
  createAnimationVisualQualityReport,
  type FrameVisualMetrics
} from "../../../packages/rendering/src";

function metrics(overrides: Partial<FrameVisualMetrics> = {}): FrameVisualMetrics {
  return {
    width: 1280,
    height: 720,
    pixelCount: 921_600,
    nonDarkPixels: 700_000,
    nonDarkRatio: 0.76,
    salientPixels: 540_000,
    salientRatio: 0.58,
    occupiedAreaRatio: 0.64,
    occupiedQuadrants: 4,
    meanLuma: 92,
    averageLuma: 92,
    minLuma: 4,
    maxLuma: 236,
    darkPixelRatio: 0.24,
    colorBuckets: 40,
    dominantBucketRatio: 0.28,
    edgePixels: 80_000,
    edgePixelRatio: 0.086,
    flatPixels: 120_000,
    flatPixelRatio: 0.13,
    localContrastPixels: 90_000,
    localContrastRatio: 0.098,
    bounds: { minX: 120, minY: 80, maxX: 1120, maxY: 650, width: 1001, height: 571 },
    ...overrides
  };
}

describe("animation rendering preset and visual gate", () => {
  it("creates a animation preset that is export-safe by default", () => {
    const preset = createAnimationRenderPreset({ materialStyle: { treatment: "cel" }, reducedFlash: true });

    expect(preset).toMatchObject({
      kind: "animation-render-preset-evidence",
      name: "moon-garden-animation",
      resolution: { width: 1280, height: 720 },
      shadows: { soft: true, contact: true },
      debugOverlaysAllowedInExport: false,
      reducedFlash: true
    });
    expect(preset.lights).toContain("soft-key");
    expect(preset.materialStyle).toMatchObject({ treatment: "cel", outline: true, rampSteps: 4 });
    expect(preset.postprocess.bloom).toBeLessThan(0.1);
  });

  it("reports animation motion regions from changed frame pixels", () => {
    const previous = new Uint8Array(8 * 8 * 4);
    const next = new Uint8Array(previous);
    for (let y = 2; y < 5; y += 1) {
      for (let x = 3; x < 6; x += 1) {
        const index = (y * 8 + x) * 4;
        next[index] = 220;
        next[index + 1] = 180;
        next[index + 2] = 60;
        next[index + 3] = 255;
      }
    }

    const motion = analyzeRgbaFrameMotionRegions(previous, next, 8, 8, { minRegionPixels: 4 });

    expect(motion.characterVisible).toBe(true);
    expect(motion.characterMotionRegionCount).toBe(1);
    expect(motion.regions[0]?.bounds).toMatchObject({ minX: 3, minY: 2, maxX: 5, maxY: 4 });
  });

  it("keeps material styling explicit for toon and PBR-preserving routes", () => {
    expect(createAnimationMaterialStyle({ treatment: "cel" })).toMatchObject({
      treatment: "cel",
      outline: true,
      rampSteps: 4
    });
    expect(createAnimationMaterialStyle({ treatment: "preserve-pbr" })).toMatchObject({
      treatment: "preserve-pbr",
      outline: false,
      rampSteps: 7
    });
  });

  it("passes representative animation frames with two visible characters", () => {
    const report = createAnimationVisualQualityReport([
      { id: "first", metrics: metrics(), characterCount: 2 },
      { id: "action", metrics: metrics({ occupiedAreaRatio: 0.7 }), characterCount: 2 }
    ]);

    expect(report.ok).toBe(true);
    expect(report.visibleCharacterCount).toBe(2);
    expect(report.blockers).toEqual([]);
  });

  it("fails blank, chrome-covered, or debug-overlay frames", () => {
    const report = createAnimationVisualQualityReport([
      {
        id: "blank",
        metrics: metrics({
          nonDarkRatio: 0.01,
          salientRatio: 0.005,
          occupiedAreaRatio: 0.01,
          occupiedQuadrants: 1,
          colorBuckets: 2,
          dominantBucketRatio: 0.99,
          flatPixelRatio: 0.995,
          localContrastRatio: 0
        }),
        characterCount: 0
      },
      { id: "debug", metrics: metrics(), characterCount: 2, debugOverlayVisible: true },
      { id: "route-ui", metrics: metrics(), characterCount: 2, routeChromeVisible: true, captionOccluded: true }
    ]);

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toContain("blank: nonDarkRatio");
    expect(report.blockers.join("\n")).toContain("debug: debug overlay is visible");
    expect(report.blockers.join("\n")).toContain("route-ui: route chrome is visible");
  });

  it("fails marketing crops that do not show both recurring characters", () => {
    const report = createAnimationVisualQualityReport([
      { id: "cropped-hero", metrics: metrics(), characterCount: 1 }
    ]);

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toContain("visibleCharacterCount 1 < 2");
  });
});
