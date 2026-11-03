import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import type { TextureDescriptor } from "../../../../packages/rendering/src/Texture";
import {
  applyTextureBudget,
  releaseTextureBudget,
  textureBudgetReport
} from "../../../../packages/rendering/src/textures/TextureBudget";

function rgba(width: number, height: number, label = "texture"): TextureDescriptor {
  return { width, height, format: "rgba8", label, data: new Uint8Array(width * height * 4).fill(25), generateMipmaps: false };
}

function rgbaMipChain(size: number, label = "texture"): TextureDescriptor {
  const mipLevels: NonNullable<TextureDescriptor["mipLevels"]>[number][] = [];
  for (let width = size; ; width = Math.max(1, Math.floor(width / 2))) {
    mipLevels.push({ width, height: width, data: new Uint8Array(width * width * 4).fill(width) });
    if (width === 1) break;
  }
  return { width: size, height: size, format: "rgba8", label, mipLevels, generateMipmaps: false };
}

function allocatedBytes(texture: TextureDescriptor): number {
  return texture.mipLevels?.reduce((sum, mip) => sum + mip.data.byteLength, 0) ?? texture.data?.byteLength ?? 0;
}

describe("texture budget admission", () => {
  it("reduces RGBA data to meet maxDimension while keeping the original pixels intact", () => {
    const device = new MockRenderDevice();
    const original = rgba(4, 4, "albedo");
    const returned = applyTextureBudget(original, { maxDimension: 2, maxBytes: 64 }, device);
    expect([returned.width, returned.height, allocatedBytes(returned)]).toEqual([2, 2, 16]);
    expect([...returned.data!]).toEqual(new Array(16).fill(25));
    expect([original.width, original.height, original.data?.byteLength]).toEqual([4, 4, 64]);
    expect(textureBudgetReport(device)).toEqual({ textureBytes: 16, downscaled: [{ id: "albedo", from: 64, to: 16 }] });
    releaseTextureBudget(returned, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("drops BC7 top mips using whole blocks, including sub-4-pixel levels", () => {
    const device = new MockRenderDevice();
    const original: TextureDescriptor = {
      width: 16, height: 8, format: "bc7-rgba-unorm", label: "compressed",
      mipLevels: [
        { width: 16, height: 8, data: new Uint8Array(128).fill(1) },
        { width: 8, height: 4, data: new Uint8Array(32).fill(2) },
        { width: 4, height: 2, data: new Uint8Array(16).fill(3) },
        { width: 2, height: 1, data: new Uint8Array(16).fill(4) },
        { width: 1, height: 1, data: new Uint8Array(16).fill(5) }
      ]
    };
    const returned = applyTextureBudget(original, { maxDimension: 8, maxBytes: 80 }, device);
    expect([returned.width, returned.height]).toEqual([8, 4]);
    expect(returned.mipLevels?.map((mip) => mip.data[0])).toEqual([2, 3, 4, 5]);
    expect(allocatedBytes(returned)).toBe(80);
    expect(textureBudgetReport(device).textureBytes).toBe(80);
    releaseTextureBudget(original, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("reduces only a new admission and never alters a texture already returned", () => {
    const device = new MockRenderDevice();
    const first = applyTextureBudget(rgbaMipChain(4, "first"), { maxBytes: 104 }, device);
    const second = applyTextureBudget(rgbaMipChain(4, "second"), { maxBytes: 104 }, device);
    expect(first.mipLevels?.map((mip) => mip.width)).toEqual([4, 2, 1]);
    expect(second.mipLevels?.map((mip) => mip.width)).toEqual([2, 1]);
    expect([allocatedBytes(first), allocatedBytes(second), textureBudgetReport(device).textureBytes]).toEqual([84, 20, 104]);
    expect(() => applyTextureBudget(rgba(1, 1, "third"), { maxBytes: 104 }, device)).toThrow(/cannot fit/);
    expect(textureBudgetReport(device).textureBytes).toBe(104);
    releaseTextureBudget(first, device);
    releaseTextureBudget(second, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("deduplicates one identity per device and keeps equal labels independently owned", () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = rgba(2, 2, "shared-label");
    const second = rgba(2, 2, "shared-label");
    const firstOnA = applyTextureBudget(first, { maxBytes: 32 }, a);
    expect(applyTextureBudget(first, { maxBytes: 32 }, a)).toBe(firstOnA);
    applyTextureBudget(second, { maxBytes: 32 }, a);
    applyTextureBudget(first, { maxBytes: 32 }, b);
    expect(textureBudgetReport(a).textureBytes).toBe(32);
    expect(textureBudgetReport(b).textureBytes).toBe(16);
    releaseTextureBudget(firstOnA, a);
    releaseTextureBudget(first, a);
    expect(textureBudgetReport(a).textureBytes).toBe(16);
    expect(textureBudgetReport(b).textureBytes).toBe(16);
    releaseTextureBudget(second, a);
    releaseTextureBudget(first, b);
    expect([textureBudgetReport(a).textureBytes, textureBudgetReport(b).textureBytes]).toEqual([0, 0]);
  });
});
