import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type CameraLike } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat, type VertexAttributeDescriptor } from "../../../packages/rendering/src/VertexFormat";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { GENERATED_UNLIT_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import type { WebGPUDeviceLike, WebGPULike, WebGPURenderPassDescriptorLike, WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";

// Records native-shaped submissions only. This fixture does not compile WGSL or run a GPU.
type Pipeline = { readonly descriptor: WebGPURenderPipelineDescriptorLike; getBindGroupLayout(index: number): object };
type Pass = { readonly descriptor: WebGPURenderPassDescriptorLike; pipeline?: Pipeline; draws: number };

async function fixture() {
  const passes: Pass[] = [];
  const modules: { readonly code: string }[] = [];
  const writes: { readonly label: string; readonly bytes: Uint8Array }[] = [];
  const texture = (descriptor: object) => ({ descriptor, createView() { return { texture: this }; }, destroy() {} });
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: { writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBuffer | ArrayBufferView) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      writes.push({ label: buffer.label ?? "", bytes: bytes.slice() });
    }, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: (descriptor: { label?: string }) => ({ label: descriptor.label, destroy() {} }), createTexture: texture,
    createShaderModule(descriptor: { readonly code: string }) { modules.push(descriptor); return descriptor; },
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike): Pipeline { return { descriptor, getBindGroupLayout: index => ({ index }) }; },
    createBindGroupLayout: (descriptor: object) => ({ descriptor }), createPipelineLayout: (descriptor: object) => ({ descriptor }),
    createBindGroup: (descriptor: object) => ({ descriptor }), createSampler: () => ({}),
    createCommandEncoder() {
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        const pass: Pass = { descriptor, draws: 0 }; passes.push(pass);
        return { setPipeline(pipeline: Pipeline) { pass.pipeline = pipeline; }, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
          setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {}, draw() { pass.draws++; }, drawIndexed() { pass.draws++; }, end() {} };
      }, finish: () => ({}) };
    }, destroy() {}
  } as unknown as WebGPUDeviceLike;
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) } as WebGPULike;
  const canvas = { width: 8, height: 8, getContext: () => ({ configure() {}, getCurrentTexture: () => texture({ format: "bgra8unorm" }) }) } as unknown as HTMLCanvasElement;
  const renderer = await Renderer.create({ backend: "webgpu", webgpu: gpu, canvas, width: 8, height: 8, clearColor: [0, 0, 0, 1],
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
  const camera: CameraLike = { viewMatrix: identity, projectionMatrix: projection, viewProjectionMatrix: projection,
    projectionMetadata: { kind: "perspective", near: 1, far: 11, mode: "standard", clipRange: "minus-one-to-one" } };
  const source = (renderItems: readonly { geometry: Geometry; material: UnlitMaterial }[]) => ({ renderItems,
    cameraPolicy: "require" as const, frustumCulling: false, shadow: { enabled: false },
    postprocess: { v2: true, toneMapping: false as const, pipeline: { dof: { focusDistance: 3 }, antiAliasing: "off" as const,
      toneMapping: "none" as const, exposure: 1, depthRange: { near: 1, far: 11, projection: "perspective" as const } } } });
  return { renderer, camera, source, passes, modules, writes, close() { renderer.dispose(); } };
}

function coloredGeometry(color: Omit<VertexAttributeDescriptor, "semantic" | "offset"> = { components: 4, type: "uint8", normalized: true }, separate = false): Geometry {
  const width = color.type === "uint16" || color.type === "int16" ? 8 : color.type === "float32" || !color.type ? 16 : 4;
  const format = separate
    ? new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "color", offset: 0, ...color, bufferSlot: 1 }], 12,
      [{ slot: 1, stride: width }])
    : new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "color", offset: 12, ...color }], 12 + width);
  const positions = new VertexBuffer(format, 3);
  const colors = separate ? new VertexBuffer(format, 3, 1) : positions;
  for (let i = 0; i < 3; i++) {
    positions.setAttribute(i, "position", [i === 1 ? 0.5 : 0, i === 2 ? 0.5 : 0, -2]);
    colors.setAttribute(i, "color", Array.from({ length: color.components }, (_, c) => c === 3 ? 0 : 1));
  }
  return new Geometry(positions, null, "triangles", undefined, separate ? [colors] : []);
}

function sceneDraws(passes: readonly Pass[]): Pass[] {
  return passes.filter(pass => pass.draws > 0 && pass.pipeline?.descriptor.fragment?.targets.length === 2);
}

describe("native WebGPU depth-of-field scene breadth", () => {
  it.each([false, true])("submits unlit lines and normalized vertex-colored cutouts with paired coverage (async=%s)", async asynchronous => {
    const f = await fixture();
    const lines = Geometry.lineSegments([[0, 0, -2], [0.5, 0.5, -2]]);
    const triangles = coloredGeometry();
    const plain = new UnlitMaterial({ color: [0.2, 0.4, 0.6, 1] });
    const masked = new UnlitMaterial({ color: [0.7, 0.5, 0.3, 1], vertexColors: true, alphaTest: 0.5 });
    try {
      const source = f.source([{ geometry: lines, material: plain }, { geometry: triangles, material: masked }]);
      const result = asynchronous ? await f.renderer.renderAsync(source, f.camera) : f.renderer.render(source, f.camera);
      expect(result.nativeDepthOfField).toMatchObject({ depthPreparation: "submitted", effect: "submitted", pixelValidation: "not-established" });
      const draws = sceneDraws(f.passes);
      expect(draws).toHaveLength(2);
      expect(draws.map(pass => pass.pipeline!.descriptor.primitive?.topology).sort()).toEqual(["line-list", "triangle-list"]);
      for (const pass of draws) {
        expect(pass.pipeline!.descriptor.fragment!.targets[0]).toMatchObject({ format: "rgba16float" });
        expect(pass.pipeline!.descriptor.fragment!.targets[1]).toMatchObject({ format: "rgba8unorm", writeMask: 1 });
        expect(pass.pipeline!.descriptor.depthStencil).toMatchObject({ depthWriteEnabled: true });
      }
      const vertex = f.modules.find(module => module.code.includes("@location(4) color: vec4f"));
      const fragment = f.modules.find(module => module.code.includes("if (base.a < material.alphaControls.x)"));
      expect(vertex?.code).toContain("output.color = color;");
      expect(fragment?.code).toContain("material.baseColor * input.color");
      expect(fragment?.code).toContain("return GeneratedDepthCoverageOutput(vec4f(color, 1.0), vec4f(1.0, 0.0, 0.0, 0.0));");
      expect(fragment!.code.indexOf("discard;")).toBeLessThan(fragment!.code.indexOf("return GeneratedDepthCoverageOutput"));
      const materialPackets = f.writes.filter(write => write.label.endsWith("-generated-unlit-material"));
      expect(materialPackets.some(write => new DataView(write.bytes.buffer, write.bytes.byteOffset, write.bytes.byteLength)
        .getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.alphaControls!, true) === 0.5)).toBe(true);
    } finally { f.close(); lines.dispose(); triangles.dispose(); plain.dispose(); masked.dispose(); }
  });

  it.each(["uint8", "uint16"] as const)("supports a separate normalized %s color stream across frames", async type => {
    const f = await fixture();
    const geometry = coloredGeometry({ components: 4, type, normalized: true }, true);
    const material = new UnlitMaterial({ vertexColors: true });
    try {
      const source = f.source([{ geometry, material }]);
      f.renderer.render(source, f.camera);
      geometry.getAttributeBuffer("color").setAttribute(0, "color", type === "uint8" ? [255, 20, 4, 0] : [65535, 20, 4, 0]);
      f.renderer.render(source, f.camera);
      const draws = sceneDraws(f.passes);
      expect(draws).toHaveLength(2);
      expect(draws[1]!.pipeline!.descriptor.vertex.buffers?.some(buffer => buffer?.attributes.some(attribute =>
        attribute.shaderLocation === 4 && attribute.format === (type === "uint8" ? "unorm8x4" : "unorm16x4")))).toBe(true);
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it.each([
    { components: 4 as const, type: "float32" as const },
    { components: 4 as const, type: "int8" as const, normalized: true },
    { components: 4 as const, type: "uint8" as const, normalized: false },
    { components: 4 as const, type: "uint8" as const, normalized: true, shaderLocation: 5 },
    { components: 3 as const, type: "uint8" as const, normalized: true }
  ])("keeps incompatible vertex color layout %# off the coverage-proof route", async color => {
    const f = await fixture();
    const geometry = coloredGeometry(color);
    const material = new UnlitMaterial({ vertexColors: true });
    try {
      // The general scene route takes the frame; a layout no WebGPU program accepts still fails, but never as a DoF gap.
      try { f.renderer.render(f.source([{ geometry, material }]), f.camera); }
      catch (error) { expect(String((error as { code?: unknown }).code)).not.toMatch(/DOF/); }
      expect(sceneDraws(f.passes)).toHaveLength(0);
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it("serves an out-of-range cutout threshold through the scene route", async () => {
    const f = await fixture();
    const geometry = coloredGeometry();
    const material = new UnlitMaterial({ vertexColors: true, alphaTest: 2 });
    try {
      expect(() => f.renderer.render(f.source([{ geometry, material }]), f.camera)).not.toThrow();
      expect(sceneDraws(f.passes)).toHaveLength(0);
      expect(f.passes.filter(pass => pass.draws > 0).map(pass => pass.pipeline?.descriptor.fragment?.entryPoint)).toContain("fs_dof_composite");
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it("rejects an unbounded color layout introduced after renderer preflight", async () => {
    const f = await fixture();
    const geometry = coloredGeometry();
    const material = new UnlitMaterial({ vertexColors: true });
    const invalid = new VertexFormat([{ semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 12, type: "int8", normalized: true }], 16);
    const draw = f.renderer.device.drawChecked!.bind(f.renderer.device);
    const spy = vi.spyOn(f.renderer.device, "drawChecked" as never).mockImplementation(((command: DrawCommand) =>
      draw({ ...command, vertexFormat: invalid })) as never);
    try {
      expect(() => f.renderer.render(f.source([{ geometry, material }]), f.camera))
        .toThrowError(expect.objectContaining({ code: "WEBGPU_DOF_DRAW_UNSUPPORTED" }));
      expect(sceneDraws(f.passes)).toHaveLength(0);
    } finally { spy.mockRestore(); f.close(); geometry.dispose(); material.dispose(); }
  });
});
