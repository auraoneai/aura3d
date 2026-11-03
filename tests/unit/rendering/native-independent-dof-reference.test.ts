import { describe, expect, it } from "vitest";
import {
  independentDofCircleOfConfusionPx,
  independentDofMixPremultipliedRgba,
  independentDofPrefilterSamples,
  INDEPENDENT_DOF_COMPOSITE_WGSL,
  INDEPENDENT_DOF_GATHER_WGSL,
  INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL,
  INDEPENDENT_DOF_NEAR_TILE_WGSL,
  INDEPENDENT_DOF_PREFILTER_COC_WGSL,
  INDEPENDENT_DOF_PREFILTER_WGSL,
  type IndependentDofOptics,
  type IndependentDofPremultipliedRgba
} from "../../../packages/rendering/src/post/shaders/independentDepthOfField.wgsl";

// Independent thin-lens reference: f = 0.05 m, focus = 5 m, aperture
// diameter = 0.025 m, sensor height = 0.025 m, and 1,000 image rows.
// The signed sensor blur is f²(z - focus) / (N · z · (focus - f)).
const optics = {
  focusDistance: 5,
  focalLengthMm: 50,
  fStop: 2,
  sensorHeightMm: 25,
  maxBlurPx: 20,
  skyDepthMeters: 1_000
} satisfies IndependentDofOptics;

describe("independent depth-of-field optical reference", () => {
  it("returns the analytically derived sign and magnitude on either side of focus", () => {
    expect(independentDofCircleOfConfusionPx(5, optics, 1_000)).toBe(0);
    expect(independentDofCircleOfConfusionPx(10, optics, 1_000)).toBeCloseTo(5.05050505050505, 11);
    expect(independentDofCircleOfConfusionPx(2.5, optics, 1_000)).toBeCloseTo(-10.1010101010101, 11);
  });

  it("scales in image pixels, sensor height, and inverse aperture number", () => {
    const reference = 5.05050505050505;
    expect(independentDofCircleOfConfusionPx(10, optics, 500)).toBeCloseTo(reference / 2, 11);
    expect(independentDofCircleOfConfusionPx(10, { ...optics, sensorHeightMm: 50 }, 1_000)).toBeCloseTo(reference / 2, 11);
    expect(independentDofCircleOfConfusionPx(10, { ...optics, fStop: 4 }, 1_000)).toBeCloseTo(reference / 2, 11);
  });

  it("clamps the signed blur and treats missing depth and declared sky as unblurred", () => {
    expect(independentDofCircleOfConfusionPx(1, optics, 1_000)).toBe(-20);
    expect(independentDofCircleOfConfusionPx(Number.MIN_VALUE, optics, 1_000)).toBe(-20);
    expect(independentDofCircleOfConfusionPx(10, { ...optics, maxBlurPx: 3 }, 1_000)).toBe(3);
    expect(independentDofCircleOfConfusionPx(0, optics, 1_000)).toBe(0);
    expect(independentDofCircleOfConfusionPx(1_000, optics, 1_000)).toBe(0);
    expect(independentDofCircleOfConfusionPx(1_001, optics, 1_000)).toBe(0);
    expect(Math.abs(independentDofCircleOfConfusionPx(1, { ...optics, maxBlurPx: 0 }, 1_000))).toBe(0);
  });

  it("keeps finite extreme inputs from overflowing into a non-finite CoC", () => {
    const extreme = {
      ...optics,
      focusDistance: 1e298,
      focalLengthMm: 1e300,
      fStop: 1e300,
      sensorHeightMm: 1e300,
      skyDepthMeters: Number.MAX_VALUE
    };
    // Algebraically cancelling equal-scale terms yields -1/(9e297) px;
    // forming focalLength² or the full denominator first would overflow.
    const coc = independentDofCircleOfConfusionPx(5e297, extreme, 1_000);
    expect(Number.isFinite(coc)).toBe(true);
    expect(coc / 1e-298).toBeCloseTo(-1.1111111111111112, 10);
  });

  it("rejects invalid depth, frame height, and physical optics", () => {
    for (const depth of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => independentDofCircleOfConfusionPx(depth, optics, 1_000)).toThrow(RangeError);
    }
    for (const height of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => independentDofCircleOfConfusionPx(10, optics, height)).toThrow(RangeError);
    }
    for (const invalid of [
      { focusDistance: 0.05 },
      { focusDistance: 0 },
      { focalLengthMm: 0 },
      { fStop: 0 },
      { sensorHeightMm: 0 },
      { maxBlurPx: -1 },
      { skyDepthMeters: 0 }
    ]) {
      expect(() => independentDofCircleOfConfusionPx(10, { ...optics, ...invalid }, 1_000)).toThrow(RangeError);
    }
    for (const field of Object.keys(optics) as (keyof IndependentDofOptics)[]) {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => independentDofCircleOfConfusionPx(10, { ...optics, [field]: value }, 1_000)).toThrow(RangeError);
      }
    }
  });
});

describe("independent depth-of-field premultiplied color reference", () => {
  // These CPU references check numerical contracts; they do not execute WGSL.
  // A single depth per pixel cannot describe multiple transparent layers at
  // different depths, so these cases make no claim for that situation.
  const transparent = [0, 0, 0, 0] as const satisfies IndependentDofPremultipliedRgba;
  const silhouette = [0.4, 0.1, 0, 0.5] as const satisfies IndependentDofPremultipliedRgba;

  it("preserves transparent black even when its depth is in the foreground", () => {
    const result = independentDofPrefilterSamples([
      { rgba: transparent, depthMetres: 1 },
      { rgba: transparent, depthMetres: 2.5 },
      { rgba: transparent, depthMetres: 10 },
      { rgba: transparent, depthMetres: 0 }
    ], optics, 1_000);
    expect(result.rgba).toEqual(transparent);
    expect(result.cocPx).toBe(0);
  });

  it("ignores transparent foreground depth and alpha-weights visible far blur", () => {
    const result = independentDofPrefilterSamples([
      { rgba: silhouette, depthMetres: 10 },
      { rgba: [0.1, 0.2, 0.05, 0.25], depthMetres: 5 },
      { rgba: transparent, depthMetres: 1 },
      { rgba: transparent, depthMetres: 2.5 }
    ], optics, 1_000);
    // Visible far blur is 5.050505... px at alpha 0.5; the in-focus
    // sample contributes zero blur at alpha 0.25. Invisible depth contributes
    // neither near occlusion nor weight.
    expect(result.cocPx).toBeCloseTo(3.367003367003367, 11);
    const expected = [0.125, 0.075, 0.0125, 0.1875];
    for (let channel = 0; channel < expected.length; channel++) {
      expect(result.rgba[channel]).toBeCloseTo(expected[channel]!, 12);
    }
  });

  it("selects the strongest visible near blur instead of averaging it with far blur", () => {
    const result = independentDofPrefilterSamples([
      { rgba: silhouette, depthMetres: 10 },
      { rgba: [0.1, 0.1, 0.1, 0.25], depthMetres: 2.5 },
      { rgba: [0.01, 0.01, 0.01, 0.1], depthMetres: 1 },
      { rgba: transparent, depthMetres: 0.1 }
    ], optics, 1_000);
    expect(result.cocPx).toBe(-20);
  });

  it("keeps very small visible alpha and premultiplied color without a cutoff", () => {
    const veryTransparent = [8e-11, 2e-11, 0, 1e-10] as const satisfies IndependentDofPremultipliedRgba;
    const result = independentDofPrefilterSamples([
      { rgba: veryTransparent, depthMetres: 2.5 }
    ], optics, 1_000);
    expect(result.cocPx).toBeCloseTo(-10.1010101010101, 11);
    expect(result.rgba[0] / 1e-11).toBeCloseTo(8, 12);
    expect(result.rgba[1] / 1e-11).toBeCloseTo(2, 12);
    expect(result.rgba[3] / 1e-11).toBeCloseTo(10, 12);
    const mixed = independentDofMixPremultipliedRgba(transparent, veryTransparent, 0.5);
    expect(mixed[0] / 1e-11).toBeCloseTo(4, 12);
    expect(mixed[3] / 1e-11).toBeCloseTo(5, 12);
  });

  it("keeps finite high-dynamic-range color, including opposite signs, during averaging and mixing", () => {
    const maxF32 = 3.4028234663852886e38;
    const positive = [maxF32, maxF32, 0, 1] as const satisfies IndependentDofPremultipliedRgba;
    const opposite = [-maxF32, maxF32, 0, 1] as const satisfies IndependentDofPremultipliedRgba;
    const average = independentDofPrefilterSamples([
      { rgba: positive, depthMetres: 5 },
      { rgba: opposite, depthMetres: 5 },
      { rgba: positive, depthMetres: 5 },
      { rgba: opposite, depthMetres: 5 }
    ], optics, 1_000);
    expect(Math.abs(average.rgba[0]) / maxF32).toBeLessThan(1e-12);
    expect(average.rgba[1] / maxF32).toBeCloseTo(1, 12);
    expect(average.rgba[3]).toBe(1);

    const mixed = independentDofMixPremultipliedRgba(positive, opposite, 0.5);
    expect(mixed[0]).toBe(0);
    expect(mixed[1] / maxF32).toBeCloseTo(1, 12);
    expect(mixed[3]).toBe(1);
    const bright = [100, -50, 1, 0.25] as const satisfies IndependentDofPremultipliedRgba;
    expect(independentDofPrefilterSamples([{ rgba: bright, depthMetres: 5 }], optics, 1_000).rgba).toEqual(bright);
  });

  it("averages a semitransparent silhouette with transparent samples in premultiplied space", () => {
    const result = independentDofPrefilterSamples([
      { rgba: silhouette, depthMetres: 5 },
      { rgba: transparent, depthMetres: 0 },
      { rgba: transparent, depthMetres: 0 },
      { rgba: transparent, depthMetres: 0 }
    ], optics, 1_000);
    const expected = [0.1, 0.025, 0, 0.125];
    for (let channel = 0; channel < expected.length; channel++) {
      expect(result.rgba[channel]).toBeCloseTo(expected[channel]!, 12);
    }
    expect(result.cocPx).toBe(0);
  });

  it("averages only available samples at an incomplete footprint and keeps missing depth unblurred", () => {
    // An odd-width edge of a 2×2 footprint contains two pixels. The helper
    // must not divide by four or duplicate an edge sample.
    const result = independentDofPrefilterSamples([
      { rgba: silhouette, depthMetres: 1_000 },
      { rgba: [0.1, 0.2, 0.05, 0.25], depthMetres: 0 }
    ], optics, 1_000);
    const expected = [0.25, 0.15, 0.025, 0.375];
    for (let channel = 0; channel < expected.length; channel++) {
      expect(result.rgba[channel]).toBeCloseTo(expected[channel]!, 12);
    }
    expect(result.cocPx).toBe(0);
  });

  it("blends all four premultiplied channels without darkening the silhouette", () => {
    const filtered = [0.1, 0.025, 0, 0.125] as const satisfies IndependentDofPremultipliedRgba;
    expect(independentDofMixPremultipliedRgba(silhouette, filtered, 0)).toEqual(silhouette);
    expect(independentDofMixPremultipliedRgba(silhouette, filtered, 1)).toEqual(filtered);
    const mixed = independentDofMixPremultipliedRgba(silhouette, filtered, 0.5);
    const expected = [0.25, 0.0625, 0, 0.3125];
    for (let channel = 0; channel < expected.length; channel++) {
      expect(mixed[channel]).toBeCloseTo(expected[channel]!, 12);
    }
    expect(mixed[0] / mixed[3]).toBeCloseTo(0.8, 12);
    expect(mixed[1] / mixed[3]).toBeCloseTo(0.2, 12);
    expect(independentDofMixPremultipliedRgba(transparent, transparent, 0.5)).toEqual(transparent);
  });

  it("rejects an empty or oversized prefilter footprint and invalid sample depths", () => {
    expect(() => independentDofPrefilterSamples([], optics, 1_000)).toThrow(RangeError);
    expect(() => independentDofPrefilterSamples(
      Array.from({ length: 5 }, () => ({ rgba: transparent, depthMetres: 0 })), optics, 1_000
    )).toThrow(RangeError);
    for (const depthMetres of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => independentDofPrefilterSamples([
        { rgba: silhouette, depthMetres }
      ], optics, 1_000)).toThrow(RangeError);
    }
  });

  it("rejects malformed premultiplied RGBA and blend amounts", () => {
    const invalidColors: IndependentDofPremultipliedRgba[] = [
      [Number.NaN, 0, 0, 1],
      [0, Number.POSITIVE_INFINITY, 0, 1],
      [0, 0, 0, Number.NaN],
      [0, 0, 0, -0.1],
      [0, 0, 0, 1.1],
      [0.1, 0, 0, 0]
    ];
    for (const rgba of invalidColors) {
      expect(() => independentDofPrefilterSamples([{ rgba, depthMetres: 5 }], optics, 1_000)).toThrow(RangeError);
      expect(() => independentDofMixPremultipliedRgba(rgba, silhouette, 0.5)).toThrow(RangeError);
      expect(() => independentDofMixPremultipliedRgba(silhouette, rgba, 0.5)).toThrow(RangeError);
    }
    for (const amount of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => independentDofMixPremultipliedRgba(silhouette, transparent, amount)).toThrow(RangeError);
    }
  });
});

describe("independent depth-of-field shader host contract", () => {
  const groupBinding = (slot: number) => new RegExp(`@group\\(0\\)\\s*@binding\\(${slot}\\)`);

  it("declares six separate prefilter, tile, gather, and composite entrypoints and resources", () => {
    const stages = [
      { source: INDEPENDENT_DOF_PREFILTER_WGSL, entry: "fs_dof_prefilter", bindings: [0, 1, 2] },
      { source: INDEPENDENT_DOF_PREFILTER_COC_WGSL, entry: "fs_dof_prefilter_coc", bindings: [0, 1, 2] },
      { source: INDEPENDENT_DOF_NEAR_TILE_WGSL, entry: "fs_dof_near_tile", bindings: [1] },
      { source: INDEPENDENT_DOF_GATHER_WGSL, entry: "fs_dof_gather", bindings: [1, 2, 3] },
      { source: INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL, entry: "fs_dof_gather_influence", bindings: [1, 2, 3] },
      { source: INDEPENDENT_DOF_COMPOSITE_WGSL, entry: "fs_dof_composite", bindings: [1, 2, 3, 4] }
    ];
    for (const { source, entry, bindings } of stages) {
      expect(source).toMatch(new RegExp(`@fragment\\s+fn\\s+${entry}\\s*\\(`));
      for (const binding of bindings) expect(source).toMatch(groupBinding(binding));
    }
    expect(INDEPENDENT_DOF_GATHER_WGSL).toMatch(/\boverride\s+DOF_RINGS\b/);
  });

  it("keeps the prefilter's 32-byte optics layout", () => {
    const structures = [...INDEPENDENT_DOF_PREFILTER_WGSL.matchAll(/\bstruct\s+\w+\s*\{([^}]*)\}/gs)];
    const uniform = structures.find((match) => /\bfocusDistance\s*:\s*f32\b/.test(match[1] ?? ""));
    expect(uniform).toBeDefined();
    const fields = [...(uniform?.[1] ?? "").matchAll(/\b(\w+)\s*:\s*f32\b/g)].map((match) => match[1]);
    expect(fields).toEqual([
      "focusDistance", "focalLengthMm", "fStop", "sensorHeightMm",
      "fullHeightPx", "maxBlurPx", "skyDepthMeters", "padding"
    ]);
  });

  it("keeps premultiplied color separate from signed CoC and gather influence", () => {
    // These assertions check assembled source contracts, not GPU execution.
    expect(INDEPENDENT_DOF_PREFILTER_WGSL).toMatch(/return\s+independentPrefilter\(\s*position\s*\)\.rgba\s*;/);
    expect(INDEPENDENT_DOF_PREFILTER_COC_WGSL).toMatch(/return\s+vec4<f32>\(\s*independentPrefilter\(\s*position\s*\)\.coc\s*,/);
    expect(INDEPENDENT_DOF_GATHER_WGSL).toMatch(/return\s+independentGather\(\s*position\s*\)\.rgba\s*;/);
    expect(INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL).toMatch(/return\s+vec4<f32>\(\s*independentGather\(\s*position\s*\)\.influence\s*,/);
  });

  it("keeps half-resolution gather radii and the neighborhood across near-tile boundaries", () => {
    const gather = INDEPENDENT_DOF_GATHER_WGSL;
    expect(gather).toMatch(/0\.25\s*\*\s*abs\(\s*centerCoc\s*\)/);
    expect(gather).toMatch(/0\.25\s*\*\s*abs\(\s*tapCoc\s*\)/);
    const neighborLoops = [...gather.matchAll(/for\s*\(\s*var\s+\w+(?:\s*:\s*i32)?\s*=\s*-2\s*;[^;]*<=\s*2\s*;/g)];
    expect(neighborLoops).toHaveLength(2);
    expect(gather).toMatch(/textureLoad\s*\(\s*nearTiles\s*,\s*neighbor\s*,/);
  });

  it("declares manual bilinear color loads and mixes premultiplied alpha at composite", () => {
    const composite = INDEPENDENT_DOF_COMPOSITE_WGSL;
    for (const corner of ["p00", "p10", "p01", "p11"]) {
      expect(composite).toMatch(new RegExp(`textureLoad\\s*\\(\\s*gatheredColor\\s*,\\s*${corner}\\s*,`));
    }
    expect(composite).toMatch(/independentBilinearGather\s*\(\s*uv\s*\)/);
    expect(composite).toMatch(/independentStableMix\s*\(\s*original\s*,\s*filtered\s*,\s*amount\s*\)/);
    expect(composite).toMatch(/independentStableMixChannel\s*\(\s*\w+\.a\s*,\s*\w+\.a\s*,/);
  });
});
