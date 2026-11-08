import { describe, expect, it } from "vitest";
import { ldrFragmentSource, ldrVariantKey } from "../../../packages/rendering/src/webgl2/LdrPostprocessShader";
import { TONE_MAPPING_OPERATORS_GLSL } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { neutralToneCurve, setNeutralToneCurve } from "../../../packages/rendering/src/output/neutralToneCurve";
import { neutralToneMapping } from "../../../packages/rendering/src/post/ToneOperators";
import { neutralToneMapInverse } from "../../../packages/engine/src/agent-api/colorUtils";

/**
 * N3 plain parity: the fused WebGL2 LDR present ran `toneMapping: "neutral"` as a per-channel x (1 + x / 7.5) / (1 + x)
 * curve (scene white -> sRGB ~198), so plain scenes read darker and greyer than their authored colours. Plain apps now
 * select Khronos PBR Neutral there (operator 7, the output pass's curve); every other app keeps operator 6.
 */
const variant = (operator: number) => ({ toneMapping: true, operator, inputSrgb: false, outputSrgb: true, grade: false, sharpening: false, fxaa: false });
const numbers = (source: string): string[] => source.match(/\d+\.\d+/g) ?? [];

describe("plain look PBR Neutral on the LDR present", () => {
  it("operator 7 compiles the output pass's Khronos PBR Neutral, operator 6 keeps the legacy curve", () => {
    const khronos = ldrFragmentSource(variant(7));
    expect(khronos).toContain("#define LDR_OP 7");
    expect(khronos).toContain("pbrNeutralToneMap(");
    const start = TONE_MAPPING_OPERATORS_GLSL.indexOf("vec3 NeutralToneMapping");
    const reference = TONE_MAPPING_OPERATORS_GLSL.slice(start, TONE_MAPPING_OPERATORS_GLSL.indexOf("\n}", start));
    for (const constant of numbers(reference)) expect(khronos).toContain(constant);
    expect(ldrVariantKey(variant(7))).not.toBe(ldrVariantKey(variant(6)));
    const legacy = ldrFragmentSource(variant(6));
    expect(legacy).toContain("#define LDR_OP 6");
    expect(legacy).toContain("return neutral(exposed);");
  });

  it("the curve is chosen per device and defaults to legacy", () => {
    const a = {};
    const b = {};
    expect(neutralToneCurve(a)).toBe("legacy");
    setNeutralToneCurve(a, "khronos");
    expect(neutralToneCurve(a)).toBe("khronos");
    expect(neutralToneCurve(b)).toBe("legacy");
    setNeutralToneCurve(a, "legacy");
    expect(neutralToneCurve(a)).toBe("legacy");
  });

  it("the plain clear colour inverts PBR Neutral, so the background presents as authored", () => {
    const displays: [number, number, number][] = [[0.005, 0.007, 0.018], [0.0144, 0.0168, 0.0242], [0.2, 0.5, 0.1], [0.9, 0.85, 0.8], [0.8, 0.3, 0.05], [0, 0, 0]];
    for (const display of displays) {
      const roundTrip = neutralToneMapping(neutralToneMapInverse(display), 1);
      for (let i = 0; i < 3; i++) expect(roundTrip[i]).toBeCloseTo(display[i]!, 4);
    }
  });
});
