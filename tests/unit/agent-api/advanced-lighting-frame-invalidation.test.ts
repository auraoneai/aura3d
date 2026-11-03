import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ draws: 0, blocked: undefined as Promise<void> | undefined, resourceChanged: undefined as (() => void) | undefined }));
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => ({
    backend: "webgl2", diagnostics: undefined, deviceLost: () => false,
    render: () => ++state.draws,
    renderAsync: async () => { state.draws++; if (state.draws === 2) await state.blocked; return 1; },
    onResourceChange: (listener: () => void) => { state.resourceChanged = listener; return () => { state.resourceChanged = undefined; }; },
    viewProjection: () => new Float32Array(16), dispose() {}
  })
}));

import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const ticks = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const callbacks = new Map<number, FrameRequestCallback>();
let nextId = 0;
function fireFrame(time: number) {
  const [id, callback] = [...callbacks.entries()][0]!;
  callbacks.delete(id);
  callback(time);
}

beforeEach(() => {
  state.draws = 0; state.blocked = undefined; state.resourceChanged = undefined; callbacks.clear(); nextId = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

describe("static renderer invalidation", () => {
  it("coalesces changes across an in-flight frame and honors pause and disposal", async () => {
    let release!: () => void;
    state.blocked = new Promise<void>((resolve) => { release = resolve; });
    let paused = false;
    const snapshot = scene().add(primitives.box()).toJSON();
    const controller = await startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { scene: snapshot, autoStart: true, resize: false, frameMode: "async" },
      undefined, undefined, () => paused);
    expect(state.draws).toBe(1);
    expect(callbacks.size).toBe(0);
    state.resourceChanged!(); state.resourceChanged!();
    expect(callbacks.size).toBe(1);
    fireFrame(16); await ticks();
    expect(state.draws).toBe(2);
    controller.invalidate!(); controller.invalidate!();
    fireFrame(32); await ticks();
    expect(state.draws).toBe(2);
    expect(callbacks.size).toBe(0);
    release(); await ticks();
    expect(callbacks.size).toBe(1);
    fireFrame(48); await ticks();
    expect(state.draws).toBe(3);
    paused = true; controller.pause!();
    controller.invalidate!();
    expect(callbacks.size).toBe(0);
    paused = false; controller.resume!();
    expect(callbacks.size).toBe(1);
    fireFrame(64); await ticks();
    expect(state.draws).toBe(4);
    controller.dispose();
    expect(state.resourceChanged).toBeUndefined();
    controller.invalidate!();
    expect(callbacks.size).toBe(0);
    await controller.whenIdle!();
  });
});
