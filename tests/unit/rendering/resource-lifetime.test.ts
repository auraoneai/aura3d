import { describe, expect, it } from "vitest";
import { Geometry, MockRenderDevice, Renderer, Texture, TexturedUnlitMaterial, compressedTextureByteLength } from "../../../packages/rendering/src";

describe("render resource lifetime diagnostics", () => {
  it("disposes material parameter references and blocks later mutation", () => {
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const material = new TexturedUnlitMaterial({
      color: [1, 1, 1, 1],
      texture
    });

    expect(material.disposed).toBe(false);
    expect(material.getParameters().size).toBeGreaterThan(0);

    material.dispose();
    material.dispose();

    expect(material.disposed).toBe(true);
    expect(() => material.setParameter("u_opacity", 0.5)).toThrow(/disposed/);
    expect(() => material.getParameters()).toThrow(/disposed/);
    texture.dispose();
  });

  it("reports deterministic texture byte sizes by texture format", () => {
    expect(new Texture({ width: 4, height: 2, format: "rgba8" }).byteLength).toBe(32);
    expect(new Texture({ width: 4, height: 2, format: "rgba16f" }).byteLength).toBe(64);
    expect(new Texture({ width: 4, height: 2, format: "rgba32f" }).byteLength).toBe(128);
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
    const rgba16fMipTexture = new Texture({
      width: 4,
      height: 2,
      format: "rgba16f",
      mipLevels: [
        { width: 4, height: 2, data: new Uint16Array(4 * 2 * 4) },
        { width: 2, height: 1, data: new Uint16Array(2 * 1 * 4) }
      ]
    });
    expect(rgba16fMipTexture.byteLength).toBe(80);
  });

  it("validates compressed texture payloads and fallback sizes", () => {
    expect(() => new Texture({ width: 4, height: 4, format: "bc3-rgba-unorm" })).toThrow(/compressed data/i);
    expect(() => new Texture({ width: 4, height: 4, format: "bc3-rgba-unorm", data: new Uint8Array(8) })).toThrow(/16 bytes/);
    expect(() => new Texture({ width: 1, height: 1, data: new Uint8Array(4), mipLevels: [{ width: 1, height: 1, data: new Uint8Array(4) }] })).toThrow(/both data and mipLevels/);
    expect(() => new Texture({ width: 2, height: 2, format: "depth24", mipLevels: [{ width: 2, height: 2, data: new Uint8Array(16) }] })).toThrow(/Depth textures/);
    expect(() => new Texture({ width: 2, height: 2, mipLevels: [{ width: 1, height: 1, data: new Uint8Array(4) }] })).toThrow(/first level/);
    expect(() => new Texture({ width: 2, height: 2, mipLevels: [{ width: 2, height: 2, data: new Uint8Array(4) }] })).toThrow(/16 bytes/);
    expect(() => new Texture({ width: 2, height: 2, format: "rgba16f", data: new Float32Array(2 * 2 * 4) })).toThrow(/Uint16Array/);
    expect(() => new Texture({ width: 2, height: 2, format: "rgba32f", data: new Uint16Array(2 * 2 * 4) })).toThrow(/Float32Array/);
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
      bufferBytes: 0,
      textureBytes: 80,
      approximateGpuMemoryBytes: 80,
      disposedRenderTargets: 0,
      disposedTextures: 0
    });

    large.dispose();

    expect(device.getDiagnostics()).toMatchObject({
      renderTargets: 1,
      textures: 1,
      textureBytes: 16,
      approximateGpuMemoryBytes: 16,
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
      bufferBytes: 42,
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

  it("does not leave live GPU resources across repeated renderer load and unload cycles", async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
      const geometry = Geometry.triangle();

      renderer.render({
        renderItems: [{ geometry, label: `reload-triangle-${iteration}` }],
        postprocess: {
          bloom: { threshold: 0.1, intensity: 0.2, radius: 1 },
          fxaa: true
        }
      });
      renderer.dispose();
      geometry.dispose();

      expect(renderer.getDiagnostics()).toMatchObject({
        buffers: 0,
        shaders: 0,
        renderTargets: 0,
        textures: 0,
        approximateGpuMemoryBytes: 0
      });
    }
  });
});
