import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuraRenderTermination } from "../../../packages/engine/src/agent-api/nodes/types/runtime";

type ReadyHooks = Parameters<typeof import("../../../packages/engine/src/agent-api/app/frameLoop").startProductionRender>[12];

interface ControlledRenderer {
  readonly backend: "webgl2";
  readonly diagnostics: undefined;
  readonly syncFrames: Array<() => number>;
  readonly asyncFrames: Array<() => Promise<number>>;
  readonly lossListeners: Set<() => void>;
  lost: boolean;
  disposed: boolean;
  render(time?: number): number;
  renderAsync(time?: number): Promise<number>;
  update(time?: number): void;
  deviceLost(): boolean;
  onDeviceLost(listener: () => void): () => void;
  viewProjection(): Float32Array;
  dispose(): void;
  lose(): void;
}

const mocks = vi.hoisted(() => ({
  renderers: [] as ControlledRenderer[],
  hooks: [] as ReadyHooks[]
}));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => {
    const renderer = mocks.renderers.shift();
    if (!renderer) throw new Error("No synthetic renderer was queued");
    return renderer;
  }
}));

// Keep the real frame loop while retaining the mount-scoped callback object so
// a late callback from a superseded renderer can be exercised explicitly.
vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: (...args: Parameters<typeof actual.startProductionRender>) => {
      mocks.hooks.push(args[12]);
      return actual.startProductionRender(...args);
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import type { AuraApp, WebGLRenderController } from "../../../packages/engine/src/agent-api/nodes/types";

class FakeCanvas {
  width = 64;
  height = 64;
  clientWidth = 64;
  clientHeight = 64;
  style = {};
  dataset = {};
  parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function renderer(): ControlledRenderer {
  const value: ControlledRenderer = {
    backend: "webgl2",
    diagnostics: undefined,
    syncFrames: [],
    asyncFrames: [],
    lossListeners: new Set(),
    lost: false,
    disposed: false,
    render() { return value.syncFrames.shift()?.() ?? 0; },
    async renderAsync() { return value.asyncFrames.shift()?.() ?? 0; },
    update() {},
    deviceLost() { return value.lost; },
    onDeviceLost(listener) {
      value.lossListeners.add(listener);
      return () => { value.lossListeners.delete(listener); };
    },
    viewProjection() { return new Float32Array(16); },
    dispose() { value.disposed = true; },
    lose() {
      value.lost = true;
      for (const listener of [...value.lossListeners]) listener();
    }
  };
  return value;
}

const apps: AuraApp[] = [];
const controllers: WebGLRenderController[] = [];
const callbacks = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

function frame(time = 16): void {
  const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!next) throw new Error("No synthetic animation frame is scheduled");
  callbacks.delete(next[0]);
  next[1](time);
}

async function ticks(): Promise<void> {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

function failure(message = "synthetic frame failure"): Error & { code: string } {
  return Object.assign(new Error(message), { code: "TEST_FRAME_FAILURE" });
}

function makeApp(first: ControlledRenderer, options: { frameMode?: "async"; autoStart?: boolean } = {}): AuraApp {
  mocks.renderers.push(first);
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: scene().add(primitives.box({ name: "box" })), resize: false, diagnostics: false,
    autoStart: options.autoStart ?? false, ...(options.frameMode ? { frameMode: options.frameMode } : {})
  });
  apps.push(app);
  return app;
}

function subscribe(app: AuraApp, listener: (event: AuraRenderTermination) => void): () => void {
  if (!app.onRenderTermination || !app.renderTermination) throw new Error("Missing render-termination API");
  return app.onRenderTermination(listener);
}

beforeEach(() => {
  mocks.renderers.length = 0;
  mocks.hooks.length = 0;
  apps.length = 0;
  controllers.length = 0;
  callbacks.clear();
  nextFrame = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 64, innerHeight: 64,
    location: { search: "", href: "https://frame.example.test/" },
    addEventListener() {}, removeEventListener() {}
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { callbacks.delete(id); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const app of apps) app.dispose();
  for (const controller of controllers) controller.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mount-scoped render termination", () => {
  it("reports a later synchronous error after a blank first frame without changing readiness", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    const seen: AuraRenderTermination[] = [];
    const off = subscribe(app, (event) => seen.push(event));
    await app.ready();
    await expect(app.readiness({ stage: "first-frame" })).resolves.toMatchObject({ state: "ready", stage: "first-frame" });
    expect(app.renderTermination!()).toBeUndefined();

    const error = failure("resource https://asset.example.test/file?token=fake-value failed");
    first.syncFrames.push(() => { throw error; });
    expect(() => app.step(0)).toThrow(error);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ state: "failed", revision: 1, code: "TEST_FRAME_FAILURE" });
    if (seen[0]?.state !== "failed") throw new Error("Expected a failed outcome");
    expect(seen[0].message).not.toContain("fake-value");
    expect(app.renderTermination!()).toEqual(seen[0]);
    await expect(app.readiness({ stage: "first-frame" })).resolves.toMatchObject({ state: "ready" });
    off();
  });

  it("reports an initial failure once while preserving non-strict ready and failed readiness", async () => {
    const first = renderer();
    const error = failure();
    first.syncFrames.push(() => { throw error; });
    const app = makeApp(first);
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    await expect(app.ready()).resolves.toBeUndefined();
    await expect(app.readiness({ stage: "first-frame" })).resolves.toMatchObject({ state: "failed", code: "TEST_FRAME_FAILURE" });
    expect(seen).toEqual([expect.objectContaining({ state: "failed", revision: 1, code: "TEST_FRAME_FAILURE" })]);
    expect(app.renderTermination!()).toEqual(seen[0]);
  });

  it("uses the mount fallback when renderer creation fails before frame submission", async () => {
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box()), resize: false, diagnostics: false, autoStart: false
    });
    apps.push(app);
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    await expect(app.ready()).resolves.toBeUndefined();
    expect(seen).toEqual([expect.objectContaining({ state: "failed", revision: 1, code: "renderer-mount-failed" })]);
    expect(app.renderTermination!()).toEqual(seen[0]);
  });

  it("uses a frame-specific fallback code for an uncoded later failure", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    first.syncFrames.push(() => { throw new Error("uncoded failure"); });
    expect(() => app.step(0)).toThrow("uncoded failure");
    expect(app.renderTermination!()).toMatchObject({ state: "failed", code: "render-frame-failed", revision: 1 });
  });

  it("restores the prior running state when a synchronous step fails", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first, { autoStart: true });
    await app.ready();
    expect(app.runtime.paused).toBe(false);
    first.syncFrames.push(() => { throw failure("manual failure"); });
    expect(() => app.step(0)).toThrow("manual failure");
    expect(app.runtime.paused).toBe(false);
  });

  it("reports a later automatic frame failure after a blank initial frame", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first, { autoStart: true });
    await app.ready();
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    app.onFrame(() => {});
    first.syncFrames.push(() => { throw failure("automatic failure"); });
    frame();
    expect(seen).toEqual([expect.objectContaining({ state: "failed", code: "TEST_FRAME_FAILURE", revision: 1 })]);
  });

  it("reports an asynchronous frame rejection after a blank first frame", async () => {
    const first = renderer();
    first.asyncFrames.push(async () => 0);
    const app = makeApp(first, { frameMode: "async" });
    await app.ready();
    const error = failure("async failure");
    first.asyncFrames.push(async () => { throw error; });
    await expect(app.stepAsync(0)).rejects.toBe(error);
    expect(app.renderTermination!()).toMatchObject({ state: "failed", code: "TEST_FRAME_FAILURE", revision: 1 });
  });

  it("does not replay on subscription and reports the current failure via the snapshot", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    first.syncFrames.push(() => { throw failure(); });
    expect(() => app.step(0)).toThrow();
    const listener = vi.fn();
    const off = subscribe(app, listener);
    expect(listener).not.toHaveBeenCalled();
    expect(app.renderTermination!()).toMatchObject({ state: "failed", revision: 1 });
    off();
  });

  it("rearms subscribers after supersession and ignores a late earlier-mount failure", async () => {
    const first = renderer(), second = renderer();
    first.syncFrames.push(() => 0);
    second.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const seen: Array<{ event: AuraRenderTermination; snapshot: AuraRenderTermination | undefined }> = [];
    subscribe(app, (event) => seen.push({ event, snapshot: app.renderTermination!() }));
    mocks.renderers.push(second);
    app.setScene(scene().add(primitives.box({ name: "replacement" })));
    expect(seen).toEqual([{ event: { state: "superseded", revision: 1 }, snapshot: undefined }]);
    await app.ready();
    mocks.hooks[0]?.onTerminalFrameFailure?.(failure("stale"));
    mocks.hooks[0]?.onDeviceLossDetected?.();
    expect(app.renderTermination!()).toBeUndefined();
    expect(seen).toHaveLength(1);
    second.syncFrames.push(() => { throw failure("new mount"); });
    expect(() => app.step(0)).toThrow("new mount");
    expect(seen[1]?.event).toMatchObject({ state: "failed", revision: 2 });
  });

  it("distinguishes device loss and disposal, unsubscribes, and ignores late loss", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    first.lose();
    expect(seen).toEqual([{ state: "device-lost", revision: 1 }]);
    expect(app.renderTermination!()).toEqual({ state: "device-lost", revision: 1 });
    app.dispose();
    expect(seen).toEqual([{ state: "device-lost", revision: 1 }, { state: "disposed", revision: 1 }]);
    expect(app.renderTermination!()).toEqual({ state: "disposed", revision: 1 });
    expect(first.lossListeners.size).toBe(0);
    first.lose();
    expect(seen).toHaveLength(2);
  });

  it("reports a device loss observed by a frame before any loss callback", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    first.lost = true;
    app.step(0);
    expect(seen).toEqual([{ state: "device-lost", revision: 1 }]);
    expect(app.renderTermination!()).toEqual({ state: "device-lost", revision: 1 });
    // A delayed native event for the same loss must not notify twice.
    first.lose();
    expect(seen).toHaveLength(1);
  });

  it("records current-mount loss before a renderer controller is attached", async () => {
    const first = renderer();
    first.lost = true;
    const app = makeApp(first);
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    expect(mocks.hooks).toHaveLength(1);
    mocks.hooks[0]?.onDeviceLossDetected?.();
    expect(seen).toEqual([{ state: "device-lost", revision: 1 }]);
    await app.ready();
    expect(seen).toHaveLength(1);
    expect(app.renderTermination!()).toEqual({ state: "device-lost", revision: 1 });
  });

  it("reports a loss that starts as a later submission returns", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    first.syncFrames.push(() => { first.lost = true; return 0; });
    app.step(0);
    expect(seen).toEqual([{ state: "device-lost", revision: 1 }]);
    expect(app.renderTermination!()).toEqual({ state: "device-lost", revision: 1 });
  });

  it("reports loss observed during an asynchronous submission without a later callback", async () => {
    const first = renderer();
    first.asyncFrames.push(async () => 0);
    const app = makeApp(first, { frameMode: "async" });
    await app.ready();
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    let rejectFrame!: (error: unknown) => void;
    first.asyncFrames.push(() => new Promise<number>((_resolve, reject) => { rejectFrame = reject; }));
    const pending = app.stepAsync(0);
    await ticks();
    first.lost = true;
    rejectFrame(failure("device disappeared"));
    await expect(pending).resolves.toBeUndefined();
    expect(seen).toEqual([{ state: "device-lost", revision: 1 }]);
    expect(app.renderTermination!()).toEqual({ state: "device-lost", revision: 1 });
  });

  it("isolates throwing listeners and supports unsubscription during dispatch", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const later = vi.fn();
    let offLater = () => {};
    subscribe(app, () => { offLater(); throw new Error("observer failure"); });
    offLater = subscribe(app, later);
    const observer = vi.fn();
    subscribe(app, observer);
    const error = failure();
    first.syncFrames.push(() => { throw error; });
    expect(() => app.step(0)).toThrow(error);
    expect(app.renderTermination!()).toMatchObject({ state: "failed", revision: 1 });
    expect(later).not.toHaveBeenCalled();
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({ state: "failed", revision: 1 }));
    app.dispose();
    expect(later).not.toHaveBeenCalled();
    expect(observer).toHaveBeenLastCalledWith({ state: "disposed", revision: 1 });
  });

  it("queues reentrant disposal until the failure reaches every subscriber", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const seen: string[] = [];
    subscribe(app, (event) => {
      seen.push(`first:${event.state}`);
      if (event.state === "failed") app.dispose();
    });
    subscribe(app, (event) => seen.push(`second:${event.state}`));
    first.syncFrames.push(() => { throw failure(); });
    expect(() => app.step(0)).toThrow();
    expect(seen).toEqual(["first:failed", "second:failed", "first:disposed", "second:disposed"]);
    expect(app.renderTermination!()).toEqual({ state: "disposed", revision: 1 });
  });

  it("queues a reentrant replacement and publishes the new mount independently", async () => {
    const first = renderer(), second = renderer();
    first.syncFrames.push(() => 0);
    second.syncFrames.push(() => 0);
    const app = makeApp(first);
    await app.ready();
    const seen: string[] = [];
    subscribe(app, (event) => {
      seen.push(`first:${event.state}:${event.revision}`);
      if (event.state === "failed" && event.revision === 1) {
        mocks.renderers.push(second);
        app.setScene(scene().add(primitives.box({ name: "replacement" })));
      }
    });
    subscribe(app, (event) => seen.push(`second:${event.state}:${event.revision}`));
    first.syncFrames.push(() => { throw failure("old failure"); });
    expect(() => app.step(0)).toThrow("old failure");
    expect(seen).toEqual(["first:failed:1", "second:failed:1", "first:superseded:1", "second:superseded:1"]);
    await app.ready();
    expect(app.renderTermination!()).toBeUndefined();
    second.syncFrames.push(() => { throw failure("new failure"); });
    expect(() => app.step(0)).toThrow("new failure");
    expect(app.renderTermination!()).toMatchObject({ state: "failed", revision: 2 });
  });
});

describe("frame-loop callback boundaries", () => {
  it("does not report a first presentation if loss begins between frame checks", async () => {
    const first = renderer();
    const observedLoss = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    first.deviceLost = observedLoss;
    mocks.renderers.push(first);
    const snapshot = scene().add(primitives.box()).toJSON();
    const onFirstFrame = vi.fn(), onDeviceLossDetected = vi.fn(), onTerminalFrameFailure = vi.fn();
    const controller = await startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { autoStart: false, resize: false },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { onRendererReady() {}, onFirstFrame, onDeviceLossDetected, onTerminalFrameFailure });
    controllers.push(controller);
    expect(onFirstFrame).not.toHaveBeenCalled();
    expect(onTerminalFrameFailure).not.toHaveBeenCalled();
    expect(onDeviceLossDetected).toHaveBeenCalledTimes(1);
  });

  it("suppresses a stale asynchronous frame failure after cancellation", async () => {
    const first = renderer();
    first.asyncFrames.push(async () => 0);
    mocks.renderers.push(first);
    const snapshot = scene().add(primitives.box()).toJSON();
    let cancelled = false;
    const onFirstFrame = vi.fn(), onFirstFrameFailed = vi.fn(), onTerminalFrameFailure = vi.fn();
    const controller = await startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { autoStart: false, resize: false, frameMode: "async" },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => cancelled,
      { onRendererReady() {}, onFirstFrame, onFirstFrameFailed, onTerminalFrameFailure });
    controllers.push(controller);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);

    let rejectFrame!: (error: unknown) => void;
    first.asyncFrames.push(() => new Promise<number>((_resolve, reject) => { rejectFrame = reject; }));
    const pending = controller.renderAsync!(() => 1);
    await ticks();
    cancelled = true;
    rejectFrame(failure("stale"));
    await expect(pending).rejects.toThrow("stale");
    expect(onTerminalFrameFailure).not.toHaveBeenCalled();
    expect(onFirstFrameFailed).not.toHaveBeenCalled();
  });

  it("suppresses an asynchronous frame failure after disposal", async () => {
    const first = renderer();
    first.asyncFrames.push(async () => 0);
    mocks.renderers.push(first);
    const snapshot = scene().add(primitives.box()).toJSON();
    const onTerminalFrameFailure = vi.fn();
    const controller = await startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { autoStart: false, resize: false, frameMode: "async" },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { onRendererReady() {}, onFirstFrame() {}, onTerminalFrameFailure });
    controllers.push(controller);
    let rejectFrame!: (error: unknown) => void;
    first.asyncFrames.push(() => new Promise<number>((_resolve, reject) => { rejectFrame = reject; }));
    const pending = controller.renderAsync!(() => 1);
    await ticks();
    controller.dispose();
    rejectFrame(failure("disposed frame"));
    await expect(pending).rejects.toThrow("disposed frame");
    await controller.whenIdle?.();
    expect(onTerminalFrameFailure).not.toHaveBeenCalled();
  });

  it("classifies a first-frame failure as loss if its observer triggers device loss", async () => {
    const first = renderer();
    const error = failure("first frame");
    first.syncFrames.push(() => { throw error; });
    mocks.renderers.push(first);
    const snapshot = scene().add(primitives.box()).toJSON();
    const onFirstFrameFailed = vi.fn(() => { first.lost = true; });
    const onDeviceLossDetected = vi.fn(), onTerminalFrameFailure = vi.fn();
    const pending = startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { autoStart: false, resize: false },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { onRendererReady() {}, onFirstFrame() {}, onFirstFrameFailed, onDeviceLossDetected, onTerminalFrameFailure });
    await expect(pending).rejects.toBe(error);
    expect(onFirstFrameFailed).toHaveBeenCalledTimes(1);
    expect(onDeviceLossDetected).toHaveBeenCalledTimes(1);
    expect(onTerminalFrameFailure).not.toHaveBeenCalled();
  });

  it("does not let a throwing terminal observer replace the original manual frame error", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    mocks.renderers.push(first);
    const snapshot = scene().add(primitives.box()).toJSON();
    const controller = await startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { autoStart: false, resize: false },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { onRendererReady() {}, onFirstFrame() {}, onTerminalFrameFailure() { throw new Error("observer failure"); } });
    controllers.push(controller);
    const error = failure("original failure");
    first.syncFrames.push(() => { throw error; });
    expect(() => controller.render()).toThrow(error);
  });
});
