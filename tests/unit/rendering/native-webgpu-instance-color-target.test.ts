// Native WebGPU `prd04.instanceColorTarget` "both" and "emissive" (Lamplight Line, Showcase Dot Dash 3D): the generated WGSL PBR
// program multiplies the base by the instance colour (as before) and also the emissive term, like
// a3d_prd04_instance_emissive_frag_call on WebGL2. Source checks only; no GPU execution.
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { A3D_INSTANCE_COLOR_TARGET_FEATURE, registerInstanceColorTargetFeature } from "../../../packages/rendering/src/shaders/chunks/instance_color_target.glsl";

registerInstanceColorTargetFeature();
const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;
const generated = (features: ProgramFeatures["features"], color = true) => generateProgramImpl(normalizeProgramFeatures({
  lighting: "lit", lights, maps: {}, extensions: [], environment: "none", doubleSided: true, instancing: { color }, features
}), { flags }).descriptor!;

describe("native WebGPU instance colour target", () => {
  it("\"both\" multiplies base and emissive (with rim) by the instance colour", () => {
    const both = generated({ [A3D_INSTANCE_COLOR_TARGET_FEATURE]: "both", "prd04.rim": true });
    expect(both.verifiedFeatures).toContain(A3D_INSTANCE_COLOR_TARGET_FEATURE);
    const program = createGeneratedPbrProgram(both);
    expect(program.fragment).toContain("* input.instanceColor;");
    expect(program.fragment).toMatch(/\(material\.emissive\.rgb \* material\.emissive\.a[^;]*material\.rim\.rgb[^;]*\) \* input\.instanceColor\.rgb/);
    const plain = createGeneratedPbrProgram(generated({}));
    expect(plain.fragment).not.toContain("input.instanceColor.rgb");
  });

  it("\"emissive\" reads the colours at the instance colour location and tints only the emissive term", () => {
    const emissive = generated({ [A3D_INSTANCE_COLOR_TARGET_FEATURE]: "emissive" }, false);
    const program = createGeneratedPbrProgram(emissive);
    expect(program.vertex).toContain("@location(12) instanceColor: vec4f");
    expect(program.requiredInstanceLocations).toEqual([8, 9, 10, 11, 12]);
    expect(program.fragment).not.toContain("* input.instanceColor;");
    expect(program.fragment).toMatch(/\(material\.emissive\.rgb \* material\.emissive\.a[^;]*\) \* input\.instanceColor\.rgb/);
  });

  it("leaves the emissive term alone without instance colours; fails closed on unverified contributors", () => {
    expect(createGeneratedPbrProgram(generated({ [A3D_INSTANCE_COLOR_TARGET_FEATURE]: "both" }, false)).fragment).not.toContain("input.instanceColor");
    const both = generated({ [A3D_INSTANCE_COLOR_TARGET_FEATURE]: "both" });
    expect(() => createGeneratedPbrProgram({ ...both, verifiedFeatures: [] })).toThrow(/unverified prd04.instanceColorTarget/);
  });
});
