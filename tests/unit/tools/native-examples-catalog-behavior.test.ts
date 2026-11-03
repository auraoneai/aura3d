import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogBehaviorObservationErrors,
  catalogBehaviorPixelErrors,
  compareCatalogSubjectBehavior,
  requiredCatalogBehavior,
  type CatalogBehaviorObservation,
  type NumericRegion
} from "../../browser/native-examples-catalog.spec.js";

// Synthetic arrays exercise the decision logic, not a browser or a reference.
const region: NumericRegion = {
  label: "subject", x: 0, y: 0, width: 16, height: 16, minContrast: 5,
  colors: [{ name: "warm subject", red: [100, 240], green: [30, 150], blue: [0, 80], minFraction: 0.01, maxFraction: 0.9 }]
};
function pixels(subject: readonly [number, number, number], background: readonly [number, number, number] = [5, 5, 5]): Uint8Array {
  const result = new Uint8Array(16 * 16 * 3);
  for (let i = 0; i < 256; i += 1) result.set(i < 128 ? subject : background, i * 3);
  return result;
}
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function observation(): CatalogBehaviorObservation {
  return {
    backend: "webgl2", drawCalls: 2, errors: [], time: 0,
    camera: { position: [3.8, 2.8, 6], viewProjection: [...matrix] },
    asset: {
      assetId: "kaykitBarbarian", clips: ["Idle"], activeClip: "Idle", skeleton: { boneCount: 41 },
      skinningPalette: { updated: true }, renderItemCount: 1, skinnedRenderItemCount: 1
    },
    animation: { activeClip: "Idle", tracksApplied: 12 },
    post: { present: true, pipeline: "v2", submittedPasses: ["color-grade"], pixelBackedPasses: ["color-grade"] },
    grade: { contrast: 1.12, saturation: 0.8 },
    orbitTarget: "subject"
  };
}

describe("native example feature-specific behavior contracts", () => {
  it("requires the three behavior checks independently of the fixture", () => {
    expect(requiredCatalogBehavior("capability-example:postprocess")).toBe("postprocess");
    expect(requiredCatalogBehavior("capability-example:animation")).toBe("animation");
    expect(requiredCatalogBehavior("capability-example:controls")).toBe("controls");
    expect(requiredCatalogBehavior("capability-example:typed-model")).toBeUndefined();
    const source = readFileSync(resolve(process.cwd(), "tests/browser/native-examples-catalog.spec.ts"), "utf8");
    expect(source).toContain("bindBrowserGate(");
    expect(source).toContain("validateExampleSourceReport");
    expect(source).toContain("await page.mouse.down()");
    expect(source).toContain('app.post.setEffect("colorGrade", { contrast: 1, saturation: 1 })');
    expect(source).toContain(".step(16 / 30)");
    expect(source).toContain("await runCatalogBehavior(page, behavior");
  });

  it("rejects missing or invalid renderer, subject and presented camera evidence", () => {
    const a = observation(), b = observation();
    expect(catalogBehaviorObservationErrors("postprocess", a, b, observation())).toEqual([]);
    expect(catalogBehaviorObservationErrors("postprocess", a, b)).toContain("grade restore observation is missing");
    for (const broken of [
      { ...b, backend: "canvas2d" }, { ...b, drawCalls: 0 }, { ...b, errors: ["failure"] },
      { ...b, asset: null }, { ...b, camera: null },
      { ...b, camera: { position: [1, 2, 3], viewProjection: [] } },
      { ...b, camera: { position: [1, 2, 3], viewProjection: Array(16).fill(0) } },
      { ...b, camera: { position: [1, 2, NaN], viewProjection: matrix } }
    ]) expect(catalogBehaviorObservationErrors("postprocess", a, broken, observation()).length).toBeGreaterThan(0);
  });

  it("requires a real grade node, grade stage, unchanged post chain, clock and camera", () => {
    const a = observation();
    expect(catalogBehaviorObservationErrors("postprocess", a, { ...a, grade: { contrast: 1, saturation: 1 } }, a)).toContain("the authored grade or submitted grade stage is missing");
    expect(catalogBehaviorObservationErrors("postprocess", a, { ...a, post: { present: true, pipeline: "v2", submittedPasses: ["tone-mapping"], pixelBackedPasses: [] } }, a).length).toBeGreaterThan(0);
    expect(catalogBehaviorObservationErrors("postprocess", a, { ...a, time: 0.1 }, a)).toContain("time changed during the grade comparison");
    const moved = { ...a, camera: { position: [4, 2.8, 6], viewProjection: matrix } };
    expect(catalogBehaviorObservationErrors("postprocess", a, moved, a)).toContain("camera changed during the controlled comparison");
  });

  it("requires the inspected Idle clip, applied tracks, a skinned subject and a fixed camera", () => {
    const a = observation(), b = { ...observation(), time: 16 / 30 };
    expect(catalogBehaviorObservationErrors("animation", a, b)).toEqual([]);
    expect(catalogBehaviorObservationErrors("animation", a, { ...b, time: 0 })).toContain("the Idle half-cycle was not advanced");
    for (const broken of [
      { ...b, animation: { activeClip: "Idle", tracksApplied: 0 } },
      { ...b, animation: { activeClip: "Walk", tracksApplied: 12 } },
      { ...b, asset: { ...b.asset!, skinningPalette: { updated: false } } },
      { ...b, asset: { ...b.asset!, skinnedRenderItemCount: 0 } },
      { ...b, camera: { position: [4, 2.8, 6], viewProjection: matrix } }
    ]) expect(catalogBehaviorObservationErrors("animation", a, broken).length).toBeGreaterThan(0);
  });

  it("requires pointer-driven camera change, not just an orbit label or pixel change", () => {
    const a = observation();
    const moved = { ...observation(), camera: { position: [4, 2.8, 6], viewProjection: matrix.map((v, i) => i === 0 ? v + 0.1 : v) } };
    expect(catalogBehaviorObservationErrors("controls", a, moved)).toEqual([]);
    expect(catalogBehaviorObservationErrors("controls", a, observation())).toContain("pointer drag did not change the camera view");
    expect(catalogBehaviorObservationErrors("controls", a, { ...moved, orbitTarget: "floor" })).toContain("the orbit interaction does not target the subject");
  });

  it("checks changed subject pixels, grade direction and repeatability rather than changed backgrounds", () => {
    const neutral = pixels([200, 80, 40]);
    const graded = pixels([190, 85, 50]);
    const delta = compareCatalogSubjectBehavior(neutral, graded, 16, 16, region);
    const stable = compareCatalogSubjectBehavior(graded, graded, 16, 16, region);
    expect(catalogBehaviorPixelErrors("postprocess", delta, stable)).toEqual([]);
    expect(catalogBehaviorPixelErrors("animation", stable, stable)).toContain("insufficient changed subject pixels");
    expect(catalogBehaviorPixelErrors("postprocess", compareCatalogSubjectBehavior(graded, neutral, 16, 16, region), stable))
      .toContain("authored grade did not reduce subject chroma");
    const backgroundOnly = compareCatalogSubjectBehavior(neutral, pixels([200, 80, 40], [20, 20, 20]), 16, 16, region);
    expect(catalogBehaviorPixelErrors("controls", backgroundOnly, stable)).toContain("insufficient changed subject pixels");
    const withFloorBand: NumericRegion = { ...region, colors: [
      ...region.colors,
      { name: "blue-gray armor (also matches floor)", red: [45, 160], green: [65, 190], blue: [85, 220], minFraction: 0.01, maxFraction: 0.9 }
    ] };
    const floorOnly = compareCatalogSubjectBehavior(
      pixels([200, 80, 40], [83, 89, 98]), pixels([200, 80, 40], [100, 110, 120]), 16, 16, withFloorBand
    );
    expect(floorOnly.changed).toBe(0);
    expect(catalogBehaviorPixelErrors("animation", floorOnly, stable)).toContain("insufficient changed subject pixels");
    expect(catalogBehaviorPixelErrors("controls", delta, delta)).toContain("unchanged control frame was not stable");
    expect(catalogBehaviorPixelErrors("controls", { ...delta, meanDifference: NaN }, stable)).toContain("invalid subject pixel metrics");
    expect(() => compareCatalogSubjectBehavior(neutral.subarray(3), neutral, 16, 16, region)).toThrow();
  });
});
