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
  toDataURL() { return "data:image/png;base64,"; }
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

function makeApp(first: ControlledRenderer, options: { frameMode?: "async" | "sync"; autoStart?: boolean } = {}): AuraApp {
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


function probeAsyncRequired(): Error {
  return new Error("WEBGPU_PROBE_CAPTURE_ASYNC_REQUIRED: configure frameMode as async for probe capture");
}

function counted(value: ControlledRenderer): { sync: number; async: number } {
  const counts = { sync: 0, async: 0 };
  const render = value.render.bind(value);
  const renderAsync = value.renderAsync.bind(value);
  value.render = (time) => { counts.sync += 1; return render(time); };
  value.renderAsync = (time) => { counts.async += 1; return renderAsync(time); };
  return counts;
}

describe("WebGPU probe capture picks asynchronous frames when frameMode is unset", () => {
  it("presents the rejected first frame asynchronously and keeps explicit steps asynchronous", async () => {
    const first = renderer();
    const counts = counted(first);
    first.syncFrames.push(() => { throw probeAsyncRequired(); });
    first.asyncFrames.push(async () => 3);
    const app = makeApp(first);
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    await app.ready();
    await expect(app.readiness({ stage: "first-frame" })).resolves.toMatchObject({ state: "ready", stage: "first-frame" });
    expect(counts).toEqual({ sync: 1, async: 1 });
    expect(seen).toEqual([]);

    first.asyncFrames.push(async () => 4);
    expect(() => app.step(1 / 60)).not.toThrow();
    await ticks();
    expect(counts).toEqual({ sync: 1, async: 2 });
    expect(app.renderTermination!()).toBeUndefined();
  });

  it("switches a running loop after a rejected automatic frame without reporting a failure", async () => {
    const first = renderer();
    const counts = counted(first);
    first.syncFrames.push(() => 0);
    const app = makeApp(first, { autoStart: true });
    await app.ready();
    const seen: AuraRenderTermination[] = [];
    subscribe(app, (event) => seen.push(event));
    app.onFrame(() => {});
    first.syncFrames.push(() => { throw probeAsyncRequired(); });
    frame();
    await ticks();
    expect(counts).toEqual({ sync: 2, async: 1 });
    frame(32);
    await ticks();
    expect(counts).toEqual({ sync: 2, async: 2 });
    expect(seen).toEqual([]);
  });

  it("queues an explicit step asynchronously when the app chose asynchronous frames", async () => {
    const first = renderer();
    const counts = counted(first);
    first.asyncFrames.push(async () => 1);
    const app = makeApp(first, { frameMode: "async" });
    await app.ready();
    expect(counts).toEqual({ sync: 0, async: 1 });
    first.syncFrames.push(() => { throw probeAsyncRequired(); });
    first.asyncFrames.push(async () => 2);
    expect(() => app.step(1 / 60)).not.toThrow();
    await ticks();
    expect(counts).toEqual({ sync: 1, async: 2 });
    expect(app.renderTermination!()).toBeUndefined();
  });

  it("keeps the error when the app chose synchronous frames", async () => {
    const first = renderer();
    first.syncFrames.push(() => 0);
    const app = makeApp(first, { frameMode: "sync" });
    await app.ready();
    first.syncFrames.push(() => { throw probeAsyncRequired(); });
    expect(() => app.step(0)).toThrow(/WEBGPU_PROBE_CAPTURE_ASYNC_REQUIRED/);
  });
  it("screenshotAsync waits for the re-render it queues, so the next step does not find a pending frame", async () => {
    const first = renderer();
    const counts = counted(first);
    first.syncFrames.push(() => { throw probeAsyncRequired(); });
    first.asyncFrames.push(async () => 3);
    const app = makeApp(first);
    await app.ready();
    await app.readiness({ stage: "first-frame" });
    let screenshotFrameDone = false;
    first.asyncFrames.push(async () => { await ticks(); screenshotFrameDone = true; return 4; });
    await app.screenshotAsync!();
    expect(screenshotFrameDone).toBe(true);
    expect(counts).toEqual({ sync: 1, async: 2 });
    first.asyncFrames.push(async () => 5);
    expect(() => app.step(1 / 60)).not.toThrow();
    await ticks();
    expect(counts).toEqual({ sync: 1, async: 3 });
  });
});
