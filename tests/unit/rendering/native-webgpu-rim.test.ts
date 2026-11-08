// Native WebGPU `prd04.rim`: the generated WGSL PBR program adds the same
// view-dependent rim emission WebGL2 adds through a3d_prd04_rim_call
// (`u_prd04RimColor * u_prd04RimStrength * pow(1 - saturate(N.V), max(power, 0.01))`).
// Source and packing checks only; no GPU execution.
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import {
  createGeneratedPbrProgram,
  GENERATED_PBR_MATERIAL_OFFSETS,
  packGeneratedPbrMaterialUniforms,
  type GeneratedPbrDescriptor
} from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;

function generated(features: ProgramFeatures["features"]) {
  return generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit", lights, maps: {}, extensions: [], environment: "none", doubleSided: true, features
  }), { flags });
}
function descriptor(features: ProgramFeatures["features"]): GeneratedPbrDescriptor {
  const result = generated(features);
  expect(result.descriptor).toBeDefined();
  return result.descriptor!;
}

describe("native WebGPU rim program", () => {
  it("selects the stock rim feature and adds the GLSL rim term to the emitted light", () => {
    const source = generated({ "prd04.rim": true });
    expect(source.fragment).toContain("pow( 1.0 - saturate( dot( N, V ) ), max( u_prd04RimPower, 0.01 ) )");
    const rim = source.descriptor!;
    expect(rim.activeFeatures).toContainEqual({ id: "prd04.rim", value: true });
    expect(rim.defines.A3D_PRD04_RIM).toBe(1);
    expect(rim.verifiedFeatures).toContain("prd04.rim");
    const program = createGeneratedPbrProgram(rim);
    expect(program.fragment).toContain("+ material.rim.rgb * (material.rim.a * pow(1.0 - clamp(dot(n, view), 0.0, 1.0), max(material.rimParams.x, 0.01)))");
    // Added with the emissive term, before fog.
    expect(program.fragment.indexOf("material.rim.rgb")).toBeLessThan(program.fragment.lastIndexOf("return "));

    const plain = createGeneratedPbrProgram(descriptor({}));
    expect(plain.fragment).not.toContain("material.rim.rgb *");
  });

  it("fails closed on unverified or inconsistent rim metadata", () => {
    const rim = descriptor({ "prd04.rim": true });
    expect(() => createGeneratedPbrProgram({ ...rim, verifiedFeatures: [] })).toThrow(/unverified prd04.rim/);
    const noDefine = { ...rim.defines }; delete (noDefine as Record<string, unknown>).A3D_PRD04_RIM;
    expect(() => createGeneratedPbrProgram({ ...rim, defines: noDefine })).toThrow(/rim define/);
    expect(() => createGeneratedPbrProgram({ ...rim, features: { ...rim.features, features: { ...rim.features.features, "prd04.rim": false } } })).toThrow(/rim metadata/);
    expect(() => createGeneratedPbrProgram({ ...rim, activeFeatures: rim.activeFeatures.map((item) => item.id === "prd04.rim" ? { ...item, value: 2 } : item) })).toThrow(/rim metadata/);
  });

  it("packs the rim color, strength and power with the feature's defaults", () => {
    const read = (packed: Uint8Array, field: string, count: number) => {
      const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
      return Array.from({ length: count }, (_, index) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[field]! + index * 4, true));
    };
    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_prd04RimColor", new Float32Array([0.25, 0.5, 1])], ["u_prd04RimStrength", 2], ["u_prd04RimPower", 4]
    ]));
    expect(read(packed, "rim", 4)).toEqual([0.25, 0.5, 1, 2]);
    expect(read(packed, "rimParams", 1)).toEqual([4]);
    const defaults = packGeneratedPbrMaterialUniforms(new Map());
    expect(read(defaults, "rim", 4)).toEqual([1, 1, 1, 0]);
    expect(read(defaults, "rimParams", 1)).toEqual([3]);
  });
});
