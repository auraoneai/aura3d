import { RenderDeviceError } from "../RenderDevice";
import { deriveShaderDataLayout, writeShaderData, type ShaderDataScalar, type ShaderDataType, type ShaderDataValue } from "../webgpu/ShaderDataLayout";

/**
 * WebGL2 lowering for portable data uniforms (S5-WP05-03).
 *
 * GLSL ES 3.00 declares an aggregate data uniform as an ordinary (non-block)
 * uniform of a struct and/or array type. The linked program then exposes one
 * active uniform per leaf, named with the GL path syntax:
 * `root.field`, `root[2].field`, `root.items[1].weights` (array leaves report
 * a `[0]` suffix, which reflection strips). This module turns one validated
 * logical value into exactly those leaf entries:
 *
 * - scalar `f32`/`i32`/`u32` -> number; `bool` -> 0 or 1 (uploaded with `uniform1i`);
 * - vector -> `Float32Array`/`Int32Array`/`Uint32Array` (bool vectors as `Int32Array`);
 * - matrix -> unpadded column-major `Float32Array` (`uniformMatrix{C}x{R}fv`);
 * - array of scalars/vectors/matrices -> one concatenated leaf at the array path;
 * - array of structs or arrays, and struct fields -> recursive `[i]` / `.field` paths.
 *
 * Integers are never encoded as float bits: integer leaves keep integer typed
 * arrays so the binder selects the `uniform*iv` / `uniform*uiv` setters from
 * the declared GL type. `glslFieldNames` maps logical struct field names to
 * the field identifiers used in the GLSL declaration when they differ (graph
 * GLSL prefixes fields to avoid reserved words); unmapped names are used as is.
 */
export type GlslUniformLeafValue = number | Float32Array | Int32Array | Uint32Array;

export class UniformDataFlattenError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${path}: ${message}`);
    this.name = "UniformDataFlattenError";
  }
}

function leafKind(type: ShaderDataType): "scalar" | "vector" | "matrix" | undefined {
  if (typeof type === "string") return "scalar";
  if (type.kind === "vector") return "vector";
  if (type.kind === "matrix") return "matrix";
  return undefined;
}

function componentCount(type: ShaderDataType): number {
  if (typeof type === "string") return 1;
  if (type.kind === "vector") return type.length;
  if (type.kind === "matrix") return type.columns * type.rows;
  throw new UniformDataFlattenError("not a leaf type", "$");
}

function elementScalar(type: ShaderDataType): ShaderDataScalar {
  if (typeof type === "string") return type;
  if (type.kind === "vector") return type.element;
  return "f32";
}

function typedArray(scalar: ShaderDataScalar, length: number): Float32Array | Int32Array | Uint32Array {
  return scalar === "f32" ? new Float32Array(length) : scalar === "u32" ? new Uint32Array(length) : new Int32Array(length);
}

function toNumber(scalar: ShaderDataScalar, value: unknown): number {
  if (scalar === "bool") return value === true || value === 1 ? 1 : 0;
  return value as number;
}

/**
 * Validate `value` against `type` with the same rules as the WebGPU byte
 * writer, then return the GL leaf uniforms in declaration order.
 */
export function flattenGlslUniformData(
  root: string,
  type: ShaderDataType,
  value: unknown,
  glslFieldNames?: Readonly<Record<string, string>>
): Map<string, GlslUniformLeafValue> {
  // std430 admits bool and every compound the GLSL declaration can express;
  // the writer throws a path-qualified error for any invalid value.
  writeShaderData(deriveShaderDataLayout(type, "glsl-std430"), value as ShaderDataValue);
  const out = new Map<string, GlslUniformLeafValue>();
  const fieldName = (name: string): string =>
    glslFieldNames && Object.hasOwn(glslFieldNames, name) ? glslFieldNames[name]! : name;

  const writeLeaf = (leaf: ShaderDataType, input: unknown, target: Float32Array | Int32Array | Uint32Array, offset: number): void => {
    const scalar = elementScalar(leaf);
    if (typeof leaf === "string") { target[offset] = toNumber(scalar, input); return; }
    const values = input as ArrayLike<unknown>;
    const count = componentCount(leaf);
    for (let i = 0; i < count; i += 1) target[offset + i] = toNumber(scalar, values[i]);
  };

  const visit = (current: ShaderDataType, input: unknown, path: string): void => {
    const kind = leafKind(current);
    if (kind === "scalar") { out.set(path, toNumber(current as ShaderDataScalar, input)); return; }
    if (kind !== undefined) {
      const target = typedArray(elementScalar(current), componentCount(current));
      writeLeaf(current, input, target, 0);
      out.set(path, target);
      return;
    }
    if (typeof current === "string") return;
    if (current.kind === "array") {
      const values = input as ArrayLike<unknown>;
      if (leafKind(current.element) !== undefined) {
        const stride = componentCount(current.element);
        const target = typedArray(elementScalar(current.element), stride * current.length);
        for (let i = 0; i < current.length; i += 1) writeLeaf(current.element, values[i], target, i * stride);
        out.set(path, target);
        return;
      }
      for (let i = 0; i < current.length; i += 1) visit(current.element, values[i], `${path}[${i}]`);
      return;
    }
    if (current.kind === "struct") {
      const record = input as Record<string, unknown>;
      for (const field of current.fields) visit(field.type, record[field.name], `${path}.${fieldName(field.name)}`);
    }
  };
  visit(type, value, root);
  return out;
}

/**
 * Flatten one portable data uniform for a WebGL2 draw. Invalid values or a
 * missing schema fail the draw with a named error instead of skipping data.
 */
export function flattenPortableDataUniform(
  descriptor: { readonly name: string; readonly dataType?: ShaderDataType; readonly glslFieldNames?: Readonly<Record<string, string>> },
  value: unknown,
  label: string | undefined
): Map<string, GlslUniformLeafValue> {
  if (descriptor.dataType === undefined) {
    throw new RenderDeviceError(`Portable data uniform ${descriptor.name} has no dataType schema`, "WEBGL_PORTABLE_UNIFORM_DATA_UNSUPPORTED", { label, uniform: descriptor.name });
  }
  try {
    return flattenGlslUniformData(descriptor.name, descriptor.dataType, value, descriptor.glslFieldNames);
  } catch (error) {
    throw new RenderDeviceError(`Portable data uniform ${descriptor.name} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      "WEBGL_PORTABLE_UNIFORM_DATA_INVALID", { label, uniform: descriptor.name });
  }
}

/**
 * True when a linked program reflects `name` itself or any leaf below it.
 * Struct and struct-array uniforms have no active entry for the root name.
 */
export function reflectsUniformRoot(uniforms: ReadonlySet<string>, name: string): boolean {
  if (uniforms.has(name)) return true;
  for (const candidate of uniforms) {
    if (candidate.length > name.length && candidate.startsWith(name)) {
      const next = candidate[name.length];
      if (next === "." || next === "[") return true;
    }
  }
  return false;
}
