import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer, type CameraLike, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { WebGPUDeviceLike, WebGPULike, WebGPURenderPassDescriptorLike, WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import {
  normalizeWebGPUGtaoOptions,
  normalizeWebGPUSsaoOptions,
  packWebGPUAoLinearDepthUniforms,
  packWebGPUGtaoUniforms,
  webgpuGtaoFragment,
  WEBGPU_AO_APPLY_FRAGMENT,
  WEBGPU_AO_LINEAR_DEPTH_FRAGMENT,
  WEBGPU_SSAO_FRAGMENT
} from "../../../packages/rendering/src/webgpu/WebGPUAmbientOcclusion";

// Native-shaped source test: records submitted commands and bind groups. It
// does not compile WGSL or observe GPU pixels (the browser capture does).
type Layout = { readonly descriptor: { readonly entries: readonly { readonly binding: number; readonly texture?: { readonly sampleType: string } }[] } };
type Pipeline = { readonly descriptor: WebGPURenderPipelineDescriptorLike & { readonly layout?: unknown }; getBindGroupLayout(index: number): object };
type Pass = { readonly descriptor: WebGPURenderPassDescriptorLike; pipeline?: Pipeline; group?: { readonly descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] } }; draws: number };
type View = { readonly resource: { readonly label?: string; readonly format?: string }; readonly viewDescriptor?: { readonly aspect?: string } };

async function fixture() {
  const passes: Pass[] = [];
  const texture = (descriptor: { readonly label?: string; readonly format?: string }) => {
    const resource = { label: descriptor.label, format: descriptor.format, createView(viewDescriptor?: object) { return { resource, viewDescriptor }; }, destroy() {} };
    return resource;
  };
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: () => ({ destroy() {} }),
    createTexture: texture,
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike): Pipeline { return { descriptor, getBindGroupLayout: (index: number) => ({ index }) }; },
    createBindGroupLayout: (descriptor: object) => ({ descriptor }),
    createPipelineLayout: (descriptor: object) => ({ descriptor }),
    createBindGroup: (descriptor: object) => ({ descriptor }),
    createSampler: () => ({}),
    createCommandEncoder() {
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        const pass: Pass = { descriptor, draws: 0 }; passes.push(pass);
        return { setPipeline(pipeline: Pipeline) { pass.pipeline = pipeline; }, setBindGroup(_index: number, group: Pass["group"]) { (pass as { group?: Pass["group"] }).group = group; },
          setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
          draw() { pass.draws++; }, drawIndexed() { pass.draws++; }, end() {} };
      }, finish: () => ({}) };
    }, destroy() {}
  } as unknown as WebGPUDeviceLike;
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) } as WebGPULike;
  const context = { configure() {}, getCurrentTexture: () => texture({ label: "canvas", format: "bgra8unorm" }) };
  const canvas = { width: 8, height: 8, getContext: () => context } as unknown as HTMLCanvasElement;
  const renderer = await Renderer.create({ backend: "webgpu", webgpu: gpu, canvas, width: 8, height: 8,
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial({ color: [0.2, 0.4, 0.6, 1] });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
  const camera: CameraLike = { viewMatrix: identity, projectionMatrix: projection, viewProjectionMatrix: projection,
    projectionMetadata: { kind: "perspective", near: 1, far: 11, mode: "standard", clipRange: "minus-one-to-one" } };
  const render = (postprocess: RendererPostProcessOptions) => {
    passes.length = 0;
    renderer.render({ renderItems: [{ geometry, material }], cameraPolicy: "require", frustumCulling: false, shadow: { enabled: false }, postprocess }, camera);
    return passes.filter(pass => pass.draws > 0);
  };
  return { renderer, render, close() { renderer.dispose(); geometry.dispose(); material.dispose(); } };
}

const entry = (pass: Pass): string | undefined => pass.pipeline?.descriptor.fragment?.entryPoint;
const textureViews = (pass: Pass): View[] => (pass.group?.descriptor.entries ?? []).filter(item => item.binding >= 2).map(item => item.resource as View);
const sampleTypes = (pass: Pass): string[] => ((pass.pipeline?.descriptor.layout as { descriptor?: { bindGroupLayouts?: Layout[] } } | undefined)
  ?.descriptor?.bindGroupLayouts?.[0]?.descriptor.entries ?? []).flatMap(item => item.texture ? [item.texture.sampleType] : []);

describe("native WebGPU ambient occlusion", () => {
  it("advertises sampleable single-sample depth", async () => {
    const f = await fixture();
    try { expect(f.renderer.device.info.capabilities).toContain("depth-textures"); } finally { f.close(); }
  });

  it("runs the legacy ssao pass after tone mapping on the forward target's depth-only view", async () => {
    const f = await fixture();
    try {
      const draws = f.render({ ssao: { radius: 3, intensity: 0.4, bias: 0.025 }, toneMapping: { operator: "aces", outputColorSpace: "srgb" } });
      const names = draws.map(entry);
      const ssao = draws.find(pass => entry(pass) === "fs_ssao");
      expect(ssao).toBeDefined();
      expect(names.indexOf("fs_ssao")).toBeGreaterThan(names.indexOf("fs_tone"));
      expect(sampleTypes(ssao!)).toEqual(["unfilterable-float", "unfilterable-float"]);
      const [color, depth] = textureViews(ssao!);
      expect(color?.resource.format).not.toMatch(/^depth/);
      expect(depth?.resource.format).toMatch(/^depth/);
      expect(depth?.viewDescriptor?.aspect).toBe("depth-only");
      expect(f.renderer.device.captureState().get("nativeSsaoPasses")).toBe(1);
    } finally { f.close(); }
  });

  it("runs v2 GTAO on the HDR source before tone mapping and drops the legacy ssao twin", async () => {
    const f = await fixture();
    try {
      const pipeline = { ao: { radius: 0.5, intensity: 0.8, falloff: 1, directions: 4, steps: 4, halfRes: true, temporal: false, multiBounce: true, fallbackStrength: 0.1 },
        antiAliasing: "off" as const, toneMapping: "aces" as const, exposure: 1, depthRange: { near: 1, far: 11, projection: "perspective" as const } };
      const draws = f.render({ v2: true, pipeline, ssao: { radius: 3, intensity: 0.4, bias: 0.025 }, toneMapping: { operator: "aces", outputColorSpace: "srgb" } });
      const names = draws.map(entry);
      const start = names.indexOf("fs_ao_linear_depth");
      expect(start).toBeGreaterThan(0);
      expect(names.slice(start, start + 6)).toEqual(["fs_ao_linear_depth", "fs_ao_minmax_half", "fs_gtao", "fs_ao_denoise", "fs_ao_denoise", "fs_ao_apply"]);
      expect(names.indexOf("fs_tone")).toBeGreaterThan(start + 5);
      expect(names).not.toContain("fs_ssao");
      const linear = draws[start]!, apply = draws[start + 5]!;
      expect(textureViews(linear)[0]?.viewDescriptor?.aspect).toBe("depth-only");
      expect(textureViews(linear)[0]?.resource.format).toMatch(/^depth/);
      expect(sampleTypes(apply)).toEqual(["unfilterable-float", "unfilterable-float", "unfilterable-float", "unfilterable-float"]);
      // The linear-depth targets are rgba32float; the AO targets rgba8; apply keeps the HDR source format.
      expect(linear.pipeline?.descriptor.fragment?.targets[0]?.format).toBe("rgba32float");
      expect(draws[start + 2]!.pipeline?.descriptor.fragment?.targets[0]?.format).toBe("rgba8unorm");
      expect(apply.pipeline?.descriptor.fragment?.targets[0]?.format).toBe("rgba16float");
      expect(f.renderer.device.captureState().get("nativeAmbientOcclusionPasses")).toBe(1);
    } finally { f.close(); }
  });

  it("reads a 4x forward depth attachment as a multisampled depth texture instead of refusing the target", async () => {
    const f = await fixture();
    try {
      const pipeline = { ao: { radius: 0.5, intensity: 0.8 }, antiAliasing: "msaa" as const, toneMapping: "aces" as const, exposure: 1,
        depthRange: { near: 1, far: 11, projection: "perspective" as const } };
      const draws = f.render({ v2: true, pipeline, sampleCount: 4, toneMapping: { operator: "aces", outputColorSpace: "srgb" } });
      const linear = draws.find(pass => entry(pass) === "fs_ao_linear_depth");
      expect(linear).toBeDefined();
      expect(String((linear!.pipeline!.descriptor.fragment as unknown as { module: { code: string } }).module.code)).toContain("texture_depth_multisampled_2d");
      const layout = (linear!.pipeline!.descriptor.layout as { descriptor: { bindGroupLayouts: Layout[] } }).descriptor.bindGroupLayouts[0]!.descriptor.entries;
      expect(layout.find(item => item.binding === 2)?.texture).toEqual({ sampleType: "depth", viewDimension: "2d", multisampled: true });
      expect(draws.map(entry)).toContain("fs_ao_apply");
    } finally { f.close(); }
  });
});

describe("native WebGPU ambient occlusion parameters", () => {
  it("validates ssao options like the WebGL2 kernel", () => {
    expect(normalizeWebGPUSsaoOptions({})).toEqual({ radius: 2, intensity: 0.38, bias: 0.015 });
    expect(normalizeWebGPUSsaoOptions({ radius: 0.42 })).toMatchObject({ radius: 3 });
    expect(() => normalizeWebGPUSsaoOptions({ radius: 9 })).toThrow(/radius/);
    expect(() => normalizeWebGPUSsaoOptions({ intensity: 3 })).toThrow(/intensity/);
    expect(() => normalizeWebGPUSsaoOptions({ bias: Number.NaN })).toThrow(/bias/);
    expect(WEBGPU_SSAO_FRAGMENT).toContain("select(d, 1.0 - d, u_ssao.reversed > 0.5)");
  });

  it("linearizes both depth encodings from the frame's clip planes", () => {
    const near = 0.5, far = 200;
    const [nearValue, farValue, perspective, reversed] = packWebGPUAoLinearDepthUniforms({ near, far, orthographic: false, reversed: true });
    expect([nearValue, farValue, perspective, reversed]).toEqual([Math.fround(1 / near), Math.fround(1 / far), 1, 1]);
    // The shader's perspective decode, run on the CPU for a point 10 m away.
    const z = 10, standard = (1 / z - 1 / near) / (1 / far - 1 / near);
    const decode = (d: number, isReversed: boolean) => { const w = isReversed ? d : 1 - d; return 1 / (w * nearValue! + (1 - w) * farValue!); };
    expect(decode(standard, false)).toBeCloseTo(z, 3);
    expect(decode(1 - standard, true)).toBeCloseTo(z, 3);
    expect(packWebGPUAoLinearDepthUniforms({ near, far: Infinity, orthographic: false, reversed: false })[1]).toBe(0);
    expect(() => packWebGPUAoLinearDepthUniforms({ near: 0, far, orthographic: false, reversed: false })).toThrow(/DEPTH_RANGE/);
    expect(WEBGPU_AO_LINEAR_DEPTH_FRAGMENT).toContain("AO_SKY_DEPTH = 3e38");
  });

  it("packs the v2 S2 defaults and specializes the GTAO kernel", () => {
    const options = normalizeWebGPUGtaoOptions({ fallbackStrength: 0.6 });
    expect(options).toEqual({ radius: 0.35, intensity: 1, falloff: 1, directions: 4, steps: 4, multiBounce: true, fallbackStrength: 0.1 });
    const inverse = new Float32Array(16).map((_value, index) => index % 5 === 0 ? 1 : 0);
    const data = packWebGPUGtaoUniforms({ projectionMatrix: [1, 0, 0, 0, 0, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], projectionMatrixInverse: inverse, orthographic: false }, options, 7);
    expect(data.byteLength).toBe(96);
    expect(Array.from(data.subarray(16))).toEqual([2, 0, 0.3499999940395355, 1, 1, 1, 1, 7]);
    expect(webgpuGtaoFragment(2, 6)).toContain("const GTAO_DIRECTIONS: i32 = 2;");
    expect(webgpuGtaoFragment(2, 6)).toContain("const GTAO_STEPS: i32 = 6;");
    expect(WEBGPU_AO_APPLY_FRAGMENT).toContain("clamp(hdr.a - 2.0, 0.0, 1.0)");
  });
});
