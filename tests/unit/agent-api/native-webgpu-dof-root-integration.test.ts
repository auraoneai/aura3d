import { afterEach, describe, expect, it, vi } from "vitest";
import { effects, scene } from "../../../packages/engine/src/agent-api/index";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import { recordAuthoredPostContext, resetAuthoredPostContext } from "../../../packages/engine/src/agent-api/postBridge";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, type NativeWebGPUDofFrame, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { createRendererPostprocessPasses } from "../../../packages/rendering/src/RendererPostprocessPlan";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import type { WebGPUDeviceLike, WebGPULike, WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import { RendererPostprocessPipeline, postV2SeamDeclineReason, validateNativeDofRoute } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";

function authoredOptions(): RendererPostProcessOptions {
  recordAuthoredPostContext({ flags: createTrustedQrFlags({ A3D_QR_POST: true }), options: {} });
  return createProductionRuntimePostprocess(scene()
    .add(effects.depthOfField({ focusDistance: 3, fStop: 4, focalLength: 50, maxBlur: 6 }))
    .add(effects.antiAlias({ mode: "off" }))
    .toJSON(), [], 4, 4);
}

function mockNativeFrame() {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgpu" });
  Object.defineProperty(device, "generation", { value: 17 });
  const native = device as RenderDevice;
  native.canPresentNativeDepthOfField = () => true;
  native.validateNativeDepthOfFieldFrame = () => true;
  native.getPresentationAlphaMode = () => "opaque";
  native.negotiateOutputColorSpace = requested => ({ requested: requested ?? "srgb", active: "srgb", supported: ["srgb"] });
  native.presentLdrPostprocess = vi.fn();
  const target = device.createRenderTarget({ width: 4, height: 4, sampleCount: 1, depth: "texture", colorAttachments: [{ format: "rgba16f" }, { format: "rgba8" }] });
  const scopeId = {};
  const frame: NativeWebGPUDofFrame = {
    source: target, coverage: { target, colorAttachment: 1, encoding: "depth-coverage-red8" },
    projection: { kind: "perspective", mode: "standard", clipRange: "zero-to-one", inverseProjection: new Float32Array(16), nearMeters: 0.1, farMeters: 1000, viewportDepthRange: [0, 1], clearValue: 1 },
    maxGeometryDepthMeters: 1001, skyDepthMeters: 2000, alpha: "opaque", depthModel: "single-surface",
    scopeId, viewId: "root", frameId: 1, deviceGeneration: 17, isCurrent: () => true
  };
  const postFrameContext = { source: {}, items: [], scopeId, viewId: "root", frameId: 1, timeSeconds: 0,
    sceneDepth: { texture: target.depthTexture ?? null, available: true, linearize: { near: 0.1, far: 1000, orthographic: false } },
    nativeDepthOfFieldFrame: frame };
  const post = new RendererPostprocessPipeline({ device, width: 4, height: 4 } as unknown as RendererHost);
  return { device, target, scopeId, frame, postFrameContext, post, present: native.presentLdrPostprocess as ReturnType<typeof vi.fn>,
    close() { target.dispose(); device.dispose(); } };
}

// Implements only the WebGPU calls exercised here. It records commands, not
// shader compilation or physical GPU pixels.
function nativeCommandRecorder() {
  const draws: string[] = [];
  const texture = () => ({ createView: () => ({}), destroy() {} });
  const gpuDevice = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
    queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} },
    createBuffer: () => ({ destroy() {} }),
    createTexture: texture,
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createBindGroup: () => ({}),
    createSampler: () => ({}),
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike) {
      return { descriptor, getBindGroupLayout: () => ({}) };
    },
    createCommandEncoder() {
      return {
        beginRenderPass() {
          let fragment: string | undefined;
          const draw = () => { draws.push(fragment ?? "unknown"); };
          return {
            setPipeline(pipeline: { descriptor: WebGPURenderPipelineDescriptorLike }) { fragment = pipeline.descriptor.fragment?.entryPoint; },
            setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw, drawIndexed: draw, end() {}
          };
        },
        finish: () => ({})
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => gpuDevice }) } as WebGPULike;
  const context = { configure() {}, getCurrentTexture: texture };
  const canvas = { width: 4, height: 4, getContext: () => context } as unknown as HTMLCanvasElement;
  return { gpu, canvas, draws };
}

afterEach(() => resetAuthoredPostContext());

describe("root-authored depth of field on native WebGPU", () => {
  it.each([false, true])("carries the authored root effect through the real renderer and mocked native command submission (async=%s)", async asynchronous => {
    const authored = authoredOptions();
    const recorded = nativeCommandRecorder();
    const renderer = await Renderer.create({ backend: "webgpu", webgpu: recorded.gpu, canvas: recorded.canvas, width: 4, height: 4,
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ color: [0.2, 0.4, 0.6, 1] });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
    const camera = { viewMatrix: identity, projectionMatrix: projection, viewProjectionMatrix: projection,
      projectionMetadata: { kind: "perspective" as const, near: 1, far: 11, mode: "standard" as const, clipRange: "minus-one-to-one" as const } };
    const source = { renderItems: [{ geometry, material }], frustumCulling: false, shadow: { enabled: false }, postprocess: authored };
    try {
      const diagnostics = asynchronous ? await renderer.renderAsync(source, camera) : renderer.render(source, camera);
      expect(diagnostics.nativeDepthOfField).toEqual({ requested: true, depthPreparation: "submitted", effect: "submitted", pixelValidation: "not-established" });
      expect(recorded.draws.filter(name => name === "fs_linear_depth")).toHaveLength(1);
      expect(recorded.draws.filter(name => name === "fs_dof_composite")).toHaveLength(1);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("validates the compiler result and presents one native stage (async=%s)", async asynchronous => {
    const authored = authoredOptions();
    const pipeline = authored.pipeline as PostPipelineOptions;
    const fixture = mockNativeFrame();
    try {
      expect(authored.v2).toBe(true);
      expect(authored.depthOfField).toBeTruthy();
      expect(pipeline.dof).toMatchObject({ focusDistance: 3, fStop: 4, focalLengthMm: 50, maxBlurPx: 6 });
      expect(createRendererPostprocessPasses(authored).map(pass => pass.name)).toContain("depth-of-field");
      expect(() => validateNativeDofRoute(authored, pipeline, fixture.scopeId)).not.toThrow();
      const withFrame = { ...authored, postFrameContext: fixture.postFrameContext };
      if (asynchronous) await fixture.post.executePostprocessAsync(withFrame, [fixture.target]);
      else fixture.post.executePostprocess(withFrame, [fixture.target]);
      expect(fixture.present).toHaveBeenCalledOnce();
      const [_source, sent] = fixture.present.mock.calls[0] as [RenderTarget, { passes: { name: string }[]; nativeDepthOfField: { options: unknown; frame: NativeWebGPUDofFrame } }];
      expect(sent.nativeDepthOfField).toEqual({ options: pipeline.dof, frame: fixture.frame });
      expect(sent.passes.map(pass => pass.name)).not.toContain("depth-of-field");
      expect(sent.passes.map(pass => pass.name)).toContain("tone-mapping");
    } finally { fixture.close(); }
  });

  it.each([false, true])("reaches the renderer's subsequent native-frame guard (async=%s)", async asynchronous => {
    const authored = authoredOptions();
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    Object.defineProperty(renderer.device, "kind", { value: "webgpu" });
    renderer.device.canPresentNativeDepthOfField = () => false;
    const source = { renderItems: [], postprocess: authored };
    try {
      if (asynchronous) await expect(renderer.renderAsync(source)).rejects.toMatchObject({ code: "NATIVE_DOF_FRAME_UNSUPPORTED" });
      else expect(() => renderer.render(source)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_FRAME_UNSUPPORTED" }));
    } finally { renderer.dispose(); }
  });

  it("keeps the original legacy pass available to WebGL and its CPU fallback", () => {
    const authored = authoredOptions();
    const legacyPasses = createRendererPostprocessPasses(authored);
    expect(legacyPasses.find(pass => pass.name === "depth-of-field")?.options).toBe(authored.depthOfField);
    expect(authored.depthOfField).toEqual({ focusDepth: 0.02, focusRange: 0.125, maxRadius: 6 });
    expect(postV2SeamDeclineReason("webgl2", authored, legacyPasses, true)).toBeNull();
    expect(postV2SeamDeclineReason("webgl2", { ...authored, execution: "cpu-deterministic" }, legacyPasses, true)).toBe("cpu-deterministic");
    recordAuthoredPostContext({ flags: createTrustedQrFlags({ A3D_QR_POST: false }), options: {} });
    const legacyOnly = createProductionRuntimePostprocess(scene().add(effects.depthOfField({ maxBlur: 6 })).toJSON());
    expect(legacyOnly.v2).not.toBe(true);
    expect(legacyOnly.depthOfField).toEqual({ focusDepth: 0.02, focusRange: 0.125, maxRadius: 6 });
  });

  it("rejects independent or subsequently changed DoF stages", () => {
    const authored = authoredOptions();
    const pipeline = authored.pipeline as PostPipelineOptions;
    const legacy = authored.depthOfField as Exclude<RendererPostProcessOptions["depthOfField"], false | undefined>;
    const dof = pipeline.dof as Record<string, unknown>;
    const reject = (post: RendererPostProcessOptions, candidate: PostPipelineOptions) =>
      expect(() => validateNativeDofRoute(post, candidate, {})).toThrowError(expect.objectContaining({ code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED" }));
    reject({ ...authored, depthOfField: { ...legacy } }, pipeline);
    reject(authored, { ...pipeline, dof: { ...dof } });
    (legacy as { maxRadius: number }).maxRadius = 7;
    reject(authored, pipeline);
    (legacy as { maxRadius: number }).maxRadius = 6;
    dof.focusDistance = 4;
    reject(authored, pipeline);
    dof.focusDistance = 3;
    Object.defineProperty(legacy, "additionalStage", { value: true, configurable: true });
    reject(authored, pipeline);
    delete (legacy as unknown as Record<string, unknown>).additionalStage;
    expect(() => validateNativeDofRoute(authored, pipeline, {})).not.toThrow();
  });

  it("still rejects separate post effects and multiple authored DoF nodes", () => {
    const authored = authoredOptions();
    const pipeline = authored.pipeline as PostPipelineOptions;
    for (const stage of [{ ao: {} }, { ssr: {} }, { taa: {} }, { vignette: {} },
      { antiAliasing: "smaa" }, { nativeEffects: [{ kind: "pixelation", size: 2 }] }, { customPasses: [{}] }]) {
      expect(() => validateNativeDofRoute(authored, { ...pipeline, ...stage } as PostPipelineOptions, {}))
        .toThrowError(expect.objectContaining({ code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED" }));
    }
    const volume = createProductionRuntimePostprocess(scene().add(effects.depthOfField({ focusDistance: 3 }))
      .add(effects.volumetricFog({ density: 0.2 })).add(effects.antiAlias({ mode: "off" })).toJSON());
    const volumePipeline = volume.pipeline as PostPipelineOptions;
    expect(volumePipeline.godRays).toBeTruthy();
    expect(volume.volumetricLight).toBeUndefined();
    // W4: god rays run as a native WebGPU depth stage after DoF, so the pair combines.
    expect(() => validateNativeDofRoute(volume, volumePipeline, {})).not.toThrow();
    const duplicates = createProductionRuntimePostprocess(scene().add(effects.depthOfField({ focusDistance: 3 }))
      .add(effects.depthOfField({ focusDistance: 9 })).add(effects.antiAlias({ mode: "off" })).toJSON());
    expect(() => validateNativeDofRoute(duplicates, duplicates.pipeline as PostPipelineOptions, {}))
      .toThrowError(expect.objectContaining({ code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED" }));
  });

  it.each([false, true])("still rejects an unsupported multi-view frame before native submission (async=%s)", async asynchronous => {
    const authored = authoredOptions();
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4,
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
    const device = renderer.device;
    Object.defineProperty(device, "kind", { value: "webgpu" });
    device.canPresentNativeDepthOfField = () => true;
    device.beginNativeDepthOfFieldFrame = vi.fn(() => { throw new Error("must not begin"); });
    device.sealNativeDepthOfFieldFrame = () => {};
    device.cancelNativeDepthOfFieldFrame = () => {};
    device.validateNativeDepthOfFieldFrame = () => true;
    device.presentLdrPostprocess = vi.fn();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const input = { source: { renderItems: [], postprocess: authored }, views: [
      { camera: { viewProjectionMatrix: identity }, viewport: { x: 0, y: 0, width: 2, height: 4 } },
      { camera: { viewProjectionMatrix: identity }, viewport: { x: 2, y: 0, width: 2, height: 4 } }
    ] };
    try {
      // Multiview native DoF has its own stable code (docs/rendering/native-backends.md).
      if (asynchronous) await expect(renderer.renderAsync(input)).rejects.toMatchObject({ code: "NATIVE_DOF_MULTIVIEW_UNSUPPORTED" });
      else expect(() => renderer.render(input)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_MULTIVIEW_UNSUPPORTED" }));
      expect(device.beginNativeDepthOfFieldFrame).not.toHaveBeenCalled();
      expect(device.presentLdrPostprocess).not.toHaveBeenCalled();
    } finally { renderer.dispose(); }
  });
});
