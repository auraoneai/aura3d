import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources } from "../../../packages/assets/src/GLTFRenderResources";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { loadProductionGLTFRenderPipeline } from "../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { applyTextureBudget, resetTextureBudgetLedger, retireTextureBudget, textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";

function fixtureUrl(): string {
  const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
  const bytes = Buffer.from(values.buffer);
  const doc = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}`;
}

async function model() {
  return new GLTFLoader().load({ url: fixtureUrl() }, new LoadContext());
}

const decoded = () => ({
  width: 4, height: 4,
  mipLevels: [
    { width: 4, height: 4, data: new Uint8Array(64).fill(1) },
    { width: 2, height: 2, data: new Uint8Array(16).fill(2) },
    { width: 1, height: 1, data: new Uint8Array(4).fill(3) }
  ]
});
const textureOf = (resources: Awaited<ReturnType<typeof createGLTFRenderResources>>) => [...resources.textureLibrary.values()][0]!;

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); resetTextureBudgetLedger(); });

describe("glTF device-partitioned decode budgets", () => {
  it("keeps admission on separate devices independent and releases only the disposed source", async () => {
    const asset = await model();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a });
    const second = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: b });
    let retried: Awaited<ReturnType<typeof createGLTFRenderResources>> | undefined;
    try {
      expect(textureOf(first).width).toBe(4);
      expect(textureOf(second).width).toBe(4);
      expect(textureBudgetReport().textureBytes).toBe(0);
      expect(textureBudgetReport(a).textureBytes).toBe(0);
      expect(textureBudgetReport(b).textureBytes).toBe(0);
      await expect(createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a }))
        .rejects.toMatchObject({ name: "TextureBudgetExceededError" });
      first.dispose();
      retried = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a });
      expect(textureOf(retried).width).toBe(4);
      expect(textureOf(second).disposed).toBe(false);
    } finally { first.dispose(); second.dispose(); retried?.dispose(); a.dispose(); b.dispose(); }
  });

  it("releases a downscaled replacement against its original device scope", async () => {
    const asset = await model();
    const device = new MockRenderDevice();
    const first = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 20, textureBudgetDevice: device });
    let retry: Awaited<ReturnType<typeof createGLTFRenderResources>> | undefined;
    try {
      expect([textureOf(first).width, textureOf(first).height]).toEqual([2, 2]);
      await expect(createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 20, textureBudgetDevice: device }))
        .rejects.toMatchObject({ name: "TextureBudgetExceededError" });
      first.dispose();
      retry = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 20, textureBudgetDevice: device });
      expect([textureOf(retry).width, textureOf(retry).height]).toEqual([2, 2]);
      expect(textureBudgetReport(device).textureBytes).toBe(0);
    } finally { first.dispose(); retry?.dispose(); device.dispose(); }
  });

  it("shares only within a device and leaves physical retirement charged after source disposal", async () => {
    const asset = await model();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const sharedTextures = new GLTFSharedTextureCache();
    const imageDecoder = vi.fn(decoded);
    const common = { imageDecoder, textureBudget: 84, sharedTextures, request: { credentials: "omit" as const } };
    const first = await createGLTFRenderResources(asset, { ...common, textureBudgetDevice: a });
    const peer = await createGLTFRenderResources(asset, { ...common, textureBudgetDevice: a });
    const other = await createGLTFRenderResources(asset, { ...common, textureBudgetDevice: b });
    let releasePhysical = () => {};
    try {
      const texture = textureOf(first);
      expect(textureOf(peer)).toBe(texture);
      expect(textureOf(other)).not.toBe(texture);
      expect(imageDecoder).toHaveBeenCalledTimes(2);
      // Simulate the native device's independent upload and deferred retirement.
      applyTextureBudget(texture, {}, a);
      releasePhysical = retireTextureBudget(texture, a);
      expect(textureBudgetReport(a).textureBytes).toBe(84);
      first.dispose();
      expect(texture.disposed).toBe(false);
      peer.dispose();
      other.dispose();
      await Promise.resolve();
      expect(texture.disposed).toBe(true);
      expect(textureBudgetReport(a).textureBytes).toBe(84);
      releasePhysical();
      expect(textureBudgetReport(a).textureBytes).toBe(0);
      expect(textureBudgetReport(b).textureBytes).toBe(0);
    } finally { first.dispose(); peer.dispose(); other.dispose(); releasePhysical(); a.dispose(); b.dispose(); }
  });

  it("does not retain a failed admission and refuses a disposed device", async () => {
    const asset = await model();
    const device = new MockRenderDevice();
    await expect(createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 0, textureBudgetDevice: device }))
      .rejects.toMatchObject({ name: "TextureBudgetExceededError" });
    const retry = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: device });
    retry.dispose();
    device.dispose();
    await expect(createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: device }))
      .rejects.toMatchObject({ code: "GLTF_TEXTURE_BUDGET_DEVICE_DISPOSED" });
  });

  it("rejects disposal during an asynchronous decode and closes the decoded source", async () => {
    const asset = await model();
    const device = new MockRenderDevice();
    let complete!: (result: { width: number; height: number; source: TexImageSource }) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    const close = vi.fn();
    const pending = createGLTFRenderResources(asset, {
      textureBudget: 84, textureBudgetDevice: device,
      imageDecoder: () => { started(); return new Promise((resolve) => { complete = resolve; }); }
    });
    await began;
    device.dispose();
    complete({ width: 1, height: 1, source: { close } as unknown as TexImageSource });
    await expect(pending).rejects.toMatchObject({ code: "GLTF_TEXTURE_BUDGET_DEVICE_DISPOSED" });
    expect(close).toHaveBeenCalledOnce();
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("keeps admission and cleanup bound to the initial device when options mutate", async () => {
    const asset = await model();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    let complete!: (result: ReturnType<typeof decoded>) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    const options = {
      textureBudget: 84,
      maxTextureSize: 4,
      textureBudgetDevice: a,
      imageDecoder: () => { started(); return new Promise<ReturnType<typeof decoded>>((resolve) => { complete = resolve; }); }
    };
    const pending = createGLTFRenderResources(asset, options);
    await began;
    options.textureBudgetDevice = b;
    options.textureBudget = 0;
    options.maxTextureSize = 1;
    complete(decoded());
    const first = await pending;
    let second: Awaited<ReturnType<typeof createGLTFRenderResources>> | undefined;
    let retried: Awaited<ReturnType<typeof createGLTFRenderResources>> | undefined;
    try {
      second = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: b });
      expect(textureOf(first).width).toBe(4);
      await expect(createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a }))
        .rejects.toMatchObject({ name: "TextureBudgetExceededError" });
      first.dispose();
      retried = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a });
      expect(textureOf(second).disposed).toBe(false);
      expect(textureOf(retried).width).toBe(4);
    } finally { first.dispose(); second?.dispose(); retried?.dispose(); a.dispose(); b.dispose(); }
  });

  it("forwards an explicit intended device through the production pipeline", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const url = fixtureUrl();
    const first = await loadProductionGLTFRenderPipeline({ url, assetId: "budget-a", imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a });
    const second = await loadProductionGLTFRenderPipeline({ url, assetId: "budget-b", imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: b });
    try {
      expect(textureOf(first.resources).width).toBe(4);
      expect(textureOf(second.resources).width).toBe(4);
      expect(textureBudgetReport().textureBytes).toBe(0);
      expect(textureBudgetReport(a).textureBytes).toBe(0);
      expect(textureBudgetReport(b).textureBytes).toBe(0);
    } finally { first.dispose(); second.dispose(); a.dispose(); b.dispose(); }
  });

  it("snapshots the production pipeline's budget device and limits before asynchronous parsing", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const options = { url: fixtureUrl(), assetId: "budget-snapshot", imageDecoder: decoded,
      textureBudget: 84, maxTextureSize: 4, textureBudgetDevice: a };
    const pending = loadProductionGLTFRenderPipeline(options);
    options.textureBudgetDevice = b;
    options.textureBudget = 0;
    options.maxTextureSize = 1;
    const first = await pending;
    const asset = await model();
    let second: Awaited<ReturnType<typeof createGLTFRenderResources>> | undefined;
    try {
      expect(textureOf(first.resources).width).toBe(4);
      second = await createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: b });
      await expect(createGLTFRenderResources(asset, { imageDecoder: decoded, textureBudget: 84, textureBudgetDevice: a }))
        .rejects.toMatchObject({ name: "TextureBudgetExceededError" });
    } finally { first.dispose(); second?.dispose(); a.dispose(); b.dispose(); }
  });
});
