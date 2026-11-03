/**
 * Host layouts for shader-visible data. All offsets, sizes and strides are in
 * bytes. Matrices are column-major and take an unpadded, column-major value.
 *
 * WGSL uniform arrays whose natural stride is less than 16 need a shader-side
 * wrapper with an `@size(16)` member; nested uniform structs likewise need the
 * indicated member spacing. A compiler emitting declarations must honor the
 * returned layout. WGSL buffer bools are rejected: bool is not host-shareable;
 * lower boolean flags to u32 in both the shader and the host schema instead.
 */

export type ShaderDataScalar = "f32" | "i32" | "u32" | "bool";
export type ShaderDataTarget = "glsl-std140" | "glsl-std430" | "wgsl-uniform" | "wgsl-storage";
export type ShaderDataType =
  | ShaderDataScalar
  | { readonly kind: "vector"; readonly element: ShaderDataScalar; readonly length: 2 | 3 | 4 }
  | { readonly kind: "matrix"; readonly columns: 2 | 3 | 4; readonly rows: 2 | 3 | 4 }
  | { readonly kind: "array"; readonly element: ShaderDataType; readonly length: number }
  | { readonly kind: "struct"; readonly fields: readonly ShaderDataField[] };

export interface ShaderDataField {
  readonly name: string;
  readonly type: ShaderDataType;
}

export type ShaderDataValue = number | boolean | ArrayLike<number | boolean>
  | readonly ShaderDataValue[] | { readonly [name: string]: ShaderDataValue };

export interface ShaderDataMemberLayout {
  readonly name: string;
  readonly offset: number;
  readonly layout: ShaderDataLayout;
}

export interface ShaderDataLayout {
  readonly target: ShaderDataTarget;
  /** A snapshot of the schema; later changes to the caller's input do not alter it. */
  readonly type: ShaderDataType;
  readonly alignment: number;
  readonly size: number;
  readonly stride?: number;
  readonly element?: ShaderDataLayout;
  readonly members?: readonly ShaderDataMemberLayout[];
}

export class ShaderDataLayoutError extends Error {
  constructor(message: string, public readonly code: string, public readonly path: string) {
    super(`${path}: ${message}`);
    this.name = "ShaderDataLayoutError";
  }
}

const TARGETS = new Set<ShaderDataTarget>(["glsl-std140", "glsl-std430", "wgsl-uniform", "wgsl-storage"]);
const SCALARS = new Set<ShaderDataScalar>(["f32", "i32", "u32", "bool"]);
const MAX_SIZE = 0xffffffff;
const roundUp = (value: number, alignment: number): number => Math.ceil(value / alignment) * alignment;

function fail(code: string, path: string, message: string): never {
  throw new ShaderDataLayoutError(message, code, path);
}

function checkedSize(size: number, path: string): number {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SIZE) {
    fail("SHADER_DATA_SIZE", path, "layout exceeds the 32-bit byte-size limit");
  }
  return size;
}

function vectorAlignment(length: number): number {
  return length === 2 ? 8 : 16;
}

/** Derive a complete layout for GLSL std140/std430 or WGSL uniform/storage. */
export function deriveShaderDataLayout(type: ShaderDataType, target: ShaderDataTarget): ShaderDataLayout {
  if (!TARGETS.has(target)) fail("SHADER_DATA_TARGET", "$", `unknown layout target ${String(target)}`);
  const active = new Set<object>();
  const std140 = target === "glsl-std140";
  const uniform = target === "wgsl-uniform";
  const wgsl = target === "wgsl-uniform" || target === "wgsl-storage";

  function scalar(element: unknown, path: string): ShaderDataScalar {
    if (typeof element !== "string" || !SCALARS.has(element as ShaderDataScalar)) {
      return fail("SHADER_DATA_TYPE", path, `invalid scalar type ${String(element)}`);
    }
    if (element === "bool" && wgsl) {
      return fail("SHADER_DATA_BOOL", path, "WGSL buffer bool is not host-shareable; use u32 in the shader and schema");
    }
    return element as ShaderDataScalar;
  }

  function visit(input: ShaderDataType, path: string): ShaderDataLayout {
    if (typeof input === "string") {
      const value = scalar(input, path);
      return { target, type: value, alignment: 4, size: 4 };
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return fail("SHADER_DATA_TYPE", path, "expected a scalar or compound type");
    }
    if (active.has(input)) return fail("SHADER_DATA_CYCLE", path, "recursive data types are not supported");
    active.add(input);
    try {
      switch (input.kind) {
        case "vector": {
          const element = scalar(input.element, `${path}.element`);
          if (input.length !== 2 && input.length !== 3 && input.length !== 4) {
            return fail("SHADER_DATA_TYPE", path, "vector length must be 2, 3, or 4");
          }
          const type: ShaderDataType = { kind: "vector", element, length: input.length };
          return { target, type, alignment: vectorAlignment(input.length), size: input.length * 4 };
        }
        case "matrix": {
          const { columns, rows } = input;
          if ((columns !== 2 && columns !== 3 && columns !== 4) || (rows !== 2 && rows !== 3 && rows !== 4)) {
            return fail("SHADER_DATA_TYPE", path, "matrix rows and columns must be 2, 3, or 4");
          }
          const alignment = std140 ? 16 : vectorAlignment(rows);
          const stride = roundUp(rows * 4, alignment);
          return { target, type: { kind: "matrix", columns, rows }, alignment, stride, size: stride * columns };
        }
        case "array": {
          if (!Number.isSafeInteger(input.length) || input.length <= 0) {
            return fail("SHADER_DATA_LENGTH", path, "array length must be a positive safe integer");
          }
          const element = visit(input.element, `${path}[]`);
          const alignment = std140 || uniform ? roundUp(element.alignment, 16) : element.alignment;
          const stride = checkedSize(roundUp(element.size, alignment), path);
          const size = checkedSize(stride * input.length, path);
          return { target, type: { kind: "array", element: element.type, length: input.length }, alignment, stride, size, element };
        }
        case "struct": {
          if (!Array.isArray(input.fields) || input.fields.length === 0) {
            return fail("SHADER_DATA_FIELDS", path, "a struct requires at least one field");
          }
          const names = new Set<string>();
          const members: ShaderDataMemberLayout[] = [];
          const fields: ShaderDataField[] = [];
          let offset = 0;
          let maximumAlignment = 1;
          for (const field of input.fields) {
            if (!field || typeof field.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.name)) {
              return fail("SHADER_DATA_FIELD", path, "field names must be shader identifiers");
            }
            if (names.has(field.name)) return fail("SHADER_DATA_FIELD", `${path}.${field.name}`, "duplicate field");
            names.add(field.name);
            const layout = visit(field.type, `${path}.${field.name}`);
            offset = checkedSize(roundUp(offset, layout.alignment), path);
            members.push({ name: field.name, offset, layout });
            fields.push({ name: field.name, type: layout.type });
            maximumAlignment = Math.max(maximumAlignment, layout.alignment);
            offset = checkedSize(offset + layout.size, path);
          }
          const alignment = std140 || uniform ? roundUp(maximumAlignment, 16) : maximumAlignment;
          return { target, type: { kind: "struct", fields }, alignment, size: checkedSize(roundUp(offset, alignment), path), members };
        }
        default:
          return fail("SHADER_DATA_TYPE", path, `unknown compound type ${String((input as { kind?: unknown }).kind)}`);
      }
    } finally {
      active.delete(input);
    }
  }
  return visit(type, "$");
}

function joinPath(parent: string, key: string | number | undefined): string {
  return key === undefined ? parent : typeof key === "number" ? `${parent}[${key}]` : `${parent}.${key}`;
}

/** The success condition of `sequence`, without a path. */
function isSequence(value: unknown, length: number): value is ArrayLike<unknown> {
  return !!value && typeof value === "object" && !(value instanceof DataView) && (value as ArrayLike<unknown>).length === length;
}

/** The success condition of `validateScalar` for a number (the value is stored unchanged). */
function plainScalarValid(type: ShaderDataScalar, value: number): boolean {
  if (type === "bool") return value === 1 || value === 0;
  if (!Number.isFinite(value)) return false;
  if (type === "f32") return Number.isFinite(Math.fround(value));
  if (type === "i32") return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
  if (type === "u32") return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  return false;
}

function sequence(value: unknown, length: number, path: string): ArrayLike<unknown> {
  if (!value || typeof value !== "object" || value instanceof DataView ||
      (value as ArrayLike<unknown>).length !== length) {
    return fail("SHADER_DATA_VALUE", path, `expected ${length} values`);
  }
  return value as ArrayLike<unknown>;
}

function validateScalar(type: ShaderDataScalar, value: unknown, path: string): number {
  if (type === "bool") {
    if (value === true || value === 1) return 1;
    if (value === false || value === 0) return 0;
    return fail("SHADER_DATA_VALUE", path, "expected true, false, 0, or 1");
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail("SHADER_DATA_VALUE", path, `expected a finite ${type} value`);
  }
  if (type === "f32" && !Number.isFinite(Math.fround(value))) {
    return fail("SHADER_DATA_VALUE", path, "value is outside the finite f32 range");
  }
  if (type === "i32" && (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff)) {
    return fail("SHADER_DATA_VALUE", path, "expected a signed 32-bit integer");
  }
  if (type === "u32" && (!Number.isInteger(value) || value < 0 || value > 0xffffffff)) {
    return fail("SHADER_DATA_VALUE", path, "expected an unsigned 32-bit integer");
  }
  return value;
}

/**
 * Validate and write a value into a byte-owned staging image. Arrays and matrices
 * use logical values without padding; structs use objects keyed by field name.
 * A supplied target is never changed if validation fails. The returned byte view
 * covers exactly the written region, including deterministic zeroed padding.
 */
export function writeShaderData(
  layout: ShaderDataLayout,
  value: ShaderDataValue,
  target?: ArrayBuffer | ArrayBufferView,
  byteOffset = 0
): Uint8Array {
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset % layout.alignment !== 0) {
    fail("SHADER_DATA_OFFSET", "$", `offset must be a nonnegative multiple of ${layout.alignment}`);
  }
  const bytes = target === undefined
    ? new Uint8Array(checkedSize(byteOffset + layout.size, "$"))
    : target instanceof ArrayBuffer
      ? new Uint8Array(target)
      : new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
  if (byteOffset + layout.size > bytes.byteLength) fail("SHADER_DATA_RANGE", "$", "target is too small for the layout");

  // Write a temporary image first so all validation errors leave the target intact.
  const staging = new Uint8Array(layout.size);
  const view = new DataView(staging.buffer);
  // Paths name the failing element in errors only; they are built on failure (or once per compound level), never
  // once per scalar on the success path (this runs for every uniform block upload, every frame).
  function writeScalar(type: ShaderDataScalar, v: number, offset: number): void {
    if (type === "f32") view.setFloat32(offset, v, true);
    else if (type === "i32") view.setInt32(offset, v, true);
    else view.setUint32(offset, v, true);
  }
  function storeScalar(type: ShaderDataScalar, input: unknown, offset: number, parent: string, key: string | number | undefined): void {
    writeScalar(type, typeof input === "number" && plainScalarValid(type, input) ? input : validateScalar(type, input, joinPath(parent, key)), offset);
  }
  function values(input: unknown, length: number, parent: string, key: string | number | undefined): ArrayLike<unknown> {
    return isSequence(input, length) ? input : sequence(input, length, joinPath(parent, key));
  }
  function store(current: ShaderDataLayout, input: unknown, offset: number, parent: string, key: string | number | undefined): void {
    const type = current.type;
    if (typeof type === "string") return storeScalar(type, input, offset, parent, key);
    switch (type.kind) {
      case "vector": {
        const items = values(input, type.length, parent, key);
        for (let i = 0; i < type.length; i += 1) {
          const item = items[i];
          if (typeof item === "number" && plainScalarValid(type.element, item)) writeScalar(type.element, item, offset + i * 4);
          else storeScalar(type.element, item, offset + i * 4, joinPath(parent, key), i);
        }
        return;
      }
      case "matrix": {
        const items = values(input, type.columns * type.rows, parent, key);
        for (let c = 0; c < type.columns; c += 1) {
          for (let r = 0; r < type.rows; r += 1) {
            const item = items[c * type.rows + r];
            const at = offset + c * current.stride! + r * 4;
            if (typeof item === "number" && plainScalarValid("f32", item)) writeScalar("f32", item, at);
            else storeScalar("f32", item, at, joinPath(parent, key), c * type.rows + r);
          }
        }
        return;
      }
      case "array": {
        const items = values(input, type.length, parent, key);
        const path = joinPath(parent, key);
        for (let i = 0; i < type.length; i += 1) store(current.element!, items[i], offset + i * current.stride!, path, i);
        return;
      }
      case "struct": {
        const path = joinPath(parent, key);
        if (!input || typeof input !== "object" || Array.isArray(input) || ArrayBuffer.isView(input)) {
          return fail("SHADER_DATA_VALUE", path, "expected an object with every struct field");
        }
        const record = input as Record<string, unknown>;
        for (const member of current.members!) {
          if (!Object.prototype.hasOwnProperty.call(record, member.name)) {
            fail("SHADER_DATA_VALUE", `${path}.${member.name}`, "missing field");
          }
          store(member.layout, record[member.name], offset + member.offset, path, member.name);
        }
        for (const key of Object.keys(record)) {
          if (!current.members!.some((member) => member.name === key)) fail("SHADER_DATA_VALUE", `${path}.${key}`, "unknown field");
        }
      }
    }
  }
  store(layout, value, 0, "$", undefined);
  bytes.set(staging, byteOffset);
  return bytes.subarray(byteOffset, byteOffset + layout.size);
}
