import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNLIT_SHADER_NAME,
  ShaderLibrary,
  registerLeanUnlitShader
} from "../../../packages/rendering/src/ShaderLibraryCore";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection";
import {
  STATIC_BATCH_UNLIT_INSTANCE_COUNT,
  STATIC_BATCH_UNLIT_VERTEX_UNIFORM_VECTORS,
  deriveStaticBatchUnlitShaderSource,
  inspectStaticBatchUnlitProgram
} from "../../../packages/rendering/src/webgl2/StaticBatchUnlitShader";

function ordinaryUnlit() {
  const library = new ShaderLibrary();
  registerLeanUnlitShader(library);
  return library.get(DEFAULT_UNLIT_SHADER_NAME);
}

type Active = { name: string; size: number; type: number };

/** Pure JavaScript fake: it does not create a browser or a GL context. */
function fakeLinkedProgram() {
  const constants = {
    MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
    LINK_STATUS: 0x8b82,
    ACTIVE_UNIFORMS: 0x8b86,
    ACTIVE_ATTRIBUTES: 0x8b89,
    FLOAT: 0x1406,
    FLOAT_VEC3: 0x8b51,
    FLOAT_VEC4: 0x8b52,
    FLOAT_MAT4: 0x8b5c
  };
  const state = {
    limit: 9 as unknown,
    linked: true,
    lost: false,
    uniforms: [
      { name: "u_batchMVP[0]", type: constants.FLOAT_MAT4, size: 2 },
      { name: "u_pointSize", type: constants.FLOAT, size: 1 },
      { name: "u_baseColor", type: constants.FLOAT_VEC4, size: 1 },
      { name: "u_alphaCutoff", type: constants.FLOAT, size: 1 },
      { name: "u_roundPoints", type: constants.FLOAT, size: 1 }
    ] as Active[],
    attributes: [
      { name: "a_position", type: constants.FLOAT_VEC3, size: 1 },
      { name: "a_color", type: constants.FLOAT_VEC4, size: 1 }
    ] as Active[],
    missingUniforms: new Set<string>(),
    attributeLocations: new Map([["a_position", 0], ["a_color", 4]]),
    queriedParameters: [] as number[],
    uniformLocationNames: [] as string[]
  };
  const program = {} as WebGLProgram;
  const gl = {
    ...constants,
    isContextLost: () => state.lost,
    getParameter: (parameter: number) => {
      state.queriedParameters.push(parameter);
      return parameter === constants.MAX_VERTEX_UNIFORM_VECTORS ? state.limit : null;
    },
    getProgramParameter: (_program: WebGLProgram, parameter: number) => {
      if (parameter === constants.LINK_STATUS) return state.linked;
      if (parameter === constants.ACTIVE_UNIFORMS) return state.uniforms.length;
      if (parameter === constants.ACTIVE_ATTRIBUTES) return state.attributes.length;
      return null;
    },
    getActiveUniform: (_program: WebGLProgram, index: number) => state.uniforms[index] ?? null,
    getActiveAttrib: (_program: WebGLProgram, index: number) => state.attributes[index] ?? null,
    getUniformLocation: (_program: WebGLProgram, name: string) => {
      state.uniformLocationNames.push(name);
      return state.missingUniforms.has(name) ? null : {};
    },
    getAttribLocation: (_program: WebGLProgram, name: string) => state.attributeLocations.get(name) ?? -1
  } as unknown as WebGL2RenderingContext;
  return { gl, program, state, constants };
}

describe("staged static batch unlit source", () => {
  it("preserves the ordinary fragment exactly and the non-instanced vertex operations", () => {
    const ordinary = ordinaryUnlit();
    const batch = deriveStaticBatchUnlitShaderSource(ordinary);
    expect(batch.fragment).toBe(ordinary.fragment);
    expect(batch.marker).toBe(ordinary.marker);
    expect(batch.label).not.toBe(ordinary.name);
    expect(batch.vertex).toContain("layout(location = 0) in vec3 a_position;");
    expect(batch.vertex).toContain("layout(location = 4) in vec4 a_color;");
    expect(batch.vertex).toContain("uniform mat4 u_batchMVP[2];");
    expect(batch.vertex).toContain("v_vertexColor = a_color;");
    expect(batch.vertex).toContain("gl_PointSize = min(max(u_pointSize, 1.0), 256.0);");
    expect(batch.vertex).toContain("gl_Position = u_batchMVP[gl_InstanceID] * vec4(a_position, 1.0);");
    expect(batch.vertex).not.toMatch(/a_instance|u_instance|u_modelViewProjection/);
    expect(STATIC_BATCH_UNLIT_INSTANCE_COUNT).toBe(2);
  });

  it("fails closed if either ordinary stage or its shader identity is replaced", () => {
    const ordinary = ordinaryUnlit();
    const candidates = [
      { ...ordinary, name: "custom/unlit" },
      { ...ordinary, marker: "custom-marker" },
      { ...ordinary, vertex: ordinary.vertex.replace("v_vertexColor = a_color;", "v_vertexColor = vec4(1.0);") },
      { ...ordinary, fragment: ordinary.fragment.replace("outColor = base;", "outColor = vec4(1.0);") },
      { ...ordinary, variants: [] }
    ];
    for (const candidate of candidates) {
      expect(() => deriveStaticBatchUnlitShaderSource(candidate)).toThrow("proven, unmodified lean-unlit shader");
    }
  });

  it("exposes a two-matrix array to the engine's uniform reflection", () => {
    const reflection = reflectShaderSources(deriveStaticBatchUnlitShaderSource(ordinaryUnlit()));
    expect(reflection.uniformDetails.get("u_batchMVP")).toMatchObject({ type: "mat4", arraySize: 2, source: "vertex" });
    expect(reflection.attributes.get("a_position")).toBe(0);
    expect(reflection.attributes.get("a_color")).toBe(4);
    expect(reflection.uniforms.has("u_modelViewProjection")).toBe(false);
  });
});

describe("linked static batch unlit resource inspection", () => {
  it("uses the actual vertex uniform limit and requires both array locations", () => {
    const { gl, program, state, constants } = fakeLinkedProgram();
    expect(STATIC_BATCH_UNLIT_VERTEX_UNIFORM_VECTORS).toBe(9);
    expect(inspectStaticBatchUnlitProgram(gl, program)).toEqual({ compatible: true, maxVertexUniformVectors: 9 });
    expect(state.queriedParameters).toContain(constants.MAX_VERTEX_UNIFORM_VECTORS);
    expect(state.uniformLocationNames).toEqual(expect.arrayContaining(["u_batchMVP[0]", "u_batchMVP[1]"]));
  });

  it.each([8, 0, -1, 8.5, Number.NaN, Number.POSITIVE_INFINITY, null, "256"])(
    "rejects the unavailable or insufficient reported limit %s",
    (limit) => {
      const { gl, program, state } = fakeLinkedProgram();
      state.limit = limit;
      expect(inspectStaticBatchUnlitProgram(gl, program)).toEqual({ compatible: false, reason: "vertex-uniform-limit" });
    }
  );

  it("rejects lost contexts and unlinked programs", () => {
    const lost = fakeLinkedProgram();
    lost.state.lost = true;
    expect(inspectStaticBatchUnlitProgram(lost.gl, lost.program)).toEqual({ compatible: false, reason: "context-lost" });
    const unlinked = fakeLinkedProgram();
    unlinked.state.linked = false;
    expect(inspectStaticBatchUnlitProgram(unlinked.gl, unlinked.program)).toEqual({ compatible: false, reason: "link-status" });
  });

  it("rejects a truncated, mistyped, duplicate or optimized-out array", () => {
    const variants = [
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.uniforms[0]!.size = 1; },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.uniforms[0]!.type = 0; },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.uniforms[0]!.name = "u_other[0]"; },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.uniforms[1] = { ...state.uniforms[0]! }; },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.missingUniforms.add("u_batchMVP[0]"); },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.missingUniforms.add("u_batchMVP[1]"); },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.missingUniforms.add("u_baseColor"); },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.uniforms.pop(); }
    ];
    for (const alter of variants) {
      const { gl, program, state } = fakeLinkedProgram();
      alter(state);
      expect(inspectStaticBatchUnlitProgram(gl, program)).toEqual({ compatible: false, reason: "uniform-reflection" });
    }
  });

  it("requires the ordinary position and color input locations and types", () => {
    const variants = [
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.attributeLocations.set("a_color", 5); },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.attributes[0]!.type = 0; },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.attributes[1]!.size = 2; },
      (state: ReturnType<typeof fakeLinkedProgram>["state"]) => { state.attributes.pop(); }
    ];
    for (const alter of variants) {
      const { gl, program, state } = fakeLinkedProgram();
      alter(state);
      expect(inspectStaticBatchUnlitProgram(gl, program)).toEqual({ compatible: false, reason: "attribute-reflection" });
    }
  });

  it("treats a native inspection exception as ineligible", () => {
    const { gl, program } = fakeLinkedProgram();
    gl.getActiveUniform = () => { throw new Error("context unavailable"); };
    expect(inspectStaticBatchUnlitProgram(gl, program)).toEqual({ compatible: false, reason: "inspection-failed" });
  });
});
