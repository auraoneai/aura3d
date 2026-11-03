import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, defineAuraAssets, primitives, scalarVolume, scene } from "../../../packages/engine/src";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types";
import type { MutableAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { registerAppExtension } from "../../../packages/engine/src/contracts/app";
import { FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
import type { ScalarVolumeAsset } from "../../../packages/assets/src/loaders/ScalarVolumeLoader";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { VolumeRenderer } from "../../../packages/rendering/src/volumetrics";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { batchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";

// The app, frame loop, scene compiler and renderer are real. Only the canvas,
// native device and a volume adapter are synthetic; no browser or network runs.
class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function contains(error: unknown, target: unknown): boolean {
  if (Object.is(error, target)) return true;
  if (error instanceof AggregateError && error.errors.some((entry) => contains(entry, target))) return true;
  return error instanceof Error && error.cause !== undefined && contains(error.cause, target);
}

function leafCount(error: unknown, target: unknown): number {
  if (error instanceof AggregateError) return error.errors.reduce<number>((count, entry) => count + leafCount(entry, target), 0);
  return Object.is(error, target) ? 1 : 0;
}

function rejected(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => { throw new Error("Expected cleanup failure"); },
    (error: unknown) => error
  );
}

const apps: AuraApp[] = [];
const renderers: Renderer[] = [];
const unregister: Array<() => void> = [];
const ownedResources: Array<{ dispose(): void }> = [];
let device: MockRenderDevice;

const flags = {
  A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_CORE_GENERATOR: false,
  A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false,
  A3D_QR_VFX: false, A3D_QR_VFX_FOG: false
};

function makeApp(options: { readonly volumeRegistry?: FormatRegistry; readonly volume?: boolean } = {}): AuraApp {
  const snapshot = scene().add(primitives.box({ name: "box" }).runtime({ id: "box" }));
  if (options.volume) {
    const scan = defineAuraAssets({ scan: {
      type: "scalar-volume", format: "nrrd", url: "/local-scan.nrrd", hash: `sha256-${"a".repeat(64)}`,
      metadata: { sourcePath: "public/local-scan.nrrd" }, formatMetadata: { adapter: "local-volume" }
    } }).scan;
    snapshot.add(scalarVolume(scan, { visible: false }));
  }
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: snapshot, autoStart: false, resize: false, diagnostics: false,
    renderer: { backend: "webgl2" }, qualityRebuild: { allowUrlFlags: false, flags },
    ...(options.volumeRegistry ? { formatRegistry: options.volumeRegistry } : {})
  });
  apps.push(app);
  return app;
}

function batch(owner: object): InstancedPBRMaterial {
  const geometry = Geometry.litTriangle();
  const material = new PBRMaterial();
  ownedResources.push(geometry, material);
  const items = [{ geometry, material }, { geometry, material }];
  const result = batchPlanCacheFor(owner).apply(items, { flags: createTrustedQrFlags({}), multiDraw: false });
  const instance = result[0]!.material;
  expect(instance).toBeInstanceOf(InstancedPBRMaterial);
  return instance as InstancedPBRMaterial;
}

function batchPair(owner: object): readonly [InstancedPBRMaterial, InstancedPBRMaterial] {
  const geometry = Geometry.litTriangle();
  const first = new PBRMaterial({ roughness: 0.2 });
  const second = new PBRMaterial({ roughness: 0.8 });
  ownedResources.push(geometry, first, second);
  const items = [
    { geometry, material: first }, { geometry, material: first },
    { geometry, material: second }, { geometry, material: second }
  ];
  const result = batchPlanCacheFor(owner).apply(items, { flags: createTrustedQrFlags({}), multiDraw: false });
  expect(result).toHaveLength(2);
  expect(result[0]!.material).toBeInstanceOf(InstancedPBRMaterial);
  expect(result[1]!.material).toBeInstanceOf(InstancedPBRMaterial);
  return [result[0]!.material as InstancedPBRMaterial, result[1]!.material as InstancedPBRMaterial];
}

function volumeRegistry(release: () => Promise<void>) {
  const dispose = vi.fn(release);
  const registry = new FormatRegistry();
  registry.register({
    id: "local-volume", extensions: ["nrrd"],
    loader: {
      type: "local-volume", canLoad: () => true,
      load: async () => ({
        kind: "scalar-volume", dimensions: [2, 2, 2], data: new Uint8Array(8),
        dataToLocal: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        metadata: {}, diagnostics: []
      } as unknown as ScalarVolumeAsset),
      dispose
    }
  });
  const volumeDispose = vi.fn();
  vi.spyOn(VolumeRenderer, "fromDevice").mockImplementation(() => ({ dispose: volumeDispose } as unknown as VolumeRenderer));
  return { registry, dispose, volumeDispose };
}

beforeEach(() => {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {}
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("fetch", () => { throw new Error("Network access is forbidden in this source test"); });
  device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgl2" });
  Object.defineProperty(device, "info", { value: {
    ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"]
  } });
  vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
    const renderer = new Renderer(device, {
      ...options, shaderLibrary: options?.shaderLibrary ?? createDefaultShaderLibrary()
    }, new TemporalHistory());
    renderers.push(renderer);
    return renderer;
  });
});

afterEach(async () => {
  for (const app of apps.splice(0)) await app.disposeAsync().catch(() => undefined);
  for (const renderer of renderers.splice(0)) {
    try { renderer.dispose(); } catch { /* Failure tests leave a deliberately retained owner. */ }
  }
  for (const release of unregister.splice(0)) release();
  for (const resource of ownedResources.splice(0)) resource.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public app retirement with real mock-device ownership", () => {
  it("retries only its failed batch owner while a second app shares the device", async () => {
    const first = makeApp(), peer = makeApp();
    await Promise.all([first.readyStrict(), peer.readyStrict()]);
    const [firstRenderer, peerRenderer] = renderers;
    expect(firstRenderer!.device).toBe(peerRenderer!.device);
    const [failedBatch, siblingBatch] = batchPair(firstRenderer!);
    const peerBatch = batch(peerRenderer!);
    const sharedBatch = batch(device);
    const error = new Error("owner batch retirement failed");
    const original = failedBatch.dispose.bind(failedBatch);
    let fail = true;
    const dispose = vi.spyOn(failedBatch, "dispose").mockImplementation(() => {
      if (fail) throw error;
      original();
    });
    const peerDispose = vi.spyOn(peerBatch, "dispose");
    const siblingDispose = vi.spyOn(siblingBatch, "dispose");
    const nodesDispose = vi.spyOn(first.nodes as MutableAuraRuntimeNodeRegistry, "dispose");
    const deviceDispose = vi.spyOn(device, "dispose");
    const firstError = await rejected(first.disposeAsync());
    expect(contains(firstError, error)).toBe(true);
    expect(leafCount(firstError, error)).toBe(1);
    expect(() => first.step(0)).toThrow(/disposed/i);
    expect(device.disposed).toBe(false);
    expect(deviceDispose).not.toHaveBeenCalled();
    expect(peerDispose).not.toHaveBeenCalled();
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(sharedBatch.disposed).toBe(false);
    peer.advance(0);

    fail = false;
    await first.disposeAsync();
    first.dispose();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(peerDispose).not.toHaveBeenCalled();
    expect(peerBatch.disposed).toBe(false);
    expect(sharedBatch.disposed).toBe(false);
    expect(device.disposed).toBe(false);
    peer.step(0);
    await peer.disposeAsync();
    expect(deviceDispose).toHaveBeenCalledTimes(1);
    expect(peerDispose).toHaveBeenCalledTimes(1);
    expect(sharedBatch.disposed).toBe(true);
  });

  it("retains a failed superseded mount without retiring the replacement or another app", async () => {
    const first = makeApp(), peer = makeApp();
    await Promise.all([first.readyStrict(), peer.readyStrict()]);
    const [oldRenderer, peerRenderer] = renderers;
    const oldBatch = batch(oldRenderer!);
    const original = oldBatch.dispose.bind(oldBatch);
    const failure = new Error("superseded mount cleanup");
    let fail = true;
    const oldDispose = vi.spyOn(oldBatch, "dispose").mockImplementation(() => {
      if (fail) throw failure;
      original();
    });
    const peerDispose = vi.spyOn(peerRenderer!, "dispose");
    first.setScene(scene().add(primitives.box({ name: "replacement" }).runtime({ id: "replacement" })));
    await first.readyStrict();
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
    const replacement = renderers[2]!;
    const replacementDispose = vi.spyOn(replacement, "dispose");
    expect(oldDispose).toHaveBeenCalledTimes(1);
    first.step(0);
    peer.step(0);

    const error = await rejected(first.disposeAsync());
    expect(contains(error, failure)).toBe(true);
    expect(replacementDispose).toHaveBeenCalledTimes(1);
    expect(peerDispose).not.toHaveBeenCalled();
    fail = false;
    await first.disposeAsync();
    expect(oldDispose).toHaveBeenCalledTimes(2);
    expect(replacementDispose).toHaveBeenCalledTimes(1);
    expect(peerDispose).not.toHaveBeenCalled();
    expect(device.disposed).toBe(false);
    peer.step(0);
  });

  it("closes before extension callbacks, aggregates independent failures, and tolerates reentry", async () => {
    const extensionFailure = new Error("extension cleanup failed");
    const registryFailure = new Error("registry cleanup failed");
    const nativeFailure = new Error("device cleanup failed");
    let app!: AuraApp;
    let closedDuringExtension = false;
    let nested: Promise<unknown> | undefined;
    const failedExtension = vi.fn(() => {
      try { app.step(0); } catch (error) { closedDuringExtension = /disposed/i.test(String(error)); }
      throw extensionFailure;
    });
    const siblingExtension = vi.fn(() => {
      app.dispose();
      nested = rejected(app.disposeAsync());
    });
    for (const [id, dispose] of [["test-retirement-failed", failedExtension], ["test-retirement-sibling", siblingExtension]] as const) {
      unregister.push(registerAppExtension({
        id, owner: "prd15", flag: "A3D_QR_CORE", member: "time",
        create: (current) => current.time!, dispose
      }));
    }
    app = makeApp();
    await app.readyStrict();
    const nodesDispose = vi.spyOn(app.nodes as MutableAuraRuntimeNodeRegistry, "dispose")
      .mockImplementationOnce(() => { throw registryFailure; });
    const original = device.dispose.bind(device);
    let fail = true;
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementation(() => {
      if (fail) { fail = false; throw nativeFailure; }
      original();
    });

    const firstError = await rejected(app.disposeAsync());
    expect(nested).toBeDefined();
    expect(closedDuringExtension).toBe(true);
    for (const error of [extensionFailure, registryFailure, nativeFailure]) {
      expect(contains(firstError, error)).toBe(true);
      expect(contains(await nested!, error)).toBe(true);
    }
    expect(failedExtension).toHaveBeenCalledTimes(1);
    expect(siblingExtension).toHaveBeenCalledTimes(1);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
    expect(deviceDispose).toHaveBeenCalledTimes(1);
    expect(() => app.step(0)).toThrow(/disposed/i);
    await expect(app.stepAsync()).rejects.toThrow(/disposed/i);

    const secondError = await rejected(app.disposeAsync());
    expect(contains(secondError, extensionFailure)).toBe(true);
    expect(contains(secondError, registryFailure)).toBe(true);
    expect(contains(secondError, nativeFailure)).toBe(false);
    expect(device.disposed).toBe(true);
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(failedExtension).toHaveBeenCalledTimes(1);
    expect(siblingExtension).toHaveBeenCalledTimes(1);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
  });

  it("settles an active precompile before retiring or retrying its renderer", async () => {
    const app = makeApp();
    await app.readyStrict();
    const renderer = renderers[0]!;
    const entered = deferred(), release = deferred();
    const failure = new Error("deferred device cleanup");
    vi.spyOn(renderer, "precompile").mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { compiledPrograms: 0, durationMs: 0 };
    });
    const original = device.dispose.bind(device);
    let fail = true;
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementation(() => {
      if (fail) { fail = false; throw failure; }
      original();
    });
    const work = app.precompile!();
    await entered.promise;
    const first = rejected(app.disposeAsync());
    expect(deviceDispose).not.toHaveBeenCalled();
    expect(() => app.step(0)).toThrow(/disposed/i);
    release.resolve();
    await work;
    expect(contains(await first, failure)).toBe(true);
    await app.disposeAsync();
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(device.disposed).toBe(true);
  });

  it("waits for its volume asset but not a live shared device's global retirement", async () => {
    const release = deferred();
    const volume = volumeRegistry(() => release.promise);
    const first = makeApp({ volume: true, volumeRegistry: volume.registry }), peer = makeApp();
    try {
      await Promise.all([first.readyStrict(), peer.readyStrict()]);
      let finished = false;
      const pending = first.disposeAsync().then(() => { finished = true; });
      await vi.waitFor(() => expect(volume.dispose).toHaveBeenCalledTimes(1));
      expect(volume.volumeDispose).toHaveBeenCalledTimes(1);
      expect(finished).toBe(false);
      expect(device.disposed).toBe(false);
      peer.step(0);
      release.resolve();
      await pending;
      expect(finished).toBe(true);
      expect(device.disposed).toBe(false);
      peer.step(0);
    } finally {
      release.resolve();
    }
  });

  it("does not wait for a device-wide volume drain until a failed device retirement succeeds", async () => {
    const volume = volumeRegistry(() => Promise.resolve());
    const app = makeApp({ volume: true, volumeRegistry: volume.registry });
    await app.readyStrict();
    const error = new Error("volume device cleanup failed");
    const original = device.dispose.bind(device);
    let fail = true;
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementation(() => {
      if (fail) { fail = false; throw error; }
      original();
    });
    const drain = vi.spyOn(VolumeRenderer, "whenDeviceRetirementsDrained").mockImplementation((owner) =>
      owner.disposed ? Promise.resolve() : Promise.reject(new Error("device is still live"))
    );
    expect(contains(await rejected(app.disposeAsync()), error)).toBe(true);
    expect(drain).not.toHaveBeenCalled();
    expect(device.disposed).toBe(false);
    await app.disposeAsync();
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(device.disposed).toBe(true);
  });

  it("does not adopt a peer's device retirement while its own asset is settling", async () => {
    const release = deferred();
    const volume = volumeRegistry(() => release.promise);
    const first = makeApp({ volume: true, volumeRegistry: volume.registry }), peer = makeApp();
    const drain = vi.spyOn(VolumeRenderer, "whenDeviceRetirementsDrained").mockResolvedValue(undefined);
    try {
      await Promise.all([first.readyStrict(), peer.readyStrict()]);
      const pending = first.disposeAsync();
      await vi.waitFor(() => expect(volume.dispose).toHaveBeenCalledTimes(1));
      await peer.disposeAsync();
      expect(device.disposed).toBe(true);
      release.resolve();
      await pending;
      expect(drain).not.toHaveBeenCalled();
    } finally {
      release.resolve();
    }
  });

  it("retains device-drain ownership when a close marks the device disposed before throwing", async () => {
    const volume = volumeRegistry(() => Promise.resolve());
    const app = makeApp({ volume: true, volumeRegistry: volume.registry });
    await app.readyStrict();
    const error = new Error("device closed before cleanup failed");
    const original = device.dispose.bind(device);
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => {
      original();
      throw error;
    });
    const drain = vi.spyOn(VolumeRenderer, "whenDeviceRetirementsDrained").mockResolvedValue(undefined);
    expect(contains(await rejected(app.disposeAsync()), error)).toBe(true);
    expect(device.disposed).toBe(true);
    expect(drain).not.toHaveBeenCalled();
    await app.disposeAsync();
    expect(deviceDispose).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("reports distinct synchronous renderer and asynchronous asset failures only once", async () => {
    const nativeFailure = new Error("synchronous renderer cleanup");
    const assetFailure = new Error("asynchronous volume cleanup");
    const volume = volumeRegistry(() => Promise.reject(assetFailure));
    const first = makeApp({ volume: true, volumeRegistry: volume.registry }), peer = makeApp();
    await Promise.all([first.readyStrict(), peer.readyStrict()]);
    const failing = batch(renderers[0]!);
    const original = failing.dispose.bind(failing);
    let fail = true;
    vi.spyOn(failing, "dispose").mockImplementation(() => {
      if (fail) throw nativeFailure;
      original();
    });
    const error = await rejected(first.disposeAsync());
    expect(leafCount(error, nativeFailure)).toBe(1);
    expect(leafCount(error, assetFailure)).toBe(1);
    fail = false;
    const retryError = await rejected(first.disposeAsync());
    expect(contains(retryError, assetFailure)).toBe(true);
    expect(device.disposed).toBe(false);
    peer.step(0);
  });
});
