import { describe, expect, it, vi } from "vitest";
import { forwardAuthoredCanvasSize } from "../../../packages/engine/src/agent-api/app/canvas.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";
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
