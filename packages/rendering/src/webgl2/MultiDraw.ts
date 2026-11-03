// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { resolveDepthDrawState } from "../DepthConvention";
import { RenderDeviceError, type DrawCommand, type InstanceVertexAttribute, type RenderBuffer, type RenderShaderProgram, type UniformValue } from "../RenderDevice";
import { hasAttachmentRenderOverrides, resolveBlendMode, validateRenderCommandState } from "../contracts/blend";
import type { BlendEquation, BlendFactor } from "../contracts/blend";
import { isTextureBinding, type TextureBinding } from "../TextureBinding";
import type { VertexAttribute, VertexAttributeType, VertexFormat } from "../VertexFormat";
import { WebGL2Buffer, WebGL2ShaderProgram } from "../WebGL2Device";
import type { WebGL2DeviceHost } from "./DeviceHost";
import { planWebGLBatchMvpPair, type WebGLBatchSubmissionState } from "./BatchExecutionCapability";
import { inspectStaticBatchUnlitProgram, STATIC_BATCH_UNLIT_LABEL } from "./StaticBatchUnlitShader";
import {
  inspectStaticGeneratedUnlitPairProgram,
  STATIC_GENERATED_UNLIT_PAIR_LABEL,
  STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM
} from "./StaticGeneratedUnlitShader";

export interface WebGL2VertexArrayCacheEntry {
  readonly key: string;
  readonly handle: WebGLVertexArrayObject;
  readonly boundLocations: ReadonlySet<number>;
  /** Ids of the vertex, index and instance buffers this VAO references (the reverse of `bufferVaoIndex`, SI-6). */
  readonly bufferIds?: readonly number[];
}

/** `uniform1f` on an int/uint/bool uniform raises INVALID_OPERATION, so integer-typed scalars (source `int` or GL enum strings) bind through `uniform1i`/`uniform1ui`. */
function integerUniformKind(type: string | undefined): "int" | "uint" | undefined {
  if (type === "int" || type === "bool" || type === "5124" || type === "35670") return "int";
  if (type === "uint" || type === "5125") return "uint";
  return undefined;
}

type FloatUniformSetter = "1f" | "2f" | "3f" | "4f" | "mat2" | "mat3" | "mat4" | "mat2x3" | "mat2x4" | "mat3x2" | "mat3x4" | "mat4x2" | "mat4x3";

type IntegerArraySetter = "1i" | "2i" | "3i" | "4i" | "1ui" | "2ui" | "3ui" | "4ui";

/**
 * S5-WP05-03: the integer vector setter for a declared int/ivec/bool/bvec or
 * uint/uvec uniform (GL enum string or GLSL type name). Integer and boolean
 * leaves of portable data uniforms are uploaded with these setters so their
 * values are never reinterpreted as float bits.
 */
function integerArraySetter(type: string | undefined): IntegerArraySetter | undefined {
  switch (type) {
    case "int": case "bool": case "5124": case "35670": return "1i";
    case "ivec2": case "bvec2": case "35667": case "35671": return "2i";
    case "ivec3": case "bvec3": case "35668": case "35672": return "3i";
    case "ivec4": case "bvec4": case "35669": case "35673": return "4i";
    case "uint": case "5125": return "1ui";
    case "uvec2": case "36294": return "2ui";
    case "uvec3": case "36295": return "3ui";
    case "uvec4": case "36296": return "4ui";
    default: return undefined;
  }
}

const INTEGER_SETTER_COMPONENTS: Readonly<Record<IntegerArraySetter, number>> = { "1i": 1, "2i": 2, "3i": 3, "4i": 4, "1ui": 1, "2ui": 2, "3ui": 3, "4ui": 4 };

/**
 * GU47 phase 2: the float setter for a declared uniform type, from either the
 * linked program (GL enum as a string, `getActiveUniform`) or source
 * reflection (GLSL type name). `undefined` when the type is not a float type
 * the binder knows, so the caller falls back to the length heuristic.
 */
function floatUniformSetter(type: string | undefined): FloatUniformSetter | undefined {
  switch (type) {
    case "float":
    case "5126":
      return "1f";
    case "vec2":
    case "35664":
      return "2f";
    case "vec3":
    case "35665":
      return "3f";
    case "vec4":
    case "35666":
      return "4f";
    case "mat2":
    case "mat2x2":
    case "35674":
      return "mat2";
    case "mat3":
    case "mat3x3":
    case "35675":
      return "mat3";
    case "mat4":
    case "mat4x4":
    case "35676":
      return "mat4";
    case "mat2x3": case "35685": return "mat2x3";
    case "mat2x4": case "35686": return "mat2x4";
    case "mat3x2": case "35687": return "mat3x2";
    case "mat3x4": case "35688": return "mat3x4";
    case "mat4x2": case "35689": return "mat4x2";
    case "mat4x3": case "35690": return "mat4x3";
    default:
      return undefined;
  }
}

const FLOAT_SETTER_COMPONENTS: Readonly<Record<FloatUniformSetter, number>> = {
  "1f": 1, "2f": 2, "3f": 3, "4f": 4, mat2: 4, mat3: 9, mat4: 16, mat2x3: 6, mat2x4: 8, mat3x2: 6, mat3x4: 12, mat4x2: 8, mat4x3: 12
};

/** Effective values selected by two ordinary lean-unlit draws, in sorted order. */
export interface StaticUnlitPairUniformPlan {
  readonly effectiveMvpPair: Float32Array;
  readonly pointSize: number;
  readonly baseColor: Float32Array;
  readonly alphaCutoff: number;
  readonly roundPoints: number;
}

/** Effective generated-unlit inputs, in the order of the original draws. */
export interface GeneratedStaticUnlitPairUniformPlan {
  readonly effectiveModelPair: Float32Array;
  readonly effectiveGeometryMatrix: Float32Array;
  /** Copied from the device-authenticated AuraFrame buffer, not the item. */
  readonly frameViewProjection: Float32Array;
  /** Effective common standalone uniforms, including retained native values. */
  readonly commonUniforms: ReadonlyMap<string, number | Float32Array>;
}

const GENERATED_STATIC_UNLIT_COMMON_UNIFORMS: Readonly<Record<string, FloatUniformSetter>> = {
  u_baseColor: "4f",
  u_emissiveColor: "3f",
  u_emissiveStrength: "1f",
  u_pointSize: "1f",
  u_alphaCutoff: "1f"
};
const GENERATED_STATIC_UNLIT_FRAME_MEMBERS = new Set([
  "u_view", "u_projection", "u_viewProjection", "u_prevViewProjection",
  "u_cameraPositionNear", "u_resolutionFarTime", "u_exposureFlags"
]);

const STATIC_UNLIT_UNIFORMS = new Set([
  "u_modelViewProjection", "u_pointSize", "u_baseColor", "u_alphaCutoff", "u_roundPoints",
  "u_instanceCount", "u_instanceAttributeMode", "u_instanceMatrices"
]);

const staticTypedArrayPrototype = Object.getPrototypeOf(Float32Array.prototype);
const staticTypedArrayLength = Object.getOwnPropertyDescriptor(staticTypedArrayPrototype, "length")!.get!;
const staticTypedArrayBuffer = Object.getOwnPropertyDescriptor(staticTypedArrayPrototype, "buffer")!.get!;
const staticArrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;

/** Reject accessors, shared storage, non-finite values and unsupported array types. */
function staticFiniteNumbers(value: unknown, length?: number, maximum = 1024): number[] | undefined {
  try {
    let count: number;
    let read: (index: number) => unknown;
    if (ArrayBuffer.isView(value) && Object.getPrototypeOf(value) === Float32Array.prototype) {
      if (Object.getOwnPropertyDescriptor(value, "length") !== undefined) return undefined;
      count = Reflect.apply(staticTypedArrayLength, value, []) as number;
      const buffer = Reflect.apply(staticTypedArrayBuffer, value, []);
      // This native brand check rejects SharedArrayBuffer as well as detached storage.
      Reflect.apply(staticArrayBufferLength, buffer, []);
      read = (index) => (value as Float32Array)[index];
    } else if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
      count = value.length;
      read = (index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        return descriptor && "value" in descriptor ? descriptor.value : undefined;
      };
    } else {
      return undefined;
    }
    if (!Number.isSafeInteger(count) || count <= 0 || count > maximum || (length !== undefined && count !== length)) return undefined;
    const result: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const number = read(index);
      if (typeof number !== "number" || !Number.isFinite(number) || !Number.isFinite(Math.fround(number))) return undefined;
      result.push(number);
    }
    return result;
  } catch {
    return undefined;
  }
}

function staticUniformMap(value: DrawCommand["uniforms"]): value is NonNullable<DrawCommand["uniforms"]> {
  return value instanceof Map && Object.getPrototypeOf(value) === Map.prototype && Reflect.ownKeys(value).length === 0;
}

function staticPairScalar(
  name: string, first: ReadonlyMap<string, unknown>, second: ReadonlyMap<string, unknown>, cached: unknown, native: unknown
): readonly [number, number] | undefined {
  if (typeof native !== "number" || !Number.isFinite(native) || !Object.is(Math.fround(native), native)
    || (cached !== undefined && (typeof cached !== "number" || !Number.isFinite(cached)))) return undefined;
  let last = cached as number | undefined;
  let current = native;
  const values: number[] = [];
  for (const uniforms of [first, second]) {
    if (uniforms.has(name)) {
      const value = uniforms.get(name);
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) return undefined;
      if (last !== value) {
        last = value;
        current = Math.fround(value);
      }
    }
    values.push(current);
  }
  return [values[0]!, values[1]!];
}

function staticPairVector4(
  name: string, first: ReadonlyMap<string, unknown>, second: ReadonlyMap<string, unknown>, cached: unknown, native: unknown
): readonly [number[], number[]] | undefined {
  let current = staticFiniteNumbers(native, 4, 4);
  let last = cached === undefined ? undefined : staticFiniteNumbers(cached, 4, 4);
  if (!current || current.some((value) => !Object.is(Math.fround(value), value)) || (cached !== undefined && !last)) return undefined;
  const values: number[][] = [];
  for (const uniforms of [first, second]) {
    if (uniforms.has(name)) {
      const incoming = staticFiniteNumbers(uniforms.get(name), 4, 4);
      if (!incoming) return undefined;
      if (!last || incoming.some((value, index) => last![index] !== value)) {
        last = incoming.map(Math.fround);
        current = [...last];
      }
    }
    values.push([...current]);
  }
  return [values[0]!, values[1]!];
}

/** Model the ordinary binder's retained float snapshot for vec3/vec4 values. */
function staticPairVector(
  name: string, size: number, first: ReadonlyMap<string, unknown>, second: ReadonlyMap<string, unknown>, cached: unknown, native: unknown
): readonly [number[], number[]] | undefined {
  let current = staticFiniteNumbers(native, size, size);
  let last = cached === undefined ? undefined : staticFiniteNumbers(cached, size, size);
  if (!current || current.some((value) => !Object.is(Math.fround(value), value)) || (cached !== undefined && !last)) return undefined;
  const values: number[][] = [];
  for (const uniforms of [first, second]) {
    if (uniforms.has(name)) {
      const incoming = staticFiniteNumbers(uniforms.get(name), size, size);
      if (!incoming) return undefined;
      if (!last || incoming.some((value, index) => last![index] !== value)) {
        last = incoming.map(Math.fround);
        current = [...last];
      }
    }
    values.push([...current]);
  }
  return [values[0]!, values[1]!];
}

function staticEqualNumbers(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

export class WebGL2DrawCallBinder {
  constructor(readonly host: WebGL2DeviceHost) {
    // `gl_DrawID` (`#extension GL_ANGLE_multi_draw`) needs WEBGL_multi_draw enabled before the program links, so request it now.
    this.multiDrawExtension();
    // Other passes invalidate the device cache after making raw GL calls.
    // Forget these two shadows at the same boundary so they are restored.
    this.host.stateCache.onInvalidate?.(() => {
      this.frontFace = undefined;
      this.blendConstant = undefined;
    });
  }

  nextVertexFormatId = 1;

  private frontFace: "ccw" | "cw" | undefined;
  private blendConstant: readonly [number, number, number, number] | undefined;

  uniformLocationCache = new WeakMap<WebGL2ShaderProgram, Map<string, WebGLUniformLocation | null>>();

  /**
   * PRD-01 Phase 6: per-program last-value uniform cache — skips the GL call
   * when the incoming value equals what was last uploaded for this program
   * (numbers by value, arrays element-wise vs a retained snapshot, texture
   * bindings by texture/sampler/transform identity).
   */
  private uniformValueCache = new WeakMap<WebGL2ShaderProgram, Map<string, unknown>>();

  readonly vertexArrayCache = new Map<string, WebGL2VertexArrayCacheEntry>();

  /** buffer id → VAO keys referencing it (PRD-01 Phase 6 §6.1 eviction index). */
  private readonly bufferVaoIndex = new Map<number, Set<string>>();
  private readonly retiringVertexArrays = new Set<string>();

  readonly vertexFormatIds = new WeakMap<VertexFormat, number>();

  /** #180: `WEBGL_multi_draw`, queried lazily (`undefined` = not queried yet). */
  private multiDrawExt: WebGLMultiDrawExtension | null | undefined;

  /** A lost context must not keep an extension object from its old generation. */
  invalidateMultiDrawExtension(): void {
    this.multiDrawExt = undefined;
  }

  /**
   * #94 (Q-01-1, C-29): drop every cache that holds a GL object name or a
   * value uploaded into the lost context, so VAOs, uniform locations and the
   * last-value uniform snapshots recreate lazily on the next draw after
   * `webglcontextrestored`. VAO handles are not deleted: they died with the
   * context. Buffers, textures and programs are rebuilt by the C-29
   * ResourceRegistry (they need CPU-side sources this binder does not own).
   */
  invalidateGpuObjects(): void {
    this.vertexArrayCache.clear();
    this.bufferVaoIndex.clear();
    this.uniformLocationCache = new WeakMap();
    this.uniformValueCache = new WeakMap();
    this.frontFace = undefined;
    this.blendConstant = undefined;
    this.invalidateMultiDrawExtension();
    this.multiDrawExtension();
  }

  draw(command: DrawCommand): void {
    this.prepareDraw(command);
    this.issueDraw(command);
  }

  /**
   * Read the ordinary program's native uniforms and model the binder's cache
   * hits for two commands. The caller must authenticate the native context,
   * the ordinary shader and every participant before using this result. This
   * method does not bind GL state, issue a draw, or authorize batching.
   */
  inspectStaticUnlitPair(first: DrawCommand, second: DrawCommand): StaticUnlitPairUniformPlan | undefined {
    try {
      if (this.host.errorCheckMode === "strict" || this.host.disposed || !this.host.lifecycle.frameActive
        || this.host.lifecycle.isDeviceLost() || !this.staticUnlitCommandsMatch(first, second)
        || !staticUniformMap(first.uniforms) || !staticUniformMap(second.uniforms)) return undefined;
      const shader = this.requireShader(first.shader!);
      if ([...shader.reflection.uniforms].some((name) => !STATIC_UNLIT_UNIFORMS.has(name))) return undefined;
      const required = ["u_modelViewProjection", "u_pointSize", "u_baseColor", "u_alphaCutoff", "u_roundPoints", "u_instanceCount"];
      if (required.some((name) => !shader.reflection.uniforms.has(name))) return undefined;
      for (const name of shader.reflection.uniforms) {
        const actual = shader.reflection.uniformDetails.get(name)?.type;
        const expected = name === "u_modelViewProjection" || name === "u_instanceMatrices" ? "mat4" : name === "u_baseColor" ? "4f" : "1f";
        if (floatUniformSetter(actual) !== expected) return undefined;
      }
      const firstUniforms = first.uniforms;
      const secondUniforms = second.uniforms;
      if (!firstUniforms.has("u_modelViewProjection") || !secondUniforms.has("u_modelViewProjection")) return undefined;
      const cache = this.uniformValueCache.get(shader);
      for (const uniforms of [firstUniforms, secondUniforms]) {
        for (const [name, value] of uniforms) {
          if (!shader.reflection.uniforms.has(name)) continue;
          if (name === "u_modelViewProjection") {
            if (!staticFiniteNumbers(value, 16, 16) || !(value instanceof Float32Array)) return undefined;
          } else if (name === "u_baseColor") {
            if (!staticFiniteNumbers(value, 4, 4)) return undefined;
          } else if (name === "u_instanceMatrices") {
            const values = staticFiniteNumbers(value);
            const limit = (shader.reflection.uniformDetails.get(name)?.arraySize ?? 1) * 16;
            if (!values || values.length % 16 !== 0 || values.length > limit) return undefined;
          } else if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
            return undefined;
          }
        }
      }
      const cachedMatrices = cache?.get("u_instanceMatrices");
      if (cachedMatrices !== undefined && (!(cachedMatrices instanceof Float32Array) || !staticFiniteNumbers(cachedMatrices))) return undefined;
      const cachedColor = cache?.get("u_baseColor");
      if (cachedColor !== undefined && (!(cachedColor instanceof Float32Array) || !staticFiniteNumbers(cachedColor, 4, 4))) return undefined;
      const gl = this.host.gl;
      const read = (name: string): unknown => {
        const location = gl.getUniformLocation(shader.handle, name);
        return location === null ? undefined : gl.getUniform(shader.handle, location);
      };
      const mvp = planWebGLBatchMvpPair(firstUniforms.get("u_modelViewProjection"), secondUniforms.get("u_modelViewProjection"),
        cache?.get("u_modelViewProjection"), read("u_modelViewProjection"));
      const point = staticPairScalar("u_pointSize", firstUniforms, secondUniforms, cache?.get("u_pointSize"), read("u_pointSize"));
      const color = staticPairVector4("u_baseColor", firstUniforms, secondUniforms, cachedColor, read("u_baseColor"));
      const alpha = staticPairScalar("u_alphaCutoff", firstUniforms, secondUniforms, cache?.get("u_alphaCutoff"), read("u_alphaCutoff"));
      const round = staticPairScalar("u_roundPoints", firstUniforms, secondUniforms, cache?.get("u_roundPoints"), read("u_roundPoints"));
      const instances = staticPairScalar("u_instanceCount", firstUniforms, secondUniforms, cache?.get("u_instanceCount"), read("u_instanceCount"));
      if (!mvp || !point || !color || !alpha || !round || !instances || instances.some((count) => count > 0.5)
        || !Object.is(point[0], point[1]) || !staticEqualNumbers(color[0], color[1])
        || !Object.is(alpha[0], alpha[1]) || !Object.is(round[0], round[1]) || this.host.lifecycle.isDeviceLost()) return undefined;
      return { effectiveMvpPair: mvp.matrices, pointSize: point[0], baseColor: new Float32Array(color[0]), alphaCutoff: alpha[0], roundPoints: round[0] };
    } catch {
      // This is only a read-only eligibility check, never a submission attempt.
      return undefined;
    }
  }

  /**
   * Model generated-unlit uniforms without binding state. The caller owns the
   * frame-block authentication and supplies its current view-projection bytes.
   * In particular, this method does not establish device or source ownership.
   */
  inspectGeneratedStaticUnlitPair(first: DrawCommand, second: DrawCommand,
    frameViewProjection: Float32Array): GeneratedStaticUnlitPairUniformPlan | undefined {
    try {
      if (this.host.errorCheckMode === "strict" || this.host.disposed || !this.host.lifecycle.frameActive
        || this.host.lifecycle.isDeviceLost() || !this.staticUnlitCommandsMatch(first, second)
        || !staticUniformMap(first.uniforms) || !staticUniformMap(second.uniforms)
        || !(frameViewProjection instanceof Float32Array) || !staticFiniteNumbers(frameViewProjection, 16, 16)) return undefined;
      const shader = this.requireShader(first.shader!);
      const gl = this.host.gl;
      const firstUniforms = first.uniforms;
      const secondUniforms = second.uniforms;
      const cache = this.uniformValueCache.get(shader);
      const read = (name: string): unknown => {
        const location = gl.getUniformLocation(shader.handle, name);
        return location === null ? undefined : gl.getUniform(shader.handle, location);
      };

      for (const name of shader.reflection.uniforms) {
        if (GENERATED_STATIC_UNLIT_FRAME_MEMBERS.has(name.replace(/^AuraFrame\./, ""))) {
          // Block fields have no standalone location. Their layout, binding,
          // actual buffer and current bytes are authenticated by the device.
          if (gl.getUniformLocation(shader.handle, name) !== null) return undefined;
          continue;
        }
        const matrix = name === "u_modelMatrix" || name === "u_geometryMatrix";
        const expected = matrix ? "mat4" : Object.hasOwn(GENERATED_STATIC_UNLIT_COMMON_UNIFORMS, name)
          ? GENERATED_STATIC_UNLIT_COMMON_UNIFORMS[name] : undefined;
        if (!expected || floatUniformSetter(shader.reflection.uniformDetails.get(name)?.type) !== expected
          || gl.getUniformLocation(shader.handle, name) === null) return undefined;
        for (const uniforms of [firstUniforms, secondUniforms]) {
          if (!uniforms.has(name)) continue;
          const value = uniforms.get(name);
          if (expected === "mat4") {
            if (!(value instanceof Float32Array) || !staticFiniteNumbers(value, 16, 16)) return undefined;
          } else if (expected === "3f" || expected === "4f") {
            if (!staticFiniteNumbers(value, expected === "3f" ? 3 : 4, expected === "3f" ? 3 : 4)) return undefined;
          } else if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
            return undefined;
          }
        }
      }
      if (!["u_modelMatrix", "u_geometryMatrix", "u_baseColor"].every((name) => shader.reflection.uniforms.has(name))
        || !firstUniforms.has("u_modelMatrix") || !secondUniforms.has("u_modelMatrix")
        || !firstUniforms.has("u_geometryMatrix") || !secondUniforms.has("u_geometryMatrix")) return undefined;

      const models = planWebGLBatchMvpPair(firstUniforms.get("u_modelMatrix"), secondUniforms.get("u_modelMatrix"),
        cache?.get("u_modelMatrix"), read("u_modelMatrix"));
      const geometry = planWebGLBatchMvpPair(firstUniforms.get("u_geometryMatrix"), secondUniforms.get("u_geometryMatrix"),
        cache?.get("u_geometryMatrix"), read("u_geometryMatrix"));
      if (!models || !geometry || !staticEqualNumbers(geometry.matrices.subarray(0, 16), geometry.matrices.subarray(16))) return undefined;

      const commonUniforms = new Map<string, number | Float32Array>();
      for (const name of shader.reflection.uniforms) {
        if (!Object.hasOwn(GENERATED_STATIC_UNLIT_COMMON_UNIFORMS, name)) continue;
        const kind = GENERATED_STATIC_UNLIT_COMMON_UNIFORMS[name];
        if (kind === "1f") {
          const values = staticPairScalar(name, firstUniforms, secondUniforms, cache?.get(name), read(name));
          if (!values || !Object.is(values[0], values[1])) return undefined;
          commonUniforms.set(name, values[0]);
        } else if (kind === "3f" || kind === "4f") {
          const size = kind === "3f" ? 3 : 4;
          const cached = cache?.get(name);
          if (cached !== undefined && !(cached instanceof Float32Array)) return undefined;
          const values = staticPairVector(name, size, firstUniforms, secondUniforms, cached, read(name));
          if (!values || !staticEqualNumbers(values[0], values[1])) return undefined;
          commonUniforms.set(name, new Float32Array(values[0]));
        } else return undefined;
      }
      if (this.host.lifecycle.isDeviceLost()) return undefined;
      return {
        effectiveModelPair: models.matrices,
        effectiveGeometryMatrix: geometry.matrices.slice(0, 16),
        frameViewProjection: new Float32Array(frameViewProjection),
        commonUniforms
      };
    } catch {
      return undefined;
    }
  }

  private staticUnlitCommandsMatch(first: DrawCommand, second: DrawCommand): boolean {
    const state = first.renderState;
    return first.shader !== undefined && first.shader === second.shader && first.vertexFormat !== undefined
      && first.vertexFormat === second.vertexFormat && first.vertexBuffer === second.vertexBuffer
      && sameVertexBuffers(first, second) && first.indexBuffer === second.indexBuffer && first.indexType === second.indexType
      && first.vertexCount === second.vertexCount && (first.firstVertex ?? 0) === (second.firstVertex ?? 0)
      && first.indexCount === second.indexCount && (first.firstIndex ?? 0) === (second.firstIndex ?? 0)
      && first.topology === second.topology && first.renderState === second.renderState
      && !state?.blend && (state?.blendMode === undefined || state.blendMode === "opaque") && !state?.stencil
      && (first.instanceCount ?? 1) === 1 && (second.instanceCount ?? 1) === 1
      && !(first.instanceAttributes?.length || second.instanceAttributes?.length)
      && !(first.nativeStorageBindings?.length || second.nativeStorageBindings?.length)
      && first.vertexFormat.streams.every((stream) => stream.stepMode === "vertex");
  }

  /**
   * Warm only the owned pair program's VAO. The caller must authenticate the
   * context and shader before entry. Native bindings and generic color are
   * restored; a failure after mutation is terminal rather than a fallback.
   */
  prewarmStaticUnlitPairVao(first: DrawCommand, pairShader: RenderShaderProgram): boolean {
    if (this.host.errorCheckMode === "strict" || this.host.disposed || !this.host.lifecycle.frameActive
      || this.host.lifecycle.isDeviceLost() || !first.vertexFormat || !first.shader
      || (first.instanceCount ?? 1) !== 1 || first.instanceAttributes?.length || first.nativeStorageBindings?.length
      || first.vertexFormat.streams.some((stream) => stream.stepMode !== "vertex")) return false;
    let pair: WebGL2ShaderProgram;
    let vertex: WebGL2Buffer;
    let command: DrawCommand;
    try {
      pair = this.requireShader(pairShader);
      this.requireShader(first.shader);
      vertex = this.requireBuffer(first.vertexBuffer);
      if (pair.label !== STATIC_BATCH_UNLIT_LABEL || pair.marker !== first.shader.marker
        || !inspectStaticBatchUnlitProgram(this.host.gl, pair.handle).compatible) return false;
      command = { ...first, shader: pair, instanceCount: 2 };
      this.validateDrawRanges(command);
      const index = command.indexBuffer ? this.requireBuffer(command.indexBuffer) : undefined;
      const streams = this.streamBuffers(command, vertex, pair);
      const key = this.vertexArrayCacheKey(command, pair, vertex, index, streams);
      if (this.vertexArrayCache.has(key)) return true;
    } catch {
      return false;
    }
    const gl = this.host.gl;
    let previousVao: WebGLVertexArrayObject | null;
    let previousArray: WebGLBuffer | null;
    let previousElement: WebGLBuffer | null;
    let previousColor: number[] | undefined;
    try {
      if (typeof gl.getParameter !== "function" || typeof gl.getVertexAttrib !== "function" || typeof gl.vertexAttrib4fv !== "function"
        || typeof gl.bindVertexArray !== "function" || typeof gl.bindBuffer !== "function") return false;
      previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
      previousArray = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
      previousElement = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
      previousColor = staticFiniteNumbers(gl.getVertexAttrib(4, gl.CURRENT_VERTEX_ATTRIB), 4, 4);
      const shadow = this.host.stateCache.snapshot();
      // A frame begins by invalidating the cache without unbinding the real
      // VAO. snapshot() represents that unknown shadow as null, so only a
      // known non-null VAO can establish a mismatch here.
      if (!previousColor || (shadow.vertexArray !== null && shadow.vertexArray !== previousVao)
        || (shadow.arrayBuffer !== null && shadow.arrayBuffer !== previousArray)
        || (shadow.elementArrayBuffer !== null && shadow.elementArrayBuffer !== previousElement)) return false;
    } catch {
      return false;
    }
    const frame = this.host.device.activeFrameToken;
    const generation = this.host.device.generation;
    if (!frame || this.host.lifecycle.isDeviceLost()) return false;
    try {
      this.bindVertexArrayForCommand(command, pair, vertex);
      this.host.stateCache.bindVertexArray(previousVao, () => gl.bindVertexArray(previousVao));
      this.host.stateCache.bindBuffer(gl.ARRAY_BUFFER, previousArray, () => gl.bindBuffer(gl.ARRAY_BUFFER, previousArray));
      this.host.stateCache.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElement, () => gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElement));
      gl.vertexAttrib4fv(4, previousColor);
      if (this.host.device.activeFrameToken !== frame || this.host.device.generation !== generation || this.host.lifecycle.isDeviceLost()) {
        throw new RenderDeviceError("Static batch VAO warmup lost its frame or context", "STATIC_BATCH_INVALIDATED");
      }
      return true;
    } catch (error) {
      // A failed GL call may have changed state even when it threw. Restore
      // best-effort, forget all shadows, and never silently fall back.
      try {
        gl.bindVertexArray(previousVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, previousArray);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElement);
        gl.vertexAttrib4fv(4, previousColor);
      } finally {
        this.host.stateCache.invalidate();
      }
      throw error;
    }
  }

  /** Prewarm the generated pair VAO while retaining the current native bindings. */
  prewarmGeneratedStaticUnlitPairVao(first: DrawCommand, pairShader: RenderShaderProgram): boolean {
    if (this.host.errorCheckMode === "strict" || this.host.disposed || !this.host.lifecycle.frameActive
      || this.host.lifecycle.isDeviceLost() || !first.vertexFormat || !first.shader
      || (first.instanceCount ?? 1) !== 1 || first.instanceAttributes?.length || first.nativeStorageBindings?.length
      || first.vertexFormat.streams.some((stream) => stream.stepMode !== "vertex")) return false;
    let pair: WebGL2ShaderProgram;
    let vertex: WebGL2Buffer;
    let command: DrawCommand;
    try {
      pair = this.requireShader(pairShader);
      const ordinary = this.requireShader(first.shader);
      vertex = this.requireBuffer(first.vertexBuffer);
      if (pair.label !== STATIC_GENERATED_UNLIT_PAIR_LABEL || pair.marker !== ordinary.marker
        || !inspectStaticGeneratedUnlitPairProgram(this.host.gl, ordinary.handle, pair.handle).compatible) return false;
      command = { ...first, shader: pair, instanceCount: 2 };
      this.validateDrawRanges(command);
      const index = command.indexBuffer ? this.requireBuffer(command.indexBuffer) : undefined;
      const streams = this.streamBuffers(command, vertex, pair);
      const key = this.vertexArrayCacheKey(command, pair, vertex, index, streams);
      if (this.vertexArrayCache.has(key)) return true;
    } catch {
      return false;
    }
    const gl = this.host.gl;
    let previousVao: WebGLVertexArrayObject | null;
    let previousArray: WebGLBuffer | null;
    let previousElement: WebGLBuffer | null;
    let previousColor: number[] | undefined;
    try {
      if (typeof gl.getParameter !== "function" || typeof gl.getVertexAttrib !== "function" || typeof gl.vertexAttrib4fv !== "function"
        || typeof gl.bindVertexArray !== "function" || typeof gl.bindBuffer !== "function") return false;
      previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
      previousArray = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
      previousElement = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
      previousColor = staticFiniteNumbers(gl.getVertexAttrib(4, gl.CURRENT_VERTEX_ATTRIB), 4, 4);
      const shadow = this.host.stateCache.snapshot();
      if (!previousColor || (shadow.vertexArray !== null && shadow.vertexArray !== previousVao)
        || (shadow.arrayBuffer !== null && shadow.arrayBuffer !== previousArray)
        || (shadow.elementArrayBuffer !== null && shadow.elementArrayBuffer !== previousElement)) return false;
    } catch {
      return false;
    }
    const frame = this.host.device.activeFrameToken;
    const generation = this.host.device.generation;
    if (!frame || this.host.lifecycle.isDeviceLost()) return false;
    try {
      this.bindVertexArrayForCommand(command, pair, vertex);
      this.host.stateCache.bindVertexArray(previousVao, () => gl.bindVertexArray(previousVao));
      this.host.stateCache.bindBuffer(gl.ARRAY_BUFFER, previousArray, () => gl.bindBuffer(gl.ARRAY_BUFFER, previousArray));
      this.host.stateCache.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElement, () => gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElement));
      gl.vertexAttrib4fv(4, previousColor);
      if (this.host.device.activeFrameToken !== frame || this.host.device.generation !== generation || this.host.lifecycle.isDeviceLost()) {
        throw new RenderDeviceError("Generated static batch VAO warmup lost its frame or context", "STATIC_BATCH_INVALIDATED");
      }
      return true;
    } catch (error) {
      try {
        gl.bindVertexArray(previousVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, previousArray);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElement);
        gl.vertexAttrib4fv(4, previousColor);
      } finally {
        this.host.stateCache.invalidate();
      }
      throw error;
    }
  }

  /**
   * Submit one already-authorized pair. False means a read-only preflight
   * declined it. Once preparation changes GL state, any exception propagates
   * and must not be converted to an ordinary fallback by the caller.
   */
  tryDrawStaticUnlitPair(first: DrawCommand, second: DrawCommand, pairShader: RenderShaderProgram,
    expected: StaticUnlitPairUniformPlan, submission: WebGLBatchSubmissionState, onSubmitted: () => void): boolean {
    if (this.host.errorCheckMode === "strict" || !this.staticUnlitCommandsMatch(first, second)) return false;
    let pair: WebGL2ShaderProgram;
    let ordinary: WebGL2ShaderProgram;
    let command: DrawCommand;
    let originalVao: WebGL2VertexArrayCacheEntry;
    let batchVao: WebGL2VertexArrayCacheEntry;
    let originalIndex: WebGL2Buffer | undefined;
    try {
      pair = this.requireShader(pairShader);
      ordinary = this.requireShader(first.shader!);
      const vertex = this.requireBuffer(first.vertexBuffer);
      if (pair.label !== STATIC_BATCH_UNLIT_LABEL || pair.marker !== ordinary.marker
        || !inspectStaticBatchUnlitProgram(this.host.gl, pair.handle).compatible
        || ordinary.reflection.attributes.get("a_position") !== 0 || ordinary.reflection.attributes.get("a_color") !== 4) return false;
      this.validateDrawRanges(first);
      this.validateDrawRanges(second);
      command = { ...first, shader: pair, instanceCount: 2 };
      this.validateDrawRanges(command);
      const index = first.indexBuffer ? this.requireBuffer(first.indexBuffer) : undefined;
      originalIndex = index;
      if (this.vertexFormatIds.get(first.vertexFormat!) === undefined) return false;
      const originalKey = this.vertexArrayCacheKey(first, ordinary, vertex, index, this.streamBuffers(first, vertex, ordinary));
      const pairKey = this.vertexArrayCacheKey(command, pair, vertex, index, this.streamBuffers(command, vertex, pair));
      const entry = this.vertexArrayCache.get(originalKey);
      const batchEntry = this.vertexArrayCache.get(pairKey);
      if (!entry || !batchEntry) return false;
      originalVao = entry;
      batchVao = batchEntry;
    } catch {
      return false;
    }
    let restoreKnownElement: WebGLBuffer | undefined;
    try {
      const gl = this.host.gl;
      const shadow = this.host.stateCache.snapshot();
      const nativeProgram = gl.getParameter(gl.CURRENT_PROGRAM);
      const nativeVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      if (((shadow.program === ordinary.handle || shadow.program === pair.handle) && nativeProgram !== shadow.program)
        || ((shadow.vertexArray === originalVao.handle || shadow.vertexArray === batchVao.handle) && nativeVao !== shadow.vertexArray)) return false;
      if (shadow.vertexArray === batchVao.handle && originalIndex
        && gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) !== originalIndex.handle) return false;
      if (shadow.vertexArray === originalVao.handle) {
        const nativeElement = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        if (originalIndex && nativeElement !== originalIndex.handle) return false;
        if (shadow.elementArrayBuffer !== null) {
          if (shadow.elementArrayBuffer !== nativeElement) return false;
          restoreKnownElement = shadow.elementArrayBuffer as WebGLBuffer;
        }
      }
    } catch {
      return false;
    }
    const actual = this.inspectStaticUnlitPair(first, second);
    const expectedMvp = staticFiniteNumbers(expected.effectiveMvpPair, 32, 32);
    const expectedColor = staticFiniteNumbers(expected.baseColor, 4, 4);
    if (!actual || !expectedMvp || !expectedColor || !staticEqualNumbers(actual.effectiveMvpPair, expectedMvp)
      || !staticEqualNumbers(actual.baseColor, expectedColor) || !Object.is(actual.pointSize, expected.pointSize)
      || !Object.is(actual.alphaCutoff, expected.alphaCutoff) || !Object.is(actual.roundPoints, expected.roundPoints)) return false;
    const uniforms = new Map<string, UniformValue>([
      ["u_batchMVP", actual.effectiveMvpPair], ["u_pointSize", actual.pointSize], ["u_baseColor", actual.baseColor],
      ["u_alphaCutoff", actual.alphaCutoff], ["u_roundPoints", actual.roundPoints]
    ]);
    command = { ...command, uniforms };
    try {
      this.prepareDraw(command);
      if (!submission.beginAttempt(this.host.device.activeFrameToken, this.host.device.generation)) {
        throw new RenderDeviceError("Static batch frame or context changed before submission", "STATIC_BATCH_INVALIDATED");
      }
      this.issueDraw(command);
      submission.markSubmitted();
      onSubmitted();
      // This executes the ordinary binder's two state/uniform transitions,
      // without issuing either original draw, including its last-value cache.
      this.prepareDraw(first);
      this.prepareDraw(second);
      if (restoreKnownElement) {
        const gl = this.host.gl;
        this.host.stateCache.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreKnownElement, () => gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreKnownElement!));
      }
      submission.markRestored();
      return true;
    } catch (error) {
      submission.invalidate();
      throw error;
    }
  }

  /**
   * Submit one authenticated generated-unlit pair. False is returned only
   * before changing state. The device must revalidate the AuraFrame buffer
   * immediately before native entry; this binder never changes that binding.
   */
  tryDrawGeneratedStaticUnlitPair(first: DrawCommand, second: DrawCommand, pairShader: RenderShaderProgram,
    expected: GeneratedStaticUnlitPairUniformPlan, submission: WebGLBatchSubmissionState,
    onAttempt: () => void, onSubmitted: () => void): boolean {
    if (this.host.errorCheckMode === "strict" || !this.staticUnlitCommandsMatch(first, second)) return false;
    let pair: WebGL2ShaderProgram;
    let ordinary: WebGL2ShaderProgram;
    let command: DrawCommand;
    let originalVao: WebGL2VertexArrayCacheEntry;
    let batchVao: WebGL2VertexArrayCacheEntry;
    let originalIndex: WebGL2Buffer | undefined;
    try {
      pair = this.requireShader(pairShader);
      ordinary = this.requireShader(first.shader!);
      const vertex = this.requireBuffer(first.vertexBuffer);
      if (pair.label !== STATIC_GENERATED_UNLIT_PAIR_LABEL || pair.marker !== ordinary.marker
        || !inspectStaticGeneratedUnlitPairProgram(this.host.gl, ordinary.handle, pair.handle).compatible
        || ordinary.reflection.attributes.size !== 1 || ordinary.reflection.attributes.get("a_position") !== 0) return false;
      this.validateDrawRanges(first);
      this.validateDrawRanges(second);
      command = { ...first, shader: pair, instanceCount: 2 };
      this.validateDrawRanges(command);
      const index = first.indexBuffer ? this.requireBuffer(first.indexBuffer) : undefined;
      originalIndex = index;
      if (this.vertexFormatIds.get(first.vertexFormat!) === undefined) return false;
      const originalKey = this.vertexArrayCacheKey(first, ordinary, vertex, index, this.streamBuffers(first, vertex, ordinary));
      const pairKey = this.vertexArrayCacheKey(command, pair, vertex, index, this.streamBuffers(command, vertex, pair));
      const entry = this.vertexArrayCache.get(originalKey);
      const batchEntry = this.vertexArrayCache.get(pairKey);
      if (!entry || !batchEntry) return false;
      originalVao = entry;
      batchVao = batchEntry;
    } catch {
      return false;
    }
    let restoreKnownElement: WebGLBuffer | undefined;
    try {
      const gl = this.host.gl;
      const shadow = this.host.stateCache.snapshot();
      const nativeProgram = gl.getParameter(gl.CURRENT_PROGRAM);
      const nativeVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      if (((shadow.program === ordinary.handle || shadow.program === pair.handle) && nativeProgram !== shadow.program)
        || ((shadow.vertexArray === originalVao.handle || shadow.vertexArray === batchVao.handle) && nativeVao !== shadow.vertexArray)) return false;
      if (shadow.vertexArray === batchVao.handle && originalIndex
        && gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) !== originalIndex.handle) return false;
      if (shadow.vertexArray === originalVao.handle) {
        const nativeElement = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        if (originalIndex && nativeElement !== originalIndex.handle) return false;
        if (shadow.elementArrayBuffer !== null) {
          if (shadow.elementArrayBuffer !== nativeElement) return false;
          restoreKnownElement = shadow.elementArrayBuffer as WebGLBuffer;
        }
      }
    } catch {
      return false;
    }
    const actual = this.inspectGeneratedStaticUnlitPair(first, second, expected.frameViewProjection);
    const models = staticFiniteNumbers(expected.effectiveModelPair, 32, 32);
    const geometry = staticFiniteNumbers(expected.effectiveGeometryMatrix, 16, 16);
    const frame = staticFiniteNumbers(expected.frameViewProjection, 16, 16);
    if (!actual || !models || !geometry || !frame || !(expected.commonUniforms instanceof Map)
      || Object.getPrototypeOf(expected.commonUniforms) !== Map.prototype || Reflect.ownKeys(expected.commonUniforms).length !== 0
      || expected.commonUniforms.size !== actual.commonUniforms.size
      || !staticEqualNumbers(actual.effectiveModelPair, models) || !staticEqualNumbers(actual.effectiveGeometryMatrix, geometry)
      || !staticEqualNumbers(actual.frameViewProjection, frame)) return false;
    for (const [name, value] of actual.commonUniforms) {
      if (!expected.commonUniforms.has(name)) return false;
      const other = expected.commonUniforms.get(name);
      if (typeof value === "number") {
        if (typeof other !== "number" || !Object.is(value, other)) return false;
      } else {
        const values = staticFiniteNumbers(other, value.length, value.length);
        if (!values || !staticEqualNumbers(value, values)) return false;
      }
    }
    const uniforms = new Map<string, UniformValue>(actual.commonUniforms);
    uniforms.set(STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM, actual.effectiveModelPair);
    uniforms.set("u_geometryMatrix", actual.effectiveGeometryMatrix);
    command = { ...command, uniforms };
    try {
      this.prepareDraw(command);
      if (!submission.beginAttempt(this.host.device.activeFrameToken, this.host.device.generation)) {
        throw new RenderDeviceError("Generated static batch frame or context changed before submission", "STATIC_BATCH_INVALIDATED");
      }
      onAttempt();
      this.issueDraw(command);
      submission.markSubmitted();
      onSubmitted();
      // Reproduce both ordinary uniform/cache transitions and leave the
      // ordinary program and VAO selected, without replaying either draw.
      this.prepareDraw(first);
      this.prepareDraw(second);
      if (restoreKnownElement) {
        const gl = this.host.gl;
        this.host.stateCache.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreKnownElement, () => gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreKnownElement!));
      }
      submission.markRestored();
      return true;
    } catch (error) {
      submission.invalidate();
      // A failed native bind or uniform upload can leave either shadow ahead
      // of the actual GL state. The next ordinary draw must bind values again.
      this.uniformValueCache = new WeakMap();
      try { this.host.stateCache.invalidate(); } catch { /* Preserve the original failure. */ }
      throw error;
    }
  }

  /** State, program, uniforms and vertex input for `command` (everything before the GL draw call). */
  private prepareDraw(command: DrawCommand): void {
    this.host.lifecycle.assertFrame();
    this.validateDrawRanges(command);
    const vertexBuffer = this.requireBuffer(command.vertexBuffer);
    this.applyRenderState(command.renderState);
    let shader: WebGL2ShaderProgram | undefined;
    if (command.shader) {
      const activeShader = this.requireShader(command.shader);
      shader = activeShader;
      this.host.stateCache.useProgram(activeShader.handle, () => this.host.gl.useProgram(activeShader.handle));
      if (command.uniforms) {
        this.uploadUniforms(activeShader, command.uniforms);
        if (this.host.errorCheckMode === "strict") {
          const uniformError = this.host.lifecycle.readError();
          if (uniformError) {
            throw new RenderDeviceError(`WebGL2 uniform upload failed for draw ${command.label ?? "unnamed"}: ${uniformError}`, "WEBGL_DRAW_FAILED", {
              label: command.label,
              stage: "uniforms",
              error: uniformError
            });
          }
        }
      }
    }

    if (shader && command.vertexFormat) {
      this.bindVertexArrayForCommand(command, shader, vertexBuffer);
      if (this.host.errorCheckMode === "strict") {
        const vertexFormatError = this.host.lifecycle.readError();
        if (vertexFormatError) {
          throw new RenderDeviceError(`WebGL2 vertex format binding failed for draw ${command.label ?? "unnamed"}: ${vertexFormatError}`, "WEBGL_DRAW_FAILED", {
            label: command.label,
            stage: "vertex-format",
            error: vertexFormatError
          });
        }
      }
    } else {
      this.bindNoVertexArray();
      this.host.stateCache.bindBuffer(this.host.gl.ARRAY_BUFFER, vertexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ARRAY_BUFFER, vertexBuffer.handle));
    }
    if (command.indexBuffer && (!shader || !command.vertexFormat)) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      this.host.stateCache.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
    }
  }

  private validateDrawRanges(command: DrawCommand): void {
    const instances = command.instanceCount ?? 1;
    const firstVertex = command.firstVertex ?? 0;
    const maxGLsizei = 0x7fffffff;
    if (!Number.isSafeInteger(command.vertexCount) || command.vertexCount <= 0 || command.vertexCount > maxGLsizei || !Number.isSafeInteger(firstVertex) || firstVertex < 0 || firstVertex > maxGLsizei || !Number.isSafeInteger(instances) || instances <= 0 || instances > maxGLsizei) {
      throw new RenderDeviceError("Vertex and instance counts must be positive integers and firstVertex non-negative", "INVALID_DRAW_COMMAND", { vertexCount: command.vertexCount, firstVertex, instanceCount: instances });
    }
    if (!["triangles", "lines", "points"].includes(command.topology)) throw new RenderDeviceError("Unsupported draw topology", "INVALID_DRAW_COMMAND", { topology: command.topology });
    if (command.indexType !== undefined && command.indexType !== "uint16" && command.indexType !== "uint32") throw new RenderDeviceError("Unsupported index type", "INVALID_DRAW_COMMAND", { indexType: command.indexType });
    if (command.indexBuffer) {
      const index = this.requireBuffer(command.indexBuffer);
      const count = command.indexCount;
      const first = command.firstIndex ?? 0;
      if (!Number.isSafeInteger(count) || count === undefined || count <= 0 || count > maxGLsizei || !Number.isSafeInteger(first) || first < 0 || first > maxGLsizei) throw new RenderDeviceError("Indexed draw requires a positive count and non-negative first index", "INVALID_DRAW_COMMAND", { indexCount: count, firstIndex: first });
      const requiredBytes = (first + count) * (command.indexType === "uint32" ? 4 : 2);
      if (!Number.isSafeInteger(requiredBytes) || requiredBytes > index.byteLength) throw new RenderDeviceError("Index buffer is too short for the draw", "INVALID_DRAW_COMMAND", { requiredBytes, byteLength: index.byteLength });
    }
  }

  /** The GL draw call for a prepared `command`, plus counters and strict error check. */
  private issueDraw(command: DrawCommand): void {
    if (command.indexBuffer) {
      const type = command.indexType === "uint32" ? this.host.gl.UNSIGNED_INT : this.host.gl.UNSIGNED_SHORT;
      const indexByteSize = command.indexType === "uint32" ? 4 : 2;
      const indexOffset = (command.firstIndex ?? 0) * indexByteSize;
      if ((command.instanceCount ?? 1) > 1) {
        this.host.gl.drawElementsInstanced(this.primitive(command.topology), command.indexCount ?? 0, type, indexOffset, command.instanceCount ?? 1);
        this.host.counters.nativeInstancedSubmissions += 1;
      } else {
        this.host.gl.drawElements(this.primitive(command.topology), command.indexCount ?? 0, type, indexOffset);
      }
    } else {
      if ((command.instanceCount ?? 1) > 1) {
        this.host.gl.drawArraysInstanced(this.primitive(command.topology), command.firstVertex ?? 0, command.vertexCount, command.instanceCount ?? 1);
        this.host.counters.nativeInstancedSubmissions += 1;
      } else {
        this.host.gl.drawArrays(this.primitive(command.topology), command.firstVertex ?? 0, command.vertexCount);
      }
    }
    this.host.counters.drawCalls += 1;
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
    if (this.host.errorCheckMode === "strict") {
      const drawError = this.host.lifecycle.readError();
      if (drawError) {
        throw new RenderDeviceError(`WebGL2 draw failed for ${command.label ?? "unnamed"}: ${drawError}`, "WEBGL_DRAW_FAILED", {
          label: command.label,
          stage: "draw",
          error: drawError
        });
      }
    }
  }

  uploadUniforms(shader: WebGL2ShaderProgram, uniforms: ReadonlyMap<string, unknown>): void {
    let textureUnit = 0;
    let valueCache = this.uniformValueCache.get(shader);
    if (!valueCache) {
      valueCache = new Map();
      this.uniformValueCache.set(shader, valueCache);
    }
    for (const [name, value] of uniforms) {
      if (!shader.reflection.uniforms.has(name)) {
        continue;
      }
      const location = this.getUniformLocation(shader, name);
      if (location === null) {
        // The name is declared in source (reflection) but the linked program
        // has no location for it — the driver optimised it out as inactive.
        // A location-less uniform has no storage, so binding is a no-op; treat
        // the reflected name as inactive rather than throwing (06-PARITY).
        this.host.counters.inactiveUniformBindCount += 1;
        continue;
      }
      if (isTextureBinding(value)) {
        textureUnit += 1;
        // #1142: no last-value skip for textures. The unit index is positional
        // (order of this material's texture uniforms), and other draws and
        // passes rebind units in between, so "same texture as the last upload
        // for this uniform" does not mean the unit still holds it: a skipped
        // upload samples whatever the unit holds now. Samplers.bindTextureForUnit
        // already dedups redundant binds per unit; uniform1i is cheap.
        // lane 06 Q-01-3: pass the declared uniform type so sampler2DArray
        // uniforms bind TEXTURE_2D_ARRAY units even when texture.dimension is absent.
        this.host.samplers.uploadTextureUniform(location, value, textureUnit - 1, shader.reflection.uniformDetails.get(name)?.type);
      } else if (typeof value === "number") {
        if (valueCache.get(name) === value) continue;
        const kind = integerUniformKind(shader.reflection.uniformDetails.get(name)?.type);
        if (kind === "uint") this.host.gl.uniform1ui(location, value);
        else if (kind === "int") this.host.gl.uniform1i(location, value);
        else this.host.gl.uniform1f(location, value);
        valueCache.set(name, value);
      } else if ((Array.isArray(value) || ArrayBuffer.isView(value))
        && integerArraySetter(shader.reflection.uniformDetails.get(name)?.type) !== undefined) {
        // Integer/bool scalars, vectors and their arrays (including flattened
        // portable data leaves) use the integer setters with exact values.
        const setter = integerArraySetter(shader.reflection.uniformDetails.get(name)?.type)!;
        const unsigned = setter.endsWith("ui");
        const source = value as ArrayLike<number>;
        const length = source.length;
        if (length === 0 || length % INTEGER_SETTER_COMPONENTS[setter] !== 0) {
          throw new RenderDeviceError("Unsupported uniform array length", "UNSUPPORTED_UNIFORM", { name, length });
        }
        const data = unsigned ? Uint32Array.from(source) : Int32Array.from(source);
        const last = valueCache.get(name);
        if ((unsigned ? last instanceof Uint32Array : last instanceof Int32Array) && (last as Int32Array | Uint32Array).length === length
          && (data as Int32Array | Uint32Array).every((entry, index) => (last as Int32Array | Uint32Array)[index] === entry)) continue;
        valueCache.set(name, data);
        const gl = this.host.gl;
        switch (setter) {
          case "1i": gl.uniform1iv(location, data as Int32Array); break;
          case "2i": gl.uniform2iv(location, data as Int32Array); break;
          case "3i": gl.uniform3iv(location, data as Int32Array); break;
          case "4i": gl.uniform4iv(location, data as Int32Array); break;
          case "1ui": gl.uniform1uiv(location, data as Uint32Array); break;
          case "2ui": gl.uniform2uiv(location, data as Uint32Array); break;
          case "3ui": gl.uniform3uiv(location, data as Uint32Array); break;
          case "4ui": gl.uniform4uiv(location, data as Uint32Array); break;
        }
      } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const length = (value as ArrayLike<number>).length;
        const floatData = value as Float32List;
        // Last-value check against a retained snapshot: element-wise equal →
        // the previous upload still holds (skip the GL call).
        const lastArray = valueCache.get(name) as Float32Array | undefined;
        if (lastArray !== undefined && lastArray.length === length) {
          let same = true;
          for (let i = 0; i < length; i += 1) {
            if (lastArray[i] !== floatData[i]) {
              same = false;
              break;
            }
          }
          if (same) continue;
          for (let i = 0; i < length; i += 1) lastArray[i] = floatData[i];
        } else {
          valueCache.set(name, Float32Array.from(floatData as ArrayLike<number>));
        }
        // GU47 phase 2: dispatch on the declared type first. The length
        // heuristic alone cannot tell vec4[4] (16 floats) from mat4, and it
        // rejects short arrays such as vec4[2] (8) or vec3[4] (12).
        const declared = floatUniformSetter(shader.reflection.uniformDetails.get(name)?.type);
        if (declared !== undefined && length > 0 && length % FLOAT_SETTER_COMPONENTS[declared] === 0) {
          const gl = this.host.gl;
          if (declared === "mat4") gl.uniformMatrix4fv(location, false, floatData);
          else if (declared === "mat3") gl.uniformMatrix3fv(location, false, floatData);
          else if (declared === "mat2") gl.uniformMatrix2fv(location, false, floatData);
          else if (declared === "mat2x3") gl.uniformMatrix2x3fv(location, false, floatData);
          else if (declared === "mat2x4") gl.uniformMatrix2x4fv(location, false, floatData);
          else if (declared === "mat3x2") gl.uniformMatrix3x2fv(location, false, floatData);
          else if (declared === "mat3x4") gl.uniformMatrix3x4fv(location, false, floatData);
          else if (declared === "mat4x2") gl.uniformMatrix4x2fv(location, false, floatData);
          else if (declared === "mat4x3") gl.uniformMatrix4x3fv(location, false, floatData);
          else if (declared === "4f") gl.uniform4fv(location, floatData);
          else if (declared === "3f") gl.uniform3fv(location, floatData);
          else if (declared === "2f") gl.uniform2fv(location, floatData);
          else gl.uniform1fv(location, floatData);
        } else if (length === 16 || (length > 16 && length % 16 === 0 && /(?:Matrix|Matrices)$/.test(name))) {
          this.host.gl.uniformMatrix4fv(location, false, floatData);
        } else if (length > 16 && length % 4 === 0) {
          this.host.gl.uniform4fv(location, floatData);
        } else if (length === 4) {
          this.host.gl.uniform4fv(location, floatData);
        } else if (length === 3) {
          this.host.gl.uniform3fv(location, floatData);
        } else if (length === 2) {
          this.host.gl.uniform2fv(location, floatData);
        } else {
          throw new RenderDeviceError("Unsupported uniform array length", "UNSUPPORTED_UNIFORM", { name, length });
        }
      } else {
        throw new RenderDeviceError("Unsupported uniform value", "UNSUPPORTED_UNIFORM", { name, valueType: typeof value });
      }
      if (this.host.errorCheckMode === "strict") {
        const uniformError = this.host.lifecycle.readError();
        if (uniformError) {
          throw new RenderDeviceError(`WebGL2 uniform upload failed for ${name}: ${uniformError}`, "WEBGL_DRAW_FAILED", {
            name,
            stage: "uniform",
            error: uniformError
          });
        }
      }
    }
  }

  getUniformLocation(shader: WebGL2ShaderProgram, name: string): WebGLUniformLocation | null {
    let cache = this.uniformLocationCache.get(shader);
    if (!cache) {
      cache = new Map();
      this.uniformLocationCache.set(shader, cache);
    }
    if (!cache.has(name)) {
      this.host.counters.uniformLocationLookupCount += 1;
      cache.set(name, this.host.gl.getUniformLocation(shader.handle, name) ?? this.host.gl.getUniformLocation(shader.handle, `${name}[0]`));
    }
    return cache.get(name) ?? null;
  }

  /** Bind an interleaved format, selecting the named buffer for each stream. */
  bindVertexFormat(shader: RenderShaderProgram, format: VertexFormat, buffers?: ReadonlyMap<number, WebGL2Buffer>): Set<number> {
    const boundLocations = new Set<number>();
    for (const attribute of format.attributes) {
      const location = this.resolveAttributeLocation(shader, attribute);
      if (location < 0) {
        continue;
      }
      if (location >= this.host.maxVertexAttributes || boundLocations.has(location)) {
        throw new RenderDeviceError("Vertex attributes have an invalid or duplicate shader location", "UNSUPPORTED_VERTEX_ATTRIBUTE", { attribute: attribute.shaderName, location });
      }
      const stream = format.streams.find((candidate) => candidate.slot === attribute.bufferSlot)!;
      if (stream.stride > 255) throw new RenderDeviceError("WebGL2 vertex stream stride exceeds 255 bytes", "UNSUPPORTED_VERTEX_ATTRIBUTE", { slot: stream.slot, stride: stream.stride });
      const buffer = buffers?.get(stream.slot);
      if (buffers && !buffer) throw new RenderDeviceError("Vertex stream has no bound buffer", "INVALID_DRAW_COMMAND", { slot: stream.slot });
      if (buffer) this.host.stateCache.bindBuffer(this.host.gl.ARRAY_BUFFER, buffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ARRAY_BUFFER, buffer.handle));
      else if (stream.slot !== 0) throw new RenderDeviceError("Vertex stream has no bound buffer", "INVALID_DRAW_COMMAND", { slot: stream.slot });
      boundLocations.add(location);
      this.host.gl.enableVertexAttribArray(location);
      this.host.gl.vertexAttribDivisor(location, stream.divisor);
      const type = this.vertexAttributeType(attribute.type);
      if (attribute.integer) {
        this.host.gl.vertexAttribIPointer(location, attribute.components, type, stream.stride, attribute.offset);
      } else {
        this.host.gl.vertexAttribPointer(location, attribute.components, type, attribute.normalized, stream.stride, attribute.offset);
      }
    }
    return boundLocations;
  }

  private vertexAttributeType(type: VertexAttributeType): GLenum {
    switch (type) {
      case "float32": return this.host.gl.FLOAT;
      case "int8": return this.host.gl.BYTE;
      case "uint8": return this.host.gl.UNSIGNED_BYTE;
      case "int16": return this.host.gl.SHORT;
      case "uint16": return this.host.gl.UNSIGNED_SHORT;
      case "int32": return this.host.gl.INT;
      case "uint32": return this.host.gl.UNSIGNED_INT;
    }
  }

  private streamBuffers(command: DrawCommand, vertexBuffer: WebGL2Buffer, shader: RenderShaderProgram): Map<number, WebGL2Buffer> {
    // Slot 0 remains compatible with existing DrawCommands; additional slots
    // use the optional shared DrawCommand.vertexBuffers contract.
    const supplied = command.vertexBuffers;
    const result = new Map<number, WebGL2Buffer>();
    for (const stream of command.vertexFormat!.streams) {
      const raw = supplied?.[stream.slot] ?? (stream.slot === 0 ? vertexBuffer : undefined);
      if (!raw) throw new RenderDeviceError("Vertex stream has no bound buffer", "INVALID_DRAW_COMMAND", { slot: stream.slot });
      const buffer = this.requireBuffer(raw);
      // The last record need not include trailing stride padding. Indexed
      // vertex access still depends on index contents and is checked by GL.
      const active = command.vertexFormat!.attributes.filter((attribute) => attribute.bufferSlot === stream.slot && this.resolveAttributeLocation(shader, attribute) >= 0);
      if (active.length === 0) {
        result.set(stream.slot, buffer);
        continue;
      }
      const recordBytes = Math.max(...active.map((attribute) => attribute.offset + attribute.byteLength));
      const instances = command.instanceCount ?? 1;
      const firstVertex = command.firstVertex ?? 0;
      if (!Number.isSafeInteger(instances) || instances <= 0 || !Number.isSafeInteger(firstVertex) || firstVertex < 0 || !Number.isSafeInteger(command.vertexCount) || command.vertexCount <= 0) {
        throw new RenderDeviceError("Vertex and instance counts must be positive integers and firstVertex non-negative", "INVALID_DRAW_COMMAND", { vertexCount: command.vertexCount, firstVertex, instanceCount: instances });
      }
      const lastRecord = stream.stepMode === "instance"
        ? Math.floor((instances - 1) / stream.divisor)
        : command.indexBuffer ? 0 : firstVertex + command.vertexCount - 1;
      const requiredBytes = lastRecord * stream.stride + recordBytes;
      if (!Number.isSafeInteger(requiredBytes) || buffer.byteLength < requiredBytes) throw new RenderDeviceError("Vertex stream buffer is too short for the draw", "INVALID_DRAW_COMMAND", { slot: stream.slot, requiredBytes, byteLength: buffer.byteLength });
      result.set(stream.slot, buffer);
    }
    return result;
  }

  bindVertexArrayForCommand(command: DrawCommand, shader: WebGL2ShaderProgram, vertexBuffer: WebGL2Buffer): WebGL2VertexArrayCacheEntry {
    const indexBuffer = command.indexBuffer ? this.requireBuffer(command.indexBuffer) : undefined;
    const buffers = this.streamBuffers(command, vertexBuffer, shader);
    // VAOs can be reused with a larger instance count, so validate the current
    // draw against each legacy instance buffer even when the VAO is cached.
    const instanceBufferIds = (command.instanceAttributes ?? []).map((attribute) => {
      const buffer = this.requireBuffer(attribute.buffer);
      const location = shader.reflection.attributes.get(attribute.shaderName);
      if (location !== undefined && location >= 0) this.validateInstanceAttribute(attribute, buffer, command.instanceCount ?? 1);
      return buffer.id;
    });
    const key = this.vertexArrayCacheKey(command, shader, vertexBuffer, indexBuffer, buffers);
    const cached = this.vertexArrayCache.get(key);
    if (cached) {
      this.host.stateCache.bindVertexArray(cached.handle, () => this.host.gl.bindVertexArray(cached.handle));
      // Generic attribute constants are context state, not part of a VAO.
      this.applyDefaultAttributes(shader, cached.boundLocations);
      return cached;
    }

    const handle = this.host.gl.createVertexArray();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL vertex array", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.counters.vertexArrayCreateCount += 1;
    this.host.stateCache.bindVertexArray(handle, () => this.host.gl.bindVertexArray(handle));
    let boundLocations: Set<number>;
    try {
      boundLocations = this.bindVertexFormat(shader, command.vertexFormat!, buffers);
      if (command.instanceAttributes && command.instanceAttributes.length > 0) {
        this.bindInstanceAttributes(shader, command.instanceAttributes, boundLocations, command.instanceCount ?? 1);
      }
      if (indexBuffer) {
        this.host.stateCache.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
      }
      this.disableUnboundVertexAttributes(boundLocations);
      this.applyDefaultAttributes(shader, boundLocations);
    } catch (error) {
      this.bindNoVertexArray();
      this.host.gl.deleteVertexArray(handle);
      throw error;
    }
    const bufferIds: number[] = [];
    for (const bufferId of [...Array.from(buffers.values(), (buffer) => buffer.id), indexBuffer?.id, ...instanceBufferIds]) {
      if (bufferId !== undefined && !bufferIds.includes(bufferId)) bufferIds.push(bufferId);
    }
    const entry: WebGL2VertexArrayCacheEntry = { key, handle, boundLocations, bufferIds };
    this.vertexArrayCache.set(key, entry);
    for (const bufferId of bufferIds) {
      let keys = this.bufferVaoIndex.get(bufferId);
      if (!keys) {
        keys = new Set();
        this.bufferVaoIndex.set(bufferId, keys);
      }
      keys.add(key);
    }
    return entry;
  }

  /**
   * PRD-01 Phase 6 (CONTRACTS §6.1 declared leak fix): delete every cached VAO
   * that references `bufferId` — the key embeds vertex/index/instance buffer
   * ids, so the index is the authoritative reverse map. Called from
   * `WebGL2Buffer.dispose` before the GL buffer is deleted.
   */
  evictVertexArraysForBuffer(bufferId: number): number {
    const keys = this.bufferVaoIndex.get(bufferId);
    if (!keys) return 0;
    if (keys.size === 0) {
      this.bufferVaoIndex.delete(bufferId);
      return 0;
    }
    let evicted = 0;
    for (const key of keys) {
      const entry = this.vertexArrayCache.get(key);
      if (!entry) continue;
      if (this.retiringVertexArrays.has(key)) throw new Error("Vertex array disposal is in progress");
      this.retiringVertexArrays.add(key);
      try {
        if (entry.handle) this.host.gl.deleteVertexArray(entry.handle);
      } finally {
        this.retiringVertexArrays.delete(key);
      }
      // Keep the entry and both buffers' reverse links if native deletion
      // throws, so whichever owner retries can still retire this VAO.
      this.vertexArrayCache.delete(key);
      evicted += 1;
      // SI-6: unlink the key from the index sets of the buffers this VAO actually references, not from every set in the map.
      if (entry.bufferIds) {
        for (const otherId of entry.bufferIds) {
          if (otherId === bufferId) continue;
          const set = this.bufferVaoIndex.get(otherId);
          if (!set) continue;
          set.delete(key);
          if (set.size === 0) this.bufferVaoIndex.delete(otherId);
        }
      } else {
        for (const set of this.bufferVaoIndex.values()) set.delete(key);
      }
    }
    // The disposed buffer's own index entry goes too. Per-frame instance buffers (dense shadow casters create and dispose one per
    // node per cascade per frame) would otherwise leave one empty Set per frame in this map for the life of the page, and the scan
    // above would walk all of them on every dispose.
    this.bufferVaoIndex.delete(bufferId);
    return evicted;
  }

  bindNoVertexArray(): void {
    this.host.stateCache.bindVertexArray(null, () => this.host.gl.bindVertexArray(null));
  }

  vertexArrayCacheKey(command: DrawCommand, shader: WebGL2ShaderProgram, vertexBuffer: WebGL2Buffer, indexBuffer: WebGL2Buffer | undefined, streams = this.streamBuffers(command, vertexBuffer, shader)): string {
    const instanceKey = (command.instanceAttributes ?? []).map((attribute) => {
      const buffer = this.requireBuffer(attribute.buffer);
      return `${attribute.shaderName}:${buffer.id}:${attribute.components}:${attribute.offset}:${attribute.stride}:${attribute.normalized === true ? 1 : 0}:${attribute.divisor ?? 1}`;
    }).join(",");
    return [
      shader.id,
      Array.from(streams, ([slot, buffer]) => `${slot}:${buffer.id}`).join(","),
      this.vertexFormatId(command.vertexFormat!),
      indexBuffer?.id ?? 0,
      instanceKey
    ].join("|");
  }

  vertexFormatId(format: VertexFormat): number {
    const existing = this.vertexFormatIds.get(format);
    if (existing !== undefined) return existing;
    const next = this.nextVertexFormatId;
    this.nextVertexFormatId += 1;
    this.vertexFormatIds.set(format, next);
    return next;
  }

  bindInstanceAttributes(shader: RenderShaderProgram, attributes: readonly InstanceVertexAttribute[], boundLocations: Set<number>, instanceCount = 1): void {
    for (const attribute of attributes) {
      const location = shader.reflection.attributes.get(attribute.shaderName);
      if (location === undefined || location < 0) {
        continue;
      }
      if (location >= this.host.maxVertexAttributes || boundLocations.has(location)) {
        throw new RenderDeviceError("Instance attribute has an invalid or duplicate shader location", "UNSUPPORTED_VERTEX_ATTRIBUTE", { attribute: attribute.shaderName, location });
      }
      const buffer = this.requireBuffer(attribute.buffer);
      const divisor = this.validateInstanceAttribute(attribute, buffer, instanceCount);
      boundLocations.add(location);
      this.host.stateCache.bindBuffer(this.host.gl.ARRAY_BUFFER, buffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ARRAY_BUFFER, buffer.handle));
      this.host.gl.enableVertexAttribArray(location);
      this.host.gl.vertexAttribPointer(
        location,
        attribute.components,
        this.host.gl.FLOAT,
        attribute.normalized ?? false,
        attribute.stride,
        attribute.offset
      );
      this.host.gl.vertexAttribDivisor(location, divisor);
    }
  }

  private validateInstanceAttribute(attribute: InstanceVertexAttribute, buffer: WebGL2Buffer, instanceCount: number): number {
    if (![1, 2, 3, 4].includes(attribute.components)) {
      throw new RenderDeviceError("Instance vertex attribute components must be 1, 2, 3, or 4", "INVALID_DRAW_COMMAND", {
        attribute: attribute.shaderName,
        components: attribute.components
      });
    }
    if (!Number.isInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % 4 !== 0) {
      throw new RenderDeviceError("Instance vertex attribute offset must be non-negative and 4-byte aligned", "INVALID_DRAW_COMMAND", {
        attribute: attribute.shaderName,
        offset: attribute.offset
      });
    }
    if (!Number.isInteger(attribute.stride) || attribute.stride <= 0 || attribute.stride % 4 !== 0) {
      throw new RenderDeviceError("Instance vertex attribute stride must be positive and 4-byte aligned", "INVALID_DRAW_COMMAND", {
        attribute: attribute.shaderName,
        stride: attribute.stride
      });
    }
    if (attribute.stride > 255) throw new RenderDeviceError("WebGL2 vertex stream stride exceeds 255 bytes", "UNSUPPORTED_VERTEX_ATTRIBUTE", { attribute: attribute.shaderName, stride: attribute.stride });
    if (attribute.offset + attribute.components * 4 > attribute.stride) {
      throw new RenderDeviceError("Instance vertex attribute range must fit inside its stride", "INVALID_DRAW_COMMAND", {
        attribute: attribute.shaderName,
        offset: attribute.offset,
        components: attribute.components,
        stride: attribute.stride
      });
    }
    const divisor = attribute.divisor ?? 1;
    if (!Number.isSafeInteger(divisor) || divisor < 1) throw new RenderDeviceError("Instance attribute divisor must be a positive integer", "INVALID_DRAW_COMMAND", { attribute: attribute.shaderName, divisor });
    if (!Number.isSafeInteger(instanceCount) || instanceCount < 1) throw new RenderDeviceError("Instance count must be a positive integer", "INVALID_DRAW_COMMAND", { instanceCount });
    const requiredBytes = Math.floor((instanceCount - 1) / divisor) * attribute.stride + attribute.offset + attribute.components * 4;
    if (!Number.isSafeInteger(requiredBytes) || requiredBytes > buffer.byteLength) throw new RenderDeviceError("Instance attribute buffer is too short for the draw", "INVALID_DRAW_COMMAND", { attribute: attribute.shaderName, requiredBytes, byteLength: buffer.byteLength });
    return divisor;
  }

  resolveAttributeLocation(shader: RenderShaderProgram, attribute: VertexAttribute): number {
    const reflected = shader.reflection.attributes.get(attribute.shaderName);
    if (reflected !== undefined) {
      return reflected;
    }
    return shader.reflection.attributes.get(attribute.semantic) ?? -1;
  }

  applyDefaultAttributes(shader: RenderShaderProgram, boundLocations: ReadonlySet<number>): void {
    const colorLocation = shader.reflection.attributes.get("a_color") ?? shader.reflection.attributes.get("color");
    if (colorLocation !== undefined && colorLocation >= 0 && !boundLocations.has(colorLocation)) {
      this.host.gl.disableVertexAttribArray(colorLocation);
      this.host.gl.vertexAttribDivisor(colorLocation, 0);
      this.host.gl.vertexAttrib4f(colorLocation, 1, 1, 1, 1);
    }
    const tangentLocation = shader.reflection.attributes.get("a_tangent") ?? shader.reflection.attributes.get("tangent");
    if (tangentLocation !== undefined && tangentLocation >= 0 && !boundLocations.has(tangentLocation)) {
      this.host.gl.disableVertexAttribArray(tangentLocation);
      this.host.gl.vertexAttribDivisor(tangentLocation, 0);
      this.host.gl.vertexAttrib4f(tangentLocation, 1, 0, 0, 1);
    }
    const uv1Location = shader.reflection.attributes.get("a_uv1") ?? shader.reflection.attributes.get("uv1");
    if (uv1Location !== undefined && uv1Location >= 0 && !boundLocations.has(uv1Location)) {
      this.host.gl.disableVertexAttribArray(uv1Location);
      this.host.gl.vertexAttribDivisor(uv1Location, 0);
      this.host.gl.vertexAttrib2f(uv1Location, 0, 0);
    }
    const instanceColorLocation = shader.reflection.attributes.get("a_instanceColor") ?? shader.reflection.attributes.get("instanceColor");
    if (instanceColorLocation !== undefined && instanceColorLocation >= 0 && !boundLocations.has(instanceColorLocation)) {
      this.host.gl.disableVertexAttribArray(instanceColorLocation);
      this.host.gl.vertexAttribDivisor(instanceColorLocation, 0);
      this.host.gl.vertexAttrib4f(instanceColorLocation, 1, 1, 1, 1);
    }
  }

  disableUnboundVertexAttributes(boundLocations: ReadonlySet<number>): void {
    for (let location = 0; location < this.host.maxVertexAttributes; location += 1) {
      if (!boundLocations.has(location)) {
        this.host.gl.disableVertexAttribArray(location);
        this.host.gl.vertexAttribDivisor(location, 0);
      }
    }
  }

  primitive(topology: DrawCommand["topology"]): GLenum {
    if (topology === "lines") return this.host.gl.LINES;
    if (topology === "points") return this.host.gl.POINTS;
    return this.host.gl.TRIANGLES;
  }

  applyRenderState(state: DrawCommand["renderState"]): void {
    // Standard-sense states follow the device's active frame convention.
    const authored = state ?? {
      depthTest: true,
      depthWrite: true,
      cullMode: "back" as const,
      blend: false,
      depthCompare: "less-equal" as const,
      colorWrite: [true, true, true, true] as const,
      scissor: null,
      polygonOffset: null,
      stencil: null
    };
    const renderState = resolveDepthDrawState(authored, this.host.device?.getDepthConvention?.());
    this.validateAttachmentState(renderState);
    validateRenderCommandState(renderState);
    // These values are dynamic WebGL state and must be restored on every draw,
    // including a return to defaults after a draw using explicit values.
    const extra = renderState as typeof renderState & {
      readonly frontFace?: "ccw" | "cw";
      readonly blendConstant?: readonly [number, number, number, number];
      readonly sampleMask?: number;
    };
    const winding = extra.frontFace ?? "ccw";
    const blendConstant = extra.blendConstant ?? [0, 0, 0, 0];
    const mask = extra.sampleMask ?? 0xffffffff;
    // WebGL2 exposes sampleCoverage, not arbitrary sample-mask bits; it cannot
    // faithfully represent any partial mask. Never silently ignore one.
    if (mask !== 0xffffffff) throw new RenderDeviceError("WebGL2 cannot represent an arbitrary sample mask", "UNSUPPORTED_RENDER_STATE", { sampleMask: mask });
    const offsetClamp = (renderState.polygonOffset as { readonly clamp?: number } | null | undefined)?.clamp ?? 0;
    if (offsetClamp !== 0) throw new RenderDeviceError("WebGL2 cannot represent a nonzero polygon offset clamp", "UNSUPPORTED_RENDER_STATE", { clamp: offsetClamp });
    if (typeof this.host.gl.frontFace !== "function" && winding !== "ccw") throw new RenderDeviceError("Front-face winding is unavailable", "UNSUPPORTED_RENDER_STATE");
    if (typeof this.host.gl.blendColor !== "function" && blendConstant.some((channel) => channel !== 0)) throw new RenderDeviceError("Blend constant is unavailable", "UNSUPPORTED_RENDER_STATE");
    if (this.frontFace !== winding && typeof this.host.gl.frontFace === "function") {
      this.host.gl.frontFace(winding === "cw" ? this.host.gl.CW : this.host.gl.CCW);
      this.frontFace = winding;
    }
    if ((!this.blendConstant || blendConstant.some((channel, index) => channel !== this.blendConstant![index])) && typeof this.host.gl.blendColor === "function") {
      this.host.gl.blendColor(blendConstant[0]!, blendConstant[1]!, blendConstant[2]!, blendConstant[3]!);
      this.blendConstant = [blendConstant[0]!, blendConstant[1]!, blendConstant[2]!, blendConstant[3]!];
    }
    this.host.stateCache.setEnabled(this.host.gl.DEPTH_TEST, renderState.depthTest, () => {
      if (renderState.depthTest) this.host.gl.enable(this.host.gl.DEPTH_TEST);
      else this.host.gl.disable(this.host.gl.DEPTH_TEST);
    });
    this.host.stateCache.depthMask(renderState.depthWrite, () => this.host.gl.depthMask(renderState.depthWrite));
    const depthCompare = renderState.depthCompareV2 ?? renderState.depthCompare;
    const depthFuncEnum = this.depthCompareEnum(depthCompare);
    this.host.stateCache.depthFunc(depthFuncEnum, () => this.host.gl.depthFunc(depthFuncEnum));
    this.host.stateCache.setEnabled(this.host.gl.SAMPLE_ALPHA_TO_COVERAGE, renderState.alphaToCoverage === true, () => {
      if (renderState.alphaToCoverage === true) this.host.gl.enable(this.host.gl.SAMPLE_ALPHA_TO_COVERAGE);
      else this.host.gl.disable(this.host.gl.SAMPLE_ALPHA_TO_COVERAGE);
    });
    const colorWrite = renderState.colorWrite ?? [true, true, true, true] as const;
    this.host.stateCache.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3], () => this.host.gl.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3]));
    if (renderState.scissor) {
      this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, true, () => this.host.gl.enable(this.host.gl.SCISSOR_TEST));
      this.host.stateCache.scissor(renderState.scissor.x, renderState.scissor.y, renderState.scissor.width, renderState.scissor.height, () => {
        this.host.gl.scissor(renderState.scissor!.x, renderState.scissor!.y, renderState.scissor!.width, renderState.scissor!.height);
      });
    } else {
      // SC-01: a device-level scissor (ArrayCamera/StereoCamera views) stays in force for draws with no per-draw scissor.
      const deviceScissor = this.host.lifecycle.effectiveScissor();
      if (deviceScissor) {
        this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, true, () => this.host.gl.enable(this.host.gl.SCISSOR_TEST));
        this.host.stateCache.scissor(deviceScissor.x, deviceScissor.y, deviceScissor.width, deviceScissor.height, () => {
          this.host.gl.scissor(deviceScissor.x, deviceScissor.y, deviceScissor.width, deviceScissor.height);
        });
      } else {
        this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, false, () => this.host.gl.disable(this.host.gl.SCISSOR_TEST));
      }
    }
    if (renderState.polygonOffset) {
      this.host.stateCache.setEnabled(this.host.gl.POLYGON_OFFSET_FILL, true, () => this.host.gl.enable(this.host.gl.POLYGON_OFFSET_FILL));
      this.host.stateCache.polygonOffset(renderState.polygonOffset.factor, renderState.polygonOffset.units, () => this.host.gl.polygonOffset(renderState.polygonOffset!.factor, renderState.polygonOffset!.units));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.POLYGON_OFFSET_FILL, false, () => this.host.gl.disable(this.host.gl.POLYGON_OFFSET_FILL));
    }
    if (renderState.stencil) {
      const stencil = renderState.stencil;
      const compare = this.stencilCompare(stencil.compare ?? "always");
      const reference = stencil.reference ?? 0;
      const readMask = stencil.readMask ?? 0xff;
      const writeMask = stencil.writeMask ?? 0xff;
      const fail = this.stencilOperation(stencil.fail ?? "keep");
      const depthFail = this.stencilOperation(stencil.depthFail ?? "keep");
      const depthPass = this.stencilOperation(stencil.depthPass ?? "keep");
      this.host.stateCache.setEnabled(this.host.gl.STENCIL_TEST, true, () => this.host.gl.enable(this.host.gl.STENCIL_TEST));
      this.host.stateCache.stencilFunc(compare, reference, readMask, () => this.host.gl.stencilFunc(compare, reference, readMask));
      this.host.stateCache.stencilMask(writeMask, () => this.host.gl.stencilMask(writeMask));
      this.host.stateCache.stencilOp(fail, depthFail, depthPass, () => this.host.gl.stencilOp(fail, depthFail, depthPass));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.STENCIL_TEST, false, () => this.host.gl.disable(this.host.gl.STENCIL_TEST));
    }
    if (renderState.cullMode === "none") {
      this.host.stateCache.setEnabled(this.host.gl.CULL_FACE, false, () => this.host.gl.disable(this.host.gl.CULL_FACE));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.CULL_FACE, true, () => this.host.gl.enable(this.host.gl.CULL_FACE));
      this.host.stateCache.cullFace(renderState.cullMode === "front" ? this.host.gl.FRONT : this.host.gl.BACK, () => this.host.gl.cullFace(renderState.cullMode === "front" ? this.host.gl.FRONT : this.host.gl.BACK));
    }
    if (renderState.blendMode !== undefined) {
      // C-04 (§6.8): blendMode wins over `blend`; full factor/equation vocab.
      const resolved = resolveBlendMode(renderState);
      if (resolved === "opaque") {
        this.host.stateCache.setEnabled(this.host.gl.BLEND, false, () => this.host.gl.disable(this.host.gl.BLEND));
      } else {
        this.host.stateCache.setEnabled(this.host.gl.BLEND, true, () => this.host.gl.enable(this.host.gl.BLEND));
        const colorEq = this.blendEquationEnum(resolved.color.equation);
        const alphaEq = this.blendEquationEnum(resolved.alpha.equation);
        this.host.stateCache.blendEquation(colorEq, alphaEq, () => this.host.gl.blendEquationSeparate(colorEq, alphaEq));
        const sC = this.blendFactorEnum(resolved.color.src);
        const dC = this.blendFactorEnum(resolved.color.dst);
        const sA = this.blendFactorEnum(resolved.alpha.src);
        const dA = this.blendFactorEnum(resolved.alpha.dst);
        this.host.stateCache.blendFuncSeparate(sC, dC, sA, dA, () => this.host.gl.blendFuncSeparate(sC, dC, sA, dA));
      }
    } else if (renderState.blend) {
      this.host.stateCache.setEnabled(this.host.gl.BLEND, true, () => this.host.gl.enable(this.host.gl.BLEND));
      // Unknown cache state can follow an external pass, not just a fresh
      // context. Explicitly restore ADD; the cache removes redundant calls.
      this.host.stateCache.blendEquation(this.host.gl.FUNC_ADD, this.host.gl.FUNC_ADD, () => this.host.gl.blendEquationSeparate(this.host.gl.FUNC_ADD, this.host.gl.FUNC_ADD));
      // Legacy `blend: true` resolves to the named straight-alpha mode. RGB
      // uses source alpha, while alpha itself uses source-over (ONE).
      this.host.stateCache.blendFuncSeparate(this.host.gl.SRC_ALPHA, this.host.gl.ONE_MINUS_SRC_ALPHA, this.host.gl.ONE, this.host.gl.ONE_MINUS_SRC_ALPHA, () => this.host.gl.blendFuncSeparate(this.host.gl.SRC_ALPHA, this.host.gl.ONE_MINUS_SRC_ALPHA, this.host.gl.ONE, this.host.gl.ONE_MINUS_SRC_ALPHA));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.BLEND, false, () => this.host.gl.disable(this.host.gl.BLEND));
    }
  }

  depthCompareEnum(compare: string): GLenum {
    switch (compare) {
      case "never": return this.host.gl.NEVER;
      case "less": return this.host.gl.LESS;
      case "equal": return this.host.gl.EQUAL;
      case "less-equal": return this.host.gl.LEQUAL;
      case "greater": return this.host.gl.GREATER;
      case "not-equal": return this.host.gl.NOTEQUAL;
      case "greater-equal": return this.host.gl.GEQUAL;
      default: return this.host.gl.ALWAYS;
    }
  }

  blendEquationEnum(equation: BlendEquation): GLenum {
    switch (equation) {
      case "add": return this.host.gl.FUNC_ADD;
      case "subtract": return this.host.gl.FUNC_SUBTRACT;
      case "reverse-subtract": return this.host.gl.FUNC_REVERSE_SUBTRACT;
      case "min": return this.host.gl.MIN;
      case "max": return this.host.gl.MAX;
    }
  }

  blendFactorEnum(factor: BlendFactor | "constant" | "one-minus-constant" | "src-alpha-saturated"): GLenum {
    switch (factor) {
      case "zero": return this.host.gl.ZERO;
      case "one": return this.host.gl.ONE;
      case "src-color": return this.host.gl.SRC_COLOR;
      case "one-minus-src-color": return this.host.gl.ONE_MINUS_SRC_COLOR;
      case "src-alpha": return this.host.gl.SRC_ALPHA;
      case "one-minus-src-alpha": return this.host.gl.ONE_MINUS_SRC_ALPHA;
      case "dst-color": return this.host.gl.DST_COLOR;
      case "one-minus-dst-color": return this.host.gl.ONE_MINUS_DST_COLOR;
      case "dst-alpha": return this.host.gl.DST_ALPHA;
      case "one-minus-dst-alpha": return this.host.gl.ONE_MINUS_DST_ALPHA;
      // CONSTANT_COLOR's alpha channel is constant alpha. Using it in both
      // components also avoids WebGL's invalid mixed color/alpha constant factors.
      case "constant": return this.host.gl.CONSTANT_COLOR;
      case "one-minus-constant": return this.host.gl.ONE_MINUS_CONSTANT_COLOR;
      case "src-alpha-saturated": return this.host.gl.SRC_ALPHA_SATURATE;
      default: throw new RenderDeviceError("Unsupported blend factor", "INVALID_DRAW_COMMAND", { factor });
    }
  }

  requireBuffer(buffer: RenderBuffer): WebGL2Buffer {
    if (!(buffer instanceof WebGL2Buffer) || !this.host.buffers.has(buffer) || buffer.disposed) {
      throw new RenderDeviceError("Buffer is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        bufferId: buffer.id
      });
    }
    return buffer;
  }

  stencilCompare(compare: NonNullable<DrawCommand["renderState"]>["stencil"] extends infer Stencil ? Stencil extends { readonly compare?: infer Compare } ? NonNullable<Compare> : never : never): GLenum {
    switch (compare) {
      case "never": return this.host.gl.NEVER;
      case "less": return this.host.gl.LESS;
      case "less-equal": return this.host.gl.LEQUAL;
      case "greater": return this.host.gl.GREATER;
      case "greater-equal": return this.host.gl.GEQUAL;
      case "equal": return this.host.gl.EQUAL;
      case "not-equal": return this.host.gl.NOTEQUAL;
      case "always": return this.host.gl.ALWAYS;
    }
  }

  stencilOperation(operation: NonNullable<DrawCommand["renderState"]>["stencil"] extends infer Stencil ? Stencil extends { readonly fail?: infer Operation } ? NonNullable<Operation> : never : never): GLenum {
    switch (operation) {
      case "keep": return this.host.gl.KEEP;
      case "zero": return this.host.gl.ZERO;
      case "replace": return this.host.gl.REPLACE;
      case "increment": return this.host.gl.INCR;
      case "decrement": return this.host.gl.DECR;
      case "invert": return this.host.gl.INVERT;
      case "increment-wrap": return this.host.gl.INCR_WRAP;
      case "decrement-wrap": return this.host.gl.DECR_WRAP;
    }
  }

  requireShader(shader: RenderShaderProgram): WebGL2ShaderProgram {
    if (!(shader instanceof WebGL2ShaderProgram) || !this.host.shaders.has(shader) || shader.disposed) {
      throw new RenderDeviceError("Shader is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        shaderId: shader.id
      });
    }
    return shader;
  }
  /**
   * C-28 (CONTRACTS.md §3.4) — instanced multi-draw (#180). When
   * `WEBGL_multi_draw` is present and every entry shares one program, vertex
   * input, index buffer, topology and render state (uniforms may differ only
   * in `u_drawId`, which a `gl_DrawID` program does not declare), the batch is
   * one `multiDrawElementsInstancedWEBGL` call. Otherwise each entry goes
   * through the caller's fallback (the identity loop is the no-extension
   * fallback). The result says whether a single native submission was issued.
   */
  multiDrawElementsInstanced(draws: readonly unknown[], fallback: (command: DrawCommand) => void = (command) => this.draw(command)): boolean {
    const commands = draws as readonly DrawCommand[];
    // A fallback loop must not submit an earlier member before discovering an
    // unsupported per-attachment state on a later member.
    for (const command of commands) this.validateAttachmentState(command.renderState);
    if (this.tryMultiDrawElementsInstanced(commands)) return true;
    for (const command of commands) {
      fallback(command);
    }
    return false;
  }

  /**
   * Whether the current context generation exposes the actual entry point.
   * The extension object is reacquired on restoration; the construction-time
   * device probe alone cannot describe a restored context.
   */
  supportsMultiDrawElementsInstanced(): boolean {
    const extension = this.multiDrawExtension();
    return extension !== null && typeof extension.multiDrawElementsInstancedWEBGL === "function";
  }

  /**
   * Submit only a native combined call. In particular, never replay a program
   * that reads gl_DrawID through ordinary draws: each ordinary draw would see
   * draw zero. A false result means no draw was attempted; a thrown exception
   * after entering issueMultiDraw must be propagated, never replayed.
   */
  tryMultiDrawElementsInstanced(commands: readonly DrawCommand[]): boolean {
    if (commands.length < 2) return false;
    for (const command of commands) this.validateAttachmentState(command.renderState);
    const extension = this.multiDrawExtension();
    if (!extension || typeof extension.multiDrawElementsInstancedWEBGL !== "function" || !canMultiDraw(commands)) return false;
    this.issueMultiDraw(extension, commands);
    return true;
  }

  private validateAttachmentState(state: DrawCommand["renderState"]): void {
    if (!state || state.colorAttachments === undefined) return;
    const target = this.host.activeRenderTarget;
    const count = target?.depthOnly ? 0 : target ? (target.colorTextures?.length ?? 1) : 1;
    validateRenderCommandState(state, count);
    // The core WebGL2 state API applies these settings globally. Until an
    // indexed-state extension is explicitly supported, do not silently draw
    // with different state than the caller requested.
    if (hasAttachmentRenderOverrides(state)) {
      throw new RenderDeviceError("WebGL2 cannot apply independent color attachment state", "UNSUPPORTED_RENDER_STATE");
    }
  }

  private multiDrawExtension(): WebGLMultiDrawExtension | null {
    if (this.multiDrawExt === undefined) {
      const gl = this.host.gl as WebGL2RenderingContext & { getExtension?: (name: string) => unknown };
      this.multiDrawExt = typeof gl?.getExtension === "function"
        ? (gl.getExtension("WEBGL_multi_draw") as WebGLMultiDrawExtension | null) ?? null
        : null;
    }
    return this.multiDrawExt;
  }

  private issueMultiDraw(ext: WebGLMultiDrawExtension, commands: readonly DrawCommand[]): void {
    const first = commands[0]!;
    // Every member can have a different count and instance count. Check each
    // one before the single extension submission, not just the first member.
    for (const command of commands) {
      this.validateDrawRanges(command);
      const vertex = this.requireBuffer(command.vertexBuffer);
      this.streamBuffers(command, vertex, first.shader!);
      for (const attribute of command.instanceAttributes ?? []) {
        const buffer = this.requireBuffer(attribute.buffer);
        const location = first.shader!.reflection.attributes.get(attribute.shaderName);
        if (location !== undefined && location >= 0) this.validateInstanceAttribute(attribute, buffer, command.instanceCount ?? 1);
      }
    }
    this.prepareDraw(first);
    const count = commands.length;
    const counts = new Int32Array(count);
    const offsets = new Int32Array(count);
    const instances = new Int32Array(count);
    const indexByteSize = first.indexType === "uint32" ? 4 : 2;
    for (let index = 0; index < count; index += 1) {
      const command = commands[index]!;
      counts[index] = command.indexCount ?? 0;
      offsets[index] = (command.firstIndex ?? 0) * indexByteSize;
      instances[index] = Math.max(1, command.instanceCount ?? 1);
    }
    const type = first.indexType === "uint32" ? this.host.gl.UNSIGNED_INT : this.host.gl.UNSIGNED_SHORT;
    ext.multiDrawElementsInstancedWEBGL(this.primitive(first.topology), counts, 0, type, offsets, 0, instances, 0, count);
    this.host.counters.drawCalls += 1;
    this.host.counters.multiDrawSubmissions += 1;
    this.host.counters.multiDrawMembers += count;
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
    if (this.host.errorCheckMode === "strict") {
      const drawError = this.host.lifecycle.readError();
      if (drawError) {
        throw new RenderDeviceError(`WebGL2 multi-draw failed for ${first.label ?? "unnamed"}: ${drawError}`, "WEBGL_DRAW_FAILED", {
          label: first.label,
          stage: "draw",
          error: drawError
        });
      }
    }
  }

}

/** The subset of `WEBGL_multi_draw` the binder issues. */
export interface WebGLMultiDrawExtension {
  multiDrawElementsInstancedWEBGL(
    mode: GLenum,
    counts: Int32Array, countsOffset: number,
    type: GLenum,
    offsets: Int32Array, offsetsOffset: number,
    instanceCounts: Int32Array, instanceCountsOffset: number,
    drawCount: number
  ): void;
}

/**
 * #180: entries can share one multi-draw call only when everything bound by
 * `prepareDraw(first)` is identical for all of them. A program that declares
 * `u_drawId` is the uniform-loop fallback and must be drawn one by one.
 */
export function canMultiDraw(commands: readonly DrawCommand[]): boolean {
  const first = commands[0];
  if (!first || !first.shader || !first.vertexFormat || !first.indexBuffer) return false;
  if (first.shader.reflection.uniforms.has("u_drawId")) return false;
  for (const command of commands) {
    if (
      !Number.isSafeInteger(command.indexCount) || (command.indexCount ?? 0) <= 0 || (command.indexCount ?? 0) > 0x7fffffff ||
      !Number.isSafeInteger(command.instanceCount ?? 1) || (command.instanceCount ?? 1) <= 0 || (command.instanceCount ?? 1) > 0x7fffffff ||
      !Number.isSafeInteger(command.firstIndex ?? 0) || (command.firstIndex ?? 0) < 0 || (command.firstIndex ?? 0) * (command.indexType === "uint32" ? 4 : 2) > 0x7fffffff ||
      command.shader !== first.shader ||
      command.vertexBuffer !== first.vertexBuffer ||
      !sameVertexBuffers(command, first) ||
      command.vertexFormat !== first.vertexFormat ||
      command.indexBuffer !== first.indexBuffer ||
      command.indexType !== first.indexType ||
      command.topology !== first.topology ||
      !sameRenderState(command.renderState, first.renderState) ||
      command.instanceAttributes !== first.instanceAttributes ||
      !sameUniformsExceptDrawId(command.uniforms, first.uniforms)
    ) {
      return false;
    }
  }
  return true;
}

function sameVertexBuffers(a: DrawCommand, b: DrawCommand): boolean {
  const left = a.vertexBuffers;
  const right = b.vertexBuffers;
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameRenderState(a: DrawCommand["renderState"], b: DrawCommand["renderState"]): boolean {
  return a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b));
}

function sameUniformsExceptDrawId(a: DrawCommand["uniforms"], b: DrawCommand["uniforms"]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const sizeA = a.size - (a.has("u_drawId") ? 1 : 0);
  const sizeB = b.size - (b.has("u_drawId") ? 1 : 0);
  if (sizeA !== sizeB) return false;
  for (const [name, value] of a) {
    if (name === "u_drawId") continue;
    if (!b.has(name)) return false;
    if (!uniformValueEqual(b.get(name), value)) return false;
  }
  return true;
}

/**
 * L5: one merged call binds `first`'s uniform set for every member — values
 * may only differ in `u_drawId` (which a `gl_DrawID` program replaces with
 * the hardware index). Array-likes compare element-wise so two commands
 * carrying identical CONTENT in different buffers still merge; every other
 * value compares by identity.
 */
function textureBindingsEqual(a: TextureBinding, b: TextureBinding): boolean {
  const sa = a.sampler, sb = b.sampler;
  return a.name === b.name && a.texture === b.texture && a.required === b.required && a.ready === b.ready && a.rotation === b.rotation
    && a.offset[0] === b.offset[0] && a.offset[1] === b.offset[1] && a.scale[0] === b.scale[0] && a.scale[1] === b.scale[1]
    && (sa === sb || (sa.minFilter === sb.minFilter && sa.magFilter === sb.magFilter && sa.addressU === sb.addressU && sa.addressV === sb.addressV
      && sa.addressW === sb.addressW && sa.maxAnisotropy === sb.maxAnisotropy && sa.compare === sb.compare && sa.mirror === sb.mirror));
}

function uniformValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") return a === b;
  // Per-item bindings of the same texture and sampler state are interchangeable for one merged call.
  if (isTextureBinding(a) && isTextureBinding(b)) return textureBindingsEqual(a, b);
  const la = a as ArrayLike<number> | null;
  const lb = b as ArrayLike<number> | null;
  if (
    la !== null && lb !== null &&
    typeof la === "object" && typeof lb === "object" &&
    typeof la.length === "number" && typeof lb.length === "number" &&
    !(a instanceof Map)
  ) {
    if (la.length !== lb.length) return false;
    for (let i = 0; i < la.length; i += 1) {
      if (la[i] !== lb[i]) return false;
    }
    return true;
  }
  return false;
}
