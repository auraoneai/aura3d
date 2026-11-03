import type { ShaderSources } from "../RenderDevice";
import type { ProgramFeatures } from "../contracts/program";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../program/ProgramGenerator";
import { PROGRAM_OUTPUT_SRGB_FEATURE, type ProgramGraphFeatures } from "../program/ProgramFeatures";

/** Private resource label for the bounded WebGL2 generated-unlit pair. */
export const STATIC_GENERATED_UNLIT_PAIR_LABEL = "aura3d/staged-static-generated-unlit-pair";
export const STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM = "u_batchModel";
export const STATIC_GENERATED_UNLIT_PAIR_INSTANCE_COUNT = 2;

const MODEL_DECLARATION = "uniform mat4 u_modelMatrix;";
const MODEL_PAIR_DECLARATION = `uniform mat4 ${STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM}[2];`;
const TRANSFORM_ANCHORS = [
  "  vec3 transformed = a_position;",
  "  mat4 instanceMatrix = mat4(1.0);",
  "  vec4 a3dLocal = u_geometryMatrix * vec4(transformed, 1.0);",
  "  vec4 a3dWorld = u_modelMatrix * instanceMatrix * a3dLocal;",
  "  gl_Position = u_viewProjection * a3dWorld;"
] as const;

function supportedFeatures(features: ProgramGraphFeatures): boolean {
  const selected = Object.entries(features.features);
  return features.target === "glsl300es" && features.pass === "forward" && features.lighting === "unlit"
    && features.alphaMode === "opaque" && !features.doubleSided && !features.vertexColors && !features.flatShading
    && !features.skinning && !features.morph && !features.instancing && !features.drawId && !features.graph
    && Object.keys(features.maps).length === 0 && features.extensions.length === 0 && features.fog === "none"
    && features.environment === "none" && !features.backgroundCoverage
    && features.shadows.cascades === 0 && features.shadows.localShadows === 0 && !features.shadows.contact
    && selected.length === 1 && selected[0]![0] === PROGRAM_OUTPUT_SRGB_FEATURE && selected[0]![1] === true;
}

// Issuance is called only for the ordinary plain source record freshly made by
// ProgramCache. The device can then check identity before reading any optional
// metadata from an otherwise public, potentially accessor-backed argument.
const recordedSources = new WeakMap<object, ShaderSources>();
const weakMapGet = WeakMap.prototype.get;
const intrinsicApply = Reflect.apply;

/** Capture only the engine-created top-level source record, without visiting its descriptor. */
export function recordStaticGeneratedUnlitSources(sources: ShaderSources): void {
  try {
    if (recordedSources.has(sources)) return;
    const ownValue = (name: string): unknown => {
      const property = Object.getOwnPropertyDescriptor(sources, name);
      return property && "value" in property ? property.value : undefined;
    };
    const label = ownValue("label"), marker = ownValue("marker"), vertex = ownValue("vertex"), fragment = ownValue("fragment");
    const descriptor = ownValue("generatedProgram") as ShaderSources["generatedProgram"];
    if (typeof label !== "string" || marker !== GENERATED_PROGRAM_MARKER || typeof vertex !== "string" || typeof fragment !== "string"
      || typeof descriptor !== "object" || descriptor === null) return;
    // Feature records can contain caller-owned objects. Inspect them only on an
    // explicit pair attempt, where regeneration must match these exact strings.
    const snapshot: ShaderSources = Object.freeze({
      label, marker, vertex, fragment, generatedProgram: descriptor
    });
    recordedSources.set(sources, snapshot);
  } catch {
    // Recording is an optional fast path and must never break compilation.
  }
}

/** Identity lookup only: never inspect an unissued source record. */
export function getRecordedStaticGeneratedUnlitSources(sources: unknown): ShaderSources | undefined {
  return intrinsicApply(weakMapGet, recordedSources, [sources]) as ShaderSources | undefined;
}

function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

/**
 * Derive a two-model variant from the exact selected generated program. The
 * caller must separately authenticate ownership of the compiled ordinary
 * program, and prove matching geometry, fragment inputs, raster state and a
 * current AuraFrame binding. This function is source checking, not permission
 * to submit a draw.
 *
 * Regeneration deliberately supplies no flags, so it cannot execute registered
 * feature or lobe hooks. A source modified by any such hook fails the byte
 * comparison. Substitution retains the original identity-instance multiply,
 * geometry and view-projection operations and the complete fragment stage.
 */
export function deriveStaticGeneratedUnlitPairSource(ordinary: ShaderSources): ShaderSources {
  const descriptor = ordinary.generatedProgram;
  const features = descriptor?.features as ProgramGraphFeatures | undefined;
  if (!descriptor || !features || ordinary.marker !== GENERATED_PROGRAM_MARKER
    || ordinary.webgpu !== undefined || ordinary.portableBindings !== undefined
    || descriptor.activeFeatures.length !== 0 || descriptor.activeExtensions.length !== 0 || !supportedFeatures(features)) {
    throw new Error("Static generated unlit pair requires the bounded unmodified generated program");
  }

  // A no-flag regeneration cannot consult registered feature or lobe hooks.
  const expected = generateProgramImpl(features as ProgramFeatures);
  if (ordinary.vertex !== expected.vertex || ordinary.fragment !== expected.fragment
    || occurrences(ordinary.vertex, MODEL_DECLARATION) !== 1
    || occurrences(ordinary.vertex, "u_modelMatrix") !== 3
    || TRANSFORM_ANCHORS.some((anchor) => occurrences(ordinary.vertex, anchor) !== 1)) {
    throw new Error("Static generated unlit pair source differs from the proven transform");
  }
  const vertex = ordinary.vertex.replace(MODEL_DECLARATION, MODEL_PAIR_DECLARATION)
    .replace(/\bu_modelMatrix\b/g, `${STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM}[gl_InstanceID]`);
  return { label: STATIC_GENERATED_UNLIT_PAIR_LABEL, marker: ordinary.marker, vertex, fragment: ordinary.fragment };
}

export type StaticGeneratedUnlitInspection =
  | { readonly compatible: true }
  | { readonly compatible: false; readonly reason: "context-lost" | "link-status" | "attribute-reflection" | "uniform-reflection" | "frame-block" | "inspection-failed" };

type UniformShape = { readonly type: number; readonly size: number };
type FrameMember = UniformShape & { readonly offset: number; readonly stride: number; readonly rowMajor: boolean };
type ProgramShape = { readonly uniforms: Map<string, UniformShape>; readonly frame: Map<string, FrameMember> };

/**
 * Compare actual linked interfaces. A positive result is not source, buffer,
 * context-generation, or driver-behavior authentication. Block members are
 * checked separately because WebGL includes them in ACTIVE_UNIFORMS even though
 * they have no default-block uniform locations.
 */
export function inspectStaticGeneratedUnlitPairProgram(
  gl: WebGL2RenderingContext,
  ordinaryProgram: WebGLProgram,
  pairProgram: WebGLProgram
): StaticGeneratedUnlitInspection {
  try {
    if (gl.isContextLost()) return { compatible: false, reason: "context-lost" };
    if (gl.getProgramParameter(ordinaryProgram, gl.LINK_STATUS) !== true
      || gl.getProgramParameter(pairProgram, gl.LINK_STATUS) !== true) return { compatible: false, reason: "link-status" };

    for (const program of [ordinaryProgram, pairProgram]) {
      if (gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) !== 1) return { compatible: false, reason: "attribute-reflection" };
      const attribute = gl.getActiveAttrib(program, 0);
      if (!attribute || attribute.name !== "a_position" || attribute.type !== gl.FLOAT_VEC3 || attribute.size !== 1
        || gl.getAttribLocation(program, attribute.name) !== 0) return { compatible: false, reason: "attribute-reflection" };
    }

    const read = (program: WebGLProgram): ProgramShape | "frame-block" | "uniform-reflection" => {
      const block = gl.getUniformBlockIndex(program, "AuraFrame");
      if (block === gl.INVALID_INDEX || !Number.isSafeInteger(block) || block < 0
        || gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS) !== 1
        || gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_BINDING) !== 0
        || gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_DATA_SIZE) !== 304) return "frame-block";
      const count: unknown = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 32) return "uniform-reflection";
      const indices = Array.from({ length: count }, (_, index) => index);
      const blocks = gl.getActiveUniforms(program, indices, gl.UNIFORM_BLOCK_INDEX) as ArrayLike<number>;
      const offsets = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET) as ArrayLike<number>;
      const strides = gl.getActiveUniforms(program, indices, gl.UNIFORM_MATRIX_STRIDE) as ArrayLike<number>;
      const rows = gl.getActiveUniforms(program, indices, gl.UNIFORM_IS_ROW_MAJOR) as ArrayLike<boolean | number>;
      if (!blocks || !offsets || !strides || !rows || [blocks, offsets, strides, rows].some((list) => list.length !== count)) return "uniform-reflection";
      const allowedFrame = new Map<string, { readonly type: number; readonly offset: number; readonly stride: number }>([
        ["u_view", { type: gl.FLOAT_MAT4, offset: 0, stride: 16 }],
        ["u_projection", { type: gl.FLOAT_MAT4, offset: 64, stride: 16 }],
        ["u_viewProjection", { type: gl.FLOAT_MAT4, offset: 128, stride: 16 }],
        ["u_prevViewProjection", { type: gl.FLOAT_MAT4, offset: 192, stride: 16 }],
        ["u_cameraPositionNear", { type: gl.FLOAT_VEC4, offset: 256, stride: 0 }],
        ["u_resolutionFarTime", { type: gl.FLOAT_VEC4, offset: 272, stride: 0 }],
        ["u_exposureFlags", { type: gl.FLOAT_VEC4, offset: 288, stride: 0 }]
      ]);
      const uniforms = new Map<string, UniformShape>();
      const frame = new Map<string, FrameMember>();
      for (const index of indices) {
        const info = gl.getActiveUniform(program, index);
        if (!info || !Number.isSafeInteger(info.size) || info.size <= 0) return "uniform-reflection";
        if (blocks[index] === block) {
          const name = info.name.replace(/^AuraFrame\./, "");
          const expected = allowedFrame.get(name);
          if (!expected || frame.has(name) || info.type !== expected.type || info.size !== 1
            || offsets[index] !== expected.offset || strides[index] !== expected.stride || Boolean(rows[index])
            || gl.getUniformLocation(program, info.name) !== null) return "frame-block";
          frame.set(name, { type: info.type, size: info.size, offset: offsets[index]!, stride: strides[index]!, rowMajor: false });
        } else {
          if (blocks[index] !== -1 && blocks[index] !== gl.INVALID_INDEX) return "frame-block";
          if (uniforms.has(info.name) || gl.getUniformLocation(program, info.name) === null) return "uniform-reflection";
          uniforms.set(info.name, { type: info.type, size: info.size });
        }
      }
      if (!frame.has("u_viewProjection")) return "frame-block";
      return { uniforms, frame };
    };

    const ordinary = read(ordinaryProgram), pair = read(pairProgram);
    if (ordinary === "frame-block" || pair === "frame-block") return { compatible: false, reason: "frame-block" };
    if (ordinary === "uniform-reflection" || pair === "uniform-reflection") return { compatible: false, reason: "uniform-reflection" };
    if (ordinary.frame.size !== pair.frame.size) return { compatible: false, reason: "frame-block" };
    for (const [name, left] of ordinary.frame) {
      const right = pair.frame.get(name);
      if (!right || left.type !== right.type || left.size !== right.size || left.offset !== right.offset
        || left.stride !== right.stride || left.rowMajor !== right.rowMajor) return { compatible: false, reason: "frame-block" };
    }
    const required = new Map<string, UniformShape>([
      ["u_geometryMatrix", { type: gl.FLOAT_MAT4, size: 1 }],
      ["u_baseColor", { type: gl.FLOAT_VEC4, size: 1 }],
      ["u_emissiveColor", { type: gl.FLOAT_VEC3, size: 1 }],
      ["u_emissiveStrength", { type: gl.FLOAT, size: 1 }]
    ]);
    const shapeMatches = (actual: UniformShape | undefined, expected: UniformShape): boolean =>
      !!actual && actual.type === expected.type && actual.size === expected.size;
    if (!shapeMatches(ordinary.uniforms.get("u_modelMatrix"), { type: gl.FLOAT_MAT4, size: 1 })
      || !shapeMatches(pair.uniforms.get(`${STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM}[0]`), { type: gl.FLOAT_MAT4, size: 2 })
      || gl.getUniformLocation(pairProgram, `${STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM}[1]`) === null) {
      return { compatible: false, reason: "uniform-reflection" };
    }
    ordinary.uniforms.delete("u_modelMatrix");
    pair.uniforms.delete(`${STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM}[0]`);
    for (const [name, expected] of required) {
      if (!shapeMatches(ordinary.uniforms.get(name), expected) || !shapeMatches(pair.uniforms.get(name), expected)) {
        return { compatible: false, reason: "uniform-reflection" };
      }
      ordinary.uniforms.delete(name);
      pair.uniforms.delete(name);
    }
    // Some drivers may optimize the point-size output away. Both programs
    // must agree on whether its standalone uniform is active.
    if (ordinary.uniforms.size !== pair.uniforms.size || ordinary.uniforms.size > 1
      || (ordinary.uniforms.size === 1 && (!shapeMatches(ordinary.uniforms.get("u_pointSize"), { type: gl.FLOAT, size: 1 })
        || !shapeMatches(pair.uniforms.get("u_pointSize"), { type: gl.FLOAT, size: 1 })))) {
      return { compatible: false, reason: "uniform-reflection" };
    }
    if (gl.isContextLost()) return { compatible: false, reason: "context-lost" };
    return { compatible: true };
  } catch {
    return { compatible: false, reason: "inspection-failed" };
  }
}
