/**
 * Source-level contracts for Aura's physical material shaders. The optional
 * compiler checks validate GLSL ES on the CPU; they do not execute shaders or
 * replace pixel/numerical rendering tests.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { shaderChunk, type MaterialExtensionFeature } from "../../../../packages/rendering/src/contracts/program";
import { registerPrd04ShaderFeatures } from "../../../../packages/rendering/src/materials/features";
import { registerPrd04MaterialLobes } from "../../../../packages/rendering/src/materials/lobes";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { BRDF_CHUNK_GLSL } from "../../../../packages/rendering/src/program/chunks/brdf.glsl";
import { COMMON_CHUNK_GLSL } from "../../../../packages/rendering/src/program/chunks/common.glsl";
import { PRD04_SHADER_CHUNKS, registerPrd04ShaderChunks } from "../../../../packages/rendering/src/shaders/physical/index";
import { A3D_SHEEN_ALBEDO_LUT } from "../../../../packages/rendering/src/shaders/physical/sheen.glsl";

registerPrd04ShaderChunks();
registerPrd04MaterialLobes();
registerPrd04ShaderFeatures();

const flags = resolveQrFlags({ env: { A3D_QR: "core,materials,materials.transmission" } });
const lobe = (name: string, bits: Record<string, boolean> = {}): MaterialExtensionFeature => ({
  lobe: name,
  maps: [],
  bits
});
const cases = [
  { name: "specular", extensions: [lobe("specular")], api: "a3dPrd04SpecIorFactors" },
  { name: "clearcoat", extensions: [lobe("clearcoat")], api: "a3dPrd04ClearcoatDirect" },
  { name: "sheen", extensions: [lobe("sheen")], api: "a3dPrd04SheenDirect" },
  { name: "iridescence", extensions: [lobe("iridescence", { film: true })], api: "a3dPrd04EvalIridescence" },
  { name: "anisotropy", extensions: [lobe("anisotropy")], api: "a3dPrd04AnisotropyDirect" },
  { name: "transmission", extensions: [lobe("transmission"), lobe("volume")], api: "a3dGetIBLVolumeRefraction" },
  { name: "dispersion", extensions: [lobe("transmission"), lobe("volume"), lobe("dispersion")], api: "a3dGetIBLVolumeRefractionDispersion" }
] as const;

function program(extensions: readonly MaterialExtensionFeature[]) {
  return generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit",
    lights: { dir: 2, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: true },
    extensions,
    features: extensions.some((extension) => extension.lobe === "transmission")
      ? { "prd04.transmissionTarget": true }
      : {}
  }), { flags: flags as never });
}

describe("native physical shader contracts", () => {
  it("registers uniquely named physical shader chunks with resolvable dependencies", () => {
    expect(new Set(PRD04_SHADER_CHUNKS.map((chunk) => chunk.name)).size).toBe(PRD04_SHADER_CHUNKS.length);
    for (const chunk of PRD04_SHADER_CHUNKS) {
      expect(shaderChunk(chunk.name)).toBe(chunk);
      for (const requirement of chunk.requires ?? []) {
        if (requirement !== "brdf" && requirement !== "common") {
          expect(shaderChunk(requirement), `${chunk.name} requires ${requirement}`).toBeDefined();
        }
      }
    }
  });

  for (const sample of cases) {
    it(`${sample.name} selects the registered lobe and exposes its shader interface`, () => {
      const result = program(sample.extensions);
      expect(result.descriptor?.activeExtensions.map((extension) => extension.lobe)).toContain(sample.name);
      expect(result.defines[`A3D_LOBE_${sample.name.toUpperCase()}`]).toBe(true);
      if (sample.extensions.some((extension) => extension.lobe === "transmission")) {
        expect(result.defines.A3D_TRANSMISSION).toBe(1);
      }
      expect(result.fragment).toMatch(new RegExp(`\\b${sample.api}\\s*\\(`));
    });
  }

  it("does not inject lobe interfaces into an ordinary lit material", () => {
    const baseline = program([]);
    expect(baseline.descriptor?.activeExtensions).toEqual([]);
    for (const sample of cases) {
      expect(baseline.defines[`A3D_LOBE_${sample.name.toUpperCase()}`]).toBeUndefined();
      expect(baseline.fragment).not.toMatch(new RegExp(`\\b${sample.api}\\s*\\(`));
    }
  });

  it("keeps the sheen directional albedo finite, bounded, and stronger at grazing angles", () => {
    expect(A3D_SHEEN_ALBEDO_LUT).toHaveLength(16 * 16);
    for (const value of A3D_SHEEN_ALBEDO_LUT) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // Rows run from grazing to normal incidence; columns run from smooth to rough.
    for (let roughness = 0; roughness < 16; roughness++) {
      for (let view = 1; view < 16; view++) {
        expect(A3D_SHEEN_ALBEDO_LUT[view * 16 + roughness]).toBeLessThanOrEqual(
          A3D_SHEEN_ALBEDO_LUT[(view - 1) * 16 + roughness]!
        );
      }
    }
    expect(A3D_SHEEN_ALBEDO_LUT[15]).toBeGreaterThan(A3D_SHEEN_ALBEDO_LUT[255]!);

    // The GLSL lookup must actually receive the exported numerical table.
    const declaration = shaderChunk("a3d_prd04_sheen")!.glsl.match(/a3dPrd04SheenAlbedo\[256\]\s*=\s*float\[256\]\(([^)]*)\)/);
    expect(declaration).not.toBeNull();
    const embedded = declaration![1]!.split(",").map((value) => Number(value.trim()));
    expect(embedded).toEqual([...A3D_SHEEN_ALBEDO_LUT]);
  });
});

const validatorAvailable = spawnSync("glslangValidator", ["--version"], { encoding: "utf8" }).status === 0;

function validateGlsl(stage: "vert" | "frag", source: string): void {
  const result = spawnSync("glslangValidator", ["--stdin", "-S", stage], { input: source, encoding: "utf8" });
  expect(result.status, result.stderr || result.stdout || `validator failed: ${result.error?.message ?? "unknown error"}`).toBe(0);
}

describe.skipIf(!validatorAvailable)("offline GLSL ES compilation (glslangValidator)", () => {
  for (const sample of cases) {
    it(`compiles the generated ${sample.name} vertex and fragment programs`, () => {
      const result = program(sample.extensions);
      validateGlsl("vert", result.vertex);
      validateGlsl("frag", result.fragment);
    });
  }

  it("compiles all selected lobes in one generated program", () => {
    const extensions = cases.flatMap(({ extensions }) => extensions)
      .filter((extension, index, all) => all.findIndex((other) => other.lobe === extension.lobe) === index);
    const result = program(extensions);
    expect(result.descriptor?.activeExtensions).toHaveLength(extensions.length);
    expect(result.defines.A3D_TRANSMISSION).toBe(1);
    validateGlsl("vert", result.vertex);
    validateGlsl("frag", result.fragment);
  });

  it("compiles the registered physical lobe interfaces together", () => {
    const chunks = [
      "a3d_prd04_bsdf_lobes_common", "a3d_prd04_specular_ior", "a3d_prd04_clearcoat",
      "a3d_prd04_sheen", "a3d_prd04_iridescence", "a3d_prd04_anisotropy",
      "a3d_prd04_volume", "a3d_prd04_transmission", "a3d_prd04_dispersion"
    ];
    const source = [
      "#version 300 es\nprecision highp float;\n#define A3D_TRANSMISSION\n#define A3D_DISPERSION\n#define A3D_TRANSMISSION_BICUBIC",
      COMMON_CHUNK_GLSL,
      BRDF_CHUNK_GLSL,
      ...chunks.map((name) => shaderChunk(name)!.glsl),
      `layout(location = 0) out vec4 color;
      uniform float probe;
      void main() {
        vec3 n = vec3(0.0, 0.0, 1.0), v = normalize(vec3(probe, 0.0, 1.0));
        A3DPrd04Lobes lobes;
        a3dPrd04ClearcoatInit(lobes, probe, 0.5, vec4(1.0), vec4(1.0), n, 0.0);
        a3dPrd04SheenInit(lobes, vec3(0.5), 0.5, vec4(1.0), vec4(1.0));
        a3dPrd04AnisotropyInit(lobes, vec2(0.5, 0.0), vec4(1.0), true, vec3(1,0,0), vec3(0,1,0), 0.5);
        vec3 sum = a3dPrd04ClearcoatDirect(v, v, n, lobes.clearcoatRoughness);
        sum += a3dPrd04SheenDirect(v, v, n, lobes.sheenColor, lobes.sheenRoughness);
        sum += a3dPrd04AnisotropyDirect(v, v, n, vec3(0.04), 1.0, 0.5, lobes);
        sum += a3dPrd04EvalIridescence(1.0, 1.3, 0.5, 250.0, vec3(0.04));
        sum += a3dPrd04IorToF0(vec3(1.5), 1.0);
        sum += a3dVolumeAttenuation(1.0, vec3(0.5), 2.0);
        sum += a3dPrd04DispersionIors(1.5, probe);
        sum += a3dGetIBLVolumeRefractionDispersion(n, v, 0.5, vec3(1.0), vec3(0.04), 1.0,
          vec3(0.0), mat4(1.0), probe, 1.5, 1.0, vec3(0.5), 2.0).rgb;
        color = vec4(sum, 1.0);
      }`
    ].join("\n");
    validateGlsl("frag", source);
  });
});
