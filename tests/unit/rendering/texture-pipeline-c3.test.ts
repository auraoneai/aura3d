import { describe, expect, it } from "vitest";
import { ensureCompressedTextureSupport } from "../../../packages/assets/src";
import {
  findThreeCompatTextureSet,
  listThreeCompatPbrMaterials,
  THREE_COMPAT_TEXTURE_SETS
} from "../../../packages/materials/src/node";
import {
  DEFAULT_SAMPLER_ANISOTROPY,
  EXTERNAL_PARITY_TEXTURE_COLOR_POLICY,
  isTextureBinding,
  resolveSamplerAnisotropy,
  Sampler,
  TexturedPBRMaterial,
  Texture,
  TextureBinding,
  validateTextureColorSpace
} from "../../../packages/rendering/src";

/** muse3jsparity-PRD C3: one-call decoder setup, anisotropy control, sRGB discipline. */
describe("C3 one-call decoder setup with diagnostics", () => {
  it("keeps draco/meshopt opt-in and fails closed without probe confirmation", async () => {
    const diagnostics = await ensureCompressedTextureSupport(
      { draco: true, meshopt: true, ktx2: true },
      { dracoAvailable: false, meshoptAvailable: false, ktx2Available: false }
    );
    expect(diagnostics.schema).toBe("a3d-compressed-texture-support");
    expect(diagnostics.draco).toMatchObject({ requested: true, available: false });
    expect(diagnostics.meshopt).toMatchObject({ requested: true, available: false });
    expect(diagnostics.ktx2).toMatchObject({ requested: true, available: false });
    expect(diagnostics.meshopt.detail).toMatch(/fail closed/);
    expect(diagnostics.chosenKtx2Target).toBe("rgba8");
  });

  it("defaults draco/meshopt to unrequested and ktx2 to requested", async () => {
    const diagnostics = await ensureCompressedTextureSupport(
      {},
      { dracoAvailable: false, meshoptAvailable: false, ktx2Available: false }
    );
    expect(diagnostics.draco.requested).toBe(false);
    expect(diagnostics.meshopt.requested).toBe(false);
    expect(diagnostics.ktx2.requested).toBe(true);
  });

  it("never reports success for a decoder no probe confirmed", async () => {
    const diagnostics = await ensureCompressedTextureSupport(
      { draco: true, meshopt: true, ktx2: true, targetFormat: "astc-4x4-rgba-unorm" },
      {
        dracoAvailable: async () => true,
        meshoptAvailable: false,
        ktx2Available: true,
        gpuCompressedFormats: ["etc2-rgba8unorm", "bc3-rgba-unorm"]
      }
    );
    expect(diagnostics.draco.available).toBe(true);
    expect(diagnostics.meshopt.available).toBe(false);
    expect(diagnostics.chosenKtx2Target).toBe("etc2-rgba8unorm");
  });
});

describe("C3 anisotropy sampler control", () => {
  it("defaults to 8x where supported", () => {
    expect(DEFAULT_SAMPLER_ANISOTROPY).toBe(8);
    expect(resolveSamplerAnisotropy()).toMatchObject({ applied: 8, capped: false });
    expect(resolveSamplerAnisotropy({ maxSupported: 16 })).toMatchObject({ applied: 8, capped: false });
  });

  it("passes the request through when the capability is unknown; the renderer clamps", () => {
    const resolution = resolveSamplerAnisotropy({ desired: 8 });
    expect(resolution).toMatchObject({ applied: 8, capped: false });
    expect(resolution.detail).toMatch(/clamps to the device maximum/);
  });

  it("gates higher opt-ins behind the capability probe and folds down safely", () => {
    expect(resolveSamplerAnisotropy({ desired: 16, maxSupported: 16 }).applied).toBe(16);
    const capped = resolveSamplerAnisotropy({ desired: 16, maxSupported: 4 });
    expect(capped).toMatchObject({ applied: 4, capped: true });
    expect(resolveSamplerAnisotropy({ desired: 8, maxSupported: 1 })).toMatchObject({ applied: 1, capped: true });
    expect(resolveSamplerAnisotropy({ desired: 12, maxSupported: 16 }).applied).toBe(8);
  });

  it("falls back to the 8x default for invalid requests", () => {
    expect(resolveSamplerAnisotropy({ desired: 0 }).applied).toBe(8);
    expect(resolveSamplerAnisotropy({ desired: Number.NaN }).applied).toBe(8);
  });

  it("feeds Sampler construction for root textured slots", () => {
    const sampler = new Sampler({ maxAnisotropy: resolveSamplerAnisotropy({ desired: 8 }).applied });
    expect(sampler.maxAnisotropy).toBe(8);
  });
});

describe("C3 sRGB/linear discipline across presets", () => {
  it("pins the decode policy: baseColor and emissive decode, data maps stay linear", () => {
    expect(EXTERNAL_PARITY_TEXTURE_COLOR_POLICY["base-color"]).toBe("srgb");
    expect(EXTERNAL_PARITY_TEXTURE_COLOR_POLICY.emissive).toBe("srgb");
    for (const semantic of ["normal", "metallic-roughness", "occlusion"] as const) {
      expect(EXTERNAL_PARITY_TEXTURE_COLOR_POLICY[semantic]).toBe("linear");
    }
    expect(validateTextureColorSpace("base-color", "srgb")).toMatchObject({ pass: true });
    expect(validateTextureColorSpace("emissive", "srgb")).toMatchObject({ pass: true });
    expect(validateTextureColorSpace("base-color", "linear")).toMatchObject({ pass: false, expected: "srgb" });
    expect(validateTextureColorSpace("normal", "srgb")).toMatchObject({ pass: false, expected: "linear" });
  });

  it("covers every checked-in texture set (C2 presets land here when they ship maps)", () => {
    const expected: Record<string, "srgb" | "linear"> = {
      baseColor: "srgb",
      emissive: "srgb",
      normal: "linear",
      metallicRoughness: "linear",
      occlusion: "linear",
      clearcoat: "linear",
      transmission: "linear",
      alpha: "linear"
    };
    expect(THREE_COMPAT_TEXTURE_SETS.length).toBeGreaterThanOrEqual(25);
    for (const set of THREE_COMPAT_TEXTURE_SETS) {
      const semantics = set.maps.map((map) => map.semantic);
      for (const required of ["baseColor", "normal", "metallicRoughness", "occlusion"] as const) {
        expect(semantics).toContain(required);
      }
      for (const map of set.maps) {
        expect(map.colorSpace, `${set.id}/${map.semantic}`).toBe(expected[map.semantic]);
      }
    }
    for (const preset of listThreeCompatPbrMaterials()) {
      if (!preset.textureSetId) continue;
      expect(findThreeCompatTextureSet(preset.textureSetId)?.id, preset.id).toBe(preset.textureSetId);
    }
  });

  it("binds disciplined color spaces on TexturedPBRMaterial and rejects mistags", () => {
    const rgba8 = (fill: number): Uint8Array => new Uint8Array(2 * 2 * 4).fill(fill);
    const material = new TexturedPBRMaterial({
      baseColorTexture: new Texture({ width: 2, height: 2, colorSpace: "srgb", data: rgba8(128) }),
      baseColorSampler: new Sampler({ maxAnisotropy: 8 }),
      normalTexture: new Texture({ width: 2, height: 2, colorSpace: "linear", data: rgba8(128) }),
      metallicRoughnessTexture: new Texture({ width: 2, height: 2, colorSpace: "linear", data: rgba8(128) }),
      occlusionTexture: new Texture({ width: 2, height: 2, colorSpace: "linear", data: rgba8(128) }),
      emissiveTexture: new Texture({ width: 2, height: 2, colorSpace: "srgb", data: rgba8(10) })
    });
    for (const slot of ["u_baseColorTexture", "u_normalTexture", "u_metallicRoughnessTexture", "u_occlusionTexture", "u_emissiveTexture"] as const) {
      const binding = material.getParameter(slot);
      expect(isTextureBinding(binding), slot).toBe(true);
      if (isTextureBinding(binding)) expect(binding.validate(), slot).toMatchObject({ ok: true });
    }
    const baseColor = material.getParameter("u_baseColorTexture");
    expect(isTextureBinding(baseColor) && baseColor.sampler.maxAnisotropy).toBe(8);

    const mistagged = new TexturedPBRMaterial({
      baseColorTexture: new Texture({ width: 2, height: 2, colorSpace: "linear", data: rgba8(128) })
    });
    const mistaggedBinding = mistagged.getParameter("u_baseColorTexture");
    expect(isTextureBinding(mistaggedBinding)).toBe(true);
    if (isTextureBinding(mistaggedBinding)) {
      const validation = mistaggedBinding.validate();
      expect(validation.ok).toBe(false);
      expect(validation.diagnostics.join(" ")).toMatch(/must be srgb, got linear/);
    }

    const srgbNormal = new TextureBinding({
      name: "u_normalTexture",
      texture: new Texture({ width: 2, height: 2, colorSpace: "srgb", data: rgba8(128) }),
      expectedColorSpace: "linear"
    });
    expect(srgbNormal.validate().ok).toBe(false);
  });
});
