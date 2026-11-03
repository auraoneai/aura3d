import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../../packages/rendering/src/lanes/prd04";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures, PHOTOMETRIC_PROFILE_FEATURE, type ProgramGraphFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { compileShaderGraph } from "../../../packages/rendering/src/program/ShaderGraphCompiler";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_MATERIALS: true });
const profile = { [PHOTOMETRIC_PROFILE_FEATURE]: true };
const lights = { dir: 1, point: 1, spot: 1, rect: 0, clustered: false, hemisphere: false } as const;

function program(overrides: Partial<ProgramGraphFeatures> = {}) {
  return generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights, features: profile, ...overrides }), { flags });
}

describe("generated photometric forward GLSL", () => {
  it("uses a distinct opt-in program and keeps the regular shader variant", () => {
    const selected = program();
    const ordinary = program({ features: {} });
    expect(selected.key).not.toBe(ordinary.key);
    expect(selected.defines.A3D_PHOTOMETRIC_PROFILE).toBe(true);
    expect(ordinary.defines.A3D_PHOTOMETRIC_PROFILE).toBeUndefined();
    expect(selected.fragment).toContain("precision highp int;");
    expect(selected.fragment).toContain("float a3dPhotometricCandela(");
    expect(ordinary.fragment).not.toContain("float a3dPhotometricCandela(");
  });

  it("applies profile candela in the selected punctual slot before shadows and material lobes", () => {
    const result = program({
      shadows: { cascades: 1, pcfTaps: 4, localShadows: 6, contact: true },
      features: { ...profile, "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true },
      extensions: [{ lobe: "clearcoat", maps: [], bits: {} }]
    });
    const fragment = result.fragment;
    const radianceStart = fragment.indexOf("vec3 a3dLegacyLightRadiance(");
    const radianceEnd = fragment.indexOf("#ifdef LIGHTS_CLUSTERED", radianceStart);
    const punctual = fragment.slice(radianceStart, radianceEnd);
    expect(punctual).toContain("int slot = baseIndex / 6;");
    expect(punctual).toContain("if (profileOffsets.w > 0.0)");
    expect(punctual).toMatch(/colorIntensity\.a\s*=\s*a3dPhotometricCandela\(/);
    expect(punctual).toContain("profileMeta.zw, worldPos - positionRange.xyz, directionKind.xyz");
    expect(punctual).toContain("a3dGetDistanceAttenuation(distanceToLight, positionRange.w, 2.0)");
    expect(punctual).toContain("attenuation *= smoothstep(outer, inner, cone)");
    expect(punctual).toContain("return colorIntensity.rgb * colorIntensity.a * attenuation;");
    const main = fragment.slice(fragment.indexOf("void main()"));
    const lookup = main.indexOf("vec3 radiance = a3dLegacyLightRadiance(i * 6");
    const shadow = main.indexOf("radiance *= a3dForwardLightShadow(", lookup);
    const direct = main.indexOf("a3dDirectLight(L, radiance", shadow);
    const coat = main.indexOf("a3dPrd04CoatDirect += radiance", direct);
    expect(lookup).toBeGreaterThan(-1);
    expect(shadow).toBeGreaterThan(lookup);
    expect(direct).toBeGreaterThan(shadow);
    expect(coat).toBeGreaterThan(direct);
  });

  it("rejects unsupported routes and invalid structural feature values", () => {
    const graph = compileShaderGraph({
      version: 1, stage: "material",
      nodes: [{ id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }],
      outputs: { color: "color" }
    }, "glsl");
    for (const unsupported of [
      { lighting: "unlit" },
      { pass: "depth" },
      { pass: "distance" },
      { lights: { ...lights, clustered: true } },
      { lights: { ...lights, point: 0, spot: 0 } },
      { graph },
      { features: { [PHOTOMETRIC_PROFILE_FEATURE]: false } },
      { features: { [PHOTOMETRIC_PROFILE_FEATURE]: "enabled" } }
    ] satisfies Partial<ProgramGraphFeatures>[]) {
      expect(() => program(unsupported)).toThrow("GENERATED_PHOTOMETRIC_PROFILE_UNSUPPORTED");
    }
  });

  it("rejects an active custom direct-light hook instead of dropping its profiles", () => {
    const id = "test.photometric.custom-light-hook";
    const remove = registerShaderFeature({ id, owner: "prd04", flag: "A3D_QR_CORE",
      hooks: ["fragment:lights"], chunks: [], select: () => true, defines: () => ({}) });
    try {
      expect(() => program({ features: { ...profile, [id]: true } }))
        .toThrow("GENERATED_PHOTOMETRIC_LIGHT_HOOK_UNSUPPORTED");
      expect(() => program({ target: "wgsl", features: { ...profile, [id]: true } }))
        .toThrow("GENERATED_PHOTOMETRIC_LIGHT_HOOK_UNSUPPORTED");
      expect(() => program({ features: profile })).not.toThrow();
    } finally { remove(); }
  });

  const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
  it.runIf(hasGlslang)("links the generated variants and reflects their active atlas bindings", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-photometric-forward-"));
    try {
      const variants = [
        program({ features: {} }),
        program(),
        program({
          shadows: { cascades: 1, pcfTaps: 4, localShadows: 6, contact: true },
          features: { ...profile, "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true },
          extensions: [{ lobe: "clearcoat", maps: [], bits: {} }]
        })
      ];
      variants.forEach((variant, index) => {
        const vertex = join(directory, `${index}.vert`), fragment = join(directory, `${index}.frag`);
        writeFileSync(vertex, variant.vertex);
        writeFileSync(fragment, variant.fragment);
        const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        for (const uniform of ["u_a3dPhotometricAtlas", "u_a3dPhotometricOffsets", "u_a3dPhotometricMeta"]) {
          if (index === 0) expect(reflection).not.toContain(uniform);
          else expect(reflection).toContain(uniform);
        }
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
