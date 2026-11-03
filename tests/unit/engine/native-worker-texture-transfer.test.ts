import { describe, expect, it, vi } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture.js";
import { TextureHandle, auraTextureRefTexture, texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

class Canvas {
  width = 8;
  height = 8;
  transfers = 0;
  transferControlToOffscreen(): OffscreenCanvas { this.transfers++; return { width: this.width, height: this.height } as OffscreenCanvas; }
}

class Port {
  peer?: Port;
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  readonly sent: any[] = [];
  terminated = 0;
  scenePostError?: Error;
  postMessage(message: any, transfer: Transferable[] = []): void {
    if (message.type === "scene" && this.scenePostError) throw this.scenePostError;
    const cloned = message.type === "init"
      ? { ...structuredClone({ ...message, canvas: undefined }, { transfer: transfer.slice(1) }), canvas: message.canvas }
      : message.type === "scene" ? structuredClone(message, { transfer }) : structuredClone(message);
    this.sent.push(cloned);
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit("message", { data: cloned }); });
  }
  addEventListener(type: string, listener: (event: any) => void): void {
    const list = this.listeners.get(type) ?? new Set(); list.add(listener); this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: (event: any) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: unknown): void { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
  terminate(): void { this.terminated++; }
}
function ports(): [Port, Port] { const a = new Port(), b = new Port(); a.peer = b; b.peer = a; return [a, b]; }
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
const snapshot = (handle: unknown, name = "initial"): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0", background: "#000", camera: {}, diagnostics: { enabled: false },
  nodes: [{ kind: "primitive", name, material: { texture: handle, normal: handle } }]
}) as unknown as AuraSceneSnapshot;
const workerHandle = (scene: AuraSceneSnapshot): TextureHandle =>
  (scene.nodes[0] as unknown as { material: { texture: TextureHandle } }).material.texture;
const pixels = (handle: TextureHandle) => [...(auraTextureRefTexture(handle)!.getMipLevel(0)!.data as Uint8Array)];
const rawBytes = (data: ArrayBufferView): number[] => [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)];
function patternedPixels(format: "rgba8" | "rgba16f" | "rgba32f" | "r32f", width: number, height: number, seed: number) {
  const channels = format === "r32f" ? 1 : 4;
  const count = width * height * channels;
  if (format === "rgba8") return Uint8ClampedArray.from({ length: count }, (_, index) => (index * 17 + seed) & 255);
  if (format === "rgba16f") return Uint16Array.from({ length: count }, (_, index) => [0x3c00, 0x8000, 0x7e01, seed][index % 4]);
  const bits = Uint32Array.from({ length: count }, (_, index) => [0x3f800000, 0x80000000, 0x7fc12345, seed][index % 4]);
  return new Float32Array(bits.buffer);
}
const render = (onDispose = () => {}): WebGLSceneRenderer => ({
  backend: "webgl2", diagnostics: {}, render: () => 1, resize: () => {}, resetTemporalHistory: () => {},
  viewProjection: () => new Float32Array(16), onDeviceLost: () => () => {}, onDeviceRestored: () => () => {},
  deviceLost: () => false, dispose: onDispose, whenDisposed: () => Promise.resolve()
}) as unknown as WebGLSceneRenderer;

function makeData(): TextureHandle {
  const handle = texture.data({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) });
  handle.wrapS = "repeat"; handle.wrapT = "mirror"; handle.repeat = [2, 3]; handle.offset = [0.2, 0.4];
  handle.center = [0.5, 0.25]; handle.rotation = 0.7; handle.minFilter = "nearest"; handle.anisotropy = 2;
  return handle;
}
function endpoints(host: Port, remote: Port) {
  return { worker: host as unknown as AuraWorkerHostEndpoint,
    endpoint: remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse> };
}

describe("worker-owned CPU texture snapshots", () => {
  for (const format of ["rgba8", "rgba16f", "rgba32f", "r32f"] as const) {
    it(`round-trips ${format} mip bytes, sampling, aliasing and worker ownership`, async () => {
      const [host, remote] = ports();
      const backing = new Texture({ width: 4, height: 4, format, colorSpace: format === "r32f" ? "linear" : "srgb",
        mipLevels: [{ width: 4, height: 4, data: patternedPixels(format, 4, 4, 1) },
          { width: 2, height: 2, data: patternedPixels(format, 2, 2, 2) }],
        mipLevelCount: 3, usage: ["sampled", "copy-src", "copy-dst"], flipY: true, generateMipmaps: false });
      backing.updateMip(2, patternedPixels(format, 1, 1, 3));
      // Verify generation metadata is restored even when an override is present.
      backing.generateMipmaps = true;
      const handle = new TextureHandle(backing);
      handle.wrapS = "repeat"; handle.wrapT = "mirror"; handle.repeat = [2, 3]; handle.offset = [0.2, 0.4];
      handle.center = [0.5, 0.25]; handle.rotation = 0.7; handle.anisotropy = 2;
      handle.minFilter = "nearest-mipmap-nearest"; handle.magFilter = "nearest";
      const expected = Array.from({ length: 3 }, (_, index) => rawBytes(backing.getMipLevel(index)!.data));
      let captured!: TextureHandle;
      const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
        captured = workerHandle(scene);
        expect((scene.nodes[0] as any).material.normal).toBe(captured);
        return render();
      } });
      const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
        scene: snapshot(handle), autoStart: false, bridgeEvents: false });
      new Uint8Array(backing.getMipLevel(0)!.data.buffer).fill(0);
      new Uint8Array(backing.getMipLevel(2)!.data.buffer).fill(0);
      await app.ready;
      const copied = captured.texture;
      expect(captured).not.toBe(handle);
      expect(captured.id).not.toBe(handle.id);
      expect(copied).toMatchObject({ format, colorSpace: backing.colorSpace, flipY: true, generateMipmaps: true,
        mipLevelCount: 3, usage: ["sampled", "copy-src", "copy-dst"] });
      expect(copied.mipLevels).toHaveLength(2);
      for (let index = 0; index < 3; index++) {
        const actual = copied.getMipLevel(index)!;
        expect(rawBytes(actual.data)).toEqual(expected[index]);
        expect(actual.data.constructor).toBe(backing.getMipLevel(index)!.data.constructor);
      }
      expect(captured).toMatchObject({ wrapS: "repeat", wrapT: "mirror", repeat: [2, 3], offset: [0.2, 0.4],
        center: [0.5, 0.25], rotation: 0.7, anisotropy: 2, minFilter: "nearest-mipmap-nearest", magFilter: "nearest" });
      await app.dispose(); await stop();
      expect(copied.disposed).toBe(true); expect(backing.disposed).toBe(false);
      handle.dispose();
    });
  }

  it("preserves sparse mip overrides and refreshes them across replacement and recovery", async () => {
    const [host, remote] = ports(), seen: TextureHandle[] = [];
    const backing = new Texture({ width: 4, height: 4, format: "rgba32f", mipLevelCount: 3,
      data: patternedPixels("rgba32f", 4, 4, 4), generateMipmaps: false });
    backing.updateMip(2, patternedPixels("rgba32f", 1, 1, 5));
    const handle = new TextureHandle(backing);
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      seen.push(workerHandle(scene)); return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready;
    expect(seen[0].texture.mipLevels).toHaveLength(0);
    expect(seen[0].texture.getMipLevel(1)).toBeNull();
    expect(rawBytes(seen[0].texture.getMipLevel(2)!.data)).toEqual(rawBytes(backing.getMipLevel(2)!.data));
    backing.updateMip(2, patternedPixels("rgba32f", 1, 1, 9));
    const expected = rawBytes(backing.getMipLevel(2)!.data);
    const pending = app.setScene(snapshot(handle, "updated-sparse"));
    backing.updateMip(2, patternedPixels("rgba32f", 1, 1, 12));
    await pending;
    expect(rawBytes(seen[1].texture.getMipLevel(2)!.data)).toEqual(expected);
    expect(seen[1].texture.getMipLevel(1)).toBeNull();
    expect(seen[0].texture.disposed).toBe(true);
    await app.recover(); expect(seen[2]).toBe(seen[1]);
    await app.dispose(); await stop();
    expect(seen[1].texture.disposed).toBe(true); expect(backing.disposed).toBe(false); handle.dispose();
  });
  it("copies pixels and sampling state synchronously and shares references inside the worker", async () => {
    const [host, remote] = ports(), handle = makeData(), canvas = new Canvas();
    let captured!: TextureHandle;
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      captured = workerHandle(scene);
      const normal = (scene.nodes[0] as any).material.normal;
      expect(normal).toBe(captured);
      return render();
    } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    (handle.texture.data as Uint8Array)[0] = 90;
    handle.repeat = [9, 9];
    await app.ready;
    expect(captured).not.toBe(handle);
    expect(pixels(captured)).toEqual([1, 2, 3, 255]);
    expect(captured).toMatchObject({ wrapS: "repeat", wrapT: "mirror", repeat: [2, 3], offset: [0.2, 0.4],
      center: [0.5, 0.25], rotation: 0.7, minFilter: "nearest", anisotropy: 2 });
    expect(handle.texture.disposed).toBe(false);
    await app.dispose(); await stop();
    expect(captured.texture.disposed).toBe(true);
    expect(handle.texture.disposed).toBe(false);
    handle.dispose();
  });

  it("assigns a worker-local ID without colliding with a pre-existing worker handle", async () => {
    const [host, remote] = ports(), existing = makeData(), source = makeData(), seen: TextureHandle[] = [];
    // Separate realms have independent counters, so a host ID can already be in
    // use by another worker-local handle. Model that collision explicitly.
    Object.defineProperty(source, "id", { value: existing.id, configurable: true });
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      seen.push(workerHandle(scene)); return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(source), autoStart: false, bridgeEvents: false });
    await app.ready;
    expect(seen[0].id).not.toBe(existing.id);
    const workerLocal = makeData();
    expect(workerLocal.id).not.toBe(seen[0].id);
    await app.recover();
    expect(seen[1]).toBe(seen[0]);
    await app.setScene(snapshot(source, "replacement"));
    expect(seen[2].id).not.toBe(existing.id);
    expect(seen[2].id).not.toBe(workerLocal.id);
    expect(seen[2].id).not.toBe(seen[0].id);
    await app.dispose(); await stop();
    existing.dispose(); source.dispose(); workerLocal.dispose();
  });

  it("resnapshots updates on setScene, retains the snapshot through recovery, and disposes each worker backing once", async () => {
    const [host, remote] = ports(), handle = makeData(), seen: TextureHandle[] = [], disposal = new Map<TextureHandle, number>();
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      const ref = workerHandle(scene); seen.push(ref);
      if (!disposal.has(ref)) { disposal.set(ref, 0); ref.texture.onDispose(() => disposal.set(ref, disposal.get(ref)! + 1)); }
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready;
    handle.updateMip(0, new Uint8Array([4, 5, 6, 255]));
    const update = app.setScene(snapshot(handle, "updated"));
    handle.updateMip(0, new Uint8Array([7, 8, 9, 255]));
    await update;
    expect(pixels(seen[1])).toEqual([4, 5, 6, 255]);
    expect(disposal.get(seen[0])).toBe(1);
    await app.recover();
    expect(seen[2]).toBe(seen[1]);
    expect(disposal.get(seen[1])).toBe(0);
    await app.dispose(); await stop();
    expect(disposal.get(seen[1])).toBe(1);
    expect(handle.texture.disposed).toBe(false);
    handle.dispose();
  });

  it("keeps the previous backing for rollback and releases a failed replacement", async () => {
    const [host, remote] = ports(), handle = makeData(), seen: TextureHandle[] = [];
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      seen.push(workerHandle(scene));
      if ((scene.nodes[0] as any).name === "bad") throw new Error("mount failed");
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready;
    await expect(app.setScene(snapshot(handle, "bad"))).rejects.toMatchObject({ message: "mount failed", severity: "recoverable" });
    expect(seen[1].texture.disposed).toBe(true);
    expect(seen[2]).toBe(seen[0]);
    expect(seen[0].texture.disposed).toBe(false);
    await app.dispose(); await stop();
    expect(seen[0].texture.disposed).toBe(true);
    expect(handle.texture.disposed).toBe(false);
    handle.dispose();
  });

  it("releases cancelled snapshots after mount settles and restores the previous worker scene", async () => {
    const [host, remote] = ports(), handle = makeData(), started = deferred<void>(), release = deferred<void>(), restored = deferred<void>();
    const seen: TextureHandle[] = [];
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      seen.push(workerHandle(scene));
      if ((scene.nodes[0] as any).name === "slow") { started.resolve(); await release.promise; }
      else if (seen.length > 1) restored.resolve();
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready;
    const controller = new AbortController();
    const pending = app.setScene(snapshot(handle, "slow"), { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await started.promise; controller.abort(); await rejected; release.resolve();
    await restored.promise; await flush();
    expect(seen[1].texture.disposed).toBe(true);
    expect(seen[2]).toBe(seen[0]);
    expect(seen[0].texture.disposed).toBe(false);
    await app.dispose(); await stop();
    handle.dispose();
  });

  it("retains an owned texture reused by an onFrame scene and releases it on teardown", async () => {
    const [host, remote] = ports(), handle = makeData(), seen: TextureHandle[] = [];
    let replaced = false;
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, {
      createRenderer: async (_canvas, scene) => { seen.push(workerHandle(scene)); return render(); },
      onFrame: (_frame, scene) => { if (!replaced) { replaced = true; return { ...scene, background: "#fff" }; } }
    });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready; await app.step(0.1, 1);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[0].texture.disposed).toBe(false);
    await app.dispose(); await stop();
    expect(seen[0].texture.disposed).toBe(true);
    handle.dispose();
  });

  it("retains worker pixels until asynchronous renderer teardown has settled", async () => {
    const [host, remote] = ports(), handle = makeData(), release = deferred<void>();
    let owned!: TextureHandle;
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      owned = workerHandle(scene);
      return { ...render(), whenDisposed: () => release.promise };
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready;
    const disposing = app.dispose();
    await flush();
    expect(owned.texture.disposed).toBe(false);
    release.resolve();
    await disposing; await stop();
    expect(owned.texture.disposed).toBe(true);
    expect(handle.texture.disposed).toBe(false);
    handle.dispose();
  });

  it("preserves cycles, aliases, maps, sets and sparse arrays while replacing nested handles", async () => {
    const [host, remote] = ports(), handle = makeData();
    const cycle: Record<string, unknown> = { handle };
    cycle.self = cycle;
    const sparse = new Array(3); sparse[1] = handle;
    const scene = { ...snapshot(handle), cycle, sparse, map: new Map([[handle, cycle]]), set: new Set([handle]) } as unknown as AuraSceneSnapshot;
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, value) => {
      const v = value as any, ref = workerHandle(value);
      expect(v.cycle.self).toBe(v.cycle);
      expect(v.cycle.handle).toBe(ref);
      expect(v.sparse.length).toBe(3); expect(0 in v.sparse).toBe(false); expect(v.sparse[1]).toBe(ref);
      expect(v.map.get(ref)).toBe(v.cycle); expect(v.set.has(ref)).toBe(true);
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene, autoStart: false, bridgeEvents: false });
    await app.ready; await app.dispose(); await stop(); handle.dispose();
  });

  it("rejects unsupported, disposed, forged, oversized-count and host-owned transferable backings before canvas transfer", () => {
    const src = new TextureHandle(new Texture({ width: 1, height: 1, source: {} as TexImageSource }));
    const storage = new TextureHandle(new Texture({ width: 1, height: 1, data: new Uint8Array(4), usage: ["sampled", "storage", "copy-dst"] }));
    const target = new TextureHandle(new Texture({ width: 1, height: 1, data: new Uint8Array(4), renderAttachment: true }));
    const compressed = new TextureHandle(new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8) }));
    const disposed = makeData(); disposed.dispose();
    const handles = Array.from({ length: 129 }, () => makeData());
    const many = { ...snapshot(handles[0]), extra: handles } as AuraSceneSnapshot;
    const oversized = new TextureHandle(new Texture({ width: 2049, height: 2048, data: new Uint8Array(2049 * 2048 * 4) }));
    const hostData = makeData();
    hostData.updateMip(0, new Uint8Array([5, 6, 7, 255]));
    for (const [scene, transfer] of [
      [snapshot(src), undefined], [snapshot(storage), undefined], [snapshot(target), undefined], [snapshot(compressed), undefined], [snapshot(disposed), undefined],
      [snapshot({ kind: "aura-texture-ref", id: "forged" }), undefined], [many, undefined], [snapshot(oversized), undefined],
      [snapshot(hostData), [hostData.texture.data!.buffer as ArrayBuffer]]
    ] as const) {
      const [host] = ports(), canvas = new Canvas();
      expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: endpoints(host, host).worker,
        scene, sceneTransfer: transfer ? [...transfer] : undefined, bridgeEvents: false })).toThrow(/Live texture handles cannot cross worker realms/);
      expect(canvas.transfers).toBe(0);
    }
    expect(hostData.texture.data!.byteLength).toBe(4);
    src.dispose(); storage.dispose(); target.dispose(); compressed.dispose(); hostData.dispose(); oversized.dispose(); handles.forEach((handle) => handle.dispose());
  });

  it("rejects a shared mutable update buffer before canvas ownership changes", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    const backing = new Texture({ width: 1, height: 1, data: new Uint8Array(4), dynamic: true });
    backing.update(new Uint8Array(new SharedArrayBuffer(4)));
    const handle = new TextureHandle(backing), [host] = ports(), canvas = new Canvas();
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: endpoints(host, host).worker,
      scene: snapshot(handle), bridgeEvents: false })).toThrow(/Live texture handles cannot cross worker realms/);
    expect(canvas.transfers).toBe(0); handle.dispose();
  });

  it("rejects malformed mip descriptors received directly by the worker", async () => {
    const [host, remote] = ports();
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async () => render() });
    remote.emit("message", { data: { id: 1, type: "init", canvas: { width: 1, height: 1 },
      size: { width: 1, height: 1, pixelRatio: 1 }, autoStart: false, scene: snapshot(undefined) } });
    await flush();
    expect(remote.sent.find((message) => message.id === 1)?.type).toBe("result");
    const descriptor = { kind: "aura-worker-cpu-texture/2", id: "invalid", width: 2, height: 2, format: "rgba32f",
      suppliedMipCount: 2, levels: [{ width: 2, height: 2, data: new Float32Array(16) }, { width: 1, height: 1, data: new Float32Array(4) }],
      colorSpace: "linear", flipY: false, generateMipmaps: false, dynamic: false, usage: ["sampled", "copy-dst"],
      wrapS: "clamp", wrapT: "clamp", repeat: [1, 1], offset: [0, 0], center: [0, 0], rotation: 0,
      anisotropy: 1, minFilter: "nearest", magFilter: "nearest" };
    const invalid = [
      { ...descriptor, levels: [descriptor.levels[0], { width: 1, height: 1, data: new Uint8Array(16) }] },
      { ...descriptor, levels: [descriptor.levels[0], { width: 2, height: 1, data: new Float32Array(4) }] },
      { ...descriptor, levels: [descriptor.levels[0], null] },
      { ...descriptor, suppliedMipCount: 1, levels: [descriptor.levels[0], descriptor.levels[1], descriptor.levels[1]] }
    ];
    for (const [index, value] of invalid.entries()) {
      const id = index + 2;
      remote.emit("message", { data: { id, type: "scene", scene: snapshot(value, `invalid-${id}`) } });
      await flush();
      expect(remote.sent.find((message) => message.id === id)).toMatchObject({ type: "error", code: "unsupported-worker-resource" });
    }
    await stop();
  });

  it("rejects distinct handles that share mutable backing and all transferable mip buffers", () => {
    const backing = new Texture({ width: 4, height: 4, mipLevelCount: 3,
      mipLevels: [{ width: 4, height: 4, data: new Uint8Array(64) }, { width: 2, height: 2, data: new Uint8Array(16) }] });
    backing.updateMip(0, new Uint8Array(64));
    backing.updateMip(2, new Uint8Array(4));
    const handle = new TextureHandle(backing), alias = new TextureHandle(backing);
    const references = { ...snapshot(handle), extra: alias } as unknown as AuraSceneSnapshot;
    const transfers = [backing.mipLevels[0].data.buffer, backing.mipLevels[1].data.buffer,
      backing.getMipLevel(0)!.data.buffer, backing.getMipLevel(2)!.data.buffer] as ArrayBuffer[];
    for (const [scene, transfer] of [[references, undefined], ...transfers.map((buffer) => [snapshot(handle), [buffer]] as const)] as const) {
      const [host] = ports(), canvas = new Canvas();
      expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: endpoints(host, host).worker,
        scene, sceneTransfer: transfer ? [...transfer] : undefined, bridgeEvents: false })).toThrow(/Live texture handles cannot cross worker realms/);
      expect(canvas.transfers).toBe(0);
    }
    expect(transfers.map((buffer) => buffer.byteLength)).toEqual([64, 16, 64, 4]);
    handle.dispose();
  });

  it("counts every mip byte against the per-scene limit before canvas transfer", () => {
    // The base alone fits exactly; the second mip pushes the snapshot over 16 MiB.
    const backing = new Texture({ width: 1024, height: 1024, format: "rgba32f", generateMipmaps: false,
      mipLevels: [{ width: 1024, height: 1024, data: new Float32Array(1024 * 1024 * 4) },
        { width: 512, height: 512, data: new Float32Array(512 * 512 * 4) }] });
    const handle = new TextureHandle(backing), [host] = ports(), canvas = new Canvas();
    const copied = vi.spyOn(Uint8Array, "from");
    try {
      expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: endpoints(host, host).worker,
        scene: snapshot(handle), bridgeEvents: false })).toThrow(/Live texture handles cannot cross worker realms/);
      expect(copied).not.toHaveBeenCalled(); expect(canvas.transfers).toBe(0);
    } finally { copied.mockRestore(); handle.dispose(); }
  });

  it("rejects a non-cloneable replacement before posting or detaching its transfer", async () => {
    const [host, remote] = ports(), handle = makeData();
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async () => render() });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await app.ready;
    const buffer = new ArrayBuffer(4);
    const bad = { ...snapshot(handle), extra: { buffer, nonCloneable: () => undefined } } as unknown as AuraSceneSnapshot;
    await expect(app.setScene(bad, { transfer: [buffer] })).rejects.toBeInstanceOf(Error);
    expect(buffer.byteLength).toBe(4);
    expect(host.sent.filter((message) => message.type === "scene")).toHaveLength(0);
    await app.dispose(); await stop(); handle.dispose();
  });

  it("retains a shared byte reservation across 300 aborted updates until the worker drains them", async () => {
    const [host, remote] = ports(), started = deferred<void>(), release = deferred<void>();
    const handle = texture.data({ width: 2048, height: 1024, data: new Uint8Array(2048 * 1024 * 4) });
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      if ((scene.nodes[0] as any).name === "initial") { started.resolve(); await release.promise; }
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await started.promise;
    let cancelled = 0, budget = 0;
    for (let index = 0; index < 300; index++) {
      const controller = new AbortController();
      const request = app.setScene(snapshot(handle, `queued-${index}`), { signal: controller.signal });
      controller.abort();
      const result = await request.then(() => "unexpected", (error: { code?: string }) => error.code);
      if (result === "cancelled") cancelled++;
      else if (result === "worker-texture-budget") budget++;
      else throw new Error(`Unexpected worker result ${result}`);
    }
    // One 8 MiB initial snapshot plus three queued snapshots fill 32 MiB.
    expect([cancelled, budget]).toEqual([3, 297]);
    expect(host.sent.filter((message) => message.type === "scene")).toHaveLength(3);
    const copied = vi.spyOn(Uint8Array, "from");
    try {
      await expect(app.setScene(snapshot(handle, "still-full"))).rejects.toMatchObject({ code: "worker-texture-budget" });
      expect(copied).not.toHaveBeenCalled();
    } finally { copied.mockRestore(); }
    release.resolve();
    await app.ready; await flush();
    await app.setScene(snapshot(handle, "after-drain"));
    await app.dispose(); await stop(); handle.dispose();
  });

  it("reserves every floating-point mip byte until aborted worker requests settle", async () => {
    const [host, remote] = ports(), started = deferred<void>(), release = deferred<void>();
    // 8 MiB at level zero plus 2 MiB at level one, per scene.
    const backing = new Texture({ width: 1024, height: 1024, format: "rgba16f", generateMipmaps: false,
      mipLevels: [{ width: 1024, height: 1024, data: new Uint16Array(1024 * 1024 * 4) },
        { width: 512, height: 512, data: new Uint16Array(512 * 512 * 4) }] });
    const handle = new TextureHandle(backing);
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      if ((scene.nodes[0] as any).name === "initial") { started.resolve(); await release.promise; }
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await started.promise;
    for (let index = 0; index < 2; index++) {
      const controller = new AbortController();
      const pending = app.setScene(snapshot(handle, `queued-mips-${index}`), { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    }
    const copied = vi.spyOn(Uint8Array, "from");
    try {
      await expect(app.setScene(snapshot(handle, "over-budget-mips"))).rejects.toMatchObject({ code: "worker-texture-budget" });
      expect(copied).not.toHaveBeenCalled();
      expect(host.sent.filter((message) => message.type === "scene")).toHaveLength(2);
    } finally { copied.mockRestore(); }
    release.resolve(); await app.ready; await flush();
    await app.setScene(snapshot(handle, "after-mip-drain"));
    await app.dispose(); await stop(); handle.dispose();
  });

  it("retains a running cancelled mount's reservation until its renderer settles", async () => {
    const [host, remote] = ports(), started = deferred<void>(), release = deferred<void>(), small = makeData();
    const big = texture.data({ width: 2048, height: 1024, data: new Uint8Array(2048 * 1024 * 4) });
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      if ((scene.nodes[0] as any).name === "slow") { started.resolve(); await release.promise; }
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(small), autoStart: false, bridgeEvents: false });
    await app.ready;
    const controller = new AbortController();
    const slow = app.setScene(snapshot(big, "slow"), { signal: controller.signal });
    const rejected = expect(slow).rejects.toMatchObject({ code: "cancelled" });
    await started.promise; controller.abort(); await rejected;
    const queued = [app.setScene(snapshot(big, "one")), app.setScene(snapshot(big, "two")), app.setScene(snapshot(big, "three"))];
    await expect(app.setScene(snapshot(big, "over-budget"))).rejects.toMatchObject({ code: "worker-texture-budget" });
    release.resolve();
    await Promise.all(queued);
    await app.setScene(snapshot(big, "after-drain"));
    await app.dispose(); await stop(); small.dispose(); big.dispose();
  });

  it("releases snapshot reservations after clone failure and postMessage failure", async () => {
    const [host, remote] = ports(), started = deferred<void>(), release = deferred<void>();
    const handle = texture.data({ width: 2048, height: 1024, data: new Uint8Array(2048 * 1024 * 4) });
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      if ((scene.nodes[0] as any).name === "initial") { started.resolve(); await release.promise; }
      return render();
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    await started.promise;
    const first = app.setScene(snapshot(handle, "first"));
    const second = app.setScene(snapshot(handle, "second"));
    const nonCloneable = { ...snapshot(handle, "bad"), bad: () => undefined } as unknown as AuraSceneSnapshot;
    await expect(app.setScene(nonCloneable)).rejects.toBeInstanceOf(Error);
    host.scenePostError = new Error("transport failed");
    await expect(app.setScene(snapshot(handle, "post-fails"))).rejects.toThrow("transport failed");
    host.scenePostError = undefined;
    const third = app.setScene(snapshot(handle, "third"));
    await expect(app.setScene(snapshot(handle, "over-budget"))).rejects.toMatchObject({ code: "worker-texture-budget" });
    release.resolve();
    await app.ready; await Promise.all([first, second, third]);
    await app.dispose(); await stop(); handle.dispose();
  });

  it("checks the outstanding request limit before copying texture pixels, including cancelled calls", async () => {
    const [host, remote] = ports(), started = deferred<void>(), release = deferred<void>(), handle = makeData();
    const stop = installWorkerRenderer(endpoints(host, remote).endpoint, { createRenderer: async (_canvas, scene) => {
      if ((scene.nodes[0] as any).name === "initial") { started.resolve(); await release.promise; }
      return render();
    } });
    const plain = { ...snapshot(undefined), nodes: [{ kind: "primitive", name: "initial" }] } as unknown as AuraSceneSnapshot;
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: endpoints(host, remote).worker,
      scene: plain, autoStart: false, bridgeEvents: false });
    await started.promise;
    for (let index = 0; index < 127; index++) {
      const controller = new AbortController();
      const request = app.setScene(plain, { signal: controller.signal });
      controller.abort();
      await expect(request).rejects.toMatchObject({ code: "cancelled" });
    }
    const copied = vi.spyOn(Uint8Array, "from");
    try {
      await expect(app.setScene(snapshot(handle, "queue-full"))).rejects.toMatchObject({ code: "queue-full" });
      expect(copied).not.toHaveBeenCalled();
      expect(host.sent.filter((message) => message.type === "scene")).toHaveLength(127);
    } finally { copied.mockRestore(); }
    release.resolve();
    await app.ready; await flush();
    // A response for each cancelled original request releases the slot.
    await app.setScene(snapshot(handle, "after-drain"));
    await app.dispose(); await stop();
    const afterClose = vi.spyOn(Uint8Array, "from");
    try {
      await expect(app.setScene(snapshot(handle))).rejects.toMatchObject({ code: "disposed" });
      expect(afterClose).not.toHaveBeenCalled();
    } finally { afterClose.mockRestore(); }
    handle.dispose();
  });
});
