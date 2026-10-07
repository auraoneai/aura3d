/**
 * PRD-05 Phase 1 (§7.3) — createAppAssetDecoders + prepareModelDecoders:
 * C-38 option defaults, disabled-decoder fail-closed, requiredDecoders honour,
 * and GLB-header extension sniffing for undeclared manifests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppAssetDecoders,
  prepareModelDecoders,
  sniffGLBRequiredDecoders,
  WEBGPU_COMPRESSED_CAPS,
  AssetDecoderUnavailable
} from "@aura3d/engine/lanes";

const CAPS = { astc: false, bptc: false, etc2: true, s3tc: false, s3tcSrgb: false } as const;
const TIER = { maxTextureSize: 4096 } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

function glbHeaderBytes(json: object): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const buffer = new ArrayBuffer(20 + jsonBytes.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  new Uint8Array(buffer, 20).set(jsonBytes);
  return buffer;
}

describe("createAppAssetDecoders", () => {
  it("defaults basePath/maxTextureSize/workerCount from C-38 + tier", async () => {
    const registry = createAppAssetDecoders(undefined, CAPS, TIER);
    const set = await registry.require(["meshopt"]);
    expect(typeof set.meshopt).toBe("function");
    registry.dispose();
  });
  it("disables decoders fail-closed with AssetDecoderUnavailable", async () => {
    const registry = createAppAssetDecoders({ decoders: { meshopt: false } }, CAPS, TIER);
    await expect(registry.require(["meshopt"])).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    registry.dispose();
  });
  it("WebGPU callers use the all-false capability table (Q-11-1)", () => {
    expect(WEBGPU_COMPRESSED_CAPS).toEqual({ astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false });
  });
});

describe("prepareModelDecoders", () => {
  it("honours declared requiredDecoders without touching the network", async () => {
    const registry = createAppAssetDecoders(undefined, CAPS, TIER);
    const set = await prepareModelDecoders({ url: "/x.glb", format: "glb", requiredDecoders: ["meshopt"] }, registry);
    expect(typeof set.meshopt).toBe("function");
    registry.dispose();
  });
  it("requiredDecoders: [] loads nothing", async () => {
    const registry = createAppAssetDecoders(undefined, CAPS, TIER);
    const set = await prepareModelDecoders({ url: "/x.glb", format: "glb", requiredDecoders: [] }, registry);
    expect(set).toEqual({});
    registry.dispose();
  });
});

describe("sniffGLBRequiredDecoders", () => {
  it("maps GLB extensionsUsed onto decoder ids", async () => {
    const bytes = glbHeaderBytes({ extensionsUsed: ["EXT_meshopt_compression", "KHR_texture_basisu"], asset: { version: "2.0" } });
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
      const range = init?.headers?.Range ?? "";
      const body = range.startsWith("bytes=0-19") ? bytes.slice(0, 20) : bytes.slice(20);
      return { ok: true, arrayBuffer: async () => body };
    }));
    expect(await sniffGLBRequiredDecoders("/models/helmet.glb", "glb")).toEqual(["meshopt", "ktx2"]);
  });
  it("returns [] for non-GLB assets and unreadable URLs", async () => {
    expect(await sniffGLBRequiredDecoders("/models/x.png", "png")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
    expect(await sniffGLBRequiredDecoders("/models/missing.glb", "glb")).toEqual([]);
  });
});
