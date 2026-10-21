/**
 * threejs-parity lane L4 ST-01/ST-02/ST-03/ST-06/ST-07:
 * `texture.*` namespace factories, live handle semantics, runtime upload
 * marking, the handle→device compiler binding, and app asset-event wiring.
 *
 * GPU upload itself is proven in tests/browser/parity-texture.spec.ts — here
 * the assertions stay at the contract layer: factories build valid device
 * `Texture`s, handle fields drive revision/sampler/transform, `needsUpdate`
 * bumps revision exactly once, and `texture.load` resolves through a real
 * async path with progress/error events.
 */

import { afterEach, describe, expect, test } from "vitest";
import { texture, TextureHandle } from "@aura3d/engine";
import {
  auraTextureRefTexture,
  setTextureAssetManager,
  texture as textureNamespace
} from "../../../packages/engine/src/agent-api/nodes/texture.js";
import {
  auraTextureRefPixels,
  auraTextureRefSampler,
  auraTextureRefTransform,
  isAuraTextureRef,
  mergedTransform,
  resolveAuraTextureRef
} from "../../../packages/engine/src/agent-api/compiler/textures.js";
import {
  emitAppAssetError,
  emitAppAssetProgress,
  registerAppAssetEventHandlers
} from "../../../packages/engine/src/agent-api/assetEvents.js";
import type { AssetManager } from "@aura3d/assets";

const rgba = (w: number, h: number, fill = 255) => new Uint8Array(w * h * 4).fill(fill);

afterEach(() => {
  setTextureAssetManager(null);
});

describe("ST-01 texture.* namespace factories", () => {
  test("texture.data builds an rgba8 device texture with three defaults", () => {
    const handle = texture.data({ width: 4, height: 2, data: rgba(4, 2) });
    expect(handle).toBeInstanceOf(TextureHandle);
    expect(handle.kind).toBe("aura-texture-ref");
    expect(handle.minFilter).toBe("linear-mipmap-linear");
    expect(handle.magFilter).toBe("linear");
    expect(handle.colorSpace).toBe("linear"); // three DataTexture: NoColorSpace
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.width).toBe(4);
    expect(backing.height).toBe(2);
    expect(backing.format).toBe("rgba8");
    expect(backing.dimension).toBe("2d");
    expect(backing.generateMipmaps).toBe(false); // three DataTexture default
  });

  test("texture.data rejects byte-length mismatches and bad dimensions", () => {
    expect(() => texture.data({ width: 2, height: 2, data: new Uint8Array(3) })).toThrow(/exactly 16 bytes/);
    expect(() => texture.data({ width: 0, height: 2, data: rgba(2, 2) })).toThrow(/positive integer/);
    expect(() => texture.data({ width: 2, height: 2, data: new Float32Array(16), format: "rgba32f" })).not.toThrow();
    expect(() => texture.data({ width: 2, height: 2, data: new Uint16Array(16), format: "rgba16f" })).not.toThrow();
    expect(() => texture.data({ width: 2, height: 2, data: rgba(2, 2), format: "rgba16f" })).toThrow(/exactly 32 bytes/);
  });

  test("texture.dataArray validates the full depth product (layer-count fix)", () => {
    const w = 4, h = 4, d = 3;
    const handle = texture.dataArray({ width: w, height: h, depth: d, data: rgba(w * h * d, 1) });
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.dimension).toBe("2d-array");
    expect(backing.layers).toBe(3);
    // A single-layer buffer must fail — earlier validation only checked layer 0.
    expect(() => texture.dataArray({ width: w, height: h, depth: d, data: rgba(w * h, 1) })).toThrow(/exactly .* bytes/);
  });

  test("texture.compressed stores mip chain and never generates more", () => {
    const handle = texture.compressed({
      format: "bc1-rgba-unorm",
      mipmaps: [
        { width: 8, height: 8, data: new Uint8Array(32) },
        { width: 4, height: 4, data: new Uint8Array(8) }
      ]
    });
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.format).toBe("bc1-rgba-unorm");
    expect(backing.mipLevels.length).toBe(2);
    expect(backing.generateMipmaps).toBe(false);
    expect(() => texture.compressed({ format: "unknown", mipmaps: [{ width: 1, height: 1, data: new Uint8Array(8) }] })).toThrow(/compressed texture format/);
  });

  test("texture.depth builds a depth24 attachment (three DepthTexture)", () => {
    const handle = texture.depth({ width: 16, height: 16 });
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.format).toBe("depth24");
    expect(handle.minFilter).toBe("nearest");
    expect(handle.magFilter).toBe("nearest");
  });

  test("texture.cube requires six same-format square faces", () => {
    const face = { width: 4, height: 4, data: rgba(4, 4) };
    const handle = texture.cube([face, face, face, face, face, face]);
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.dimension).toBe("cube");
    expect(backing.cubeFaces.length).toBe(6);
    expect(backing.cubeFaces.map((f) => f.face)).toEqual(["px", "nx", "py", "ny", "pz", "nz"]);
    expect(() => texture.cube([face, face, face, face, face])).toThrow(/six faces/);
    const wrongSize = { width: 2, height: 2, data: rgba(2, 2) };
    expect(() => texture.cube([face, face, face, face, face, wrongSize])).toThrow(/identical dimensions/);
  });

  test("texture.canvas accepts a canvas-like source (three CanvasTexture)", () => {
    const fakeCanvas = { width: 8, height: 4, getContext: () => null };
    const handle = texture.canvas({ canvas: fakeCanvas, colorSpace: "linear" });
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.source).toBe(fakeCanvas);
    expect(backing.dynamic).toBe(true);
    expect(handle.colorSpace).toBe("linear");
    expect(handle.flipY).toBe(true); // three CanvasTexture flips
  });

  test("texture.video wires per-frame revision polling (three VideoTexture)", () => {
    const fakeVideo = { videoWidth: 32, videoHeight: 16, currentTime: 0, readyState: 4 };
    const handle = texture.video({ video: fakeVideo });
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.generateMipmaps).toBe(false); // three VideoTexture
    expect(handle.minFilter).toBe("linear");
    // Simulated frame advance → the poll marks the texture dirty.
    const revision = backing.revision;
    fakeVideo.currentTime = 0.033;
    backing.pollContentRevision!();
    expect(backing.revision).toBe(revision + 1);
    // Same frame re-polled → no extra bump.
    backing.pollContentRevision!();
    expect(backing.revision).toBe(revision + 1);
  });
});

describe("ST-02 handle semantics (three Texture field surface)", () => {
  test("mutable sampling/transform fields follow the frozen ref shape", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    handle.wrapS = "repeat";
    handle.wrapT = "mirror";
    handle.repeat = [4, 2];
    handle.offset = [0.5, 0.25];
    handle.rotation = Math.PI / 6;
    handle.center = [0.5, 0.5];
    handle.anisotropy = 8;
    handle.minFilter = "nearest-mipmap-linear";
    handle.magFilter = "nearest";
    expect(handle.wrapS).toBe("repeat");
    expect(handle.wrapT).toBe("mirror");
    expect(handle.repeat).toEqual([4, 2]);
    expect(isAuraTextureRef(handle)).toBe(true);
  });

  test("colorSpace/flipY/generateMipmaps write through to the device texture", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    const backing = auraTextureRefTexture(handle)!;
    const revision = backing.revision;
    handle.colorSpace = "srgb";
    expect(backing.colorSpace).toBe("srgb");
    expect(backing.revision).toBe(revision + 1); // write-through marks dirty
    handle.generateMipmaps = true;
    expect(backing.generateMipmaps).toBe(true);
    // Still inside the same dirty cycle — no extra bump until upload clears.
    expect(backing.revision).toBe(revision + 1);
    backing.needsUpdate = false;
    handle.flipY = true; // data textures default flipY false
    expect(backing.flipY).toBe(true);
    expect(backing.revision).toBe(revision + 2);
    // Same-value writes are no-ops.
    handle.flipY = true;
    expect(backing.revision).toBe(revision + 2);
  });

  test("needsUpdate bumps device revision exactly once per dirty cycle (ST-03)", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    const backing = auraTextureRefTexture(handle)!;
    const revision = backing.revision;
    handle.needsUpdate = true;
    expect(backing.revision).toBe(revision + 1);
    expect(handle.needsUpdate).toBe(backing.needsUpdate);
    // Dirty flag is idempotent while unconsumed — the upload clears it.
    handle.needsUpdate = true;
    expect(backing.revision).toBe(revision + 1);
    backing.needsUpdate = false; // devices clear the flag after upload
    handle.needsUpdate = true;
    expect(backing.revision).toBe(revision + 2);
  });

  test("dispose() tears down the backing texture and unbinds the handle", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.disposed).toBe(false);
    handle.dispose();
    expect(backing.disposed).toBe(true);
  });
});

describe("ST-02 compiler binding (handle → {texture, sampler, transform})", () => {
  test("resolveAuraTextureRef returns the live device binding", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    handle.wrapS = "repeat";
    handle.wrapT = "clamp";
    handle.minFilter = "linear-mipmap-nearest";
    handle.anisotropy = 4;
    const binding = resolveAuraTextureRef(handle);
    expect(binding.texture).toBe(auraTextureRefTexture(handle));
    expect(binding.sampler).toBeDefined();
    expect(binding.transform).toBeDefined();
  });

  test("auraTextureRefSampler keeps wrap S/T separate and maps filter enums", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    handle.wrapS = "mirror";
    handle.wrapT = "repeat";
    handle.minFilter = "nearest-mipmap-linear";
    handle.magFilter = "nearest";
    const sampler = auraTextureRefSampler(handle);
    // Sampler keeps addressU/addressV independently (three's wrapS/wrapT).
    expect((sampler as unknown as { addressU: string }).addressU).toBe("mirror-repeat");
    expect((sampler as unknown as { addressV: string }).addressV).toBe("repeat");
  });

  test("auraTextureRefTransform folds three's center-anchored rotation into offset", () => {
    const handle = texture.data({ width: 2, height: 2, data: rgba(2, 2) });
    handle.repeat = [2, 2];
    handle.offset = [1, 0.5];
    handle.rotation = 0;
    handle.center = [0.5, 0.5];
    const transform = auraTextureRefTransform(handle);
    // rot=0: uv' = offset + center - L·center = [1+0.5-1, 0.5+0.5-1] = [0.5, 0]
    expect(transform.offset![0]).toBeCloseTo(0.5, 10);
    expect(transform.offset![1]).toBeCloseTo(0, 10);
    expect(transform.scale).toEqual([2, 2]);
    expect(transform.rotation).toBeCloseTo(-0, 10); // engine negates three's angle
  });

  test("auraTextureRefPixels reads back data-texture bytes for composites", () => {
    const pixels = rgba(4, 4, 128);
    const handle = texture.data({ width: 4, height: 4, data: pixels });
    const read = auraTextureRefPixels(handle)!;
    expect(read.width).toBe(4);
    expect(read.data.length).toBe(pixels.length);
    expect(read.data[0]).toBe(128);
    // Cube/array/float sources are not CPU-composite-able.
    const cube = texture.cube([0, 1, 2, 3, 4, 5].map(() => ({ width: 2, height: 2, data: rgba(2, 2) })));
    expect(auraTextureRefPixels(cube)).toBeUndefined();
  });

  test("mergedTransform composes authored slot transform over the handle's", () => {
    const warnings: string[] = [];
    const warn = (w: string) => warnings.push(w);
    const handle = { offset: [0.1, 0.2] as const, scale: [2, 2] as const, rotation: 0 };
    const authored = { offset: [1, 0] as const, scale: [1, 1] as const, rotation: 0 };
    const merged = mergedTransform(warn, "baseColor", authored, handle)!;
    expect(merged.scale).toEqual([2, 2]);
    expect(merged.offset![0]).toBeCloseTo(1.1, 10);
    expect(merged.offset![1]).toBeCloseTo(0.2, 10);
    expect(warnings).toHaveLength(0);
    // Handle-only / authored-only passthroughs.
    expect(mergedTransform(warn, "normal", undefined, handle)).toBe(handle);
    expect(mergedTransform(warn, "normal", authored, undefined)).toBe(authored);
  });

  test("resolveAuraTextureRef fails closed on a dropped backing texture", () => {
    const fake = { kind: "aura-texture-ref", id: "ghost" } as never;
    expect(() => resolveAuraTextureRef(fake)).toThrow(/no backing device texture/);
  });
});

describe("ST-06 asset progress/error events", () => {
  test("registered handlers receive progress and error payloads", () => {
    const progress: unknown[] = [];
    const errors: unknown[] = [];
    const unregister = registerAppAssetEventHandlers({
      onAssetProgress: (e) => progress.push(e),
      onAssetError: (e) => errors.push(e)
    });
    try {
      emitAppAssetProgress({ url: "a.png", item: "a.png", loaded: 4, total: 8 });
      emitAppAssetError({ url: "a.png", error: new Error("boom"), message: "boom" });
    } finally {
      unregister();
    }
    expect(progress).toEqual([{ url: "a.png", item: "a.png", loaded: 4, total: 8 }]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toBe("boom");
    // After unregister, emission is a no-op for this pair.
    emitAppAssetProgress({ url: "b.png", item: "b.png", loaded: 1, total: 1 });
    expect(progress).toHaveLength(1);
  });
});

describe("ST-07 texture.load (real async path)", () => {
  test("resolves a handle through the injected asset manager with progress", async () => {
    const progress: unknown[] = [];
    const unregister = registerAppAssetEventHandlers({ onAssetProgress: (e) => progress.push(e) });
    const fakeSource = { width: 4, height: 4 };
    const manager = {
      load: async (url: string, options: { onProgress?: (p: unknown) => void }) => {
        options.onProgress?.({ url, phase: "complete", loadedBytes: 16, totalBytes: 16 });
        return { value: { url, width: 4, height: 4, colorSpace: "srgb", source: fakeSource } };
      }
    };
    setTextureAssetManager(manager as unknown as AssetManager);
    const handle = await texture.load("textures/checker.png", { anisotropy: 2 });
    expect(handle).toBeInstanceOf(TextureHandle);
    expect(handle.anisotropy).toBe(2);
    const backing = auraTextureRefTexture(handle)!;
    expect(backing.source).toBe(fakeSource);
    expect(backing.colorSpace).toBe("srgb");
    expect(backing.generateMipmaps).toBe(true); // three TextureLoader output
    expect(backing.flipY).toBe(true);
    expect(progress).toEqual([{ url: "textures/checker.png", item: "textures/checker.png", loaded: 16, total: 16 }]);
    unregister();
  });

  test("rejects and emits an error event when the manager load fails", async () => {
    const errors: unknown[] = [];
    const unregister = registerAppAssetEventHandlers({ onAssetError: (e) => errors.push(e) });
    setTextureAssetManager({
      load: async () => { throw new Error("404"); }
    } as unknown as AssetManager);
    await expect(texture.load("missing.png")).rejects.toThrow("404");
    expect(errors).toHaveLength(1);
    unregister();
  });

  test("exr URLs decode into an rgba16f/rgba32f data texture (AD-03)", async () => {
    // Route through the real EXR decoder path by stubbing global fetch.
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(new URL("../../fixtures/exr/none_half.exr", import.meta.url));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.endsWith(".exr")) return originalFetch(input);
      return new Response(bytes, { status: 200 });
    }) as typeof fetch;
    try {
      const handle = await texture.load("env/gradient.exr");
      const backing = auraTextureRefTexture(handle)!;
      expect(backing.format).toBe("rgba16f");
      expect(backing.width).toBe(64);
      expect(backing.height).toBe(48);
      expect(backing.flipY).toBe(false); // EXR decode is already device-ordered
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("namespace members stay enumerable (lazyNamespace proxy)", () => {
    expect(Object.keys(textureNamespace).sort()).toEqual(
      ["canvas", "compressed", "cube", "data", "dataArray", "depth", "load", "video"].sort()
    );
  });
});
