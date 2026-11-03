import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";

const mounts = vi.hoisted(() => ({
  factory: undefined as undefined | ((args: unknown[]) => Promise<unknown>)
}));

// Keep the real app, typed actor, registry, VOX loader, and resource builders;
// replace only the device-backed renderer with a deterministic source seam.
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: (...args: unknown[]) => {
    if (!mounts.factory) throw new Error("VOX test renderer is not installed");
    return mounts.factory(args);
  }
}));

import { createAuraApp, defineModelAssets, model, scene } from "../../../packages/engine/src/public/index";
import { createDefaultFormatRegistry, type FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
import { createVOXFormatAdapter, VOXLoader } from "../../../packages/assets/src/loaders/VoxelFormatLoaders";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

class FakeCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  parentElement = null;
  clientWidth = 64;
  clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

/** A complete, locally constructed file: one occupied cell and no scene graph. */
function oneVoxel(version = 150): Uint8Array {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  const uint = (offset: number, value: number) => view.setUint32(offset, value, true);
  tag(0, "VOX "); uint(4, version);
  tag(8, "MAIN"); uint(12, 0); uint(16, 44);
  tag(20, "SIZE"); uint(24, 12); uint(28, 0); uint(32, 1); uint(36, 1); uint(40, 1);
  tag(44, "XYZI"); uint(48, 8); uint(52, 0); uint(56, 1);
  bytes.set([0, 0, 0, 1], 60);
  return bytes;
}

function responseFor(bytes: Uint8Array): Response {
  return new Response(Uint8Array.from(bytes).buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream" } });
}

function typedVoxel(bytes: Uint8Array, url = "/models/one.vox", version = "150", sha256 = createHash("sha256").update(bytes).digest("hex")) {
  return defineModelAssets({ voxel: { url, sha256, formatMetadata: { adapter: "vox", version } } }, { queryParam: null }).refs.voxel;
}

function installVOX() {
  const registry = createDefaultFormatRegistry();
  const adapter = createVOXFormatAdapter();
  // Observe the real native loader; do not replace its version-checked methods.
  const loader = adapter.loader as VOXLoader;
  const dispose = vi.spyOn(loader, "dispose");
  registry.register(adapter);
  return { registry, loader, dispose };
}

type ModelMountContext = {
  runtimeOwner: object;
  request: { signal: AbortSignal };
  formatRegistry: FormatRegistry;
};

function installModelRenderer() {
  const created: Array<{
    canvas: unknown;
    url: string;
    context: ModelMountContext;
    actor: Awaited<ReturnType<typeof createTypedGLBActor>>;
  }> = [];
  const errors: unknown[] = [];
  mounts.factory = async (args) => {
    const snapshot = args[1] as ReturnType<ReturnType<typeof scene>["toJSON"]>;
    const context = args[7] as ModelMountContext;
    const node = snapshot.nodes[0];
    if (!node || node.kind !== "model") throw new Error("expected a root model");
    try {
      const actor = await createTypedGLBActor({ asset: node.asset, id: node.asset.id, width: 64, height: 64, ...context });
      created.push({ canvas: args[0], url: node.asset.url, context, actor });
      return {
        backend: "webgl2", diagnostics: undefined, render: () => 1, renderAsync: async () => 1,
        deviceLost: () => false, viewProjection: () => new Float32Array(16), dispose: () => actor.dispose()
      };
    } catch (error) {
      errors.push(error);
      throw error;
    }
  };
  return { created, errors };
}

function canvas() { return new FakeCanvas() as unknown as HTMLCanvasElement; }

beforeEach(() => {
  mounts.factory = undefined;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("location", { origin: "https://site.test", href: "https://site.test/" });
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("typed VOX models through app mounts", () => {
  it.each([150, 200])("loads version %i and exposes all six cube faces as render geometry", async (version) => {
    const bytes = oneVoxel(version);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => responseFor(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const { registry, dispose } = installVOX();
    const { created } = installModelRenderer();
    const asset = typedVoxel(bytes, "/models/one.vox?revision=1", String(version));
    expect(asset.format).toBe("vox");
    expect(asset.formatMetadata).toEqual({ adapter: "vox", version: String(version) });
    const app = createAuraApp(canvas(), { scene: scene().add(model(asset)), formatRegistry: registry, autoStart: false, resize: false });
    try {
      await app.readyStrict();
      await app.ready();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/models/one.vox?revision=1");
      expect(created).toHaveLength(1);
      expect(created[0]!.context.formatRegistry).toBe(registry);
      const items = created[0]!.actor.collectRenderItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.geometry.vertexBuffer.vertexCount).toBe(24);
      expect(items[0]!.geometry.indexBuffer?.count).toBe(36);
      expect(items[0]!.geometry.topology).toBe("triangles");
      await app.disposeAsync();
      await app.disposeAsync();
      app.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(dispose.mock.calls[0]![0].disposed).toBe(true);
    } finally { await app.disposeAsync(); }
  });

  it("requires explicit VOX registration and rejects unsupported declared versions before fetch", () => {
    const bytes = oneVoxel();
    const fetchMock = vi.fn(async () => responseFor(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const asset = typedVoxel(bytes);
    const make = (formatRegistry?: FormatRegistry) => createAuraApp(canvas(), {
      scene: scene().add(model(asset)), formatRegistry, autoStart: false, resize: false
    });
    expect(() => make()).toThrow(/unsupported format/i);
    expect(() => make(createDefaultFormatRegistry())).toThrow(/no native format adapter/i);
    const { registry } = installVOX();
    const unsupported = typedVoxel(bytes, "/models/one.vox", "201");
    expect(() => createAuraApp(canvas(), {
      scene: scene().add(model(unsupported)), formatRegistry: registry, autoStart: false, resize: false
    })).toThrow(/format version 201 is not supported/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a declared version that differs from the fetched bytes and releases the parsed asset", async () => {
    const bytes = oneVoxel(150);
    vi.stubGlobal("fetch", vi.fn(async () => responseFor(bytes)));
    const { registry, dispose } = installVOX();
    const { created, errors } = installModelRenderer();
    const app = createAuraApp(canvas(), {
      scene: scene().add(model(typedVoxel(bytes, "/models/one.vox", "200"))), formatRegistry: registry, autoStart: false, resize: false
    });
    try {
      await expect(app.readyStrict()).rejects.toThrow(/VOX_VERSION_MISMATCH.*200.*150/);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toMatch(/VOX_VERSION_MISMATCH/);
      expect(created).toHaveLength(0);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(dispose.mock.calls[0]![0].disposed).toBe(true);
    } finally { await app.disposeAsync(); }
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects a SHA-256 mismatch before the VOX model is exposed", async () => {
    const bytes = oneVoxel();
    vi.stubGlobal("fetch", vi.fn(async () => responseFor(bytes)));
    const { registry, dispose } = installVOX();
    const { created, errors } = installModelRenderer();
    const app = createAuraApp(canvas(), {
      scene: scene().add(model(typedVoxel(bytes, "/models/one.vox", "150", "0".repeat(64)))), formatRegistry: registry, autoStart: false, resize: false
    });
    try {
      await expect(app.readyStrict()).rejects.toThrow(/SHA-256 integrity mismatch/i);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ name: "AssetIntegrityError" });
      expect(created).toHaveLength(0);
      expect(dispose).not.toHaveBeenCalled();
    } finally { await app.disposeAsync(); }
  });

  it("aborts a pending load on app disposal and discards a late response", async () => {
    const bytes = oneVoxel();
    let resolveFetch!: (response: Response) => void;
    let markRequested!: (signal: AbortSignal) => void;
    let markCancelled!: () => void;
    const response = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const requested = new Promise<AbortSignal>((resolve) => { markRequested = resolve; });
    const cancelled = new Promise<void>((resolve) => { markCancelled = resolve; });
    const lateResponse = new Response(new ReadableStream<Uint8Array>({ cancel: () => markCancelled() }));
    vi.stubGlobal("fetch", vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.signal) throw new Error("expected a cancellable request");
      markRequested(init.signal);
      return response;
    }));
    const { registry, dispose } = installVOX();
    const { created } = installModelRenderer();
    const app = createAuraApp(canvas(), { scene: scene().add(model(typedVoxel(bytes))), formatRegistry: registry, autoStart: false, resize: false });
    try {
      const signal = await requested;
      const readiness = app.readiness();
      const disposal = app.disposeAsync();
      expect(signal.aborted).toBe(true);
      await expect(readiness).resolves.toEqual({ state: "disposed" });
      resolveFetch(lateResponse);
      await cancelled;
      await disposal;
      expect(created).toHaveLength(0);
      expect(dispose).not.toHaveBeenCalled();
    } finally {
      resolveFetch(lateResponse);
      await app.disposeAsync();
    }
  });

  it("cancels a superseded fetch and only mounts the replacement model", async () => {
    const bytes = oneVoxel();
    let resolveFirst!: (response: Response) => void;
    let markRequested!: (signal: AbortSignal) => void;
    let markCancelled!: () => void;
    const firstResponse = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const requested = new Promise<AbortSignal>((resolve) => { markRequested = resolve; });
    const cancelled = new Promise<void>((resolve) => { markCancelled = resolve; });
    const lateResponse = new Response(new ReadableStream<Uint8Array>({ cancel: () => markCancelled() }));
    vi.stubGlobal("fetch", vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("first.vox")) {
        if (!init?.signal) throw new Error("expected a cancellable request");
        markRequested(init.signal);
        return firstResponse;
      }
      return Promise.resolve(responseFor(bytes));
    }));
    const { registry, dispose } = installVOX();
    const { created } = installModelRenderer();
    const app = createAuraApp(canvas(), {
      scene: scene().add(model(typedVoxel(bytes, "/models/first.vox"))), formatRegistry: registry, autoStart: false, resize: false
    });
    try {
      const signal = await requested;
      const firstReadiness = app.readiness();
      app.setScene(scene().add(model(typedVoxel(bytes, "/models/second.vox"))));
      expect(signal.aborted).toBe(true);
      await expect(firstReadiness).resolves.toEqual({ state: "cancelled" });
      await app.readyStrict();
      await app.ready();
      resolveFirst(lateResponse);
      await cancelled;
      expect(created.map((entry) => entry.url)).toEqual(["/models/second.vox"]);
      expect(created[0]!.actor.collectRenderItems()).toHaveLength(1);
      expect(dispose).not.toHaveBeenCalled();
      await app.disposeAsync();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      resolveFirst(lateResponse);
      await app.disposeAsync();
    }
  });

  it("releases each mounted model once when a scene is replaced and the app is disposed", async () => {
    const bytes = oneVoxel();
    vi.stubGlobal("fetch", vi.fn(async () => responseFor(bytes)));
    const { registry, loader, dispose } = installVOX();
    const originalDispose = VOXLoader.prototype.dispose.bind(loader);
    let markFirstDisposed!: () => void;
    const firstDisposed = new Promise<void>((resolve) => { markFirstDisposed = resolve; });
    dispose.mockImplementation((asset) => { originalDispose(asset); markFirstDisposed(); });
    const { created } = installModelRenderer();
    const app = createAuraApp(canvas(), {
      scene: scene().add(model(typedVoxel(bytes, "/models/first.vox"))), formatRegistry: registry, autoStart: false, resize: false
    });
    try {
      await app.readyStrict();
      await app.ready();
      const oldSignal = created[0]!.context.request.signal;
      app.setScene(scene().add(model(typedVoxel(bytes, "/models/second.vox"))));
      expect(oldSignal.aborted).toBe(true);
      await firstDisposed;
      await app.readyStrict();
      await app.ready();
      expect(created.map((entry) => entry.url)).toEqual(["/models/first.vox", "/models/second.vox"]);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(created[1]!.actor.collectRenderItems()).toHaveLength(1);
      await app.disposeAsync();
      await app.disposeAsync();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(dispose.mock.calls[0]![0]).not.toBe(dispose.mock.calls[1]![0]);
    } finally { await app.disposeAsync(); }
  });

  it("keeps two apps independent even when they share the registered adapter", async () => {
    const bytes = oneVoxel();
    const fetchMock = vi.fn(async () => responseFor(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const { registry, dispose } = installVOX();
    const { created } = installModelRenderer();
    const firstCanvas = canvas();
    const secondCanvas = canvas();
    const asset = typedVoxel(bytes);
    const first = createAuraApp(firstCanvas, { scene: scene().add(model(asset)), formatRegistry: registry, autoStart: false, resize: false });
    const second = createAuraApp(secondCanvas, { scene: scene().add(model(asset)), formatRegistry: registry, autoStart: false, resize: false });
    try {
      await Promise.all([first.readyStrict(), second.readyStrict()]);
      await Promise.all([first.ready(), second.ready()]);
      const firstMount = created.find((entry) => entry.canvas === firstCanvas)!;
      const secondMount = created.find((entry) => entry.canvas === secondCanvas)!;
      expect(created).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(firstMount.context.runtimeOwner).not.toBe(secondMount.context.runtimeOwner);
      await first.disposeAsync();
      expect(firstMount.context.request.signal.aborted).toBe(true);
      expect(secondMount.context.request.signal.aborted).toBe(false);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(secondMount.actor.collectRenderItems()[0]!.geometry.indexBuffer?.count).toBe(36);
      await second.disposeAsync();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(dispose.mock.calls[0]![0]).not.toBe(dispose.mock.calls[1]![0]);
    } finally {
      await first.disposeAsync();
      await second.disposeAsync();
    }
  });
});
