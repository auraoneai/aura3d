import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer, type CameraLike } from "../../../packages/rendering/src/Renderer";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerPostPass } from "../../../packages/rendering/src/contracts/post";
import { nativeDofDisplayStagesFor } from "../../../packages/rendering/src/webgpu/NativeDofDisplayStages";
import type { WebGPUDeviceLike, WebGPULike, WebGPURenderPassDescriptorLike, WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";

// Native-shaped source test (W2 combinations): records submitted commands and
// uniform writes. It does not compile WGSL or observe GPU pixels.
type Pipeline = { readonly descriptor: WebGPURenderPipelineDescriptorLike; getBindGroupLayout(index: number): object };
type Pass = { readonly descriptor: WebGPURenderPassDescriptorLike; pipeline?: Pipeline; draws: number };

async function fixture(pipelineExtra: Record<string, unknown> = {}, postExtra: Record<string, unknown> = {}) {
  const passes: Pass[] = [];
  const modules: string[] = [];
  const writes = new Map<string, Float32Array>();
  const texture = (descriptor: { readonly label?: string; readonly format?: string; readonly sampleCount?: number }) => {
    const resource = { label: descriptor.label, format: descriptor.format, sampleCount: descriptor.sampleCount ?? 1,
      createView(viewDescriptor?: object) { return { resource, viewDescriptor }; }, destroy() {} };
    return resource;
  };
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: { writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBufferView) {
      if (buffer.label) writes.set(buffer.label, new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
    }, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: (descriptor: { label?: string }) => ({ label: descriptor.label, destroy() {} }),
    createTexture: texture,
    createShaderModule: (descriptor: { code: string }) => { modules.push(descriptor.code); return descriptor; },
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike): Pipeline { return { descriptor, getBindGroupLayout: (index: number) => ({ index }) }; },
    createBindGroupLayout: (descriptor: object) => ({ descriptor }),
    createPipelineLayout: (descriptor: object) => ({ descriptor }),
    createBindGroup: (descriptor: object) => ({ descriptor }),
    createSampler: () => ({}),
    createCommandEncoder() {
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        const pass: Pass = { descriptor, draws: 0 }; passes.push(pass);
        return { setPipeline(pipeline: Pipeline) { pass.pipeline = pipeline; }, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
          setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {}, draw() { pass.draws++; }, drawIndexed() { pass.draws++; }, end() {} };
      }, finish: () => ({}) };
    }, destroy() {}
  } as unknown as WebGPUDeviceLike;
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) } as WebGPULike;
  const context = { configure() {}, getCurrentTexture: () => texture({ label: "canvas", format: "bgra8unorm" }) };
  const canvas = { width: 8, height: 8, getContext: () => context } as unknown as HTMLCanvasElement;
  const renderer = await Renderer.create({ backend: "webgpu", webgpu: gpu, canvas, width: 8, height: 8, clearColor: [0, 0, 0, 1],
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial({ color: [0.2, 0.4, 0.6, 1] });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
  const camera: CameraLike = { viewMatrix: identity, projectionMatrix: projection, viewProjectionMatrix: projection,
    projectionMetadata: { kind: "perspective", near: 1, far: 11, mode: "standard", clipRange: "minus-one-to-one" } };
  const pipeline = { dof: { focusDistance: 3 }, antiAliasing: "off" as const, toneMapping: "none" as const, exposure: 1,
    depthRange: { near: 1, far: 11, projection: "perspective" as const }, ...pipelineExtra };
  const source = { renderItems: [{ geometry, material }], cameraPolicy: "require" as const, frustumCulling: false,
    shadow: { enabled: false }, postprocess: { v2: true, toneMapping: false as const, pipeline, ...postExtra } };
  return { renderer, camera, source, passes, modules, writes,
    close() { renderer.dispose(); geometry.dispose(); material.dispose(); } };
}

const entry = (pass: Pass): string | undefined => pass.pipeline?.descriptor.fragment?.entryPoint;
const drawn = (passes: readonly Pass[]): (string | undefined)[] => passes.filter(pass => pass.draws > 0).map(entry);
const msaa = { antiAliasing: "msaa" as const };

describe("native WebGPU depth of field with MSAA (resolve to single-sample first)", () => {
  it.each([false, true])("draws a 4x producer, resolves it, then runs the depth-of-field chain on the single-sample source (async=%s)", async asynchronous => {
    const f = await fixture(msaa, { sampleCount: 4 });
    const begin = vi.spyOn(f.renderer.device, "beginNativeDepthOfFieldFrame" as never);
    try {
      const diagnostics = asynchronous ? await f.renderer.renderAsync(f.source, f.camera) : f.renderer.render(f.source, f.camera);
      expect(diagnostics.nativeDepthOfField).toMatchObject({ requested: true, depthPreparation: "submitted", effect: "submitted" });
      const descriptor = begin.mock.calls[0]![0] as { source: RenderTarget; multisample?: RenderTarget };
      expect(descriptor.multisample?.sampleCount).toBe(4);
      expect(descriptor.source.sampleCount).toBe(1);
      const draws = f.passes.filter(pass => pass.draws > 0);
      const scene = draws.find(pass => pass.pipeline?.descriptor.fragment?.targets.length === 2 && entry(pass) !== "fs_dof_msaa_resolve")!;
      expect(scene.descriptor.colorAttachments).toHaveLength(2);
      expect(scene.descriptor.colorAttachments!.every(attachment => attachment?.resolveTarget !== undefined)).toBe(true);
      expect((scene.pipeline!.descriptor as { multisample?: { count?: number } }).multisample?.count).toBe(4);
      const names = drawn(f.passes);
      const resolve = names.indexOf("fs_dof_msaa_resolve");
      expect(resolve).toBeGreaterThan(draws.indexOf(scene));
      expect(names.slice(resolve, resolve + 3)).toEqual(["fs_dof_msaa_resolve", "fs_linear_depth", "fs_dof_prefilter"]);
      const resolvePass = draws.find(pass => entry(pass) === "fs_dof_msaa_resolve")!;
      expect(resolvePass.descriptor.depthStencilAttachment).toMatchObject({ depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "store" });
      expect(resolvePass.descriptor.colorAttachments!.map(attachment => attachment?.loadOp)).toEqual(["clear", "clear"]);
      expect(resolvePass.pipeline!.descriptor.depthStencil).toMatchObject({ depthWriteEnabled: true, depthCompare: "always" });
      const code = f.modules.find(module => module.includes("fs_dof_msaa_resolve"))!;
      expect(code).toContain("texture_depth_multisampled_2d");
      expect(code).toContain("nearest = min(nearest");
    } finally { f.close(); }
  });

  it("reuses the resolve target and issues a fresh frame every frame", async () => {
    const f = await fixture(msaa, { sampleCount: 4 });
    const begin = vi.spyOn(f.renderer.device, "beginNativeDepthOfFieldFrame" as never);
    try {
      f.renderer.render(f.source, f.camera);
      f.renderer.render(f.source, f.camera);
      const [first, second] = begin.mock.calls.map(call => call[0] as { source: RenderTarget; multisample?: RenderTarget });
      expect(first!.source).toBe(second!.source);
      expect(first!.multisample).toBe(second!.multisample);
      expect(begin.mock.results[0]!.value).not.toBe(begin.mock.results[1]!.value);
      expect(drawn(f.passes).filter(name => name === "fs_dof_msaa_resolve")).toHaveLength(2);
    } finally { f.close(); }
  });

  it("keeps rgba32f (which cannot be multisampled) rejected", async () => {
    const f = await fixture(msaa, { sampleCount: 4, targetFormat: "rgba32f" });
    try {
      expect(() => f.renderer.render(f.source, f.camera)).toThrowError(expect.objectContaining({ code: "NATIVE_DOF_TARGET_UNSUPPORTED" }));
    } finally { f.close(); }
  });
});

describe("native WebGPU depth of field display stages", () => {
  const stages = { vignette: { intensity: 0.3, smoothness: 0.6, roundness: 1, color: { r: 0.2, g: 0.1, b: 0 } },
    filmGrain: { intensity: 0.05, size: 1.5, luminanceResponse: 0.8 }, chromaticAberration: { intensity: 0.004 } };

  it.each([false, true])("runs CA after the DoF composite, vignette after tone and grain last, with MSAA (async=%s)", async asynchronous => {
    const f = await fixture({ ...msaa, ...stages }, { sampleCount: 4, colorGrade: { contrast: 1.1, saturation: 1 } });
    try {
      if (asynchronous) await f.renderer.renderAsync({ source: f.source, camera: f.camera, frameId: 12 });
      else f.renderer.render({ source: f.source, camera: f.camera, frameId: 12 });
      const names = drawn(f.passes);
      const composite = names.indexOf("fs_dof_composite");
      expect(names[composite + 1]).toBe("fs_dof_ca");
      const tone = names.indexOf("fs_tone"), vignette = names.indexOf("fs_dof_vignette"), finalize = names.indexOf("fs_dof_finalize");
      expect(tone).toBeGreaterThan(composite);
      expect(vignette).toBeGreaterThan(Math.max(tone, names.indexOf("fs_grade")));
      expect(finalize).toBeGreaterThan(vignette);
      expect(names[finalize + 1]).toBe("fs_copy");
      expect(Array.from(f.writes.get("webgpu-dof-ca-uniforms")!)[0]).toBeCloseTo(0.004);
      expect(Array.from(f.writes.get("webgpu-dof-vignette-uniforms")!).map(v => Math.round(v * 1000) / 1000))
        .toEqual([0.3, 0.6, 1, 0, 0.2, 0.1, 0, 0, 8, 8, 0, 0]);
      expect(Array.from(f.writes.get("webgpu-dof-finalize-uniforms")!).map(v => Math.round(v * 1000) / 1000)).toEqual([12, 0.05, 1.5, 0.8]);
    } finally { f.close(); }
  });

  it("adds no display stage when none is authored", async () => {
    const f = await fixture();
    try {
      f.renderer.render(f.source, f.camera);
      expect(drawn(f.passes).filter(name => name?.startsWith("fs_dof_") && ["fs_dof_ca", "fs_dof_vignette", "fs_dof_finalize"].includes(name))).toEqual([]);
    } finally { f.close(); }
  });

  it("follows the v2 presence rules", () => {
    expect(nativeDofDisplayStagesFor({})).toBeUndefined();
    expect(nativeDofDisplayStagesFor({ chromaticAberration: { intensity: 0 } })).toBeUndefined();
    expect(nativeDofDisplayStagesFor({ vignette: {} })).toEqual({
      vignette: { intensity: 0, smoothness: 1, roundness: 1, color: [0, 0, 0] },
      finalize: { grainIntensity: 0, grainSize: 1, grainLuminanceResponse: 1 }
    });
    expect(nativeDofDisplayStagesFor({ filmGrain: { intensity: 0.1 } })).toEqual({ finalize: { grainIntensity: 0.1, grainSize: 1, grainLuminanceResponse: 1 } });
    expect(nativeDofDisplayStagesFor({ chromaticAberration: { intensity: 0.002 } })).toEqual({ chromaticAberration: { intensity: 0.002 } });
  });
});

describe("native WebGPU depth of field with registered post passes", () => {
  let release: (() => void) | undefined;
  afterEach(() => { release?.(); release = undefined; });

  const pass = (insertAt: "before-tonemap" | "after-depth") => ({ id: `test-${insertAt}`, owner: "test", insertAt, space: "linear-hdr" as const,
    inputs: ["color" as const], gpuOnly: true, fragment: { glsl: "void main() {}", wgsl: "@group(0) @binding(1) var s: sampler;\n@group(0) @binding(2) var c: texture_2d<f32>;\n@fragment fn fs_test(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> { return textureSample(c, s, uv); }" } });

  it("runs a tone-map anchored pass after depth of field", async () => {
    release = registerPostPass(pass("before-tonemap") as never);
    const f = await fixture();
    try {
      f.renderer.render(f.source, f.camera);
      const names = drawn(f.passes);
      expect(names.indexOf("fs_test")).toBeGreaterThan(names.indexOf("fs_dof_composite"));
      expect(names.indexOf("fs_test")).toBeLessThan(names.indexOf("fs_tone"));
    } finally { f.close(); }
  });

  it("runs a pass anchored before depth of field ahead of it, once", async () => {
    release = registerPostPass(pass("after-depth") as never);
    const f = await fixture();
    try {
      f.renderer.render(f.source, f.camera);
      const names = drawn(f.passes);
      expect(names.filter(name => name === "fs_test")).toHaveLength(1);
      expect(names.indexOf("fs_test")).toBeLessThan(names.indexOf("fs_linear_depth"));
      expect(names.indexOf("fs_dof_composite")).toBeLessThan(names.indexOf("fs_tone"));
    } finally { f.close(); }
  });

  it("skips a pre-DoF pass whose enabled gate is off this frame (an underwater-only pass above water)", async () => {
    release = registerPostPass({ ...pass("after-depth"), enabled: () => false } as never);
    const f = await fixture();
    try {
      const diagnostics = f.renderer.render(f.source, f.camera);
      expect(diagnostics.nativeDepthOfField).toMatchObject({ effect: "submitted" });
      expect(drawn(f.passes)).not.toContain("fs_test");
    } finally { f.close(); }
  });
});

describe("native WebGPU depth of field after S2 AO, S3 SSR and S4 god rays (WebGL2 v2 order)", () => {
  const ao = { radius: 0.5, intensity: 0.8, falloff: 1, directions: 4, steps: 4, multiBounce: true, fallbackStrength: 0.1 };
  const godRays = { samples: 16, decay: 0.94, weight: 0.7, color: [1, 0.9, 0.8], intensity: 0.4, lightDirection: [0, 0.3, -1] };

  it.each([1, 4] as const)("runs AO, SSR, god rays, then DoF on their output, with the legacy twins dropped (samples=%s)", async sampleCount => {
    const f = await fixture({ ao, ssr: { intensity: 0.5 }, godRays, lut: { status: "pending", source: "x.cube" }, ...(sampleCount === 4 ? msaa : {}) },
      { sampleCount, ssao: { radius: 3, intensity: 0.4, bias: 0.025 }, ssr: { intensity: 0.5 }, depthOfField: { focusDepth: 0.2, focusRange: 0.1, maxRadius: 4 } });
    try {
      const diagnostics = f.renderer.render(f.source, f.camera);
      expect(diagnostics.nativeDepthOfField).toMatchObject({ depthPreparation: "submitted", effect: "submitted" });
      const names = drawn(f.passes);
      const order = ["fs_ao_apply", "fs_ssr_composite", "fs_godrays_composite", "fs_linear_depth", "fs_dof_composite", "fs_tone"].map(name => names.indexOf(name));
      expect(order.every(index => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(names).not.toContain("fs_ssao");
      // The DoF color input is the god-ray composite, not the raw forward source.
      const composite = f.passes.filter(item => item.draws > 0).find(item => entry(item) === "fs_godrays_composite")!;
      const prefilter = f.passes.filter(item => item.draws > 0).find(item => entry(item) === "fs_dof_prefilter")!;
      expect(prefilter).toBeDefined();
      expect(composite.descriptor.colorAttachments![0]!.view).toBeDefined();
    } finally { f.close(); }
  });
});

describe("pre-mount WebGPU gap for the W2 combinations", () => {
  const dofGap = (Renderer as unknown as Record<symbol, (post: unknown) => { code: string; missing: string[] } | undefined>)[
    Symbol.for("@aura3d/rendering/webgpu-dof-gap/v1")];
  const dof = { focusDistance: 4 };

  it("admits MSAA, vignette, grain, CA and a targeted outline; still reports the rest", () => {
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "msaa", dof, vignette: { intensity: 0.3 }, filmGrain: { intensity: 0.1 }, chromaticAberration: { intensity: 0.002 } } })).toBeUndefined();
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "msaa", dof }, outline: { color: [1, 1, 1, 1], targets: ["ball"] } })).toBeUndefined();
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "msaa", dof }, outline: { color: [1, 1, 1, 1] } })).toMatchObject({ missing: ["outline"] });
    // AO, SSR, god rays, motion blur, a LUT, registered passes and the legacy twins combine; SMAA, TAA and legacy-only ssao do not.
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "smaa", dof, motionBlur: {}, ao: {}, ssr: {}, lut: {} } })).toMatchObject({
      code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED", missing: ["anti-aliasing-smaa"] });
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "msaa", dof, ao: {}, ssr: {}, lut: {} }, ssao: {}, ssr: {}, depthOfField: { focusDepth: 0.1 } })).toBeUndefined();
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "off", dof, taa: {} }, ssao: {} })).toMatchObject({ missing: ["taa", "ssao"] });
  });

  it("reports display stages on Display-P3 output, which the device refuses", () => {
    expect(dofGap({ v2: true, pipeline: { dof, outputColorSpace: "display-p3", vignette: { intensity: 0.3 } } })).toMatchObject({
      code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED", missing: ["display-p3-display-stages"] });
    expect(dofGap({ v2: true, pipeline: { dof, outputColorSpace: "display-p3" } })).toBeUndefined();
  });
});
