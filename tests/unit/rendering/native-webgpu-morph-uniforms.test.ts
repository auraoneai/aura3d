import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { MorphUnlitMaterial } from "../../../packages/rendering/src/MorphUnlitMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { DEFAULT_MORPH_UNLIT_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibraryCore";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import type { DrawCommand, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import type { MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";

// This mock captures native WGSL, buffer writes and submitted draw commands;
// it does not compile WGSL, execute a GPU, or establish output pixels.
interface NativeBuffer { readonly label: string; readonly bytes: Uint8Array; destroyed: boolean; destroy(): void }
interface NativeModule { readonly label?: string; readonly code: string }
interface NativePipeline { readonly descriptor: { readonly vertex: { readonly module: NativeModule }; readonly label?: string }; getBindGroupLayout(index: number): object }
interface NativeGroup { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }
interface NativeDraw { readonly indexed: boolean; readonly args: readonly number[]; readonly vertex: Uint8Array;
  readonly uniforms: Uint8Array; readonly shader: string; readonly index?: Uint8Array }

function harness(limits: { readonly maxUniformBufferBindingSize?: number; readonly maxBufferSize?: number } = {}) {
  const modules: NativeModule[] = [];
  const submissions: NativeDraw[] = [];
  const buffers: NativeBuffer[] = [];
  let onDraw: (() => void) | undefined;
  const native = {
    features: new Set<string>(),
    limits: { maxUniformBufferBindingSize: limits.maxUniformBufferBindingSize ?? 65536, maxBufferSize: limits.maxBufferSize ?? 1_000_000,
      maxVertexBuffers: 8, maxVertexAttributes: 16, maxVertexBufferArrayStride: 2048 },
    queue: {
      writeBuffer(buffer: NativeBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        buffer.bytes.set(bytes, offset);
      },
      submit(commands: readonly { readonly draws: readonly NativeDraw[] }[]) { for (const command of commands) submissions.push(...command.draws); },
      onSubmittedWorkDone: async () => undefined
    },
    createBuffer(descriptor: { readonly label?: string; readonly size: number }) {
      if (descriptor.size > (limits.maxBufferSize ?? 1_000_000)) throw new Error("mock maxBufferSize exceeded");
      const buffer: NativeBuffer = { label: descriptor.label ?? "", bytes: new Uint8Array(descriptor.size), destroyed: false,
        destroy() { buffer.destroyed = true; } };
      buffers.push(buffer); return buffer;
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createShaderModule(module: NativeModule) { modules.push(module); return module; },
    createRenderPipeline(descriptor: NativePipeline["descriptor"]) {
      return { descriptor, getBindGroupLayout: (index: number) => ({ index }) };
    },
    createBindGroup: (group: NativeGroup) => group,
    createSampler: () => ({}),
    createCommandEncoder() {
      const draws: NativeDraw[] = [];
      return {
        beginRenderPass() {
          let pipeline: NativePipeline | undefined, vertex: NativeBuffer | undefined, index: NativeBuffer | undefined;
          const groups = new Map<number, NativeGroup>();
          const record = (indexed: boolean, args: readonly number[]) => {
            const uniform = groups.get(0)?.entries.find((entry) => entry.binding === 0)?.resource as { readonly buffer?: NativeBuffer } | undefined;
            if (!pipeline || !vertex || !uniform?.buffer) throw new Error("mock draw did not bind required native state");
            draws.push({ indexed, args, vertex: vertex.bytes.slice(), uniforms: uniform.buffer.bytes.slice(), shader: pipeline.descriptor.vertex.module.code,
              ...(index ? { index: index.bytes.slice() } : {}) });
            onDraw?.();
          };
          return {
            setPipeline(value: NativePipeline) { pipeline = value; },
            setBindGroup(slot: number, value: NativeGroup) { groups.set(slot, value); },
            setVertexBuffer(slot: number, value: NativeBuffer) { if (slot === 0) vertex = value; },
            setIndexBuffer(value: NativeBuffer) { index = value; }, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(...args: number[]) { record(false, args); }, drawIndexed(...args: number[]) { record(true, args); }, end() {}
          };
        },
        finish: () => ({ draws })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const gpu: WebGPULike = { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "bgra8unorm" };
  const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const canvas = { width: 4, height: 4, getContext: () => context } as unknown as HTMLCanvasElement;
  return { native, gpu, canvas, modules, submissions, buffers, onDraw(callback?: () => void) { onDraw = callback; } };
}

function geometry(vertexCount: number, indices?: readonly number[]): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) vertices.setAttribute(vertex, "position", [vertex / 100, 0, 0]);
  return new Geometry(vertices, indices ? new IndexBuffer(indices, vertexCount) : null, "triangles");
}

function targetDeltas(targetCount: number, vertexCount: number): MorphTargetDelta[] {
  return Array.from({ length: targetCount }, (_, target) => ({ positions: Array.from({ length: vertexCount }, (_, vertex) =>
    [target + vertex / 1000, (target + 1) / 4, -vertex / 100] as const) }));
}

function packedDeltas(targetCount = 4): Float32Array {
  const out = new Float32Array(4 * 64 * 4);
  for (let target = 0; target < targetCount; target += 1) for (let vertex = 0; vertex < 64; vertex += 1) {
    out.set([target + vertex / 1000, (target + 1) / 4, -vertex / 100, 0], (target * 64 + vertex) * 4);
  }
  return out;
}

function floatData(draw: NativeDraw): Float32Array {
  return new Float32Array(draw.uniforms.buffer, draw.uniforms.byteOffset, draw.uniforms.byteLength / 4);
}

function expectCode(action: () => void, code: string): void {
  let thrown: unknown;
  try { action(); } catch (error) { thrown = error; }
  expect(thrown).toMatchObject({ code });
}

function expectPacked(draw: NativeDraw, weights: readonly number[], count: number, deltas: Float32Array): void {
  expect(draw.uniforms.byteLength).toBe(4208);
  const data = floatData(draw);
  expect(Array.from(data.slice(20, 24))).toEqual(weights.map(Math.fround));
  expect(data[24]).toBe(count);
  for (const target of [0, 1, 2, 3]) for (const vertex of [0, 7, 8, 63]) {
    const offset = (target * 64 + vertex) * 4;
    expect(Array.from(data.slice(28 + offset, 28 + offset + 4))).toEqual(Array.from(deltas.slice(offset, offset + 4)));
  }
  expect(Array.from(data.slice(28, 28 + 1024))).toEqual(Array.from(deltas));
}

function expectMorphShader(draw: NativeDraw): void {
  expect(draw.shader).toMatch(/@builtin\s*\(\s*vertex_index\s*\)/);
  expect(draw.shader).toMatch(/array\s*<\s*vec4(?:\s*<\s*f32\s*>|f)\s*,\s*256/);
  expect(draw.shader).toMatch(/target\s*\*\s*64u?\s*\+\s*vertexIndex/);
  expect(draw.shader).toMatch(/weights\s*\[\s*target\s*\]/);
}

async function rendererHarness() {
  const f = harness();
  const renderer = await Renderer.create({ backend: "webgpu", webgpu: f.gpu, canvas: f.canvas, width: 4, height: 4,
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false }) });
  return { ...f, renderer };
}

async function deviceHarness(limits: { readonly maxUniformBufferBindingSize?: number; readonly maxBufferSize?: number } = {}) {
  const f = harness(limits);
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => f.native }, device: f.native });
  const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
  const shader = device.createShaderProgram(createDefaultShaderLibrary().compileSource(DEFAULT_MORPH_UNLIT_SHADER_NAME));
  const vertex = device.createBuffer("vertex", 67 * 12, new Float32Array(67 * 3));
  device.beginFrame(4, 4); device.setRenderTarget(target);
  const uniforms = new Map<string, UniformValue>([["u_modelViewProjection", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
    ["u_baseColor", [0.2, 0.4, 0.8, 1]], ["u_morphWeights", [0, 0.5, -1, 2]], ["u_morphTargetCount", 4],
    ["u_morphPositionDeltas", packedDeltas()]]);
  const command: DrawCommand = { label: "direct-morph", topology: "triangles", vertexBuffer: vertex, vertexFormat: VertexFormat.P3,
    firstVertex: 61, vertexCount: 3, shader, uniforms };
  return { ...f, device, target, shader, vertex, uniforms, command,
    close() { target.dispose(); vertex.dispose(); shader.dispose(); device.dispose(); } };
}

describe("native WebGPU morph uniforms", () => {
  it("carries four target-major morph blocks through a real nonindexed renderer draw", async () => {
    const f = await rendererHarness();
    const mesh = geometry(64); const material = new MorphUnlitMaterial({ color: [0.2, 0.4, 0.8, 1] });
    try {
      f.renderer.render({ renderItems: [{ label: "renderer-morph", geometry: mesh, material, drawRange: { start: 7, count: 3 },
        morphTargets: targetDeltas(4, 64), morphWeights: [0, 0.5, -1, 2] }], cameraPolicy: "identity", frustumCulling: false, shadow: { enabled: false } });
      expect(f.submissions).toHaveLength(1);
      const draw = f.submissions[0]!;
      expect(draw.indexed).toBe(false);
      expect(draw.args).toEqual([3, 1, 7]);
      expectMorphShader(draw);
      expectPacked(draw, [0, 0.5, -1, 2], 4, packedDeltas());
      expect(Array.from(floatData(draw).slice(16, 20))).toEqual([0.2, 0.4, 0.8, 1].map(Math.fround));
      expect(Array.from(new Float32Array(draw.vertex.buffer).slice(0, 3))).toEqual([0, 0, 0]);
    } finally { f.renderer.dispose(); mesh.dispose(); material.dispose(); }
  });

  it("preserves indexed renderer ranges and deltas at vertices 7, 8 and 63", async () => {
    const f = await rendererHarness();
    const mesh = geometry(64, [0, 7, 8, 63, 8, 7]); const material = new MorphUnlitMaterial();
    try {
      f.renderer.render({ renderItems: [{ geometry: mesh, material, drawRange: { start: 1, count: 3 },
        morphTargets: targetDeltas(4, 64), morphWeights: [0, 0.5, -1, 2] }], cameraPolicy: "identity", frustumCulling: false, shadow: { enabled: false } });
      expect(f.submissions).toHaveLength(1);
      const draw = f.submissions[0]!;
      expect(draw.indexed).toBe(true);
      expect(draw.args).toEqual([3, 1, 1]);
      expect(Array.from(new Uint16Array(draw.index!.buffer).slice(1, 4))).toEqual([7, 8, 63]);
      expectPacked(draw, [0, 0.5, -1, 2], 4, packedDeltas());
    } finally { f.renderer.dispose(); mesh.dispose(); material.dispose(); }
  });

  for (const [vertexCount, targetCount] of [[8, 5], [65, 1]] as const) {
    it(`uses CPU-deformed vertices and a zero native morph count for ${vertexCount} vertices and ${targetCount} targets`, async () => {
      const f = await rendererHarness();
      const mesh = geometry(vertexCount); const material = new MorphUnlitMaterial();
      const targets = targetDeltas(targetCount, vertexCount);
      const weights = Array.from({ length: targetCount }, (_, index) => index === 0 ? -0.5 : 0.25);
      try {
        f.renderer.render({ renderItems: [{ geometry: mesh, material, morphTargets: targets, morphWeights: weights }],
          cameraPolicy: "identity", frustumCulling: false, shadow: { enabled: false } });
        expect(f.submissions).toHaveLength(1);
        const draw = f.submissions[0]!;
        expect(draw.uniforms.byteLength).toBe(4208);
        expect(floatData(draw)[24]).toBe(0);
        const uploaded = new Float32Array(draw.vertex.buffer);
        for (const vertex of [0, vertexCount - 1]) {
          for (let component = 0; component < 3; component += 1) {
            const base = component === 0 ? Math.fround(vertex / 100) : 0;
            const expected = targets.reduce((sum, target, index) => sum + target.positions![vertex]![component]! * weights[index]!, base);
            expect(uploaded[vertex * 3 + component]).toBeCloseTo(expected, 5);
          }
        }
        expectMorphShader(draw);
      } finally { f.renderer.dispose(); mesh.dispose(); material.dispose(); }
    });
  }

  it("uses only the selected indexed range and accepts count-zero vertices beyond 63", async () => {
    const f = await deviceHarness();
    const indices = f.device.createBuffer("index", 8, new Uint16Array([64, 63, 7, 8]));
    try {
      f.device.draw({ ...f.command, indexBuffer: indices, indexType: "uint16", firstIndex: 1, indexCount: 3 });
      expect(f.submissions).toHaveLength(1);
      expect(f.submissions[0]!.args).toEqual([3, 1, 1]);
      expectPacked(f.submissions[0]!, [0, 0.5, -1, 2], 4, packedDeltas());
      f.uniforms.set("u_morphTargetCount", 0);
      f.uniforms.delete("u_morphWeights"); f.uniforms.delete("u_morphPositionDeltas");
      f.device.draw({ ...f.command, firstVertex: 64, vertexCount: 3 });
      expect(f.submissions).toHaveLength(2);
      expect(f.submissions[1]!.args).toEqual([3, 1, 64]);
      expect(floatData(f.submissions[1]!)[24]).toBe(0);
    } finally { indices.dispose(); f.close(); }
  });

  it("submits nonindexed ranges containing vertices 0, 7, 8 and 63 without clamping", async () => {
    const f = await deviceHarness();
    try {
      for (const firstVertex of [0, 7, 61]) f.device.draw({ ...f.command, firstVertex, vertexCount: 3 });
      expect(f.submissions.map((draw) => draw.args)).toEqual([[3, 1, 0], [3, 1, 7], [3, 1, 61]]);
      for (const draw of f.submissions) {
        expect(draw.indexed).toBe(false);
        expectMorphShader(draw);
        expectPacked(draw, [0, 0.5, -1, 2], 4, packedDeltas());
      }
    } finally { f.close(); }
  });

  it("rejects an indexed draw without its required explicit index count", async () => {
    const f = await deviceHarness();
    const indices = f.device.createBuffer("index", 8, new Uint16Array([64, 63, 7, 8]));
    try {
      expectCode(() => f.device.draw({ ...f.command, indexBuffer: indices, indexType: "uint16" }), "INVALID_DRAW_COMMAND");
      expect(f.submissions).toHaveLength(0);
    } finally { indices.dispose(); f.close(); }
  });

  it("rejects malformed direct uniforms and unsupported texture mode before native submission", async () => {
    const f = await deviceHarness();
    try {
      const bad = [
        new Map(f.uniforms).set("u_morphTargetCount", -1), new Map(f.uniforms).set("u_morphTargetCount", 1.5),
        new Map(f.uniforms).set("u_morphTargetCount", 5), new Map(f.uniforms).set("u_morphTargetCount", NaN),
        new Map(f.uniforms).set("u_morphWeights", [1, 2, 3]), new Map(f.uniforms).set("u_morphWeights", [1, 2, NaN, 4]),
        new Map(f.uniforms).set("u_morphPositionDeltas", new Float32Array(12)),
        new Map(f.uniforms).set("u_morphTargetCount", 1).set("u_morphPositionDeltas", new Float32Array(257)),
        new Map(f.uniforms).set("u_morphPositionDeltas", Float32Array.from(packedDeltas(), (_, index) => index === 9 ? Infinity : 0))
      ];
      const missingWeights = new Map(f.uniforms); missingWeights.delete("u_morphWeights"); bad.push(missingWeights);
      const missingDeltas = new Map(f.uniforms); missingDeltas.delete("u_morphPositionDeltas"); bad.push(missingDeltas);
      for (const uniforms of bad) {
        expectCode(() => f.device.draw({ ...f.command, uniforms }), "WEBGPU_MORPH_UNIFORM_INVALID");
        expect(f.submissions).toHaveLength(0);
      }
      expectCode(() => f.device.draw({ ...f.command, uniforms: new Map(f.uniforms).set("u_morphUsesTexture", 1) }), "WEBGPU_MORPH_TEXTURE_UNSUPPORTED");
      expectCode(() => f.device.draw({ ...f.command, firstVertex: 64, vertexCount: 3 }), "WEBGPU_MORPH_VERTEX_RANGE");
      expect(f.submissions).toHaveLength(0);
    } finally { f.close(); }
  });

  for (const limits of [{ maxUniformBufferBindingSize: 4207 }, { maxBufferSize: 4207 }]) {
    it(`rejects a device too small for the morph binding (${Object.keys(limits)[0]})`, async () => {
      const f = await deviceHarness(limits);
      try {
        expectCode(() => f.device.draw(f.command), "WEBGPU_MORPH_UNIFORM_LIMIT");
        expect(f.submissions).toHaveLength(0);
      } finally { f.close(); }
    });
  }

  it("rejects an index-buffer update during draw encoding before native submission", async () => {
    const f = await deviceHarness();
    const indices = f.device.createBuffer("index", 8, new Uint16Array([0, 7, 8, 63]));
    try {
      f.onDraw(() => { f.onDraw(undefined); f.device.updateBuffer(indices, 0, new Uint16Array([0, 8, 7, 63])); });
      expectCode(() => f.device.draw({ ...f.command, indexBuffer: indices, indexType: "uint16", firstIndex: 1, indexCount: 3 }), "WEBGPU_MORPH_DRAW_STALE");
      expect(f.submissions).toHaveLength(0);
    } finally { f.onDraw(undefined); indices.dispose(); f.close(); }
  });

  it("keeps ordinary unlit draws independent of the morph uniform contract", async () => {
    const f = await deviceHarness();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_COMPILER: true });
    const generated = generateProgramImpl(normalizeProgramFeatures({ lighting: "unlit", features: { "a3d.nativePrimitive": "triangles" } }), { flags });
    const ordinary = f.device.createShaderProgram({ label: "unrelated-generated-unlit", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const frame = f.device.createBuffer("uniform", 304, new Float32Array(76));
    try {
      f.device.bindUniformBuffer(frame, 0);
      const unrelated = new Map<string, UniformValue>([["u_morphTargetCount", 99], ["u_morphWeights", [NaN]]]);
      expect(() => f.device.draw({ ...f.command, shader: ordinary, uniforms: unrelated })).not.toThrow();
      expect(f.submissions).toHaveLength(1);
      expect(f.submissions[0]!.uniforms.byteLength).not.toBe(4208);
    } finally { frame.dispose(); ordinary.dispose(); f.close(); }
  });
});
