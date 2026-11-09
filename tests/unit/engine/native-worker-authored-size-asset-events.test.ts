import { describe, expect, it, vi } from "vitest";
import { forwardAuthoredCanvasSize } from "../../../packages/engine/src/agent-api/app/canvas.js";
import { collectWorkerRendererGlobals, createWorkerRenderer, hydrateWorkerPatchArgs, installWorkerRenderer, installWorkerRendererGlobals, snapshotWorkerPatchArgs } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { applyWorkerNodePatch } from "../../../packages/engine/src/agent-api/app/workerPatch.js";
import { labAppOptions, labRenderWorker, parseLabFlags, registerLabWorkerFactory } from "../../../examples/shared/lab-flags";

/** A transferred page canvas: the prototype accessors reject writes, as Chrome does after transferControlToOffscreen. */
class TransferredCanvas {
  get width(): number { return 300; }
  set width(_value: number) { throw new DOMException("Cannot resize canvas after call to transferControlToOffscreen().", "InvalidStateError"); }
  get height(): number { return 150; }
  set height(_value: number) { throw new DOMException("Cannot resize canvas after call to transferControlToOffscreen().", "InvalidStateError"); }
}

describe("worker app authored canvas size (resize: false)", () => {
  it("records width/height writes on the transferred canvas and forwards them once per task", async () => {
    const canvas = new TransferredCanvas() as unknown as HTMLCanvasElement;
    const forward = vi.fn();
    const release = forwardAuthoredCanvasSize(canvas, forward);
    expect([canvas.width, canvas.height]).toEqual([300, 150]);
    canvas.width = 1280;
    canvas.height = 720;
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
    expect(forward).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(forward).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledWith({ width: 1280, height: 720 });
    canvas.width = 1280; // unchanged: nothing to forward
    canvas.width = 0; // not a usable backing size
    await Promise.resolve();
    expect(forward).toHaveBeenCalledOnce();
    release();
    expect([canvas.width, canvas.height]).toEqual([300, 150]);
    expect(() => { canvas.width = 640; }).toThrow(/transferControlToOffscreen/);
  });
});

class Target {
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: any) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string, values: Record<string, unknown> = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...values, type });
  }
}

class Port extends Target {
  peer?: Port;
  readonly sent: Array<AuraWorkerRequest | AuraWorkerResponse> = [];
  terminated = 0;
  postMessage(message: AuraWorkerRequest | AuraWorkerResponse): void {
    this.sent.push(message);
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit("message", { data: message }); });
  }
  terminate(): void { this.terminated += 1; }
}

class Canvas extends Target {
  width = 8;
  height = 4;
  readonly offscreen = { width: 8, height: 4 };
  transferControlToOffscreen(): OffscreenCanvas { return this.offscreen as unknown as OffscreenCanvas; }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, width: 8, height: 4 } as DOMRect; }
}

const scene = (): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0", background: "#000", nodes: [{ kind: "primitive", name: "worker-root" }], camera: {}, diagnostics: { enabled: false }
}) as unknown as AuraSceneSnapshot;

describe("worker asset events", () => {
  it("asks the worker for asset events and delivers progress and rebuilt errors to the host callbacks", async () => {
    const host = new Port();
    const remote = new Port();
    host.peer = remote;
    remote.peer = host;
    const renderer = { backend: "webgl2", diagnostics: {}, render: () => 1, resize: vi.fn(), viewProjection: () => new Float32Array(16), dispose: vi.fn() } as unknown as WebGLSceneRenderer;
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, { createRenderer: async () => renderer });
    const onAssetProgress = vi.fn();
    const onAssetError = vi.fn();
    const app = createWorkerRenderer({
      canvas: new Canvas() as unknown as HTMLCanvasElement, worker: host as unknown as AuraWorkerHostEndpoint, scene: scene(),
      autoStart: false, bridgeEvents: false, onAssetProgress, onAssetError
    });
    await app.ready;
    expect(host.sent.find((message) => message.type === "init")).toMatchObject({ assetEvents: true });
    remote.postMessage({ type: "asset-progress", id: 0, event: { url: "/aura-assets/a.glb", loaded: 1, total: 2 } });
    remote.postMessage({ type: "asset-error", id: 0, event: { url: "/aura-assets/b.glb", message: "HTTP 404" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAssetProgress).toHaveBeenCalledWith({ url: "/aura-assets/a.glb", loaded: 1, total: 2 });
    expect(onAssetError).toHaveBeenCalledOnce();
    const event = onAssetError.mock.calls[0]![0];
    expect(event).toMatchObject({ url: "/aura-assets/b.glb", message: "HTTP 404" });
    expect(event.error).toBeInstanceOf(Error);
    await app.dispose();
  });

  it("does not request asset events without a host callback", async () => {
    const host = new Port();
    const remote = new Port();
    host.peer = remote;
    remote.peer = host;
    const renderer = { backend: "webgl2", diagnostics: {}, render: () => 1, resize: vi.fn(), viewProjection: () => new Float32Array(16), dispose: vi.fn() } as unknown as WebGLSceneRenderer;
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, { createRenderer: async () => renderer });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: host as unknown as AuraWorkerHostEndpoint, scene: scene(), autoStart: false, bridgeEvents: false });
    await app.ready;
    expect(host.sent.find((message) => message.type === "init")).not.toHaveProperty("assetEvents");
    await app.dispose();
  });
});

describe("example lab worker registration", () => {
  it("labRenderWorker constructs the registered worker and throws (main-thread fallback) without one", () => {
    const fragment = labAppOptions(parseLabFlags("?worker=1"), { createWorker: labRenderWorker });
    expect(fragment.worker).toEqual({ fallback: "main-thread", createWorker: labRenderWorker });
    registerLabWorkerFactory(undefined);
    expect(() => labRenderWorker()).toThrow(/No render worker registered/);
    const worker = {} as Worker;
    registerLabWorkerFactory(() => worker);
    expect(labRenderWorker()).toBe(worker);
    registerLabWorkerFactory(undefined);
    expect(labAppOptions(parseLabFlags(""), { createWorker: labRenderWorker })).toEqual({});
  });
});

describe("worker app calls (setOutput, app.post)", () => {
  it("routes app ops to the app-call hook and rejects members outside the allowlist", () => {
    const appCall = vi.fn();
    expect(applyWorkerNodePatch(undefined, undefined, [{ app: "post.setEffect", args: ["bloom", { intensity: 2 }] }], undefined, appCall)).toBe(1);
    expect(appCall).toHaveBeenCalledWith("post.setEffect", ["bloom", { intensity: 2 }]);
    expect(() => applyWorkerNodePatch(undefined, undefined, [{ app: "dispose", args: [] } as never], undefined, appCall)).toThrow(/cannot call app\.dispose/);
  });

  it("applies setOutput to the worker renderer's output surface and replays it after a remount", async () => {
    const host = new Port();
    const remote = new Port();
    host.peer = remote;
    remote.peer = host;
    const setOutput = vi.fn();
    const make = () => ({ backend: "webgl2", diagnostics: {}, render: () => 1, resize: vi.fn(), viewProjection: () => new Float32Array(16), dispose: vi.fn(), auraRenderer: { setOutput } }) as unknown as WebGLSceneRenderer;
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, { createRenderer: async () => make() });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: host as unknown as AuraWorkerHostEndpoint, scene: scene(), autoStart: false, bridgeEvents: false });
    await app.ready;
    await app.patch!([{ app: "setOutput", args: [{ toneMapping: "aces", exposure: 1.4 }] }, { app: "setOutput", args: [{ dither: true }] }]);
    expect(setOutput).toHaveBeenLastCalledWith({ toneMapping: "aces", exposure: 1.4, dithering: true });
    setOutput.mockClear();
    await app.setScene(scene());
    expect(setOutput).toHaveBeenCalledWith({ toneMapping: "aces", exposure: 1.4, dithering: true });
    await app.dispose();
  }, 60_000); // the first app call imports the post and output modules (slow on a cold transform)
});

describe("worker batched-state copy", () => {
  it("round-trips slots, gaps, matrices, colours and visibility", async () => {
    await import("../../../packages/engine/src/agent-api/nodes/batched.js"); // registers the geometry resolver
    const { BatchedMeshState } = await import("../../../packages/engine/src/agent-api/nodes/batchedState.js");
    const source = new BatchedMeshState({ id: "worker-batched-roundtrip", capacity: 4 });
    const cube = source.addGeometry("box");
    const sphere = source.addGeometry("sphere");
    source.addInstance(cube);
    source.addInstance(sphere);
    source.addInstance(cube);
    source.deleteInstance(1);
    source.setMatrixAt(2, [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1]);
    source.setColorAt(0, [0.5, 0.25, 1, 1]);
    source.setVisibleAt(2, false);
    const snapshot = source.toWorkerSnapshot()!;
    const copy = BatchedMeshState.fromWorkerSnapshot(structuredClone({ ...snapshot, id: "worker-batched-roundtrip-copy" }));
    expect(Array.from(copy.alive)).toEqual([1, 0, 1, 0]);
    expect(copy.count).toBe(source.count);
    expect(Array.from(copy.getMatrixAt(2))).toEqual(Array.from(source.getMatrixAt(2)));
    expect(copy.getColorAt(0)).toEqual(source.getColorAt(0));
    expect(copy.visible[2]).toBe(0);
    expect(copy.geometryIds[2]).toBe(cube);
    source.dispose();
    copy.dispose();
  });
});

describe("worker patch textures (node.setMaterial with a texture)", () => {
  it("names textures the worker holds by id, snapshots new ones, and resolves both in the worker", () => {
    const held = texture.data({ width: 2, height: 2, data: new Uint8Array(16).fill(7) });
    const fresh = texture.data({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) });
    // The worker rebuilt `held` from the scene snapshot under its host id.
    const known = new Set<string>([held.id]);
    const sceneCopy = hydrateWorkerPatchArgs(snapshotWorkerPatchArgs([{ map: held }], new Set()), new Set());
    const workerHeld = sceneCopy.created.values().next().value!;
    const args = snapshotWorkerPatchArgs([{ map: held, emissiveMap: fresh, roughness: 0.4 }], known);
    expect(known.has(fresh.id)).toBe(true);
    const sent = structuredClone(args) as unknown as [{ map: { kind: string }; emissiveMap: { kind: string }; roughness: number }];
    expect(sent[0].map).toEqual({ kind: "aura-worker-texture-id", id: held.id });
    expect(sent[0].emissiveMap.kind).toBe("aura-worker-cpu-texture/2");
    const hydrated = hydrateWorkerPatchArgs(sent, new Set([workerHeld]));
    const material = (hydrated.args as unknown as [{ map: unknown; emissiveMap: { texture: { width: number } }; roughness: number }])[0];
    expect(material.map).toBe(workerHeld);
    expect(material.emissiveMap.texture.width).toBe(1);
    expect(material.roughness).toBe(0.4);
    expect(hydrated.created.size).toBe(1);
    // A later patch with the same new texture sends only its id.
    expect((structuredClone(snapshotWorkerPatchArgs([fresh], known)) as unknown as [unknown])[0]).toEqual({ kind: "aura-worker-texture-id", id: fresh.id });
    expect(() => hydrateWorkerPatchArgs([{ kind: "aura-worker-texture-id", id: "missing" }], new Set())).toThrow(/not held by the render worker/);
    for (const handle of [...hydrated.created, workerHeld]) handle.dispose();
    held.dispose(); fresh.dispose();
  });
});

describe("worker textured-material status", () => {
  it("forwards texturedMaterials on the first frame and again only when it changes", async () => {
    const host = new Port();
    const remote = new Port();
    host.peer = remote;
    remote.peer = host;
    let status = "pending";
    const row = () => ({ nodeName: "terrain", levelName: "terrain", status, slots: ["baseColor"], pixelBacked: status === "textured", warnings: [], pendingMs: 5 });
    const renderer = { backend: "webgl2", get diagnostics() { return { runtime: { texturedMaterials: [row()] } }; }, render: () => 1, resize: vi.fn(), viewProjection: () => new Float32Array(16), dispose: vi.fn() } as unknown as WebGLSceneRenderer;
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, { createRenderer: async () => renderer });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: host as unknown as AuraWorkerHostEndpoint, scene: scene(), autoStart: false, bridgeEvents: false });
    await app.ready;
    const first = await app.step(1 / 60);
    expect(first.texturedMaterials).toEqual([{ nodeName: "terrain", levelName: "terrain", status: "pending", slots: ["baseColor"], pixelBacked: false, warnings: [] }]);
    const results = [];
    for (let i = 0; i < 30; i += 1) results.push(await app.step(1 / 60));
    expect(results.every((result) => result.texturedMaterials === undefined)).toBe(true);
    status = "textured";
    const later = [];
    for (let i = 0; i < 15; i += 1) later.push(await app.step(1 / 60));
    expect(later.filter((result) => result.texturedMaterials).map((result) => result.texturedMaterials![0]!.status)).toEqual(["textured"]);
    await app.dispose();
  });
});

describe("worker batched-state sync", () => {
  it("sends a changed batched.mesh state with the next patch and syncs the worker copy in place", async () => {
    const { batched, material, scene: buildScene } = await import("../../../packages/engine/src/public/index");
    const { createWorkerNodeMirror } = await import("../../../packages/engine/src/agent-api/app/workerNodes.js");
    const { BatchedMeshState, batchedStateFor } = await import("../../../packages/engine/src/agent-api/nodes/batchedState.js");
    const mesh = batched.mesh({ name: "traffic", maxInstances: 4, material: material.pbr({ color: "#ffffff" }) });
    const box = mesh.addGeometry("box");
    mesh.addInstance(box);
    const snapshot = buildScene().add(mesh).toJSON();
    const node = snapshot.nodes[0] as { batchedId?: string };
    const host = batchedStateFor(node.batchedId)!;
    const mirror = createWorkerNodeMirror(snapshot);
    expect(mirror.pending).toBe(0);
    // The worker copy, taken when the scene was sent.
    const worker = BatchedMeshState.fromWorkerSnapshot({ ...host.toWorkerSnapshot()!, id: "worker-copy" });
    mesh.addInstance(box);
    mesh.setMatrixAt(1, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 9, 8, 7, 1]);
    expect(mirror.pending).toBe(1);
    const ops = mirror.drain();
    expect(mirror.pending).toBe(0);
    const op = ops[0] as { batched: string; state: Parameters<typeof worker.syncFromWorkerSnapshot>[0] };
    expect(op.batched).toBe(host.id);
    worker.syncFromWorkerSnapshot(structuredClone({ ...op.state, id: "worker-copy" }));
    expect(Array.from(worker.alive)).toEqual([1, 1, 0, 0]);
    expect(Array.from(worker.getMatrixAt(1)).slice(12, 15)).toEqual([9, 8, 7]);
    mirror.dispose();
    worker.dispose();
  });
});

describe("worker renderer globals", () => {
  it("copies the page's __A3D_*__ switches into the worker global object", () => {
    const page = { __A3D_SHADOW_FIT__: "current", __A3D_HDR_OUTPUT_PASS__: true, __A3D_SHADOW_TAPS__: 8, __A3D_OBJ__: {}, __A3D_NAN__: Number.NaN, other: "x" };
    const globals = collectWorkerRendererGlobals(page);
    expect(globals).toEqual({ __A3D_SHADOW_FIT__: "current", __A3D_HDR_OUTPUT_PASS__: true, __A3D_SHADOW_TAPS__: 8 });
    expect(collectWorkerRendererGlobals({ other: 1 })).toBeUndefined();
    const worker: Record<string, unknown> = { __A3D_SHADOW_TAPS__: 4 };
    installWorkerRendererGlobals(structuredClone({ ...globals, evil: "x", __A3D_FN__: "ok" }), worker);
    expect(worker).toEqual({ __A3D_SHADOW_FIT__: "current", __A3D_HDR_OUTPUT_PASS__: true, __A3D_SHADOW_TAPS__: 4, __A3D_FN__: "ok" });
  });
});

describe("worker app.atmosphere", () => {
  it("routes atmosphere calls through the patch allowlist", () => {
    const appCall = vi.fn();
    expect(applyWorkerNodePatch(undefined, undefined, [{ app: "atmosphere.setFog", args: [{ color: "#223344", density: 0.002 }, { transitionSeconds: 2 }] }], undefined, appCall)).toBe(1);
    expect(appCall).toHaveBeenCalledWith("atmosphere.setFog", [{ color: "#223344", density: 0.002 }, { transitionSeconds: 2 }]);
    expect(() => applyWorkerNodePatch(undefined, undefined, [{ app: "atmosphere.dispose", args: [] } as never], undefined, appCall)).toThrow(/cannot call app\.atmosphere\.dispose/);
  });

  it("the worker atmosphere binding exposes the app.atmosphere controls", async () => {
    const { bindWorkerAtmosphere } = await import("../../../packages/engine/src/agent-api/app/workerAtmosphere.js");
    const { resolveQrFlags } = await import("../../../packages/engine/src/contracts/flags.js");
    const { createAuraRuntimeNodeRegistry } = await import("../../../packages/engine/src/agent-api/app/runtimeNodes.js");
    const flags = resolveQrFlags({ options: { A3D_QR_VFX_FOG: true } });
    const nodes = createAuraRuntimeNodeRegistry(scene(), { flags, app: { scene: scene() } as never });
    const binding = await bindWorkerAtmosphere(new Canvas() as unknown as HTMLCanvasElement, {}, scene(), nodes, flags);
    expect(binding).not.toBeNull();
    binding!.controls.setFog({ color: "#223344", density: 0.002 }, { transitionSeconds: 0 });
    expect(binding!.controls.state().fog).toMatchObject({ density: 0.002 });
    binding!.dispose();
  }, 60_000);
});
