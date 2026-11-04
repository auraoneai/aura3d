import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerRenderer, createWorkerRendererOrFallback, installWorkerRenderer, workerRendererUrl } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import { createWorkerRendererWorker } from "../../../packages/engine/src/agent-api/app/workerFactory.js";
import { createWorkerPointerEventBuffer, MAX_WORKER_POINTER_EVENTS } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerInput, AuraWorkerPointerEvent, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

const production = vi.hoisted(() => ({ mount: vi.fn(), bind: vi.fn(), clear: vi.fn(), disposeAnimation: vi.fn(), releaseColor: vi.fn(), bindShader: vi.fn() }));
vi.mock("../../../packages/engine/src/agent-api/compiler/renderer.js", () => ({ createProductionRuntimeSceneRenderer: production.mount }));
vi.mock("../../../packages/engine/src/agent-api/compiler/observations.js", () => ({ analyzeProductionBridgeEligibility: () => ({ eligible: true, reasons: [] }) }));
vi.mock("../../../packages/engine/src/agent-api/nodes/groups.js", () => ({ groups: { flatten: (nodes: unknown) => nodes } }));
vi.mock("../../../packages/engine/src/agent-api/app/rendererOptions.js", () => ({ normalizeCreateAppRendererOptions: () => ({ mode: "production" }) }));
vi.mock("../../../packages/engine/src/contracts/flags.js", () => ({ resolveQrFlags: () => ({ on: () => false }) }));
vi.mock("../../../packages/engine/src/agent-api/app/actorAnimationHandle.js", () => ({ createActorAnimationContext: () => ({}), bindActorAnimationContext: vi.fn(), disposeActorAnimationContext: production.disposeAnimation }));
vi.mock("../../../packages/engine/src/production-runtime/actor/extensions.js", () => ({ setTypedGLBActorQrFlags: production.bind, clearTypedGLBActorQrFlags: production.clear }));
vi.mock("../../../packages/engine/src/agent-api/compiler/color.js", () => ({ setPrd01ColorParsing: () => production.releaseColor }));
vi.mock("@aura3d/rendering", () => ({ createShaderFailureStore: () => ({}), bindShaderFailureStore: production.bindShader, setShaderFailureMode: vi.fn() }));

class Canvas {
  width = 8;
  height = 8;
  transfers = 0;
  transferControlToOffscreen(): OffscreenCanvas { this.transfers++; return { width: this.width, height: this.height } as OffscreenCanvas; }
}

class Port {
  peer?: Port;
  listeners = new Map<string, Set<(event: any) => void>>();
  messages: any[] = [];
  transfers: Transferable[][] = [];
  terminated = 0;
  postMessage(message: any, transfer: Transferable[] = []): void {
    this.transfers.push(transfer);
    // Fake OffscreenCanvas is not transferable in Node. Transfer the real scene
    // resources while preserving fake canvas ownership separately.
    const cloned = message.type === "scene" ? structuredClone(message, { transfer })
      : message.type === "init" ? { ...structuredClone({ ...message, canvas: undefined }, { transfer: transfer.slice(1) }), canvas: message.canvas }
      : message;
    this.messages.push(cloned);
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit("message", { data: cloned }); });
  }
  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: any) => void): void { this.listeners.get(type)?.delete(listener); }
  terminate(): void { this.terminated++; }
  emit(type: string, event: unknown): void { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
  count(): number { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
class DomTarget {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void): void { const entries = this.listeners.get(type) ?? new Set(); entries.add(listener); this.listeners.set(type, entries); }
  removeEventListener(type: string, listener: (event: any) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: Record<string, unknown> = {}): void { for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...event, type }); }
  count(): number { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
class DomCanvas extends DomTarget {
  width = 100;
  height = 50;
  captures: number[] = [];
  transferControlToOffscreen(): OffscreenCanvas { return { width: this.width, height: this.height } as OffscreenCanvas; }
  getBoundingClientRect(): DOMRect { return { left: 10, top: 20, width: 100, height: 50 } as DOMRect; }
  setPointerCapture(id: number): void { this.captures.push(id); }
}
const ports = (): [Port, Port] => { const host = new Port(); const worker = new Port(); host.peer = worker; worker.peer = host; return [host, worker]; };
const snapshot = (name = "initial"): AuraSceneSnapshot => ({ schema: "aura3d-scene-snapshot/1.0", background: "#000", nodes: [{ kind: "primitive", name }], camera: {}, diagnostics: { enabled: false } }) as unknown as AuraSceneSnapshot;
const tick = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const endpoint = (port: Port): AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse> => port as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>;
const worker = (port: Port): AuraWorkerHostEndpoint => port as unknown as AuraWorkerHostEndpoint;

function renderer(log: string[], name: string): WebGLSceneRenderer & { lost: () => void; restored: () => void } {
  let onLost: () => void = () => undefined;
  let onRestored: () => void = () => undefined;
  let isLost = false;
  return {
    backend: "webgl2" as WebGLSceneRenderer["backend"], diagnostics: {} as WebGLSceneRenderer["diagnostics"],
    render: (time: number) => { log.push(`render:${name}:${time}`); return 3; },
    resize: (width: number, height: number) => { log.push(`resize:${width}x${height}`); },
    resetTemporalHistory: (reason: string) => { log.push(`reset:${reason}`); },
    viewProjection: () => new Float32Array(16),
    onDeviceLost: (listener: () => void) => { onLost = listener; return () => { onLost = () => undefined; }; },
    onDeviceRestored: (listener: () => void) => { onRestored = listener; return () => { onRestored = () => undefined; }; },
    deviceLost: () => isLost,
    lost: () => { isLost = true; onLost(); }, restored: () => { isLost = false; onRestored(); },
    dispose: () => { log.push(`dispose:${name}`); }
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("worker pointer event buffering", () => {
  const pointer = (id: number, x: number) => ({ id, type: "touch", x, y: 0, buttons: 1, pressure: 0.5 });
  const sample = (phase: "down" | "move" | "up", id: number, x: number): AuraWorkerPointerEvent => ({ phase, pointer: pointer(id, x), timestamp: x });

  it("retains ordered transitions while coalescing moves only between transitions", () => {
    const buffer = createWorkerPointerEventBuffer();
    const first = sample("move", 1, 1);
    buffer.append([first, sample("move", 2, 2), sample("move", 1, 3), sample("down", 3, 4)]);
    buffer.append([sample("move", 1, 5), sample("move", 1, 6), { phase: "cancel", pointer: pointer(3, 7), timestamp: 7, reason: "pointercancel" }, sample("up", 1, 8)]);
    expect(buffer.drain().pointerEvents.map((event) => [event.phase, event.pointer.id, event.pointer.x])).toEqual([
      ["move", 2, 2], ["move", 1, 3], ["down", 3, 4], ["move", 1, 6], ["cancel", 3, 7], ["up", 1, 8]
    ]);
    expect(buffer.drain()).toEqual({ pointerEvents: [] });
  });

  it("bounds pending history, reports loss explicitly, and starts a fresh batch after reconciliation", () => {
    const buffer = createWorkerPointerEventBuffer();
    for (let i = 0; i < MAX_WORKER_POINTER_EVENTS; i++) buffer.append([sample("down", i, i)]);
    expect(buffer.drain().pointerEvents).toHaveLength(MAX_WORKER_POINTER_EVENTS);
    for (let i = 0; i <= MAX_WORKER_POINTER_EVENTS; i++) buffer.append([sample("down", i, i)]);
    buffer.append([sample("up", 1, 999)]);
    expect(buffer.drain()).toEqual({ pointerEvents: [], pointerEventsOverflow: true });
    buffer.append([sample("down", 42, 1)]);
    expect(buffer.drain().pointerEvents).toEqual([sample("down", 42, 1)]);
    buffer.append([sample("up", 42, 2)]);
    buffer.append([], true);
    expect(buffer.drain()).toEqual({ pointerEvents: [], pointerEventsOverflow: true });
  });
});

describe("worker-owned rendering protocol", () => {
  it("transfers once, orders scene/input/resize and frames, and tears down both ends", async () => {
    const [host, remote] = ports(); const canvas = new Canvas(); const log: string[] = [];
    let frameInput: unknown;
    installWorkerRenderer(endpoint(remote), {
      createRenderer: async (_canvas, scene) => { const name = (scene.nodes[0] as { name?: string }).name ?? ""; log.push(`mount:${name}`); return renderer(log, name); },
      onFrame: (frame) => { frameInput = frame.input; }
    });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    expect(canvas.transfers).toBe(1);
    expect(host.transfers[0]).toHaveLength(1);
    const bytes = new ArrayBuffer(4);
    const dynamic = { ...snapshot("updated"), bytes } as AuraSceneSnapshot;
    await app.setScene(dynamic, { transfer: [bytes] });
    expect(bytes.byteLength).toBe(0);
    const input = { pointers: [{ id: 7, type: "touch", x: 2, y: 3, buttons: 1, pressure: 0.5 }], keys: ["KeyA"], timestamp: 4 };
    await app.setInput(input);
    await app.resize({ width: 20, height: 10, pixelRatio: 2 });
    expect(await app.step(0.25, 1000)).toMatchObject({ width: 40, height: 20, time: 1000, drawCalls: 3 });
    expect(frameInput).toEqual(input);
    expect(log).toEqual(["mount:initial", "dispose:initial", "mount:updated", "resize:40x20", "reset:resize", "render:updated:1000"]);
    expect(host.messages.map((message) => message.id)).toEqual([1, 2, 3, 4, 5]);
    await Promise.all([app.dispose(), app.dispose()]);
    expect(log.at(-1)).toBe("dispose:updated");
    expect(host.terminated).toBe(1);
    expect([host.count(), remote.count()]).toEqual([0, 0]);
    await expect(app.step(1)).rejects.toMatchObject({ code: "disposed" });
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(new Port()), scene: snapshot() })).toThrow(/already been transferred/);
  });

  it("runs fallback before transfer when unsupported", () => {
    const host = new Port(); const fallback = vi.fn(() => "main-renderer");
    const result = createWorkerRendererOrFallback({ canvas: {} as HTMLCanvasElement, worker: worker(host), scene: snapshot() }, fallback);
    expect(result).toEqual({ kind: "fallback", renderer: "main-renderer" });
    expect(host.terminated).toBe(1);
    expect(fallback).toHaveBeenCalledOnce();
    expect(host.messages).toHaveLength(0);
  });

  it("publishes a relative emitted same-origin worker entry URL", () => {
    const url = workerRendererUrl();
    expect(url.pathname.endsWith("/app/render.worker.js")).toBe(true);
    expect(url.protocol).toBe(new URL(import.meta.url).protocol);
  });

  it("constructs the default worker as a module for bundler processing", () => {
    const created: { url: URL; options: WorkerOptions }[] = [];
    class FakeWorker { constructor(url: URL, options: WorkerOptions) { created.push({ url, options }); } }
    vi.stubGlobal("Worker", FakeWorker);
    expect(createWorkerRendererWorker()).toBeInstanceOf(FakeWorker);
    expect(created[0].url.pathname).toMatch(/\/app\/render\.worker\.js$/);
    expect(created[0].options).toEqual({ type: "module" });
  });

  it("rejects invalid or excessive backing sizes before canvas ownership transfers", () => {
    const host = new Port(); const canvas = new Canvas();
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), size: { width: 16385, height: 1, pixelRatio: 1 } })).toThrow(/backing size exceeds/);
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), size: { width: 8192, height: 8192, pixelRatio: 1 } })).toThrow(/total pixels/);
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: { ...snapshot(), extra: () => undefined } as AuraSceneSnapshot })).toThrow();
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), assets: { decoders: { basePath: (() => undefined) as never } } })).toThrow();
    for (const securityContext of ["", "   ", null, 42]) {
      expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), assets: { securityContext: securityContext as never } })).toThrow(/securityContext/);
    }
    expect(canvas.transfers).toBe(0);
    expect(host.messages).toHaveLength(0);
  });

  it("checks endpoint and transfer-list setup before transferring ownership", () => {
    const canvas = new Canvas();
    const invalid = { postMessage() {}, terminate() {} } as unknown as AuraWorkerHostEndpoint;
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: invalid, scene: snapshot() })).toThrow(/dedicated worker endpoint/);
    const duplicate = new ArrayBuffer(8);
    const host = new Port();
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), sceneTransfer: [duplicate, duplicate] })).toThrow(/only appear once/);
    expect(canvas.transfers).toBe(0);
    expect(duplicate.byteLength).toBe(8);

    const broken = new Port();
    const add = broken.addEventListener.bind(broken);
    broken.addEventListener = (type, listener) => { if (type === "error") throw new Error("listener setup failed"); add(type, listener); };
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(broken), scene: snapshot() })).toThrow(/listener setup failed/);
    expect([canvas.transfers, broken.count(), broken.terminated]).toEqual([0, 0, 1]);
  });

  it("fails before transfer for realm-local texture handles instead of silently losing their backing", async () => {
    const host = new Port(); const canvas = new Canvas();
    const invalid = { ...snapshot(), nodes: [{ material: { texture: { kind: "aura-texture-ref", id: "local" } } }] } as unknown as AuraSceneSnapshot;
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: invalid })).toThrow(/Live texture handles cannot cross worker realms/);
    expect(canvas.transfers).toBe(0);
    const [page, remote] = ports();
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "scene") });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(page), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    await expect(app.setScene(invalid)).rejects.toMatchObject({ code: "unsupported-worker-resource", severity: "recoverable" });
    expect((await app.step(0)).drawCalls).toBe(3);
    await app.dispose();
  });

  it("bounds pending work while allowing disposal to terminate an unresponsive worker", async () => {
    const host = new Port();
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, disposeTimeoutMs: 1 });
    const pending = [app.ready, ...Array.from({ length: 127 }, () => app.setInput({ pointers: [], keys: [], timestamp: 0 }))];
    const results = Promise.allSettled(pending);
    await expect(app.setInput({ pointers: [], keys: [], timestamp: 0 })).rejects.toMatchObject({ code: "queue-full", severity: "recoverable" });
    // Termination still happens, but an unacknowledged teardown is reported.
    await expect(app.dispose()).rejects.toMatchObject({ code: "dispose-timeout", severity: "terminal" });
    expect((await results).every((result) => result.status === "rejected")).toBe(true);
    expect([host.terminated, host.count()]).toEqual([1, 0]);
    expect(host.messages.at(-1).type).toBe("dispose");
  });

  it("passes the transferred canvas, actual snapshot and backend option to the production scene compiler", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    production.mount.mockReset().mockResolvedValue(renderer(log, "compiled"));
    production.bind.mockClear(); production.clear.mockClear(); production.disposeAnimation.mockClear(); production.releaseColor.mockClear(); production.bindShader.mockClear();
    installWorkerRenderer(endpoint(remote));
    const scene = snapshot("real-input");
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene, renderer: { backend: "webgpu" }, assets: { decoders: { basePath: "/nested/codecs/" } }, autoStart: false, bridgeEvents: false });
    await app.ready;
    expect(production.mount).toHaveBeenCalledOnce();
    const [canvas, mountedScene, settings, , flags, , , context] = production.mount.mock.calls[0];
    expect([canvas, mountedScene, settings]).toEqual([host.transfers[0][0], scene, { backend: "webgpu" }]);
    expect(context.request.signal).toBeInstanceOf(AbortSignal);
    expect(context.request).not.toHaveProperty("securityContext");
    expect(context.assetOptions).toEqual({ decoders: { basePath: "/nested/codecs/" } });
    expect(production.bind).toHaveBeenCalledWith(flags, context.runtimeOwner);
    expect(production.bindShader).toHaveBeenCalledWith(context.runtimeOwner, expect.anything());
    expect((await app.step(0, 10)).drawCalls).toBe(3);
    expect(log).toContain("render:compiled:10");
    await app.dispose();
    expect(production.clear).toHaveBeenCalledWith(context.runtimeOwner);
    expect(production.disposeAnimation).toHaveBeenCalledOnce();
    expect(production.releaseColor).toHaveBeenCalledOnce();
  });

  it("snapshots the worker authentication generation and preserves it on scene changes and recovery", async () => {
    const [host, remote] = ports();
    const log: string[] = [];
    const seen: Array<{ request: { signal: AbortSignal; securityContext?: string }; assetOptions?: { securityContext?: string } }> = [];
    production.mount.mockReset().mockImplementation(async (...args: unknown[]) => {
      seen.push(args[7] as typeof seen[number]);
      return renderer(log, `mount-${seen.length}`);
    });
    installWorkerRenderer(endpoint(remote));
    const assets = { securityContext: "account-a-session-1" };
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), assets, autoStart: false, bridgeEvents: false });
    assets.securityContext = "account-b-session-2";
    try {
      await app.ready;
      await app.setScene(snapshot("replacement"));
      await app.recover();
      expect(seen).toHaveLength(3);
      expect(seen.map((entry) => entry.request.securityContext)).toEqual(Array(3).fill("account-a-session-1"));
      expect(seen.map((entry) => entry.assetOptions?.securityContext)).toEqual(Array(3).fill("account-a-session-1"));
      expect(seen.every((entry) => entry.request.signal instanceof AbortSignal)).toBe(true);
      expect((await app.step(0, 10)).drawCalls).toBe(3);
    } finally { await app.dispose(); }
  });

  it("provides custom worker renderers a separate mount context on every mount", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    const contexts: Array<{ signal: AbortSignal; securityContext?: string }> = [];
    installWorkerRenderer(endpoint(remote), {
      createRenderer: async (_canvas, _scene, _options, signal, context) => {
        expect(context?.request.signal).toBe(signal);
        contexts.push(context!.request);
        // A custom renderer cannot mutate the worker's stored generation.
        if (context?.assets) (context.assets as { securityContext?: string }).securityContext = "modified-in-hook";
        return renderer(log, `custom-${contexts.length}`);
      }
    });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), assets: { securityContext: "account-a-session-1" }, autoStart: false, bridgeEvents: false });
    try {
      await app.ready;
      await app.setScene(snapshot("replacement"));
      expect(contexts.map((context) => context.securityContext)).toEqual(["account-a-session-1", "account-a-session-1"]);
    } finally { await app.dispose(); }
  });

  it("transfers initial scene-owned buffers with the canvas", async () => {
    const [host, remote] = ports(); const buffer = new ArrayBuffer(8);
    const scene = { ...snapshot(), buffer } as AuraSceneSnapshot;
    installWorkerRenderer(endpoint(remote), { createRenderer: async (_canvas, received) => {
      expect((received as AuraSceneSnapshot & { buffer: ArrayBuffer }).buffer.byteLength).toBe(8);
      return renderer([], "buffer");
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene, sceneTransfer: [buffer], autoStart: false, bridgeEvents: false });
    expect(buffer.byteLength).toBe(0);
    expect(host.transfers[0]).toHaveLength(2);
    await app.ready; await app.dispose();
  });

  it("transfers a transfer-only scene resource after a non-destructive clone preflight", async () => {
    const [host, remote] = ports();
    const channel = new MessageChannel();
    const received = new Promise<unknown>((resolve) => { channel.port2.onmessage = (event) => resolve(event.data); });
    const scene = { ...snapshot(), port: channel.port1 } as AuraSceneSnapshot;
    installWorkerRenderer(endpoint(remote), { createRenderer: async (_canvas, transferred) => {
      const port = (transferred as AuraSceneSnapshot & { port: MessagePort }).port;
      port.postMessage("worker-owned");
      port.close();
      return renderer([], "port");
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene, sceneTransfer: [channel.port1], autoStart: false, bridgeEvents: false });
    await app.ready;
    expect(await received).toBe("worker-owned");
    channel.port2.close();
    await app.dispose();
  });

  it("detects non-cloneable data before transferring a transfer-only resource or canvas", () => {
    const host = new Port(); const canvas = new Canvas(); const channel = new MessageChannel();
    const scene = { ...snapshot(), port: channel.port1, callback: () => undefined } as AuraSceneSnapshot;
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene, sceneTransfer: [channel.port1] })).toThrow();
    expect([canvas.transfers, host.messages.length]).toEqual([0, 0]);
    channel.port1.close(); channel.port2.close();
  });

  it("forwards request cancellation to the production compiler and restores the old scene", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    let mountedSignal: AbortSignal | undefined;
    production.mount.mockReset().mockImplementation(async (_canvas, scene, _settings, _nodes, _flags, _degradation, _context, mountContext) => {
      const name = (scene.nodes[0] as { name: string }).name;
      if (name !== "loading") return renderer(log, name);
      mountedSignal = mountContext.request.signal;
      return new Promise((_resolve, reject) => mountedSignal!.addEventListener("abort", () => reject(new Error("fetch aborted")), { once: true }));
    });
    installWorkerRenderer(endpoint(remote));
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    const aborter = new AbortController();
    const rejected = expect(app.setScene(snapshot("loading"), { signal: aborter.signal })).rejects.toMatchObject({ code: "cancelled" });
    for (let i = 0; i < 200 && !mountedSignal; i++) await tick();
    expect(mountedSignal?.aborted).toBe(false);
    aborter.abort(); await rejected; await tick();
    expect(mountedSignal?.aborted).toBe(true);
    expect((await app.step(0, 99)).drawCalls).toBe(3);
    expect(log).toEqual(["dispose:initial", "render:initial:99"]);
    const calls = production.mount.mock.calls;
    expect(calls[0][7].runtimeOwner).not.toBe(calls[1][7].runtimeOwner);
    expect(calls[1][7].runtimeOwner).not.toBe(calls[2][7].runtimeOwner);
    await app.dispose();
  });

  it("lets worker-side frame code use input to replace the rendered scene", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    installWorkerRenderer(endpoint(remote), {
      createRenderer: async (_canvas, scene) => renderer(log, (scene.nodes[0] as { name: string }).name),
      onFrame: (frame, scene) => frame.input?.keys.includes("Space") ? { ...snapshot("changed"), background: scene.background } : undefined
    });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    await app.setInput({ pointers: [], keys: ["Space"], timestamp: 1 });
    await app.step(1 / 60, 20);
    expect(log).toEqual(["dispose:initial", "render:changed:20"]);
    await app.dispose();
    expect(log.at(-1)).toBe("dispose:changed");
  });

  it("forwards CSS-local pointer and keyboard snapshots and releases every DOM listener", async () => {
    const [host, remote] = ports(); const canvas = new DomCanvas();
    const windowTarget = new DomTarget(); const documentTarget = Object.assign(new DomTarget(), { visibilityState: "visible" });
    let disconnected = 0;
    vi.stubGlobal("window", windowTarget); vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() { disconnected++; } });
    let input: any;
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { input = frame.input; } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false });
    await app.ready;
    canvas.emit("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 31, clientY: 45, buttons: 1, pressure: 0.6 });
    canvas.emit("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 60, clientY: 40, buttons: 1, pressure: 0.5 });
    canvas.emit("pointercancel", { pointerId: 1 });
    windowTarget.emit("keydown", { code: "KeyA" });
    await tick(); await app.step(0);
    expect(canvas.captures).toEqual([1, 2]);
    expect(input).toMatchObject({ keys: ["KeyA"], pointers: [{ id: 2, x: 50, y: 20, buttons: 1 }] });
    windowTarget.emit("blur"); await tick(); await app.step(0);
    expect(input).toMatchObject({ keys: [], pointers: [] });
    canvas.emit("pointermove", { pointerId: 3, pointerType: "mouse", clientX: 11, clientY: 21, buttons: 0, pressure: 0 });
    const disposal = app.dispose(); await disposal; await tick();
    expect([canvas.count(), windowTarget.count(), documentTarget.count(), disconnected, host.count(), remote.count()]).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("delivers rapid pointer transitions once, including cancellation and lost capture", async () => {
    const [host, remote] = ports(); const canvas = new DomCanvas(); const windowTarget = new DomTarget();
    vi.stubGlobal("window", windowTarget);
    const frames: (AuraWorkerInput | undefined)[] = [];
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { frames.push(frame.input); } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false });
    await app.ready;
    canvas.emit("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 31, clientY: 45, buttons: 1, pressure: 0.6 });
    canvas.emit("pointermove", { pointerId: 1, pointerType: "touch", clientX: 32, clientY: 46, buttons: 1, pressure: 0.6 });
    canvas.emit("pointermove", { pointerId: 1, pointerType: "touch", clientX: 33, clientY: 47, buttons: 1, pressure: 0.6 });
    canvas.emit("pointerup", { pointerId: 1, pointerType: "touch", clientX: 34, clientY: 48, buttons: 0, pressure: 0 });
    canvas.emit("lostpointercapture", { pointerId: 1 });
    canvas.emit("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 40, clientY: 50, buttons: 1, pressure: 0.5 });
    canvas.emit("pointercancel", { pointerId: 2 });
    canvas.emit("pointerdown", { pointerId: 3, pointerType: "touch", clientX: 50, clientY: 55, buttons: 1, pressure: 0.5 });
    canvas.emit("lostpointercapture", { pointerId: 3 });
    canvas.emit("pointerdown", { pointerId: 4, pointerType: "touch", clientX: 60, clientY: 56, buttons: 1, pressure: 0.5 });
    windowTarget.emit("blur");
    await tick(); await app.step(0); await app.step(0);
    expect(frames[0]?.pointers).toEqual([]);
    expect(frames[0]?.pointerEvents?.map((event) => [event.phase, event.pointer.id, event.pointer.x, event.pointer.y, event.phase === "cancel" ? event.reason : null])).toEqual([
      ["down", 1, 21, 25, null], ["move", 1, 23, 27, null], ["up", 1, 24, 28, null],
      ["down", 2, 30, 30, null], ["cancel", 2, 30, 30, "pointercancel"],
      ["down", 3, 40, 35, null], ["cancel", 3, 40, 35, "lostpointercapture"],
      ["down", 4, 50, 36, null], ["cancel", 4, 50, 36, "blur"]
    ]);
    expect(frames[1]?.pointerEvents ?? []).toEqual([]);
    expect(frames[1]?.pointerEventsOverflow).toBeUndefined();
    await app.dispose();
  });

  it("merges input batches until a frame and exposes overflow rather than losing history silently", async () => {
    const [host, remote] = ports(); const frames: (AuraWorkerInput | undefined)[] = [];
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { frames.push(frame.input); } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    const pointer = { id: 5, type: "mouse", x: 3, y: 4, buttons: 1, pressure: 0.5 };
    const down: AuraWorkerPointerEvent = { phase: "down", pointer, timestamp: 1 };
    const up: AuraWorkerPointerEvent = { phase: "up", pointer: { ...pointer, buttons: 0, pressure: 0 }, timestamp: 2 };
    await app.setInput({ pointers: [pointer], keys: [], timestamp: 1, pointerEvents: [down] });
    await app.setInput({ pointers: [], keys: [], timestamp: 2, pointerEvents: [up] });
    await app.step(0); await app.step(0);
    expect(frames[0]).toMatchObject({ pointers: [], pointerEvents: [down, up] });
    expect(frames[1]?.pointerEvents ?? []).toEqual([]);
    const transitions = Array.from({ length: MAX_WORKER_POINTER_EVENTS + 1 }, (_, i): AuraWorkerPointerEvent => ({ ...down, timestamp: i }));
    await app.setInput({ pointers: [pointer], keys: ["KeyA"], timestamp: 3, pointerEvents: transitions.slice(0, 65) });
    await app.setInput({ pointers: [], keys: ["KeyB"], timestamp: 4, pointerEvents: transitions.slice(65) });
    await app.step(0);
    expect(frames[2]).toMatchObject({ pointers: [], keys: ["KeyB"], timestamp: 4, pointerEvents: [], pointerEventsOverflow: true });
    await app.setInput({ pointers: [pointer], keys: [], timestamp: 5, pointerEvents: [down] });
    await app.step(0);
    expect(frames[3]).toMatchObject({ pointerEvents: [down] });
    expect(frames[3]?.pointerEventsOverflow).toBeUndefined();
    await app.dispose();
  });

  it("reports host-side overflow and resumes ordered delivery after reconciliation", async () => {
    const [host, remote] = ports(); const canvas = new DomCanvas(); const frames: (AuraWorkerInput | undefined)[] = [];
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { frames.push(frame.input); } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false });
    await app.ready;
    for (let i = 0; i <= MAX_WORKER_POINTER_EVENTS / 2; i++) {
      canvas.emit("pointerdown", { pointerId: i, pointerType: "touch", clientX: 20, clientY: 30, buttons: 1, pressure: 0.5 });
      canvas.emit("pointerup", { pointerId: i, pointerType: "touch", clientX: 21, clientY: 31, buttons: 0, pressure: 0 });
    }
    await tick(); await app.step(0);
    expect(frames[0]).toMatchObject({ pointers: [], pointerEvents: [], pointerEventsOverflow: true });
    canvas.emit("pointerdown", { pointerId: 200, pointerType: "touch", clientX: 20, clientY: 30, buttons: 1, pressure: 0.5 });
    canvas.emit("pointerup", { pointerId: 200, pointerType: "touch", clientX: 21, clientY: 31, buttons: 0, pressure: 0 });
    await tick(); await app.step(0);
    expect(frames[1]?.pointerEvents?.map((event) => event.phase)).toEqual(["down", "up"]);
    expect(frames[1]?.pointerEventsOverflow).toBeUndefined();
    await app.dispose();
  });

  it("preserves transitions queued while the previous host input is in flight", async () => {
    const [host, remote] = ports(); const canvas = new DomCanvas(); const held: AuraWorkerRequest[] = [];
    const send = host.postMessage.bind(host); let holdInput = true;
    host.postMessage = (message: AuraWorkerRequest, transfer?: Transferable[]): void => {
      if (message.type === "input" && holdInput) held.push(message); else send(message, transfer);
    };
    let input: AuraWorkerInput | undefined;
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { input = frame.input; } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false });
    await app.ready;
    canvas.emit("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 30, buttons: 1, pressure: 0.5 });
    await tick();
    expect(held).toHaveLength(1);
    canvas.emit("pointerup", { pointerId: 1, pointerType: "touch", clientX: 21, clientY: 31, buttons: 0, pressure: 0 });
    await tick();
    expect(held).toHaveLength(1);
    holdInput = false;
    send(held[0]);
    await tick(); await tick(); await app.step(0);
    expect(input?.pointers).toEqual([]);
    expect(input?.pointerEvents?.map((event) => event.phase)).toEqual(["down", "up"]);
    await app.dispose();
  });

  it("retries rejected host input with a reconciliation marker and cancels retry on dispose", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const [host, remote] = ports(); const canvas = new DomCanvas(); const errors: string[] = [];
    const send = host.postMessage.bind(host); let rejectInput = true;
    host.postMessage = (message: AuraWorkerRequest, transfer?: Transferable[]): void => {
      if (message.type === "input" && rejectInput) {
        host.messages.push(message);
        queueMicrotask(() => host.emit("message", { data: { type: "error", id: message.id, message: "busy", code: "queue-full", severity: "recoverable" } }));
      } else send(message, transfer);
    };
    let input: AuraWorkerInput | undefined;
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { input = frame.input; } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, onError: (error) => { errors.push(error.code); } });
    await app.ready;
    canvas.emit("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 30, buttons: 1, pressure: 0.5 });
    await tick();
    expect(errors).toEqual(["queue-full"]);
    rejectInput = false;
    await vi.advanceTimersByTimeAsync(50); await tick(); await app.step(0);
    expect(input).toMatchObject({ pointers: [{ id: 1 }], pointerEvents: [], pointerEventsOverflow: true });
    rejectInput = true;
    canvas.emit("pointerup", { pointerId: 1, pointerType: "touch", clientX: 21, clientY: 31, buttons: 0, pressure: 0 });
    await tick();
    const inputCount = host.messages.filter((message) => message.type === "input").length;
    await app.dispose(); await vi.advanceTimersByTimeAsync(1000);
    expect(host.messages.filter((message) => message.type === "input")).toHaveLength(inputCount);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps a scaled padded canvas to unscaled content-box coordinates and backing size", async () => {
    const [host, remote] = ports(); const canvas = new DomCanvas();
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 228, height: 120 }) as DOMRect;
    vi.stubGlobal("getComputedStyle", () => ({
      boxSizing: "content-box", width: "100px", height: "50px",
      paddingLeft: "5px", paddingRight: "5px", paddingTop: "3px", paddingBottom: "3px",
      borderLeftWidth: "2px", borderRightWidth: "2px", borderTopWidth: "2px", borderBottomWidth: "2px"
    }));
    let input: AuraWorkerInput | undefined;
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test"), onFrame: (frame) => { input = frame.input; } });
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false });
    await app.ready;
    expect(host.messages[0].size).toEqual({ width: 100, height: 50, pixelRatio: 1 });
    canvas.emit("pointerdown", { pointerId: 1, pointerType: "mouse", clientX: 84, clientY: 70, buttons: 1, pressure: 0.5 });
    await tick(); await app.step(0);
    expect(input?.pointers).toMatchObject([{ id: 1, x: 30, y: 20 }]);
    expect(input?.pointerEvents?.[0]?.pointer).toMatchObject({ x: 30, y: 20 });
    await app.dispose();
  });

  it("cleans up the worker and partial DOM bridge if resize observation fails", async () => {
    const host = new Port(); const canvas = new DomCanvas();
    const windowTarget = new DomTarget(); const documentTarget = Object.assign(new DomTarget(), { visibilityState: "visible" });
    let disconnected = 0;
    vi.stubGlobal("window", windowTarget); vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("ResizeObserver", class { observe() { throw new Error("observation failed"); } disconnect() { disconnected++; } });
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false })).toThrow(/observation failed/);
    await tick();
    expect([canvas.count(), windowTarget.count(), documentTarget.count(), disconnected, host.count(), host.terminated]).toEqual([0, 0, 0, 1, 0, 1]);
  });

  it("waits for an in-flight mount and disposes its late resources during shutdown", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    let finishMount!: (value: WebGLSceneRenderer) => void;
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => new Promise((resolve) => { finishMount = resolve; }) });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    const ready = expect(app.ready).rejects.toMatchObject({ code: "disposed" });
    await tick();
    const disposal = app.dispose();
    finishMount(renderer(log, "late"));
    await Promise.all([ready, disposal]);
    expect(log).toEqual(["dispose:late"]);
    expect([host.terminated, host.count(), remote.count()]).toEqual([1, 0, 0]);
  });

  it("cancels a pending scene mount and disposes a late renderer without retaining callbacks", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    let finishMount!: (value: WebGLSceneRenderer) => void;
    installWorkerRenderer(endpoint(remote), { createRenderer: async (_canvas, scene) => scene.nodes[0] && (scene.nodes[0] as { name: string }).name === "slow" ? new Promise((resolve) => { finishMount = resolve; }) : renderer(log, "first") });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    const aborter = new AbortController();
    const request = app.setScene(snapshot("slow"), { signal: aborter.signal });
    const rejected = expect(request).rejects.toMatchObject({ code: "cancelled", severity: "recoverable" });
    await tick(); aborter.abort(); await rejected;
    finishMount(renderer(log, "late")); await tick();
    expect(log).toEqual(["dispose:first", "dispose:late"]);
    expect((await app.step(0.5)).drawCalls).toBe(3);
    const disposal = app.dispose(); await disposal;
    expect([host.count(), remote.count(), host.terminated]).toEqual([0, 0, 1]);
  });

  it("retains the old renderer when an asynchronous scene load fails and accepts a later retry", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    installWorkerRenderer(endpoint(remote), {
      createRenderer: async (_canvas, scene) => {
        const name = (scene.nodes[0] as { name: string }).name;
        if (name === "missing") throw new Error("asset unavailable at https://assets.example/model.glb?token=secret");
        return renderer(log, name);
      }
    });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    await expect(app.setScene(snapshot("missing"))).rejects.toMatchObject({ code: "worker-render", severity: "recoverable", message: "asset unavailable at https://assets.example/model.glb?[redacted]" });
    await app.step(0, 20);
    expect(log).toEqual(["dispose:initial", "render:initial:20"]);
    await app.setScene(snapshot("retry")); await app.step(0, 30);
    expect(log).toEqual(["dispose:initial", "render:initial:20", "dispose:initial", "render:retry:30"]);
    await app.dispose();
  });

  it("forwards loss and recovery, reports recoverable frame failures, and never renders a lost device", async () => {
    const [host, remote] = ports(); const log: string[] = []; const device = renderer(log, "device");
    const states: string[] = [];
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => device });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, onDevice: (state) => states.push(state) });
    await app.ready; device.lost(); await tick();
    await expect(app.step(1)).rejects.toMatchObject({ code: "device-lost", severity: "recoverable" });
    expect(log).not.toContain("render:device:1000");
    device.restored(); await tick();
    expect(await app.step(1)).toMatchObject({ drawCalls: 3 });
    expect(states).toEqual(["lost", "restored"]);
    expect(log).toContain("reset:device-restored");
    await app.dispose();
  });

  it("rejects invalid manual frames without terminating an otherwise healthy renderer", async () => {
    const [host, remote] = ports();
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "healthy") });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    await expect(app.step(-1)).rejects.toMatchObject({ code: "invalid-frame", severity: "recoverable" });
    await expect(app.step(0, Infinity)).rejects.toMatchObject({ code: "invalid-frame", severity: "recoverable" });
    expect((await app.step(0, 20)).drawCalls).toBe(3);
    expect(host.terminated).toBe(0);
    await app.dispose();
  });

  it("does not report a frame as presented if the device is lost while rendering", async () => {
    const [host, remote] = ports(); const log: string[] = []; const device = renderer(log, "device");
    let complete!: (drawCalls: number) => void;
    device.renderAsync = () => new Promise<number>((resolve) => { complete = resolve; });
    const onFrame = vi.fn();
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => device });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, onFrame });
    await app.ready;
    const step = expect(app.step(0, 50)).rejects.toMatchObject({ code: "device-lost", severity: "recoverable" });
    await tick();
    device.lost(); complete(3);
    await step;
    expect(onFrame).not.toHaveBeenCalled();
    expect(host.terminated).toBe(0);
    device.restored();
    device.renderAsync = undefined;
    expect((await app.step(0, 60)).drawCalls).toBe(3);
    await app.dispose();
  });

  it("preserves a terminal frame failure for every pending caller", async () => {
    const [host, remote] = ports(); const device = renderer([], "broken");
    device.render = () => { throw new Error("GPU command failed"); };
    const onError = vi.fn();
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => device });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, onError });
    await app.ready;
    const frame = expect(app.step(0)).rejects.toMatchObject({ code: "worker-render", severity: "terminal", message: "GPU command failed" });
    const queued = expect(app.setInput({ pointers: [], keys: [], timestamp: 0 })).rejects.toMatchObject({ code: "worker-render", severity: "terminal", message: "GPU command failed" });
    await Promise.all([frame, queued]);
    expect(onError).toHaveBeenCalledOnce();
    expect([host.terminated, host.count()]).toEqual([1, 0]);
    await app.dispose();
  });

  it("suppresses unsolicited callbacks once disposal starts", async () => {
    const [host, remote] = ports(); const device = renderer([], "slow");
    let complete!: (drawCalls: number) => void;
    device.renderAsync = () => new Promise<number>((resolve) => { complete = resolve; });
    const onDevice = vi.fn(); const onFrame = vi.fn(); const onCaptureFrame = vi.fn(); const onError = vi.fn();
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => device });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, onDevice, onFrame, onCaptureFrame, onError });
    await app.ready;
    const frame = expect(app.step(0)).rejects.toMatchObject({ code: "disposed" });
    await tick();
    const disposal = app.dispose();
    host.emit("message", { data: { type: "device", id: 0, state: "lost" } });
    host.emit("message", { data: { type: "presented", id: 0, result: { backend: "webgl2", drawCalls: 3, width: 8, height: 8, time: 0 } } });
    host.emit("message", { data: { type: "capture-presented", id: 0, result: { backend: "webgl2", drawCalls: 3, width: 8, height: 8, time: 0 } } });
    host.emit("message", { data: { type: "error", id: 0, code: "device-lost", severity: "recoverable", message: "lost" } });
    expect([onDevice, onFrame, onCaptureFrame, onError].every((callback) => callback.mock.calls.length === 0)).toBe(true);
    complete(3);
    await Promise.all([frame, disposal]);
    expect([host.count(), remote.count(), host.terminated]).toEqual([0, 0, 1]);
  });

  it("does not submit a suspended automatic frame, while explicit hidden steps still work", async () => {
    const callbacks = new Map<number, (time: number) => void>(); let sequence = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => { callbacks.set(++sequence, callback); return sequence; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { callbacks.delete(id); });
    const [host, remote] = ports(); const log: string[] = [];
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const onFrame = vi.fn();
    installWorkerRenderer(endpoint(remote), {
      createRenderer: async () => renderer(log, "visible"),
      onFrame: async (frame) => { if (frame.source === "automatic") await hold; }
    });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), bridgeEvents: false, onFrame });
    await app.ready;
    const callback = callbacks.values().next().value;
    expect(callback).toBeTypeOf("function");
    callbacks.clear(); callback!(16);
    await tick();
    await app.setVisible(false);
    release(); await tick();
    expect(log).not.toContain("render:visible:16");
    expect(onFrame).not.toHaveBeenCalled();
    expect((await app.step(0, 20)).drawCalls).toBe(3);
    expect(log).toContain("render:visible:20");
    await app.dispose();
  });

  it("explicitly rebuilds a permanently lost backend on the same owned canvas", async () => {
    const [host, remote] = ports(); const log: string[] = []; const states: string[] = [];
    const devices: ReturnType<typeof renderer>[] = [];
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => { const device = renderer(log, `device-${devices.length}`); devices.push(device); return device; } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, onDevice: (state) => states.push(state) });
    await app.ready; devices[0].lost(); await tick();
    await app.recover(); await tick();
    expect(devices).toHaveLength(2);
    expect(states).toEqual(["lost", "restored"]);
    expect(log).toEqual(["dispose:device-0", "reset:device-restored"]);
    expect((await app.step(0, 12)).drawCalls).toBe(3);
    expect(log.at(-1)).toBe("render:device-1:12");
    await app.dispose();
  });

  it("keeps a restored scene usable when a recovery attempt fails and permits a retry", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    let attempts = 0;
    const initial = renderer(log, "initial");
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => {
      attempts++;
      if (attempts === 1) return initial;
      if (attempts === 2) throw new Error("device temporarily unavailable");
      return renderer(log, `restored-${attempts}`);
    } });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready; initial.lost();
    await expect(app.recover()).rejects.toMatchObject({ code: "worker-render", severity: "recoverable", message: "device temporarily unavailable" });
    expect((await app.step(0, 10)).drawCalls).toBe(3);
    await app.recover();
    expect((await app.step(0, 20)).drawCalls).toBe(3);
    expect(log).toContain("render:restored-3:10");
    expect(log).toContain("render:restored-4:20");
    await app.dispose();
  });

  it("reports listener cleanup failure while still releasing the renderer", async () => {
    const [host, remote] = ports(); const log: string[] = [];
    const device = renderer(log, "device");
    device.onDeviceLost = () => () => { throw new Error("listener failed"); };
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => device });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    await expect(app.dispose()).rejects.toMatchObject({ code: "worker-render", severity: "terminal", message: "Worker renderer cleanup failed." });
    expect(log).toContain("dispose:device");
    expect([host.terminated, host.count(), remote.count()]).toEqual([1, 0, 0]);
  });

  it("ignores stale device callbacks from a replaced renderer", async () => {
    const [host, remote] = ports(); const log: string[] = []; const states: string[] = [];
    const first = renderer(log, "old");
    let oldLost!: () => void; let oldRestored!: () => void;
    first.onDeviceLost = (listener) => { oldLost = listener; return () => undefined; };
    first.onDeviceRestored = (listener) => { oldRestored = listener; return () => undefined; };
    let mounts = 0;
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => ++mounts === 1 ? first : renderer(log, "new") });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false, onDevice: (state) => states.push(state) });
    await app.ready;
    await app.setScene(snapshot("new"));
    oldLost(); oldRestored(); await tick();
    expect(states).toEqual([]);
    expect(log).toEqual(["dispose:old"]);
    expect((await app.step(0, 10)).drawCalls).toBe(3);
    await app.dispose();
  });

  it("disposes a mounted renderer when device listener setup fails", async () => {
    const [host, remote] = ports(); const log: string[] = []; const device = renderer(log, "failed");
    device.onDeviceLost = () => { throw new Error("subscription failed"); };
    const stop = installWorkerRenderer(endpoint(remote), { createRenderer: async () => device });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await expect(app.ready).rejects.toMatchObject({ code: "worker-render", message: "subscription failed" });
    expect(log).toEqual(["dispose:failed"]);
    expect([host.terminated, host.count()]).toEqual([1, 0]);
    await stop();
  });

  it("rejects invalid ordering and removes host listeners on worker failure", async () => {
    const [host, remote] = ports();
    installWorkerRenderer(endpoint(remote), { createRenderer: async () => renderer([], "test") });
    const app = createWorkerRenderer({ canvas: new Canvas() as unknown as HTMLCanvasElement, worker: worker(host), scene: snapshot(), autoStart: false, bridgeEvents: false });
    await app.ready;
    remote.emit("message", { data: { type: "frame", id: 1, deltaSeconds: 1 } });
    expect(remote.messages.at(-1)).toMatchObject({ type: "error", code: "invalid-request-id" });
    const pending = app.setInput({ pointers: [], keys: [], timestamp: 0 });
    const rejected = expect(pending).rejects.toMatchObject({ code: "worker-failure" });
    host.emit("error", {}); await rejected;
    expect([host.count(), host.terminated]).toEqual([0, 1]);
    await app.dispose();
  });
});
