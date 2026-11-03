import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import { MAX_WORKER_KEY_EVENTS } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerInput, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

class Target {
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, values: Record<string, unknown> = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...values, type });
  }
  count(): number {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

class Port extends Target {
  peer?: Port;
  readonly sent: Array<AuraWorkerRequest | AuraWorkerResponse> = [];
  readonly dropped = new Set<string>();
  terminated = 0;
  postMessage(message: AuraWorkerRequest | AuraWorkerResponse): void {
    this.sent.push(message);
    if (this.dropped.has(message.type)) return;
    queueMicrotask(() => {
      if (!this.terminated) this.peer?.emit("message", { data: message });
    });
  }
  terminate(): void { this.terminated += 1; }
}

class Canvas extends Target {
  width = 8;
  height = 4;
  readonly capture = vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  readonly offscreen = {
    width: this.width,
    height: this.height,
    convertToBlob: this.capture
  };
  transferControlToOffscreen(): OffscreenCanvas { return this.offscreen as unknown as OffscreenCanvas; }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, width: 8, height: 4 } as DOMRect; }
}

const scene = (): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000",
  nodes: [{ kind: "primitive", name: "worker-root" }],
  camera: {},
  diagnostics: { enabled: false }
}) as unknown as AuraSceneSnapshot;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

function clock() {
  let next = 0;
  const callbacks = new Map<number, (time: number) => void>();
  vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
    const id = ++next;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { callbacks.delete(id); });
  return {
    callbacks,
    tick(time: number) {
      const entry = callbacks.entries().next().value as [number, (time: number) => void] | undefined;
      if (!entry) throw new Error("No worker frame is scheduled.");
      callbacks.delete(entry[0]);
      entry[1](time);
    }
  };
}

function fixture(options: { autoStart?: boolean; bridgeEvents?: boolean; timeout?: number; onInput?: (input: any) => void; onDevice?: (state: "lost" | "restored") => void } = {}) {
  const host = new Port();
  const remote = new Port();
  host.peer = remote;
  remote.peer = host;
  const canvas = new Canvas();
  const frames: Array<{ input?: AuraWorkerInput }> = [];
  let lost = false;
  let onLost = (): void => {};
  let onRestored = (): void => {};
  const render = vi.fn((_time: number) => 3);
  const renderer = {
    backend: "webgl2",
    diagnostics: {},
    render,
    resize: vi.fn(),
    resetTemporalHistory: vi.fn(),
    viewProjection: () => new Float32Array(16),
    onDeviceLost: (listener: () => void) => { onLost = listener; return () => { onLost = () => {}; }; },
    onDeviceRestored: (listener: () => void) => { onRestored = listener; return () => { onRestored = () => {}; }; },
    deviceLost: () => lost,
    dispose: vi.fn()
  } as unknown as WebGLSceneRenderer;
  const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
    createRenderer: async () => renderer,
    onFrame: (frame) => { frames.push(frame); }
  });
  const app = createWorkerRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    worker: host as unknown as AuraWorkerHostEndpoint,
    scene: scene(),
    autoStart: options.autoStart ?? false,
    bridgeEvents: options.bridgeEvents ?? false,
    disposeTimeoutMs: options.timeout ?? 5000,
    onInput: options.onInput,
    onDevice: options.onDevice
  } as Parameters<typeof createWorkerRenderer>[0] & { onInput?: (input: any) => void });
  return {
    app, host, remote, canvas, renderer, render, frames, stop,
    lose: () => { lost = true; onLost(); },
    restore: () => { lost = false; onRestored(); }
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("worker-backed root-app integration contracts", () => {
  it("reports the actual backend after the initial mount and each successful replacement", async () => {
    const f = fixture();
    expect(f.app.backend).toBeUndefined();
    await f.app.ready;
    expect(f.app.backend).toBe("webgl2");
    Object.assign(f.renderer, { backend: "webgpu" });
    await f.app.setScene(scene());
    expect(f.app.backend).toBe("webgpu");
    await f.app.dispose();
  });

  it("captures the current worker frame as a PNG without advancing simulation", async () => {
    const f = fixture();
    await f.app.ready;
    await f.app.step(0.25, 1000);
    const image = await f.app.screenshotAsync();
    expect(image).toEqual({ mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw==", width: 8, height: 4 });
    expect(f.render.mock.calls.map(([time]) => time)).toEqual([1000, 1000]);
    expect(f.canvas.capture).toHaveBeenCalledOnce();
    expect(f.frames).toHaveLength(1);
    await f.app.dispose();
  });

  it("waits for an in-flight async frame before capturing and never overlaps renderer submissions", async () => {
    const hold = deferred<number>();
    const f = fixture();
    const renderAsync = vi.fn().mockImplementationOnce(() => hold.promise).mockResolvedValue(4);
    Object.assign(f.renderer, { renderAsync });
    await f.app.ready;
    const step = f.app.step(0.1, 400);
    await flush();
    const screenshot = f.app.screenshotAsync();
    await flush();
    expect(renderAsync).toHaveBeenCalledTimes(1);
    expect(f.canvas.capture).not.toHaveBeenCalled();
    hold.resolve(2);
    await step;
    await expect(screenshot).resolves.toMatchObject({ width: 8, height: 4, dataUrl: "data:image/png;base64,iVBORw==" });
    expect(renderAsync.mock.calls.map(([time]) => time)).toEqual([400, 400]);
    expect(f.frames).toHaveLength(1);
    await f.app.dispose();
  });

  it("captures the latest hidden resize and keeps a failed PNG conversion recoverable", async () => {
    const f = fixture();
    await f.app.ready;
    await f.app.setVisible(false);
    await f.app.resize({ width: 6, height: 3, pixelRatio: 2 });
    f.canvas.capture.mockRejectedValueOnce(new Error("private encoder detail"));
    await expect(f.app.screenshotAsync()).rejects.toMatchObject({ code: "screenshot-failed", severity: "recoverable" });
    expect(f.frames).toHaveLength(0);
    await expect(f.app.screenshotAsync()).resolves.toMatchObject({ width: 12, height: 6 });
    expect(await f.app.step(0, 9)).toMatchObject({ width: 12, height: 6 });
    await f.app.dispose();
  });

  it("rejects a capture if the device is lost before encoding completes", async () => {
    const f = fixture();
    const image = deferred<Blob>();
    f.canvas.capture.mockImplementationOnce(() => image.promise);
    await f.app.ready;
    const capture = f.app.screenshotAsync();
    await flush();
    expect(f.canvas.capture).toHaveBeenCalledOnce();
    f.lose();
    image.resolve(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    await expect(capture).rejects.toMatchObject({ code: "device-lost", severity: "recoverable" });
    f.restore();
    expect((await f.app.step(0)).drawCalls).toBe(3);
    await f.app.dispose();
  });

  it("pauses live frames independently of visibility and preserves explicit manual steps", async () => {
    const timer = clock();
    const f = fixture({ autoStart: true });
    await f.app.ready;
    expect(timer.callbacks.size).toBe(1);
    await f.app.pause();
    expect(timer.callbacks.size).toBe(0);
    await f.app.step(2, 2000);
    expect(f.render).toHaveBeenCalledExactlyOnceWith(2000);
    await f.app.setVisible(false);
    await f.app.resume();
    expect(timer.callbacks.size).toBe(0);
    await f.app.setVisible(true);
    await flush();
    expect(timer.callbacks.size).toBe(1);
    timer.tick(3000);
    await flush();
    expect(f.render).toHaveBeenLastCalledWith(3000);
    await f.app.pause();
    f.lose();
    f.restore();
    await flush();
    expect(timer.callbacks.size).toBe(0);
    await f.app.dispose();
    expect(timer.callbacks.size).toBe(0);
  });

  it("does not report recovery or resume frames while the replacement device is still lost", async () => {
    const timer = clock();
    const devices: string[] = [];
    const f = fixture({ autoStart: true, onDevice: (state) => { devices.push(state); } });
    await f.app.ready;
    f.lose();
    await flush();
    await expect(f.app.recover()).rejects.toMatchObject({ code: "device-lost", severity: "recoverable" });
    await flush();
    expect(devices).toEqual(["lost"]);
    expect(timer.callbacks.size).toBe(0);
    f.restore();
    await flush();
    expect(devices).toEqual(["lost", "restored"]);
    expect(timer.callbacks.size).toBe(1);
    await f.app.dispose();
  });

  it("retains fast keyboard edges and exposes an independent snapshot to the root owner", async () => {
    const page = new Target();
    vi.stubGlobal("window", page);
    const observed: any[] = [];
    const f = fixture({ bridgeEvents: true, onInput: (input) => {
      observed.push(structuredClone(input));
      input.keys.push("mutated-by-host");
    } });
    await f.app.ready;
    page.emit("keydown", { code: "Space", timeStamp: 10, repeat: false });
    page.emit("keyup", { code: "Space", timeStamp: 11, repeat: false });
    await flush();
    await f.app.step(0, 12);
    expect(observed.at(-1)).toMatchObject({
      keys: [],
      keyEvents: [
        { phase: "down", code: "Space", timestamp: 10, repeat: false },
        { phase: "up", code: "Space", timestamp: 11, repeat: false }
      ]
    });
    expect(f.frames.at(-1)?.input).toMatchObject({ keys: [], keyEvents: observed.at(-1).keyEvents });
    await f.app.step(0, 13);
    expect((f.frames.at(-1)?.input as any).keyEvents ?? []).toEqual([]);
    await f.app.dispose();
    expect([page.count(), f.canvas.count(), f.host.count(), f.remote.count()]).toEqual([0, 0, 0, 0]);
  });

  it("reconciles overflowing keyboard transitions and delivers later edges once", async () => {
    const f = fixture();
    await f.app.ready;
    const samples = Array.from({ length: MAX_WORKER_KEY_EVENTS + 1 }, (_, index) => ({
      phase: index % 2 === 0 ? "down" as const : "up" as const,
      code: "KeyA",
      timestamp: index,
      repeat: false
    }));
    await f.app.setInput({ pointers: [], keys: ["KeyA"], timestamp: 1, keyEvents: samples.slice(0, 65) });
    await f.app.setInput({ pointers: [], keys: [], timestamp: 2, keyEvents: samples.slice(65) });
    await f.app.step(0);
    expect(f.frames.at(-1)?.input).toMatchObject({ keys: [], keyEvents: [], keyEventsOverflow: true });
    await f.app.setInput({ pointers: [], keys: ["KeyB"], timestamp: 3, keyEvents: [{ phase: "down", code: "KeyB", timestamp: 3, repeat: false }] });
    await f.app.step(0);
    expect(f.frames.at(-1)?.input).toMatchObject({ keys: ["KeyB"], keyEvents: [{ phase: "down", code: "KeyB" }] });
    expect(f.frames.at(-1)?.input?.keyEventsOverflow).toBeUndefined();
    await f.app.dispose();
  });

  it("releases every held key on focus loss without inventing another press", async () => {
    const page = new Target();
    vi.stubGlobal("window", page);
    const f = fixture({ bridgeEvents: true });
    await f.app.ready;
    page.emit("keydown", { code: "KeyA", timeStamp: 10 });
    page.emit("keydown", { code: "KeyB", timeStamp: 11 });
    await flush();
    page.emit("blur");
    await flush();
    await f.app.step(0);
    expect(f.frames.at(-1)?.input).toMatchObject({
      keys: [],
      keyEvents: [
        { phase: "down", code: "KeyA" },
        { phase: "down", code: "KeyB" },
        { phase: "up", code: "KeyA", reason: "blur" },
        { phase: "up", code: "KeyB", reason: "blur" }
      ]
    });
    await f.app.dispose();
  });

  it("reports unacknowledged teardown to strict root disposal while retaining legacy dispose semantics", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const f = fixture({ timeout: 25 });
    await f.app.ready;
    f.host.dropped.add("dispose");
    const strict = f.app.disposeStrict();
    const rejected = expect(strict).rejects.toMatchObject({ code: "dispose-timeout", severity: "terminal" });
    const legacy = f.app.dispose();
    await vi.advanceTimersByTimeAsync(25);
    await Promise.all([rejected, expect(legacy).resolves.toBeUndefined()]);
    expect(f.host.terminated).toBe(1);
    expect(f.host.count()).toBe(0);
    await f.stop();
  });

  it("reports a host listener-removal failure while still releasing the other listeners", async () => {
    const page = new Target();
    vi.stubGlobal("window", page);
    const f = fixture({ bridgeEvents: true });
    await f.app.ready;
    const remove = f.canvas.removeEventListener.bind(f.canvas);
    f.canvas.removeEventListener = (type, listener) => {
      if (type === "pointerdown") throw new Error("removal failed");
      remove(type, listener);
    };
    await expect(f.app.disposeStrict()).rejects.toMatchObject({ code: "worker-cleanup-failed" });
    expect(page.count()).toBe(0);
    expect(f.host.count()).toBe(0);
    expect(f.canvas.count()).toBe(1);
    expect(f.host.terminated).toBe(1);
  });
});
