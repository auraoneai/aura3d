import { describe, expect, it } from "vitest";
import { Geometry, MockRenderDevice, Renderer, Texture, compressedTextureByteLength } from "../../../packages/rendering/src";

describe("render resource lifetime diagnostics", () => {
  it("reports deterministic texture byte sizes by texture format", () => {
    expect(new Texture({ width: 4, height: 2, format: "rgba8" }).byteLength).toBe(32);
    expect(new Texture({ width: 4, height: 2, format: "depth24" }).byteLength).toBe(32);
    expect(compressedTextureByteLength(8, 8, "bc1-rgba-unorm")).toBe(32);
    expect(new Texture({
      width: 8,
      height: 8,
      format: "bc1-rgba-unorm",
      data: new Uint8Array(32),
      fallbackData: new Uint8Array(8 * 8 * 4)
    }).byteLength).toBe(32);
    const mipTexture = new Texture({
      width: 8,
      height: 8,
      format: "etc2-rgba8unorm",
      mipLevels: [
        { width: 8, height: 8, data: new Uint8Array(64) },
        { width: 4, height: 4, data: new Uint8Array(16) }
      ],
      fallbackMipLevels: [
        { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) },
        { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) }
      ]
    });
    expect(mipTexture.byteLength).toBe(80);
    expect(mipTexture.fallbackByteLength).toBe(320);
    const rgbaMipTexture = new Texture({
      width: 4,
      height: 2,
      format: "rgba8",
      mipLevels: [
        { width: 4, height: 2, data: new Uint8Array(4 * 2 * 4) },
        { width: 2, height: 1, data: new Uint8Array(2 * 1 * 4) }
      ]
    });
    expect(rgbaMipTexture.byteLength).toBe(40);
  });

  it("validates compressed texture payloads and fallback sizes", () => {
    expect(() => new Texture({ width: 4, height: 4, format: "bc3-rgba-unorm" })).toThrow(/compressed data/i);
    expect(() => new Texture({ width: 4, height: 4, format: "bc3-rgba-unorm", data: new Uint8Array(8) })).toThrow(/16 bytes/);
    expect(() => new Texture({ width: 1, height: 1, data: new Uint8Array(4), mipLevels: [{ width: 1, height: 1, data: new Uint8Array(4) }] })).toThrow(/both data and mipLevels/);
    expect(() => new Texture({ width: 2, height: 2, format: "depth24", mipLevels: [{ width: 2, height: 2, data: new Uint8Array(16) }] })).toThrow(/rgba8/);
    expect(() => new Texture({ width: 2, height: 2, mipLevels: [{ width: 1, height: 1, data: new Uint8Array(4) }] })).toThrow(/first level/);
    expect(() => new Texture({ width: 2, height: 2, mipLevels: [{ width: 2, height: 2, data: new Uint8Array(4) }] })).toThrow(/RGBA8 bytes/);
    expect(() =>
      new Texture({
        width: 4,
        height: 4,
        format: "bc3-rgba-unorm",
        data: new Uint8Array(16),
        fallbackData: new Uint8Array(4)
      })
    ).toThrow(/fallbackData/);
    expect(() => new Texture({ width: 1, height: 1, fallbackData: new Uint8Array(4) })).toThrow(/fallbackData/);
  });

  it("accounts live and disposed render-target textures in device diagnostics", () => {
    const device = new MockRenderDevice();
    const large = device.createRenderTarget({ width: 4, height: 4, label: "large-target" });
    const small = device.createRenderTarget({ width: 2, height: 2, label: "small-target" });

    expect(device.getDiagnostics()).toMatchObject({
      renderTargets: 2,
      textures: 2,
      textureBytes: 80,
      disposedRenderTargets: 0,
      disposedTextures: 0
    });

    large.dispose();

    expect(device.getDiagnostics()).toMatchObject({
      renderTargets: 1,
      textures: 1,
      textureBytes: 16,
      disposedRenderTargets: 1,
      disposedTextures: 1
    });

    small.dispose();

    expect(device.getDiagnostics()).toMatchObject({
      renderTargets: 0,
      textures: 0,
      textureBytes: 0,
      disposedRenderTargets: 2,
      disposedTextures: 2
    });
  });

  it("reports renderer-created GPU resources as disposed after renderer disposal", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.triangle();

    renderer.render([{ geometry, label: "lifetime-triangle" }]);
    expect(renderer.getDiagnostics()).toMatchObject({
      buffers: 2,
      shaders: 1,
      disposedBuffers: 0,
      disposedShaders: 0
    });

    renderer.dispose();

    expect(renderer.getDiagnostics()).toMatchObject({
      buffers: 0,
      shaders: 0,
      disposedBuffers: 2,
      disposedShaders: 1
    });

    geometry.dispose();
  });
});
