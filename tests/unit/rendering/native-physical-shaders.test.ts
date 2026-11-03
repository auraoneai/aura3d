import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd04";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import {
  a3dDistanceFalloff,
  a3dHemisphereIrradiance,
  a3dPhysicalDirectReference,
  type AuraPhysicalReferenceMaterial
} from "../../../packages/rendering/src/shaders/chunks/lighting_mirrors";
import { integrateGgxDfg } from "../../../packages/rendering/src/program/DFGLutData";
import { BRDF_CHUNK_GLSL } from "../../../packages/rendering/src/program/chunks/brdf.glsl";
import { PHYSICAL_LIGHTING_WGSL } from "../../../packages/rendering/src/webgpu/PhysicalLighting.wgsl";
import { A3D_SHEEN_ALBEDO_LUT, A3D_PRD04_SHEEN } from "../../../packages/rendering/src/shaders/physical/sheen.glsl";

type Vec3 = readonly [number, number, number];
const N: Vec3 = [0, 0, 1];
const WHITE: Vec3 = [1, 1, 1];
const material = (overrides: Partial<AuraPhysicalReferenceMaterial> = {}): AuraPhysicalReferenceMaterial => ({
  baseColor: WHITE,
  metallic: 0,
  roughness: 0.5,
  ior: 1.5,
  specularIntensity: 1,
  specularColorFactor: WHITE,
  diffuseRoughness: 0,
  retroreflection: 0,
  ...overrides
});
const direction = (cosine: number, azimuth = 0): Vec3 => {
  const radial = Math.sqrt(1 - cosine * cosine);
  return [radial * Math.cos(azimuth), radial * Math.sin(azimuth), cosine];
};

describe("native physical shader reference", () => {
  it("conserves energy under a uniform white hemisphere across view angles and roughness", () => {
    const rows = 32, columns = 64;
    for (const roughness of [0.4, 0.7, 1]) {
      const lightDfg = Array.from({ length: rows }, (_, row) =>
        integrateGgxDfg(roughness, (row + 0.5) / rows, 256));
      for (const nv of [0.3, 0.7, 1]) {
        const view = direction(nv);
        const viewDfg = integrateGgxDfg(roughness, nv, 1024);
        for (const metallic of [0, 1]) {
          let sum = 0;
          for (let row = 0; row < rows; row += 1) {
            const nl = (row + 0.5) / rows;
            for (let column = 0; column < columns; column += 1) {
              const light = direction(nl, 2 * Math.PI * (column + 0.5) / columns);
              const out = a3dPhysicalDirectReference(N, view, light, WHITE,
                material({ roughness, metallic }), viewDfg, lightDfg[row]!);
              sum += (out.diffuse[0] + out.specular[0]) * 2 * Math.PI / (rows * columns);
            }
          }
          expect(sum, `roughness=${roughness}, N·V=${nv}, metalness=${metallic}`).toBeGreaterThan(0);
          expect(sum, `roughness=${roughness}, N·V=${nv}, metalness=${metallic}`).toBeLessThanOrEqual(1.01);
        }
      }
    }
  });

  it("is reciprocal with the view and light DFG samples exchanged", () => {
    const view = direction(0.45, 0.1), light = direction(0.8, 1.7);
    const viewDfg = integrateGgxDfg(0.65, view[2], 1024);
    const lightDfg = integrateGgxDfg(0.65, light[2], 1024);
    const m = material({ roughness: 0.65, diffuseRoughness: 0.6, retroreflection: 0.4 });
    const forward = a3dPhysicalDirectReference(N, view, light, WHITE, m, viewDfg, lightDfg);
    const reverse = a3dPhysicalDirectReference(N, light, view, WHITE, m, lightDfg, viewDfg);
    for (let i = 0; i < 3; i += 1) {
      expect(forward.diffuse[i]! / light[2]).toBeCloseTo(reverse.diffuse[i]! / view[2], 10);
      expect(forward.specular[i]! / light[2]).toBeCloseTo(reverse.specular[i]! / view[2], 10);
    }
  });

  it("changes rough diffuse and retroreflection without altering specular", () => {
    const view = direction(0.6), light = direction(0.6, Math.PI);
    const dfg = integrateGgxDfg(0.5, 0.6, 1024);
    const base = a3dPhysicalDirectReference(N, view, light, WHITE, material(), dfg, dfg);
    const rough = a3dPhysicalDirectReference(N, view, light, WHITE, material({ diffuseRoughness: 1 }), dfg, dfg);
    const retro = a3dPhysicalDirectReference(N, view, light, WHITE, material({ retroreflection: 1 }), dfg, dfg);
    const aligned = a3dPhysicalDirectReference(N, view, view, WHITE, material({ retroreflection: 1 }), dfg, dfg);
    const alignedDefault = a3dPhysicalDirectReference(N, view, view, WHITE, material(), dfg, dfg);
    expect(rough.diffuse[0]).toBeLessThan(base.diffuse[0]);
    expect(retro.diffuse[0]).toBeLessThan(base.diffuse[0]);
    expect(aligned.diffuse[0]).toBeCloseTo(alignedDefault.diffuse[0], 10);
    expect(rough.specular).toEqual(base.specular);
    expect(retro.specular).toEqual(base.specular);
  });

  it("rejects invalid reference inputs and produces zero for back-facing light", () => {
    const dfg = [0.7, 0.1] as const;
    expect(a3dPhysicalDirectReference(N, N, [0, 0, -1], WHITE, material(), dfg, dfg))
      .toEqual({ diffuse: [0, 0, 0], specular: [0, 0, 0] });
    expect(() => a3dPhysicalDirectReference(N, N, [0, 0, 0], WHITE, material(), dfg, dfg)).toThrow(/unit vectors/);
    expect(() => a3dPhysicalDirectReference(N, N, N, WHITE, material({ ior: Number.NaN }), dfg, dfg)).toThrow(/finite/);
  });

  it("exposes matching generated shader controls on both language paths", () => {
    expect(BRDF_CHUNK_GLSL).toContain("uniform float u_diffuseRoughness;");
    expect(BRDF_CHUNK_GLSL).toContain("uniform float u_retroreflection;");
    expect(BRDF_CHUNK_GLSL).toContain("m.diffuseRoughness");
    expect(PHYSICAL_LIGHTING_WGSL).toContain("fn a3dPhysicalDirect(");
    expect(PHYSICAL_LIGHTING_WGSL).toContain("fn a3dPhysicalIndirect(");
    expect(PHYSICAL_LIGHTING_WGSL).toContain("diffuseRoughness: f32");
    expect(PHYSICAL_LIGHTING_WGSL).toContain("retroreflection: f32");
  });
});

describe("independent light equations", () => {
  it("uses inverse-square scaling and vanishes at the finite cutoff", () => {
    expect(a3dDistanceFalloff(2, 0, 2)).toBeCloseTo(0.25);
    expect(a3dDistanceFalloff(4, 0, 2)).toBeCloseTo(0.0625);
    expect(a3dDistanceFalloff(4, 4, 2)).toBe(0);
    expect(a3dDistanceFalloff(5, 4, 2)).toBe(0);
    expect(a3dDistanceFalloff(0, 0, 2)).toBe(100);
    expect(a3dDistanceFalloff(0, 0, 0)).toBe(1);
  });

  it("interpolates sky and ground and handles a degenerate direction deterministically", () => {
    const sky: Vec3 = [1, 0.8, 0.6], ground: Vec3 = [0.2, 0.1, 0];
    expect(a3dHemisphereIrradiance(sky, ground, N, N)).toEqual(sky);
    expect(a3dHemisphereIrradiance(sky, ground, N, [0, 0, -1])).toEqual(ground);
    expect(a3dHemisphereIrradiance(sky, ground, [0, 0, 0], N)).toEqual([0.6, 0.45, 0.3]);
  });
});

describe("independently integrated sheen table", () => {
  // Importance sampling of D(H) * N·H; the Jacobian from H to L is 4(V·H).
  function integrateSheen(nv: number, roughness: number, samples: number): number {
    const v = Math.max(nv, 0.0001);
    const vx = Math.sqrt(1 - v * v);
    const exponent = 0.5 / Math.max(roughness * roughness, 0.0001);
    let sum = 0;
    for (let i = 0; i < samples; i += 1) {
      let bits = i >>> 0;
      bits = ((bits << 16) | (bits >>> 16)) >>> 0;
      bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
      bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
      bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
      bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
      const angle = 2 * Math.PI * bits / 4294967296;
      const sin2 = ((i + 0.5) / samples) ** (1 / (exponent + 1));
      const nh = Math.sqrt(1 - sin2);
      const vh = vx * Math.sqrt(sin2) * Math.cos(angle) + v * nh;
      const nl = 2 * vh * nh - v;
      if (vh <= 0 || nl <= 0) continue;
      const visibility = Math.min(1 / Math.max(4 * (nl + v - nl * v), 1e-8), 1);
      sum += 4 * visibility * nl * vh / Math.max(nh, 1e-8);
    }
    return Math.min(1, Math.max(0, sum / samples));
  }

  it("matches independent quadrature for representative roughness and view angles", () => {
    expect(A3D_SHEEN_ALBEDO_LUT).toHaveLength(256);
    for (const value of A3D_SHEEN_ALBEDO_LUT) {
      expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true);
    }
    for (const [row, col] of [[0, 15], [3, 5], [8, 10], [12, 4], [15, 15]]) {
      const expected = integrateSheen(row! / 15, Math.max(col! / 15, 0.01), 8192);
      expect(A3D_SHEEN_ALBEDO_LUT[row! * 16 + col!]!).toBeCloseTo(expected, 6);
    }
    expect(A3D_PRD04_SHEEN.glsl).toContain("a3dPrd04SheenAlbedo[256]");
  });
});

it("generates a combined physical shader with all requested lobes", () => {
  const flags = { values: { A3D_QR_MATERIALS: true }, on: (name: string) => name === "A3D_QR_MATERIALS" };
  const extensions = ["clearcoat", "sheen", "iridescence", "anisotropy", "transmission", "volume", "dispersion"]
    .map((lobe) => ({ lobe, maps: [], bits: {} }));
  const features = normalizeProgramFeatures({
    lighting: "lit",
    lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false },
    extensions
  } as never);
  const program = generateProgramImpl(features, { flags } as never);
  const source = program.fragment ?? (program as unknown as { fragmentSource: string }).fragmentSource;
  expect(source).toContain("a3dPrd04EvalIridescence");
  expect(source).toContain("a3dPrd04SheenDirect");
  expect(source).toContain("a3dGetIBLVolumeRefraction");
  expect(source).toContain("a3dDirectLight(L, radiance, V, N, material");
});
