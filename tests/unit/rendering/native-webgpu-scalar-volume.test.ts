import { describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import "../../../packages/rendering/src/lanes/prd01";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import type { DrawCommand, RecursiveUniformValue, RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { FRAME_RESOURCES, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { PRD01_FORWARD_TARGET } from "../../../packages/rendering/src/renderer/FrameGraph";
import { assertScalarVolumeRoute, type ScalarVolumeDrawRecord, type ScalarVolumeRoute } from "../../../packages/rendering/src/renderer/ScalarVolumeFrame";
import { drawScalarVolumeOnWebGPU, WEBGPU_SCALAR_VOLUME_SHADER, WebGPUScalarVolumeRenderer } from "../../../packages/rendering/src/webgpu/ScalarVolumePass";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import { scalarVolume } from "../../../packages/engine/src/agent-api/nodes/scalarVolume";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { asRuntimeImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { compileScene, updateCompiledScene } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// Independent on-axis reference for standard perspective clip planes. The
// coefficients are rounded as the renderer's Float32 projection is rounded.
function clipReference(backend: "webgl2" | "webgpu", far: number, opaqueDepth = 1) {
  const near = 0.1;
  const glA = far === Infinity ? -1 : Math.fround(-(far + near) / (far - near));
  const glB = far === Infinity ? Math.fround(-2 * near) : Math.fround(-2 * far * near / (far - near));
  const a = backend === "webgpu" ? Math.fround((glA - 1) / 2) : glA;
  const b = backend === "webgpu" ? Math.fround(glB / 2) : glB;
  const cameraDepth = (ndc: number) => Math.fround(-b / Math.fround(ndc + a));
  const origin = cameraDepth(backend === "webgpu" ? 0 : -1);
  const midpoint = cameraDepth(backend === "webgpu" ? 0.5 : 0);
  const depthLimit = backend === "webgpu" ? opaqueDepth : opaqueDepth * 2 - 1;
  const clipOrigin = Math.fround(Math.fround(a * origin) + b);
  const planeOrigin = Math.fround(Math.fround(depthLimit * -origin) - clipOrigin);
  const planeSlope = Math.fround(depthLimit + a); // ray direction [0, 0, -1]
  const last = planeSlope < 0 ? Math.fround(-planeOrigin / planeSlope) : Infinity;
  return { origin, midpoint, last, lastCameraDistance: -origin + last, oldCameraDistance: -cameraDepth(0.999999), planeSlope };
}

// These tests exercise real Aura device routing against a recording WebGPU API;
// the mock neither compiles WGSL nor rasterizes pixels.
async function fixture(options: { readonly canvas?: boolean; readonly beginFrame?: boolean; readonly maxBytes?: number } = {}) {
  const textures: Array<{ label: string; format: string; dimension?: string; destroyed: number; createView(): object; destroy(): void }> = [];
  const shaders: string[] = [];
  const pipelines: WebGPURenderPipelineDescriptorLike[] = [];
  const passes: WebGPURenderPassDescriptorLike[] = [];
  const writes: Array<{ label: string; data: number[] }> = [];
  const fences: Array<() => void> = [];
  let onSubmit: (() => void) | undefined;
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native = {
    features: new Set<string>(), lost,
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxTextureDimension3D: 2048 },
    queue: {
      writeBuffer() {},
      writeTexture(destination: { texture: { label: string } }, data: ArrayBufferView) {
        const copy = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
        writes.push({ label: destination.texture.label, data: Array.from(copy) });
      },
      submit(commands: readonly unknown[]) { if (commands.length) onSubmit?.(); },
      onSubmittedWorkDone() { return new Promise<void>((resolve) => fences.push(resolve)); }
    },
    createBuffer() { return { destroy() {} }; },
    createTexture(descriptor: { label?: string; format: string; dimension?: string }) {
      const texture = { label: descriptor.label ?? "", format: descriptor.format, dimension: descriptor.dimension,
        destroyed: 0, createView() { return { texture }; }, destroy() { texture.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    createShaderModule(descriptor: { code: string }) { shaders.push(descriptor.code); return descriptor; },
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}),
    createCommandEncoder() {
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        passes.push(descriptor);
        return { setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {}, setBlendConstant() {}, setViewport() {}, setScissorRect() {}, draw() {}, drawIndexed() {}, end() {} };
      }, finish: () => ({}) };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  let canvasConfiguration: object | null = null;
  const canvasContext = { configure(configuration: object) { canvasConfiguration = configuration; }, getConfiguration: () => canvasConfiguration,
    getCurrentTexture: () => ({ format: "bgra8unorm", usage: 0x10, sampleCount: 1, createView: () => ({}), destroy() {} }), unconfigure() {} };
  const canvas = { width: 4, height: 4, getContext: () => canvasContext } as unknown as HTMLCanvasElement;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native, ...(options.canvas ? { canvas } : {}),
    ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  const target = device.createRenderTarget({ label: "volume-target", width: 4, height: 4, format: "rgba16f", depth: "texture" });
  const copy = device.createRenderTarget({ label: "volume-depth-copy", width: 4, height: 4, depth: "texture" });
  if (options.beginFrame !== false) { device.beginFrame(4, 4); device.setRenderTarget(target); }
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, target, copy, textures, shaders, pipelines, passes, writes, lose, canvas,
    onSubmit(callback?: () => void) { onSubmit = callback; }, finishFences,
    async close() { onSubmit = undefined; if (!target.disposed) target.dispose(); if (!copy.disposed) copy.dispose();
      if (!device.disposed) device.dispose(); await finishFences(); } };
}

function volume(f: Awaited<ReturnType<typeof fixture>>) {
  return new WebGPUScalarVolumeRenderer(f.device, { dimensions: [2, 2, 2], data: Int16Array.of(-3, -2, -1, 0, 1, 2, 3, 4),
    domain: [-3, 4], sampleCount: 48, density: 0.75, clipPlanes: [[1, 0, 0, -0.25]],
    transfer: [{ value: -3, color: [0, 0, 1, 0] }, { value: 4, color: [1, 0, 0, 0.6] }] });
}

function record(renderer: WebGPUScalarVolumeRenderer, f: Awaited<ReturnType<typeof fixture>>): ScalarVolumeDrawRecord {
  return { renderer, frameLease: renderer.acquireFrameLease(f.device), modelMatrix: identity(),
    worldBounds: { min: [0, 0, 0], max: [1, 1, 1] }, layerMask: 1, frustumCulled: false, renderOrder: 0,
    mode: { type: "slice", axis: "z", position: 0.25 } };
}
function context(f: Awaited<ReturnType<typeof fixture>>): FrameContributorContext {
  return { device: f.device, width: 4, height: 4, rasterViewportIsFull: true, rasterViewProjectionMatrix: identity(),
    camera: { position: [0, 0, 2], depth: { mode: "standard", clipRange: "minus-one-to-one", clearValue: 1, compare: "less-equal" } },
    blackboard: new Map<string, unknown>([[PRD01_FORWARD_TARGET, f.target], [FRAME_RESOURCES.sceneDepthCopy, f.copy], ["prd01.outputColorSpace", "linear"]])
  } as unknown as FrameContributorContext;
}

describe("native WebGPU scalar volume", () => {
  it.each(["webgl2", "webgpu"] as const)("clips %s finite and infinite far planes without an epsilon endpoint", backend => {
    const finite = clipReference(backend, 10_000);
    // The old 0.999999 endpoint cut off this otherwise visible sample.
    expect(finite.oldCameraDistance).toBeLessThan(9700);
    expect(finite.lastCameraDistance).toBeGreaterThan(9700);
    expect(finite.lastCameraDistance).toBeLessThan(11_000);
    expect(Number.isFinite(finite.midpoint)).toBe(true);
    const infinite = clipReference(backend, Infinity);
    expect(Number.isFinite(infinite.midpoint)).toBe(true);
    expect(infinite.planeSlope).toBe(0);
    expect(infinite.last).toBe(Infinity);
    const occluded = clipReference(backend, Infinity, 0.75);
    expect(occluded.lastCameraDistance).toBeCloseTo(0.4, 6);
    const source = backend === "webgpu" ? WEBGPU_SCALAR_VOLUME_SHADER.webgpu!.fragment
      : readFileSync(new URL("../../../packages/rendering/src/VolumeRenderer.ts", import.meta.url), "utf8");
    expect(source).not.toContain("unproject(0.999999)");
    expect(source).not.toContain("unproject(ndc, 0.999999)");
    // invariant: source must keep `nearH.w == 0.0 || middleH.w == 0.0` — the volume ray clip guards degenerate homogeneous w so infinite-depth pixels stay finite
    expect(source).toContain("nearH.w == 0.0 || middleH.w == 0.0");
    expect(source).toContain("planeSlope < 0.0");
    expect(source).toContain("planeSlope > 0.0");
    expect(source).toContain("planeOrigin < 0.0");
  });

  it("submits 3D scalar sampling, transfer and copied depth through a real device draw", async () => {
    const f = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    try {
      const commands: DrawCommand[] = [];
      const checked = f.device.drawChecked.bind(f.device);
      vi.spyOn(f.device, "drawChecked").mockImplementation(command => { commands.push(command); checked(command); });
      const route = { device: f.device, deviceGeneration: f.device.generation, camera: context(f).camera, coreOutput: true,
        postprocess: false, backgroundCoverage: false, explicitTarget: false, multiView: false, fullViewport: true,
        renderScale: 1, globalClipping: false, transmission: false, deferred: false } as ScalarVolumeRoute;
      expect(() => assertScalarVolumeRoute([draw], route)).not.toThrow();
      drawScalarVolumeOnWebGPU(context(f), draw, { deviceGeneration: f.device.generation, assertCurrent() {} });
      expect(commands).toHaveLength(1);
      const uniforms = commands[0]!.uniforms!;
      expect(uniforms.get("u_steps")).toBe(48);
      expect(uniforms.get("u_density")).toBe(0.75);
      expect(uniforms.get("u_planeCount")).toBe(1);
      expect(Array.from(uniforms.get("u_planes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, -0.25]);
      expect(uniforms.get("u_sliceAxis")).toBe(2);
      expect(uniforms.get("u_slicePosition")).toBe(0.25);
      // Identity Aura camera maps z=-1,1 to WebGPU z=0,1.
      expect(Array.from(uniforms.get("u_mvp") as Float32Array)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);
      expect((uniforms.get("u_depth") as TextureBinding).texture).toBe(f.copy.depthTexture);
      expect(f.textures.some(item => item.label === "scalar-volume-webgpu-field" && item.format === "r32float" && item.dimension === "3d")).toBe(true);
      const bytes = f.writes.find(item => item.label === "scalar-volume-webgpu-field")!.data;
      expect(Array.from(new Float32Array(Uint8Array.from(bytes).buffer))).toEqual([-3, -2, -1, 0, 1, 2, 3, 4]);
      expect(f.shaders.some(code => code.includes("textureLoad(u_volumeTexture") && code.includes("textureLoad(u_depthTexture") && code.includes("aura.u_planes[i]"))).toBe(true);
      const state = f.pipelines.at(-1)!;
      expect(state.depthStencil).toMatchObject({ depthWriteEnabled: false, depthCompare: "less-equal" });
      expect(state.fragment!.targets[0]!.blend).toMatchObject({
        color: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      });
      expect(f.passes.length).toBeGreaterThan(0);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });

  it("rejects aliased, foreign, stale and partial raster depth routes", async () => {
    const f = await fixture(); const other = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    const frame = { deviceGeneration: f.device.generation, assertCurrent() {} };
    try {
      const makeContext = (copy: RenderTarget) => { const value = context(f); value.blackboard.set(FRAME_RESOURCES.sceneDepthCopy, copy); return value; };
      expect(() => drawScalarVolumeOnWebGPU(makeContext(f.target), draw, frame)).toThrow(/depth copy/i);
      expect(() => drawScalarVolumeOnWebGPU(makeContext(other.copy), draw, frame)).toThrow(/owned/i);
      const invalidColor = context(f); invalidColor.blackboard.set("prd01.outputColorSpace", "srgb");
      expect(() => drawScalarVolumeOnWebGPU(invalidColor, draw, frame)).toThrow(/linear/i);
      const partial = { ...context(f), rasterViewportIsFull: false };
      expect(() => drawScalarVolumeOnWebGPU(partial, draw, frame)).toThrow(/raster/i);
      f.device.setViewport(0, 0, 2, 4);
      expect(() => drawScalarVolumeOnWebGPU(context(f), draw, frame)).toThrow(/viewport/i);
      expect(() => renderer.drawWebGPU({ viewProjectionMatrix: identity(), depthTexture: f.target.depthTexture!, width: 4, height: 4 })).toThrow(/distinct/i);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); await other.close(); }
  });

  it("submits bounded raymarch controls and a transformed model using the copied depth", async () => {
    const f = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    try {
      const checked = f.device.drawChecked.bind(f.device); let command: DrawCommand | undefined;
      vi.spyOn(f.device, "drawChecked").mockImplementation(next => { command = next; checked(next); });
      const model = identity(); model[12] = 0.25; model[13] = 0.5; model[14] = 0.75;
      drawScalarVolumeOnWebGPU(context(f), { ...draw, modelMatrix: model, mode: { type: "raymarch" } },
        { deviceGeneration: f.device.generation, assertCurrent() {} });
      expect(command!.uniforms!.get("u_sliceAxis")).toBe(-1);
      expect(command!.uniforms!.get("u_steps")).toBe(48);
      const mvp = command!.uniforms!.get("u_mvp") as Float32Array;
      expect(Array.from(mvp.slice(12, 16))).toEqual([0.25, 0.5, 0.875, 1]);
      expect((command!.uniforms!.get("u_depth") as TextureBinding).texture).toBe(f.copy.depthTexture);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });

  it("fails closed when the device's texture budget cannot hold the field and transfer", async () => {
    const f = await fixture({ maxBytes: 500 }); const renderer = volume(f); const draw = record(renderer, f);
    try {
      expect(() => drawScalarVolumeOnWebGPU(context(f), draw, { deviceGeneration: f.device.generation, assertCurrent() {} })).toThrow(/budget/i);
      expect(renderer.getDiagnostics().disposed).toBe(false);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });

  it("preserves submitted frame data until its lease releases and retires GPU allocations after fences", async () => {
    const f = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    try {
      let command: DrawCommand | undefined;
      const checked = f.device.drawChecked.bind(f.device);
      vi.spyOn(f.device, "drawChecked").mockImplementation(next => { command = next; checked(next); });
      drawScalarVolumeOnWebGPU(context(f), draw, { deviceGeneration: f.device.generation, assertCurrent() {} });
      const oldField = (command!.uniforms!.get("u_volume") as TextureBinding).texture!;
      const nativeField = f.textures.find(item => item.label === "scalar-volume-webgpu-field")!;
      renderer.updateData({ dimensions: [2, 2, 2], data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) });
      expect(() => draw.frameLease.assertCurrent()).toThrow(/stale/i);
      expect(oldField.disposed).toBe(false);
      expect(renderer.getDiagnostics().retainedCpuBytes).toBeGreaterThan(0);
      renderer.dispose();
      expect(oldField.disposed).toBe(false);
      draw.frameLease.release(); draw.frameLease.release();
      expect(oldField.disposed).toBe(true);
      expect(renderer.getDiagnostics().retainedCpuBytes).toBe(0);
      expect(nativeField.destroyed).toBe(0);
      await f.finishFences();
      expect(nativeField.destroyed).toBe(1);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });

  it("rejects invalid limits, collapsed clip normals, singular matrices and stale frame updates", async () => {
    const f = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    try {
      expect(() => renderer.setClipPlanes([[1e-100, 0, 0, 0]])).toThrow(/normal/);
      expect(() => renderer.updateData({ dimensions: [2, 2, 3], data: new Uint8Array(8) })).toThrow(/length/);
      expect(() => renderer.setSampleCount(513)).toThrow(/sampleCount/);
      expect(() => renderer.drawWebGPU({ viewProjectionMatrix: new Float32Array(16), depthTexture: f.copy.depthTexture!, width: 4, height: 4 })).toThrow(/invertible/);
      renderer.setDensity(0.5);
      expect(() => drawScalarVolumeOnWebGPU(context(f), draw, { deviceGeneration: f.device.generation, assertCurrent() {} })).toThrow(/stale/);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });

  it.each([false, true])("loads an authored scene and submits depth copy, volume and output in order (async=%s)", async asynchronous => {
    const f = await fixture({ canvas: true, beginFrame: false });
    const renderFlags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_OUTPUT: true });
    const renderer = new Renderer(f.device, { backend: "webgpu", width: 4, height: 4, canvas: f.canvas, qrFlags: renderFlags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const header = new TextEncoder().encode("NRRD0005\ntype: uint8\ndimension: 3\nsizes: 2 2 2\nencoding: raw\nspace: right-anterior-superior\nspace directions: (1,0,0) (0,1,0) (0,0,1)\nspace origin: (0,0,0)\n\n");
    const bytes = new Uint8Array(header.length + 8); bytes.set(header); bytes.set([0, 1, 2, 3, 4, 5, 6, 7], header.length);
    const asset = defineAuraAssets({ scan: { type: "scalar-volume", format: "nrrd", url: "https://assets.example/scan.nrrd",
      hash: `sha256-${createHash("sha256").update(bytes).digest("hex")}`, metadata: { sourcePath: "public/aura-assets/scan.nrrd" } } }).scan;
    const snapshot = scene().add(primitives.box({ size: 0.5 })).add(scalarVolume(asset, { sampleCount: 20, mode: { type: "slice", axis: "y", position: 0.5 },
      position: [1, 2, 3], frustumCulled: false })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });
    const mount: MountSceneCompileContext = { renderer: { device: f.device }, assets: undefined,
      quality: { tier: "high" } as MountSceneCompileContext["quality"], strict: true, flags, degrade() {}, canvas: f.canvas,
      environmentLighting: () => ({ color: [1, 1, 1], intensity: 1 }), collectedLights: [], runtimeWarnings: new Set(), runtimeNodes: registry };
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    let compiled: Awaited<ReturnType<typeof compileScene>> | undefined;
    try {
      compiled = await compileScene(snapshot, mount);
      expect(asRuntimeImpl(compiled)).not.toBeNull();
      const source = updateCompiledScene(compiled, snapshot, registry, 0) as { scalarVolumes: ScalarVolumeDrawRecord[]; postprocess: object };
      expect((source as { postprocess?: unknown }).postprocess).toMatchObject({ targetFormat: "rgba16f", toneMapping: { operator: "aces" } });
      expect(renderer.outputPathActive).toBe(true);
      expect(source.scalarVolumes).toHaveLength(1);
      const draw = source.scalarVolumes[0]!;
      expect(draw.renderer).toBeInstanceOf(WebGPUScalarVolumeRenderer);
      expect(draw.modelMatrix[12]).toBeCloseTo(1);
      expect(draw.mode).toEqual({ type: "slice", axis: "y", position: 0.5 });
      const commands: string[] = [], draws: DrawCommand<RecursiveUniformValue>[] = [], original = f.device.draw.bind(f.device);
      vi.spyOn(f.device, "draw").mockImplementation(command => { commands.push(command.label ?? ""); draws.push(command); original(command); });
      const present = f.device.presentLdrPostprocess.bind(f.device);
      const presentations = vi.spyOn(f.device, "presentLdrPostprocess").mockImplementation((target, options) => {
        commands.push("present"); present(target, options);
      });
      const camera = { viewMatrix: identity(), projectionMatrix: identity(), viewProjectionMatrix: identity() };
      const input = { source, camera, frameId: 1 };
      if (asynchronous) await renderer.renderAsync(input); else renderer.render(input);
      const copy = commands.indexOf("prd01-scene-depth-copy"), volume = commands.indexOf("aura-scalar-volume-webgpu");
      expect(copy).toBeGreaterThanOrEqual(0);
      expect(volume).toBeGreaterThan(copy);
      expect(draws.slice(0, copy).some(command => command.renderState?.depthWrite === true)).toBe(true);
      const copyDepth = (draws[copy]!.uniforms!.get("u_depth") as TextureBinding).texture;
      const volumeDepth = (draws[volume]!.uniforms!.get("u_depth") as TextureBinding).texture;
      expect(copyDepth).not.toBe(volumeDepth);
      expect(commands.indexOf("present")).toBeGreaterThan(volume);
      expect(presentations).toHaveBeenCalledOnce();
      expect(presentations.mock.calls[0]![1].passes.map(pass => pass.name)).toEqual(["tone-mapping"]);
      for (const extra of [{ bloom: { intensity: 0.5 } }, { sampleCount: 4 }]) {
        const effects = { ...source, postprocess: { ...source.postprocess, ...extra } };
        const unsupported = { source: effects, camera, frameId: 2 };
        if (asynchronous) await expect(renderer.renderAsync(unsupported)).rejects.toThrow(/without postprocessing/i);
        else expect(() => renderer.render(unsupported)).toThrow(/without postprocessing/i);
      }
      expect(presentations).toHaveBeenCalledOnce();
      draw.frameLease.assertCurrent();
      compiled.dispose(); compiled = undefined;
      expect(() => draw.frameLease.assertCurrent()).toThrow(/stale|unavailable/i);
    } finally { compiled?.dispose(); renderer.dispose(); vi.unstubAllGlobals(); await f.close(); }
  });

  it("retains native volume resources through reentrant submission and device loss", async () => {
    const f = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    try {
      let duringSubmit = false;
      f.onSubmit(() => { if (!duringSubmit && f.textures.some(texture => texture.label === "scalar-volume-webgpu-field")) {
        duringSubmit = true; renderer.dispose();
        expect(f.textures.find(texture => texture.label === "scalar-volume-webgpu-field")!.destroyed).toBe(0);
      } });
      drawScalarVolumeOnWebGPU(context(f), draw, { deviceGeneration: f.device.generation, assertCurrent() {} });
      expect(duringSubmit).toBe(true);
      expect(() => draw.frameLease.assertCurrent()).toThrow(/stale|unavailable/i);
      draw.frameLease.release();
      await f.finishFences();
      expect(f.textures.find(texture => texture.label === "scalar-volume-webgpu-field")!.destroyed).toBe(1);
      f.lose(); await Promise.resolve(); await Promise.resolve();
      expect(f.device.contextLost).toBe(true);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });

  it("invalidates device-owned volume leases when its WebGPU device is lost", async () => {
    const f = await fixture(); const renderer = volume(f); const draw = record(renderer, f);
    try {
      f.lose(); await Promise.resolve(); await Promise.resolve();
      expect(f.device.contextLost).toBe(true);
      expect(renderer.getDiagnostics()).toMatchObject({ disposed: true, contextLost: true });
      expect(() => draw.frameLease.assertCurrent()).toThrow(/stale|unavailable/i);
      expect(() => drawScalarVolumeOnWebGPU(context(f), draw, { deviceGeneration: f.device.generation, assertCurrent() {} })).toThrow(/stale|unavailable/i);
      draw.frameLease.release();
      expect(renderer.getDiagnostics().retainedCpuBytes).toBe(0);
    } finally { draw.frameLease.release(); renderer.dispose(); await f.close(); }
  });
});
