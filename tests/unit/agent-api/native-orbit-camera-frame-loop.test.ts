import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ times: [] as number[] }));

// Exercise the app and its frame loop while replacing only renderer submission.
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => ({
    backend: "webgl2", diagnostics: undefined, deviceLost: () => false,
    render(time: number) { state.times.push(time); return 1; },
    viewProjection: () => new Float32Array(16),
    resetTemporalHistory() {}, dispose() {}
  })
}));

import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { interactions } from "../../../packages/engine/src/agent-api/nodes/interactions";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraCameraSpec } from "../../../packages/engine/src/agent-api/nodes/types";

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
function createTestApp(spec: AuraCameraSpec, autoStart = true, interaction = false) {
  const testScene = scene().camera(spec).add(primitives.box({ name: "static" }));
  if (interaction) testScene.add(interactions.orbit({ autoRotate: true }));
  return createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: testScene, autoStart, resize: false, diagnostics: false
  });
}

beforeEach(() => {
  state.times = [];
  frames.clear(); nextFrame = 0; now = 0;
  vi.stubEnv("A3D_QR", "none");
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("legacy orbit camera frame scheduling", () => {
  it.each([1, -1])("keeps rendering a direct nonzero orbit speed (%s)", async (autoRotate) => {
    const app = createTestApp(camera.orbit({ autoRotate }));
    try {
      await app.ready();
      expect(state.times).toHaveLength(1);
      expect(frames.size).toBe(1);
      tick(); tick();
      expect(state.times.slice(-2)).toEqual([16, 32]);
      expect(frames.size).toBe(1);
    } finally { app.dispose(); }
    expect(frames.size).toBe(0);
  });

  it("schedules when orbit motion comes from an interaction", async () => {
    const app = createTestApp(camera.orbit(), true, true);
    try {
      await app.ready();
      expect(frames.size).toBe(1);
      tick();
      expect(state.times).toHaveLength(2);
      expect(frames.size).toBe(1);
    } finally { app.dispose(); }
  });

  it.each([
    { name: "static", spec: camera.orbit() },
    { name: "zero speed", spec: camera.orbit({ autoRotate: 0 }) },
    { name: "fixed capture at zero", spec: camera.orbit({ autoRotate: 1, captureTime: 0 }) },
    { name: "fixed capture at a later time", spec: camera.orbit({ autoRotate: 1, captureTime: 2 }) }
  ])("lets an otherwise idle $name orbit stop after its first frame", async ({ spec }) => {
    const app = createTestApp(spec);
    try {
      await app.ready();
      expect(state.times).toHaveLength(1);
      expect(frames.size).toBe(0);
    } finally { app.dispose(); }
  });

  it("cancels on pause, keeps a manual step manual, and resumes motion", async () => {
    const app = createTestApp(camera.orbit({ autoRotate: 1 }));
    try {
      await app.ready();
      expect(frames.size).toBe(1);
      app.pause();
      expect(frames.size).toBe(0);
      app.step(1 / 60);
      expect(state.times).toHaveLength(2);
      expect(frames.size).toBe(0);
      app.resume();
      expect(frames.size).toBe(1);
      tick();
      expect(state.times).toHaveLength(3);
      expect(frames.size).toBe(1);
    } finally { app.dispose(); }
  });

  it("does not schedule automatically when autoStart is false", async () => {
    const app = createTestApp(camera.orbit({ autoRotate: 1 }), false);
    try {
      await app.ready();
      expect(frames.size).toBe(0);
      app.resume();
      expect(frames.size).toBe(0);
      const before = state.times.length;
      app.step(1 / 60);
      expect(state.times).toHaveLength(before + 1);
      expect(frames.size).toBe(0);
    } finally { app.dispose(); }
  });
});
