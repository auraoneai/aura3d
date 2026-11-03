import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { DirectionalLight } from "@aura3d/scene";
import { registerForwardDrawHook, type RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { Renderer, type RenderSource } from "../../../packages/rendering/src/Renderer";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { rendererProgramCache } from "../../../packages/rendering/src/renderer/qrSubFlags";
import { fakeGeneratedStaticWebGLCanvas, preparedGeneratedStaticUnlitPair } from "./static-generated-unlit-fake-webgl";

// The fake models native calls and reflection; it is not a GLSL compiler or
// evidence of pixel output on a driver.
const flags = createTrustedQrFlags({
  A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false
});
const matrixAt = (x: number): number[] => [
  0.25, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 1, 0, x, 0, 0, 1
];

async function fixture(parallelCompile = false) {
  const gl = fakeGeneratedStaticWebGLCanvas();
  gl.generated.parallelCompile = parallelCompile;
  const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 128, height: 128, qrFlags: flags });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial();
  const items: [RenderItem, RenderItem] = [
    { label: "left", geometry, material, modelMatrix: matrixAt(-0.625) },
    { label: "right", geometry, material, modelMatrix: matrixAt(0.625) }
  ];
  const source: RenderSource = {
    staticBatching: true, renderItems: items, cameraPolicy: "identity", frustumCulling: false,
    shadow: false, environmentLighting: false
  };
  const render = (overrides: Partial<RenderSource> = {}) => renderer.render({ source: { ...source, ...overrides } });
  const dispose = () => { renderer.dispose(); geometry.dispose(); material.dispose(); };
  return { ...gl, renderer, geometry, material, items, source, render, dispose };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Draw = Fixture["nativeDraws"][number];

function generated(draw: Draw): boolean {
  return draw.program?.shaders.some((shader) => shader.source.includes(GENERATED_PROGRAM_MARKER)) === true;
}

function pair(draw: Draw): boolean {
  return draw.name === "drawElementsInstanced"
    && draw.program?.shaders.some((shader) => shader.source.includes("u_batchModel[2]")) === true;
}

/** Every negative case starts only after this same renderer actually paired. */
async function warmedFixture(parallelCompile = false): Promise<Fixture> {
  const f = await fixture(parallelCompile);
  try {
    // An explicitly parallel compiler must finish the ordinary generated
    // program before a pair can be prewarmed and checked below.
    if (parallelCompile) await f.renderer.renderAsync(f.source);
    let submitted = false;
    for (let attempt = 0; attempt < 8 && !submitted; attempt += 1) {
      const start = f.nativeDraws.length;
      const diagnostics = f.render();
      const draws = f.nativeDraws.slice(start);
      if (draws.length === 1 && pair(draws[0]!)) {
        expect(generated(draws[0]!)).toBe(true);
        expect(draws[0]!.args.at(-1)).toBe(2);
        expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
        submitted = true;
      }
    }
    expect(submitted, "the generated pair must reach its native draw before testing a fallback").toBe(true);
    return f;
  } catch (error) {
    f.dispose();
    throw error;
  }
}

function assertOrdinaryGenerated(draws: readonly Draw[]): void {
  expect(draws.map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
  expect(draws.every(generated)).toBe(true);
  expect(draws.some(pair)).toBe(false);
}

/** Compare the unsupported option against the actual opt-out draw sequence. */
function compareOrdinaryFallback(f: Fixture, overrides: Partial<RenderSource>): readonly Draw[] {
  const first = f.nativeDraws.length;
  const reference = f.render({ ...overrides, staticBatching: false });
  const ordinary = f.nativeDraws.slice(first);
  assertOrdinaryGenerated(ordinary);
  expect(reference).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
  const second = f.nativeDraws.length;
  const actual = f.render({ ...overrides, staticBatching: true });
  const fallback = f.nativeDraws.slice(second);
  assertOrdinaryGenerated(fallback);
  expect(actual).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
  return fallback;
}

function attributedTriangle(): Geometry {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "uv", components: 2, offset: 12 },
    { semantic: "color", components: 4, offset: 20 }
  ], 36);
  const buffer = new VertexBuffer(format, 3);
  const positions = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0, 0.5, 0]] as const;
  const uvs = [[0, 0], [1, 0], [0.5, 1]] as const;
  const colors = [[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1]] as const;
  for (let index = 0; index < 3; index += 1) {
    buffer.setAttribute(index, "position", positions[index]!);
    buffer.setAttribute(index, "uv", uvs[index]!);
    buffer.setAttribute(index, "color", colors[index]!);
  }
  return new Geometry(buffer, new IndexBuffer([0, 1, 2], 3));
}

describe("generated unlit automatic pair: independent fallback controls", () => {
  it("requires explicit opt-in and counts two logical objects for one generated native draw", async () => {
    const f = await warmedFixture();
    try {
      for (const staticBatching of [undefined, false] as const) {
        const ordinaryStart = f.nativeDraws.length;
        const ordinaryDiagnostics = f.render({ staticBatching });
        assertOrdinaryGenerated(f.nativeDraws.slice(ordinaryStart));
        expect(ordinaryDiagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
      }
      const pairStart = f.nativeDraws.length;
      const pairDiagnostics = f.render();
      const draws = f.nativeDraws.slice(pairStart);
      expect(draws).toHaveLength(1);
      expect(pair(draws[0]!)).toBe(true);
      expect(generated(draws[0]!)).toBe(true);
      expect(draws[0]!.args.at(-1)).toBe(2);
      const models = draws[0]!.uniforms.get("u_batchModel");
      expect(models).toBeInstanceOf(Float32Array);
      expect((models as Float32Array).length).toBe(32);
      expect([(models as Float32Array)[12], (models as Float32Array)[28]]).toEqual([-0.625, 0.625]);
      const frame = f.generated.drawBindings.at(-1)!;
      expect(frame.program).toBe(draws[0]!.program);
      expect(frame.bytes.byteLength).toBe(304);
      expect(pairDiagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
    } finally { f.dispose(); }
  });

  it("preserves ordinary generated draws for mapped and vertex-colored materials", async () => {
    const f = await warmedFixture();
    const geometry = attributedTriangle();
    const mapped = new UnlitMaterial();
    const colored = new UnlitMaterial({ vertexColors: true });
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]), generateMipmaps: false });
    mapped.setParameter("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture }));
    try {
      for (const material of [mapped, colored]) {
        const items = f.items.map((item) => ({ ...item, geometry, material }));
        const draws = compareOrdinaryFallback(f, { renderItems: items });
        const source = draws[0]!.program!.shaders.map((shader) => shader.source).join("\n");
        expect(source).toContain(material === mapped ? "#define USE_BASE_COLOR_MAP" : "#define VERTEX_COLORS");
      }
    } finally { texture.dispose(); geometry.dispose(); mapped.dispose(); colored.dispose(); f.dispose(); }
  });

  it("retains fog and global clipping through two generated ordinary draws", async () => {
    const f = await warmedFixture();
    try {
      const fog = { mode: "linear" as const, color: [0.1, 0.2, 0.3] as const, near: 1, far: 10, density: 0.1 };
      const fogged = compareOrdinaryFallback(f, { environmentFog: fog });
      expect(fogged[0]!.program!.shaders.some((shader) => shader.source.includes("#define FOG_LINEAR"))).toBe(true);
      const clipped = compareOrdinaryFallback(f, { globalClipping: { planes: [[1, 0, 0, 0]] } });
      expect(clipped[0]!.program!.shaders.some((shader) => shader.source.includes("#define A3D_CLIPPING"))).toBe(true);
    } finally { f.dispose(); }
  });

  it("runs registered draw hooks between the original logical draws", async () => {
    const f = await warmedFixture();
    const events: string[] = [];
    f.state.onNativeDraw = () => events.push("draw");
    const unregister = registerForwardDrawHook({ id: "test.generated-pair-fallback-hook", bind: (item) => events.push(`hook:${item.label}`) });
    try {
      const start = f.nativeDraws.length;
      f.render();
      assertOrdinaryGenerated(f.nativeDraws.slice(start));
      expect(events).toEqual(["hook:left", "draw", "hook:right", "draw"]);
    } finally { unregister(); f.state.onNativeDraw = undefined; f.dispose(); }
  });

  it("preserves each item's onBeforeRender callback and clipped-material resolver", async () => {
    const f = await warmedFixture();
    const events: string[] = [];
    f.state.onNativeDraw = () => events.push("draw");
    try {
      const items = f.items.map((item) => ({ ...item, onBeforeRender: () => events.push(`before:${item.label}`) }));
      const callbackStart = f.nativeDraws.length;
      f.render({ renderItems: items });
      assertOrdinaryGenerated(f.nativeDraws.slice(callbackStart));
      expect(events).toEqual(["before:left", "draw", "before:right", "draw"]);
      events.length = 0;
      const resolverStart = f.nativeDraws.length;
      f.render({ materialClippingFor: (item) => {
        events.push(`clip:${item.label}`);
        return { planes: [[1, 0, 0, 0]] };
      } });
      const draws = f.nativeDraws.slice(resolverStart);
      assertOrdinaryGenerated(draws);
      expect(draws.every((draw) => draw.program!.shaders.some((shader) => shader.source.includes("#define A3D_CLIPPING")))).toBe(true);
      expect(events).toEqual(["clip:left", "clip:right", "draw", "draw"]);
    } finally { f.state.onNativeDraw = undefined; f.dispose(); }
  });

  it("keeps shadow casters and generated forward draws in the opt-out sequence", async () => {
    const f = await warmedFixture();
    const light = new DirectionalLight("generated-pair-shadow");
    light.castsShadow = true;
    const shadow = { light, size: 16, lightMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
    try {
      const referenceStart = f.nativeDraws.length;
      f.render({ shadow, staticBatching: false });
      const reference = f.nativeDraws.slice(referenceStart);
      expect(reference.map((draw) => draw.name)).toEqual(["drawElements", "drawElements", "drawElements", "drawElements"]);
      assertOrdinaryGenerated(reference.slice(-2));
      const actualStart = f.nativeDraws.length;
      f.render({ shadow });
      const actual = f.nativeDraws.slice(actualStart);
      expect(actual.map((draw) => draw.name)).toEqual(reference.map((draw) => draw.name));
      assertOrdinaryGenerated(actual.slice(-2));
      expect(actual.some(pair)).toBe(false);
    } finally { f.dispose(); }
  });

  it("keeps the temporal and generated forward draw sequence with opt-in", async () => {
    const f = await warmedFixture();
    const device = f.renderer.device as WebGL2Device;
    // The fake substitutes presentation only; the temporal and forward
    // passes still submit their real draw commands through the device.
    const present = vi.spyOn(device, "presentLdrPostprocess").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const postprocess = { execution: "auto" as const, sampleCount: 1,
        temporal: { sceneKey: "generated-pair-fallback" }, taa: { blend: 0.9 } };
      const phases = (draws: readonly Draw[]) => draws.map((draw) =>
        draw.program?.shaders.some((shader) => shader.source.includes("AURA_TEMPORAL_VELOCITY")) ? "velocity" : "forward");
      const referenceStart = f.nativeDraws.length;
      f.render({ postprocess, staticBatching: false });
      const reference = f.nativeDraws.slice(referenceStart);
      expect(phases(reference)).toEqual(["velocity", "velocity", "forward", "forward"]);
      assertOrdinaryGenerated(reference.slice(-2));
      const actualStart = f.nativeDraws.length;
      f.render({ postprocess });
      const actual = f.nativeDraws.slice(actualStart);
      expect(phases(actual)).toEqual(phases(reference));
      expect(actual.map((draw) => draw.name)).toEqual(reference.map((draw) => draw.name));
      assertOrdinaryGenerated(actual.slice(-2));
      expect(actual.some(pair)).toBe(false);
      expect(present).toHaveBeenCalledTimes(2);
      expect(warnings.mock.calls.some((args) => args.some((value) => typeof value === "string" && /draw skipped/i.test(value)))).toBe(false);
    } finally { warnings.mockRestore(); present.mockRestore(); f.dispose(); }
  });

  it.each(["vertex", "index"] as const)("flushes a dirty %s buffer through the ordinary path", async (kind) => {
    const f = await warmedFixture();
    try {
      if (kind === "vertex") f.geometry.vertexBuffer.setAttribute(0, "position", [-0.4, -0.5, 0]);
      else f.geometry.indexBuffer!.setIndices(0, [2, 1, 0]);
      const before = f.nativeDraws.length;
      const diagnostics = f.render();
      assertOrdinaryGenerated(f.nativeDraws.slice(before));
      expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2 });
    } finally { f.dispose(); }
  });

  it("does not merge separately mutated material uniforms", async () => {
    const f = await warmedFixture();
    const different = new UnlitMaterial({ color: [0.25, 0.5, 0.75, 1] });
    try {
      const items = [f.items[0], { ...f.items[1], material: different }];
      const draws = compareOrdinaryFallback(f, { renderItems: items });
      const first = draws[0]!.uniforms.get("u_baseColor");
      const second = draws[1]!.uniforms.get("u_baseColor");
      expect(first).toBeInstanceOf(Float32Array);
      expect(second).toBeInstanceOf(Float32Array);
      expect(Array.from(first as Float32Array)).toEqual([1, 1, 1, 1]);
      expect(Array.from(second as Float32Array)).toEqual([0.25, 0.5, 0.75, 1]);
    } finally { different.dispose(); f.dispose(); }
  });

  it.each(["color", "model", "frame"] as const)("declines a prepared ticket after a %s uniform changes and draws both originals", (kind) => {
    // The device-level positive really enters the generated native pair, so a
    // preflight that always declines cannot satisfy the negative assertion.
    const positive = preparedGeneratedStaticUnlitPair();
    try {
      const before = positive.nativeDraws.length;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(positive.device.submitStaticGeneratedUnlitPair(positive.ticket, { onAttempt, onSubmitted })).toBe("submitted");
      const draws = positive.nativeDraws.slice(before);
      expect(draws).toHaveLength(1);
      expect(pair(draws[0]!)).toBe(true);
      expect(generated(draws[0]!)).toBe(true);
      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    } finally { positive.dispose(); }

    const f = preparedGeneratedStaticUnlitPair();
    try {
      const uniforms = f.commands[0].uniforms as Map<string, unknown>;
      if (kind === "color") uniforms.set("u_baseColor", new Float32Array([0.75, 0.5, 0.25, 1]));
      if (kind === "model") {
        const model = new Float32Array(uniforms.get("u_modelMatrix") as Float32Array);
        model[12] = -0.4;
        uniforms.set("u_modelMatrix", model);
      }
      if (kind === "frame") f.device.updateBuffer(f.auraFrameBuffer, 128, new Float32Array([0.625]));
      const before = f.nativeDraws.length;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(onAttempt).not.toHaveBeenCalled();
      expect(onSubmitted).not.toHaveBeenCalled();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]);
      f.device.draw(f.commands[1]);
      const draws = f.nativeDraws.slice(before);
      assertOrdinaryGenerated(draws);
      if (kind === "color") expect(draws[0]!.uniforms.get("u_baseColor")).toEqual(new Float32Array([0.75, 0.5, 0.25, 1]));
      if (kind === "model") expect((draws[0]!.uniforms.get("u_modelMatrix") as Float32Array)[12]).toBeCloseTo(-0.4);
      if (kind === "frame") {
        const bindings = f.generated.drawBindings.slice(-2);
        expect(bindings).toHaveLength(2);
        for (const binding of bindings) {
          expect(new DataView(binding.bytes.buffer, binding.bytes.byteOffset, binding.bytes.byteLength).getFloat32(128, true)).toBe(0.625);
        }
      }
    } finally { f.dispose(); }
  });

  it("matches ordinary generated cache reuse while reducing the physical draw count", async () => {
    const f = await warmedFixture();
    try {
      const cache = rendererProgramCache(f.renderer.device, flags);
      expect(cache).toBeInstanceOf(ProgramCache);
      const concrete = cache as ProgramCache;
      const beforeOrdinary = concrete.reused;
      const ordinaryStart = f.nativeDraws.length;
      f.render({ staticBatching: false });
      assertOrdinaryGenerated(f.nativeDraws.slice(ordinaryStart));
      const ordinaryReuse = concrete.reused - beforeOrdinary;
      expect(ordinaryReuse).toBeGreaterThanOrEqual(2);
      const beforePair = concrete.reused;
      const pairStart = f.nativeDraws.length;
      f.render();
      const draws = f.nativeDraws.slice(pairStart);
      expect(draws).toHaveLength(1);
      expect(pair(draws[0]!)).toBe(true);
      expect(concrete.reused - beforePair).toBe(ordinaryReuse);
    } finally { f.dispose(); }
  });

  it.each(["failed", "pending"] as const)("uses ordinary generated draws when the pair program is %s", async (status) => {
    const f = await warmedFixture(status === "pending");
    try {
      const pairProgram = f.generated.programs.find((entry) => entry.pair)?.program;
      expect(pairProgram).toBeDefined();
      if (status === "failed") f.generated.pairLinkStatus = "failed";
      else f.generated.pairCompletionReady = false;
      const referenceStart = f.nativeDraws.length;
      f.render({ staticBatching: false });
      assertOrdinaryGenerated(f.nativeDraws.slice(referenceStart));
      const queryStart = f.generated.programQueries.length;
      const actualStart = f.nativeDraws.length;
      const diagnostics = f.render();
      assertOrdinaryGenerated(f.nativeDraws.slice(actualStart));
      expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2 });
      const parameter = status === "failed" ? f.gl.LINK_STATUS
        : (f.gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number }).COMPLETION_STATUS_KHR;
      expect(f.generated.programQueries.slice(queryStart).some((query) => query.program === pairProgram && query.parameter === parameter)).toBe(true);
    } finally { f.dispose(); }
  });

  it("does not replay either member after entering the generated native submission", async () => {
    const f = await warmedFixture();
    try {
      const cache = rendererProgramCache(f.renderer.device, flags) as ProgramCache;
      const beforeOrdinary = cache.reused;
      const ordinaryStart = f.nativeDraws.length;
      f.render({ staticBatching: false });
      assertOrdinaryGenerated(f.nativeDraws.slice(ordinaryStart));
      const ordinaryReuse = cache.reused - beforeOrdinary;
      f.state.failInstanced = true;
      const before = f.nativeDraws.length;
      const beforeAttemptReuse = cache.reused;
      expect(() => f.render()).toThrow("instanced draw failed after entry");
      const draws = f.nativeDraws.slice(before);
      expect(draws).toHaveLength(1);
      expect(pair(draws[0]!)).toBe(true);
      expect(generated(draws[0]!)).toBe(true);
      // The first logical acquire has crossed the native attempt boundary;
      // the second has not. Warmup acquisitions occur in both frames.
      expect(cache.reused - beforeAttemptReuse).toBe(ordinaryReuse - 1);
    } finally { f.dispose(); }
  });

  it("does not reuse generated pair resources across context loss", async () => {
    const f = await warmedFixture();
    const device = f.renderer.device as WebGL2Device;
    const previousGeneration = device.generation;
    try {
      const beforeLoss = f.nativeDraws.length;
      f.dispatch("webglcontextlost");
      expect(device.generation).toBeGreaterThan(previousGeneration);
      expect(() => f.render()).toThrow();
      expect(f.nativeDraws.slice(beforeLoss)).toEqual([]);
      let unsubscribe = () => {};
      const restored = new Promise<void>((resolve) => { unsubscribe = device.onDeviceRestored(resolve); });
      f.dispatch("webglcontextrestored");
      await restored;
      unsubscribe();
      const beforeRestoreDraws = f.nativeDraws.length;
      f.render();
      assertOrdinaryGenerated(f.nativeDraws.slice(beforeRestoreDraws));
    } finally { f.dispose(); }
  });
});
