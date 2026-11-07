/**
 * 5.1 utime-motion: a scene whose only motion is a clock consumer (custom shader reading uTime,
 * world.water, drifting sky clouds) must keep drawing; a scene without one must stay idle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  customShaderReadsClock,
  nodeConsumesClock,
  sceneConsumesClock,
  skyHasAnimatedClouds
} from "../../../packages/engine/src/agent-api/app/timeConsumers";
import { shouldContinuouslyRender, startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups";
import { sky } from "../../../packages/engine/src/agent-api/nodes/sky";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { world } from "../../../packages/engine/src/agent-api/world/index";
import type { AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";

const state = vi.hoisted(() => ({ renderers: [] as unknown[] }));
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => state.renderers.shift()
}));

const FRAG_TIME = "uniform float u_unused; out vec4 outColor; void main() { outColor = vec4(vec3(0.5 + 0.5 * sin(uTime)), 1.0); }";
const FRAG_STATIC = "out vec4 outColor; void main() { outColor = vec4(0.2, 0.4, 0.8, 1.0); }";
const custom = (fragment: string, vertex?: string) =>
  material.custom({ glsl: { fragment, ...(vertex ? { vertex } : {}) } });
const lake = () => world.water({ kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 5 }, waves: "calm" } as never);
const sun = { elevationDeg: 40, azimuthDeg: 120 };

describe("customShaderReadsClock", () => {
  it("is true when the fragment stage reads uTime or u_time", () => {
    expect(customShaderReadsClock({ glsl: { fragment: "void main() { float t = uTime; }" } })).toBe(true);
    expect(customShaderReadsClock({ glsl: { fragment: "void main() { float t = u_time; }" } })).toBe(true);
  });
  it("is true when only the vertex stage reads the clock", () => {
    expect(customShaderReadsClock({ glsl: { vertex: "void main() { gl_Position = vec4(uTime); }", fragment: "void main() {}" } })).toBe(true);
  });
  it("is false when neither stage names the clock (including look-alike identifiers)", () => {
    expect(customShaderReadsClock({ glsl: { fragment: "void main() { float uTimeline = 1.0; float my_u_time2 = 0.0; }" } })).toBe(false);
    expect(customShaderReadsClock({ glsl: { fragment: "void main() {}" } })).toBe(false);
  });
  it("is false when the author declares their own float uTime / u_time", () => {
    expect(customShaderReadsClock({ glsl: { fragment: "uniform float uTime; void main() { float t = uTime; }" } })).toBe(false);
    expect(customShaderReadsClock({ glsl: { fragment: "uniform highp float u_time; void main() { float t = u_time; }" } })).toBe(false);
  });
  it("is false for a missing spec or missing glsl", () => {
    expect(customShaderReadsClock(undefined)).toBe(false);
    expect(customShaderReadsClock({})).toBe(false);
  });
});

describe("skyHasAnimatedClouds", () => {
  it("is true for coverage > 0 with default or non-zero speed", () => {
    expect(skyHasAnimatedClouds({ clouds: { coverage: 0.5 } })).toBe(true);
    expect(skyHasAnimatedClouds({ clouds: { coverage: 0.5, speed: 4 } })).toBe(true);
  });
  it("is false for speed 0, coverage 0, or no clouds", () => {
    expect(skyHasAnimatedClouds({ clouds: { coverage: 0.5, speed: 0 } })).toBe(false);
    expect(skyHasAnimatedClouds({ clouds: { coverage: 0 } })).toBe(false);
    expect(skyHasAnimatedClouds({})).toBe(false);
    expect(skyHasAnimatedClouds(undefined)).toBe(false);
  });
});

describe("nodeConsumesClock / sceneConsumesClock", () => {
  it("covers each node kind", () => {
    expect(nodeConsumesClock({ kind: "primitive", material: custom(FRAG_TIME) })).toBe(true);
    expect(nodeConsumesClock({ kind: "primitive", material: custom(FRAG_STATIC) })).toBe(false);
    expect(nodeConsumesClock({ kind: "primitive", material: { kind: "pbr" } })).toBe(false);
    expect(nodeConsumesClock({ kind: "primitive" })).toBe(false);
    expect(nodeConsumesClock({ kind: "water" })).toBe(true);
    expect(nodeConsumesClock({ kind: "sky", spec: { clouds: { coverage: 0.7 } } })).toBe(true);
    expect(nodeConsumesClock({ kind: "sky", spec: { clouds: { coverage: 0.7, speed: 0 } } })).toBe(false);
    expect(nodeConsumesClock({ kind: "effect" })).toBe(false);
  });
  it("finds consumers nested in groups and ignores static trees", () => {
    const nested = group("outer", [group("inner", [primitives.box({ material: custom(FRAG_TIME) })])]).toJSON();
    expect(sceneConsumesClock([nested])).toBe(true);
    const staticTree = group("outer", [primitives.box({ material: custom(FRAG_STATIC) })]).toJSON();
    expect(sceneConsumesClock([staticTree])).toBe(false);
    expect(sceneConsumesClock([])).toBe(false);
  });
});

describe("shouldContinuouslyRender with clock consumers", () => {
  const snap = (...nodes: unknown[]) => {
    let builder = scene();
    for (const node of nodes) builder = builder.add(node as never);
    return builder.toJSON();
  };
  it("is true for a static custom-material primitive reading uTime", () => {
    expect(shouldContinuouslyRender(snap(primitives.plane({ material: custom(FRAG_TIME) })))).toBe(true);
  });
  it("is true for the vertex-only clock read", () => {
    expect(shouldContinuouslyRender(snap(primitives.plane({ material: custom(FRAG_STATIC, "void main() { gl_Position = vec4(u_time); }") })))).toBe(true);
  });
  it("is true for world.water", () => {
    expect(shouldContinuouslyRender(snap(lake()))).toBe(true);
  });
  it("is true for sky clouds with default speed, false for still clouds and no clouds", () => {
    expect(shouldContinuouslyRender(snap(sky.preetham({ sun, clouds: { coverage: 0.7 } })))).toBe(true);
    expect(shouldContinuouslyRender(snap(sky.preetham({ sun, clouds: { coverage: 0.7, speed: 0 } })))).toBe(false);
    expect(shouldContinuouslyRender(snap(sky.preetham({ sun })))).toBe(false);
  });
  it("stays idle for a fully static scene and for volumetric fog (no time-driven noise on the node)", () => {
    expect(shouldContinuouslyRender(snap(primitives.box()))).toBe(false);
    expect(shouldContinuouslyRender(snap(primitives.box({ material: custom(FRAG_STATIC) })))).toBe(false);
    expect(shouldContinuouslyRender(snap(primitives.box(), effects.volumetricFog()))).toBe(false);
  });
  it("a pinned camera captureTime keeps clock consumers idle", () => {
    const pinned = scene().add(primitives.plane({ material: custom(FRAG_TIME) })).camera({ mode: "orbit", captureTime: 1 } as never).toJSON();
    expect(pinned.camera.captureTime).toBe(1);
    expect(shouldContinuouslyRender(pinned)).toBe(false);
  });
  it("existing branches are unchanged: a looping timeline still wants frames", () => {
    expect(shouldContinuouslyRender({ ...snap(primitives.box()), timeline: { mode: "loop" } } as never)).toBe(true);
  });
});

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function fakeRenderer(snapshot: ReturnType<ReturnType<typeof scene>["toJSON"]>) {
  const diagnostics = createInitialDiagnostics(snapshot, undefined).renderer;
  return {
    backend: "webgl2" as const, diagnostics, render: vi.fn(() => 1), renderAsync: vi.fn(async () => 1),
    viewProjection: () => new Float32Array(16), deviceLost: () => false, dispose: vi.fn(),
    whenDisposed: undefined, onResourceChange: vi.fn(() => () => {})
  };
}

describe("frame-loop scheduling for static scenes", () => {
  let rafCalls = 0;
  beforeEach(() => {
    rafCalls = 0;
    state.renderers.length = 0;
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("requestAnimationFrame", () => { rafCalls += 1; return rafCalls; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://frame.example.test/" }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("document", { hidden: false, body: { dataset: {} }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function mountAndCountSchedules(snapshot: ReturnType<ReturnType<typeof scene>["toJSON"]>) {
    const renderer = fakeRenderer(snapshot);
    state.renderers.push(renderer);
    const controller = await startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
      createInitialDiagnostics(snapshot, undefined), { scene: snapshot, autoStart: true, resize: false },
      undefined, undefined, undefined, {} as AuraRuntimeNodeRegistry);
    for (let i = 0; i < 24; i += 1) await Promise.resolve();
    const scheduled = rafCalls;
    controller.dispose();
    return scheduled;
  }

  it("keeps scheduling frames for a static custom-material scene that reads uTime", async () => {
    const snapshot = scene().add(primitives.plane({ material: custom(FRAG_TIME) })).toJSON();
    expect(await mountAndCountSchedules(snapshot)).toBeGreaterThan(0);
  });

  it("does not schedule extra frames for a static scene without a time consumer", async () => {
    const snapshot = scene().add(primitives.plane({ material: custom(FRAG_STATIC) })).toJSON();
    expect(await mountAndCountSchedules(snapshot)).toBe(0);
  });
});
