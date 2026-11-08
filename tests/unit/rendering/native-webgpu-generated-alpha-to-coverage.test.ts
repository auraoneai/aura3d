import { beforeAll, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd03";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerPrd04ShaderFeatures } from "../../../packages/rendering/src/materials/features";
import { registerPrd04MaterialLobes } from "../../../packages/rendering/src/materials/lobes";
import { registerPrd04ShaderChunks } from "../../../packages/rendering/src/shaders/physical/index";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedUnlitProgram } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

beforeAll(() => {
  registerPrd04ShaderChunks();
  registerPrd04MaterialLobes();
  registerPrd04ShaderFeatures();
});

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_MATERIALS: true, A3D_QR_POST: true });

function descriptor(lighting: "unlit" | "lit", alphaMode: "mask" | "opaque" | "blend", a2c: boolean, fraction = false) {
  return generateProgramImpl(normalizeProgramFeatures({ lighting, alphaMode, target: "wgsl",
    features: { ...(lighting === "unlit" ? { "a3d.nativePrimitive": "triangles" } : {}), ...(a2c ? { "prd04.alphaToCoverage": true } : {}),
      ...(fraction ? { "prd03.indirectFraction": "indirectFraction" } : {}) } }), { flags }).descriptor!;
}

describe("generated WebGPU alpha-to-coverage", () => {
  it.each(["unlit", "lit"] as const)("writes sharpened MASK coverage to output alpha for %s programs", (lighting) => {
    const source = descriptor(lighting, "mask", true);
    expect(source.activeFeatures).toContainEqual({ id: "prd04.alphaToCoverage", value: true });
    const program = lighting === "unlit" ? createGeneratedUnlitProgram(source) : createGeneratedPbrProgram(source);
    expect(program.alphaToCoverage).toBe(true);
    expect(program.fragment).toContain("fwidth(");
    expect(program.fragment).toContain("let a3dCoverage = clamp(");
    expect(program.fragment).toContain("if (a3dCoverage <= 0.0) { discard; }");
    expect(program.fragment).not.toMatch(/\.a < material\.(alphaControls|controls)\.x\) \{ discard; \}/);
    expect(program.fragment).toMatch(/a3dCoverage\)|alpha = a3dCoverage/);
  });

  it.each(["unlit", "lit"] as const)("keeps the hard MASK discard without the contributor (%s)", (lighting) => {
    const source = descriptor(lighting, "mask", false);
    const program = lighting === "unlit" ? createGeneratedUnlitProgram(source) : createGeneratedPbrProgram(source);
    expect(program.alphaToCoverage).toBe(false);
    expect(program.fragment).not.toContain("a3dCoverage");
    expect(program.fragment).toMatch(/\.a < material\.(alphaControls|controls)\.x\) \{ discard; \}/);
  });

  it.each(["unlit", "lit"] as const)("keeps coverage alpha and drops the indirect-fraction tag like the WebGL2 chunk (%s, Slingshot Siege)", (lighting) => {
    const source = descriptor(lighting, "mask", true, true);
    const program = lighting === "unlit" ? createGeneratedUnlitProgram(source) : createGeneratedPbrProgram(source);
    expect(program.alphaToCoverage).toBe(true);
    expect(program.requiresFloatColorAttachment).toBe(false);
    expect(program.fragment).toMatch(/a3dCoverage\)|alpha = a3dCoverage/);
    expect(program.fragment).not.toContain("2.0 + clamp(");
    const tagged = descriptor(lighting, "mask", false, true);
    expect((lighting === "unlit" ? createGeneratedUnlitProgram(tagged) : createGeneratedPbrProgram(tagged)).requiresFloatColorAttachment).toBe(true);
  });

  it("refuses coverage metadata outside MASK or without its define", () => {
    const mask = descriptor("unlit", "mask", true);
    const opaque = { ...mask, features: { ...mask.features, alphaMode: "opaque" as const },
      defines: Object.fromEntries(Object.entries(mask.defines).filter(([name]) => name !== "ALPHA_MASK")) };
    expect(() => createGeneratedUnlitProgram(opaque)).toThrow(/outside MASK/);
    const undeclared = { ...mask, defines: Object.fromEntries(Object.entries(mask.defines).filter(([name]) => name !== "ALPHA_TO_COVERAGE")) };
    expect(() => createGeneratedUnlitProgram(undeclared)).toThrow(/ALPHA_TO_COVERAGE/);
  });
});
