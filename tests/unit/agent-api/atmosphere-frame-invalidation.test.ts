import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  renderers: [] as {
    canvas: HTMLCanvasElement;
    draws: number;
    wetness: number[];
    resourceChanged?: () => void;
    disposed: boolean;
  }[],
  mountGate: undefined as Promise<void> | undefined,
  frameGate: undefined as Promise<void> | undefined
}));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async (canvas: HTMLCanvasElement) => {
    await state.mountGate;
    const record = { canvas, draws: 0, wetness: [] as number[], resourceChanged: undefined as (() => void) | undefined, disposed: false };
    state.renderers.push(record);
    return {
      backend: "webgl2", diagnostics: undefined, deviceLost: () => false,
      render: () => { record.draws++; return 1; },
      renderAsync: async () => {
        record.draws++;
        const source = getRootRenderSource(canvas)?.source as { atmosphere?: { state(): { wetness: number } } } | undefined;
        record.wetness.push(source?.atmosphere?.state().wetness ?? -1);
        if (record.draws === 2) await state.frameGate;
        return 1;
      },
      onResourceChange: (listener: () => void) => { record.resourceChanged = listener; return () => { record.resourceChanged = undefined; }; },
      viewProjection: () => new Float32Array(16), dispose() { record.disposed = true; }
    };
  }
}));

import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { getRootRenderSource } from "../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { attachVfxBridge } from "../../../packages/engine/src/agent-api/vfx/bridge";
import { ProductionEffectSystem } from "../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
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
  const next = [...callbacks.entries()][0];
  if (!next) throw new Error("No frame is scheduled");
  callbacks.delete(next[0]);
  next[1](time);
}
function system() {
  return new ProductionEffectSystem({ scene: { nodes: [] }, onFrame: () => () => {} });
}
function beginMount(
  canvas: HTMLCanvasElement,
  isPaused: () => boolean = () => false,
  readiness?: Parameters<typeof startProductionRender>[12]
) {
  const snapshot = scene().add(primitives.box()).toJSON();
  return startProductionRender(canvas, snapshot, createInitialDiagnostics(snapshot, undefined),
    { scene: snapshot, autoStart: true, resize: false, frameMode: "async" }, undefined, undefined, isPaused,
    undefined, undefined, undefined, undefined, undefined, readiness);
}

beforeEach(() => {
  state.renderers.length = 0; state.mountGate = undefined; state.frameGate = undefined; callbacks.clear(); nextId = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

describe("app-owned atmosphere frame invalidation", () => {
  it("attaches during an async mount and coalesces atmosphere and resource updates, including pause and disposal", async () => {
    let releaseMount!: () => void, releaseFrame!: () => void;
    state.mountGate = new Promise<void>((resolve) => { releaseMount = resolve; });
    state.frameGate = new Promise<void>((resolve) => { releaseFrame = resolve; });
    let paused = false;
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const mounting = beginMount(canvas, () => paused);
    const effects = system();
    const received = vi.fn();
    const subscribe = effects.atmosphere.onRenderChange.bind(effects.atmosphere);
    vi.spyOn(effects.atmosphere, "onRenderChange").mockImplementation((listener) => subscribe(() => { received(); listener(); }));
    const bridge = attachVfxBridge(canvas, effects);
    releaseMount();
    const controller = await mounting;
    const renderer = state.renderers[0]!;
    expect(bridge.attached).toBe(true);
    expect(renderer.wetness).toEqual([0]);
    expect(callbacks.size).toBe(0);

    effects.atmosphere.setWetness(0.2);
    effects.atmosphere.setWetness(0.4);
    renderer.resourceChanged!();
    expect(callbacks.size).toBe(1);
    fireFrame(16); await ticks();
    expect(renderer.wetness).toEqual([0, 0.4]);
    effects.atmosphere.setWetness(0.6);
    renderer.resourceChanged!();
    fireFrame(32); await ticks();
    expect(renderer.draws).toBe(2);
    releaseFrame(); await ticks();
    expect(callbacks.size).toBe(1);
    fireFrame(48); await ticks();
    expect(renderer.wetness).toEqual([0, 0.4, 0.6]);

    paused = true; controller.pause!();
    effects.atmosphere.setWetness(0.8);
    expect(callbacks.size).toBe(0);
    paused = false; controller.resume!();
    expect(callbacks.size).toBe(1);
    fireFrame(64); await ticks();
    expect(renderer.wetness.at(-1)).toBe(0.8);
    const beforeDispose = received.mock.calls.length;
    controller.dispose();
    effects.atmosphere.setWetness(1);
    expect(received).toHaveBeenCalledTimes(beforeDispose);
    expect(renderer.resourceChanged).toBeUndefined();
    expect(callbacks.size).toBe(0);
    await controller.whenIdle!();
    bridge.detach(); effects.dispose();
  });

  it("keeps subscriptions scoped to each canvas and replaces the old mount without leaking a listener", async () => {
    const firstCanvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const secondCanvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const firstSystem = system(), secondSystem = system();
    const firstBridge = attachVfxBridge(firstCanvas, firstSystem), secondBridge = attachVfxBridge(secondCanvas, secondSystem);
    const first = await beginMount(firstCanvas), second = await beginMount(secondCanvas);
    const oldRenderer = state.renderers[0]!, secondRenderer = state.renderers[1]!;
    firstSystem.atmosphere.setWetness(0.2);
    expect(callbacks.size).toBe(1);
    fireFrame(16); await ticks();
    expect(oldRenderer.wetness).toEqual([0, 0.2]);
    expect(secondRenderer.wetness).toEqual([0]);

    first.dispose();
    const replacement = await beginMount(firstCanvas);
    const newRenderer = state.renderers[2]!;
    firstSystem.atmosphere.setWetness(0.7);
    expect(callbacks.size).toBe(1);
    fireFrame(32); await ticks();
    expect(oldRenderer.wetness).toEqual([0, 0.2]);
    expect(newRenderer.wetness).toEqual([0.2, 0.7]);
    expect(secondRenderer.wetness).toEqual([0]);
    secondSystem.atmosphere.setWetness(0.9);
    fireFrame(48); await ticks();
    expect(secondRenderer.wetness).toEqual([0, 0.9]);
    replacement.dispose(); second.dispose(); firstBridge.detach(); secondBridge.detach(); firstSystem.dispose(); secondSystem.dispose();
  });

  it("unsubscribes when the renderer-ready callback disposes the mount before its first frame", async () => {
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const effects = system();
    const received = vi.fn();
    const subscribe = effects.atmosphere.onRenderChange.bind(effects.atmosphere);
    vi.spyOn(effects.atmosphere, "onRenderChange").mockImplementation((listener) => subscribe(() => { received(); listener(); }));
    const bridge = attachVfxBridge(canvas, effects);
    const firstFrame = vi.fn();
    const controller = await beginMount(canvas, () => false, {
      onRendererReady(_backend, pending) { pending.dispose(); },
      onFirstFrame: firstFrame
    });
    expect(state.renderers[0]).toMatchObject({ draws: 0, disposed: true });
    expect(firstFrame).not.toHaveBeenCalled();
    effects.atmosphere.setWetness(0.5);
    expect(received).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    controller.dispose(); bridge.detach(); effects.dispose();
  });
});
