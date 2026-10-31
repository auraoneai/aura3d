/**
 * GU47 E-D ED-1: `rim: { color, power, intensity }` on the forward PBR program.
 *
 * The engine lowers the spec (primitive nodes: `applyNodeMaterialExtras`; model nodes and handles:
 * `lowerModelMaterialOverrides` + `applyMaterialOverrides`) onto the PRD-04 `prd04.rim` feature's parameters. A material
 * without rim (or whose rim was removed again) selects no feature and generates the byte-identical program.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd04";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { Material } from "../../../../packages/rendering/src/Material";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import { selectShaderFeatureBits } from "../../../../packages/rendering/src/program/FeatureSelect";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../../packages/rendering/src";
import {
  A3D_RIM_COLOR_PARAM,
  A3D_RIM_FEATURE,
  A3D_RIM_FUNCTION_GLSL,
  A3D_RIM_INTENSITY_PARAM,
  A3D_RIM_POWER_PARAM,
  materialRimIntensity
} from "../../../../packages/rendering/src/shaders/chunks/rim.glsl";
import {
  MATERIAL_RIM_COLOR_PARAM,
  MATERIAL_RIM_INTENSITY_PARAM,
  MATERIAL_RIM_POWER_PARAM,
  applyMaterialOverrides,
  applyNodeMaterialExtras,
  lowerMaterialRim,
  lowerModelMaterialOverrides,
  setMaterialRimParameters,
  snapshotMaterials
} from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";

const FLAGS = resolveQrFlags({ env: { A3D_QR: "core,materials" } });
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function pbr(name = "rim-test"): PBRMaterial {
  return new PBRMaterial({ name, baseColor: [0.4, 0.5, 0.6, 1], roughness: 0.5, metallic: 0 });
}

function program(material: Material) {
  const item = { geometry: Geometry.litCube(1), material, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } as unknown as RenderItem;
  const tier = QUALITY_TIERS.high;
  const bits = selectShaderFeatureBits({ item, pass: "forward", tier, flags: FLAGS as never });
  const mf = material.programFeatures({ flags: FLAGS as never, tier });
  const out = generateProgramImpl(normalizeProgramFeatures({ ...mf, lights: LIGHT1, features: { ...mf.features, ...bits } }), { flags: FLAGS as never });
  return { bits, vertex: out.vertex, fragment: out.fragment };
}

describe("GU47 ED-1 rim lowering", () => {
  it("mirrors the rendering parameter names (engine cannot import the chunk module)", () => {
    expect([MATERIAL_RIM_COLOR_PARAM, MATERIAL_RIM_POWER_PARAM, MATERIAL_RIM_INTENSITY_PARAM]).toEqual([A3D_RIM_COLOR_PARAM, A3D_RIM_POWER_PARAM, A3D_RIM_INTENSITY_PARAM]);
    expect(A3D_RIM_FEATURE).toBe("prd04.rim");
  });

  it("lowers colour to linear rgb with power 3 / intensity 1 defaults and clamps", () => {
    expect(lowerMaterialRim(undefined)).toBeUndefined();
    const lowered = lowerMaterialRim({ color: "#ffffff" });
    expect(lowered).toEqual({ color: [1, 1, 1], power: 3, intensity: 1 });
    const mid = lowerMaterialRim({ color: "#808080", power: 99, intensity: -2 })!;
    expect(mid.color[0]).toBeCloseTo(0.2159, 3);
    expect(mid.power).toBe(16);
    expect(mid.intensity).toBe(0);
    const spec = { color: "#ff0000", power: 2, intensity: 0.5 };
    expect(lowerMaterialRim(spec)).toBe(lowerMaterialRim(spec));
  });

  it("writes only on change and clears to intensity 0", () => {
    const material = pbr();
    const rim = lowerMaterialRim({ color: "#00ff00", power: 2, intensity: 1.5 })!;
    expect(setMaterialRimParameters(material, rim)).toBe(true);
    const revision = material.getRevision();
    expect(setMaterialRimParameters(material, rim)).toBe(false);
    expect(material.getRevision()).toBe(revision);
    expect(material.getParameter(A3D_RIM_INTENSITY_PARAM)).toBe(1.5);
    expect(material.getParameter(A3D_RIM_POWER_PARAM)).toBe(2);
    expect(Array.from(material.getParameter(A3D_RIM_COLOR_PARAM) as number[])).toEqual([0, 1, 0]);
    expect(materialRimIntensity(material)).toBe(1.5);
    expect(setMaterialRimParameters(material, undefined)).toBe(true);
    expect(materialRimIntensity(material)).toBe(0);
    expect(setMaterialRimParameters(material, undefined)).toBe(false);
    // a material that never had a rim is not touched
    const plain = pbr();
    expect(setMaterialRimParameters(plain, undefined)).toBe(false);
    expect(plain.getParameter(A3D_RIM_INTENSITY_PARAM)).toBeUndefined();
  });
});

describe("GU47 ED-1 rim on the generated forward program", () => {
  it("a material with rim selects prd04.rim and the lit program adds the rim to the emitted light", () => {
    const material = pbr();
    applyNodeMaterialExtras(material, { rim: { color: "#ffaa00", power: 2.5, intensity: 1.2 } }, undefined);
    const out = program(material);
    expect(out.bits[A3D_RIM_FEATURE]).toBe(true);
    expect(out.fragment).toContain("uniform float u_prd04RimStrength;");
    const main = out.fragment.slice(out.fragment.indexOf("void main() {"));
    expect(main.indexOf("a3dEmissive += u_prd04RimColor")).toBeGreaterThan(main.indexOf("vec3 a3dEmissive ="));
  });

  it("materials without rim, and with rim removed again, compile to byte-identical programs", () => {
    const baseline = program(pbr());
    expect(baseline.bits[A3D_RIM_FEATURE]).toBeUndefined();
    expect(baseline.fragment).not.toContain("u_prd04Rim");

    const toggled = pbr();
    applyNodeMaterialExtras(toggled, { rim: { color: "#ffffff" } }, undefined);
    expect(program(toggled).fragment).not.toBe(baseline.fragment);
    applyNodeMaterialExtras(toggled, {}, undefined);
    const cleared = program(toggled);
    expect(cleared.bits).toEqual(baseline.bits);
    expect(cleared.vertex).toBe(baseline.vertex);
    expect(cleared.fragment).toBe(baseline.fragment);
  });

  it("shares the a3dRim() GLSL without pow (safe-pow composable)", () => {
    expect(A3D_RIM_FUNCTION_GLSL).toContain("vec3 a3dRim(vec3 n, vec3 v, vec3 color, float power, float intensity)");
    expect(A3D_RIM_FUNCTION_GLSL).not.toMatch(/\bpow\s*\(/);
  });
});

describe("GU47 ED-1 rim on model materials (override path)", () => {
  function glbMaterials(): Material[] {
    return [
      new Material({ name: "body", shaderKey: "test", parameters: { u_baseColorFactor: [1, 1, 1, 1], u_emissiveColor: [0, 0, 0], u_emissiveStrength: 0 } as never }),
      new Material({ name: "visor", shaderKey: "test", parameters: { u_baseColorFactor: [0.2, 0.2, 0.2, 1] } as never })
    ];
  }

  it("model(asset, { material: { rim } }) lowers to a rim override written on every material", () => {
    const lowered = lowerModelMaterialOverrides({ rim: { color: "#ffffff", intensity: 2 } }, undefined);
    expect(lowered).toEqual([{ rim: { color: [1, 1, 1], power: 3, intensity: 2 } }]);
    const mats = glbMaterials();
    applyMaterialOverrides(snapshotMaterials(mats), mats, lowered);
    expect(mats.map((m) => materialRimIntensity(m))).toEqual([2, 2]);
  });

  it("a targeted override writes only its material and an override list without rim removes it", () => {
    const mats = glbMaterials();
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, lowerModelMaterialOverrides(undefined, [{ target: "visor", rim: { color: "#00ffff", power: 4 } }]));
    expect(mats.map((m) => materialRimIntensity(m))).toEqual([0, 1]);
    expect(mats[1]!.getParameter(A3D_RIM_POWER_PARAM)).toBe(4);
    applyMaterialOverrides(snapshot, mats, lowerModelMaterialOverrides(undefined, [{ roughness: 0.4 }]));
    expect(mats.map((m) => materialRimIntensity(m))).toEqual([0, 0]);
  });
});

describe("GU47 phase 2: the material-rim receipt harness geometry", () => {
  it("primitives.sphere is unit-diameter, so the harness scales it by 2 for its radius-1 band maths", async () => {
    const { createPrimitiveGeometry } = await import("../../../../packages/rendering/src/geometry/Primitives");
    const bounds = createPrimitiveGeometry("sphere", undefined, { primitiveSegments: "full" } as never).bounds;
    expect(bounds.max[0]).toBeCloseTo(0.5, 5);
    expect(bounds.min[0]).toBeCloseTo(-0.5, 5);
    const { readFileSync } = await import("node:fs");
    const harness = readFileSync(new URL("../../../browser/gu47/material-rim-harness.ts", import.meta.url), "utf8");
    expect(harness).toContain("const SPHERE_SCALE = SPHERE_RADIUS * 2;");
    expect(harness).toContain(".scale([SPHERE_SCALE, SPHERE_SCALE, SPHERE_SCALE])");
  });
});
