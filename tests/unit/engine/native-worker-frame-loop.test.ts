import { afterEach, describe, expect, it, vi } from "vitest";
import { configureCanvas, resizeOffscreenCanvas, resolveCanvas } from "../../../packages/engine/src/agent-api/app/canvas";
import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createWorkerFrameScheduler, type WorkerScheduledFrame } from "../../../packages/engine/src/agent-api/app/workerFrameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";

const rendererState = vi.hoisted(() => ({ renderer: undefined as unknown }));
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => rendererState.renderer
}));

afterEach(() => vi.unstubAllGlobals());

function clock() {
  let next = 1;
  const pending = new Map<number, (time: number) => void>();
  const cancelled: Array<(time: number) => void> = [];
  return {
    requestFrame(callback: (time: number) => void) { const id = next++; pending.set(id, callback); return id; },
    cancelFrame(id: number) { const callback = pending.get(id); if (callback) cancelled.push(callback); pending.delete(id); },
    tick(time: number) { const entry = pending.entries().next().value; if (!entry) throw new Error("no scheduled frame"); pending.delete(entry[0]); entry[1](time); },
    invokeCancelled(time: number) { cancelled.forEach((callback) => callback(time)); },
    count: () => pending.size
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe("worker canvas and frame scheduling", () => {
  it("recognizes a transferred canvas without DOM globals and sizes its backing store only once", () => {
    class FakeOffscreenCanvas { constructor(public width: number, public height: number) {} }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const offscreen = new FakeOffscreenCanvas(300, 150) as unknown as OffscreenCanvas;
    expect(resolveCanvas(offscreen)).toBe(offscreen);
    configureCanvas(offscreen, 2, true);
    expect([offscreen.width, offscreen.height]).toEqual([300, 150]);
    expect(resizeOffscreenCanvas(offscreen, { width: 100.25, height: 50, pixelRatio: 2 })).toEqual({ width: 201, height: 100 });
    expect([offscreen.width, offscreen.height]).toEqual([201, 100]);
    expect(() => resizeOffscreenCanvas(offscreen, { width: 1, height: 0, pixelRatio: 1 })).toThrow(RangeError);
    expect(() => resolveCanvas("#missing")).toThrow(/document is unavailable/);
  });

  it("coalesces hidden resize and input, resets history, bounds live catch-up and keeps manual steps exact", async () => {
    const timer = clock();
    const events: string[] = [];
    const frames: WorkerScheduledFrame<{ x: number }>[] = [];
    const scheduler = createWorkerFrameScheduler<{ x: number }>({
      ...timer,
      onFrame(frame) { frames.push(frame); events.push(`frame:${frame.source}`); },
      applyResize(size) { events.push(`resize:${size.width}x${size.height}@${size.pixelRatio}`); },
      resetHistory(reason) { events.push(`history:${reason}`); }
    });
    scheduler.start();
    scheduler.setInput({ x: 1 });
    timer.tick(100);
    await scheduler.whenIdle(); await flush();
    timer.tick(5100);
    await scheduler.whenIdle(); await flush();
    expect(frames.map((frame) => frame.deltaSeconds)).toEqual([0, 0.1]);
    scheduler.setVisible(false);
    expect(timer.count()).toBe(0);
    await scheduler.resize({ width: 100, height: 50, pixelRatio: 1 });
    await scheduler.resize({ width: 200, height: 80, pixelRatio: 2 });
    scheduler.setInput({ x: 3 });
    expect(events.some((entry) => entry.startsWith("resize:"))).toBe(false);
    await scheduler.step(3.5);
    expect(frames.at(-1)).toMatchObject({ source: "manual", deltaSeconds: 3.5, input: { x: 3 } });
    expect(events.slice(-4)).toEqual(["resize:200x80@2", "history:resize", "history:resume", "frame:manual"]);
    scheduler.setVisible(true);
    await scheduler.whenIdle(); await flush();
    timer.tick(100000);
    await scheduler.whenIdle(); await flush();
    expect(frames.at(-1)).toMatchObject({ source: "automatic", deltaSeconds: 0, input: { x: 3 } });
    await scheduler.dispose();
    expect(timer.count()).toBe(0);
  });

  it("serializes visible resizes with an active frame and exposes recoverable and terminal failures", async () => {
    const timer = clock();
    const events: string[] = [];
    const failures: string[] = [];
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let frames = 0;
    const scheduler = createWorkerFrameScheduler({
      ...timer,
      async onFrame() { frames += 1; events.push(`start:${frames}`); if (frames === 1) await hold; if (frames === 2) throw new Error("lost"); if (frames === 3) throw new Error("broken"); events.push(`end:${frames}`); },
      applyResize(size) { events.push(`resize:${size.width}`); },
      resetHistory(reason) { events.push(`history:${reason}`); },
      classifyError(error) { return (error as Error).message === "lost" ? "recoverable" : "terminal"; },
      onError(error, kind) { failures.push(`${kind}:${(error as Error).message}`); }
    });
    scheduler.start();
    timer.tick(1);
    await flush();
    const resizing = scheduler.resize({ width: 32, height: 20, pixelRatio: 1 });
    await flush();
    expect(events).toEqual(["start:1"]);
    release();
    await resizing; await flush();
    expect(events).toEqual(["start:1", "end:1", "resize:32", "history:resize"]);
    timer.tick(2);
    await scheduler.whenIdle(); await flush();
    expect(failures).toEqual(["recoverable:lost"]);
    expect(timer.count()).toBe(1);
    timer.tick(3);
    await scheduler.whenIdle(); await flush();
    expect(failures).toEqual(["recoverable:lost", "terminal:broken"]);
    expect(scheduler.status().terminal).toBe(true);
    expect(timer.count()).toBe(0);
    await scheduler.dispose();
  });

  it("resets history when resuming after an initial paused manual frame", async () => {
    const timer = clock();
    const events: string[] = [];
    const scheduler = createWorkerFrameScheduler({
      ...timer,
      onFrame(frame) { events.push(`frame:${frame.source}`); },
      applyResize() {},
      resetHistory(reason) { events.push(`history:${reason}`); }
    });
    await scheduler.step(0.25);
    scheduler.resume();
    timer.tick(1000);
    await scheduler.whenIdle();
    expect(events).toEqual(["frame:manual", "history:resume", "frame:automatic"]);
    await scheduler.dispose();
    expect(timer.count()).toBe(0);
  });

  it("waits for in-flight work, suppresses later callbacks, and disposes idempotently", async () => {
    const timer = clock();
    const onError = vi.fn();
    let finish!: () => void;
    const hold = new Promise<void>((resolve) => { finish = resolve; });
    const onFrame = vi.fn(async () => { await hold; throw new Error("late"); });
    const scheduler = createWorkerFrameScheduler({ ...timer, onFrame, onError, applyResize() {}, resetHistory() {} });
    scheduler.start();
    timer.tick(1);
    await flush();
    let disposed = false;
    const closing = scheduler.dispose().then(() => { disposed = true; });
    await flush();
    expect(disposed).toBe(false);
    finish();
    await closing;
    timer.invokeCancelled(100);
    await scheduler.dispose();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(scheduler.status().disposed).toBe(true);
    expect(timer.count()).toBe(0);
  });

  it("publishes the controller before an asynchronous first frame and signals only actual presentation", async () => {
    const snapshot = scene().add(primitives.box({ name: "box", size: 1 })).toJSON();
    const canvas = { width: 64, height: 64, style: {}, dataset: {}, parentElement: null, clientWidth: 64, clientHeight: 64, getBoundingClientRect: () => ({ width: 64, height: 64 }), getContext: () => null } as unknown as HTMLCanvasElement;
    let finish!: (drawCalls: number) => void;
    let hasLost = false;
    const pending = new Promise<number>((resolve) => { finish = resolve; });
    const dispose = vi.fn();
    const renderAsync = vi.fn(() => pending);
    rendererState.renderer = { backend: "webgl2", diagnostics: undefined, render: () => 2, renderAsync, deviceLost: () => hasLost, viewProjection: () => new Float32Array(16), dispose };
    const firstFrame = vi.fn();
    const firstFrameFailed = vi.fn();
    let ready!: (controller: { dispose(): void }) => void;
    const controllerReady = new Promise<{ dispose(): void }>((resolve) => { ready = resolve; });
    const mount = startProductionRender(canvas, snapshot, createInitialDiagnostics(snapshot, undefined), { scene: snapshot, autoStart: false, resize: false, frameMode: "async" }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
      onRendererReady(backend, controller) { expect(backend).toBe("webgl2"); ready(controller); },
      onFirstFrame: firstFrame,
      onFirstFrameFailed: firstFrameFailed
    });
    await Promise.race([controllerReady, mount.then(() => { throw new Error("mount completed before the ready callback"); })]);
    expect(firstFrame).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(renderAsync).toHaveBeenCalledOnce(), { timeout: 1000 });
    hasLost = true;
    finish(2);
    const controller = await mount;
    expect(firstFrame).not.toHaveBeenCalled();
    hasLost = false;
    controller.render(200);
    expect(firstFrame).toHaveBeenCalledExactlyOnceWith("webgl2");
    expect(firstFrameFailed).not.toHaveBeenCalled();
    controller.dispose();
    controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  }, 20_000);
});
