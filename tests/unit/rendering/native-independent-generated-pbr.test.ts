import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import "../../../packages/rendering/src/lanes/prd06";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { A3D_PRD04_ANISOTROPY_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Anisotropy";
import { A3D_PRD04_CLEARCOAT_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Clearcoat";
import { A3D_PRD04_BSDF_LOBES_COMMON_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Lobes";
import { A3D_PRD04_SHEEN_FAST_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/SheenFast";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;
const shadows = { cascades: 0, contact: false, localShadows: 0, pcfTaps: 4 } as const;
const anisotropy = { lobe: "anisotropy", maps: [], bits: {} } as const;
const clearcoat = { lobe: "clearcoat", maps: [], bits: {} } as const;
const sheen = { lobe: "sheen", maps: [], bits: {} } as const;
const preview = "a3d.independentPhysicalPreview";

function generate(overrides: Partial<ProgramFeatures> = {}) {
  const features = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights, shadows,
    maps: {}, extensions: [], features: {}, ...overrides });
  const generated = generateProgramImpl(features, { flags });
  if (!generated.descriptor) throw new Error("generated descriptor missing");
  return { features, generated, program: createGeneratedPbrProgram(generated.descriptor) };
}

describe("independent physical preview in the generated WebGPU program", () => {
  it("requires an explicit, cache-keyed preview bit and keeps the normal path unchanged", () => {
    const base = { extensions: [anisotropy], features: { "prd04.tangentFrame": true } };
    const regular = generate(base);
    const enabled = generate({ ...base, features: { ...base.features, [preview]: true } });
    const disabled = generate({ ...base, features: { ...base.features, [preview]: false } });
    expect(enabled.generated.key).not.toBe(regular.generated.key);
    expect(regular.program.fragment).toContain("generatedAnisotropicGgx(");
    expect(disabled.program.fragment).toContain("generatedAnisotropicGgx(");
    expect(regular.program.fragment).not.toContain("a3dPrd04AnisotropyDirect(");
    expect(enabled.program.fragment).toContain(A3D_PRD04_BSDF_LOBES_COMMON_WGSL);
    expect(enabled.program.fragment).toContain(A3D_PRD04_ANISOTROPY_WGSL);
    expect(enabled.program.fragment).not.toContain("fn generatedAnisotropicGgx(");
    expect(() => generate({ ...base, features: { ...base.features, [preview]: 1 } })).toThrow(/independentPhysicalPreview/);
  });

  it("uses raw anisotropy RG/B once with an orthonormal handed shading frame", () => {
    const mapped = { lobe: "anisotropy", maps: ["anisotropy"], mapUvSets: { anisotropy: 1 as const }, bits: { map: true } };
    const { program } = generate({ extensions: [mapped], maps: { normal: { uvSet: 0, transform: false } },
      features: { [preview]: true, "prd04.tangentFrame": true, "prd04.geometryTangent": true } });
    const fragment = program.fragment;
    expect(fragment).toContain("let anisotropySample = textureSample(");
    expect(fragment).toContain("let anProjectedT = anTangent - n * dot(n, anTangent);");
    expect(fragment).toContain("dot(cross(n, anFrameT), anBitangent) < 0.0");
    expect(fragment).toContain("a3dPrd04AnisotropyInit(&anLobes, anVector, anisotropySample, true, anFrameT, anFrameB, roughness);");
    expect(fragment).not.toContain("var mappedDirection = anisotropySample.rg");
    expect(fragment).toContain("a3dPrd04AnisotropyDirect(light.direction, view, n, anF0, anF90, roughness, anLobes)");
    expect(fragment).toContain("anStrength > 0.0 && anNl > 0.0 && anNv > 0.0 && dot(anHalfSum, anHalfSum) > 0.000001");
    expect(fragment).toContain("directSpecular += max(light.radiance, vec3f(0.0)) * anNl * (anisotropic - isotropic);");
    expect(program.resources).toContainEqual({ uniform: "u_anisotropyTexture", samplerBinding: 46, textureBinding: 47,
      dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });

    const plain = generate({ extensions: [anisotropy], features: { [preview]: true, "prd04.tangentFrame": true } });
    expect(plain.program.fragment).toContain("a3dPrd04AnisotropyInit(&anLobes, anVector, vec4f(1.0), false, anFrameT, anFrameB, roughness);");
    expect(plain.program.fragment).not.toContain("let anisotropySample = textureSample(");
  });

  it("uses the independent cosine-weighted clearcoat direct term while retaining host DFG composition", () => {
    const mapped = { lobe: "clearcoat", maps: ["clearcoat", "clearcoatRoughness", "clearcoatNormal"],
      mapUvSets: { clearcoat: 0 as const, clearcoatRoughness: 1 as const, clearcoatNormal: 1 as const },
      bits: { map: true, roughnessMap: true, normalMap: true } };
    const { program } = generate({ extensions: [mapped], features: { [preview]: true } });
    const fragment = program.fragment;
    expect(fragment).toContain(A3D_PRD04_CLEARCOAT_WGSL);
    expect(fragment).toMatch(/let coatSample = textureSample\([^\n]+\)\.r;/);
    expect(fragment).toMatch(/let coatRoughnessSample = textureSample\([^\n]+\)\.g;/);
    expect(fragment).toContain("material.coat.x * coatSample");
    expect(fragment).toContain("material.coat.y * coatRoughnessSample");
    expect(fragment).toContain("if (dot(mapped, mapped) > 0.000000000001) { coatNormal = normalize(mapped); }");
    expect(fragment).toContain("coatDirect += max(light.radiance, vec3f(0.0)) * a3dPrd04ClearcoatDirect(light.direction, view, coatNormal, coatRoughness);");
    expect(fragment).not.toContain("fn generatedClearcoatDirect(");
    expect(fragment).toContain("let coatDfg = textureSampleLevel(u_dfgLutTexture");
    expect(fragment).toContain("directSpecular = directSpecular * coatBase + coatDirect * coatFactor;");
    expect(fragment).toContain("indirectSpecular = indirectSpecular * coatBase + coatIndirect * coatFactor;");
  });

  it("composes preview anisotropy with every other layered lobe (S5-WP04-01)", () => {
    const features = { [preview]: true, "prd04.tangentFrame": true };
    const otherTerms: Record<string, readonly string[]> = {
      sheen: ["a3dFastSheenDirect(sheenViewWeight, sheenLightWeight, sheenNormalization)",
        "directSpecular += max(light.radiance, vec3f(0.0)) * anNl * (anisotropic - isotropic) * sheenDirectCompensation;"],
      iridescence: ["a3dPrd04EvalIridescence(", "directSpecular += light.radiance * irNl * (irMixed - irFresnel) * irGgx;"],
      transmission: ["generatedTransmissionSample(input.worldPosition, n, view, roughness, pbr.ior, thickness, volumeLinear)"],
      "diffuse-transmission": ["diffuseTransmissionDirect += max(light.radiance, vec3f(0.0)) * backNl"]
    };
    for (const [other, terms] of Object.entries(otherTerms)) {
      const extension = { lobe: other, maps: [], bits: {} };
      // Transmission also requires its normal captured-target contract.
      const combined = { ...features, ...(other === "transmission" ? { "prd04.transmissionTarget": true } : {}) };
      const fragment = generate({ extensions: [anisotropy, extension], features: combined }).program.fragment;
      expect(fragment).toContain(A3D_PRD04_ANISOTROPY_WGSL);
      expect(fragment).toContain("a3dPrd04AnisotropyInit(&anLobes, anVector, vec4f(1.0), false, anFrameT, anFrameB, roughness);");
      expect(fragment).toContain("a3dPrd04AnisotropyDirect(light.direction, view, n, anF0, anF90, roughness, anLobes)");
      for (const term of terms) expect(fragment, `${other}: ${term}`).toContain(term);
    }
    expect(() => generate({ extensions: [anisotropy, clearcoat], features })).not.toThrow();
  });

  it("uses analytic sheen with per-light symmetric attenuation and uniform ambient units", () => {
    const mapped = { lobe: "sheen", maps: ["sheenColor", "sheenRoughness"],
      mapUvSets: { sheenColor: 0 as const, sheenRoughness: 1 as const }, bits: { colorMap: true, roughnessMap: true } };
    const options: Partial<ProgramFeatures> = { extensions: [mapped],
      maps: { occlusion: { uvSet: 0, transform: false } }, features: { [preview]: true } };
    const { program } = generate(options);
    const fragment = program.fragment;
    expect(fragment).toContain(A3D_PRD04_SHEEN_FAST_WGSL);
    expect(fragment).not.toContain("fn generatedSheenDirect(");
    expect(fragment).not.toContain("const sheenAlbedo:");
    expect(fragment).toMatch(/let sheenColorSample = textureSample\([^\n]+\)\.rgb;/);
    expect(fragment).toMatch(/let sheenRoughnessSample = textureSample\([^\n]+\)\.a;/);
    expect(fragment).toContain("material.sheen.rgb * sheenColorSample");
    expect(fragment).toContain("material.sheen.a * sheenRoughnessSample");
    expect(fragment).toContain("let sheenViewWeight = select(0.0, a3dFastSheenShape(sheenViewCosine, sheenExponent, sheenOffset), sheenViewCosine > 0.0);");
    expect(fragment).toContain("let sheenDirectCompensation = a3dFastSheenCompensation(sheenViewWeight, sheenLightWeight, sheenIntensity);");
    expect(fragment).toContain("directDiffuse += directResult.diffuse * sheenDirectCompensation;");
    expect(fragment).toContain("directSpecular += directResult.specular * sheenDirectCompensation;");
    expect(fragment).toContain("sheenDirect += max(light.radiance, vec3f(0.0)) * sheenLightCosine * sheenColor * a3dFastSheenDirect(sheenViewWeight, sheenLightWeight, sheenNormalization);");
    expect(fragment).toContain("let sheenAmbient = max(material.ambient.rgb * material.ambient.a, vec3f(0.0)) * occlusion;");
    expect(fragment).toContain("indirectSpecular += sheenAmbient * sheenColor * (a3dFastSheenAlbedo(sheenViewWeight) / A3D_PHYSICAL_PI);");
    expect(fragment).toContain("directSpecular += sheenDirect;");
    // The view shape is prepared once and the second call is inside the light loop.
    expect([...fragment.matchAll(/a3dFastSheenShape\(/g)]).toHaveLength(3);
    const regular = generate({ ...options, features: {} });
    expect(regular.generated.key).not.toBe(generate(options).generated.key);
    expect(regular.program.fragment).toContain("fn generatedSheenDirect(");
    expect(regular.program.fragment).not.toContain("fn a3dFastSheenDirect(");
  });

  it("composes preview sheen over every other layered lobe while retaining default support (S5-WP04-01)", () => {
    const otherTerms: Record<string, readonly string[]> = {
      // Coat layers over the sheen-compensated substrate.
      clearcoat: ["coatDirect += max(light.radiance, vec3f(0.0)) * a3dPrd04ClearcoatDirect(light.direction, view, coatNormal, coatRoughness);",
        "directSpecular = directSpecular * coatBase + coatDirect * coatFactor;"],
      // Substrate specular deltas use the same symmetric per-light compensation as the substrate.
      iridescence: ["directSpecular += light.radiance * irNl * (irMixed - irFresnel) * irGgx * sheenDirectCompensation;"],
      // View-only terms beneath the sheen use the view-side compensation.
      transmission: ["let transmitted = (vec3f(1.0) - transReflectance) * diffuseColor * transmittedScene * sheenViewCompensation;"],
      "diffuse-transmission": ["diffuseTransmissionWeight * diffuseTransmissionColor * available / A3D_PHYSICAL_PI * sheenViewCompensation;"]
    };
    for (const [other, terms] of Object.entries(otherTerms)) {
      const extension = { lobe: other, maps: [], bits: {} };
      const activeFeatures: Record<string, boolean> = other === "transmission" ? { "prd04.transmissionTarget": true } : {};
      const fragment = generate({ extensions: [sheen, extension], features: { ...activeFeatures, [preview]: true } }).program.fragment;
      expect(fragment).toContain(A3D_PRD04_SHEEN_FAST_WGSL);
      expect(fragment).toContain("let sheenViewCompensation = a3dFastSheenCompensation(sheenViewWeight, 0.0, sheenIntensity);");
      expect(fragment).toContain("directSpecular += sheenDirect;");
      for (const term of terms) expect(fragment, `${other}: ${term}`).toContain(term);
      expect(() => generate({ extensions: [sheen, extension], features: activeFeatures })).not.toThrow();
    }
  });

  it("feeds every nonuniform indirect source into the preview sheen irradiance (S5-WP04-01)", () => {
    const ambient = "material.ambient.rgb * material.ambient.a";
    const cases: [Partial<ProgramFeatures>, string][] = [
      [{ environment: "pmrem-cube", features: { [preview]: true } }, `let sheenAmbient = max(${ambient} + irradiance, vec3f(0.0));`],
      [{ environment: "equirect", features: { [preview]: true } }, `let sheenAmbient = max(${ambient} + irradiance, vec3f(0.0));`],
      [{ environment: "pmrem-cube", features: { [preview]: true, "prd02.ibl": true } },
        "let sheenAmbient = max(irradiance + material.ambientIrradiance.rgb * A3D_PHYSICAL_PI + hemi, vec3f(0.0));"],
      [{ lights: { ...lights, hemisphere: true }, features: { [preview]: true } }, `let sheenAmbient = max(${ambient} + irradiance, vec3f(0.0));`],
      [{ features: { [preview]: true, "prd02.localProbe": true } }, `let sheenAmbient = max(${ambient} + localIrradiance, vec3f(0.0));`],
      [{ features: { [preview]: true, "prd02.irradianceVolume": true } }, `let sheenAmbient = max(${ambient} + localIrradiance, vec3f(0.0));`],
      [{ features: { [preview]: true, "a3d.nativeProbeGrid": true } }, `let sheenAmbient = max(${ambient} + localIrradiance, vec3f(0.0));`],
      [{ features: { [preview]: true, "a3d.nativeVoxelIndirect": true } }, `let sheenAmbient = max(${ambient} + localIrradiance, vec3f(0.0));`],
      [{ features: { [preview]: true, "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 0 } },
        `let sheenEnvironment = mix(${ambient}, sheenBaked, baked.a);`],
      [{ features: { [preview]: true, "a3d.nativeBakedLightmap": "add-indirect", "a3d.nativeLightmapUv": 1 } },
        `let sheenEnvironment = ${ambient} + sheenBaked * baked.a;`],
    ];
    for (const [options, expected] of cases) {
      const fragment = generate({ ...options, extensions: [sheen] }).program.fragment;
      expect(fragment).toContain(expected);
      expect(fragment).toContain("indirectSpecular += sheenAmbient * sheenColor * (a3dFastSheenAlbedo(sheenViewWeight) / A3D_PHYSICAL_PI);");
    }
  });

  it("does not include independent lobe code when preview has no matching lobe", () => {
    const { program } = generate({ features: { [preview]: true } });
    expect(program.fragment).not.toContain("struct A3DPrd04Lobes");
    expect(program.fragment).not.toContain("fn a3dPrd04ClearcoatDirect");
    expect(program.fragment).not.toContain("fn a3dPrd04AnisotropyDirect");
  });

  // Offline source compilation is explicitly scheduled on an authorized worker.
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("validates preview feature combinations with Naga", () => {
    const anisoFeatures = { [preview]: true, "prd04.tangentFrame": true, "prd04.geometryTangent": true };
    const programs = [
      generate({ extensions: [anisotropy], features: anisoFeatures }).program,
      generate({ extensions: [clearcoat], features: { [preview]: true } }).program,
      generate({ extensions: [anisotropy, clearcoat], features: anisoFeatures }).program,
      generate({ extensions: [anisotropy, clearcoat], features: anisoFeatures,
        lights: { ...lights, clustered: true, rect: 1 } }).program,
      generate({ extensions: [clearcoat, { lobe: "iridescence", maps: [], bits: {} }], features: { [preview]: true } }).program,
      generate({ extensions: [sheen], features: { [preview]: true }, maps: { occlusion: { uvSet: 0, transform: false } } }).program,
      generate({ extensions: [anisotropy, sheen, clearcoat, { lobe: "iridescence", maps: [], bits: {} }], features: anisoFeatures }).program,
      generate({ extensions: [anisotropy, { lobe: "transmission", maps: [], bits: {} }],
        features: { ...anisoFeatures, "prd04.transmissionTarget": true } }).program,
      generate({ extensions: [sheen, { lobe: "diffuse-transmission", maps: [], bits: {} }], features: { [preview]: true } }).program,
      generate({ extensions: [sheen], features: { [preview]: true, "prd02.ibl": true }, environment: "pmrem-cube" }).program,
      generate({ extensions: [sheen], features: { [preview]: true, "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 0 } }).program,
    ];
    const directory = mkdtempSync(join(tmpdir(), "a3d-independent-generated-pbr-"));
    try {
      for (const [index, program] of programs.entries()) {
        for (const [stage, source] of [["vertex", program.vertex], ["fragment", program.fragment]] as const) {
          const file = join(directory, `${index}-${stage}.wgsl`);
          writeFileSync(file, source);
          expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
