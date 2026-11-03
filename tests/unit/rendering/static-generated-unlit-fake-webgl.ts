import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import type { DrawCommand, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { AURA_FRAME_LAYOUT, std140Offsets } from "../../../packages/rendering/src/program/UniformLayout";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";

type BaseFixture = ReturnType<typeof fakeWebGLCanvas>;
export type FakeGeneratedProgram = NonNullable<BaseFixture["state"]["currentProgram"]>;
export type FakeGeneratedBuffer = { readonly id: number; bytes: Uint8Array; deleted?: boolean };
export type FakeGeneratedVariable = { readonly name: string; readonly type: number; readonly size: number };
export interface FakeGeneratedReflection {
  readonly uniforms: readonly FakeGeneratedVariable[];
  readonly attributes: readonly FakeGeneratedVariable[];
}
export interface FakeGeneratedProgramRecord {
  readonly program: FakeGeneratedProgram;
  readonly vertex: string;
  readonly fragment: string;
  readonly pair: boolean;
}
export interface FakeIndexedUniformBinding {
  readonly buffer: FakeGeneratedBuffer | null;
  readonly offset: number;
  readonly size: number;
}
export interface FakeGeneratedDrawBinding extends FakeIndexedUniformBinding {
  readonly program: FakeGeneratedProgram | null;
  readonly draw: string;
  readonly bytes: Uint8Array;
}
export interface FakeGeneratedControls {
  readonly programs: FakeGeneratedProgramRecord[];
  readonly indexedBindings: Map<number, FakeIndexedUniformBinding>;
  readonly blockBindings: Map<FakeGeneratedProgram, number>;
  readonly drawBindings: FakeGeneratedDrawBinding[];
  readonly programQueries: { readonly program: FakeGeneratedProgram; readonly parameter: number }[];
  pairLinkStatus: "ready" | "failed";
  pairCompletionReady: boolean;
  pairReflectionValid: boolean;
  parallelCompile: boolean;
  reflect?: (record: FakeGeneratedProgramRecord, defaults: FakeGeneratedReflection) => FakeGeneratedReflection;
  onGetUniform?: (program: FakeGeneratedProgram, name: string) => void;
  onGetIndexedParameter?: (parameter: number, index: number) => void;
}

/**
 * Adds modeled generated-program reflection and AuraFrame UBOs to the existing
 * deterministic fake. This does not compile GLSL, simulate rasterization, or
 * establish real-driver reflection or synchronization behavior.
 */
export function fakeGeneratedStaticWebGLCanvas() {
  const fixture = fakeWebGLCanvas();
  const { gl, state, nativeDraws } = fixture;
  const methods = gl as unknown as Record<string, unknown>;
  // These are real WebGL enum values; the base fake assigns unused constants
  // synthetic values, so establish them before the device probes the context.
  Object.assign(methods, {
    FLOAT_VEC2: 0x8b50, SAMPLER_2D: 0x8b5e,
    UNIFORM_BUFFER: 0x8a11, UNIFORM_BUFFER_BINDING: 0x8a28,
    UNIFORM_BUFFER_START: 0x8a29, UNIFORM_BUFFER_SIZE: 0x8a2a,
    UNIFORM_BUFFER_OFFSET_ALIGNMENT: 0x8a34,
    ACTIVE_UNIFORM_BLOCKS: 0x8a36,
    UNIFORM_BLOCK_BINDING: 0x8a3f, UNIFORM_BLOCK_DATA_SIZE: 0x8a40,
    UNIFORM_BLOCK_ACTIVE_UNIFORMS: 0x8a42, UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES: 0x8a43,
    UNIFORM_BLOCK_INDEX: 0x8a3a, UNIFORM_OFFSET: 0x8a3b,
    UNIFORM_ARRAY_STRIDE: 0x8a3c, UNIFORM_MATRIX_STRIDE: 0x8a3d,
    UNIFORM_IS_ROW_MAJOR: 0x8a3e
  });
  const completionStatus = 0x91b1;
  const layout = std140Offsets(AURA_FRAME_LAYOUT);
  const generated: FakeGeneratedControls = {
    programs: [], indexedBindings: new Map(), blockBindings: new Map(), drawBindings: [], programQueries: [],
    pairLinkStatus: "ready", pairCompletionReady: true, pairReflectionValid: true, parallelCompile: false
  };
  const findRecord = (program: FakeGeneratedProgram) => generated.programs.find((entry) => entry.program === program);
  const originalLink = gl.linkProgram.bind(gl);
  const originalParameter = gl.getProgramParameter.bind(gl);
  const originalGetParameter = gl.getParameter.bind(gl);
  const originalGetExtension = gl.getExtension.bind(gl);
  const originalBlockIndex = gl.getUniformBlockIndex.bind(gl);
  const originalLocation = gl.getUniformLocation.bind(gl);
  const originalAttribLocation = gl.getAttribLocation.bind(gl);
  const originalGetUniform = gl.getUniform.bind(gl);
  const originalBindBuffer = gl.bindBuffer.bind(gl);
  let uniformBuffer: FakeGeneratedBuffer | null = null;

  methods.linkProgram = (program: FakeGeneratedProgram) => {
    originalLink(program as unknown as WebGLProgram);
    const vertex = program.shaders[0]?.source ?? "";
    const fragment = program.shaders[1]?.source ?? "";
    if (!vertex.includes("a3d-generated-program") || !vertex.includes("uniform AuraFrame")) return;
    const record: FakeGeneratedProgramRecord = { program, vertex, fragment, pair: /u_batchModel\s*\[\s*2\s*\]/.test(vertex) };
    generated.programs.push(record);
    const defaults = defaultReflection(gl, record);
    const reflection = generated.reflect?.(record, defaults) ?? defaults;
    program.uniforms = reflection.uniforms.map((entry) => ({ ...entry }));
    program.attributes = reflection.attributes.map((entry) => ({ ...entry }));
    if (record.pair && !generated.pairReflectionValid) {
      program.uniforms = program.uniforms.filter((entry) => !entry.name.startsWith("u_batchModel"));
    }
  };
  methods.getProgramParameter = (program: FakeGeneratedProgram, parameter: number) => {
    generated.programQueries.push({ program, parameter });
    const record = findRecord(program);
    if (record?.pair && parameter === gl.LINK_STATUS && generated.pairLinkStatus === "failed") return false;
    if (parameter === completionStatus) return record?.pair ? generated.pairCompletionReady : true;
    if (record && parameter === gl.ACTIVE_UNIFORM_BLOCKS) return 1;
    return originalParameter(program as unknown as WebGLProgram, parameter);
  };
  methods.getExtension = (name: string) => name === "KHR_parallel_shader_compile" && generated.parallelCompile
    ? { COMPLETION_STATUS_KHR: completionStatus }
    : originalGetExtension(name);
  methods.getUniformBlockIndex = (program: FakeGeneratedProgram, name: string) =>
    findRecord(program) && name === "AuraFrame" ? 0 : originalBlockIndex(program as unknown as WebGLProgram, name);
  methods.uniformBlockBinding = (program: FakeGeneratedProgram, index: number, binding: number) => {
    if (findRecord(program) && index === 0) generated.blockBindings.set(program, binding);
  };
  methods.getActiveUniformBlockParameter = (program: FakeGeneratedProgram, index: number, parameter: number) => {
    if (!findRecord(program) || index !== 0) return null;
    if (parameter === gl.UNIFORM_BLOCK_BINDING) return generated.blockBindings.get(program) ?? 0;
    if (parameter === gl.UNIFORM_BLOCK_DATA_SIZE) return layout.size;
    const viewIndex = program.uniforms.findIndex((entry) => entry.name === "u_viewProjection");
    if (parameter === gl.UNIFORM_BLOCK_ACTIVE_UNIFORMS) return viewIndex < 0 ? 0 : 1;
    if (parameter === gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES) return new Uint32Array(viewIndex < 0 ? [] : [viewIndex]);
    return null;
  };
  methods.getUniformIndices = (program: FakeGeneratedProgram, names: readonly string[]) => names.map((name) => {
    const index = program.uniforms.findIndex((entry) => entry.name === name || `AuraFrame.${entry.name}` === name);
    return index < 0 ? gl.INVALID_INDEX : index;
  });
  methods.getActiveUniforms = (program: FakeGeneratedProgram, indices: readonly number[], parameter: number) => indices.map((index) => {
    const member = program.uniforms[index]?.name;
    if (parameter === gl.UNIFORM_BLOCK_INDEX) return member === "u_viewProjection" ? 0 : -1;
    if (parameter === gl.UNIFORM_OFFSET) return member === "u_viewProjection" ? layout.offsets.u_viewProjection : -1;
    if (parameter === gl.UNIFORM_MATRIX_STRIDE) return member === "u_viewProjection" ? 16 : 0;
    if (parameter === gl.UNIFORM_ARRAY_STRIDE) return 0;
    return 0;
  });
  methods.getUniformLocation = (program: FakeGeneratedProgram, name: string) => {
    if (!findRecord(program)) return originalLocation(program as unknown as WebGLProgram, name);
    const match = /^(.*?)(?:\[(\d+)\])?$/.exec(name);
    const base = match?.[1] ?? name;
    const active = program.uniforms.find((entry) => entry.name.replace(/\[0\]$/, "") === base);
    if (!active || base === "u_viewProjection" || (match?.[2] !== undefined && Number(match[2]) >= active.size)) return null;
    return { program, name: match?.[2] === undefined || match[2] === "0" ? base : name };
  };
  methods.getAttribLocation = (program: FakeGeneratedProgram, name: string) => {
    if (!findRecord(program)) return originalAttribLocation(program as unknown as WebGLProgram, name);
    if (!program.attributes.some((entry) => entry.name === name)) return -1;
    return ({ a_position: 0, a_normal: 1, a_uv: 2, a_color: 4, a_uv1: 7 } as Record<string, number>)[name] ?? -1;
  };
  methods.getUniform = (program: FakeGeneratedProgram, location: { readonly name: string }) => {
    if (!findRecord(program)) return originalGetUniform(program as unknown as WebGLProgram, location as unknown as WebGLUniformLocation);
    generated.onGetUniform?.(program, location.name);
    const saved = program.values.get(location.name);
    if (saved !== undefined) return typeof saved === "number" ? saved : new Float32Array(saved);
    const active = program.uniforms.find((entry) => entry.name.replace(/\[0\]$/, "") === location.name);
    const width = active?.type === gl.FLOAT_MAT4 ? 16 : active?.type === gl.FLOAT_VEC4 ? 4
      : active?.type === gl.FLOAT_VEC3 ? 3 : active?.type === gl.FLOAT_VEC2 ? 2 : 0;
    return width ? new Float32Array(width * (active?.size ?? 1)) : 0;
  };
  // Mirror the scalar/vector setters the generated variants use. The base fake
  // already records matrix and vec4 uploads and captures them at draw entry.
  methods.uniform1f = (location: { program: FakeGeneratedProgram; name: string }, value: number) => {
    location.program.values.set(location.name, Math.fround(value));
  };
  methods.uniform1i = (location: { program: FakeGeneratedProgram; name: string }, value: number) => {
    location.program.values.set(location.name, value);
  };
  for (const name of ["uniform1fv", "uniform2fv", "uniform3fv"]) {
    methods[name] = (location: { program: FakeGeneratedProgram; name: string }, value: ArrayLike<number>) => {
      location.program.values.set(location.name, Float32Array.from(value));
    };
  }

  methods.bindBuffer = (target: number, buffer: FakeGeneratedBuffer | null) => {
    if (target === gl.UNIFORM_BUFFER) uniformBuffer = buffer;
    originalBindBuffer(target, buffer as unknown as WebGLBuffer | null);
  };
  methods.bindBufferBase = (target: number, index: number, buffer: FakeGeneratedBuffer | null) => {
    if (target !== gl.UNIFORM_BUFFER) return;
    generated.indexedBindings.set(index, { buffer, offset: 0, size: buffer?.bytes.byteLength ?? 0 });
    uniformBuffer = buffer;
    originalBindBuffer(target, buffer as unknown as WebGLBuffer | null);
  };
  methods.bindBufferRange = (target: number, index: number, buffer: FakeGeneratedBuffer | null, offset: number, size: number) => {
    if (target !== gl.UNIFORM_BUFFER) return;
    generated.indexedBindings.set(index, { buffer, offset, size });
    uniformBuffer = buffer;
    originalBindBuffer(target, buffer as unknown as WebGLBuffer | null);
  };
  methods.getParameter = (parameter: number) => parameter === gl.UNIFORM_BUFFER_BINDING ? uniformBuffer
    : parameter === gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT ? 16 : originalGetParameter(parameter);
  methods.getIndexedParameter = (parameter: number, index: number) => {
    generated.onGetIndexedParameter?.(parameter, index);
    const binding = generated.indexedBindings.get(index);
    if (parameter === gl.UNIFORM_BUFFER_BINDING) return binding?.buffer ?? null;
    if (parameter === gl.UNIFORM_BUFFER_START) return binding?.offset ?? 0;
    if (parameter === gl.UNIFORM_BUFFER_SIZE) return binding?.size ?? 0;
    return null;
  };
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
    const draw = (gl[name] as (...args: unknown[]) => void).bind(gl);
    methods[name] = (...args: unknown[]) => {
      const binding = generated.indexedBindings.get(0) ?? { buffer: null, offset: 0, size: 0 };
      generated.drawBindings.push({ ...binding, program: state.currentProgram, draw: name,
        bytes: binding.buffer?.bytes.slice(binding.offset, binding.offset + binding.size) ?? new Uint8Array() });
      // The original callback and failure happen at native draw entry.
      const before = nativeDraws.length;
      try { draw(...args); } finally {
        if (nativeDraws.length === before) generated.drawBindings.pop();
      }
    };
  }
  return { ...fixture, generated };
}

/** Convenience for direct WebGL2Device tests. */
export function fakeGeneratedStaticWebGL() {
  const fixture = fakeGeneratedStaticWebGLCanvas();
  const device = WebGL2Device.create({ canvas: fixture.canvas });
  return { ...fixture, device };
}

export function generatedStaticTestModel(translation: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, translation, 0, 0, 1]);
}

export const GENERATED_STATIC_TEST_GEOMETRY = new Float32Array([0.75, 0, 0, 0, 0, 0.75, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export const GENERATED_STATIC_TEST_VIEW_PROJECTION = new Float32Array([0.8, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * Make two disjoint, indexed generated-unlit draws with a real ProgramCache,
 * actual AuraFrame bytes and a warmed device-issued pair ticket. Throws if
 * preparation submits a draw or does not eventually produce a ticket.
 */
export function preparedGeneratedStaticUnlitPair() {
  const fixture = fakeGeneratedStaticWebGL();
  const { device } = fixture;
  const features = normalizeProgramFeatures({ lighting: "unlit", features: { [PROGRAM_OUTPUT_SRGB_FEATURE]: true } });
  const cache = new ProgramCache(device, { parallelCompile: false });
  try {
    const handle = cache.acquire(features);
    if (handle.status !== "ready" || !handle.program) throw new Error("ordinary generated program was not ready");
    const vertices = new Float32Array([-0.1, -0.1, 0, 0.1, -0.1, 0, 0, 0.1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const indexBuffer = device.createBuffer("index", indices.byteLength, indices);
    const layout = std140Offsets(AURA_FRAME_LAYOUT);
    if (layout.size !== 304 || layout.offsets.u_viewProjection !== 128) throw new Error("unexpected AuraFrame layout");
    const frameBytes = new Uint8Array(layout.size);
    new Float32Array(frameBytes.buffer, layout.offsets.u_viewProjection, 16).set(GENERATED_STATIC_TEST_VIEW_PROJECTION);
    const auraFrameBuffer = device.createBuffer("uniform", frameBytes.byteLength, frameBytes);
    const uniforms = (x: number) => new Map<string, UniformValue>([
      ["u_modelMatrix", generatedStaticTestModel(x)], ["u_geometryMatrix", new Float32Array(GENERATED_STATIC_TEST_GEOMETRY)],
      ["u_baseColor", new Float32Array([0.25, 0.5, 0.75, 1])],
      ["u_emissiveColor", new Float32Array([0.125, 0, 0])], ["u_emissiveStrength", 0.5], ["u_pointSize", 1]
    ]);
    const first: DrawCommand = {
      label: "first", topology: "triangles", vertexBuffer, indexBuffer, vertexFormat: VertexFormat.P3,
      vertexCount: 3, indexCount: 3, firstIndex: 0, indexType: "uint16", shader: handle.program,
      renderState: { depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal" },
      uniforms: uniforms(-0.5)
    };
    const second: DrawCommand = { ...first, label: "second", uniforms: uniforms(0.5) };
    const commands = [first, second] as const;
    const context = { features, auraFrameBuffer };
    device.beginFrame(128, 128);
    device.bindUniformBuffer(auraFrameBuffer, 0);
    device.draw(first);
    const beforeWarm = fixture.nativeDraws.length;
    let ticket = device.prepareStaticGeneratedUnlitPair(commands, context);
    if (fixture.nativeDraws.length !== beforeWarm) throw new Error("pair preparation submitted a draw");
    if (!ticket) {
      device.draw(first);
      device.draw(second);
      ticket = device.prepareStaticGeneratedUnlitPair(commands, context);
    }
    if (!ticket) throw new Error("generated unlit pair was not ready after warmup");
    const dispose = () => { cache.dispose(); device.dispose(); };
    return { ...fixture, cache, commands, features, context, auraFrameBuffer, vertexBuffer, indexBuffer, ticket, frameBytes, dispose };
  } catch (error) {
    cache.dispose();
    device.dispose();
    throw error;
  }
}

function defaultReflection(gl: WebGL2RenderingContext, record: FakeGeneratedProgramRecord): FakeGeneratedReflection {
  const enabled = (name: string) => new RegExp(`^#define ${name}(?:\\s|$)`, "m").test(record.vertex + "\n" + record.fragment);
  const uniform = (name: string, type: number, size = 1): FakeGeneratedVariable => ({ name, type, size });
  const uniforms = [
    uniform(record.pair ? "u_batchModel[0]" : "u_modelMatrix", gl.FLOAT_MAT4, record.pair ? 2 : 1),
    uniform("u_geometryMatrix", gl.FLOAT_MAT4), uniform("u_viewProjection", gl.FLOAT_MAT4),
    uniform("u_pointSize", gl.FLOAT), uniform("u_baseColor", gl.FLOAT_VEC4),
    uniform("u_emissiveColor", gl.FLOAT_VEC3), uniform("u_emissiveStrength", gl.FLOAT)
  ];
  const attributes = [uniform("a_position", gl.FLOAT_VEC3)];
  if (enabled("A3D_NEED_UV0")) attributes.push(uniform("a_uv", gl.FLOAT_VEC2));
  if (enabled("A3D_NEED_UV1")) attributes.push(uniform("a_uv1", gl.FLOAT_VEC2));
  if (enabled("VERTEX_COLORS")) attributes.push(uniform("a_color", gl.FLOAT_VEC4));
  if (enabled("USE_BASE_COLOR_MAP")) uniforms.push(uniform("u_baseColorMap", gl.SAMPLER_2D),
    uniform("u_baseColorTextureOffset", gl.FLOAT_VEC2), uniform("u_baseColorTextureScale", gl.FLOAT_VEC2),
    uniform("u_baseColorTextureRotation", gl.FLOAT));
  if (enabled("FOG_LINEAR")) uniforms.push(uniform("u_fogColor", gl.FLOAT_VEC3), uniform("u_fogRange", gl.FLOAT_VEC2));
  if (enabled("A3D_CLIPPING")) uniforms.push(uniform("u_a3dClipPlanes[0]", gl.FLOAT_VEC4, 8),
    uniform("u_a3dClipGroups[0]", gl.FLOAT_VEC4, 2), uniform("u_a3dClipGroupCount", gl.FLOAT));
  if (enabled("ALPHA_MASK")) uniforms.push(uniform("u_alphaCutoff", gl.FLOAT));
  return { uniforms, attributes };
}
