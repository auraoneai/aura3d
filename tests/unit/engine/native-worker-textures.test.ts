import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { bitmapRgbaPixels, auraTextureRefPixels, createProductionPrimitiveTextureIntent, loadProductionPrimitiveBitmap, upgradeProductionPrimitiveResource, upgradeProductionPrimitiveTextures } from "../../../packages/engine/src/agent-api/compiler/textures.js";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { TextureHandle } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { Texture, TextureBinding } from "../../../packages/rendering/src/index.js";
import type { AuraMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";

class Bitmap {
  closed = false;
  constructor(readonly width: number, readonly height: number, readonly pixels: Uint8ClampedArray) {}
  close(): void { this.closed = true; }
}
class Offscreen {
  static draws: { source: Bitmap | Offscreen; width: number; height: number }[] = [];
  static unavailable = false;
  pixels: Uint8ClampedArray;
  constructor(public width: number, public height: number) { this.pixels = new Uint8ClampedArray(width * height * 4); }
  getContext(kind: string): unknown {
    if (kind !== "2d" || Offscreen.unavailable) return null;
    return {
      drawImage: (source: Bitmap | Offscreen, _x: number, _y: number, width = source.width, height = source.height) => {
        Offscreen.draws.push({ source, width, height });
        this.pixels = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const srcX = Math.min(source.width - 1, Math.floor(x * source.width / width));
          const srcY = Math.min(source.height - 1, Math.floor(y * source.height / height));
          this.pixels.set(source.pixels.subarray((srcY * source.width + srcX) * 4, (srcY * source.width + srcX + 1) * 4), (y * width + x) * 4);
        }
      },
      getImageData: () => ({ data: this.pixels })
    };
  }
}

beforeEach(() => {
  Offscreen.draws = []; Offscreen.unavailable = false;
  vi.stubGlobal("document", undefined);
  vi.stubGlobal("OffscreenCanvas", Offscreen);
  vi.stubGlobal("ImageBitmap", Bitmap);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("worker texture compositing", () => {
  it("reads bitmap pixels through an OffscreenCanvas without a DOM", () => {
    const bitmap = new Bitmap(2, 1, new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]));
    const result = bitmapRgbaPixels(bitmap as unknown as ImageBitmap);
    expect(result).toMatchObject({ width: 2, height: 1 });
    expect([...result.data]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(Offscreen.draws[0]).toMatchObject({ source: bitmap, width: 2, height: 1 });
  });

  it("reads a worker-owned canvas source through a real texture handle", () => {
    const source = new Offscreen(1, 1); source.pixels.set([9, 8, 7, 255]);
    const texture = new Texture({ width: 1, height: 1, source: source as never });
    const handle = new TextureHandle(texture);
    const result = auraTextureRefPixels(handle);
    expect(result && [...result.data]).toEqual([9, 8, 7, 255]);
    handle.dispose();
  });

  it("resamples differently sized metallic maps and composes the actual G/B channels", async () => {
    const rough = new Bitmap(2, 1, new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]));
    const metal = new Bitmap(1, 1, new Uint8ClampedArray([70, 80, 90, 255]));
    vi.stubGlobal("fetch", async (url: string) => new Response(url, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => (await blob.text()) === "/rough" ? rough : metal);
    const asset = (url: string) => ({ kind: "aura-asset-ref", id: url, type: "texture", format: "png", url });
    const spec = { roughnessMap: asset("/rough"), metalnessMap: asset("/metal") } as unknown as AuraMaterialSpec;
    const node = primitives.box({ material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0];
    const resource = entry.resources[0];
    await upgradeProductionPrimitiveResource(resource, node, spec, createProductionPrimitiveTextureIntent(spec), 4096);
    expect(resource.textureStatus).toBe("textured");
    const binding = resource.texturedMaterial!.getParameter("u_metallicRoughnessTexture") as TextureBinding;
    expect([...(binding.texture!.data as Uint8Array)]).toEqual([255, 20, 90, 255, 255, 50, 90, 255]);
    expect(Offscreen.draws.some((draw) => draw.source === metal && draw.width === 2 && draw.height === 1)).toBe(true);
    resource.textureDisposer?.(); resource.texturedMaterial?.dispose(); resource.geometry.dispose(); resource.material.dispose();
    expect([rough.closed, metal.closed]).toEqual([true, true]);
  });

  it("reports missing canvas and missing 2D contexts clearly", () => {
    const bitmap = new Bitmap(1, 1, new Uint8ClampedArray(4));
    Offscreen.unavailable = true;
    expect(() => bitmapRgbaPixels(bitmap as unknown as ImageBitmap)).toThrow(/2d canvas unavailable/);
    vi.stubGlobal("OffscreenCanvas", undefined);
    expect(() => bitmapRgbaPixels(bitmap as unknown as ImageBitmap)).toThrow(/DOM canvas or OffscreenCanvas/);
  });

  it("forwards cancellation to fetch and closes a bitmap returned after abort", async () => {
    const bitmap = new Bitmap(1, 1, new Uint8ClampedArray([1, 2, 3, 255]));
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => new Response("image", { headers: { "content-type": "image/png" } }));
    let complete!: (value: Bitmap) => void;
    let markDecode!: () => void;
    let markClosed!: () => void;
    const decoding = new Promise<void>((resolve) => { markDecode = resolve; });
    const closed = new Promise<void>((resolve) => { markClosed = resolve; });
    const close = bitmap.close.bind(bitmap);
    bitmap.close = () => { close(); markClosed(); };
    const decode = vi.fn(() => new Promise<Bitmap>((resolve) => { complete = resolve; markDecode(); }));
    vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("createImageBitmap", decode);
    const pending = loadProductionPrimitiveBitmap("/image", controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await decoding;
    expect(fetchMock).toHaveBeenCalledWith("/image", expect.objectContaining({ signal: controller.signal }));
    controller.abort();
    await rejected; // The caller settles even though the browser decoder is still pending.
    expect(bitmap.closed).toBe(false);
    complete(bitmap);
    await closed;
    expect(bitmap.closed).toBe(true);
    await expect(loadProductionPrimitiveBitmap("/image", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("abandons an aborted texture upgrade without a fallback warning or late material", async () => {
    const bitmap = new Bitmap(1, 1, new Uint8ClampedArray([1, 2, 3, 255]));
    const controller = new AbortController();
    vi.stubGlobal("fetch", async () => new Response("image", { headers: { "content-type": "image/png" } }));
    let complete!: (value: Bitmap) => void;
    let markDecode!: () => void;
    const decoding = new Promise<void>((resolve) => { markDecode = resolve; });
    vi.stubGlobal("createImageBitmap", () => new Promise<Bitmap>((resolve) => { complete = resolve; markDecode(); }));
    const spec = { roughnessMap: { kind: "aura-asset-ref", id: "map", type: "texture", format: "png", url: "/rough" } } as unknown as AuraMaterialSpec;
    const node = primitives.box({ material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]; const resource = entry.resources[0];
    const warn = vi.fn();
    const pending = upgradeProductionPrimitiveTextures([entry], warn, 4096, undefined, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await decoding;
    let finished = false;
    void pending.then(() => { finished = true; }, () => { finished = true; });
    controller.abort();
    await Promise.resolve();
    expect(finished).toBe(false); // The resource job retains its slot until decoder cleanup.
    complete(bitmap);
    await rejected;
    expect(bitmap.closed).toBe(true);
    expect(resource.textureStatus).toBe("none");
    expect(resource.texturedMaterial).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    resource.geometry.dispose(); resource.material.dispose();
  });
});
