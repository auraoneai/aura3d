import { describe, expect, it } from "vitest";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { packGeneratedPbrMaterialUniforms, patchGeneratedPbrMaterialUniform } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { NativeRenderStateMemo, resolveNativeRenderState, type NativeRenderStateInput } from "../../../packages/rendering/src/webgpu/NativeRenderState";
import { diffUniformSnapshot, recordUniformReads, updateUniformSnapshotEntry, uniformSnapshotEntry } from "../../../packages/rendering/src/webgpu/UniformMapSnapshot";

const flags: QrFlags = { values: {}, on: () => true };

const matrix = (seed: number) => Array.from({ length: 16 }, (_, index) => seed + index / 8);
function baseUniforms(): Map<string, UniformValue> {
  return new Map<string, UniformValue>([
    ["u_modelMatrix", matrix(1)], ["u_normalMatrix", matrix(2)], ["u_shadowMapMatrix", matrix(3)],
    ["u_baseColor", [0.2, 0.4, 0.6, 1]], ["u_metallic", 0.3], ["u_roughness", 0.6], ["u_shadowMapNormalBias", 0.02],
    ["u_envSH", Float32Array.from({ length: 28 }, (_, index) => index / 10)],
    ["u_lightCount", 2], ["u_lightData", Float32Array.from({ length: 48 }, (_, index) => (index % 24 === 11 ? 0 : index / 7))],
    ["u_fogMode", 1], ["u_cameraPosition", [1, 2, 3]], ["u_unreadByThePacker", [9, 9, 9]]
  ]);
}
const pack = (uniforms: ReadonlyMap<string, UniformValue>) => packGeneratedPbrMaterialUniforms(uniforms);

describe("WebGPU perf round 3: uniform dependency snapshots", () => {
  it("records only what the reader read and sees in-place edits, -0 and NaN", () => {
    const uniforms = baseUniforms();
    const { result, snapshot } = recordUniformReads(uniforms, pack);
    expect(result).toEqual(pack(uniforms));
    expect(snapshot).not.toBeNull();
    expect(snapshot!.names).toContain("u_modelMatrix");
    expect(snapshot!.names).not.toContain("u_unreadByThePacker");
    expect(diffUniformSnapshot(snapshot!, uniforms, 8)).toBeNull();
    uniforms.set("u_unreadByThePacker", [1]);
    expect(diffUniformSnapshot(snapshot!, uniforms, 8)).toBeNull();
    (uniforms.get("u_modelMatrix") as number[])[5] = 42;
    const differing = diffUniformSnapshot(snapshot!, uniforms, 8) as number[];
    expect(differing.map(index => uniformSnapshotEntry(snapshot!, index).name)).toEqual(["u_modelMatrix"]);
    expect(updateUniformSnapshotEntry(snapshot!, differing[0]!, uniforms.get("u_modelMatrix"))).toBe(true);
    expect(diffUniformSnapshot(snapshot!, uniforms, 8)).toBeNull();
    uniforms.set("u_metallic", -0);
    expect(diffUniformSnapshot(snapshot!, uniforms, 8)).not.toBeNull();
    const zero = new Map<string, UniformValue>([["u_metallic", 0]]);
    const zeroSnapshot = recordUniformReads(zero, pack).snapshot!;
    expect(diffUniformSnapshot(zeroSnapshot, new Map<string, UniformValue>([["u_metallic", -0]]), 8)).not.toBeNull();
    const nan = new Map<string, UniformValue>([["u_metallic", Number.NaN]]);
    expect(diffUniformSnapshot(zeroSnapshot, nan, 8)).not.toBeNull();
    // A newly present name the reader tested with has() or read with get() is a difference.
    expect(diffUniformSnapshot(zeroSnapshot, new Map<string, UniformValue>([["u_metallic", 0], ["u_ior", 1.5]]), 8)).not.toBeNull();
    expect(diffUniformSnapshot(zeroSnapshot, new Map<string, UniformValue>([["u_metallic", 0], ["u_a3dNativeProbeTexture", 1]]), 8)).not.toBeNull();
    expect(diffUniformSnapshot(snapshot!, new Map(), 3)).toBe(false);
  });

  it("gives no snapshot for a reader that iterates the map", () => {
    const { result, snapshot } = recordUniformReads(baseUniforms(), (map) => [...map.keys()].length);
    expect(result).toBe(13);
    expect(snapshot).toBeNull();
  });

  it("rewrites direct uniforms to exactly the bytes of a full repack, and refuses values the packer refuses", () => {
    const uniforms = baseUniforms();
    const before = pack(uniforms);
    const next = new Map(uniforms);
    next.set("u_modelMatrix", matrix(5)); next.set("u_normalMatrix", Float32Array.from(matrix(6)));
    next.set("u_shadowMapMatrix", matrix(7)); next.set("u_shadowMapNormalBias", 0.5); next.set("u_baseColor", [1, 0, 0, 0.5]);
    next.set("u_lightData", Float32Array.from({ length: 48 }, (_, index) => (index % 24 === 11 ? 0 : index / 3)));
    next.set("u_cameraPosition", [4, 5, 6]);
    const bytes = before.slice();
    for (const [name, length] of [["u_modelMatrix", 16], ["u_normalMatrix", 16], ["u_shadowMapMatrix", 16], ["u_shadowMapNormalBias", -1],
      ["u_baseColor", 4], ["u_lightData", 48], ["u_cameraPosition", 3]] as const) {
      expect(patchGeneratedPbrMaterialUniform(bytes, name, next.get(name), length, false)).toBe(true);
    }
    expect(bytes).toEqual(pack(next));
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_metallic", 0.9, -1, false)).toBe(false);
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_lightData", next.get("u_lightData"), 48, true)).toBe(false);
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_modelMatrix", matrix(1).slice(0, 12), 16, false)).toBe(false);
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_modelMatrix", [...matrix(1).slice(0, 15), Number.NaN], 16, false)).toBe(false);
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_modelMatrix", [...matrix(1).slice(0, 15), 1e40], 16, false)).toBe(false);
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_shadowMapNormalBias", [0.5], -1, false)).toBe(false);
    expect(patchGeneratedPbrMaterialUniform(before.slice(), "u_lightData", new Float32Array(52), 48, false)).toBe(false);
  });
});

describe("WebGPU perf round 3: render-state memo", () => {
  const input = (overrides: Partial<NativeRenderStateInput> = {}): NativeRenderStateInput => ({
    state: { depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal" },
    topology: "triangles", colorFormats: ["rgba16float"], depthStencilFormat: "depth24plus", sampleCount: 1, targetWidth: 64, targetHeight: 32,
    deviceGeneration: 1, targetKey: "target", targetGeneration: 0, shaderKey: "7:v0:vs:fs", layoutKey: "portable:auto",
    vertexLayouts: [{ arrayStride: 24, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] }],
    ...overrides
  });

  it("returns the resolved state of an equal input and re-resolves after an in-place change", () => {
    const memo = new NativeRenderStateMemo();
    const first = input();
    const resolved = memo.resolve(first);
    expect(resolved).toEqual(resolveNativeRenderState(first));
    expect(memo.resolve(input())).toBe(resolved);
    const mutable = input();
    const state = mutable.state as { cullMode: string };
    expect(memo.resolve(mutable)).toBe(resolved);
    state.cullMode = "front";
    const changed = memo.resolve(mutable);
    expect(changed.pipelineKey).not.toBe(resolved.pipelineKey);
    expect(changed).toEqual(resolveNativeRenderState(mutable));
    const layouts = input().vertexLayouts as { attributes: { format: string }[] }[];
    layouts[0]!.attributes[1]!.format = "float32x2";
    expect(memo.resolve(input({ vertexLayouts: layouts })).pipelineKey).toBe(resolveNativeRenderState(input({ vertexLayouts: layouts })).pipelineKey);
    expect(memo.resolve(input({ targetWidth: 128 }))).toEqual(resolveNativeRenderState(input({ targetWidth: 128 })));
  });

  it("throws again for an input that failed, and for invalid layouts every time", () => {
    const memo = new NativeRenderStateMemo();
    const bad = input({ sampleCount: 2 });
    expect(() => memo.resolve(bad)).toThrow(/sample count/);
    expect(() => memo.resolve(bad)).toThrow(/sample count/);
    const layouts = [{ arrayStride: 6, stepMode: "vertex" as const, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }];
    expect(() => memo.validateLayouts(layouts)).toThrow();
    expect(() => memo.validateLayouts(layouts)).toThrow();
    const good = input().vertexLayouts!;
    const limits = Object.freeze(Object.create({ maxVertexBuffers: 8 })) as { maxVertexBuffers: number };
    expect(memo.validateLayouts(good, limits)).toBe(memo.validateLayouts(input().vertexLayouts!, limits));
  });
});

describe("WebGPU perf round 3: generated-PBR material slots on the device", () => {
  async function fixture() {
    const contents = new Map<object, Uint8Array>();
    const writes: { label?: string; offset: number; size: number }[] = [];
    const native = {
      queue: {
        submit() {}, onSubmittedWorkDone: async () => {}, writeTexture() {},
        writeBuffer(buffer: { label?: string; size: number }, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset = 0, size?: number) {
          const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          const bytes = view.subarray(dataOffset, size === undefined ? undefined : dataOffset + size);
          let image = contents.get(buffer);
          if (!image) { image = new Uint8Array(buffer.size); contents.set(buffer, image); }
          image.set(bytes, offset);
          writes.push({ label: buffer.label, offset, size: bytes.byteLength });
        }
      },
      createBuffer: ({ label, size }: { readonly label?: string; readonly size: number }) => ({ label, size, destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: () => ({}),
      createSampler: () => ({}),
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (descriptor: { entries: readonly { resource: unknown }[] }) => ({ descriptor }),
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setViewport() {}, setScissorRect() {},
        draw() {}, end() {} }), finish: () => ({}) }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, nativeDrawBatching: true });
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none" });
    const generated = generateProgramImpl(features, { flags });
    const shader = device.createShaderProgram({ label: "generated", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const vertices = device.createBuffer("vertex", 72);
    const frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const target = device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const materialImage = () => [...contents].filter(([buffer]) => (buffer as { label?: string }).label?.endsWith("-generated-pbr-material")).map(([, image]) => image);
    const drawFrame = (uniforms: ReadonlyMap<string, UniformValue>) => {
      device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      try {
        device.draw({ label: "pbr", topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader, uniforms: new Map(uniforms) });
      } finally { device.endFrame(); }
    };
    return { device, drawFrame, materialImage, writes };
  }
  const lit = () => new Map<string, UniformValue>([
    ["u_modelMatrix", matrix(1)], ["u_normalMatrix", matrix(2)], ["u_baseColor", [0.2, 0.4, 0.6, 1]], ["u_metallic", 0.25], ["u_roughness", 0.5]
  ]);

  it("uploads the same material bytes as a full pack when a draw's matrices change, with only the changed words written", async () => {
    const f = await fixture();
    const first = lit();
    f.drawFrame(first);
    expect(f.materialImage()).toEqual([pack(first)]);
    const moved = lit(); moved.set("u_modelMatrix", matrix(4));
    const written = f.writes.length;
    f.drawFrame(moved);
    expect(f.materialImage()).toEqual([pack(moved)]);
    const partial = f.writes.slice(written).filter(write => write.label?.endsWith("-generated-pbr-material"));
    expect(partial).toEqual([{ label: "pbr-generated-pbr-material", offset: 0, size: 64 }]);
    const recoloured = lit(); recoloured.set("u_modelMatrix", matrix(4)); recoloured.set("u_metallic", 0.75);
    f.drawFrame(recoloured);
    expect(f.materialImage()).toEqual([pack(recoloured)]);
    const unchanged = f.writes.length;
    f.drawFrame(recoloured);
    expect(f.writes.length).toBe(unchanged);
    f.device.dispose();
  });

  it("still rejects an invalid uniform after the draw slot was cached, then recovers", async () => {
    const f = await fixture();
    f.drawFrame(lit());
    f.drawFrame(lit());
    const broken = lit(); broken.set("u_modelMatrix", [...matrix(1).slice(0, 15), Number.NaN]);
    expect(() => f.drawFrame(broken)).toThrow(/u_modelMatrix/);
    const huge = lit(); huge.set("u_normalMatrix", [...matrix(2).slice(0, 15), 1e40]);
    expect(() => f.drawFrame(huge)).toThrow();
    const again = lit(); again.set("u_baseColor", [1, 1, 1, 1]);
    f.drawFrame(again);
    expect(f.materialImage()).toEqual([pack(again)]);
    f.device.dispose();
  });
});
