/**
 * Equation-based output fixtures, independently evaluated with 40-digit
 * decimal arithmetic. Inputs are linear RGB, outputs are linear display RGB.
 * ACES uses Hill's published RRT/ODT fit and Aura3D's 1/0.6 viewing scale;
 * AgX uses its published Rec.2020/log-window/contrast fit; Neutral uses the
 * Khronos PBR Neutral shoulder; Reinhard and Cineon use their published curves.
 * No renderer or external engine is used to generate expected values.
 */
import { describe, expect, it } from "vitest";
import { convertColorPrimaries } from "../../../packages/rendering/src/ColorManagement";
import {
  TONE_MAPPING_OPERATORS_GLSL,
  TONE_MAP_OPERATOR_FUNCTIONS,
  outputFragmentGlsl
} from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { applyToneOperator, cineonToneMapping, type AuraToneOperator, type Vec3 } from "../../../packages/rendering/src/post/ToneOperators";

type Curves = Record<Exclude<AuraToneOperator, "none"> | "cineon", Vec3>;
const vectors: ReadonlyArray<{ rgb: Vec3; exposure: number; expected: Curves }> = [
  { rgb: [0.18, 0.18, 0.18], exposure: 1, expected: {
    linear: [0.18, 0.18, 0.18], reinhard: [0.15254237288135594, 0.15254237288135594, 0.15254237288135594],
    aces: [0.21310544571434542, 0.21310544571434542, 0.21310331465988827],
    agx: [0.2145486286745265, 0.2145023561903318, 0.21449916529489968],
    neutral: [0.14, 0.14, 0.14], cineon: [0.22539971268334738, 0.22539971268334738, 0.22539971268334738]
  } },
  { rgb: [4, 0.5, 0.05], exposure: 1, expected: {
    linear: [1, 0.5, 0.05], reinhard: [0.8, 0.3333333333333333, 0.047619047619047616],
    aces: [1, 0.6707587803828611, 0.241899654102384],
    agx: [0.9887944311400594, 0.5237276256598431, 0.3323373533911305],
    neutral: [0.9832831489207328, 0.3836839441082594, 0.3065926177752271],
    cineon: [0.9018619377808262, 0.5006992230350052, 0.04278159669306629]
  } },
  { rgb: [0.001, 0.02, 0.08], exposure: 0.5, expected: {
    linear: [0.0005, 0.01, 0.04], reinhard: [0.0004997501249375312, 0.009900990099009901, 0.038461538461538464],
    aces: [0, 0.002378958611349256, 0.01885542156434971],
    agx: [0, 0.008896571605969341, 0.05026231682397297],
    neutral: [0.0000015625, 0.0095015625, 0.0395015625],
    cineon: [0, 0.0011304654609133194, 0.029457522477670587]
  } },
  { rgb: [2, 1, 0.3], exposure: 2, expected: {
    linear: [1, 1, 0.6], reinhard: [0.8, 0.6666666666666666, 0.375],
    aces: [0.9695249890142695, 0.892405105184493, 0.7203211071828237],
    agx: [0.8887275333055021, 0.7418918651791848, 0.5638306185968361],
    neutral: [0.9832558139534884, 0.6399513870477753, 0.3996382882137761],
    cineon: [0.9018619377808262, 0.8181262844941596, 0.552046273734273]
  } }
];

/** Evaluate the component-wise Cineon GLSL arithmetic as a scalar program. */
function scalarCineonFromShader(): (color: number) => number {
  const body = /vec3\s+CineonToneMapping\s*\(\s*vec3\s+color\s*\)\s*\{([^}]+)\}/.exec(TONE_MAPPING_OPERATORS_GLSL)?.[1];
  if (!body) throw new Error("Cineon output shader not found");
  const javascript = body.replace(/vec3\s+(\w+)\s*=/g, "const $1 =")
    .replace(/vec3\(([^()]*)\)/g, "($1)")
    .replace(/\b(max|pow)\s*\(/g, "Math.$1(");
  return new Function("color", javascript) as (color: number) => number;
}

describe("independent output tone equations", () => {
  for (const { rgb, exposure, expected } of vectors) {
    it(`agrees with decimal-reference values for [${rgb}] at exposure ${exposure}`, () => {
      for (const operator of ["linear", "reinhard", "aces", "agx", "neutral"] as const) {
        const actual = applyToneOperator(operator, rgb, exposure);
        actual.forEach((channel, index) => expect(channel, `${operator} channel ${index}`).toBeCloseTo(expected[operator][index]!, 9));
      }
      cineonToneMapping(rgb, exposure).forEach((channel, index) => expect(channel).toBeCloseTo(expected.cineon[index]!, 9));
    });
  }

  it("applies exposure exactly once and preserves bounded black and HDR output", () => {
    for (const operator of ["none", "linear", "reinhard", "aces", "agx", "neutral"] as const) {
      const scaled = applyToneOperator(operator, [0.05, 0.7, 2], 2);
      const preExposed = applyToneOperator(operator, [0.1, 1.4, 4], 1);
      scaled.forEach((channel, index) => {
        expect(channel).toBeCloseTo(preExposed[index]!, 10);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      });
      applyToneOperator(operator, [0, 0, 0]).forEach((channel) => expect(channel).toBeCloseTo(0, 5));
    }
  });

  it("evaluates the actual Cineon shader across the toe and HDR range", () => {
    const shader = scalarCineonFromShader();
    let previous = -1;
    for (let i = 0; i <= 1024; i += 1) {
      const input = i / 64;
      const value = shader(input);
      expect(value).toBeCloseTo(cineonToneMapping([input, 0, 0], 1)[0], 12);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
    expect(shader(0)).toBe(0);
    expect(shader(8)).toBeGreaterThan(0.9);
  });

  it("handles negative radiance safely before destination-gamut clipping", () => {
    const body = /float\s+a3dReinhardChannel\s*\(\s*float\s+value\s*\)\s*\{([^}]+)\}/.exec(TONE_MAPPING_OPERATORS_GLSL)?.[1];
    expect(body).toBeDefined();
    const shaderChannel = new Function("value", body!) as (value: number) => number;
    for (const value of [-2, -1, -0.00001, 0, 0.25, 2]) {
      const expected = value < 0 ? value : value / (1 + value);
      expect(shaderChannel(value)).toBeCloseTo(expected, 12);
      expect(Number.isFinite(shaderChannel(value))).toBe(true);
      expect(applyToneOperator("reinhard", [value, 0, 0])[0]).toBeCloseTo(Math.max(0, expected), 12);
    }
    for (const operator of ["aces", "agx", "neutral"] as const) {
      for (const negative of [-2, -1, -0.00001]) {
        const mapped = applyToneOperator(operator, [negative, 0.1, 0.5]);
        const blackInput = applyToneOperator(operator, [0, 0.1, 0.5]);
        mapped.forEach((value, channel) => expect(value).toBeCloseTo(blackInput[channel]!, 12));
      }
    }
  });

  it("selects every operator in the output pass and applies it once before encoding", () => {
    for (const [operator, name] of Object.entries(TONE_MAP_OPERATOR_FUNCTIONS)) {
      const fragment = outputFragmentGlsl({ toneMapping: operator, backgroundCoverage: false, overlay: false });
      expect(fragment).toContain(`#define TONE_MAP(c) ${name}(c)`);
      expect(fragment).toContain(`vec3 ${name}(`);
      expect(fragment.indexOf("TONE_MAP(hdr * u_exposure)")).toBeLessThan(fragment.indexOf("a3dLinearToSRGB(clamp(a3dOutputGamut(display)"));
    }
  });

  it("enables coverage uniforms before the prologue is preprocessed", () => {
    const fragment = outputFragmentGlsl({ toneMapping: "aces", backgroundCoverage: true, overlay: true, vignette: true });
    expect(fragment.indexOf("#define BACKGROUND_COVERAGE")).toBeLessThan(fragment.indexOf("#ifdef BACKGROUND_COVERAGE"));
    expect(fragment).toContain("uniform sampler2D u_coverage;");
  });

  it("selects wide-gamut and alpha behavior explicitly", () => {
    const options = { toneMapping: "aces", backgroundCoverage: false, overlay: true };
    const legacy = outputFragmentGlsl(options);
    expect(legacy).not.toContain("#define OUTPUT_DISPLAY_P3");
    expect(legacy).not.toContain("#define OUTPUT_ALPHA_PRESERVE");

    const p3 = outputFragmentGlsl({ ...options, outputColorSpace: "display-p3", alphaMode: "premultiplied" });
    expect(p3).toContain("#define OUTPUT_DISPLAY_P3");
    expect(p3).toContain("#define OUTPUT_ALPHA_PRESERVE");
    expect(p3).toContain("#define OUTPUT_ALPHA_PREMULTIPLIED");
    expect(p3.indexOf("a3dOutputGamut(display)")).toBeLessThan(p3.indexOf("encoded *= clamp(scene.a"));
    expect(p3.indexOf("a3dApplyOutputOverlay(encoded, v_uv)")).toBeLessThan(p3.indexOf("encoded *= clamp(scene.a"));
    const straight = outputFragmentGlsl({ ...options, alphaMode: "straight" });
    expect(straight).toContain("#define OUTPUT_ALPHA_PRESERVE");
    expect(straight).not.toContain("#define OUTPUT_ALPHA_PREMULTIPLIED");
    expect(straight).toContain("defined(OUTPUT_ALPHA_PRESERVE)");
    expect(() => outputFragmentGlsl({ ...options, alphaMode: "invalid" as never })).toThrow("OUTPUT_ALPHA_MODE_UNSUPPORTED");
    expect(() => outputFragmentGlsl({ ...options, outputColorSpace: "invalid" as never })).toThrow("OUTPUT_COLOR_SPACE_UNSUPPORTED");
  });

  it("uses the D65 color-management conversion in the Display-P3 shader", () => {
    const fragment = outputFragmentGlsl({ toneMapping: "linear", backgroundCoverage: false, overlay: false, outputColorSpace: "display-p3" });
    const matrix = /return a3dToneRows\(linearSrgb,\s*vec3\(([^)]*)\),\s*vec3\(([^)]*)\),\s*vec3\(([^)]*)\)\)/.exec(fragment);
    expect(matrix).not.toBeNull();
    const rows = matrix!.slice(1, 4).map((row) => row!.split(",").map(Number));
    const bases: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [0.3, 0.7, 0.2]];
    for (const basis of bases) {
      const converted = convertColorPrimaries(basis, "srgb", "display-p3");
      rows.forEach((row, channel) => {
        const actual = row.reduce((sum, coefficient, index) => sum + coefficient * basis[index]!, 0);
        expect(actual).toBeCloseTo(converted[channel]!, 12);
      });
    }
  });
});
