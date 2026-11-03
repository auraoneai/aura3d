import { describe, expect, it, vi } from "vitest";
import { DirectionalLight } from "@aura3d/scene";
import { registerForwardDrawHook, type RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer, type RenderSource } from "../../../packages/rendering/src/Renderer";
import type { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { transmissionFrameContributor } from "../../../packages/rendering/src/forward/Transmission";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";

type DrawEvent = { kind: "ordinary" | "pair"; phase: "velocity" | "forward"; matrix: number[]; instances: number };

/** Records the native entry points of a simulated WebGL context. */
function fakeCanvas() {
  const fake = fakeWebGLCanvas();
  const events: Array<string | DrawEvent> = [];
  fake.state.onNativeDraw = (draw) => {
    const pair = draw.name === "drawElementsInstanced";
    const velocity = draw.program?.shaders.some((shader) => shader.source.includes("AURA_TEMPORAL_VELOCITY")) === true;
    const matrix = draw.uniforms.get(pair ? "u_batchMVP" : "u_modelViewProjection");
    events.push({ kind: pair ? "pair" : "ordinary", phase: velocity ? "velocity" : "forward",
      matrix: matrix instanceof Float32Array ? Array.from(matrix) : [],
      instances: pair ? Number(draw.args[4]) : 1 });
  };
  return { ...fake, events,
    failPair: () => { fake.state.failInstanced = true; },
    loseContext: () => { fake.state.lost = true; fake.dispatch("webglcontextlost"); },
    restoreContext: () => { fake.state.lost = false; fake.dispatch("webglcontextrestored"); }
  };
}

const matrixAt = (x: number) => [0.25, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const flags = createTrustedQrFlags({ A3D_QR_CORE: false, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false });

async function fixture(qrFlags: QrFlags = flags) {
  const gl = fakeCanvas();
  const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 128, height: 128, qrFlags });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial();
  const items: [RenderItem, RenderItem] = [
    { geometry, material, modelMatrix: matrixAt(-0.625) },
    { geometry, material, modelMatrix: matrixAt(0.625) }
  ];
  const source: RenderSource = { staticBatching: true, renderItems: items, cameraPolicy: "identity", frustumCulling: false,
    shadow: false, environmentLighting: false };
  const render = (overrides: Partial<RenderSource> = {}) => renderer.render({ source: { ...source, ...overrides } });
  return { gl, renderer, geometry, material, items, source, render,
    dispose: () => { renderer.dispose(); geometry.dispose(); material.dispose(); } };
}

function drawEvents(events: Array<string | DrawEvent>): DrawEvent[] {
  return events.filter((event): event is DrawEvent => typeof event !== "string");
}

async function warmedFixture(qrFlags: QrFlags = flags) {
  const f = await fixture(qrFlags);
  try {
    f.render(); // Populate the ordinary buffers, program and VAO.
    expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
    f.gl.events.length = 0;
    f.render(); // The eligible pair prewarms its program and VAO.
    expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
    f.gl.events.length = 0;
    const diagnostics = f.render();
    expect(drawEvents(f.gl.events).map((event) => [event.kind, event.instances])).toEqual([["pair", 2]]);
    expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
    f.gl.events.length = 0;
    return f;
  } catch (error) {
    f.dispose();
    throw error;
  }
}

describe("opt-in static unlit pair: renderer fallbacks", () => {
  it("keeps two logical objects and submits one physical draw with both transforms", async () => {
    const f = await warmedFixture();
    try {
      const diagnostics = f.render();
      const draws = drawEvents(f.gl.events);
      expect(draws).toHaveLength(1);
      expect(draws[0]).toMatchObject({ kind: "pair", instances: 2 });
      expect([draws[0]!.matrix[12], draws[0]!.matrix[28]]).toEqual([-0.625, 0.625]);
      expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
    } finally { f.dispose(); }
  });

  it("preserves source opt-out and falls back when screen envelopes overlap", async () => {
    const f = await warmedFixture();
    try {
      const optedOut = f.render({ staticBatching: false });
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
      expect(optedOut).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
      f.gl.events.length = 0;
      f.items[1] = { ...f.items[1], modelMatrix: matrixAt(-0.625) };
      const overlap = f.render();
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
      expect(overlap).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
    } finally { f.dispose(); }
  });

  it("runs item callbacks in sorted draw order immediately before their ordinary draw", async () => {
    const f = await warmedFixture();
    try {
      f.items[0] = { ...f.items[0], renderOrder: 2, onBeforeRender: () => f.gl.events.push("before:left") };
      f.items[1] = { ...f.items[1], renderOrder: -1, onBeforeRender: () => f.gl.events.push("before:right") };
      const diagnostics = f.render();
      expect(f.gl.events.map((event) => typeof event === "string" ? event : `${event.kind}:${event.matrix[12]}`))
        .toEqual(["before:right", "ordinary:0.625", "before:left", "ordinary:-0.625"]);
      expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2 });
    } finally { f.dispose(); }
  });

  it("preserves a registered forward hook once for each ordinary draw", async () => {
    const f = await warmedFixture();
    const unregister = registerForwardDrawHook({ id: "test.static-pair-forward-observer", bind: (item) => {
      f.gl.events.push(`hook:${item.modelMatrix?.[12]}`);
    } });
    try {
      f.render();
      expect(f.gl.events.map((event) => typeof event === "string" ? event : `${event.kind}:${event.matrix[12]}`))
        .toEqual(["hook:-0.625", "ordinary:-0.625", "hook:0.625", "ordinary:0.625"]);
    } finally { unregister(); f.dispose(); }
  });

  it("preserves an active frame contributor before both ordinary draws", async () => {
    const contributorFlags = createTrustedQrFlags({ ...flags.values, A3D_QR_TEST_STATIC_BATCH: true });
    const f = await warmedFixture(contributorFlags);
    const unregister = registerFrameContributor({ id: "prd01.static-batch-observer", owner: "prd01",
      flag: "A3D_QR_TEST_STATIC_BATCH", phases: ["collect"], collect: (items) => {
        f.gl.events.push("collect");
        return items;
      } });
    try {
      f.render();
      expect(f.gl.events.map((event) => typeof event === "string" ? event : `${event.kind}:${event.matrix[12]}`))
        .toEqual(["collect", "ordinary:-0.625", "ordinary:0.625"]);
    } finally { unregister(); f.dispose(); }
  });

  it("does not bypass a caller override of the Aura device draw method", async () => {
    const f = await warmedFixture();
    const draw = vi.spyOn(f.renderer.device, "draw");
    try {
      f.render();
      expect(draw).toHaveBeenCalledTimes(2);
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
    } finally { draw.mockRestore(); f.dispose(); }
  });

  it("does not pair a dirty vertex resource on the upload frame", async () => {
    const f = await warmedFixture();
    try {
      f.geometry.vertexBuffer.setAttribute(0, "position", [-0.4, -0.5, 0]);
      f.render();
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
    } finally { f.dispose(); }
  });

  it("leaves active native query observations on the ordinary draw path", async () => {
    const f = await warmedFixture();
    try {
      f.gl.state.activeQuery = {};
      f.render();
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
      f.gl.state.activeQuery = null;
      f.gl.events.length = 0;
      f.render();
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["pair"]);
    } finally { f.dispose(); }
  });

  it("keeps the ordinary clipping error and does not submit a pair", async () => {
    const f = await warmedFixture();
    const clipping: RenderSource["globalClipping"] = { planes: [[1, 0, 0, 0]] };
    try {
      expect(() => f.render({ staticBatching: false, globalClipping: clipping }))
        .toThrowError(expect.objectContaining({ code: "FORWARD_CLIPPING_PROGRAM_UNSUPPORTED" }));
      expect(drawEvents(f.gl.events)).toEqual([]);
      f.gl.events.length = 0;
      expect(() => f.render({ globalClipping: clipping }))
        .toThrowError(expect.objectContaining({ code: "FORWARD_CLIPPING_PROGRAM_UNSUPPORTED" }));
      expect(drawEvents(f.gl.events)).toEqual([]);
    } finally { f.dispose(); }
  });

  it("preserves the opt-out shadow-caster and forward draw sequence", async () => {
    const f = await warmedFixture();
    const light = new DirectionalLight("static-pair-shadow");
    light.castsShadow = true;
    const shadow = { light, size: 16, lightMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
    try {
      f.render({ shadow, staticBatching: false });
      const ordinary = drawEvents(f.gl.events).map((event) => event.kind);
      expect(ordinary).toEqual(["ordinary", "ordinary", "ordinary", "ordinary"]);
      f.gl.events.length = 0;
      f.render({ shadow });
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(ordinary);
    } finally { f.dispose(); }
  });

  it("preserves the opt-out temporal history and forward behavior", async () => {
    const f = await warmedFixture();
    const device = f.renderer.device as WebGL2Device;
    const history = (f.renderer as unknown as { temporalHistory: TemporalHistory }).temporalHistory;
    const prepare = vi.spyOn(history, "prepare");
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    // This source test substitutes only final presentation, retaining real
    // renderer history preparation and its forward draw sequence.
    const present = vi.spyOn(device, "presentLdrPostprocess").mockImplementation(() => {});
    try {
      const postprocess = { execution: "auto" as const, sampleCount: 1,
        temporal: { sceneKey: "pair-fallback" }, taa: { blend: 0.9 } };
      const assertTemporalDraws = (start: number) => {
        const draws = f.gl.nativeDraws.slice(start);
        const phases = draws.map((draw) => draw.program?.shaders.some((shader) =>
          shader.source.includes("AURA_TEMPORAL_VELOCITY")) ? "velocity" : "forward");
        expect(phases).toEqual(["velocity", "velocity", "forward", "forward"]);
        expect(draws.map((draw) => draw.name)).toEqual(["drawElements", "drawElements", "drawElements", "drawElements"]);
        for (const [index, draw] of draws.slice(0, 2).entries()) {
          for (const name of ["u_modelViewProjection", "u_previousViewProjection", "u_unjitteredViewProjection"]) {
            const matrix = draw.uniforms.get(name);
            expect(matrix).toBeInstanceOf(Float32Array);
            expect((matrix as Float32Array).length).toBe(16);
          }
          expect((draw.uniforms.get("u_previousViewProjection") as Float32Array)[12]).toBeCloseTo(index === 0 ? -0.625 : 0.625);
          expect((draw.uniforms.get("u_unjitteredViewProjection") as Float32Array)[12]).toBeCloseTo(index === 0 ? -0.625 : 0.625);
        }
      };
      const firstDraw = f.gl.nativeDraws.length;
      f.render({ postprocess, staticBatching: false });
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(present).toHaveBeenCalledTimes(1);
      assertTemporalDraws(firstDraw);
      const ordinary = drawEvents(f.gl.events).filter((event) => event.phase === "forward").map((event) => event.kind);
      expect(ordinary).toEqual(["ordinary", "ordinary"]);
      f.gl.events.length = 0;
      const secondDraw = f.gl.nativeDraws.length;
      f.render({ postprocess });
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(present).toHaveBeenCalledTimes(2);
      assertTemporalDraws(secondDraw);
      expect(drawEvents(f.gl.events).filter((event) => event.phase === "forward").map((event) => event.kind)).toEqual(ordinary);
      expect(warnings.mock.calls.some((args) => args.some((value) => typeof value === "string" && /draw skipped/i.test(value)))).toBe(false);
    } finally { present.mockRestore(); warnings.mockRestore(); prepare.mockRestore(); f.dispose(); }
  });

  it("keeps unsafe transmission replay rejected before any draw or hook", async () => {
    const gl = fakeCanvas();
    const replayFlags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
      A3D_QR_CORE_OUTPUT: false, A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true });
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 128, height: 128, qrFlags: replayFlags });
    const geometry = Geometry.triangle(), opaque = new UnlitMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const hook = vi.fn();
    const removeHook = registerForwardDrawHook({ id: "test.static-pair-transmission-observer", bind: hook });
    const source: RenderSource = { cameraPolicy: "identity", frustumCulling: false, renderItems: [
      { geometry, material: opaque, modelMatrix: matrixAt(-0.625) },
      { geometry, material: opaque, modelMatrix: matrixAt(0.625) },
      { geometry, material: glass }
    ] };
    try {
      for (const staticBatching of [false, true]) {
        expect(() => renderer.render({ source: { ...source, staticBatching } }))
          .toThrowError(expect.objectContaining({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" }));
        expect(drawEvents(gl.events)).toEqual([]);
        expect(hook).not.toHaveBeenCalled();
      }
    } finally { removeHook(); removeTransmission(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("never replays ordinary draws after the native pair submission has begun", async () => {
    const f = await warmedFixture();
    try {
      f.gl.failPair();
      expect(() => f.render()).toThrow(/instanced draw failed after entry/);
      expect(drawEvents(f.gl.events).map((event) => [event.kind, event.instances])).toEqual([["pair", 2]]);
    } finally { f.dispose(); }
  });

  it("invalidates the old generation on context loss and requires ordinary draws after restoration", async () => {
    const f = await warmedFixture();
    const device = f.renderer.device as WebGL2Device;
    const generation = device.generation;
    try {
      f.gl.loseContext();
      expect(device.generation).toBeGreaterThan(generation);
      expect(() => f.render()).toThrow();
      expect(drawEvents(f.gl.events)).toEqual([]);
      let unregister = () => {};
      const restored = new Promise<void>((resolve) => { unregister = device.onDeviceRestored(resolve); });
      f.gl.restoreContext();
      await restored;
      unregister();
      f.gl.events.length = 0;
      f.render();
      expect(drawEvents(f.gl.events).map((event) => event.kind)).toEqual(["ordinary", "ordinary"]);
    } finally { f.dispose(); }
  });
});
