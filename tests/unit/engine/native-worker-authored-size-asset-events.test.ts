import { describe, expect, it, vi } from "vitest";
import { forwardAuthoredCanvasSize } from "../../../packages/engine/src/agent-api/app/canvas.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
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
