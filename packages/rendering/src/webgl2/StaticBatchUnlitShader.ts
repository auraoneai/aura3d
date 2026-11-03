import type { ShaderSources } from "../RenderDevice";
import {
  DEFAULT_UNLIT_SHADER_MARKER,
  DEFAULT_UNLIT_SHADER_NAME,
  ShaderLibrary,
  registerLeanUnlitShader,
  type ShaderSourcePair
} from "../ShaderLibraryCore";

/**
 * A staged source for a pair of ordinary lean-unlit draws. This module does
 * not register a program, select draws, or confer trust on a WebGL device.
 *
 * The caller must prove that both draws have the same resident geometry,
 * ranges, vertex layout, fragment uniforms and raster state, and supply the
 * already-projected Float32 MVPs in original sorted order. It must also prove
 * that no custom/generated shader, deformation, clipping, per-instance data,
 * or other feature changes either original draw. Those checks are deliberately
 * outside this source-only module.
 */
export const STATIC_BATCH_UNLIT_LABEL = "aura3d/staged-static-batch-unlit-pair";
export const STATIC_BATCH_UNLIT_INSTANCE_COUNT = 2;

// Two mat4s use eight vec4 slots. Count the point-size float as a full slot:
// this is deliberately conservative even on implementations that pack it.
export const STATIC_BATCH_UNLIT_VERTEX_UNIFORM_VECTORS = 9;

// This guard pins every byte of the ordinary vertex shader whose non-instanced
// branch the variant below reproduces. If that shader changes, re-prove the
// variant rather than silently carrying forward stale vertex semantics.
const PROVEN_LEAN_UNLIT_VERTEX = `#version 300 es
// ${DEFAULT_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
uniform mat4 u_modelViewProjection;
uniform float u_pointSize;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
out vec4 v_vertexColor;
void main() {
  // P2 instanced-GLB path (muse3jsparity-PRD): the u_instanceCount branch is
  // taken only for items carrying instanceTransforms; every other draw keeps
  // the legacy math bit-exact.
  if (u_instanceCount > 0.5) {
    int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
    mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
    mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
    v_vertexColor = a_color * a_instanceColor;
    gl_PointSize = min(max(u_pointSize, 1.0), 256.0);
    gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
  } else {
    v_vertexColor = a_color;
    gl_PointSize = min(max(u_pointSize, 1.0), 256.0);
    gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
  }
}
`;

/**
 * Derive the staged variant only from the unmodified, currently registered
 * lean-unlit source. The fragment is reused verbatim, including its color,
 * point-mask and alpha-cutoff semantics. The separate draw eligibility gate
 * must establish the original program and both members' matching inputs.
 */
export function deriveStaticBatchUnlitShaderSource(ordinary: ShaderSourcePair): ShaderSources {
  const library = new ShaderLibrary();
  registerLeanUnlitShader(library);
  const canonical = library.get(DEFAULT_UNLIT_SHADER_NAME);
  if (canonical.vertex !== PROVEN_LEAN_UNLIT_VERTEX
    || ordinary.name !== canonical.name
    || ordinary.marker !== canonical.marker
    || ordinary.vertex !== canonical.vertex
    || ordinary.fragment !== canonical.fragment
    || ordinary.webgpu !== undefined
    || ordinary.portableBindings !== undefined
    || ordinary.variants !== undefined) {
    throw new Error("Static batch unlit source requires the proven, unmodified lean-unlit shader");
  }

  return {
    label: STATIC_BATCH_UNLIT_LABEL,
    // Keep the ordinary marker so the fragment can be byte-for-byte identical.
    marker: ordinary.marker,
    vertex: `#version 300 es
// ${DEFAULT_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
uniform mat4 u_batchMVP[2];
uniform float u_pointSize;
out vec4 v_vertexColor;
void main() {
  v_vertexColor = a_color;
  gl_PointSize = min(max(u_pointSize, 1.0), 256.0);
  gl_Position = u_batchMVP[gl_InstanceID] * vec4(a_position, 1.0);
}
`,
    fragment: ordinary.fragment
  };
}

export type StaticBatchUnlitInspection =
  | { readonly compatible: true; readonly maxVertexUniformVectors: number }
  | { readonly compatible: false; readonly reason: "context-lost" | "vertex-uniform-limit" | "link-status" | "uniform-reflection" | "attribute-reflection" | "inspection-failed" };

/**
 * Inspect an already-linked native WebGL2 program. Source reflection alone
 * cannot establish the device limit, live array length, or usable locations.
 * Even a positive result is only a resource-shape check: the caller must own
 * and identify the program, recheck after context restoration, separately
 * prewarm its VAO/program, and establish driver behavior before use.
 */
export function inspectStaticBatchUnlitProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): StaticBatchUnlitInspection {
  try {
    if (gl.isContextLost()) return { compatible: false, reason: "context-lost" };
    const limit: unknown = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < STATIC_BATCH_UNLIT_VERTEX_UNIFORM_VECTORS) {
      return { compatible: false, reason: "vertex-uniform-limit" };
    }
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      return { compatible: false, reason: "link-status" };
    }

    const uniforms = new Map<string, { readonly type: number; readonly size: number }>([
      ["u_batchMVP[0]", { type: gl.FLOAT_MAT4, size: STATIC_BATCH_UNLIT_INSTANCE_COUNT }],
      ["u_pointSize", { type: gl.FLOAT, size: 1 }],
      ["u_baseColor", { type: gl.FLOAT_VEC4, size: 1 }],
      ["u_alphaCutoff", { type: gl.FLOAT, size: 1 }],
      ["u_roundPoints", { type: gl.FLOAT, size: 1 }]
    ]);
    if (gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) !== uniforms.size) {
      return { compatible: false, reason: "uniform-reflection" };
    }
    for (let index = 0; index < 5; index += 1) {
      const actual = gl.getActiveUniform(program, index);
      const expected = actual && uniforms.get(actual.name);
      if (!actual || !expected || actual.type !== expected.type || actual.size !== expected.size
        || gl.getUniformLocation(program, actual.name) === null) {
        return { compatible: false, reason: "uniform-reflection" };
      }
      uniforms.delete(actual.name);
    }
    // A dynamically indexed two-matrix array must expose both elements.
    if (uniforms.size !== 0 || gl.getUniformLocation(program, "u_batchMVP[1]") === null) {
      return { compatible: false, reason: "uniform-reflection" };
    }

    const attributes = new Map<string, { readonly type: number; readonly location: number }>([
      ["a_position", { type: gl.FLOAT_VEC3, location: 0 }],
      ["a_color", { type: gl.FLOAT_VEC4, location: 4 }]
    ]);
    if (gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) !== attributes.size) {
      return { compatible: false, reason: "attribute-reflection" };
    }
    for (let index = 0; index < 2; index += 1) {
      const actual = gl.getActiveAttrib(program, index);
      const expected = actual && attributes.get(actual.name);
      if (!actual || !expected || actual.type !== expected.type || actual.size !== 1
        || gl.getAttribLocation(program, actual.name) !== expected.location) {
        return { compatible: false, reason: "attribute-reflection" };
      }
      attributes.delete(actual.name);
    }
    if (attributes.size !== 0) return { compatible: false, reason: "attribute-reflection" };
    if (gl.isContextLost()) return { compatible: false, reason: "context-lost" };
    return { compatible: true, maxVertexUniformVectors: limit };
  } catch {
    return { compatible: false, reason: "inspection-failed" };
  }
}
