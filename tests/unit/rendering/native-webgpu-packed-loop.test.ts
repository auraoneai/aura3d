import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderChunk, registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { PACKED_LOOP_COLOR_DEFINE, PACKED_LOOP_COLOR_FEATURE, PACKED_LOOP_COLOR_FRAGMENT_MATERIAL_GLSL,
  PACKED_LOOP_COLOR_FRAGMENT_PARS_GLSL } from "../../../packages/rendering/src/batching/shaders/packedLoopColor.glsl";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedPbrProgram, GENERATED_PBR_MATERIAL_OFFSETS, packGeneratedPbrMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { createGeneratedUnlitProgram, GENERATED_UNLIT_MATERIAL_OFFSETS, packGeneratedUnlitMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { PACKED_LOOP_PHYSICAL_WGSL } from "../../../packages/rendering/src/webgpu/PackedLoopPhysical.wgsl";

const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
let unregister: (() => void) | undefined;

beforeAll(() => {
  const pars = "test.native-packed-loop.pars", material = "test.native-packed-loop.material";
  registerShaderChunk({ name: pars, owner: "prd11", stage: "fragment", glsl: PACKED_LOOP_COLOR_FRAGMENT_PARS_GLSL });
  registerShaderChunk({ name: material, owner: "prd11", stage: "fragment", glsl: PACKED_LOOP_COLOR_FRAGMENT_MATERIAL_GLSL });
  unregister = registerShaderFeature({ id: PACKED_LOOP_COLOR_FEATURE, owner: "prd11", flag: "A3D_PARITY_BATCHING",
    hooks: ["fragment:pars", "fragment:material"], chunks: [pars, material], select: () => true,
    defines: () => ({ [PACKED_LOOP_COLOR_DEFINE]: true }) });
});
afterAll(() => unregister?.());

function generated(lighting: "lit" | "unlit", options: Parameters<typeof normalizeProgramFeatures>[0] = {}) {
  return generateProgramImpl(normalizeProgramFeatures({ ...options, lighting,
    features: { ...options?.features, ...(lighting === "unlit" ? { "a3d.nativePrimitive": "triangles" } : {}), [PACKED_LOOP_COLOR_FEATURE]: true } }), { flags });
}

function floats(bytes: Uint8Array, offset: number): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [0, 1, 2, 3].map(index => view.getFloat32(offset + index * 4, true));
}

describe("staged WebGPU packed member color", () => {
  it("uses the actual GLSL descriptor and applies RGBA after the unlit base map", () => {
    const source = generated("unlit", { vertexColors: true, maps: { baseColor: { uvSet: 0, transform: false } } });
    const program = createGeneratedUnlitProgram(source.descriptor!);
    expect(source.descriptor!.activeFeatures).toContainEqual({ id: PACKED_LOOP_COLOR_FEATURE, value: true });
    expect(program.packedLoopColor).toBe(true);
    expect(program.fragment).toContain("material.baseColor * input.color * textureSample(");
    expect(program.fragment).toContain("material.packedLoopColor;");
    expect(program.fragment).not.toContain("u_a3dDrawData");
    expect(program.vertex).not.toContain("draw_index");
    const uniforms = new Map<string, UniformValue>([["u_a3dPackedLoopColor", [0.25, 0.5, 1, 0.75]]]);
    expect(floats(packGeneratedUnlitMaterialUniforms(uniforms, true), GENERATED_UNLIT_MATERIAL_OFFSETS.packedLoopColor!)).toEqual([0.25, 0.5, 1, 0.75]);
    expect(floats(packGeneratedUnlitMaterialUniforms(new Map()), GENERATED_UNLIT_MATERIAL_OFFSETS.packedLoopColor!)).toEqual([1, 1, 1, 1]);
  });

  it("colors the derived diffuse and blended F0 terms, leaving dielectric availability intact", () => {
    const source = generated("lit", { lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false }, environment: "pmrem-cube" });
    const program = createGeneratedPbrProgram(source.descriptor!);
    expect(program.packedLoopColor).toBe(true);
    expect(program.fragment).toContain("a3dPackedPhysicalDirect(n, view, light.direction, light.radiance, pbr, viewDfg, lightDfg, material.packedLoopColor.rgb)");
    expect(program.fragment).toContain("a3dPackedPhysicalIndirect(dot(n, view), radiance, irradiance, pbr, dfg, material.packedLoopColor.rgb)");
    expect(program.fragment).toContain("(1.0 - clamp(metallic, 0.0, 1.0)) * material.packedLoopColor.rgb");
    expect(program.fragment).toContain("material.packedLoopColor.a");
    expect(PACKED_LOOP_PHYSICAL_WGSL).toContain("let f0 = mix(dielectric, base, metalness) * memberColor;");
    expect(PACKED_LOOP_PHYSICAL_WGSL).toContain("result.diffuse *= memberColor;");
    // A half-red member tints a dielectric F0 of 0.04 to 0.02. Tinting
    // baseColor before constructing the material leaves that F0 at 0.04.
    const dielectricF0 = ((1.5 - 1) / (1.5 + 1)) ** 2;
    expect(dielectricF0 * 0.5).toBeCloseTo(0.02);
    expect(dielectricF0).toBeCloseTo(0.04);
    const uniforms = new Map<string, UniformValue>([["u_a3dPackedLoopColor", [0.25, 0.5, 1, 0.75]]]);
    expect(floats(packGeneratedPbrMaterialUniforms(uniforms, true), GENERATED_PBR_MATERIAL_OFFSETS.packedLoopColor!)).toEqual([0.25, 0.5, 1, 0.75]);
  });

  it("requires a finite f32 RGBA packet for a selected program", () => {
    for (const pack of [packGeneratedPbrMaterialUniforms, packGeneratedUnlitMaterialUniforms]) {
      expect(() => pack(new Map(), true)).toThrow(/u_a3dPackedLoopColor/);
      expect(() => pack(new Map<string, UniformValue>([["u_a3dPackedLoopColor", undefined as never]]), true)).toThrow(/u_a3dPackedLoopColor/);
      const offset = pack === packGeneratedPbrMaterialUniforms ? GENERATED_PBR_MATERIAL_OFFSETS.packedLoopColor! : GENERATED_UNLIT_MATERIAL_OFFSETS.packedLoopColor!;
      expect(floats(pack(new Map<string, UniformValue>([["u_a3dPackedLoopColor", [-1, 2, 0, 3]]]), true), offset)).toEqual([-1, 2, 0, 3]);
      for (const invalid of [[1, 1, 1], [1, NaN, 1, 1], [1, 1, 1, Number.MAX_VALUE]]) {
        expect(() => pack(new Map<string, UniformValue>([["u_a3dPackedLoopColor", invalid]]), true)).toThrow();
      }
    }
  });

  it("fails closed for inactive, contradictory, nonopaque, instanced and physical-extension variants", () => {
    for (const lighting of ["lit", "unlit"] as const) {
      const descriptor = generated(lighting).descriptor!;
      const create = lighting === "lit" ? createGeneratedPbrProgram : createGeneratedUnlitProgram;
      expect(() => create({ ...descriptor, activeFeatures: [] })).toThrow(/inactive packed/i);
      const missingDefine = { ...descriptor.defines }; delete missingDefine.A3D_PACKED_LOOP_COLOR;
      expect(() => create({ ...descriptor, defines: missingDefine })).toThrow(/A3D_PACKED_LOOP_COLOR/);
      expect(() => create(generated(lighting, { alphaMode: "mask" }).descriptor!)).toThrow(/nonopaque/i);
      expect(() => create(generated(lighting, { instancing: { color: false } }).descriptor!)).toThrow(/instanced/i);
    }
    const descriptor = generated("lit").descriptor!;
    expect(() => createGeneratedPbrProgram({ ...descriptor, activeExtensions: [{ lobe: "specular", maps: [], bits: {} }] })).toThrow(/extension.lobe/i);
  });
});

describe("packed member packets through a WebGPU-shaped device", () => {
  it("writes each checked draw's own color and rejects a missing packet before submission", async () => {
    const submissions: unknown[] = [], writes = new Map<string, Uint8Array>();
    let finish!: () => void;
    const fence = new Promise<void>(resolve => { finish = resolve; });
    const native = {
      queue: { submit(commands: readonly unknown[]) { submissions.push(...commands); }, onSubmittedWorkDone: () => fence,
        writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBufferView) {
          writes.set(buffer.label ?? "", new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
        } },
      createBuffer: (descriptor: { label?: string }) => ({ ...descriptor, destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: (descriptor: object) => descriptor,
      createBindGroupLayout: (descriptor: object) => descriptor, createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (descriptor: object) => descriptor,
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
      destroy() {}
    } as unknown as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    const frame = device.createBuffer("uniform", 304);
    const vertices = device.createBuffer("vertex", 72);
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 }], 24);
    const sources = [generated("lit"), generated("unlit")];
    const shaders = sources.map((source, index) => device.createShaderProgram({ label: `packed-${index}`, marker: GENERATED_PROGRAM_MARKER, vertex: source.vertex,
      fragment: source.fragment, generatedProgram: source.descriptor! }));
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      for (const [index, shader] of shaders.entries()) {
        const label = index ? "member-unlit" : "member-pbr";
        const uniforms = new Map<string, UniformValue>([["u_a3dPackedLoopColor", [0.25, 0.5, 1, 0.75]]]);
        const command = { label, topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: format, vertexCount: 3, shader, uniforms };
        device.drawChecked(command);
        const offset = index ? GENERATED_UNLIT_MATERIAL_OFFSETS.packedLoopColor! : GENERATED_PBR_MATERIAL_OFFSETS.packedLoopColor!;
        expect(floats(writes.get(`${label}-generated-${index ? "unlit" : "pbr"}-material`)!, offset)).toEqual([0.25, 0.5, 1, 0.75]);
        uniforms.set("u_a3dPackedLoopColor", [1, 0.25, 0.5, 1]);
        device.drawChecked(command);
        expect(floats(writes.get(`${label}-generated-${index ? "unlit" : "pbr"}-material`)!, offset)).toEqual([1, 0.25, 0.5, 1]);
        const count = submissions.length;
        uniforms.delete("u_a3dPackedLoopColor");
        expect(() => device.drawChecked(command)).toThrow(/u_a3dPackedLoopColor/);
        expect(submissions).toHaveLength(count);
      }
      device.endFrame();
    } finally { finish(); target.dispose(); frame.dispose(); vertices.dispose(); shaders.forEach(shader => shader.dispose()); device.dispose(); }
  });
});
