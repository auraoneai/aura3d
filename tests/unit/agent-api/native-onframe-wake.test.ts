import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  draws: 0,
  mountGate: undefined as Promise<void> | undefined,
  onRender: undefined as (() => void) | undefined
}));

// Keep the actual app and production frame loop; replace only the scene renderer.
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => {
    await state.mountGate;
    return {
      backend: "webgl2", diagnostics: undefined, deviceLost: () => false,
      render() { state.draws += 1; state.onRender?.(); return 1; },
      viewProjection: () => new Float32Array(16),
      resetTemporalHistory() {}, dispose() {}
    };
  }
}));

import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let now = 0;
function tick(): void {
  const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!entry) throw new Error("No automatic frame is scheduled");
  frames.delete(entry[0]);
  now += 16;
  entry[1](now);
}
function createTestApp(autoStart = true) {
  return createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: scene().add(primitives.box({ name: "static" })), autoStart, resize: false, diagnostics: false
  });
}

beforeEach(() => {
  state.draws = 0; state.mountGate = undefined; state.onRender = undefined;
  frames.clear(); nextFrame = 0; now = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("native app onFrame wake-up", () => {
  it("wakes an idle auto-start app, coalesces subscribers and returns to idle", async () => {
    const app = createTestApp();
    try {
      await app.ready();
      expect(state.draws).toBe(1);
      expect(frames.size).toBe(0);
      const first = vi.fn();
      const second = vi.fn();
      const offFirst = app.onFrame(first);
      const offSecond = app.onFrame(second);
      expect(frames.size).toBe(1);
      tick();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(first).toHaveBeenLastCalledWith(expect.objectContaining({ source: "raf" }));
      expect(frames.size).toBe(1);
      offFirst(); offSecond();
      tick();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(frames.size).toBe(0);

      const offAgain = app.onFrame(first);
      offAgain();
      expect(frames.size).toBe(1);
      tick();
      expect(first).toHaveBeenCalledTimes(1);
      expect(frames.size).toBe(0);
    } finally { app.dispose(); }
  });

  it("does not wake while paused, and resumes a retained callback only on resume", async () => {
    const app = createTestApp();
    try {
      await app.ready();
      app.pause();
      const callback = vi.fn();
      const off = app.onFrame(callback);
      expect(frames.size).toBe(0);
      app.resume();
      expect(frames.size).toBe(1);
      tick();
      expect(callback).toHaveBeenCalledTimes(1);
      app.pause();
      expect(frames.size).toBe(0);
      app.step(1 / 60);
      expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ source: "manual", paused: true }));
      expect(frames.size).toBe(0);
      off();
      app.resume();
      expect(frames.size).toBe(0);
    } finally { app.dispose(); }
    app.onFrame(() => {});
    expect(frames.size).toBe(0);
  });

  it("does not start automatic frames for a manually driven app", async () => {
    const app = createTestApp(false);
    try {
      await app.ready();
      const callback = vi.fn();
      app.onFrame(callback);
      app.resume();
      expect(frames.size).toBe(0);
      app.step(1 / 60);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ source: "manual" }));
      expect(frames.size).toBe(0);
    } finally { app.dispose(); }
  });

  it("honors callbacks registered before an asynchronous mount completes", async () => {
    let release!: () => void;
    state.mountGate = new Promise<void>((resolve) => { release = resolve; });
    const app = createTestApp();
    const callback = vi.fn();
    const off = app.onFrame(callback);
    try {
      expect(frames.size).toBe(0);
      release();
      await app.ready();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(frames.size).toBe(1);
      off();
      tick();
      expect(frames.size).toBe(0);
    } finally { app.dispose(); }
  });

  it("wakes after a callback is added during a step on a running app", async () => {
    const app = createTestApp();
    try {
      await app.ready();
      const callback = vi.fn();
      state.onRender = () => { state.onRender = undefined; app.onFrame(callback); };
      app.step(0);
      expect(callback).not.toHaveBeenCalled();
      expect(frames.size).toBe(1);
      tick();
      expect(callback).toHaveBeenCalledTimes(1);
    } finally { app.dispose(); }
    expect(frames.size).toBe(0);
  });
});
