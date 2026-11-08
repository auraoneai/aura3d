import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer, type CameraLike } from "../../../packages/rendering/src/Renderer";
import type { NativeWebGPUDofFrame } from "../../../packages/rendering/src/RenderDevice";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { WebGPUDeviceLike, WebGPULike, WebGPURenderPassDescriptorLike, WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";

// Native-shaped source test: records submitted commands, without claiming that
// the WGSL was compiled or that any physical GPU pixels were observed.
type Pipeline = { readonly descriptor: WebGPURenderPipelineDescriptorLike; getBindGroupLayout(index: number): object };
type Pass = { readonly descriptor: WebGPURenderPassDescriptorLike; pipeline?: Pipeline; draws: number };

async function fixture(clearColor: readonly [number, number, number, number] = [0, 0, 0, 1]) {
  const passes: Pass[] = [];
  const submissions: Pass[][] = [];
  const textures: object[] = [];
  let failNextDepthSubmission = false;
  const texture = (descriptor: { readonly label?: string; readonly format?: string }) => {
    const resource = { label: descriptor.label, format: descriptor.format, createView(viewDescriptor?: object) { return { resource, viewDescriptor }; }, destroy() {} };
    textures.push(resource); return resource;
  };
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: { writeBuffer() {}, writeTexture() {}, submit(commands: readonly { readonly passes: Pass[] }[]) {
      if (failNextDepthSubmission && commands.some(command => command.passes.some(pass => entry(pass) === "fs_linear_depth"))) {
        failNextDepthSubmission = false;
        throw new Error("injected depth submission failure");
      }
      for (const command of commands) submissions.push(command.passes);
    }, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: () => ({ destroy() {} }),
    createTexture: texture,
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike): Pipeline { return { descriptor, getBindGroupLayout: (index: number) => ({ index }) }; },
    createBindGroupLayout: (descriptor: object) => ({ descriptor }),
    createPipelineLayout: (descriptor: object) => ({ descriptor }),
    createBindGroup: (descriptor: object) => ({ descriptor }),
    createSampler: () => ({}),
    createCommandEncoder() {
      const encoded: Pass[] = [];
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        const pass: Pass = { descriptor, draws: 0 }; passes.push(pass); encoded.push(pass);
        return { setPipeline(pipeline: Pipeline) { pass.pipeline = pipeline; }, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
          setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {}, draw() { pass.draws++; }, drawIndexed() { pass.draws++; }, end() {} };
      }, finish: () => ({ passes: encoded }) };
    }, destroy() {}
  } as unknown as WebGPUDeviceLike;
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) } as WebGPULike;
  const context = { configure() {}, getCurrentTexture: () => texture({ label: "canvas", format: "bgra8unorm" }) };
  const canvas = { width: 8, height: 8, getContext: () => context } as unknown as HTMLCanvasElement;
  const renderer = await Renderer.create({ backend: "webgpu", webgpu: gpu, canvas, width: 8, height: 8, clearColor,
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial({ color: [0.2, 0.4, 0.6, 1] });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
  const camera: CameraLike = { viewMatrix: identity, projectionMatrix: projection, viewProjectionMatrix: projection,
    projectionMetadata: { kind: "perspective", near: 1, far: 11, mode: "standard", clipRange: "minus-one-to-one" } };
  const pipeline = { dof: { focusDistance: 3 }, antiAliasing: "off" as const, toneMapping: "none" as const, exposure: 1,
    depthRange: { near: 1, far: 11, projection: "perspective" as const } };
  const source = { renderItems: [{ geometry, material }], cameraPolicy: "require" as const, frustumCulling: false,
    shadow: { enabled: false }, postprocess: { v2: true, toneMapping: false as const, pipeline } };
  return { renderer, geometry, material, camera, source, pipeline, passes, submissions, textures,
    failNextDepth() { failNextDepthSubmission = true; },
    close() { renderer.dispose(); geometry.dispose(); material.dispose(); } };
}

const entry = (pass: Pass): string | undefined => pass.pipeline?.descriptor.fragment?.entryPoint;

describe("native depth of field through the public renderer", () => {
  it.each([false, true])("clears paired coverage and submits the real ordered HDR path (async=%s)", async asynchronous => {
    const f = await fixture();
    const begin = vi.spyOn(f.renderer.device, "beginNativeDepthOfFieldFrame" as never);
    try {
      const diagnostics = asynchronous ? await f.renderer.renderAsync(f.source, f.camera) : f.renderer.render(f.source, f.camera);
      expect(diagnostics.nativeDepthOfField).toEqual({ requested: true, depthPreparation: "submitted", effect: "submitted", pixelValidation: "not-established" });
      // Single-sample depth is sampleable (native SSAO/GTAO); DoF still routes through its own frame proof.
      expect(f.renderer.device.info.capabilities).toContain("depth-textures");
      expect(diagnostics.postprocessTextures).toBe(3);
      const clears = f.passes.filter(pass => pass.descriptor.colorAttachments?.[0]?.loadOp === "load" && pass.descriptor.colorAttachments?.[1]?.loadOp === "clear");
      expect(clears).toHaveLength(1);
      expect(clears[0]!.descriptor.colorAttachments![1]!.clearValue).toEqual([0, 0, 0, 0]);
      const draws = f.passes.filter(pass => pass.draws > 0);
      const scene = draws.find(pass => pass.pipeline?.descriptor.fragment?.targets.length === 2);
      expect(scene?.pipeline?.descriptor.fragment?.targets[0]?.format).toBe("rgba16float");
      expect(scene?.pipeline?.descriptor.fragment?.targets[1]).toMatchObject({ format: "rgba8unorm", writeMask: 1 });
      const names = draws.map(entry), depth = names.indexOf("fs_linear_depth");
      expect(depth).toBeGreaterThan(names.indexOf(entry(scene!)));
      expect(names.slice(depth, depth + 7)).toEqual(["fs_linear_depth", "fs_dof_prefilter", "fs_dof_prefilter_coc", "fs_dof_near_tile",
        "fs_dof_gather", "fs_dof_gather_influence", "fs_dof_composite"]);
      const frame = begin.mock.results[0]!.value as { isCurrent(): boolean };
      expect(frame.isCurrent()).toBe(false);
    } finally { f.close(); }
  });

  it("creates a fresh frame proof and clears reused coverage every frame", async () => {
    const f = await fixture();
    const begin = vi.spyOn(f.renderer.device, "beginNativeDepthOfFieldFrame" as never);
    try {
      f.renderer.render(f.source, f.camera);
      f.renderer.render(f.source, f.camera);
      expect(begin).toHaveBeenCalledTimes(2);
      expect(begin.mock.results[0]!.value).not.toBe(begin.mock.results[1]!.value);
      expect(f.passes.filter(pass => pass.descriptor.colorAttachments?.[0]?.loadOp === "load" && pass.descriptor.colorAttachments?.[1]?.loadOp === "clear")).toHaveLength(2);
    } finally { f.close(); }
  });

  it("keeps submission evidence per issuance when an authored frame ID is reused", async () => {
    const f = await fixture();
    const begin = vi.spyOn(f.renderer.device, "beginNativeDepthOfFieldFrame" as never);
    try {
      const input = { source: f.source, camera: f.camera, frameId: 7 };
      expect(f.renderer.render(input).nativeDepthOfField).toMatchObject({ depthPreparation: "submitted", effect: "submitted" });
      f.failNextDepth();
      expect(() => f.renderer.render(input)).toThrow("injected depth submission failure");
      expect(begin).toHaveBeenCalledTimes(2);
      const first = begin.mock.results[0]!.value as NativeWebGPUDofFrame;
      const second = begin.mock.results[1]!.value as NativeWebGPUDofFrame;
      expect(first).not.toBe(second);
      expect(f.renderer.device.getNativeDepthOfFieldFrameSubmission?.(first)).toEqual({ depthSubmitted: true, effectSubmitted: true });
      expect(f.renderer.device.getNativeDepthOfFieldFrameSubmission?.(second)).toEqual({ depthSubmitted: false, effectSubmitted: false });
    } finally { f.close(); }
  });

  it.each([false, true])("rejects transparent surfaces before drawing (async=%s)", async asynchronous => {
    const f = await fixture();
    try {
      f.material.color = [0.2, 0.4, 0.6, 0.5];
      if (asynchronous) await expect(f.renderer.renderAsync(f.source, f.camera)).rejects.toMatchObject({ code: "NATIVE_DOF_SCENE_UNSUPPORTED" });
      else expect(() => f.renderer.render(f.source, f.camera)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_SCENE_UNSUPPORTED" }));
      expect(f.passes.some(pass => pass.draws > 0)).toBe(false);
    } finally { f.close(); }
  });

  it("rejects missing or inconsistent raster projection metadata and unsupported post stages before drawing", async () => {
    const f = await fixture();
    try {
      const noMetadata = { ...f.camera, projectionMetadata: undefined };
      expect(() => f.renderer.render(f.source, noMetadata)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_PROJECTION_UNSUPPORTED" }));
      const inconsistent = { ...f.camera, projectionMetadata: { ...f.camera.projectionMetadata!, near: 2 } };
      expect(() => f.renderer.render(f.source, inconsistent)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_PROJECTION_UNSUPPORTED" }));
      const withTaa = { ...f.source, postprocess: { ...f.source.postprocess, pipeline: { ...f.pipeline, taa: {} } } };
      expect(() => f.renderer.render(withTaa, f.camera)).toThrowError(expect.objectContaining({ code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED" }));
      expect(f.passes.some(pass => pass.draws > 0)).toBe(false);
    } finally { f.close(); }
  });

  it("rejects partial coverage and nonopaque clear color", async () => {
    const f = await fixture([0, 0, 0, 0]);
    try {
      expect(() => f.renderer.render(f.source, f.camera)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_FRAME_UNSUPPORTED" }));
    } finally { f.close(); }
    const g = await fixture();
    try {
      expect(() => g.renderer.render({ source: g.source, camera: g.camera, viewport: { x: 0, y: 0, width: 4, height: 4 } }))
        .toThrowError(expect.objectContaining({ code: "NATIVE_DOF_FRAME_UNSUPPORTED" }));
      expect(g.passes.some(pass => pass.draws > 0)).toBe(false);
    } finally { g.close(); }
  });

  it("requires an explicit true native capability before allocating a frame", async () => {
    const f = await fixture();
    try {
      vi.spyOn(f.renderer.device, "canPresentNativeDepthOfField" as never).mockReturnValue(1 as never);
      expect(() => f.renderer.render(f.source, f.camera)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_FRAME_UNSUPPORTED" }));
      expect(f.passes.some(pass => pass.draws > 0)).toBe(false);
    } finally { f.close(); }
  });

  it.each([false, true])("refuses multiview native depth of field with a stable code before any view draws (async=%s)", async asynchronous => {
    const f = await fixture();
    const begin = vi.spyOn(f.renderer.device, "beginNativeDepthOfFieldFrame" as never);
    try {
      const views = [
        { id: "left", viewport: { x: 0, y: 0, width: 4, height: 8 }, camera: f.camera },
        { id: "right", viewport: { x: 4, y: 0, width: 4, height: 8 }, camera: f.camera }
      ];
      const input = { source: f.source, views };
      if (asynchronous) {
        await expect(f.renderer.renderAsync(input)).rejects.toMatchObject({ code: "NATIVE_DOF_MULTIVIEW_UNSUPPORTED" });
      } else {
        expect(() => f.renderer.render(input)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_MULTIVIEW_UNSUPPORTED" }));
      }
      expect(begin).not.toHaveBeenCalled();
      expect(f.passes.some(pass => pass.draws > 0)).toBe(false);
      // A view that disables postprocessing does not request native DoF.
      const plain = { source: f.source, views: views.map(view => ({ ...view, postprocess: false as const })) };
      expect(() => f.renderer.render(plain)).not.toThrow();
    } finally { f.close(); }
  });
});
