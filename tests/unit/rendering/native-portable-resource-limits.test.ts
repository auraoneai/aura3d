import { describe, expect, it } from "vitest";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialBinding } from "../../../packages/rendering/src/MaterialBinding";
import { PortableShaderCompilationError, PortableShaderMaterial } from "../../../packages/rendering/src/PortableShaderMaterial";
import { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { MockRenderDevice, type PortableShaderBinding, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";

function sources(bindings: readonly PortableShaderBinding[] | undefined, vertexUniforms = "", fragmentUniforms = ""): ShaderSources {
  return {
    label: "portable-resource-test", marker: "portable-resource-test",
    vertex: `// portable-resource-test\n${vertexUniforms}\nvoid main() {}`,
    fragment: `// portable-resource-test\n${fragmentUniforms}\nvoid main() {}`,
    webgpu: {
      vertex: "/* @aura3d-bindings */\n@vertex fn vs_main() -> @builtin(position) vec4f { return vec4f(0); }",
      fragment: "/* @aura3d-bindings */\n@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1); }"
    },
    ...(bindings ? { portableBindings: bindings } : {})
  };
}

function materialSources(bindings: readonly PortableShaderBinding[] | undefined, declarations: string, color: string): ShaderSources {
  return {
    ...sources(bindings),
    vertex: `#version 300 es
// portable-resource-test
layout(location = 0) in vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }`,
    fragment: `#version 300 es
// portable-resource-test
precision highp float;
${declarations}
out vec4 outColor;
void main() { outColor = ${color}; }`
  };
}

function materialLibrary(source: ShaderSources): ShaderLibrary {
  const library = new ShaderLibrary();
  library.register({ name: source.label, marker: source.marker, vertex: source.vertex, fragment: source.fragment,
    ...(source.webgpu && source.portableBindings ? {
      webgpu: { ...source.webgpu, vertex: `// ${source.marker}\n${source.webgpu.vertex}`, fragment: `// ${source.marker}\n${source.webgpu.fragment}` },
      portableBindings: source.portableBindings
    } : {}) });
  return library;
}

const PORTABLE_MATRIX_GLSL = {
  vertex: `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }`,
  fragment: `#version 300 es
precision highp float;
uniform mat2 u_data;
out vec4 outColor;
void main() { outColor = vec4(u_data[0], u_data[1]); }`
};
const PORTABLE_MATRIX_WGSL = {
  vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
  fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(aura.u_data[0], aura.u_data[1]); }"
};

function materialDiagnostic(error: unknown): string {
  if (error instanceof PortableShaderCompilationError) return error.diagnostics.join("\n");
  return error instanceof Error ? error.message : String(error);
}

async function webgpu(limits: Record<string, number>) {
  let modules = 0;
  const native = {
    limits,
    queue: { writeBuffer() {}, submit() {} },
    createBuffer: ({ size }: { size: number }) => ({ size, destroy() {} }),
    createShaderModule: () => { modules += 1; return {}; }
  };
  const adapter = { requestDevice: async () => native as unknown as WebGPUDeviceLike };
  return { device: await WebGPUDevice.create({ adapter, device: native as unknown as WebGPUDeviceLike }), modules: () => modules };
}

type WebGLTestUniform = {
  readonly name: string;
  readonly size?: number;
  readonly kind?: "sampler" | "float" | "vec4" | "mat2" | "mat4";
};
type UniformUpload = { readonly setter: string; readonly name: string; readonly values: readonly number[] };

function webgl(uniforms: readonly WebGLTestUniform[], limits: { vertex: number; fragment: number; combined: number }, parallelCompile = false, activePosition = false) {
  // Use real enum values for the uniform kinds interpreted by the actual GL binder.
  const constants = new Map<string, number>([
    ["FLOAT", 0x1406], ["FLOAT_VEC3", 0x8b51], ["FLOAT_VEC4", 0x8b52],
    ["FLOAT_MAT2", 0x8b5a], ["FLOAT_MAT4", 0x8b5c]
  ]);
  const c = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  let id = 0;
  let shaderCreations = 0;
  let programCreations = 0;
  const deletedPrograms: unknown[] = [];
  const uniformUploads: UniformUpload[] = [];
  let draws = 0;
  const upload = (setter: string) => (location: { name: string }, values: ArrayLike<number>) => {
    uniformUploads.push({ setter, name: location.name, values: Array.from(values) });
  };
  const uniformTypes: Record<NonNullable<WebGLTestUniform["kind"]>, string> = {
    sampler: "SAMPLER_2D", float: "FLOAT", vec4: "FLOAT_VEC4", mat2: "FLOAT_MAT2", mat4: "FLOAT_MAT4"
  };
  const overrides: Record<string, unknown> = {
    NO_ERROR: 0, INVALID_INDEX: 0xffffffff,
    getError: () => 0,
    getExtension: (name: string) => parallelCompile && name === "KHR_parallel_shader_compile" ? { COMPLETION_STATUS_KHR: c("COMPLETION_STATUS_KHR") } : null,
    getParameter: (name: number) => name === c("MAX_VERTEX_ATTRIBS") ? 16
      : name === c("MAX_VERTEX_TEXTURE_IMAGE_UNITS") ? limits.vertex
        : name === c("MAX_TEXTURE_IMAGE_UNITS") ? limits.fragment
          : name === c("MAX_COMBINED_TEXTURE_IMAGE_UNITS") ? limits.combined : 0,
    getShaderParameter: () => true,
    getProgramParameter: (_program: unknown, name: number) => name === c("LINK_STATUS") || name === c("COMPLETION_STATUS_KHR") ? true
      : name === c("ACTIVE_UNIFORMS") ? uniforms.length : name === c("ACTIVE_ATTRIBUTES") && activePosition ? 1 : 0,
    getActiveUniform: (_program: unknown, index: number) => ({ name: uniforms[index]!.name,
      size: uniforms[index]!.size ?? 1, type: c(uniformTypes[uniforms[index]!.kind ?? "sampler"]) }),
    getActiveAttrib: () => ({ name: "a_position", size: 1, type: c("FLOAT_VEC3") }),
    getAttribLocation: () => 0,
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    getUniformBlockIndex: () => 0xffffffff,
    deleteProgram: (program: unknown) => deletedPrograms.push(program),
    createShader: () => { shaderCreations += 1; return { id: ++id }; },
    createProgram: () => { programCreations += 1; return { id: ++id }; },
    uniform1fv: upload("uniform1fv"),
    uniform2fv: upload("uniform2fv"),
    uniform3fv: upload("uniform3fv"),
    uniform4fv: upload("uniform4fv"),
    uniformMatrix4fv: (location: { name: string }, _transpose: boolean, values: ArrayLike<number>) => upload("uniformMatrix4fv")(location, values),
    drawArrays: () => { draws += 1; }
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in overrides) return overrides[name];
    if (/^[A-Z0-9_]+$/.test(name)) return c(name);
    if (name.startsWith("create")) return () => ({ id: ++id });
    return () => undefined;
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: () => gl, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  return { device: WebGL2Device.create({ canvas }), deletedPrograms, uniformUploads, draws: () => draws,
    shaderCreations: () => shaderCreations, programCreations: () => programCreations };
}

describe("portable shader resource limits", () => {
  it("keeps flat-shaped portable data behind the recursive binding API", () => {
    const device = new MockRenderDevice();
    const material = new PortableShaderMaterial({
      name: "recursive-matrix-bind", shaderLibrary: new ShaderLibrary(),
      sources: { glsl: PORTABLE_MATRIX_GLSL, wgsl: PORTABLE_MATRIX_WGSL },
      uniforms: [{ name: "u_data", kind: "data", dataType: { kind: "matrix", columns: 2, rows: 2 }, value: [1, 2, 3, 4] }]
    });
    try {
      const program = material.compile(device).program!;
      const binding = new MaterialBinding();
      expect(binding.bindRecursive(material, program).uniforms.get("u_data")).toEqual([1, 2, 3, 4]);
      expect(() => binding.bind(material, program)).toThrow(/WebGL.*data.*u_data/);
      expect(() => binding.bindLegacy(material, program)).toThrow(/WebGL.*data.*u_data/);
    } finally { material.dispose(); device.dispose(); }
  });

  it.each([false, true])("fails closed before submitting a portable material's data uniform (paired WGSL: %s)", (paired) => {
    const fixture = webgl([{ name: "u_data", kind: "mat2" }], { vertex: 2, fragment: 2, combined: 4 }, false, true);
    const { device } = fixture;
    const library = new ShaderLibrary();
    let material: PortableShaderMaterial | undefined;
    try {
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      let diagnostic = "";
      try {
        material = new PortableShaderMaterial({
          name: `recursive-${paired ? "paired" : "glsl-only"}`,
          shaderLibrary: library,
          sources: {
            glsl: PORTABLE_MATRIX_GLSL,
            ...(paired ? { wgsl: PORTABLE_MATRIX_WGSL } : {})
          },
          uniforms: [{ name: "u_data", kind: "data", dataType: { kind: "matrix", columns: 2, rows: 2 }, value: [1, 2, 3, 4] }]
        });
        const compiled = material.compile(device);
        if (!compiled.ok) diagnostic = compiled.diagnostics.join("\n");
        else {
          const binding = new MaterialBinding().bind(material, compiled.program!);
          const uniforms = binding.uniforms;
          device.draw({ label: "portable-recursive", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3,
            vertexCount: 3, shader: compiled.program!, uniforms });
        }
      } catch (error) { diagnostic = materialDiagnostic(error); }
      device.endFrame();

      expect({ diagnostic, draws: fixture.draws(), uploads: fixture.uniformUploads, shaderCreations: fixture.shaderCreations() }).toMatchObject({
        diagnostic: expect.stringMatching(/(?:WebGL|GLSL).*data.*u_data/i),
        draws: 0,
        uploads: [],
        shaderCreations: 0
      });
    } finally { material?.dispose(); device.dispose(); }
  });

  it("cannot bypass recursive data admission by hot-reloading a paired material to GLSL only", () => {
    const fixture = webgl([{ name: "u_data", kind: "mat2" }], { vertex: 2, fragment: 2, combined: 4 }, false, true);
    const { device } = fixture;
    const material = new PortableShaderMaterial({
      name: "recursive-reload", shaderLibrary: new ShaderLibrary(),
      sources: { glsl: PORTABLE_MATRIX_GLSL, wgsl: PORTABLE_MATRIX_WGSL },
      uniforms: [{ name: "u_data", kind: "data", dataType: { kind: "matrix", columns: 2, rows: 2 }, value: [1, 2, 3, 4] }]
    });
    try {
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      let diagnostic = "";
      try {
        material.hotReload({ glsl: PORTABLE_MATRIX_GLSL });
        const compiled = material.compile(device);
        if (!compiled.ok) diagnostic = compiled.diagnostics.join("\n");
        else {
          const binding = new MaterialBinding().bindLegacy(material, compiled.program!);
          device.draw({ label: "portable-recursive-reload", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3,
            vertexCount: 3, shader: compiled.program!, uniforms: binding.uniforms });
        }
      } catch (error) { diagnostic = materialDiagnostic(error); }
      device.endFrame();

      expect({ diagnostic, draws: fixture.draws(), uploads: fixture.uniformUploads, shaderCreations: fixture.shaderCreations() }).toMatchObject({
        diagnostic: expect.stringMatching(/(?:WebGL|GLSL).*data.*u_data/i),
        draws: 0,
        uploads: [],
        shaderCreations: 0
      });
    } finally { material.dispose(); device.dispose(); }
  });

  it("rejects a recursive matrix schema before its material binding can submit a wrong WebGL draw", () => {
    const fixture = webgl([{ name: "u_data", kind: "mat2" }], { vertex: 2, fragment: 2, combined: 4 }, false, true);
    const { device } = fixture;
    const source = materialSources(
      [{ name: "u_data", kind: "data", dataType: { kind: "matrix", columns: 2, rows: 2 } }],
      "uniform mat2 u_data;", "vec4(u_data[0], u_data[1])"
    );
    const library = materialLibrary(source);
    const material = new Material({
      shaderKey: source.label,
      requiredAttributes: ["a_position"],
      uniformSchema: [{ name: "u_data", kind: "any" }],
      parameters: { u_data: [1, 2, 3, 4] }
    });
    try {
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      let error: unknown;
      try {
        const shader = device.createShaderProgram(library.compileSource(material.shaderKey));
        const binding = new MaterialBinding().bind(material, shader);
        device.draw({ label: "recursive-matrix", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3,
          vertexCount: 3, shader, uniforms: binding.uniforms });
      } catch (cause) { error = cause; }
      device.endFrame();

      // Without schema admission, the old binder picks uniform4fv for mat2
      // and issues drawArrays. A real GL implementation rejects that setter;
      // this fake records calls rather than pretending to prove rendered pixels.
      expect({ error, draws: fixture.draws(), uploads: fixture.uniformUploads }).toMatchObject({
        error: { code: "WEBGL_PORTABLE_UNIFORM_DATA_UNSUPPORTED", details: { label: source.label, binding: "u_data" } },
        draws: 0,
        uploads: []
      });
      expect(fixture.shaderCreations()).toBe(0);
      expect(fixture.programCreations()).toBe(0);
    } finally { material.dispose(); device.dispose(); }
  });

  it.each([false, true])("rejects recursive or misplaced dataType metadata before sync and async GL compilation (parallel: %s)", async (parallel) => {
    const fixture = webgl([], { vertex: 2, fragment: 2, combined: 4 }, parallel);
    const bindings: PortableShaderBinding[] = [
      { name: "u_struct", kind: "data", dataType: { kind: "struct", fields: [
        { name: "weights", type: { kind: "array", length: 2, element: "f32" } },
        { name: "id", type: "u32" }
      ] } },
      { name: "u_optional", kind: "data", dataType: "f32", required: false },
      { name: "u_missing", kind: "data" },
      { name: "u_wrong_kind", kind: "float", dataType: "f32" }
    ];
    try {
      for (const binding of bindings) {
        const source = sources([binding]);
        let error: unknown;
        try { fixture.device.createShaderProgram(source); } catch (cause) { error = cause; }
        expect(error).toMatchObject({
          code: "WEBGL_PORTABLE_UNIFORM_DATA_UNSUPPORTED",
          details: { label: source.label, binding: binding.name }
        });
        await expect(fixture.device.compileAsync(source)).rejects.toMatchObject({
          code: "WEBGL_PORTABLE_UNIFORM_DATA_UNSUPPORTED",
          details: { label: source.label, binding: binding.name }
        });
      }
      expect(fixture.shaderCreations()).toBe(0);
      expect(fixture.programCreations()).toBe(0);
      expect(fixture.device.parallelCompilesPending).toBe(0);
    } finally { fixture.device.dispose(); }
  });

  it.each([false, true])("preserves legacy float, vec4 and mat4 array uploads through material draws (portable metadata: %s)", (portable) => {
    const fixture = webgl([
      { name: "u_single[0]", kind: "float", size: 1 },
      { name: "u_weights[0]", kind: "float", size: 2 },
      { name: "u_tints[0]", kind: "vec4", size: 2 },
      { name: "u_matrices[0]", kind: "mat4", size: 2 }
    ], { vertex: 2, fragment: 2, combined: 4 }, false, true);
    const { device } = fixture;
    const source = materialSources(portable ? [
      { name: "u_single", kind: "float", arrayLength: 1 },
      { name: "u_weights", kind: "float", arrayLength: 2 },
      { name: "u_tints", kind: "vec4", arrayLength: 2 },
      { name: "u_matrices", kind: "mat4", arrayLength: 2 }
    ] : undefined, `
uniform float u_single[1];
uniform float u_weights[2];
uniform vec4 u_tints[2];
uniform mat4 u_matrices[2];`,
    "vec4(u_single[0] + u_weights[0] + u_weights[1]) * (u_tints[0] + u_tints[1]) + u_matrices[0][0] + u_matrices[1][0]");
    const library = materialLibrary(source);
    const matrices = Float32Array.from({ length: 32 }, (_, index) => index + 1);
    const material = new Material({
      shaderKey: source.label,
      requiredAttributes: ["a_position"],
      uniformSchema: ["u_single", "u_weights", "u_tints", "u_matrices"].map((name) => ({ name, kind: "any" as const })),
      parameters: { u_single: [0.75], u_weights: [1.5, 2.5], u_tints: [1, 2, 3, 4, 5, 6, 7, 8], u_matrices: matrices }
    });
    try {
      const shader = device.createShaderProgram(library.compileSource(material.shaderKey));
      const vertexBuffer = device.createBuffer("vertex", 36);
      const draw = () => {
        const binding = new MaterialBinding().bind(material, shader);
        device.draw({ label: "legacy-arrays", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3,
          vertexCount: 3, shader, uniforms: binding.uniforms });
      };
      device.beginFrame(2, 2);
      draw();
      material.setParameter("u_weights", [3.5, 4.5]);
      draw();
      device.endFrame();
      expect(fixture.draws()).toBe(2);
      expect(fixture.uniformUploads).toEqual([
        { setter: "uniform1fv", name: "u_single", values: [0.75] },
        { setter: "uniform1fv", name: "u_weights", values: [1.5, 2.5] },
        { setter: "uniform4fv", name: "u_tints", values: [1, 2, 3, 4, 5, 6, 7, 8] },
        { setter: "uniformMatrix4fv", name: "u_matrices", values: [...matrices] },
        { setter: "uniform1fv", name: "u_weights", values: [3.5, 4.5] }
      ]);
    } finally { material.dispose(); device.dispose(); }
  });

  it.each([false, true])("rejects multisampled depth before WebGL shader creation (parallel: %s)", async (parallel) => {
    const gl = webgl([], { vertex: 2, fragment: 2, combined: 4 }, parallel);
    const invalid = sources([{ name: "u_depth", kind: "depth2d-multisampled" }]);
    expect(() => gl.device.createShaderProgram(invalid)).toThrowError(/does not support multisampled depth texture bindings/);
    await expect(gl.device.compileAsync(invalid)).rejects.toMatchObject({ code: "WEBGL_MULTISAMPLED_DEPTH_UNSUPPORTED", details: { binding: "u_depth" } });
    expect(gl.shaderCreations()).toBe(0);
    expect(gl.programCreations()).toBe(0);
    expect(gl.device.parallelCompilesPending).toBe(0);

    const valid = await gl.device.compileAsync(sources([{ name: "u_depth", kind: "depth2d" }]));
    expect(gl.shaderCreations()).toBe(2);
    expect(gl.programCreations()).toBe(1);
    valid.dispose();
    gl.device.dispose();
    await expect(gl.device.compileAsync(invalid)).rejects.toMatchObject({ code: "DISPOSED_DEVICE" });
  });

  it("checks WebGPU texture and sampler slots before creating shader modules", async () => {
    const { device, modules } = await webgpu({ maxSampledTexturesPerShaderStage: 2, maxSamplersPerShaderStage: 1 });
    const depth: PortableShaderBinding = { name: "u_depth", kind: "depth2d" };
    const image: PortableShaderBinding = { name: "u_image", kind: "texture2d" };
    const cube: PortableShaderBinding = { name: "u_cube", kind: "texture-cube" };
    expect(() => device.createShaderProgram(sources([depth, image, cube]))).toThrow(/sampled-texture or sampler limits/);
    expect(() => device.createShaderProgram(sources([image, cube]))).toThrow(/sampled-texture or sampler limits/);
    expect(modules()).toBe(0);
    const valid = device.createShaderProgram(sources([depth, image]));
    expect(modules()).toBe(2);
    valid.dispose(); device.dispose();
  });

  it("counts even currently unused WebGPU layout entries and does not charge depth textures as samplers", async () => {
    const { device } = await webgpu({ maxSampledTexturesPerShaderStage: 2, maxSamplersPerShaderStage: 0 });
    const depth = (name: string): PortableShaderBinding => ({ name, kind: "depth2d", required: false });
    const valid = device.createShaderProgram(sources([depth("u_a"), depth("u_b")]));
    expect(() => device.createShaderProgram(sources([depth("u_a"), depth("u_b"), depth("u_c")]))).toThrow(/sampled-texture or sampler limits/);
    expect(() => device.createShaderProgram(sources([{ name: "u_image", kind: "texture2d" }]))).toThrow(/sampled-texture or sampler limits/);
    valid.dispose(); device.dispose();
  });

  it("checks only linked-active WebGL samplers against their declared stages and array sizes", () => {
    const active = [{ name: "u_vertex" }, { name: "u_fragment[0]", size: 2 }, { name: "u_number", kind: "float" as const }];
    const vertex = "uniform sampler2D u_vertex;\nuniform sampler2D u_unused;";
    const fragment = "uniform sampler2D u_fragment[2];\nuniform float u_number;";
    const bindings: PortableShaderBinding[] = [{ name: "u_vertex", kind: "texture2d" }, { name: "u_fragment", kind: "texture2d" }, { name: "u_unused", kind: "texture2d" }];
    const ok = webgl(active, { vertex: 1, fragment: 2, combined: 3 });
    const valid = ok.device.createShaderProgram(sources(bindings, vertex, fragment));
    valid.dispose(); ok.device.dispose();
    const tooFewFragment = webgl(active, { vertex: 1, fragment: 1, combined: 3 });
    expect(() => tooFewFragment.device.createShaderProgram(sources(bindings, vertex, fragment))).toThrow(/texture-unit limits/);
    expect(tooFewFragment.deletedPrograms).toHaveLength(1);
    tooFewFragment.device.dispose();
    const tooFewCombined = webgl(active, { vertex: 1, fragment: 2, combined: 2 });
    expect(() => tooFewCombined.device.createShaderProgram(sources(bindings, vertex, fragment))).toThrow(/texture-unit limits/);
    tooFewCombined.device.dispose();
  });

  it("rejects vertex-stage WebGL sampler overflow and conservatively counts declarations in both stages", () => {
    const active = [{ name: "u_shared" }], bindings: PortableShaderBinding[] = [{ name: "u_shared", kind: "texture2d" }];
    const declaration = "uniform sampler2D u_shared;";
    const noVertexUnits = webgl(active, { vertex: 0, fragment: 2, combined: 2 });
    expect(() => noVertexUnits.device.createShaderProgram(sources(bindings, declaration, ""))).toThrow(/texture-unit limits/);
    noVertexUnits.device.dispose();
    const combined = webgl(active, { vertex: 1, fragment: 1, combined: 1 });
    expect(() => combined.device.createShaderProgram(sources(bindings, declaration, declaration))).toThrow(/texture-unit limits/);
    combined.device.dispose();
  });

  it("exposes the native fragment limit and checks active non-portable programs", () => {
    const context = webgl([{ name: "u_color" }, { name: "u_detail" }], { vertex: 0, fragment: 1, combined: 2 });
    expect(context.device.info.maxFragmentTextureUnits).toBe(1);
    const legacy: ShaderSources = {
      label: "legacy-material", marker: "legacy-material", vertex: "// legacy-material\nvoid main() {}",
      fragment: "// legacy-material\nuniform sampler2D u_color;\nuniform sampler2D u_detail;\nvoid main() {}"
    };
    expect(() => context.device.createShaderProgram(legacy)).toThrow(/texture-unit limits/);
    expect(context.deletedPrograms).toHaveLength(1);
    context.device.dispose();
  });
});
