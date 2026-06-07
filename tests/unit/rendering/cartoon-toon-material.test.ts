import { describe, expect, it } from "vitest";
import {
  CartoonToonMaterial,
  CARTOON_TOON_SHADER_NAME,
  CARTOON_TOON_SHADER_MARKER,
  applyCartoonRenderPreset,
  createCartoonRenderPreset,
  createDefaultShaderLibrary,
  quantizeToonBand,
  toonDiffuseRamp,
  toonRimTerm,
  toonShadeColor
} from "../../../packages/rendering/src";

describe("cartoon toon ramp/quantize math", () => {
  it("quantizes a continuous term into discrete bands", () => {
    // 4 bands -> only 0, 1/3, 2/3, 1 are reachable.
    expect(quantizeToonBand(0, 4)).toBe(0);
    expect(quantizeToonBand(0.1, 4)).toBe(0);
    expect(quantizeToonBand(0.3, 4)).toBeCloseTo(1 / 3, 6);
    expect(quantizeToonBand(0.6, 4)).toBeCloseTo(2 / 3, 6);
    expect(quantizeToonBand(1, 4)).toBe(1);
  });

  it("produces exactly `bands` distinct output levels across [0,1]", () => {
    const bands = 5;
    const levels = new Set<number>();
    for (let i = 0; i <= 100; i += 1) {
      levels.add(Number(quantizeToonBand(i / 100, bands).toFixed(6)));
    }
    expect(levels.size).toBe(bands);
  });

  it("clamps band count into the supported range", () => {
    // bands below 2 -> treated as 2 (only 0 and 1).
    expect(quantizeToonBand(0.4, 1)).toBe(0);
    expect(quantizeToonBand(0.6, 1)).toBe(1);
    // bands above 16 -> treated as 16.
    expect(quantizeToonBand(1, 999)).toBe(1);
  });

  it("is monotonic non-decreasing in t", () => {
    let previous = -1;
    for (let i = 0; i <= 50; i += 1) {
      const value = quantizeToonBand(i / 50, 6);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("lifts the darkest band off zero by the shadow floor", () => {
    // ndotl 0 -> darkest band -> exactly the floor.
    expect(toonDiffuseRamp(0, 4, 0.35)).toBeCloseTo(0.35, 6);
    // ndotl 1 -> brightest band -> full strength regardless of floor.
    expect(toonDiffuseRamp(1, 4, 0.35)).toBeCloseTo(1, 6);
    // mid band scales between floor and 1.
    const mid = toonDiffuseRamp(0.6, 4, 0.5);
    expect(mid).toBeCloseTo(0.5 + 0.5 * (2 / 3), 6);
  });

  it("computes a fresnel rim that brightens at grazing angles", () => {
    // Facing camera (ndotv 1) -> no rim.
    expect(toonRimTerm(1, 3, 0.5)).toBeCloseTo(0, 6);
    // Grazing (ndotv 0) -> full rim intensity.
    expect(toonRimTerm(0, 3, 0.5)).toBeCloseTo(0.5, 6);
    // Higher power tightens the rim (less contribution at the same angle).
    expect(toonRimTerm(0.5, 4, 1)).toBeLessThan(toonRimTerm(0.5, 2, 1));
  });

  it("combines banded diffuse and rim into a clamped lit color", () => {
    const color = toonShadeColor({
      baseColor: [1, 0.5, 0],
      ndotl: 1,
      ndotv: 1,
      bands: 4,
      shadowFloor: 0.3,
      lightColor: [1, 1, 1],
      rimColor: [0, 0, 1],
      rimPower: 3,
      rimIntensity: 0.5
    });
    // Fully lit, no rim (ndotv 1) -> base color passes through.
    expect(color[0]).toBeCloseTo(1, 6);
    expect(color[1]).toBeCloseTo(0.5, 6);
    expect(color[2]).toBeCloseTo(0, 6);

    const shadowed = toonShadeColor({
      baseColor: [1, 1, 1],
      ndotl: 0,
      ndotv: 0,
      bands: 4,
      shadowFloor: 0.3,
      lightColor: [1, 1, 1],
      rimColor: [0, 0, 1],
      rimPower: 3,
      rimIntensity: 0.5
    });
    // Darkest band keeps the floor; grazing angle adds full blue rim, clamped.
    expect(shadowed[0]).toBeCloseTo(0.3, 6);
    expect(shadowed[2]).toBeCloseTo(0.3 + 0.5, 6);
  });
});

describe("CartoonToonMaterial integration", () => {
  it("targets the cartoon toon shader and seeds toon uniforms", () => {
    const material = new CartoonToonMaterial({ bands: 5, shadowFloor: 0.4 });
    expect(material.shaderKey).toBe(CARTOON_TOON_SHADER_NAME);
    expect(material.bands).toBe(5);
    expect(material.shadowFloor).toBeCloseTo(0.4, 6);
    expect(material.getParameter("u_toonBands")).toBe(5);
    expect(material.requiredAttributes).toContain("a_normal");
  });

  it("rejects out-of-range band counts", () => {
    expect(() => new CartoonToonMaterial({ bands: 1 })).toThrow();
    expect(() => new CartoonToonMaterial({ bands: 17 })).toThrow();
    expect(() => new CartoonToonMaterial({ bands: 3.5 })).toThrow();
  });

  it("registers a compilable cartoon shader program in the default library", () => {
    const library = createDefaultShaderLibrary();
    expect(library.names()).toContain(CARTOON_TOON_SHADER_NAME);
    const compiled = library.compileSource(CARTOON_TOON_SHADER_NAME);
    expect(compiled.fragment).toContain(CARTOON_TOON_SHADER_MARKER);
    expect(compiled.fragment).toContain("a3dToonQuantize");
  });
});

describe("applyCartoonRenderPreset", () => {
  it("builds a real toon material from the preset and enables the outline pass", () => {
    const preset = createCartoonRenderPreset({ materialStyle: { treatment: "cel" } });
    const width = 8;
    const height = 8;
    const pixels = new Uint8Array(width * height * 4);
    // Paint a bright square so the Sobel pass has edges to find.
    for (let y = 2; y < 6; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        const index = (y * width + x) * 4;
        pixels[index] = 220;
        pixels[index + 1] = 180;
        pixels[index + 2] = 60;
        pixels[index + 3] = 255;
      }
    }

    const result = applyCartoonRenderPreset(preset, { frame: { pixels, width, height } });

    expect(result.material.shaderKey).toBe(CARTOON_TOON_SHADER_NAME);
    // cel rampSteps (4) flows into the toon material band count.
    expect(result.material.bands).toBe(4);
    expect(result.outlineEnabled).toBe(true);
    expect(result.outline?.outlinedPixels ?? 0).toBeGreaterThan(0);
    expect(result.colorGrade).toBeDefined();
    expect(result.appliedToPixels).toMatchObject({ outline: true, colorGrade: true });
  });

  it("skips the outline pass when the style does not request outlines", () => {
    const preset = createCartoonRenderPreset({ materialStyle: { treatment: "preserve-pbr" } });
    const result = applyCartoonRenderPreset(preset);
    expect(result.outlineEnabled).toBe(false);
    expect(result.outline).toBeUndefined();
  });
});
