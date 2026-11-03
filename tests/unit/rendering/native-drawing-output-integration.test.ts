import { describe, expect, it } from "vitest";
import type { MaterialExtensionFeature } from "../../../packages/rendering/src/contracts/program";
import { PRD04_MATERIAL_LOBES } from "../../../packages/rendering/src/materials/lobes";
import { indirectFractionFeature } from "../../../packages/rendering/src/post/chunks/indirectFraction.glsl";
import { PRD02_SHADOW_FILTER_FEATURE } from "../../../packages/rendering/src/shadows/Prd02ShadowFilter";
import { PRD02_IBL_SHADER_FEATURE } from "../../../packages/rendering/src/shaders/Prd02IblFeature";
import { admitNativeDeferredFeatures } from "../../../packages/rendering/src/renderer/NativeDeferredAdmission";
import { createTrustedQrFlags, isTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { withCoreOutputOff } from "../../../packages/rendering/src/renderer/coreOutputPostRoute";

describe("native deferred feature admission", () => {
  it("accepts only the actual built-in providers selected by the generated root material", () => {
    const features = [PRD02_IBL_SHADER_FEATURE, indirectFractionFeature, PRD02_SHADOW_FILTER_FEATURE];
    const selected = { "prd02.ibl": true, "prd03.indirectFraction": "indirectFraction", "prd02.shadowFilter": 3 };
    const extensions: MaterialExtensionFeature[] = [
      { lobe: "sheen", maps: [], bits: { colorMap: false, roughnessMap: false } },
      { lobe: "emissive-strength", maps: [], bits: { map: false } }
    ];
    const accepted = admitNativeDeferredFeatures(selected, features, extensions, PRD04_MATERIAL_LOBES);
    expect(accepted).toEqual({ ibl: true, indirectFraction: true });
    expect(admitNativeDeferredFeatures(selected, [{ ...PRD02_IBL_SHADER_FEATURE }, ...features.slice(1)], extensions, PRD04_MATERIAL_LOBES).reason).toContain("prd02.ibl");
    expect(admitNativeDeferredFeatures(selected, features, extensions, PRD04_MATERIAL_LOBES.map(lobe => lobe.id === "sheen" ? { ...lobe } : lobe)).reason).toContain("sheen");
    expect(admitNativeDeferredFeatures({ ...selected, "test.extra": true }, features, extensions, PRD04_MATERIAL_LOBES).reason).toContain("test.extra");
    expect(admitNativeDeferredFeatures(selected, features, [{ lobe: "sheen", maps: ["sheenColor"], bits: {} }], PRD04_MATERIAL_LOBES).reason).toContain("sheen");
    expect(admitNativeDeferredFeatures(selected, features, extensions, []).reason).toContain("sheen");
  });
});

describe("legacy output flag derivation", () => {
  it("keeps trusted snapshots immutable and preserves custom flag callbacks without trusting them", () => {
    const trusted = createTrustedQrFlags({ A3D_QR_CORE_OUTPUT: true, A3D_QR_POST: true });
    const derived = withCoreOutputOff(trusted);
    expect(isTrustedQrFlags(derived)).toBe(true);
    expect(derived.on("A3D_QR_CORE_OUTPUT")).toBe(false);
    expect(derived.on("A3D_QR_POST")).toBe(true);
    expect(withCoreOutputOff(trusted)).toBe(derived);
    const custom: QrFlags = { values: Object.freeze({ A3D_QR_POST: false }), on: name => name === "A3D_QR_POST" };
    const legacy = withCoreOutputOff(custom);
    expect(isTrustedQrFlags(legacy)).toBe(false);
    expect(legacy.on("A3D_QR_POST")).toBe(true);
    expect(legacy.on("A3D_QR_CORE_OUTPUT")).toBe(false);
  });
});
