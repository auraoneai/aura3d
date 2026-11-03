import { afterEach, describe, expect, it, vi } from "vitest";
import { installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

const snapshot = (name: string): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000",
  nodes: [{ kind: "primitive", name }],
  camera: {},
  diagnostics: { enabled: false }
}) as unknown as AuraSceneSnapshot;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Direct worker endpoint, so cancellation of recovery is exercised too. */
class Endpoint implements AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse> {
  readonly messages: AuraWorkerResponse[] = [];
  private readonly listeners = new Set<(event: MessageEvent<AuraWorkerRequest>) => void>();
  private readonly waiters = new Map<number, (message: AuraWorkerResponse) => void>();

  postMessage(message: AuraWorkerResponse): void {
    this.messages.push(message);
    if (message.id !== 0) {
      this.waiters.get(message.id)?.(message);
      this.waiters.delete(message.id);
    }
  }

  addEventListener(_type: "message", listener: (event: MessageEvent<AuraWorkerRequest>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent<AuraWorkerRequest>) => void): void {
    this.listeners.delete(listener);
  }

  emit(message: AuraWorkerRequest): void {
    for (const listener of [...this.listeners]) listener({ data: message } as MessageEvent<AuraWorkerRequest>);
  }

  response(id: number): Promise<AuraWorkerResponse> {
    const existing = this.messages.find((message) => message.id === id);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => { this.waiters.set(id, resolve); });
  }
}

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

function fixture() {
  const callbacks = new Map<number, (time: number) => void>();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
    const id = ++nextFrame;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { callbacks.delete(id); });
  const endpoint = new Endpoint();
  const started = deferred<void>();
  const release = deferred<void>();
  let lost = false;
  let onLost = (): void => {};
  let onRestored = (): void => {};
  let automaticFrames = 0;
  const dispose = vi.fn();
  const render = vi.fn((_time: number) => 3);
  const resetTemporalHistory = vi.fn();
  const renderer = {
    backend: "webgl2",
    diagnostics: {},
    render,
    dispose,
    resetTemporalHistory,
    viewProjection: () => new Float32Array(16),
    deviceLost: () => lost,
    onDeviceLost: (listener: () => void) => { onLost = listener; return () => { onLost = () => {}; }; },
    onDeviceRestored: (listener: () => void) => { onRestored = listener; return () => { onRestored = () => {}; }; }
  } as unknown as WebGLSceneRenderer;
  const createRenderer = vi.fn(async () => renderer);
  const stop = installWorkerRenderer(endpoint, {
    createRenderer,
    onFrame: async (frame) => {
      if (frame.source === "automatic" && automaticFrames++ === 0) {
        started.resolve();
        await release.promise;
      }
    }
  });
  const init = (): void => endpoint.emit({
    type: "init", id: 1,
    canvas: { width: 8, height: 8 } as OffscreenCanvas,
    scene: snapshot("old"),
    size: { width: 8, height: 8, pixelRatio: 1 },
    autoStart: true
  });
  const triggerFrame = (time: number): void => {
    const entry = callbacks.entries().next().value as [number, (time: number) => void] | undefined;
    if (!entry) throw new Error("Expected an automatic worker frame to be scheduled.");
    callbacks.delete(entry[0]);
    entry[1](time);
  };
  return {
    endpoint, callbacks, started, release, dispose, render, resetTemporalHistory, createRenderer, stop, init, triggerFrame,
    lose: () => { lost = true; onLost(); },
    restore: () => { lost = false; onRestored(); }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("worker cancellation before renderer replacement", () => {
  it("does not retire the current scene when cancellation arrives while waiting for a frame", async () => {
    const f = fixture();
    f.init();
    expect(await f.endpoint.response(1)).toMatchObject({ type: "result", id: 1 });
    f.triggerFrame(16);
    await f.started.promise;

    f.endpoint.emit({ type: "scene", id: 2, scene: snapshot("replacement") });
    await flushMicrotasks();
    expect(f.createRenderer).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    f.endpoint.emit({ type: "cancel", id: 3, targetId: 2 });
    expect(await f.endpoint.response(3)).toMatchObject({ type: "result", id: 3 });
    f.release.resolve();
    expect(await f.endpoint.response(2)).toMatchObject({ type: "error", id: 2, code: "cancelled", severity: "recoverable" });
    await flushMicrotasks();

    expect(f.createRenderer).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    expect(f.callbacks.size).toBe(1);
    f.endpoint.emit({ type: "frame", id: 4, deltaSeconds: 0, time: 20 });
    expect(await f.endpoint.response(4)).toMatchObject({ type: "result", id: 4, result: { drawCalls: 3, time: 20 } });
    expect(f.render).toHaveBeenCalledWith(20);
    await f.stop();
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("cancels recovery before remount without a false restoration (device lost=%s)", async (initiallyLost) => {
    const f = fixture();
    f.init();
    expect(await f.endpoint.response(1)).toMatchObject({ type: "result", id: 1 });
    f.triggerFrame(16);
    await f.started.promise;
    if (initiallyLost) f.lose();

    f.endpoint.emit({ type: "recover", id: 2 });
    await flushMicrotasks();
    expect(f.createRenderer).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    f.endpoint.emit({ type: "cancel", id: 3, targetId: 2 });
    expect(await f.endpoint.response(3)).toMatchObject({ type: "result", id: 3 });
    f.release.resolve();
    expect(await f.endpoint.response(2)).toMatchObject({ type: "error", id: 2, code: "cancelled", severity: "recoverable" });
    await flushMicrotasks();

    expect(f.createRenderer).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    expect(f.endpoint.messages.filter((message) => message.type === "device" && message.state === "restored")).toEqual([]);
    expect(f.resetTemporalHistory).not.toHaveBeenCalledWith("device-restored");
    expect(f.callbacks.size).toBe(initiallyLost ? 0 : 1);
    if (initiallyLost) f.restore();
    f.endpoint.emit({ type: "frame", id: 4, deltaSeconds: 0, time: 20 });
    expect(await f.endpoint.response(4)).toMatchObject({ type: "result", id: 4, result: { drawCalls: 3, time: 20 } });
    expect(f.render).toHaveBeenCalledWith(20);
    await f.stop();
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });
});
