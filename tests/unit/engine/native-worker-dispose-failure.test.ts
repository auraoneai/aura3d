import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

class Canvas {
  width = 8;
  height = 8;
  transferControlToOffscreen(): OffscreenCanvas {
    return { width: this.width, height: this.height } as OffscreenCanvas;
  }
}

/** A paired asynchronous transport; no browser or GPU is involved. */
class Port {
  peer?: Port;
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  readonly sent: Array<AuraWorkerRequest | AuraWorkerResponse> = [];
  readonly dropTypes = new Set<string>();
  disposePostError?: Error;
  terminated = 0;

  postMessage(message: AuraWorkerRequest | AuraWorkerResponse): void {
    if (message.type === "dispose" && this.disposePostError) throw this.disposePostError;
    this.sent.push(message);
    if (this.dropTypes.has(message.type)) return;
    queueMicrotask(() => {
      if (!this.terminated) this.peer?.emit("message", { data: message });
    });
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener);
    this.listeners.set(type, entries);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void { this.terminated += 1; }

  emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, entries) => total + entries.size, 0);
  }
}

function ports(): [Port, Port] {
  const host = new Port(), remote = new Port();
  host.peer = remote;
  remote.peer = host;
  return [host, remote];
}

const snapshot = (): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000",
  nodes: [{ kind: "primitive", name: "worker-disposal" }],
  camera: {},
  diagnostics: { enabled: false }
}) as unknown as AuraSceneSnapshot;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function fakeRenderer(options: { readonly disposeError?: Error; readonly cleanup?: Promise<void> } = {}) {
  const dispose = vi.fn(() => { if (options.disposeError) throw options.disposeError; });
  const whenDisposed = vi.fn(() => options.cleanup ?? Promise.resolve());
  const value = {
    backend: "webgl2",
    diagnostics: {},
    render: () => 1,
    resize: () => {},
    resetTemporalHistory: () => {},
    viewProjection: () => new Float32Array(16),
    onDeviceLost: () => () => {},
    onDeviceRestored: () => () => {},
    deviceLost: () => false,
    dispose,
    whenDisposed
  } as unknown as WebGLSceneRenderer;
  return { value, dispose, whenDisposed };
}

async function mounted(options: { readonly disposeError?: Error; readonly cleanup?: Promise<void>; readonly timeout?: number } = {}) {
  const [host, remote] = ports();
  const renderer = fakeRenderer(options);
  const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
    createRenderer: async () => renderer.value
  });
  const onError = vi.fn();
  const app = createWorkerRenderer({
    canvas: new Canvas() as unknown as HTMLCanvasElement,
    worker: host as unknown as AuraWorkerHostEndpoint,
    scene: snapshot(),
    autoStart: false,
    bridgeEvents: false,
    disposeTimeoutMs: options.timeout ?? 5000,
    onError
  });
  await app.ready;
  return { app, host, remote, renderer, stop, onError };
}

afterEach(() => { vi.useRealTimers(); });

describe("worker renderer disposal failures", () => {
  it("surfaces worker cleanup failure and still terminates and releases listeners", async () => {
    const cleanup = deferred<void>();
    const f = await mounted({ disposeError: new Error("dispose failed"), cleanup: cleanup.promise });
    const first = f.app.dispose(), repeated = f.app.dispose();
    expect(repeated).toBe(first);
    const rejected = expect(first).rejects.toMatchObject({ code: "worker-render", severity: "terminal", message: "Worker renderer cleanup failed." });
    await flush();
    expect(f.renderer.dispose).toHaveBeenCalledOnce();
    expect(f.renderer.whenDisposed).toHaveBeenCalledOnce();
    expect(f.host.terminated).toBe(0);
    cleanup.reject(new Error("asynchronous cleanup failed"));
    await rejected;
    expect([f.host.terminated, f.host.listenerCount(), f.remote.listenerCount()]).toEqual([1, 0, 0]);
    expect(f.onError).not.toHaveBeenCalled();
    await expect(f.app.dispose()).rejects.toMatchObject({ code: "worker-render" });
  });

  it("propagates a synchronous disposal post failure while closing the host", async () => {
    const f = await mounted();
    const failure = new Error("dispose transport failed");
    f.host.disposePostError = failure;
    const first = f.app.dispose(), repeated = f.app.dispose();
    expect(repeated).toBe(first);
    await expect(first).rejects.toBe(failure);
    expect([f.host.terminated, f.host.listenerCount()]).toEqual([1, 0]);
    expect(f.onError).not.toHaveBeenCalled();
    await f.stop();
    expect(f.remote.listenerCount()).toBe(0);
  });

  it.each(["error", "messageerror"] as const)("propagates %s during disposal and tears down once", async (type) => {
    const f = await mounted();
    f.host.dropTypes.add("dispose");
    const pending = f.app.dispose();
    const rejected = expect(pending).rejects.toMatchObject({ code: "worker-failure", severity: "terminal" });
    f.host.emit(type, {});
    await rejected;
    expect([f.host.terminated, f.host.listenerCount()]).toEqual([1, 0]);
    expect(f.onError).not.toHaveBeenCalled();
    f.host.emit(type, {});
    expect(f.host.terminated).toBe(1);
    await f.stop();
  });

  it("waits for a successful acknowledgement, rejects pending work and disposes once", async () => {
    const cleanup = deferred<void>();
    const f = await mounted({ cleanup: cleanup.promise });
    f.host.dropTypes.add("input");
    const input = f.app.setInput({ pointers: [], keys: [], timestamp: 0 });
    const inputRejected = expect(input).rejects.toMatchObject({ code: "disposed" });
    const first = f.app.dispose(), repeated = f.app.dispose();
    expect(repeated).toBe(first);
    let completed = false;
    void first.then(() => { completed = true; });
    await flush();
    expect(completed).toBe(false);
    expect(f.renderer.whenDisposed).toHaveBeenCalledOnce();
    cleanup.resolve();
    await Promise.all([first, inputRejected]);
    expect([f.host.terminated, f.host.listenerCount(), f.remote.listenerCount()]).toEqual([1, 0, 0]);
    expect(f.renderer.dispose).toHaveBeenCalledOnce();
    await expect(f.app.dispose()).resolves.toBeUndefined();
  });

  it("terminates after the documented timeout and ignores late replies", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const f = await mounted({ timeout: 25 });
    f.host.dropTypes.add("dispose");
    const disposal = f.app.dispose();
    let completed = false;
    void disposal.then(() => { completed = true; }, () => { completed = true; });
    await vi.advanceTimersByTimeAsync(24);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // 5.0: forced termination without a cleanup acknowledgement is reported.
    await expect(disposal).rejects.toMatchObject({ code: "dispose-timeout", severity: "terminal" });
    const request = f.host.sent.find((message) => message.type === "dispose");
    expect(request).toBeDefined();
    f.host.emit("message", { data: { type: "result", id: request!.id } });
    expect([f.host.terminated, f.host.listenerCount()]).toEqual([1, 0]);
    await expect(f.app.dispose()).rejects.toMatchObject({ code: "dispose-timeout" });
    await f.stop();
  });

  it.each([false, true])("shares a concurrent protocol and direct worker stop (cleanup rejects=%s)", async (fails) => {
    const cleanup = deferred<void>();
    const f = await mounted({ cleanup: cleanup.promise });
    const protocolStop = f.app.dispose();
    await flush();
    expect(f.renderer.whenDisposed).toHaveBeenCalledOnce();
    const directStop = f.stop();
    let directSettled = false;
    void directStop.then(() => { directSettled = true; }, () => { directSettled = true; });
    await flush();
    expect(directSettled).toBe(false);
    expect(f.host.terminated).toBe(0);

    if (fails) {
      const protocolRejected = expect(protocolStop).rejects.toMatchObject({ code: "worker-render", message: "Worker renderer cleanup failed." });
      const directRejected = expect(directStop).rejects.toThrow("Worker renderer cleanup failed.");
      cleanup.reject(new Error("deferred cleanup failed"));
      await Promise.all([protocolRejected, directRejected]);
    } else {
      cleanup.resolve();
      await Promise.all([protocolStop, directStop]);
    }
    expect(f.renderer.dispose).toHaveBeenCalledOnce();
    expect(f.renderer.whenDisposed).toHaveBeenCalledOnce();
    expect([f.host.terminated, f.host.listenerCount(), f.remote.listenerCount()]).toEqual([1, 0, 0]);
  });
});
