import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { upgradeCustomMaterialTextures } from "../../../packages/engine/src/agent-api/compiler/customTextures.js";
import { isTextureBinding, type TextureBinding } from "../../../packages/rendering/src";
import type { AuraCustomMaterialSpec, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types.js";

// R-26: texture asset refs (`assets.x`) on material.custom / material.node uniforms
// load after mount and bind with the real image; failures stay named, never silent.

const loader = vi.fn<(url: string) => Promise<ImageBitmap>>();
const bitmap = () => ({ width: 2, height: 2, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

const assetRef = (url: string | undefined) => ({ kind: "aura-asset-ref", type: "texture", id: "diffuse", ...(url ? { url } : {}) });
const spec = (value: unknown): AuraCustomMaterialSpec => ({
  glsl: { fragment: "out vec4 outColor;\nvoid main() { outColor = texture(map, vec2(0.5)); }" },
  uniforms: { map: { type: "texture2d", value } }
});

function fixture(value: unknown) {
  const custom = spec(value);
  const material = createCustomShaderMaterial(custom, "primitive-box");
  const resource = {
    name: "box",
    material,
    materialSpec: { kind: "custom", custom },
    textureWarnings: [] as string[],
    textureDisposer: undefined as (() => void) | undefined
  };
  const entries = [{ resources: [resource] }] as unknown as readonly ProductionRuntimePrimitiveEntry[];
  const warnings: string[] = [];
  return { material, resource, entries, warnings, warn: (message: string) => { warnings.push(message); } };
}

const bindingOf = (material: ReturnType<typeof createCustomShaderMaterial>): TextureBinding => {
  const value = material.getParameter("u_map");
  expect(isTextureBinding(value)).toBe(true);
  return value as TextureBinding;
};

describe("upgradeCustomMaterialTextures — asset refs on custom materials (R-26)", () => {
  beforeEach(() => { loader.mockReset(); });

  it("loads the asset url and binds a real texture, then releases it on dispose", async () => {
    const image = bitmap();
    loader.mockResolvedValue(image);
    const { material, resource, entries, warnings, warn } = fixture(assetRef("/diffuse.png"));
    expect(bindingOf(material).texture).toBeNull();
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).toHaveBeenCalledWith("/diffuse.png");
    const binding = bindingOf(material);
    expect(binding.texture).not.toBeNull();
    expect(binding.texture!.width).toBe(2);
    expect(binding.texture!.colorSpace).toBe("linear");
    expect(warnings).toEqual([]);
    expect(material.customDiagnostics).toEqual([]);
    expect(resource.textureDisposer).toBeTypeOf("function");
    const texture = binding.texture!;
    resource.textureDisposer!();
    expect(texture.disposed).toBe(true);
    expect(image.close).toHaveBeenCalledTimes(1);
    material.dispose();
  });

  it("runs once per resource", async () => {
    loader.mockResolvedValue(bitmap());
    const { material, entries, warn } = fixture(assetRef("/diffuse.png"));
    await upgradeCustomMaterialTextures(entries, warn, loader);
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    material.dispose();
  });

  it("an asset without a url is named and keeps the white fallback", async () => {
    const { material, resource, entries, warnings, warn } = fixture(assetRef(undefined));
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_ASSET_URL_MISSING]"))).toBe(true);
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    expect(resource.textureWarnings.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    expect(bindingOf(material).texture).toBeNull();
    material.dispose();
  });

  it("a failed load is named and keeps the white fallback", async () => {
    loader.mockRejectedValue(new Error("404"));
    const { material, entries, warnings, warn } = fixture(assetRef("/missing.png"));
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_ASSET_LOAD_FAILED]") && line.includes("404"))).toBe(true);
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    expect(bindingOf(material).texture).toBeNull();
    material.dispose();
  });

  it("a material disposed while the image loads binds nothing and releases the bitmap", async () => {
    const image = bitmap();
    let finish: (value: ImageBitmap) => void = () => undefined;
    loader.mockReturnValue(new Promise<ImageBitmap>((resolve) => { finish = resolve; }));
    const { material, resource, entries, warn } = fixture(assetRef("/diffuse.png"));
    const pending = upgradeCustomMaterialTextures(entries, warn, loader);
    material.dispose();
    finish(image);
    await pending;
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(resource.textureDisposer).toBeUndefined();
  });

  it("a handle-bound uniform needs no load and raises no warning", async () => {
    const { texture } = await import("../../../packages/engine/src/agent-api/nodes/texture.js");
    const handle = texture.data({ width: 2, height: 2, data: new Uint8Array(16).fill(255) });
    const { material, entries, warnings, warn } = fixture(handle);
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    expect(bindingOf(material).texture).toBe(handle.texture);
    material.dispose();
  });
});
