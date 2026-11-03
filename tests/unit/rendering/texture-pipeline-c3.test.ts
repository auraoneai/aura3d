import { describe, expect, it, vi } from "vitest";
import { ensureCompressedTextureSupport } from "../../../packages/assets/src";
import { assets as engineAssets } from "../../../packages/engine/src/agent-api/AssetDecoders";
import {
  findThreeCompatTextureSet,
  listThreeCompatPbrMaterials,
  THREE_COMPAT_TEXTURE_SETS
} from "../../../packages/engine/src/devtools/materials/node";
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
  it("reports explicitly requested decoders and fails closed without probe confirmation", async () => {
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

  it.each([false, true])("defaults meshopt and KTX2 on, with lazy Draco, when probe availability is %s", async (available) => {
    const probes = { dracoAvailable: available, meshoptAvailable: available, ktx2Available: available };
    // Both omitted request and empty options use the same policy, independent of probe success.
    for (const request of [undefined, {}]) {
      const diagnostics = await ensureCompressedTextureSupport(request, probes);
      expect(diagnostics.draco).toMatchObject({ requested: false, available });
      expect(diagnostics.meshopt).toMatchObject({ requested: true, available });
      expect(diagnostics.ktx2).toMatchObject({ requested: true, available });
      expect(diagnostics.chosenKtx2Target).toBe(available ? "etc2-rgba8unorm" : "rgba8");
      if (!available) expect(diagnostics.meshopt.detail).toMatch(/fail closed/);
    }
  });

  it("preserves the default policy and mixed probe results through the engine decoder facade", async () => {
    const probes = {
      dracoAvailable: true,
      meshoptAvailable: false,
      ktx2Available: true,
      gpuCompressedFormats: ["etc2"]
    };
    const diagnostics = await engineAssets.ensureDecoders(undefined, probes);
    expect(diagnostics).toMatchObject({
      draco: { requested: false, available: true },
      meshopt: { requested: true, available: false },
      ktx2: { requested: true, available: true },
      chosenKtx2Target: "etc2-rgba8unorm"
    });
    expect(diagnostics).toEqual(await ensureCompressedTextureSupport(undefined, probes));
  });

  it("honors explicit opt-outs while reporting probed availability separately", async () => {
    const dracoAvailable = vi.fn(() => true);
    const meshoptAvailable = vi.fn(() => true);
    const ktx2Available = vi.fn(async () => true);
    const diagnostics = await ensureCompressedTextureSupport(
      { draco: true, meshopt: false, ktx2: false, targetFormat: "astc-4x4-rgba-unorm" },
      { dracoAvailable, meshoptAvailable, ktx2Available, gpuCompressedFormats: ["astc"] }
    );
    expect(diagnostics.draco).toMatchObject({ requested: true, available: true });
    expect(diagnostics.meshopt).toMatchObject({ requested: false, available: true });
    expect(diagnostics.ktx2).toMatchObject({ requested: false, available: true });
    expect(diagnostics.meshopt.detail).toMatch(/not requested/i);
    expect(diagnostics.ktx2.detail).toMatch(/not requested/i);
    expect(diagnostics.chosenKtx2Target).toBe("rgba8");
    expect(dracoAvailable).toHaveBeenCalledOnce();
    expect(meshoptAvailable).toHaveBeenCalledOnce();
    expect(ktx2Available).toHaveBeenCalledOnce();
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

  it("accepts color textures in their declared color space and rejects sRGB data maps", () => {
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

    const linearColor = new Texture({ width: 2, height: 2, colorSpace: "linear", data: rgba8(128) });
    const linearMaterial = new TexturedPBRMaterial({ baseColorTexture: linearColor });
    const linearBinding = linearMaterial.getParameter("u_baseColorTexture");
    expect(isTextureBinding(linearBinding)).toBe(true);
    if (isTextureBinding(linearBinding)) {
      expect(linearBinding.validate().ok).toBe(true);
      expect(linearBinding.texture).toBe(linearColor);
      expect(linearBinding.texture?.colorSpace).toBe("linear");
    }

    const srgbNormal = new TextureBinding({
      name: "u_normalTexture",
      texture: new Texture({ width: 2, height: 2, colorSpace: "srgb", data: rgba8(128) }),
      expectedColorSpace: "linear"
    });
    expect(srgbNormal.validate().ok).toBe(false);
  });
});
