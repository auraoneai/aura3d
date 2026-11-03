import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd04";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import {
  normalizeProgramFeatures, PHOTOMETRIC_PROFILE_FEATURE, PROJECTED_SPOT_FEATURE,
  type ProgramGraphFeatures
} from "../../../packages/rendering/src/program/ProgramFeatures";
import { compileShaderGraph } from "../../../packages/rendering/src/program/ShaderGraphCompiler";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_MATERIALS: true });
const lights = { dir: 1, point: 1, spot: 1, rect: 0, clustered: false, hemisphere: false } as const;
const selected = { [PROJECTED_SPOT_FEATURE]: true };
const uniformNames = [
  "u_projectedSpotEnabled", "u_projectedSpotIndex", "u_projectedSpotMap",
  "u_projectedSpotOffset", "u_projectedSpotScale", "u_projectedSpotRotation"
] as const;

function program(overrides: Partial<ProgramGraphFeatures> = {}) {
  return generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights, features: selected, ...overrides }), { flags });
}

describe("generated WebGL2 projected spotlight variant", () => {
  it("is default-off, keys separately and declares bindings only in the selected variant", () => {
    const ordinary = program({ features: {} });
    const enabled = program();
    expect(ordinary.key).not.toBe(enabled.key);
    expect(ordinary.defines.A3D_PROJECTED_SPOT).toBeUndefined();
    expect(enabled.defines.A3D_PROJECTED_SPOT).toBe(true);
    expect(ordinary.fragment).not.toContain("a3dProjectedSpotImage(");
    expect(enabled.fragment).toContain("vec3 a3dProjectedSpotImage(");
    const reflection = (value: typeof enabled) => reflectShaderSources({ label: value.key, marker: "a3d-generated-program", vertex: value.vertex, fragment: value.fragment });
    for (const uniform of uniformNames) {
      expect(reflection(ordinary).uniforms.has(uniform), uniform).toBe(false);
      expect(reflection(enabled).uniforms.has(uniform), uniform).toBe(true);
    }
  });

  it("modulates only the exact packed spot before existing shadow and lobe evaluation", () => {
    const variant = program({
      shadows: { cascades: 1, pcfTaps: 4, localShadows: 6, contact: true },
      features: { ...selected, [PHOTOMETRIC_PROFILE_FEATURE]: true, "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true },
      extensions: [{ lobe: "clearcoat", maps: [], bits: {} }]
    });
    const fragment = variant.fragment;
    expect(fragment).toContain("colorIntensity.a = a3dPhotometricCandela(");
    expect(fragment).toContain("precision highp int;");
    const main = fragment.slice(fragment.indexOf("void main()"));
    const radiance = main.indexOf("vec3 radiance = a3dLegacyLightRadiance(i * 6, v_worldPosition, L);");
    const projection = main.indexOf("radiance *= a3dProjectedSpotImage(", radiance);
    const shadow = main.indexOf("radiance *= a3dForwardLightShadow(", projection);
    const direct = main.indexOf("a3dDirectLight(L, radiance", shadow);
    const coat = main.indexOf("a3dPrd04CoatDirect += radiance", direct);
    expect(radiance).toBeGreaterThanOrEqual(0);
    expect(projection).toBeGreaterThan(radiance);
    expect(shadow).toBeGreaterThan(projection);
    expect(direct).toBeGreaterThan(shadow);
    expect(coat).toBeGreaterThan(direct);
    const guarded = main.slice(radiance, projection);
    expect(guarded).toMatch(/u_projectedSpotEnabled\s*>\s*0\.5/);
    expect(guarded).toMatch(/i\s*==\s*int\(u_projectedSpotIndex\)/);
    expect(guarded).toMatch(/u_lightData\[i\s*\*\s*6\s*\+\s*2\]\.w\s*>\s*1\.5/);
    expect(guarded).toMatch(/u_lightData\[i\s*\*\s*6\s*\+\s*2\]\.w\s*<\s*2\.5/);
    const call = main.slice(projection, shadow);
    expect(call).toContain("u_projectedSpotMap");
    expect(call).toMatch(/v_worldPosition\s*-\s*u_lightData\[i\s*\*\s*6\s*\+\s*1\]\.xyz/);
    expect(call).toMatch(/u_lightData\[i\s*\*\s*6\s*\+\s*2\]\.xyz/);
    expect(call).toMatch(/u_lightData\[i\s*\*\s*6\s*\+\s*3\]\.x/);
    for (const name of ["u_projectedSpotOffset", "u_projectedSpotScale", "u_projectedSpotRotation"]) expect(call).toContain(name);
  });

  it("rejects unsupported targets, light paths, graphs, batching, deformation and invalid feature values", () => {
    const graph = compileShaderGraph({
      version: 1, stage: "material", nodes: [{ id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }], outputs: { color: "color" }
    }, "glsl");
    for (const unsupported of [
      { target: "wgsl" },
      { lighting: "unlit" },
      { pass: "depth" }, { pass: "distance" }, { pass: "velocity" },
      { lights: { ...lights, spot: 0 } },
      { lights: { ...lights, clustered: true } },
      { graph },
      { drawId: "multi-draw" },
      { instancing: { color: false } },
      { skinning: { influences: 4, palette: "uniform" } },
      { morph: { targetBucket: 4, normals: false, tangents: false } },
      { features: { ...selected, "prd06.deform": "skin4" } },
      { features: { ...selected, "parity.batchDraw": "multi-draw" } },
      { features: { [PROJECTED_SPOT_FEATURE]: false } },
      { features: { [PROJECTED_SPOT_FEATURE]: "enabled" } }
    ] satisfies Partial<ProgramGraphFeatures>[]) {
      expect(() => program(unsupported)).toThrow("GENERATED_PROJECTED_SPOT_UNSUPPORTED");
    }
  });

  it("rejects a custom direct-light hook rather than silently omitting the projection", () => {
    const id = "test.projected-spot.custom-light-hook";
    const remove = registerShaderFeature({ id, owner: "prd04", flag: "A3D_QR_CORE", hooks: ["fragment:lights"],
      chunks: [], select: () => true, defines: () => ({}) });
    try {
      expect(() => program({ features: { ...selected, [id]: true } })).toThrow("GENERATED_PROJECTED_SPOT_LIGHT_HOOK_UNSUPPORTED");
      expect(() => program()).not.toThrow();
    } finally { remove(); }
  });

  const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
  it.runIf(hasGlslang)("links off, projected and projected-plus-photometric shadow variants", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-projected-spot-forward-"));
    try {
      const variants = [
        program({ features: {} }),
        program(),
        program({
          shadows: { cascades: 1, pcfTaps: 4, localShadows: 6, contact: true },
          features: { ...selected, [PHOTOMETRIC_PROFILE_FEATURE]: true, "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true },
          extensions: [{ lobe: "clearcoat", maps: [], bits: {} }]
        })
      ];
      variants.forEach((variant, index) => {
        const vertex = join(directory, `${index}.vert`), fragment = join(directory, `${index}.frag`);
        writeFileSync(vertex, variant.vertex);
        writeFileSync(fragment, variant.fragment);
        const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        for (const uniform of uniformNames) {
          if (index === 0) expect(reflection).not.toContain(uniform);
          else expect(reflection).toContain(uniform);
        }
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
