import { describe, expect, it } from "vitest";
import { ldrFragmentSource } from "../../../packages/rendering/src/webgl2/LdrPostprocessShader";
import { TONE_MAPPING_OPERATORS_GLSL } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";

/**
 * Lane 521: the fused LDR present's AgX (operator 5) was a per-channel log2(1 + x) / log2(17) smoothstep that mapped
 * scene white to 0.15 and mid grey to about 0.01, so looks whose post preset names agx rendered near black (Pip's Big
 * Leap, Aura Diamond, Teleoperator on 5.0.3). It now runs the same coupled AgX transform as the output pass.
 */
const variant = (operator: number) => ({ toneMapping: true, operator, inputSrgb: false, outputSrgb: true, grade: true, sharpening: false, fxaa: false });

const numbers = (source: string): string[] => source.match(/-?\d+\.\d{4,}/g) ?? [];

describe("LDR present AgX (operator 5)", () => {
  it("uses the output pass's coupled AgX transform, not the per-channel log2(17) curve", () => {
    const source = ldrFragmentSource(variant(5));
    expect(source).toContain("agxToneMap(");
    expect(source).not.toContain("log2(17.0)");
    const agxStart = TONE_MAPPING_OPERATORS_GLSL.indexOf("vec3 a3dAgxContrast");
    const agxEnd = TONE_MAPPING_OPERATORS_GLSL.indexOf("// Filmic Cineon");
    const reference = numbers(TONE_MAPPING_OPERATORS_GLSL.slice(agxStart, agxEnd));
    expect(reference.length).toBeGreaterThan(20);
    for (const constant of reference) expect(source).toContain(constant);
  });

  it("guards the AgX block so only the AgX variant compiles it", () => {
    const source = ldrFragmentSource(variant(2));
    expect(source).toContain("#define LDR_OP 2");
    const guard = source.indexOf("#if LDR_TONE && LDR_OP == 5");
    expect(guard).toBeGreaterThan(-1);
    expect(source.indexOf("vec3 agxToneMap(")).toBeGreaterThan(guard);
  });
});
