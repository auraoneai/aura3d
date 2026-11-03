import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader } from "../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources } from "../../packages/assets/src/GLTFRenderResources";
import { GLTFSharedTextureCache } from "../../packages/assets/src/GLTFSharedTextureCache";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { evaluateDistancePrioritizedMipResidency } from "../../packages/assets/src/TextureStreaming";
import { MockRenderDevice } from "../../packages/rendering/src/RenderDevice";
import { Texture } from "../../packages/rendering/src/Texture";
import {
  applyTextureBudget, releaseTextureBudget, resetTextureBudgetLedger,
  setTextureBudgetResidentBytes, textureBudgetReport
} from "../../packages/rendering/src/textures/TextureBudget";

const encodedRed = readFileSync(new URL("./native-fixtures/ktx2-red-4x4.ktx2", import.meta.url));

async function loadTexturedAsset() {
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_texture_basisu"],
    images: [{ uri: `data:image/ktx2;base64,${encodedRed.toString("base64")}`, mimeType: "image/ktx2" }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ name: "red", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    scenes: [{ nodes: [] }], scene: 0
  };
  const loader = new GLTFLoader();
  const asset = await loader.load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}` }, new LoadContext());
  return { loader, asset };
}

afterEach(() => { vi.unstubAllGlobals(); resetTextureBudgetLedger(); });

describe("texture residency decisions and actual admission", () => {
  it("reports an affordable coarse-to-fine plan without changing the input candidates", () => {
    // The decision is a recommendation, not an eviction or a device operation.
    const candidates = [
      { id: "near", distanceMeters: 1, mipBytesCoarseToFine: [4, 16] },
      { id: "far-priority", distanceMeters: 100, priority: 2, mipBytesCoarseToFine: [4, 32] },
      { id: "middle", distanceMeters: 2, mipBytesCoarseToFine: [4, 8] }
    ];
    const before = structuredClone(candidates);
    expect(evaluateDistancePrioritizedMipResidency(candidates, 20)).toMatchObject({
      residents: [
        { id: "far-priority", residentLevels: 1, residentBytes: 4 },
        { id: "near", residentLevels: 1, residentBytes: 4 },
        { id: "middle", residentLevels: 2, residentBytes: 12 }
      ],
      evicted: [], usedBytes: 20, requestedBytes: 68, overBudget: true, overBudgetBytes: 48
    });
    expect(candidates).toEqual(before);
    expect(evaluateDistancePrioritizedMipResidency(candidates, 4).evicted).toEqual(["near", "middle"]);
  });

  it("budgets real decoded KTX2 pixels and releases a shared resource after the final owner", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const { loader, asset } = await loadTexturedAsset();
    const sharedTextures = new GLTFSharedTextureCache();
    const options = { sharedTextures, textureBudget: 16, ktx2BasisTargetFormat: "rgba8" as const, failOnMissingTexture: true, request: { credentials: "omit" as const } };
    const first = await createGLTFRenderResources(asset, options);
    const second = await createGLTFRenderResources(asset, options);
    try {
      const texture = [...first.textureLibrary.values()][0]!;
      expect(texture).toBe([...second.textureLibrary.values()][0]);
      expect([texture.width, texture.height]).toEqual([2, 2]);
      const pixels = texture.mipLevels[0]?.data ?? texture.data!;
      expect(pixels.byteLength).toBe(16);
      for (let i = 0; i < pixels.length; i += 4) {
        expect(pixels[i]).toBeGreaterThan(180);
        expect(pixels[i + 1]).toBeLessThan(75);
        expect(pixels[i + 2]).toBeLessThan(75);
        expect(pixels[i + 3]).toBe(255);
      }
      expect(textureBudgetReport().textureBytes).toBe(16);
      first.dispose();
      expect(texture.disposed).toBe(false);
      expect(textureBudgetReport().textureBytes).toBe(16);
      second.dispose();
      await Promise.resolve();
      expect(texture.disposed).toBe(true);
      expect(textureBudgetReport().textureBytes).toBe(0);
    } finally {
      first.dispose();
      second.dispose();
      loader.dispose(asset);
    }
  });

  it("isolates device charges and refuses a larger fallback atomically", () => {
    const tight = new MockRenderDevice();
    const roomy = new MockRenderDevice();
    // BC1 uses one eight-byte block; the corresponding 4x4 RGBA8 fallback is 64 bytes.
    const texture = new Texture({ width: 4, height: 4, format: "bc1-rgb-unorm", data: new Uint8Array(8), generateMipmaps: false });
    applyTextureBudget(texture, { maxBytes: 8 }, tight);
    applyTextureBudget(texture, { maxBytes: 64 }, roomy);
    expect(() => setTextureBudgetResidentBytes(texture, 64, tight)).toThrow(/budget/i);
    expect(textureBudgetReport(tight).textureBytes).toBe(8);
    setTextureBudgetResidentBytes(texture, 64, roomy);
    expect(textureBudgetReport(roomy).textureBytes).toBe(64);
    releaseTextureBudget(texture, tight);
    releaseTextureBudget(texture, tight);
    expect(textureBudgetReport(tight).textureBytes).toBe(0);
    expect(textureBudgetReport(roomy).textureBytes).toBe(64);
    releaseTextureBudget(texture, roomy);
    expect(textureBudgetReport(roomy).textureBytes).toBe(0);
  });

  it("fails a glTF texture that cannot fit even one pixel without retaining a charge", async () => {
    const { loader, asset } = await loadTexturedAsset();
    try {
      await expect(createGLTFRenderResources(asset, {
        textureBudget: 0, ktx2BasisTargetFormat: "rgba8", failOnMissingTexture: true
      })).rejects.toThrow(/texture/i);
      expect(textureBudgetReport().textureBytes).toBe(0);
    } finally {
      loader.dispose(asset);
    }
  });
});
