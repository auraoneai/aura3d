import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the public app and its real frame loop with a browser-shaped XR
// session and a recording renderer. No browser, GPU, or headset is involved.
const recording = vi.hoisted(() => ({
  renderers: [] as { times: number[]; eyes: (string | undefined)[]; disposed: boolean }[],
  onEye: undefined as ((eye: string | undefined) => void) | undefined,
  device: {
    setExternalFramebuffer: vi.fn(),
    setViewport: vi.fn(),
    resetViewport: vi.fn()
  },
  gl: { makeXRCompatible: vi.fn(async () => undefined) }
}));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/mountRenderer")>();
  return {
    ...actual,
    createProductionSceneRenderer: async (canvas: HTMLCanvasElement) => {
      const record = { times: [] as number[], eyes: [] as (string | undefined)[], disposed: false };
      recording.renderers.push(record);
      return {
        backend: "production-runtime",
        diagnostics: undefined,
        auraRenderer: { device: recording.device },
        render(time: number) {
          if (record.disposed) throw new Error("rendered a disposed renderer");
          record.times.push(time);
          const eye = getXRViewCamera(canvas)?.eye;
          record.eyes.push(eye);
          recording.onEye?.(eye);
          return 1;
        },
        update() {},
        resize() {},
        viewProjection: () => new Float32Array(16),
        deviceLost: () => false,
        dispose() { record.disposed = true; }
      };
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";
import { createAuraXRRuntime } from "../../../packages/engine/src/agent-api/xr/xrRuntime";
import { getXRViewCamera } from "../../../packages/engine/src/agent-api/xr/xrViewOverride";
import type { A3DXREventLike, A3DXRFrameLike } from "../../../packages/input/src/WebXRSessionController";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const view = (eye: "left" | "right") => ({ eye, projectionMatrix: identity, transform: { matrix: identity, inverse: { matrix: identity } } });

class FakeSession {
  private readonly listeners = new Map<string, Set<(event: A3DXREventLike) => void>>();
  private callback?: (time: number, frame: A3DXRFrameLike) => void;
  readonly inputSources = [];
  readonly end = vi.fn(async () => {
    for (const listener of [...(this.listeners.get("end") ?? [])]) listener({});
  });
  readonly cancelAnimationFrame = vi.fn();
  requestReferenceSpace = async () => ({});
  updateRenderState = async () => {};
  requestAnimationFrame(callback: (time: number, frame: A3DXRFrameLike) => void) { this.callback = callback; return 1; }
  addEventListener(type: string, listener: (event: A3DXREventLike) => void) { this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener)); }
  removeEventListener(type: string, listener: (event: A3DXREventLike) => void) { this.listeners.get(type)?.delete(listener); }
  tick(time: number, tracked = true) {
    if (!this.callback) throw new Error("XR frame was not scheduled");
    this.callback(time, { getViewerPose: () => tracked ? { views: [view("left"), view("right")] } : null });
  }
}

class FakeLayer {
  readonly framebuffer = {};
  readonly framebufferWidth = 200;
  readonly framebufferHeight = 100;
  getViewport(eye: { eye?: string }) { return { x: eye.eye === "left" ? 0 : 100, y: 0, width: 100, height: 100 }; }
}

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = { width: "64px", height: "64px" };
  dataset: Record<string, string> = {};
  parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return recording.gl; }
  addEventListener() {}
  removeEventListener() {}
}

let session: FakeSession;
const browserRaf = vi.fn(() => 1);
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  recording.renderers.length = 0;
  recording.onEye = undefined;
  vi.clearAllMocks();
  session = new FakeSession();
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { xr: { isSessionSupported: async () => true, requestSession: async () => session } });
  vi.stubGlobal("XRWebGLLayer", FakeLayer);
  vi.stubGlobal("requestAnimationFrame", browserRaf);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mountedApp() {
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: scene().add(primitives.box({ name: "xr-clock" })), resize: false, diagnostics: false
  });
  await app.ready();
  const renderer = recording.renderers[0]!;
  renderer.times.length = 0;
  renderer.eyes.length = 0;
  return { app, renderer };
}

describe("public app XR frame loop", () => {
  it("advances once per XR frame, renders both eyes in milliseconds and advances through tracking loss", async () => {
    const { app, renderer } = await mountedApp();
    const times: number[] = [];
    const deltas: number[] = [];
    app.onFrame(({ dt, time }) => { deltas.push(dt); times.push(time); });
    const initial = app.runtime.time;
    expect((await app.xr!.enter()).started).toBe(true);
    session.tick(1000);
    session.tick(1016);
    session.tick(1036, false);
    session.tick(1536);

    expect(deltas).toEqual([0, 0.016, 0.02, 0.1]);
    expect(times).toHaveLength(4);
    expect(times[0]).toBeCloseTo(initial);
    expect(times[3]).toBeCloseTo(initial + 0.136);
    expect(renderer.eyes).toEqual(["left", "right", "left", "right", "left", "right"]);
    for (const [index, frame] of [times[0]!, times[1]!, times[3]!].entries()) {
      expect(renderer.times[index * 2]).toBeCloseTo(frame * 1000);
      expect(renderer.times[index * 2 + 1]).toBeCloseTo(frame * 1000);
    }

    app.pause();
    session.tick(1600);
    expect(times).toHaveLength(4);
    expect(renderer.times.at(-1)).toBeCloseTo(times[3]! * 1000);
    const scheduledBeforeResume = browserRaf.mock.calls.length;
    app.resume();
    expect(browserRaf).toHaveBeenCalledTimes(scheduledBeforeResume);
    session.tick(1616);
    expect(deltas.at(-1)).toBeCloseTo(0.016);
    expect(times).toHaveLength(5);
    await app.xr!.exit();
    expect(browserRaf).toHaveBeenCalledTimes(scheduledBeforeResume + 1);
    app.dispose();
  });

  it.each(["exit", "dispose", "remount"] as const)("does not draw the old eyes after %s from an app frame callback", async (action) => {
    const { app, renderer } = await mountedApp();
    expect((await app.xr!.enter()).started).toBe(true);
    app.onFrame(() => {
      if (action === "exit") void app.xr!.exit();
      else if (action === "dispose") app.dispose();
      else app.setScene(scene().add(primitives.box({ name: "replacement" })));
    });
    session.tick(1000);
    await flush();
    expect(renderer.times).toEqual([]);
    expect(session.end).toHaveBeenCalledOnce();
    expect(app.xr!.isPresenting).toBe(false);
    app.dispose();
  });

  it("ends the session before the second eye if the renderer remounts during the first", async () => {
    const { app, renderer } = await mountedApp();
    expect((await app.xr!.enter()).started).toBe(true);
    recording.onEye = (eye) => {
      if (eye === "left") app.setScene(scene().add(primitives.box({ name: "new scene" })));
    };
    session.tick(1000);
    recording.onEye = undefined;
    await flush();
    expect(renderer.eyes).toEqual(["left"]);
    expect(session.end).toHaveBeenCalledOnce();
    expect(app.xr!.isPresenting).toBe(false);
    app.dispose();
  });

  it("reports a failed simulation update and closes the session without drawing", async () => {
    const renderFrame = vi.fn();
    const runtime = createAuraXRRuntime({
      key: {},
      xr: { isSessionSupported: async () => true, requestSession: async () => session },
      getGL: () => recording.gl,
      getDevice: () => recording.device,
      layerConstructor: FakeLayer,
      advanceFrame: () => { throw new Error("simulation failed"); },
      renderFrame
    });
    const errors: { code: string; message: string }[] = [];
    runtime.on("error", (error) => errors.push(error));
    expect((await runtime.enter()).started).toBe(true);
    session.tick(1000);
    await flush();
    expect(errors).toEqual([{ code: "XR_FRAME_UPDATE_FAILED", message: "simulation failed" }]);
    expect(renderFrame).not.toHaveBeenCalled();
    expect(session.end).toHaveBeenCalledOnce();
    expect(runtime.isPresenting).toBe(false);
  });

  it("does not issue another session request before a cancelled late session has closed", async () => {
    const first = deferred<FakeSession>();
    const closed = deferred<void>();
    const lateSession = new FakeSession();
    lateSession.end.mockImplementation(async () => { await closed.promise; });
    const requestSession = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(session);
    vi.stubGlobal("navigator", { xr: { isSessionSupported: async () => true, requestSession } });
    const { app } = await mountedApp();

    const cancelled = app.xr!.enter();
    await flush();
    expect(requestSession).toHaveBeenCalledOnce();
    await app.xr!.exit();
    expect(await app.xr!.enter()).toMatchObject({ started: false, reason: "already-presenting" });
    expect(requestSession).toHaveBeenCalledOnce();

    first.resolve(lateSession);
    await flush();
    expect(lateSession.end).toHaveBeenCalledOnce();
    expect(await app.xr!.enter()).toMatchObject({ started: false, reason: "already-presenting" });
    expect(requestSession).toHaveBeenCalledOnce();
    closed.resolve();
    expect(await cancelled).toMatchObject({ started: false, reason: "cancelled" });
    expect((await app.xr!.enter()).started).toBe(true);
    expect(requestSession).toHaveBeenCalledTimes(2);
    await app.xr!.exit();
    app.dispose();
  });
});
