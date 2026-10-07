/**
 * Lane-01 §15 Phase-3 test: the C-02 generator path is flag-gated
 * (`A3D_QR_CORE_GENERATOR`, default-on under `A3D_QR_CORE`), materials produce
 * a feature record via `programFeatures(ctx)` (§8.5), and ForwardPass derives
 * pass-owned axes (lights/shadows/environment/fog) consistently between the
 * Renderer warmup and the draw key.
 */

import { describe, expect, it } from "vitest";

import {
  InstancedPBRMaterial,
  PBRMaterial,
  UnlitMaterial,
  computeProgramKey,
  defaultProgramFeatures,
  forwardPassFeatureAxes,
  materialFeatureWarning,
  materialUsesGeneratedProgram,
  normalizeProgramFeatures,
  qrCoreGeneratorOn,
  qrCoreOutputOn
} from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";

const ctxHigh = { flags: resolveQrFlags({ env: { A3D_QR_CORE: "v2" } }), tier: QUALITY_TIERS.high };

describe("PRD-01 §15 sub-flag resolution", () => {
  it("flag-off leaves both sub-flags off", () => {
    const flags = resolveQrFlags({ env: {} });
    expect(qrCoreGeneratorOn(flags)).toBe(false);
    expect(qrCoreOutputOn(flags)).toBe(false);
  });

  it("A3D_QR_CORE=v2 defaults both sub-flags on", () => {
    const flags = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
    expect(qrCoreGeneratorOn(flags)).toBe(true);
    expect(qrCoreOutputOn(flags)).toBe(true);
  });

  it("`?a3d-qr=core,-core_generator` excludes the generator only", () => {
    const flags = resolveQrFlags({ env: { A3D_QR: "core,-core_generator" } });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(qrCoreGeneratorOn(flags)).toBe(false);
    expect(qrCoreOutputOn(flags)).toBe(true);
  });

  it("an explicit sub-flag value wins over the lane default", () => {
    const flags = resolveQrFlags({ env: { A3D_QR: "-core,core_generator" } });
    expect(qrCoreGeneratorOn(flags)).toBe(true);
    expect(qrCoreOutputOn(flags)).toBe(false);
  });
});

describe("PRD-01 §15 material feature derivation (C-02)", () => {
  it("allow-listed shaders are covered; others keep shaderKey", () => {
    expect(materialUsesGeneratedProgram(new PBRMaterial({}))).toBe(true);
    expect(materialUsesGeneratedProgram(new UnlitMaterial({}))).toBe(true);
    expect(materialUsesGeneratedProgram({ shaderKey: "custom/orbital" } as never)).toBe(false);
  });

  it("PBRMaterial produces a lit record with no maps and no extensions by default", () => {
    const f = new PBRMaterial({}).programFeatures(ctxHigh);
    expect(f.lighting).toBe("lit");
    expect(Object.keys(f.maps)).toHaveLength(0);
    expect(f.extensions).toEqual([]);
    expect(f.alphaMode).toBe("opaque");
    expect(f.doubleSided).toBe(false);
    expect(f.diffuseModel).toBe("burley");
  });

  it("UnlitMaterial produces an unlit record", () => {
    expect(new UnlitMaterial({}).programFeatures(ctxHigh).lighting).toBe("unlit");
  });

  it("instancing derives from requiredAttributes", () => {
    const f = new InstancedPBRMaterial({}).programFeatures(ctxHigh);
    expect(f.instancing).toBeDefined();
  });

  it("alphaCutoff > 0 → alphaMode mask; blend renderState → blend", () => {
    const mask = new PBRMaterial({});
    mask.setParameter("u_alphaCutoff", 0.5);
    expect(defaultProgramFeatures(mask, ctxHigh).alphaMode).toBe("mask");
    const blended = new PBRMaterial({ renderState: { blend: true, depthWrite: false } as never });
    expect(defaultProgramFeatures(blended, ctxHigh).alphaMode).toBe("blend");
  });

  it("extension factor parameters map to KHR_materials_* records", () => {
    const m = new PBRMaterial({ clearcoatFactor: 1 });
    const exts = m.programFeatures(ctxHigh).extensions.map((e) => e.lobe);
    expect(exts).toContain("KHR_materials_clearcoat");
    expect(exts).not.toContain("KHR_materials_emissive_strength"); // strength 1 = absent
    const strong = new PBRMaterial({ emissiveStrength: 4 });
    expect(strong.programFeatures(ctxHigh).extensions.map((e) => e.lobe)).toContain("KHR_materials_emissive_strength");
  });

  it("materialFeatureWarning flags shaderVariant on allow-listed materials only", () => {
    const variant = new PBRMaterial({});
    (variant as { shaderVariant?: string }).shaderVariant = "warm";
    expect(materialFeatureWarning(variant)).toMatch(/shaderVariant/);
    expect(materialFeatureWarning(new PBRMaterial({}))).toBeNull();
    expect(materialFeatureWarning({ shaderKey: "custom/x", shaderVariant: "v" } as never)).toBeNull();
  });
});

describe("PRD-01 §15 pass-owned feature axes", () => {
  const light = (kind: "directional" | "point" | "spot" | "rect-area") => ({ kind }) as never;

  it("buckets light counts into the C-02 0|1|2|4|8 contract", () => {
    const axes = forwardPassFeatureAxes({ lights: [light("directional"), light("directional"), light("point")] }, false);
    expect(axes.lights).toEqual({ dir: 2, point: 1, spot: 0, rect: 0, clustered: false, hemisphere: false });
    const many = forwardPassFeatureAxes({ lights: Array(9).fill(light("point")) }, false);
    expect(many.lights.point).toBe(8);
    expect(many.lights.clustered).toBe(true);
  });

  it("no shadowMap → cascades 0 (shadows off)", () => {
    expect(forwardPassFeatureAxes({}, false).shadows?.cascades).toBe(0);
    const withShadow = forwardPassFeatureAxes({ shadowMap: {} as never }, false);
    expect(withShadow.shadows?.cascades).toBe(1);
  });

  it("environment + fog records come from the pass options", () => {
    expect(forwardPassFeatureAxes({}, false).environment).toBe("none");
    expect(forwardPassFeatureAxes({ environmentLighting: { proceduralMap: {} } as never }, false).environment).toBe("equirect");
    expect(forwardPassFeatureAxes({ environmentFog: { mode: "exponential" } as never }, false).fog).toBe("exp2");
    expect(forwardPassFeatureAxes({ environmentFog: { mode: "linear" } as never }, false).fog).toBe("linear");
  });

  it("a material record + axes compose a forward key the cache can take", () => {
    const features = normalizeProgramFeatures({
      ...new PBRMaterial({}).programFeatures(ctxHigh),
      ...forwardPassFeatureAxes({ lights: [light("directional")] }, false),
      pass: "forward",
      target: "glsl300es"
    });
    const key = computeProgramKey(features);
    expect(typeof key).toBe("string");
    expect(key).toContain('"pass":"forward"');
    expect(features.pass).toBe("forward");
  });
});
