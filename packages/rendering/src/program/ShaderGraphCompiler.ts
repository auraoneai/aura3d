/**
 * Serializable Aura3D shader graph IR and compiler. The IR never accepts source
 * text: identifiers, types, data flow and control flow are validated before
 * any GLSL or WGSL is emitted.
 */
import { deriveShaderDataLayout, type ShaderDataLayout, type ShaderDataType } from "../webgpu/ShaderDataLayout";
import { deriveUniformDataLayout, emitWgslStruct, type UniformBlockLayout } from "./UniformLayout";

export type ShaderGraphTarget = "glsl" | "wgsl";
/**
 * Fixed arrays use `array:<length>:<element-type>`, recursively. Matrices use
 * `mat<C>x<R>` (or `mat<C>` for square matrices), with 2..4 columns and rows.
 * Values are column-major; dimensions and array lengths are validated at runtime.
 */
export type ShaderGraphValueType = "f32" | "i32" | "u32" | "bool" | "vec2" | "vec3" | "vec4" | "uvec3" | `mat${number}` | `mat${number}x${number}` | `struct:${string}` | `array:${number}:${string}`;
export type ShaderGraphBuiltin = "positionLocal" | "positionWorld" | "normalLocal" | "normalWorld" | "uv0" | "uv1" | "time" | "cameraPosition" | "viewportUV" | "depth" | "globalInvocationId" | "localInvocationId" | "workgroupId";
export type ShaderGraphOperation = "constant" | "input" | "uniform" | "local" | "output" | "construct" | "swizzle" | "textureSample" | "storageLoad" | "textureLoad" | "structConstruct" | "structField" | "arrayIndex" | "parameter" | "call" | "noise" | "add" | "sub" | "mul" | "div" | "mod" | "min" | "max" | "pow" | "dot" | "cross" | "distance" | "atan2" | "step" | "sin" | "cos" | "tan" | "abs" | "sign" | "sqrt" | "exp" | "log" | "fract" | "floor" | "ceil" | "saturate" | "oneMinus" | "negate" | "normalize" | "length" | "mix" | "smoothstep" | "clamp" | "select" | "less" | "greater" | "equal";

export interface ShaderGraphNode {
  readonly id: string;
  readonly op: ShaderGraphOperation;
  readonly type: ShaderGraphValueType;
  /**
   * Dependencies, ordered as operands for the operation. `textureSample`
   * takes normalized vec2/vec3 coordinates for a 2D/3D color texture.
   * `textureLoad` on depth2d takes a vec2 of pixel coordinates,
   * measured from the lower-left corner at mip 0, and returns an f32 depth.
   * The components are converted to integers toward zero; callers must keep
   * the resulting coordinates inside the texture bounds. Componentwise
   * operations require matching operand/result types; distance has matching
   * operands and an f32 result. `mul` also supports dimensionally compatible
   * matrix/vector, vector/matrix, matrix/matrix and matrix/f32 products.
   * Use construct to expand scalars to vectors, or supply one column vector per
   * matrix column. Matrix constants contain columns in column-major order.
   * Floating-point operands and intermediates must be finite. For mod, use a
   * nonzero divisor; the result is x - y * floor(x / y), including for negative
   * operands. As in the original GLSL expressions, sqrt requires x >= 0, log
   * requires x > 0, smoothstep requires edge0 < edge1 per component, and
   * atan2(y, x) requires x != 0. Avoid tangent poles and negating the minimum
   * i32 value. Built-in precision may vary between devices and backends.
   * `arrayIndex` takes an array and an i32/u32 index. Dynamic indices must
   * remain in bounds; literal out-of-range indices are rejected.
   */
  readonly inputs?: readonly string[];
  readonly value?: number | boolean | readonly number[];
  /** Builtin, loop index, material output, function, parameter, or struct field name. */
  readonly name?: string;
  readonly resource?: string;
  readonly components?: string;
}
export interface ShaderGraphStructField {
  readonly name: string;
  readonly type: ShaderGraphValueType;
}
export interface ShaderGraphStruct {
  readonly name: string;
  readonly fields: readonly ShaderGraphStructField[];
}
export interface ShaderGraphFunctionParameter {
  readonly name: string;
  readonly type: ShaderGraphValueType;
}
export interface ShaderGraphFunction {
  readonly name: string;
  readonly parameters: readonly ShaderGraphFunctionParameter[];
  readonly returnType: ShaderGraphValueType;
  readonly nodes: readonly ShaderGraphNode[];
  readonly output: string;
}
export interface ShaderGraphResource {
  readonly name: string;
  readonly kind: "uniform" | "texture2d" | "texture3d" | "depth2d" | "storage-buffer" | "storage-texture";
  readonly type?: ShaderGraphValueType;
  readonly access?: "read" | "write" | "read_write";
  /** Required for storage textures; WGSL format, e.g. rgba8unorm. */
  readonly format?: "rgba8unorm" | "rgba16float" | "rgba32float" | "r32float" | "r32uint" | "r32sint";
  readonly binding?: number;
  readonly group?: number;
}
export type ShaderGraphStatement =
  | { readonly op: "store" | "atomicAdd"; readonly resource: string; readonly index: string; readonly value: string }
  | { readonly op: "textureStore"; readonly resource: string; readonly coordinates: string; readonly value: string }
  | { readonly op: "barrier"; readonly scope?: "workgroup" | "storage" }
  | { readonly op: "setOutput"; readonly output: ShaderGraphMaterialOutput; readonly value: string }
  | { readonly op: "if"; readonly condition: string; readonly then: readonly ShaderGraphStatement[]; readonly otherwise?: readonly ShaderGraphStatement[] }
  | { readonly op: "loop"; readonly index: string; readonly count: number; readonly body: readonly ShaderGraphStatement[] };
export type ShaderGraphMaterialOutput = "color" | "normal" | "roughness" | "metalness" | "emissive" | "opacity" | "position";
export interface ShaderGraphDocument {
  readonly version: 1;
  readonly stage: "material" | "compute";
  readonly nodes: readonly ShaderGraphNode[];
  readonly structs?: readonly ShaderGraphStruct[];
  readonly functions?: readonly ShaderGraphFunction[];
  readonly resources?: readonly ShaderGraphResource[];
  readonly outputs?: Partial<Readonly<Record<ShaderGraphMaterialOutput, string>>>;
  /** Discard fragments when final graph alpha is below this threshold. */
  readonly alphaTest?: number;
  /**
   * Compute statements write resources. Material statements may use if/loop and
   * setOutput only; each named output must be initialized in `outputs`. An
   * `output` node reads the current value only in a setOutput for that same
   * channel. Position is evaluated in the vertex stage, other channels in the
   * fragment stage. Material flow is limited to 512 statements, 32 nesting
   * levels and 4096 worst-case steps. Fragment control-flow expressions cannot
   * use implicit texture sampling; sample in an output initializer instead.
   */
  readonly statements?: readonly ShaderGraphStatement[];
  readonly workgroupSize?: readonly [number, number, number];
}
export interface ShaderGraphDiagnostic { readonly code: string; readonly message: string; readonly nodeId?: string; readonly path?: string; }
export class ShaderGraphError extends Error {
  readonly diagnostics: readonly ShaderGraphDiagnostic[];
  constructor(diagnostics: readonly ShaderGraphDiagnostic[]) {
    super(diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
    this.name = "ShaderGraphError";
    this.diagnostics = diagnostics;
  }
}
export interface ShaderGraphBinding extends ShaderGraphResource {
  readonly binding: number;
  readonly group: number;
  readonly shaderName: string;
  readonly samplerBinding?: number;
  /** Minimum WGSL runtime-array binding size, including one element's stride. */
  readonly minBindingSize?: number;
  /**
   * Logical host schema for an aggregate or matrix uniform, or one element of
   * a storage-buffer runtime array, with original field names. Derive an array
   * layout for the desired element count when packing a storage buffer.
   */
  readonly dataType?: ShaderDataType;
}
export interface ShaderGraphStageData {
  readonly statements: readonly string[];
  readonly outputs: Readonly<Partial<Record<ShaderGraphMaterialOutput, string>>>;
  readonly declarations?: readonly string[];
}
export interface ShaderGraphStorageStageBinding {
  readonly name: string;
  readonly visibility: "vertex" | "fragment" | "vertex-fragment";
}
export interface ShaderGraphCompileResult {
  readonly target: ShaderGraphTarget;
  readonly stage: "material" | "compute";
  /** Canonical graph representation; changes whenever a shader-affecting input changes. */
  readonly key: string;
  readonly bindings: readonly ShaderGraphBinding[];
  readonly vertex?: string;
  readonly fragment?: string;
  /** Paired post-displacement shadow stages when position or skinning is used. */
  readonly depth?: { readonly vertex: string; readonly fragment: string };
  readonly compute?: string;
  /** Material storage resources reachable from the actual forward and depth stages. */
  readonly storageStages?: { readonly forward: readonly ShaderGraphStorageStageBinding[]; readonly depth: readonly ShaderGraphStorageStageBinding[] };
  /** Surface hooks must be inserted into the renderer's lit-material program. */
  readonly material?: { readonly vertex: ShaderGraphStageData; readonly fragment: ShaderGraphStageData; readonly outputTypes: Readonly<Partial<Record<ShaderGraphMaterialOutput, ShaderGraphValueType>>>; readonly varyings: readonly ShaderGraphBuiltin[]; readonly builtins: readonly ShaderGraphBuiltin[]; readonly requiresLighting: boolean; readonly alphaTest?: number };
  /** Exact expressions by node id, useful for source diagnostics and editor inspection. */
  readonly nodeSources: Readonly<Record<string, string>>;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["if", "else", "for", "while", "loop", "switch", "case", "break", "continue", "return", "discard", "true", "false", "var", "let", "const", "override", "fn", "struct", "uniform", "buffer", "in", "out", "attribute", "varying", "void", "float", "int", "uint", "bool", "sampler", "texture", "main"]);
const TYPES: readonly ShaderGraphValueType[] = ["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4", "uvec3"];
const BUILTINS: Readonly<Record<ShaderGraphBuiltin, ShaderGraphValueType>> = {
  positionLocal: "vec3", positionWorld: "vec3", normalLocal: "vec3", normalWorld: "vec3", uv0: "vec2", uv1: "vec2",
  time: "f32", cameraPosition: "vec3", viewportUV: "vec2", depth: "f32", globalInvocationId: "uvec3", localInvocationId: "uvec3", workgroupId: "uvec3"
};
const OUTPUTS: Readonly<Record<ShaderGraphMaterialOutput, readonly ShaderGraphValueType[]>> = {
  color: ["vec3", "vec4"], normal: ["vec3"], roughness: ["f32"], metalness: ["f32"], emissive: ["vec3"], opacity: ["f32"], position: ["vec3"]
};
const ARITY: Readonly<Record<ShaderGraphOperation, number | "construct" | "dynamic">> = {
  constant: 0, input: 0, uniform: 0, local: 0, output: 0, construct: "construct", swizzle: 1, textureSample: 1, storageLoad: 1, textureLoad: 1,
  structConstruct: "dynamic", structField: 1, arrayIndex: 2, parameter: 0, call: "dynamic", noise: 1,
  add: 2, sub: 2, mul: 2, div: 2, mod: 2, min: 2, max: 2, pow: 2, dot: 2, cross: 2, distance: 2, atan2: 2, step: 2,
  sin: 1, cos: 1, tan: 1, abs: 1, sign: 1, sqrt: 1, exp: 1, log: 1, fract: 1, floor: 1, ceil: 1,
  saturate: 1, oneMinus: 1, negate: 1, normalize: 1, length: 1, mix: 3, smoothstep: 3, clamp: 3, select: 3, less: 2, greater: 2, equal: 2
};
const WIDTH: Readonly<Record<ShaderGraphValueType, number>> = { f32: 1, i32: 1, u32: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, uvec3: 3 };
const isFloat = (type: ShaderGraphValueType): boolean => type === "f32" || type === "vec2" || type === "vec3" || type === "vec4";
const isInt = (type: ShaderGraphValueType): boolean => type === "i32" || type === "u32";
const isVector = (type: ShaderGraphValueType): boolean => type === "vec2" || type === "vec3" || type === "vec4" || type === "uvec3";
const BUILTIN_VERTEX = new Set<ShaderGraphBuiltin>(["positionLocal", "positionWorld", "normalLocal", "normalWorld", "uv0", "uv1"]);
const COMPUTE_BUILTINS = new Set<ShaderGraphBuiltin>(["globalInvocationId", "localInvocationId", "workgroupId"]);
const FRAGMENT_ONLY = new Set<ShaderGraphBuiltin>(["viewportUV", "depth"]);
const isSampledTexture = (kind: ShaderGraphResource["kind"]): boolean => kind === "texture2d" || kind === "texture3d" || kind === "depth2d";
const usesSampler = (kind: ShaderGraphResource["kind"]): boolean => kind === "texture2d" || kind === "texture3d";
const isFloatStorageTexture = (resource: ShaderGraphResource): boolean => resource.kind === "storage-texture" && ["rgba8unorm", "rgba16float", "rgba32float", "r32float"].includes(resource.format ?? "");

type MaterialGraphStage = "vertex" | "fragment";
const materialOutputStage = (output: ShaderGraphMaterialOutput): MaterialGraphStage => output === "position" ? "vertex" : "fragment";
const MATERIAL_STATEMENT_LIMIT = 512;
const MATERIAL_NESTING_LIMIT = 32;
const MATERIAL_EXECUTION_LIMIT = 4096;
const MATERIAL_SOURCE_LIMIT = 1_000_000;

/** Called only after statement validation; preserve order and lexical nesting. */
function selectMaterialStatements(
  statements: readonly ShaderGraphStatement[],
  includes: (output: ShaderGraphMaterialOutput) => boolean
): ShaderGraphStatement[] {
  return statements.flatMap((statement): ShaderGraphStatement[] => {
    if (statement.op === "setOutput") return includes(statement.output) ? [statement] : [];
    if (statement.op === "if") {
      const then = selectMaterialStatements(statement.then, includes);
      const otherwise = statement.otherwise === undefined ? undefined : selectMaterialStatements(statement.otherwise, includes);
      return then.length || otherwise?.length
        ? [{ ...statement, then, ...(otherwise === undefined ? {} : { otherwise }) }]
        : [];
    }
    if (statement.op === "loop") {
      const body = selectMaterialStatements(statement.body, includes);
      return body.length ? [{ ...statement, body }] : [];
    }
    return [];
  });
}

/** Expression roots of an already validated and selected material program. */
function materialStatementRoots(statements: readonly ShaderGraphStatement[]): string[] {
  return statements.flatMap((statement): string[] => {
    if (statement.op === "setOutput") return [statement.value];
    if (statement.op === "if") return [statement.condition, ...materialStatementRoots(statement.then), ...materialStatementRoots(statement.otherwise ?? [])];
    if (statement.op === "loop") return materialStatementRoots(statement.body);
    return [];
  });
}

function materialStatementOutputs(statements: readonly ShaderGraphStatement[]): Set<ShaderGraphMaterialOutput> {
  const outputs = new Set<ShaderGraphMaterialOutput>();
  const visit = (entries: readonly ShaderGraphStatement[]): void => {
    for (const statement of entries) {
      if (statement.op === "setOutput") outputs.add(statement.output);
      else if (statement.op === "if") { visit(statement.then); visit(statement.otherwise ?? []); }
      else if (statement.op === "loop") visit(statement.body);
    }
  };
  visit(statements);
  return outputs;
}

function validIdentifier(name: unknown): name is string { return typeof name === "string" && IDENTIFIER.test(name) && !name.startsWith("gl_") && !RESERVED.has(name); }
function numberOk(value: unknown, type: ShaderGraphValueType): boolean {
  if (type === "bool") return typeof value === "boolean";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (type === "i32") return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  if (type === "u32" || type === "uvec3") return Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (matrixType(type)) return Number.isFinite(Math.fround(value));
  return true;
}
function graphKey(value: unknown): string {
  // Objects sorted recursively so caller property order does not change shader identity.
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical) : input && typeof input === "object"
    ? Object.fromEntries(Object.keys(input as object).sort().map((key) => [key, canonical((input as Record<string, unknown>)[key])])) : input;
  return JSON.stringify(canonical(value));
}

interface ShaderGraphDefinitions {
  readonly structs: Map<string, ShaderGraphStruct>;
  readonly functions: Map<string, ShaderGraphFunction>;
}
interface ShaderGraphScope {
  readonly definitions: ShaderGraphDefinitions;
  readonly parameters: ReadonlyMap<string, ShaderGraphValueType>;
}
type ShaderGraphAddDiagnostic = (code: string, message: string, nodeId?: string, path?: string) => void;

function structName(type: unknown): string | undefined {
  return typeof type === "string" && type.startsWith("struct:") ? type.slice(7) : undefined;
}
function arrayType(type: unknown): { readonly length: number; readonly element: ShaderGraphValueType } | undefined {
  if (typeof type !== "string") return undefined;
  const match = /^array:([1-9]\d*):(.+)$/.exec(type);
  if (!match) return undefined;
  const length = Number(match[1]);
  if (!Number.isSafeInteger(length) || length > 65536) return undefined;
  return { length, element: match[2] as ShaderGraphValueType };
}
function matrixType(type: unknown): { readonly columns: 2 | 3 | 4; readonly rows: 2 | 3 | 4 } | undefined {
  if (typeof type !== "string") return undefined;
  const match = /^mat([234])(?:x([234]))?$/.exec(type);
  if (!match) return undefined;
  return { columns: Number(match[1]) as 2 | 3 | 4, rows: Number(match[2] ?? match[1]) as 2 | 3 | 4 };
}
function validMatrixProduct(left: ShaderGraphValueType | undefined, right: ShaderGraphValueType | undefined, result: ShaderGraphValueType): boolean {
  const a = matrixType(left), b = matrixType(right), out = matrixType(result);
  if (a && b) return a.columns === b.rows && out?.columns === b.columns && out.rows === a.rows;
  if (a && right === "f32") return out?.columns === a.columns && out.rows === a.rows;
  if (b && left === "f32") return out?.columns === b.columns && out.rows === b.rows;
  if (a) return right === `vec${a.columns}` && result === `vec${a.rows}`;
  if (b) return left === `vec${b.rows}` && result === `vec${b.columns}`;
  return false;
}
function aggregateType(type: unknown): boolean {
  return structName(type) !== undefined || arrayType(type) !== undefined;
}
function nestedStructName(type: unknown): string | undefined {
  let current = type;
  for (let depth = 0; depth < 32; depth++) {
    const array = arrayType(current);
    if (!array) return structName(current);
    current = array.element;
  }
  return undefined;
}
function hasNestedArray(type: unknown): boolean {
  const outer = arrayType(type);
  return outer !== undefined && arrayType(outer.element) !== undefined;
}
function graphSymbol(name: string): string {
  return `v${name.replace(/_/g, "_0")}`;
}
function validValueType(type: unknown, structs: ReadonlyMap<string, ShaderGraphStruct>, depth = 0): type is ShaderGraphValueType {
  if (typeof type !== "string") return false;
  if (depth > 32) return false;
  if (TYPES.includes(type as ShaderGraphValueType)) return true;
  if (matrixType(type)) return true;
  const array = arrayType(type);
  if (array) return validValueType(array.element, structs, depth + 1);
  const name = structName(type);
  return name !== undefined && validIdentifier(name) && structs.has(name);
}
/** Translate the nominal graph types to the existing recursive host layout. */
function graphDataType(type: ShaderGraphValueType, structs: ReadonlyMap<string, ShaderGraphStruct>): ShaderDataType {
  const array = arrayType(type);
  if (array) return { kind: "array", length: array.length, element: graphDataType(array.element, structs) };
  const name = structName(type);
  if (name !== undefined) return {
    kind: "struct",
    fields: structs.get(name)!.fields.map((field) => ({ name: field.name, type: graphDataType(field.type, structs) }))
  };
  const matrix = matrixType(type);
  if (matrix) return { kind: "matrix", ...matrix };
  if (type === "vec2" || type === "vec3" || type === "vec4") {
    return { kind: "vector", element: "f32", length: Number(type.slice(3)) as 2 | 3 | 4 };
  }
  if (type === "uvec3") return { kind: "vector", element: "u32", length: 3 };
  return type as "f32" | "i32" | "u32" | "bool";
}
// Unlike graph-local fields (which are mangled), host schema fields appear
// verbatim in WGSL and must also be accepted by the portable device binder.
const UNIFORM_FIELD_RESERVED = new Set(("alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if let loop override requires return struct switch true var while _ NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become binding_array cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debug debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instance_of interface layout lowp macro match mat mediump meta mod module move mut mutable namespace new nil noinline nointerpolation noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std stride subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield bool f32 i32 u32 vec2 vec3 vec4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4").split(" "));
function validUniformFieldName(name: unknown): name is string {
  return typeof name === "string" && IDENTIFIER.test(name) && !name.startsWith("__") && !UNIFORM_FIELD_RESERVED.has(name);
}
function uniformFieldNamesValid(type: ShaderGraphValueType, structs: ReadonlyMap<string, ShaderGraphStruct>, seen = new Set<string>()): boolean {
  const array = arrayType(type);
  if (array) return uniformFieldNamesValid(array.element, structs, seen);
  const name = structName(type);
  if (name === undefined) return true;
  if (seen.has(name)) return false;
  const declaration = structs.get(name);
  if (!declaration || !Array.isArray(declaration.fields)) return false;
  const next = new Set(seen).add(name);
  return declaration.fields.every((field) => field && validUniformFieldName(field.name)
    && validValueType(field.type, structs) && uniformFieldNamesValid(field.type, structs, next));
}
const MAX_UNIFORM_SCHEMA_NODES = 4096;
const MAX_UNIFORM_SCHEMA_DEPTH = 128;
function uniformSchemaSize(type: ShaderGraphValueType, structs: ReadonlyMap<string, ShaderGraphStruct>): number {
  const counts = new Map<string, number>();
  const active = new Set<ShaderGraphValueType>();
  const visit = (current: ShaderGraphValueType, depth: number): number => {
    if (depth > MAX_UNIFORM_SCHEMA_DEPTH) return MAX_UNIFORM_SCHEMA_NODES + 1;
    const key = `${depth}:${current}`;
    const cached = counts.get(key);
    if (cached !== undefined) return cached;
    if (active.has(current)) return 0;
    active.add(current);
    let size = 1;
    const array = arrayType(current);
    const name = structName(current);
    if (array) {
      size += visit(array.element, depth + 1);
    } else if (name !== undefined) {
      const fields = structs.get(name)?.fields;
      if (Array.isArray(fields)) for (const field of fields) {
        if (field && validValueType(field.type, structs)) size += visit(field.type, depth + 1);
        if (size > MAX_UNIFORM_SCHEMA_NODES) break;
      }
    }
    active.delete(current);
    counts.set(key, size);
    return size;
  };
  return visit(type, 0);
}
function storageValueType(type: ShaderGraphValueType, structs: ReadonlyMap<string, ShaderGraphStruct>, seen = new Set<string>()): boolean {
  if (type === "bool") return false;
  const array = arrayType(type);
  if (array) return storageValueType(array.element, structs, seen);
  const name = structName(type);
  if (name === undefined) return TYPES.includes(type) || matrixType(type) !== undefined;
  if (seen.has(name)) return false;
  const declaration = structs.get(name);
  if (!declaration || !Array.isArray(declaration.fields)) return false;
  const next = new Set(seen).add(name);
  return declaration.fields.every((field) => field && validValueType(field.type, structs) && storageValueType(field.type, structs, next));
}
function graphDefinitions(graph: ShaderGraphDocument, add: ShaderGraphAddDiagnostic): ShaderGraphDefinitions {
  const structs = new Map<string, ShaderGraphStruct>();
  const functions = new Map<string, ShaderGraphFunction>();
  if (graph.structs !== undefined && !Array.isArray(graph.structs)) add("invalid-struct", "structs must be an array", undefined, "structs");
  const structEntries = Array.isArray(graph.structs) ? graph.structs : [];
  if (structEntries.length > 128) add("graph-limit", "graph exceeds the 128-struct limit", undefined, "structs");
  for (let i = 0; i < Math.min(structEntries.length, 128); i++) {
    const value = structEntries[i];
    const path = `structs[${i}]`;
    if (!Object.hasOwn(structEntries, i) || !value || typeof value !== "object" || !validIdentifier(value.name)) {
      add("invalid-struct", "struct must have a valid name", undefined, path);
      continue;
    }
    if (structs.has(value.name)) add("duplicate-struct", `struct ${value.name} is declared twice`, undefined, path);
    else structs.set(value.name, value);
  }
  for (let i = 0; i < Math.min(structEntries.length, 128); i++) {
    const value = structEntries[i];
    if (!value || typeof value !== "object" || !validIdentifier(value.name)) continue;
    const path = `structs[${i}].fields`;
    if (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.length > 64) {
      add("invalid-struct", `struct ${value.name} needs 1..64 fields`, undefined, path);
      continue;
    }
    const names = new Set<string>();
    for (let j = 0; j < value.fields.length; j++) {
      const field = value.fields[j];
      const fieldPath = `${path}[${j}]`;
      if (!Object.hasOwn(value.fields, j) || !field || typeof field !== "object" || !validIdentifier(field.name)) {
        add("invalid-field", `struct ${value.name} has an invalid field`, undefined, fieldPath);
        continue;
      }
      if (names.has(field.name)) add("duplicate-field", `struct ${value.name} repeats field ${field.name}`, undefined, fieldPath);
      names.add(field.name);
      if (!validValueType(field.type, structs)) add("invalid-type", `field ${value.name}.${field.name} has an unknown type`, undefined, `${fieldPath}.type`);
    }
  }
  const structColors = new Map<string, number>();
  const visitStruct = (name: string): void => {
    if (structColors.get(name) === 1) { add("struct-cycle", `recursive struct ${name} is not supported`); return; }
    if (structColors.get(name) === 2) return;
    const value = structs.get(name);
    if (!value) return;
    structColors.set(name, 1);
    if (Array.isArray(value.fields)) for (const field of value.fields) {
      const dependency = field && nestedStructName(field.type);
      if (dependency && structs.has(dependency)) visitStruct(dependency);
    }
    structColors.set(name, 2);
  };
  for (const name of structs.keys()) visitStruct(name);
  if (graph.functions !== undefined && !Array.isArray(graph.functions)) add("invalid-function", "functions must be an array", undefined, "functions");
  const functionEntries = Array.isArray(graph.functions) ? graph.functions : [];
  if (functionEntries.length > 128) add("graph-limit", "graph exceeds the 128-function limit", undefined, "functions");
  let nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  for (let i = 0; i < Math.min(functionEntries.length, 128); i++) {
    const value = functionEntries[i];
    const path = `functions[${i}]`;
    if (!Object.hasOwn(functionEntries, i) || !value || typeof value !== "object" || !validIdentifier(value.name)) {
      add("invalid-function", "function must have a valid name", undefined, path);
      continue;
    }
    if (functions.has(value.name)) add("duplicate-function", `function ${value.name} is declared twice`, undefined, path);
    else functions.set(value.name, value);
    if (!Array.isArray(value.parameters) || value.parameters.length > 32) add("invalid-function", `function ${value.name} needs at most 32 parameters`, undefined, `${path}.parameters`);
    else {
      const names = new Set<string>();
      for (let j = 0; j < value.parameters.length; j++) {
        const parameter = value.parameters[j];
        const parameterPath = `${path}.parameters[${j}]`;
        if (!Object.hasOwn(value.parameters, j) || !parameter || typeof parameter !== "object" || !validIdentifier(parameter.name)) {
          add("invalid-function", `function ${value.name} has an invalid parameter`, undefined, parameterPath);
          continue;
        }
        if (names.has(parameter.name)) add("duplicate-parameter", `function ${value.name} repeats parameter ${parameter.name}`, undefined, parameterPath);
        names.add(parameter.name);
        if (!validValueType(parameter.type, structs)) add("invalid-type", `function parameter ${parameter.name} has an unknown type`, undefined, `${parameterPath}.type`);
      }
    }
    if (!validValueType(value.returnType, structs)) add("invalid-type", `function ${value.name} has an unknown return type`, undefined, `${path}.returnType`);
    if (arrayType(value.returnType) || (Array.isArray(value.parameters) && value.parameters.some((parameter: ShaderGraphFunctionParameter) => parameter && arrayType(parameter.type)))) {
      add("unsupported-type", `function ${value.name} cannot pass or return an array directly`, undefined, path);
    }
    if (!Array.isArray(value.nodes)) add("invalid-nodes", `function ${value.name} nodes must be an array`, undefined, `${path}.nodes`);
    else nodeCount += value.nodes.length;
    if (typeof value.output !== "string") add("invalid-function", `function ${value.name} needs an output node id`, undefined, `${path}.output`);
  }
  if (nodeCount > 512) add("graph-limit", "graph and function bodies exceed the 512-node limit");
  const functionColors = new Map<string, number>();
  const visitFunction = (name: string): void => {
    if (functionColors.get(name) === 1) { add("function-cycle", `recursive function ${name} is not supported`); return; }
    if (functionColors.get(name) === 2) return;
    const value = functions.get(name);
    if (!value) return;
    functionColors.set(name, 1);
    if (Array.isArray(value.nodes)) for (const node of value.nodes) {
      if (node && node.op === "call" && typeof node.name === "string" && functions.has(node.name)) visitFunction(node.name);
    }
    functionColors.set(name, 2);
  };
  for (const name of functions.keys()) visitFunction(name);
  return { structs, functions };
}

/** Validate the whole graph, including unreachable nodes and nested statements. */
export function validateShaderGraph(graph: ShaderGraphDocument, target?: ShaderGraphTarget): readonly ShaderGraphDiagnostic[] {
  return validateShaderGraphScope(graph, target);
}
function validateShaderGraphScope(graph: ShaderGraphDocument, target?: ShaderGraphTarget, scope?: ShaderGraphScope): readonly ShaderGraphDiagnostic[] {
  const errors: ShaderGraphDiagnostic[] = [];
  const add = (code: string, message: string, nodeId?: string, path?: string): void => { errors.push({ code, message, ...(nodeId ? { nodeId } : {}), ...(path ? { path } : {}) }); };
  if (!graph || typeof graph !== "object") return [{ code: "invalid-graph", message: "graph must be an object" }];
  if (graph.version !== 1) add("invalid-version", "graph version must be 1", undefined, "version");
  if (graph.stage !== "material" && graph.stage !== "compute") add("invalid-stage", "stage must be material or compute", undefined, "stage");
  if (target !== undefined && target !== "glsl" && target !== "wgsl") add("invalid-target", `unknown shader target ${String(target)}`);
  if (graph.stage === "compute" && target === "glsl") add("unsupported-backend", "WebGL2 has no compute shader stage");
  const definitions = scope?.definitions ?? graphDefinitions(graph, add);
  if (!scope && target === "glsl") {
    for (const declaration of definitions.structs.values()) if (Array.isArray(declaration.fields)) {
      for (const field of declaration.fields) if (field && hasNestedArray(field.type)) {
        add("unsupported-backend", `WebGL2 GLSL ES 3.00 does not support nested array field ${declaration.name}.${field.name}`);
      }
    }
    if (Array.isArray(graph.resources)) for (const resource of graph.resources) {
      if (resource && hasNestedArray(resource.type)) add("unsupported-backend", `WebGL2 GLSL ES 3.00 does not support nested array resource ${resource.name}`);
    }
  }
  const nodes: readonly ShaderGraphNode[] = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (!Array.isArray(graph.nodes)) add("invalid-nodes", "nodes must be an array", undefined, "nodes");
  if (nodes.length > 512) return [{ code: "graph-limit", message: "graph exceeds the 512-node limit" }];
  const byId = new Map<string, ShaderGraphNode>();
  const nodePaths = new Map<string, string>();
  for (let index = 0; index < nodes.length; index++) {
    const path = `nodes[${index}]`;
    if (!Object.hasOwn(nodes, index)) { add("invalid-node-id", "node array must not be sparse", undefined, path); continue; }
    const node = nodes[index];
    if (!node || typeof node !== "object" || !validIdentifier(node.id)) { add("invalid-node-id", "node id must be an identifier", undefined, path); continue; }
    if (byId.has(node.id)) { add("duplicate-node", `node ${node.id} is declared twice`, node.id, path); continue; }
    byId.set(node.id, node);
    nodePaths.set(node.id, path);
    if (!validValueType(node.type, definitions.structs)) add("invalid-type", `node ${node.id} has unsupported type ${String(node.type)}`, node.id);
    const inputs = node.inputs === undefined ? [] : node.inputs;
    if (!Array.isArray(inputs)) add("invalid-inputs", `inputs for ${node.id} must be an array`, node.id, `${path}.inputs`);
    else for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
      if (!Object.hasOwn(inputs, inputIndex) || typeof inputs[inputIndex] !== "string") {
        add("invalid-inputs", `input ${inputIndex} for ${node.id} must be a node id string`, node.id, `${path}.inputs[${inputIndex}]`);
      }
    }
    const op: unknown = node.op;
    if (typeof op !== "string") { add("unsupported-operation", `operation for ${node.id} must be a string`, node.id, `${path}.op`); continue; }
    if (!Object.hasOwn(ARITY, op)) { add("unsupported-operation", `node ${node.id} has unsupported operation ${op}`, node.id, `${path}.op`); continue; }
    if (scope && ["input", "uniform", "local", "output", "textureSample", "storageLoad", "textureLoad"].includes(op)) {
      add("invalid-scope", `function bodies must receive ${op} values through parameters`, node.id, path);
    }
    if (!Array.isArray(inputs)) continue;
    const arity = ARITY[op as ShaderGraphOperation];
    if (arity === "construct" ? inputs.length < 1 : arity !== "dynamic" && inputs.length !== arity) add("invalid-arity", `${op} requires ${arity === "construct" ? "at least one" : arity} input(s), got ${inputs.length}`, node.id);
  }
  const resources = new Map<string, ShaderGraphResource>();
  const bindings = new Set<string>();
  let nextBinding = 0;
  let nextMaterialStorage = 0;
  if (graph.resources !== undefined && !Array.isArray(graph.resources)) add("invalid-resources", "resources must be an array", undefined, "resources");
  const resourceEntries = Array.isArray(graph.resources) ? graph.resources : [];
  for (let index = 0; index < resourceEntries.length; index++) {
    const path = `resources[${index}]`;
    if (!Object.hasOwn(resourceEntries, index)) { add("invalid-resource", "resource array must not be sparse", undefined, path); continue; }
    const resource = resourceEntries[index];
    if (!resource || !validIdentifier(resource.name)) { add("invalid-resource", "resource name must be an identifier", undefined, path); continue; }
    if (resources.has(resource.name)) add("duplicate-resource", `resource ${resource.name} is declared twice`);
    resources.set(resource.name, resource);
    if (!["uniform", "texture2d", "texture3d", "depth2d", "storage-buffer", "storage-texture"].includes(resource.kind)) add("invalid-resource", `resource ${resource.name} has invalid kind`);
    if (isSampledTexture(resource.kind) && (resource.type !== undefined || resource.format !== undefined || resource.access !== undefined)) add("invalid-resource", `${resource.kind} ${resource.name} cannot declare type, format or storage access`);
    if (resource.kind === "uniform" && (resource.format !== undefined || resource.access !== undefined)) add("invalid-resource", `uniform ${resource.name} cannot declare a texture format or storage access`);
    if (resource.kind === "storage-buffer" && resource.format !== undefined) add("invalid-resource", `storage buffer ${resource.name} cannot declare a texture format`);
    if (resource.kind === "storage-texture" && resource.type !== undefined) add("invalid-resource", `storage texture ${resource.name} uses its format, not a value type`);
    if (graph.stage === "material" && (resource.kind === "uniform" || isSampledTexture(resource.kind))) {
      if (resource.kind === "uniform" && resource.type === "uvec3") add("invalid-resource", `material uniform ${resource.name} uses unsupported portable type uvec3`);
    }
    if (resource.kind === "uniform") {
      if (!resource.type || !validValueType(resource.type, definitions.structs)) {
        add("invalid-resource", `uniform ${resource.name} needs a valid scalar, vector, matrix, array or struct type`);
      } else if (aggregateType(resource.type) || matrixType(resource.type)) {
        if (uniformSchemaSize(resource.type, definitions.structs) > MAX_UNIFORM_SCHEMA_NODES) {
          add("graph-limit", `uniform ${resource.name} schema exceeds the ${MAX_UNIFORM_SCHEMA_NODES}-node expansion or ${MAX_UNIFORM_SCHEMA_DEPTH}-level nesting limit`);
        } else if (!uniformFieldNamesValid(resource.type, definitions.structs)) {
          add("invalid-resource", `uniform ${resource.name} needs acyclic structs with host-shareable WGSL field names`);
        } else {
          try {
            // This also checks the complete recursive schema and its byte-size
            // arithmetic, rather than admitting an unrepresentable buffer.
            const layout: UniformBlockLayout = { name: "GraphValidation", group: 0, binding: 0, members: [{ name: "value", type: graphDataType(resource.type, definitions.structs) }] };
            if (graph.stage === "material" && target !== "wgsl") deriveUniformDataLayout(layout, "glsl-std140");
            if (target !== "glsl") deriveUniformDataLayout(layout, "wgsl-uniform");
          } catch (error) {
            add("invalid-resource", `uniform ${resource.name} has an invalid layout: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    if (resource.kind === "storage-buffer") {
      if (!resource.type || !validValueType(resource.type, definitions.structs)) {
        add("invalid-resource", `storage-buffer ${resource.name} needs a valid host-shareable type`);
      } else if (uniformSchemaSize(resource.type, definitions.structs) > MAX_UNIFORM_SCHEMA_NODES) {
        add("graph-limit", `storage-buffer ${resource.name} schema exceeds the ${MAX_UNIFORM_SCHEMA_NODES}-node expansion or ${MAX_UNIFORM_SCHEMA_DEPTH}-level nesting limit`);
      } else if (!storageValueType(resource.type, definitions.structs)) {
        add("invalid-resource", `storage-buffer ${resource.name} needs a valid host-shareable type`);
      } else {
        try {
          // The shader declares a runtime array, so validate the element's
          // storage stride as well as its fields and matrix-column stride.
          deriveShaderDataLayout({ kind: "array", element: graphDataType(resource.type, definitions.structs), length: 1 }, "wgsl-storage");
        } catch (error) {
          add("invalid-resource", `storage-buffer ${resource.name} has an invalid layout: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (resource.kind === "storage-texture" && !["rgba8unorm", "rgba16float", "rgba32float", "r32float", "r32uint", "r32sint"].includes(resource.format ?? "")) add("invalid-resource", `storage texture ${resource.name} needs a supported format`);
    if (resource.access !== undefined && !["read", "write", "read_write"].includes(resource.access)) add("invalid-resource", `resource ${resource.name} has invalid access`);
    const portable = graph.stage === "material" && (resource.kind === "uniform" || isSampledTexture(resource.kind));
    if (portable && (resource.binding !== undefined || resource.group !== undefined)) add("invalid-binding", `material ${resource.kind} ${resource.name} uses the portable binding layout and cannot specify group or binding`);
    const materialStorage = graph.stage === "material" && !portable;
    const binding = resource.binding ?? (materialStorage ? nextMaterialStorage : nextBinding);
    const slots = graph.stage === "compute" && usesSampler(resource.kind) ? 2 : 1;
    if (materialStorage) nextMaterialStorage = Math.max(nextMaterialStorage, binding + slots);
    else nextBinding = Math.max(nextBinding, binding + slots);
    const group = resource.group ?? (graph.stage === "material" && typeof resource.kind === "string" && resource.kind.startsWith("storage-") ? 1 : 0);
    if (!Number.isSafeInteger(binding) || binding < 0 || !Number.isSafeInteger(group) || group < 0) add("invalid-binding", `${resource.name} needs non-negative integer group and binding`);
    if (materialStorage && group === 0) add("invalid-binding", `${resource.name} cannot use group 0, which the portable material layout owns`);
    if (materialStorage && resource.access !== "read") add("invalid-resource", `${resource.name} must be read-only in a material graph; write it in a compute graph`);
    for (let offset = 0; !portable && offset < slots; offset++) {
      const key = `${group}:${binding + offset}`;
      if (bindings.has(key)) add("duplicate-binding", `binding ${key} is declared more than once`);
      bindings.add(key);
    }
    if (target === "glsl" && (resource.kind === "storage-buffer" || resource.kind === "storage-texture")) add("unsupported-backend", `WebGL2 does not support ${resource.kind} ${resource.name}`);
  }
  // Edges and cycles are checked independently of the selected outputs.
  const colors = new Map<string, number>();
  const visit = (id: string): void => {
    if (colors.get(id) === 1) { add("cycle", `cycle includes node ${id}`, id); return; }
    if (colors.get(id) === 2) return;
    const node = byId.get(id); if (!node) return;
    colors.set(id, 1);
    const inputs = Array.isArray(node.inputs) ? node.inputs : [];
    for (let index = 0; index < inputs.length; index++) {
      if (!Object.hasOwn(inputs, index) || typeof inputs[index] !== "string") continue;
      const dep = inputs[index]!;
      if (!byId.has(dep)) add("missing-node", `node ${id} references missing node ${dep}`, id, `${nodePaths.get(id)}.inputs[${index}]`);
      else visit(dep);
    }
    colors.set(id, 2);
  };
  for (const node of byId.values()) visit(node.id);
  // WGSL uniform structs containing padded arrays are a distinct physical
  // type. Only field/index paths are portable; copying an entire aggregate
  // into a graph struct or function would silently change its shader type.
  const uniformPath = (id: string, active = new Set<string>()): boolean => {
    if (active.has(id)) return false;
    const node = byId.get(id);
    if (!node) return false;
    if (node.op === "uniform") return aggregateType(node.type);
    if ((node.op === "structField" || node.op === "arrayIndex") && Array.isArray(node.inputs) && typeof node.inputs[0] === "string") {
      return uniformPath(node.inputs[0], new Set(active).add(id));
    }
    return false;
  };
  for (const node of byId.values()) {
    if (typeof node.op !== "string" || !Object.hasOwn(ARITY, node.op) || !validValueType(node.type, definitions.structs) ||
        (node.inputs !== undefined && !Array.isArray(node.inputs))) continue;
    const inputs = node.inputs ?? [];
    let invalidInput = false;
    for (let index = 0; index < inputs.length; index++) {
      if (!Object.hasOwn(inputs, index) || typeof inputs[index] !== "string") { invalidInput = true; break; }
    }
    if (invalidInput) continue;
    const args = inputs.map((id) => byId.get(id));
    if (args.some((arg) => !arg)) continue;
    const types = args.map((arg) => arg!.type);
    if (types.some((type) => !validValueType(type, definitions.structs))) continue;
    const mismatch = (description: string, path?: string): void => add("type-mismatch", `${node.id}: ${description}`, node.id, path);
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      if (aggregateType(arg.type) && uniformPath(arg.id)
        && !(index === 0 && (node.op === "structField" || node.op === "arrayIndex"))) {
        add("unsupported-uniform-access", `uniform aggregate ${arg.id} must be accessed through fields and indices, not passed as a value`, node.id);
      }
    }
    const resource = node.resource ? resources.get(node.resource) : undefined;
    switch (node.op) {
      case "constant": {
        if (aggregateType(node.type)) { mismatch("aggregate values cannot be literal constants"); break; }
        const components = Array.isArray(node.value) ? node.value : [node.value];
        const matrix = matrixType(node.type);
        const width = matrix ? matrix.columns * matrix.rows : WIDTH[node.type];
        const description = `${node.type} constant needs ${width} valid component(s)`;
        const valuePath = `${nodePaths.get(node.id)}.value`;
        if (components.length !== width) mismatch(description, valuePath);
        for (let index = 0; index < components.length; index++) {
          if (!Object.hasOwn(components, index) || !numberOk(components[index], node.type)) {
            mismatch(description, Array.isArray(node.value) ? `${valuePath}[${index}]` : valuePath);
          }
        }
        break;
      }
      case "input":
        if (!node.name || !Object.hasOwn(BUILTINS, node.name) || BUILTINS[node.name as ShaderGraphBuiltin] !== node.type) mismatch(`input ${String(node.name)} has an invalid builtin or type`);
        else if (graph.stage === "compute" && !COMPUTE_BUILTINS.has(node.name as ShaderGraphBuiltin)) add("invalid-stage", `${node.name} is not available in compute; use an explicit uniform resource`, node.id);
        else if (graph.stage === "material" && COMPUTE_BUILTINS.has(node.name as ShaderGraphBuiltin)) add("invalid-stage", `${node.name} is only available in compute`, node.id);
        break;
      case "local": if (!validIdentifier(node.name) || node.type !== "u32") mismatch("local loop index must have a valid name and u32 type"); break;
      case "output": {
        if (graph.stage !== "material" || scope) {
          add("invalid-scope", "output values are available only in material statements", node.id);
          break;
        }
        const name = node.name;
        const authored = graph.outputs && typeof graph.outputs === "object" && !Array.isArray(graph.outputs) ? graph.outputs : {};
        if (typeof name !== "string" || !Object.hasOwn(OUTPUTS, name) || !Object.hasOwn(authored, name)) {
          add("invalid-output", `${node.id}: output ${String(name)} must be initialized in outputs`, node.id);
          break;
        }
        const initial = byId.get(authored[name as ShaderGraphMaterialOutput] ?? "");
        if (!initial) add("missing-node", `${node.id}: output ${name} has no initial value`, node.id);
        else if (initial.type !== node.type) mismatch(`output ${name} has type ${initial.type}`);
        break;
      }
      case "parameter": {
        if (!scope || !validIdentifier(node.name) || !scope.parameters.has(node.name)) {
          add("invalid-scope", `parameter ${String(node.name)} is not declared in this function`, node.id);
        } else if (scope.parameters.get(node.name) !== node.type) mismatch(`parameter ${node.name} must match its declared type`);
        break;
      }
      case "structConstruct": {
        const name = structName(node.type);
        const declaration = name === undefined ? undefined : definitions.structs.get(name);
        if (!declaration || !Array.isArray(declaration.fields)) { mismatch("structConstruct requires a declared struct result type"); break; }
        if (inputs.length !== declaration.fields.length) add("invalid-arity", `struct ${name} requires ${declaration.fields.length} field value(s), got ${inputs.length}`, node.id);
        for (let index = 0; index < Math.min(types.length, declaration.fields.length); index++) {
          if (declaration.fields[index] && types[index] !== declaration.fields[index]!.type) mismatch(`field ${declaration.fields[index]!.name} requires ${declaration.fields[index]!.type}`);
        }
        break;
      }
      case "structField": {
        const name = structName(types[0]);
        const declaration = name === undefined ? undefined : definitions.structs.get(name);
        if (!declaration || !Array.isArray(declaration.fields)) { mismatch("structField requires a declared struct input"); break; }
        const field = declaration.fields.find((entry) => entry && entry.name === node.name);
        if (!field) add("invalid-field", `struct ${name} has no field ${String(node.name)}`, node.id);
        else if (field.type !== node.type) mismatch(`field ${field.name} has type ${field.type}`);
        break;
      }
      case "arrayIndex": {
        const array = arrayType(types[0]);
        if (!array) { mismatch("arrayIndex requires a fixed array input"); break; }
        if (!isInt(types[1]!)) mismatch("arrayIndex requires an i32 or u32 index");
        if (node.type !== array.element) mismatch(`arrayIndex returns ${array.element}`);
        const index = args[1];
        const value = index?.op === "constant"
          ? Array.isArray(index.value) && index.value.length === 1 ? index.value[0] : index.value
          : undefined;
        if (typeof value === "number" && (value < 0 || value >= array.length)) {
          add("index-out-of-bounds", `arrayIndex ${node.id} has a constant index outside 0..${array.length - 1}`, node.id);
        }
        break;
      }
      case "call": {
        const declaration = typeof node.name === "string" ? definitions.functions.get(node.name) : undefined;
        if (!declaration) { add("missing-function", `function ${String(node.name)} is not declared`, node.id); break; }
        if (declaration.returnType !== node.type) mismatch(`function ${declaration.name} returns ${declaration.returnType}`);
        if (Array.isArray(declaration.parameters)) {
          if (inputs.length !== declaration.parameters.length) add("invalid-arity", `function ${declaration.name} requires ${declaration.parameters.length} argument(s), got ${inputs.length}`, node.id);
          for (let index = 0; index < Math.min(types.length, declaration.parameters.length); index++) {
            if (declaration.parameters[index] && types[index] !== declaration.parameters[index]!.type) mismatch(`parameter ${declaration.parameters[index]!.name} requires ${declaration.parameters[index]!.type}`);
          }
        }
        break;
      }
      case "noise":
        if (node.type !== "f32" || !["f32", "vec2", "vec3", "vec4"].includes(types[0] ?? "")) mismatch("noise needs an f32, vec2, vec3 or vec4 coordinate and returns f32");
        break;
      case "uniform": if (!resource || resource.kind !== "uniform" || resource.type !== node.type) mismatch("uniform node must name a uniform with the same type"); break;
      case "textureSample":
        if (!resource || node.type !== "vec4" || !(resource.kind === "texture2d" && types[0] === "vec2" || resource.kind === "texture3d" && types[0] === "vec3")) mismatch("textureSample needs texture2d/vec2 or texture3d/vec3 and returns vec4");
        break;
      case "textureLoad":
        if (!resource || types[0] !== "vec2" || !(resource.kind === "depth2d" && node.type === "f32" || isFloatStorageTexture(resource) && (resource.access ?? "write") !== "write" && node.type === "vec4")) mismatch("textureLoad needs depth2d/vec2 returning f32, or a readable float storage texture/vec2 returning vec4");
        break;
      case "storageLoad": if (!resource || resource.kind !== "storage-buffer" || resource.access === "write" || resource.type !== node.type || !isInt(types[0]!)) mismatch("storageLoad needs a readable storage buffer, integer index and matching type"); break;
      case "swizzle": {
        const comp = node.components ?? ""; const source = types[0];
        if (!source || !isVector(source) || !/^[xyzw]{1,4}$/.test(comp) || [...comp].some((c) => "xyzw".indexOf(c) >= WIDTH[source]) || WIDTH[node.type] !== comp.length || (source === "uvec3" ? node.type !== (comp.length === 1 ? "u32" : "uvec3") : !isFloat(node.type))) mismatch("swizzle components or result type do not match the source vector");
        break;
      }
      case "construct": {
        const matrix = matrixType(node.type);
        if (matrix) {
          if (types.length !== matrix.columns || types.some((type) => type !== `vec${matrix.rows}`)) mismatch("matrix constructor requires one float column vector per column");
        } else if (!isVector(node.type) || types.some((type) => !isFloat(type)) || types.reduce((sum, type) => sum + WIDTH[type], 0) !== WIDTH[node.type]) {
          mismatch("constructor requires float components matching result width");
        }
        break;
      }
      case "dot": if (types[0] !== types[1] || !isVector(types[0]!) || types[0] === "uvec3" || node.type !== "f32") mismatch("dot needs equal float vectors and f32 result"); break;
      case "distance": if (types[0] !== types[1] || !isFloat(types[0]!) || node.type !== "f32") mismatch("distance needs equal float operands and f32 result; expand a scalar with construct"); break;
      case "cross": if (types[0] !== "vec3" || types[1] !== "vec3" || node.type !== "vec3") mismatch("cross needs two vec3 operands and vec3 result"); break;
      case "length": if (!isVector(types[0]!) || types[0] === "uvec3" || node.type !== "f32") mismatch("length needs a float vector and f32 result"); break;
      case "normalize": if (node.type !== types[0] || !isVector(node.type) || node.type === "uvec3") mismatch("normalize needs a float vector and matching result"); break;
      case "less": case "greater": case "equal": if (types[0] !== types[1] || WIDTH[types[0]!] !== 1 || node.type !== "bool" || node.op !== "equal" && types[0] === "bool") mismatch("comparison needs two equal scalar operands and bool result"); break;
      case "select": if (arrayType(node.type) || matrixType(node.type) || types[0] !== "bool" || types[1] !== node.type || types[2] !== node.type) mismatch("select needs a bool condition and two matching non-array, non-matrix values"); break;
      case "sin": case "cos": case "tan": case "sign": case "sqrt": case "exp": case "log": case "fract": case "floor": case "ceil": case "saturate": case "oneMinus":
        if (types[0] !== node.type || !isFloat(node.type)) mismatch(`${node.op} requires a matching float operand and result`); break;
      case "negate": if (types[0] !== node.type || !(isFloat(node.type) || node.type === "i32")) mismatch("negate requires a matching signed numeric operand and result"); break;
      case "abs": if (types[0] !== node.type || !(isFloat(node.type) || node.type === "i32")) mismatch("abs requires matching signed numeric operands"); break;
      case "mod": case "atan2": case "step": case "smoothstep":
        if (types.some((type) => type !== node.type) || !isFloat(node.type)) mismatch(`${node.op} requires equal float operand and result types; expand a scalar with construct`); break;
      case "add": case "sub": case "mul": case "div": case "min": case "max": case "pow": case "mix": case "clamp": {
        if (node.op === "mul" && (matrixType(node.type) || types.some((type) => matrixType(type)))) {
          if (!validMatrixProduct(types[0], types[1], node.type)) mismatch("matrix multiplication requires compatible columns, rows and result type");
          break;
        }
        // Require equal types; callers express scalar expansion with construct nodes.
        if (types.some((type) => type !== node.type) || !(isFloat(node.type) || isInt(node.type)) || (["pow", "mix", "clamp"].includes(node.op) && !isFloat(node.type))) mismatch(`${node.op} requires equal compatible numeric operand and result types`);
        break;
      }
    }
  }
  const outputsValid = graph.outputs === undefined || graph.outputs !== null && typeof graph.outputs === "object" && !Array.isArray(graph.outputs);
  if (!outputsValid) add("invalid-outputs", "outputs must be an object");
  const outputValues = outputsValid ? (graph.outputs ?? {}) : {};
  for (const [key, id] of Object.entries(outputValues)) {
    if (!Object.hasOwn(OUTPUTS, key)) { add("invalid-output", `unknown material output ${key}`); continue; }
    const node = byId.get(id as string);
    if (!node) add("missing-node", `output ${key} references missing node ${String(id)}`, undefined, `outputs.${key}`);
    else if (!OUTPUTS[key as ShaderGraphMaterialOutput].includes(node.type)) add("type-mismatch", `output ${key} cannot use ${node.type}`, node.id, `outputs.${key}`);
  }
  if (graph.stage === "compute" && Object.keys(outputValues).length) add("invalid-output", "compute graphs use statements, not material outputs");
  if (graph.alphaTest !== undefined && (graph.stage !== "material" || typeof graph.alphaTest !== "number" || !Number.isFinite(graph.alphaTest) || graph.alphaTest < 0 || graph.alphaTest > 1)) {
    add("invalid-alpha-test", "alphaTest requires a material graph and a finite threshold in [0, 1]", undefined, "alphaTest");
  }
  if (graph.workgroupSize !== undefined) {
    const size = graph.workgroupSize;
    const message = "workgroupSize must contain three positive integers with product at most 256";
    if (!Array.isArray(size) || size.length !== 3) add("invalid-workgroup-size", message, undefined, "workgroupSize");
    else {
      let valid = true;
      for (let index = 0; index < 3; index++) {
        if (!Object.hasOwn(size, index) || !Number.isSafeInteger(size[index]) || size[index] < 1 || size[index] > 256) {
          valid = false;
          add("invalid-workgroup-size", message, undefined, `workgroupSize[${index}]`);
        }
      }
      if (valid && size[0] * size[1] * size[2] > 256) add("invalid-workgroup-size", message, undefined, "workgroupSize");
    }
  }
  const reachable = (id: string, fn: (node: ShaderGraphNode) => void, seen = new Set<string>()): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (!n) return;
    fn(n);
    const inputs = Array.isArray(n.inputs) ? n.inputs : [];
    for (let index = 0; index < inputs.length; index++) {
      if (Object.hasOwn(inputs, index) && typeof inputs[index] === "string") reachable(inputs[index]!, fn, seen);
    }
  };
  for (const id of Object.values(outputValues)) if (typeof id === "string") reachable(id, (node) => {
    if (node.op === "local") add("invalid-scope", `loop index ${String(node.name)} is not in scope`, node.id);
    if (node.op === "output") add("invalid-scope", `output ${String(node.name)} cannot be read in an output initializer`, node.id);
  });
  if (outputValues.position) reachable(outputValues.position, (node) => { if (node.op === "input" && FRAGMENT_ONLY.has(node.name as ShaderGraphBuiltin)) add("invalid-stage", `${node.name} is unavailable in the vertex stage`, node.id); });
  if (typeof graph.alphaTest === "number" && graph.alphaTest > 0) {
    const colorNode = typeof outputValues.color === "string" ? byId.get(outputValues.color) : undefined;
    const alphaRoots = [colorNode?.type === "vec4" ? outputValues.color : undefined, outputValues.opacity];
    for (const id of alphaRoots) if (typeof id === "string") reachable(id, (node) => {
      // These values change between the camera and shadow pass, so using them
      // for coverage cannot preserve the same authored alpha in both passes.
      if (node.op === "input" && (node.name === "viewportUV" || node.name === "depth" || node.name === "cameraPosition")) {
        add("alpha-test-shadow-unsupported", `${node.name} cannot drive alpha-tested shadow coverage`, node.id);
      }
    });
  }
  type StatementCheck = { readonly stages: Set<MaterialGraphStage>; readonly effect: boolean; readonly steps: number };
  let materialStatementCount = 0;
  const activeStatements = new Set<readonly ShaderGraphStatement[]>();
  const checkStatements = (statements: readonly ShaderGraphStatement[], locals: ReadonlyMap<string, number>, path: string, depth = 0): StatementCheck => {
    const stages = new Set<MaterialGraphStage>();
    let effect = false;
    let steps = 0;
    const empty = (): StatementCheck => ({ stages, effect, steps });
    if (!Array.isArray(statements)) { add("invalid-statement", `${path} must be an array`, undefined, path); return empty(); }
    if (graph.stage === "material" && depth > MATERIAL_NESTING_LIMIT) {
      add("graph-limit", `material statements exceed the ${MATERIAL_NESTING_LIMIT}-level nesting limit`, undefined, path);
      return empty();
    }
    if (activeStatements.has(statements)) { add("invalid-statement", `${path} contains a statement cycle`, undefined, path); return empty(); }
    activeStatements.add(statements);
    const expression = (
      id: unknown,
      expected: ShaderGraphValueType | undefined,
      expressionPath: string,
      allowedOutput?: ShaderGraphMaterialOutput,
      expressionStages: ReadonlySet<MaterialGraphStage> = new Set()
    ): ShaderGraphNode | undefined => {
      const n = typeof id === "string" ? byId.get(id) : undefined;
      if (!n) { add("missing-node", `statement references missing node ${String(id)}`, undefined, expressionPath); return undefined; }
      if (expected && n.type !== expected) add("type-mismatch", `statement needs ${expected}, got ${n.type}`, n.id, expressionPath);
      reachable(n.id, (dep) => {
        if (dep.op === "local" && !locals.has(dep.name ?? "")) add("invalid-scope", `loop index ${String(dep.name)} is not in scope`, dep.id, expressionPath);
        if (graph.stage === "material" && dep.op === "arrayIndex" && Array.isArray(dep.inputs)) {
          const array = byId.get(dep.inputs[0] ?? "");
          const index = byId.get(dep.inputs[1] ?? "");
          const length = arrayType(array?.type)?.length;
          const count = index?.op === "local" ? locals.get(index.name ?? "") : undefined;
          if (length !== undefined && count !== undefined && count > length) {
            add("index-out-of-bounds", `loop index ${index!.name} exceeds the ${length}-element array`, dep.id, expressionPath);
          }
        }
        if (dep.op === "output" && (allowedOutput === undefined || dep.name !== allowedOutput)) {
          add("invalid-scope", `output ${String(dep.name)} may only be read while updating that same output`, dep.id, expressionPath);
        }
        if (expressionStages.has("vertex") && dep.op === "input" && FRAGMENT_ONLY.has(dep.name as ShaderGraphBuiltin)) {
          add("invalid-stage", `${dep.name} is unavailable in the vertex stage`, dep.id, expressionPath);
        }
        // Implicit-derivative sampling in divergent fragment control flow is
        // not portable. Initialize an output with the sample before the flow.
        if (expressionStages.has("fragment") && dep.op === "textureSample") {
          add("unsupported-control-flow", "material control-flow expressions cannot use implicit texture sampling", dep.id, expressionPath);
        }
      });
      return n;
    };
    const merge = (child: StatementCheck): void => {
      for (const stage of child.stages) stages.add(stage);
      effect ||= child.effect;
    };
    for (let i = 0; i < statements.length; i++) {
      const p = `${path}[${i}]`;
      if (graph.stage === "material" && ++materialStatementCount > MATERIAL_STATEMENT_LIMIT) {
        add("graph-limit", `material graph exceeds the ${MATERIAL_STATEMENT_LIMIT}-statement limit`, undefined, p);
        break;
      }
      if (!Object.hasOwn(statements, i)) { add("invalid-statement", `${p} is missing`, undefined, p); continue; }
      const statement = statements[i];
      if (!statement || typeof statement !== "object") { add("invalid-statement", `${p} must be an object`, undefined, p); continue; }
      let statementSteps = 1;
      switch (statement.op) {
        case "store": case "atomicAdd": {
          if (graph.stage === "material") add("invalid-stage", `${p} storage writes are only available in compute`, undefined, p);
          const r = resources.get(statement.resource);
          const index = expression(statement.index, undefined, `${p}.index`);
          const value = expression(statement.value, undefined, `${p}.value`);
          if (!r || r.kind !== "storage-buffer" || (r.access ?? "read_write") === "read") add("invalid-resource", `${p} needs writable storage buffer`);
          if (index && !isInt(index.type)) add("type-mismatch", `${p} index must be integer`, index.id);
          if (r && value && r.type !== value.type) add("type-mismatch", `${p} value must match buffer type`, value.id);
          if (value && aggregateType(value.type) && uniformPath(value.id)) add("unsupported-uniform-access", `uniform aggregate ${value.id} must be accessed through fields and indices, not stored as a value`, value.id, `${p}.value`);
          if (statement.op === "atomicAdd" && r && !isInt(r.type!)) add("type-mismatch", `${p} atomic buffer type must be i32 or u32`);
          break;
        }
        case "textureStore": {
          if (graph.stage === "material") add("invalid-stage", `${p} storage writes are only available in compute`, undefined, p);
          const r = resources.get(statement.resource);
          expression(statement.coordinates, "vec2", `${p}.coordinates`);
          expression(statement.value, "vec4", `${p}.value`);
          if (!r || !isFloatStorageTexture(r) || (r.access ?? "write") === "read") add("invalid-resource", `${p} needs a writable float storage texture`);
          break;
        }
        case "barrier":
          if (graph.stage === "material") add("invalid-stage", `${p} barriers are only available in compute`, undefined, p);
          if (statement.scope && !["workgroup", "storage"].includes(statement.scope)) add("invalid-statement", `${p} invalid barrier scope`);
          break;
        case "setOutput": {
          if (graph.stage !== "material") {
            add("invalid-stage", `${p} can only update a material output`, undefined, p);
            expression(statement.value, undefined, `${p}.value`);
            break;
          }
          const output: ShaderGraphMaterialOutput = statement.output;
          if (typeof output !== "string" || !Object.hasOwn(OUTPUTS, output) || !Object.hasOwn(outputValues, output)) {
            add("invalid-output", `${p} must update an initialized material output`, undefined, `${p}.output`);
            expression(statement.value, undefined, `${p}.value`);
            break;
          }
          const stage = materialOutputStage(output);
          const initialId = outputValues[output];
          const initial = typeof initialId === "string" ? byId.get(initialId) : undefined;
          expression(statement.value, initial?.type, `${p}.value`, output, new Set([stage]));
          stages.add(stage);
          effect = true;
          break;
        }
        case "if": {
          const then = checkStatements(statement.then, locals, `${p}.then`, depth + 1);
          const otherwise = statement.otherwise === undefined
            ? { stages: new Set<MaterialGraphStage>(), effect: false, steps: 0 }
            : checkStatements(statement.otherwise, locals, `${p}.otherwise`, depth + 1);
          merge(then); merge(otherwise);
          const branchStages = new Set([...then.stages, ...otherwise.stages]);
          expression(statement.condition, "bool", `${p}.condition`, undefined, branchStages);
          if (graph.stage === "material" && !then.effect && !otherwise.effect) add("invalid-statement", `${p} must update a material output`, undefined, p);
          statementSteps += Math.max(then.steps, otherwise.steps);
          break;
        }
        case "loop": {
          if (!validIdentifier(statement.index) || locals.has(statement.index)) add("invalid-scope", `${p} loop index must be a unique identifier`, undefined, `${p}.index`);
          const validCount = Number.isSafeInteger(statement.count) && statement.count >= (graph.stage === "material" ? 1 : 0) && statement.count <= 1024;
          if (!validCount) add("invalid-loop", `${p} count must be an integer in ${graph.stage === "material" ? "1" : "0"}..1024`, undefined, `${p}.count`);
          const bodyLocals = new Map(locals);
          bodyLocals.set(statement.index, validCount ? statement.count : 0);
          const body = checkStatements(statement.body, bodyLocals, `${p}.body`, depth + 1);
          merge(body);
          if (graph.stage === "material" && !body.effect) add("invalid-statement", `${p} must update a material output`, undefined, p);
          statementSteps += validCount ? statement.count * body.steps : 0;
          break;
        }
        default: add("invalid-statement", `${p} has unknown operation`, undefined, p);
      }
      steps = Math.min(MATERIAL_EXECUTION_LIMIT + 1, steps + statementSteps);
    }
    activeStatements.delete(statements);
    if (graph.stage === "material" && depth === 0 && steps > MATERIAL_EXECUTION_LIMIT) {
      add("graph-limit", `material flow exceeds the ${MATERIAL_EXECUTION_LIMIT}-step worst-case execution limit`, undefined, path);
    }
    return { stages, effect, steps };
  };
  const beforeStatements = errors.length;
  if (graph.statements !== undefined) checkStatements(graph.statements, new Map(), "statements");
  if (graph.stage === "material" && typeof graph.alphaTest === "number" && graph.alphaTest > 0
    && Array.isArray(graph.statements) && errors.length === beforeStatements) {
    const color = typeof outputValues.color === "string" ? byId.get(outputValues.color) : undefined;
    const alphaOutputs = new Set<ShaderGraphMaterialOutput>([
      ...(color?.type === "vec4" ? ["color" as const] : []),
      ...(typeof outputValues.opacity === "string" ? ["opacity" as const] : [])
    ]);
    const alphaStatements = selectMaterialStatements(graph.statements, (output) => alphaOutputs.has(output));
    for (const id of materialStatementRoots(alphaStatements)) reachable(id, (node) => {
      if (node.op === "input" && (node.name === "viewportUV" || node.name === "depth" || node.name === "cameraPosition")) {
        add("alpha-test-shadow-unsupported", `${node.name} cannot drive alpha-tested shadow coverage`, node.id);
      }
    });
  }
  if (!scope && Array.isArray(graph.functions)) for (let index = 0; index < graph.functions.length; index++) {
    const declaration = graph.functions[index];
    if (!declaration || typeof declaration !== "object" || !validIdentifier(declaration.name) || !Array.isArray(declaration.nodes)) continue;
    const parameters = new Map<string, ShaderGraphValueType>();
    if (Array.isArray(declaration.parameters)) for (const parameter of declaration.parameters) {
      if (parameter && validIdentifier(parameter.name) && validValueType(parameter.type, definitions.structs)) parameters.set(parameter.name, parameter.type);
    }
    const localGraph: ShaderGraphDocument = { version: 1, stage: graph.stage, nodes: declaration.nodes };
    for (const diagnostic of validateShaderGraphScope(localGraph, undefined, { definitions, parameters })) {
      add(diagnostic.code, diagnostic.message, diagnostic.nodeId, diagnostic.path ? `functions[${index}].${diagnostic.path}` : `functions[${index}]`);
    }
    const output = declaration.nodes.find((node: ShaderGraphNode) => node && node.id === declaration.output);
    if (!output) add("missing-node", `function ${declaration.name} references missing output ${String(declaration.output)}`, undefined, `functions[${index}].output`);
    else if (output.type !== declaration.returnType) add("type-mismatch", `function ${declaration.name} output must match ${String(declaration.returnType)}`, output.id, `functions[${index}].output`);
  }
  return errors;
}

const glslType = (type: ShaderGraphValueType): string => {
  const array = arrayType(type);
  if (array) return glslType(array.element);
  const matrix = matrixType(type);
  if (matrix) return matrix.columns === matrix.rows ? `mat${matrix.columns}` : `mat${matrix.columns}x${matrix.rows}`;
  return structName(type) !== undefined ? `auraGraph_struct_${graphSymbol(structName(type)!)}` : ({ f32: "float", i32: "int", u32: "uint", bool: "bool", vec2: "vec2", vec3: "vec3", vec4: "vec4", uvec3: "uvec3" } as Record<string, string>)[type]!;
};
const wgslType = (type: ShaderGraphValueType): string => {
  const array = arrayType(type);
  if (array) return `array<${wgslType(array.element)}, ${array.length}>`;
  const matrix = matrixType(type);
  if (matrix) return `mat${matrix.columns}x${matrix.rows}<f32>`;
  return structName(type) !== undefined ? `auraGraph_struct_${graphSymbol(structName(type)!)}` : ({ f32: "f32", i32: "i32", u32: "u32", bool: "bool", vec2: "vec2<f32>", vec3: "vec3<f32>", vec4: "vec4<f32>", uvec3: "vec3<u32>" } as Record<string, string>)[type]!;
};
function glslDeclaration(type: ShaderGraphValueType, name: string): string {
  let element = type;
  let suffix = "";
  for (let array = arrayType(element); array; array = arrayType(element)) {
    suffix += `[${array.length}]`;
    element = array.element;
  }
  return `${glslType(element)} ${name}${suffix}`;
}
function floatLiteral(value: number): string {
  if (Object.is(value, -0)) return "0.0";
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}
function literal(value: number | boolean | readonly number[], type: ShaderGraphValueType, target: ShaderGraphTarget): string {
  if (type === "bool") return (Array.isArray(value) ? value[0] : value) === true ? "true" : "false";
  const parts = Array.isArray(value) ? value : [value as number];
  const matrix = matrixType(type);
  if (matrix) {
    const columnType = target === "glsl" ? `vec${matrix.rows}` : `vec${matrix.rows}<f32>`;
    const columns = Array.from({ length: matrix.columns }, (_, column) =>
      `${columnType}(${parts.slice(column * matrix.rows, (column + 1) * matrix.rows).map(floatLiteral).join(", ")})`);
    return `${target === "glsl" ? glslType(type) : wgslType(type)}(${columns.join(", ")})`;
  }
  const component = (v: number): string => type === "i32" ? String(v) : type === "u32" || type === "uvec3" ? `${v}u` : floatLiteral(v);
  if (WIDTH[type] === 1) return component(parts[0]!);
  return `${target === "glsl" ? glslType(type) : wgslType(type)}(${parts.map(component).join(", ")})`;
}
function noiseDeclarations(target: ShaderGraphTarget): string {
  const wgsl = target === "wgsl";
  const vec = wgsl ? "vec4<f32>" : "vec4";
  const variable = wgsl ? "let" : "float";
  const hash = wgsl ? `
fn auraGraph_noiseHash(cell: vec4<f32>) -> f32 {
  let tile = cell - floor(cell / 256.0) * 256.0;
  let bits = vec4<u32>(tile);
  var h = bits.x * 1664525u ^ bits.y * 1013904223u ^ bits.z * 747796405u ^ bits.w * 2891336453u ^ 277803737u;
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return f32(h & 16777215u) / 16777215.0;
}
fn auraGraph_noise4(point: vec4<f32>) -> f32 {
  let cell = floor(point);
  let t = fract(point);
  let fade = t * t * (vec4<f32>(3.0) - 2.0 * t);` : `
float auraGraph_noiseHash(vec4 cell) {
  vec4 tile = cell - floor(cell / 256.0) * 256.0;
  highp uvec4 bits = uvec4(tile);
  highp uint h = bits.x * 1664525u ^ bits.y * 1013904223u ^ bits.z * 747796405u ^ bits.w * 2891336453u ^ 277803737u;
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return float(h & 16777215u) / 16777215.0;
}
float auraGraph_noise4(vec4 point) {
  vec4 cell = floor(point);
  vec4 t = fract(point);
  vec4 fade = t * t * (vec4(3.0) - 2.0 * t);`;
  const lines: string[] = [hash];
  for (let w = 0; w < 2; w++) for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) {
    const offset = (x: number): string => `${vec}(${x}.0, ${y}.0, ${z}.0, ${w}.0)`;
    lines.push(`  ${variable} x${w}${z}${y} = mix(auraGraph_noiseHash(cell + ${offset(0)}), auraGraph_noiseHash(cell + ${offset(1)}), fade.x);`);
  }
  for (let w = 0; w < 2; w++) for (let z = 0; z < 2; z++) {
    lines.push(`  ${variable} y${w}${z} = mix(x${w}${z}0, x${w}${z}1, fade.y);`);
  }
  for (let w = 0; w < 2; w++) lines.push(`  ${variable} z${w} = mix(y${w}0, y${w}1, fade.z);`);
  lines.push("  return mix(z0, z1, fade.w);", "}");
  if (wgsl) lines.push(
    "fn auraGraph_noise1(p: f32) -> f32 { return auraGraph_noise4(vec4<f32>(p, 0.0, 0.0, 0.0)); }",
    "fn auraGraph_noise2(p: vec2<f32>) -> f32 { return auraGraph_noise4(vec4<f32>(p, 0.0, 0.0)); }",
    "fn auraGraph_noise3(p: vec3<f32>) -> f32 { return auraGraph_noise4(vec4<f32>(p, 0.0)); }"
  );
  else lines.push(
    "float auraGraph_noise1(float p) { return auraGraph_noise4(vec4(p, 0.0, 0.0, 0.0)); }",
    "float auraGraph_noise2(vec2 p) { return auraGraph_noise4(vec4(p, 0.0, 0.0)); }",
    "float auraGraph_noise3(vec3 p) { return auraGraph_noise4(vec4(p, 0.0)); }"
  );
  return lines.join("\n");
}
function bindingList(resources: readonly ShaderGraphResource[], stage: ShaderGraphDocument["stage"], structs: ReadonlyMap<string, ShaderGraphStruct>): readonly ShaderGraphBinding[] {
  let next = 0;
  let nextMaterialStorage = 0;
  let nextSampler = 1;
  return resources.map((resource) => {
    const shaderName = `auraGraph_resource_${resource.name}`;
    const dataType = resource.type && (resource.kind === "storage-buffer" || resource.kind === "uniform" && (aggregateType(resource.type) || matrixType(resource.type)))
      ? graphDataType(resource.type, structs) : undefined;
    const minBindingSize = resource.kind === "storage-buffer" && dataType
      ? deriveShaderDataLayout({ kind: "array", element: dataType, length: 1 }, "wgsl-storage").size : undefined;
    if (stage === "material" && resource.kind === "uniform") return { ...resource, group: 0, binding: 0, shaderName, ...(dataType ? { dataType } : {}) };
    if (stage === "material" && resource.kind === "depth2d") {
      return { ...resource, group: 0, binding: nextSampler++, shaderName };
    }
    if (stage === "material" && usesSampler(resource.kind)) {
      const samplerBinding = nextSampler;
      nextSampler += 2;
      return { ...resource, group: 0, binding: samplerBinding + 1, samplerBinding, shaderName };
    }
    const materialStorage = stage === "material";
    const binding = resource.binding ?? (materialStorage ? nextMaterialStorage : next);
    const count = stage === "compute" && usesSampler(resource.kind) ? 2 : 1;
    if (materialStorage) nextMaterialStorage = Math.max(nextMaterialStorage, binding + count);
    else next = Math.max(next, binding + count);
    return { ...resource, group: resource.group ?? (materialStorage ? 1 : 0), binding, shaderName, ...(dataType ? { dataType } : {}),
      ...(minBindingSize === undefined ? {} : { minBindingSize }), ...(count === 2 ? { samplerBinding: binding + 1 } : {}) };
  });
}

// The portable material uses the same packed light inputs as the forward pass.
// This metallic/roughness BRDF uses a GGX distribution, correlated Smith
// visibility, Schlick Fresnel and Lambert diffuse. Rect-area lights are not
// represented by the author-lighting chunk and therefore remain unsupported.
// Both backends use the fixed 64-pixel tiles of ClusteredForwardLighting;
// dividing by viewport/grid would put the boundary inside partial edge tiles.
const GRAPH_DIRECT_GLSL = `
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
// @graph-shadow begin contact
uniform sampler2D u_contactShadowMask;
uniform float u_contactShadowMaskStrength;
uniform vec2 u_contactShadowMaskViewport;
uniform float u_contactShadowLightIndex;
float auraGraphContactShadow(vec2 screen) {
  if (u_contactShadowMaskStrength <= 0.0) return 1.0;
  float mask = textureLod(u_contactShadowMask, screen / u_contactShadowMaskViewport, 0.0).r;
  return mix(1.0, mask, clamp(u_contactShadowMaskStrength, 0.0, 1.0));
}
// @graph-shadow end contact
// @graph-shadow begin directional
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform float u_shadowMapNormalBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
float auraGraphShadow(vec3 world, vec3 n, vec3 l) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 clip = u_shadowMapMatrix * vec4(world + n * u_shadowMapNormalBias, 1.0);
  vec3 projected = clip.xyz / max(clip.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  float slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float depth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float occlusion = 0.0; float weights = 0.0;
  for (int i = 0; i < 32; ++i) {
    if (i >= clamp(int(u_shadowPcfSampleCount), 1, 32)) break;
    vec4 tap = u_shadowPcfSamples[i];
    float weight = max(tap.z, 0.0);
    float receiver = depth - u_shadowMapBias - slope * max(1.0, length(tap.xy));
    occlusion += (receiver > texture(u_shadowMapTexture, uv + tap.xy * u_shadowMapTexelSize).r ? 1.0 : 0.0) * weight;
    weights += weight;
  }
  return mix(1.0, 1.0 - (weights > 0.0 ? occlusion / weights : 0.0), clamp(u_shadowMapStrength, 0.0, 1.0));
}
// @graph-shadow end directional
// @graph-shadow begin point
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
// @graph-shadow end point
// @graph-shadow begin spot
uniform sampler2D u_spotShadowMapTexture;
uniform float u_spotShadowMapEnabled;
uniform vec3 u_spotShadowLightPosition;
uniform vec3 u_spotShadowLightDirection;
uniform mat4 u_spotShadowMatrix;
uniform vec2 u_spotShadowCone;
uniform float u_spotShadowRange;
uniform float u_spotShadowStrength;
uniform float u_spotShadowBias;
uniform float u_spotShadowSlopeBias;
uniform vec2 u_spotShadowTexelSize;
uniform float u_spotShadowPcfSampleCount;
uniform vec4 u_spotShadowPcfSamples[32];
// @graph-shadow end spot
// @graph-shadow begin local
uniform sampler2D u_localShadowAtlas;
uniform mat4 u_localShadowMatrices[6];
uniform vec4 u_localShadowRects[6];
uniform vec4 u_localShadowTexelScale[2];
uniform vec4 u_localShadowParams;
uniform vec2 u_localShadowAtlasTexel;
// @graph-shadow end local
// @graph-shadow begin cascade
uniform float u_graphCascadeCount;
uniform float u_graphCascadeViewMode;
uniform vec4 u_graphCascadeSplits;
uniform mat4 u_graphCascadeMatrices[4];
uniform vec4 u_graphCascadeParams[4];
uniform vec4 u_graphCascadeTexels[4];
uniform vec4 u_graphCascadeSamples[128];
uniform sampler2D u_graphCascadeTexture0;
// @graph-shadow begin cascade2
uniform sampler2D u_graphCascadeTexture1;
// @graph-shadow end cascade2
// @graph-shadow begin cascade3
uniform sampler2D u_graphCascadeTexture2;
// @graph-shadow end cascade3
// @graph-shadow begin cascade4
uniform sampler2D u_graphCascadeTexture3;
// @graph-shadow end cascade4
float auraGraphCascadeDepth(int cascade, vec2 uv) {
  if (cascade == 0) return texture(u_graphCascadeTexture0, uv).r;
// @graph-shadow begin cascade2
  if (cascade == 1) return texture(u_graphCascadeTexture1, uv).r;
// @graph-shadow end cascade2
// @graph-shadow begin cascade3
  if (cascade == 2) return texture(u_graphCascadeTexture2, uv).r;
// @graph-shadow end cascade3
// @graph-shadow begin cascade4
  if (cascade == 3) return texture(u_graphCascadeTexture3, uv).r;
// @graph-shadow end cascade4
  return 1.0;
}
float auraGraphSunShadow(vec3 world, vec3 n, vec3 l) {
  int count = clamp(int(u_graphCascadeCount), 0, 4);
  if (count == 0) return 1.0;
  float viewDepth = u_graphCascadeViewMode < 0.5 ? max(-(u_viewMatrix * vec4(world, 1.0)).z, 0.0)
    : (u_graphCascadeViewMode < 1.5 ? length(world - u_cameraPosition) : 0.0);
  int cascade = 0;
  for (int i = 0; i < 3; ++i) {
    if (i + 1 >= count || viewDepth <= u_graphCascadeSplits[i]) break;
    cascade += 1;
  }
  vec4 params = u_graphCascadeParams[cascade];
  vec4 texel = u_graphCascadeTexels[cascade];
  vec4 clip = u_graphCascadeMatrices[cascade] * vec4(world + n * params.w, 1.0);
  vec3 projected = clip.xyz / max(clip.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  float slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0) * params.z * max(texel.x, texel.y);
  float depth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float occlusion = 0.0;
  float weights = 0.0;
  for (int i = 0; i < 32; ++i) {
    if (i >= clamp(int(texel.z), 1, 32)) break;
    vec4 tap = u_graphCascadeSamples[cascade * 32 + i];
    float weight = max(tap.z, 0.0);
    float receiver = depth - params.y - slope * max(1.0, length(tap.xy));
    occlusion += (receiver > auraGraphCascadeDepth(cascade, uv + tap.xy * texel.xy) ? 1.0 : 0.0) * weight;
    weights += weight;
  }
  return mix(1.0, 1.0 - (weights > 0.0 ? occlusion / weights : 0.0), clamp(params.x, 0.0, 1.0));
}
// @graph-shadow end cascade
// @graph-shadow begin punctual
float auraGraphLocalPcf(sampler2D image, vec2 uv, float depth, vec3 n, vec3 l, float bias, float slopeBias, vec2 texel, float sampleCount, vec4 samples[32], float strength) {
  float nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  float slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0) * slopeBias * max(texel.x, texel.y);
  float occlusion = 0.0;
  float weights = 0.0;
  for (int i = 0; i < 32; ++i) {
    if (i >= clamp(int(sampleCount), 1, 32)) break;
    vec4 tap = samples[i];
    float weight = max(tap.z, 0.0);
    float receiver = depth - bias - slope * max(1.0, length(tap.xy));
    occlusion += (receiver > texture(image, uv + tap.xy * texel).r ? 1.0 : 0.0) * weight;
    weights += weight;
  }
  return mix(1.0, 1.0 - (weights > 0.0 ? occlusion / weights : 0.0), clamp(strength, 0.0, 1.0));
}
// @graph-shadow end punctual
// @graph-shadow begin point
float auraGraphPointShadow(vec3 world, vec3 n, vec3 l) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 direction = world - u_pointShadowLightPosition;
  if (length(direction) > u_pointShadowRange) return 1.0;
  vec3 a = abs(direction);
  int face = a.x >= a.y && a.x >= a.z ? (direction.x >= 0.0 ? 0 : 1) : (a.y >= a.z ? (direction.y >= 0.0 ? 2 : 3) : (direction.z >= 0.0 ? 4 : 5));
  vec4 clip = u_pointShadowFaceMatrices[face] * vec4(world, 1.0);
  vec3 projected = clip.xyz / max(clip.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (any(lessThan(localUv, vec2(0.0))) || any(greaterThan(localUv, vec2(1.0)))) return 1.0;
  vec4 rect = u_pointShadowFaceRects[face];
  return auraGraphLocalPcf(u_pointShadowMapTexture, rect.xy + localUv * rect.zw, projected.z * 0.5 + 0.5, n, l, u_pointShadowBias, u_pointShadowSlopeBias, u_pointShadowTexelSize, u_pointShadowPcfSampleCount, u_pointShadowPcfSamples, u_pointShadowStrength);
}
// @graph-shadow end point
// @graph-shadow begin spot
float auraGraphSpotShadow(vec3 world, vec3 n, vec3 l) {
  if (u_spotShadowMapEnabled < 0.5) return 1.0;
  vec3 delta = world - u_spotShadowLightPosition;
  float distanceToLight = max(length(delta), 0.0001);
  if (distanceToLight > u_spotShadowRange || dot(delta / distanceToLight, u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001)) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 clip = u_spotShadowMatrix * vec4(world, 1.0);
  vec3 projected = clip.xyz / max(clip.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  return auraGraphLocalPcf(u_spotShadowMapTexture, uv, projected.z * 0.5 + 0.5, n, l, u_spotShadowBias, u_spotShadowSlopeBias, u_spotShadowTexelSize, u_spotShadowPcfSampleCount, u_spotShadowPcfSamples, u_spotShadowStrength);
}
// @graph-shadow end spot
// @graph-shadow begin local
float auraGraphAtlasCompare(vec2 uv, float reference) {
  vec2 pixel = uv / u_localShadowAtlasTexel - 0.5;
  vec2 base = floor(pixel);
  vec2 f = fract(pixel);
  vec2 origin = (base + 0.5) * u_localShadowAtlasTexel;
  float a = step(reference, texture(u_localShadowAtlas, origin).r);
  float b = step(reference, texture(u_localShadowAtlas, origin + vec2(u_localShadowAtlasTexel.x, 0.0)).r);
  float c = step(reference, texture(u_localShadowAtlas, origin + vec2(0.0, u_localShadowAtlasTexel.y)).r);
  float d = step(reference, texture(u_localShadowAtlas, origin + u_localShadowAtlasTexel).r);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float auraGraphAtlasShadow(float kind, float slot, vec3 lightPosition, vec3 world, vec3 n, vec3 l) {
  if (u_localShadowParams.x <= 0.0 || slot < 0.5 || kind < 0.5 || kind > 2.5) return 1.0;
  int tile = int(slot + 0.5) - 1;
  if (kind < 1.5) {
    vec3 direction = world - lightPosition;
    vec3 a = abs(direction);
    tile += a.x >= a.y && a.x >= a.z ? (direction.x >= 0.0 ? 0 : 1) : (a.y >= a.z ? (direction.y >= 0.0 ? 2 : 3) : (direction.z >= 0.0 ? 4 : 5));
  }
  if (tile < 0 || tile >= 6) return 1.0;
  vec4 axis = u_localShadowMatrices[tile] * vec4(world, 1.0);
  if (axis.w <= 0.0) return 1.0;
  float texelWorld = axis.w * u_localShadowTexelScale[tile / 4][tile - (tile / 4) * 4];
  float nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  float slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0);
  vec3 receiver = world + n * (texelWorld * u_localShadowParams.w);
  vec4 projectedPosition = u_localShadowMatrices[tile] * vec4(receiver, 1.0);
  if (projectedPosition.w <= 0.0) return 1.0;
  vec3 projected = projectedPosition.xyz / projectedPosition.w;
  if (projected.x < 0.0 || projected.x > 1.0 || projected.y < 0.0 || projected.y > 1.0 || projected.z > 1.0) return 1.0;
  vec3 biased = receiver + l * (texelWorld * (u_localShadowParams.y + u_localShadowParams.z * slope));
  vec4 biasedPosition = u_localShadowMatrices[tile] * vec4(biased, 1.0);
  float reference = clamp(biasedPosition.z / max(biasedPosition.w, 0.0001), 0.0, 1.0);
  vec4 rect = u_localShadowRects[tile];
  vec2 halfTexel = 0.5 * u_localShadowAtlasTexel;
  vec2 uv = clamp(rect.xy + projected.xy * rect.zw, rect.xy + halfTexel, rect.xy + rect.zw - halfTexel);
  return mix(1.0, auraGraphAtlasCompare(uv, reference), clamp(u_localShadowParams.x, 0.0, 1.0));
}
// @graph-shadow end local
vec3 auraGraphDirectLight(vec3 n, vec3 v, vec3 l, vec3 radiance, vec3 base, float rough, float metal) {
  vec3 h = (v + l) / max(length(v + l), 0.0001);
  float nl = clamp(dot(n, l), 0.0, 1.0);
  float nv = clamp(dot(n, v), 0.0001, 1.0);
  float nh = clamp(dot(n, h), 0.0, 1.0);
  float vh = clamp(dot(v, h), 0.0, 1.0);
  float alpha = max(rough * rough, 0.002);
  float a2 = alpha * alpha;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  float distribution = a2 / max(3.14159265 * d * d, 0.000001);
  float lv = nl * sqrt(max(nv * nv * (1.0 - a2) + a2, 0.0));
  float ll = nv * sqrt(max(nl * nl * (1.0 - a2) + a2, 0.0));
  float visibility = 0.5 / max(lv + ll, 0.00001);
  vec3 f0 = mix(vec3(0.04), base, metal);
  vec3 f = f0 + (vec3(1.0) - f0) * pow(1.0 - vh, 5.0);
  return (base * (1.0 - metal) * (vec3(1.0) - f) * 0.318309886 + distribution * visibility * f) * radiance * nl;
}
vec3 auraGraphDirect(vec3 n, vec3 v, vec3 base, float rough, float metal, vec3 world) {
  vec3 total = vec3(0.0);
  bool clustered = u_clusteredLightEnabled > 0.5;
  int cluster = 0;
  int count = min(int(u_lightCount), 16);
  if (clustered) {
    vec2 grid = max(u_clusterGridSize, vec2(1.0));
    ivec2 tile = clamp(ivec2(floor(min(gl_FragCoord.xy, u_clusterViewportSize) / 64.0)), ivec2(0), ivec2(grid) - ivec2(1));
    cluster = tile.y * int(grid.x) + tile.x;
    count = min(int(texelFetch(u_clusterLightIndices, ivec2(0, cluster), 0).g), 64);
  }
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int index = clustered ? int(texelFetch(u_clusterLightIndices, ivec2(i, cluster), 0).r) : i;
    vec4 c; vec4 p; vec4 d; vec4 s; vec4 right; vec4 up;
    if (clustered) {
      c = texelFetch(u_clusterLightData, ivec2(0, index), 0);
      p = texelFetch(u_clusterLightData, ivec2(1, index), 0);
      d = texelFetch(u_clusterLightData, ivec2(2, index), 0);
      s = texelFetch(u_clusterLightData, ivec2(3, index), 0);
      right = texelFetch(u_clusterLightData, ivec2(4, index), 0);
      up = texelFetch(u_clusterLightData, ivec2(5, index), 0);
    } else {
      c = u_lightData[index * 6]; p = u_lightData[index * 6 + 1];
      d = u_lightData[index * 6 + 2]; s = u_lightData[index * 6 + 3];
      right = u_lightData[index * 6 + 4];
      up = u_lightData[index * 6 + 5];
    }
    if (d.w > 2.5) continue;
    vec3 l = -d.xyz / max(length(d.xyz), 0.0001);
    float attenuation = 1.0;
    if (d.w > 0.5) {
      vec3 delta = p.xyz - world;
      float distanceToLight = length(delta);
      l = distanceToLight > 0.0001 ? delta / distanceToLight : l;
      float ratio = distanceToLight / max(p.w, 0.0001);
      float range = p.w <= 0.0 ? 1.0 : clamp(1.0 - ratio * ratio * ratio * ratio, 0.0, 1.0);
      attenuation = range * range / max(distanceToLight * distanceToLight, 1.0);
    }
    if (d.w > 1.5) {
      vec3 fromLight = world - p.xyz;
      float cone = dot(d.xyz / max(length(d.xyz), 0.0001), fromLight / max(length(fromLight), 0.0001));
      if (up.w > 0.5) cone = abs(cone);
      attenuation *= smoothstep(cos(s.x), cos(s.x * max(1.0 - s.y, 0.001)), cone);
    }
// @graph-shadow begin directional
    if (s.z > 0.5 && d.w < 0.5) attenuation *= auraGraphShadow(world, n, l);
// @graph-shadow end directional
// @graph-shadow begin contact
    if (s.z > 0.5 && d.w < 0.5 && index == int(u_contactShadowLightIndex)) attenuation *= auraGraphContactShadow(gl_FragCoord.xy);
// @graph-shadow end contact
// @graph-shadow begin cascade
    if (s.z > 0.5 && d.w < 0.5) attenuation *= auraGraphSunShadow(world, n, l);
// @graph-shadow end cascade
// @graph-shadow begin point
    if (s.z > 0.5 && d.w > 0.5 && d.w < 1.5 && length(p.xyz - u_pointShadowLightPosition) <= 0.0001) attenuation *= auraGraphPointShadow(world, n, l);
// @graph-shadow end point
// @graph-shadow begin spot
    if (s.z > 0.5 && d.w > 1.5 && d.w < 2.5 && length(p.xyz - u_spotShadowLightPosition) <= 0.0001 && dot(d.xyz / max(length(d.xyz), 0.0001), u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001)) >= 0.9999) attenuation *= auraGraphSpotShadow(world, n, l);
// @graph-shadow end spot
// @graph-shadow begin local
    attenuation *= auraGraphAtlasShadow(d.w, right.w, p.xyz, world, n, l);
// @graph-shadow end local
    total += auraGraphDirectLight(n, v, l, c.rgb * c.a * attenuation, base, rough, metal);
  }
  return total;
}`;

function graphPunctualPcfWgsl(kind: "point" | "spot"): string {
  const title = kind === "point" ? "Point" : "Spot";
  return `// @graph-shadow begin ${kind}
fn auraGraph${title}Pcf(uv: vec2<f32>, depth: f32, n: vec3<f32>, l: vec3<f32>) -> f32 {
  let texel = aura.u_${kind}ShadowTexelSize;
  let nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0) * aura.u_${kind}ShadowSlopeBias * max(texel.x, texel.y);
  let count = clamp(i32(aura.u_${kind}ShadowPcfSampleCount), 1, 32);
  var occlusion = 0.0; var weights = 0.0;
  for (var i = 0; i < 32; i++) {
    if (i >= count) { break; }
    let tap = aura.u_${kind}ShadowPcfSamples[u32(i)];
    let offset = tap.xy * texel;
    let stored = textureSampleLevel(u_${kind}ShadowMapTextureTexture, u_${kind}ShadowMapTextureSampler, vec2<f32>(uv.x + offset.x, 1.0 - uv.y - offset.y), 0.0).r;
    let weight = max(tap.z, 0.0);
    let receiver = depth - aura.u_${kind}ShadowBias - slope * max(1.0, length(tap.xy));
    occlusion += select(0.0, weight, receiver > stored);
    weights += weight;
  }
  return mix(1.0, 1.0 - select(0.0, occlusion / max(weights, 0.0001), weights > 0.0), clamp(aura.u_${kind}ShadowStrength, 0.0, 1.0));
}
// @graph-shadow end ${kind}`;
}

const GRAPH_LIGHTING_WGSL = `
// @graph-shadow begin contact
fn auraGraphContactShadow(screen: vec2<f32>) -> f32 {
  if (aura.u_contactShadowMaskStrength <= 0.0) { return 1.0; }
  let mask = textureSampleLevel(u_contactShadowMaskTexture, u_contactShadowMaskSampler, screen / aura.u_contactShadowMaskViewport, 0.0).r;
  return mix(1.0, mask, clamp(aura.u_contactShadowMaskStrength, 0.0, 1.0));
}
// @graph-shadow end contact
fn auraGraphSamplePixel(image: texture_2d<f32>, imageSampler: sampler, pixel: vec2<i32>) -> vec4<f32> {
  let size = vec2<f32>(textureDimensions(image));
  return textureSampleLevel(image, imageSampler, (vec2<f32>(pixel) + vec2<f32>(0.5)) / size, 0.0);
}
fn auraGraphDirectLight(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, radiance: vec3<f32>, base: vec3<f32>, rough: f32, metal: f32) -> vec3<f32> {
  let h = (v + l) / max(length(v + l), 0.0001);
  let nl = clamp(dot(n, l), 0.0, 1.0);
  let nv = clamp(dot(n, v), 0.0001, 1.0);
  let nh = clamp(dot(n, h), 0.0, 1.0);
  let vh = clamp(dot(v, h), 0.0, 1.0);
  let alpha = max(rough * rough, 0.002);
  let a2 = alpha * alpha;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  let distribution = a2 / max(3.14159265 * d * d, 0.000001);
  let lv = nl * sqrt(max(nv * nv * (1.0 - a2) + a2, 0.0));
  let ll = nv * sqrt(max(nl * nl * (1.0 - a2) + a2, 0.0));
  let visibility = 0.5 / max(lv + ll, 0.00001);
  let f0 = mix(vec3<f32>(0.04), base, metal);
  let f = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - vh, 5.0);
  return (base * (1.0 - metal) * (vec3<f32>(1.0) - f) * 0.318309886 + distribution * visibility * f) * radiance * nl;
}
// @graph-shadow begin directional
fn auraGraphShadow(world: vec3<f32>, n: vec3<f32>, l: vec3<f32>) -> f32 {
  if (aura.u_shadowMapEnabled < 0.5) { return 1.0; }
  let lightPosition = aura.u_shadowMapMatrix * vec4<f32>(world + n * aura.u_shadowMapNormalBias, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  let sampleUv = vec2<f32>(uv.x, 1.0 - uv.y);
  let nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0);
  let slopeBias = slope * aura.u_shadowMapSlopeBias * max(aura.u_shadowMapTexelSize.x, aura.u_shadowMapTexelSize.y);
  let receiver = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  let count = clamp(i32(aura.u_shadowPcfSampleCount), 1, 32);
  var occlusion = 0.0;
  var weights = 0.0;
  for (var i = 0; i < 32; i++) {
    if (i >= count) { break; }
    let sampleData = aura.u_shadowPcfSamples[u32(i)];
    let offset = sampleData.xy * aura.u_shadowMapTexelSize;
    let stored = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, sampleUv + vec2<f32>(offset.x, -offset.y), 0.0).r;
    let bias = aura.u_shadowMapBias + slopeBias * max(1.0, length(sampleData.xy));
    let weight = max(sampleData.z, 0.0);
    occlusion += select(0.0, weight, receiver - bias > stored);
    weights += weight;
  }
  return mix(1.0, 1.0 - select(0.0, occlusion / max(weights, 0.0001), weights > 0.0), clamp(aura.u_shadowMapStrength, 0.0, 1.0));
}
// @graph-shadow end directional
// @graph-shadow begin cascade
fn auraGraphCascadeDepth(cascade: u32, uv: vec2<f32>) -> f32 {
  let sampleUv = vec2<f32>(uv.x, 1.0 - uv.y);
  if (cascade == 0u) { return textureSampleLevel(u_graphCascadeTexture0Texture, u_graphCascadeTexture0Sampler, sampleUv, 0.0).r; }
// @graph-shadow begin cascade2
  if (cascade == 1u) { return textureSampleLevel(u_graphCascadeTexture1Texture, u_graphCascadeTexture1Sampler, sampleUv, 0.0).r; }
// @graph-shadow end cascade2
// @graph-shadow begin cascade3
  if (cascade == 2u) { return textureSampleLevel(u_graphCascadeTexture2Texture, u_graphCascadeTexture2Sampler, sampleUv, 0.0).r; }
// @graph-shadow end cascade3
// @graph-shadow begin cascade4
  if (cascade == 3u) { return textureSampleLevel(u_graphCascadeTexture3Texture, u_graphCascadeTexture3Sampler, sampleUv, 0.0).r; }
// @graph-shadow end cascade4
  return 1.0;
}
fn auraGraphSunShadow(world: vec3<f32>, n: vec3<f32>, l: vec3<f32>) -> f32 {
  let count = clamp(i32(aura.u_graphCascadeCount), 0, 4);
  if (count == 0) { return 1.0; }
  var viewDepth = 0.0;
  if (aura.u_graphCascadeViewMode < 0.5) { viewDepth = max(-(aura.u_viewMatrix * vec4<f32>(world, 1.0)).z, 0.0); }
  else if (aura.u_graphCascadeViewMode < 1.5) { viewDepth = length(world - aura.u_cameraPosition); }
  var cascade = 0u;
  for (var i = 0u; i < 3u; i++) {
    if (i32(i + 1u) >= count || viewDepth <= aura.u_graphCascadeSplits[i]) { break; }
    cascade += 1u;
  }
  let params = aura.u_graphCascadeParams[cascade];
  let texel = aura.u_graphCascadeTexels[cascade];
  let clip = aura.u_graphCascadeMatrices[cascade] * vec4<f32>(world + n * params.w, 1.0);
  let projected = clip.xyz / max(clip.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return 1.0; }
  let nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0) * params.z * max(texel.x, texel.y);
  let depth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  let sampleCount = clamp(i32(texel.z), 1, 32);
  var occlusion = 0.0;
  var weights = 0.0;
  for (var i = 0u; i < 32u; i++) {
    if (i32(i) >= sampleCount) { break; }
    let tap = aura.u_graphCascadeSamples[cascade * 32u + i];
    let weight = max(tap.z, 0.0);
    let receiver = depth - params.y - slope * max(1.0, length(tap.xy));
    occlusion += select(0.0, weight, receiver > auraGraphCascadeDepth(cascade, uv + tap.xy * texel.xy));
    weights += weight;
  }
  return mix(1.0, 1.0 - select(0.0, occlusion / max(weights, 0.0001), weights > 0.0), clamp(params.x, 0.0, 1.0));
}
// @graph-shadow end cascade
${graphPunctualPcfWgsl("point")}
${graphPunctualPcfWgsl("spot")}
// @graph-shadow begin point
fn auraGraphPointShadow(world: vec3<f32>, n: vec3<f32>, l: vec3<f32>) -> f32 {
  if (aura.u_pointShadowMapEnabled < 0.5) { return 1.0; }
  let direction = world - aura.u_pointShadowLightPosition;
  if (length(direction) > aura.u_pointShadowRange) { return 1.0; }
  let a = abs(direction);
  var face = 0u;
  if (a.x >= a.y && a.x >= a.z) { face = select(1u, 0u, direction.x >= 0.0); }
  else if (a.y >= a.z) { face = select(3u, 2u, direction.y >= 0.0); }
  else { face = select(5u, 4u, direction.z >= 0.0); }
  let clip = aura.u_pointShadowFaceMatrices[face] * vec4<f32>(world, 1.0);
  let projected = clip.xyz / max(clip.w, 0.0001);
  let localUv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (any(localUv < vec2<f32>(0.0)) || any(localUv > vec2<f32>(1.0))) { return 1.0; }
  let rect = aura.u_pointShadowFaceRects[face];
  return auraGraphPointPcf(rect.xy + localUv * rect.zw, projected.z * 0.5 + 0.5, n, l);
}
// @graph-shadow end point
// @graph-shadow begin spot
fn auraGraphSpotShadow(world: vec3<f32>, n: vec3<f32>, l: vec3<f32>) -> f32 {
  if (aura.u_spotShadowMapEnabled < 0.5) { return 1.0; }
  let delta = world - aura.u_spotShadowLightPosition;
  let distanceToLight = max(length(delta), 0.0001);
  let axis = aura.u_spotShadowLightDirection / max(length(aura.u_spotShadowLightDirection), 0.0001);
  if (distanceToLight > aura.u_spotShadowRange || dot(delta / distanceToLight, axis) < cos(aura.u_spotShadowCone.x)) { return 1.0; }
  let clip = aura.u_spotShadowMatrix * vec4<f32>(world, 1.0);
  let projected = clip.xyz / max(clip.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return 1.0; }
  return auraGraphSpotPcf(uv, projected.z * 0.5 + 0.5, n, l);
}
// @graph-shadow end spot
// @graph-shadow begin local
fn auraGraphAtlasDepth(uv: vec2<f32>) -> f32 {
  return textureSampleLevel(u_localShadowAtlasTexture, u_localShadowAtlasSampler, vec2<f32>(uv.x, 1.0 - uv.y), 0.0).r;
}
fn auraGraphAtlasCompare(uv: vec2<f32>, reference: f32) -> f32 {
  let texel = aura.u_localShadowAtlasTexel;
  let pixel = uv / texel - vec2<f32>(0.5);
  let base = floor(pixel);
  let f = fract(pixel);
  let origin = (base + vec2<f32>(0.5)) * texel;
  let a = select(0.0, 1.0, reference <= auraGraphAtlasDepth(origin));
  let b = select(0.0, 1.0, reference <= auraGraphAtlasDepth(origin + vec2<f32>(texel.x, 0.0)));
  let c = select(0.0, 1.0, reference <= auraGraphAtlasDepth(origin + vec2<f32>(0.0, texel.y)));
  let d = select(0.0, 1.0, reference <= auraGraphAtlasDepth(origin + texel));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn auraGraphAtlasShadow(kind: f32, slot: f32, lightPosition: vec3<f32>, world: vec3<f32>, n: vec3<f32>, l: vec3<f32>) -> f32 {
  if (aura.u_localShadowParams.x <= 0.0 || slot < 0.5 || kind < 0.5 || kind > 2.5) { return 1.0; }
  var tile = i32(slot + 0.5) - 1;
  if (kind < 1.5) {
    let direction = world - lightPosition;
    let a = abs(direction);
    var face = 0;
    if (a.x >= a.y && a.x >= a.z) { face = select(1, 0, direction.x >= 0.0); }
    else if (a.y >= a.z) { face = select(3, 2, direction.y >= 0.0); }
    else { face = select(5, 4, direction.z >= 0.0); }
    tile += face;
  }
  if (tile < 0 || tile >= 6) { return 1.0; }
  let axis = aura.u_localShadowMatrices[u32(tile)] * vec4<f32>(world, 1.0);
  if (axis.w <= 0.0) { return 1.0; }
  let row = u32(tile / 4);
  let texelWorld = axis.w * aura.u_localShadowTexelScale[row][u32(tile % 4)];
  let nl = clamp(abs(dot(n, l)), 0.0, 1.0);
  let slope = min(sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.05), 8.0);
  let receiver = world + n * (texelWorld * aura.u_localShadowParams.w);
  let projectedPosition = aura.u_localShadowMatrices[u32(tile)] * vec4<f32>(receiver, 1.0);
  if (projectedPosition.w <= 0.0) { return 1.0; }
  let projected = projectedPosition.xyz / projectedPosition.w;
  if (projected.x < 0.0 || projected.x > 1.0 || projected.y < 0.0 || projected.y > 1.0 || projected.z > 1.0) { return 1.0; }
  let biased = receiver + l * (texelWorld * (aura.u_localShadowParams.y + aura.u_localShadowParams.z * slope));
  let biasedPosition = aura.u_localShadowMatrices[u32(tile)] * vec4<f32>(biased, 1.0);
  let reference = clamp(biasedPosition.z / max(biasedPosition.w, 0.0001), 0.0, 1.0);
  let rect = aura.u_localShadowRects[u32(tile)];
  let halfTexel = 0.5 * aura.u_localShadowAtlasTexel;
  let uv = clamp(rect.xy + projected.xy * rect.zw, rect.xy + halfTexel, rect.xy + rect.zw - halfTexel);
  return mix(1.0, auraGraphAtlasCompare(uv, reference), clamp(aura.u_localShadowParams.x, 0.0, 1.0));
}
// @graph-shadow end local
fn auraGraphDirect(n: vec3<f32>, v: vec3<f32>, base: vec3<f32>, rough: f32, metal: f32, world: vec3<f32>, screen: vec2<f32>, contactScreen: vec2<f32>) -> vec3<f32> {
  let clustered = aura.u_clusteredLightEnabled > 0.5;
  var cluster = 0;
  var count = min(i32(aura.u_lightCount), 16);
  if (clustered) {
    let grid = max(aura.u_clusterGridSize, vec2<f32>(1.0));
    let tile = vec2<i32>(clamp(floor(min(screen, aura.u_clusterViewportSize) / 64.0), vec2<f32>(0.0), grid - vec2<f32>(1.0)));
    cluster = tile.y * i32(grid.x) + tile.x;
    count = min(i32(auraGraphSamplePixel(u_clusterLightIndicesTexture, u_clusterLightIndicesSampler, vec2<i32>(0, cluster)).g), 64);
  }
  var total = vec3<f32>(0.0);
  for (var i = 0; i < 64; i++) {
    if (i >= count) { break; }
    var c: vec4<f32>; var p: vec4<f32>; var d: vec4<f32>; var s: vec4<f32>; var right: vec4<f32>; var up: vec4<f32>;
    var lightIndex = i;
    if (clustered) {
      lightIndex = i32(auraGraphSamplePixel(u_clusterLightIndicesTexture, u_clusterLightIndicesSampler, vec2<i32>(i, cluster)).r);
      c = auraGraphSamplePixel(u_clusterLightDataTexture, u_clusterLightDataSampler, vec2<i32>(0, lightIndex));
      p = auraGraphSamplePixel(u_clusterLightDataTexture, u_clusterLightDataSampler, vec2<i32>(1, lightIndex));
      d = auraGraphSamplePixel(u_clusterLightDataTexture, u_clusterLightDataSampler, vec2<i32>(2, lightIndex));
      s = auraGraphSamplePixel(u_clusterLightDataTexture, u_clusterLightDataSampler, vec2<i32>(3, lightIndex));
      right = auraGraphSamplePixel(u_clusterLightDataTexture, u_clusterLightDataSampler, vec2<i32>(4, lightIndex));
      up = auraGraphSamplePixel(u_clusterLightDataTexture, u_clusterLightDataSampler, vec2<i32>(5, lightIndex));
    } else {
      let index = u32(lightIndex * 6);
      c = aura.u_lightData[index]; p = aura.u_lightData[index + 1u];
      d = aura.u_lightData[index + 2u]; s = aura.u_lightData[index + 3u];
      right = aura.u_lightData[index + 4u];
      up = aura.u_lightData[index + 5u];
    }
    if (d.w > 2.5) { continue; }
    var l = -d.xyz / max(length(d.xyz), 0.0001);
    var attenuation = 1.0;
    if (d.w > 0.5) {
      let delta = p.xyz - world;
      let distanceToLight = length(delta);
      if (distanceToLight > 0.0001) { l = delta / distanceToLight; }
      let ratio = distanceToLight / max(p.w, 0.0001);
      let range = select(clamp(1.0 - ratio * ratio * ratio * ratio, 0.0, 1.0), 1.0, p.w <= 0.0);
      attenuation = range * range / max(distanceToLight * distanceToLight, 1.0);
    }
    if (d.w > 1.5) {
      let fromLight = world - p.xyz;
      let facing = dot(d.xyz / max(length(d.xyz), 0.0001), fromLight / max(length(fromLight), 0.0001));
      let cone = select(facing, abs(facing), up.w > 0.5);
      attenuation *= smoothstep(cos(s.x), cos(s.x * max(1.0 - s.y, 0.001)), cone);
    }
// @graph-shadow begin directional
    if (s.z > 0.5 && d.w < 0.5) { attenuation *= auraGraphShadow(world, n, l); }
// @graph-shadow end directional
// @graph-shadow begin contact
    if (s.z > 0.5 && d.w < 0.5 && lightIndex == i32(aura.u_contactShadowLightIndex)) { attenuation *= auraGraphContactShadow(contactScreen); }
// @graph-shadow end contact
// @graph-shadow begin cascade
    if (s.z > 0.5 && d.w < 0.5) { attenuation *= auraGraphSunShadow(world, n, l); }
// @graph-shadow end cascade
// @graph-shadow begin point
    if (s.z > 0.5 && d.w > 0.5 && d.w < 1.5 && distance(p.xyz, aura.u_pointShadowLightPosition) <= 0.0001) { attenuation *= auraGraphPointShadow(world, n, l); }
// @graph-shadow end point
// @graph-shadow begin spot
    if (s.z > 0.5 && d.w > 1.5 && d.w < 2.5 && distance(p.xyz, aura.u_spotShadowLightPosition) <= 0.0001 && dot(d.xyz / max(length(d.xyz), 0.0001), aura.u_spotShadowLightDirection / max(length(aura.u_spotShadowLightDirection), 0.0001)) >= 0.9999) { attenuation *= auraGraphSpotShadow(world, n, l); }
// @graph-shadow end spot
// @graph-shadow begin local
    attenuation *= auraGraphAtlasShadow(d.w, right.w, p.xyz, world, n, l);
// @graph-shadow end local
    total += auraGraphDirectLight(n, v, l, c.rgb * c.a * attenuation, base, rough, metal);
  }
  return total;
}
fn auraGraphShComponent(index: u32) -> f32 {
  return aura.u_a3dEnvSh[index / 4u][index % 4u];
}
fn auraGraphSh(index: u32) -> vec3<f32> {
  let i = index * 3u;
  return vec3<f32>(auraGraphShComponent(i), auraGraphShComponent(i + 1u), auraGraphShComponent(i + 2u));
}
fn auraGraphShIrradiance(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 0.0001);
  return max(0.886227 * auraGraphSh(0u) - 1.023328 * d.y * auraGraphSh(1u) + 1.023328 * d.z * auraGraphSh(2u)
    - 1.023328 * d.x * auraGraphSh(3u) + 0.858086 * d.x * d.y * auraGraphSh(4u) + 0.858086 * d.y * d.z * auraGraphSh(5u)
    + 0.247708 * (3.0 * d.z * d.z - 1.0) * auraGraphSh(6u) + 0.858086 * d.x * d.z * auraGraphSh(7u)
    + 0.429043 * (d.x * d.x - d.y * d.y) * auraGraphSh(8u), vec3<f32>(0.0));
}
fn auraGraphProcedural(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 0.0001);
  let c = mix(aura.u_a3dEnvGround, aura.u_a3dEnvSky, clamp(d.y * 0.5 + 0.5, 0.0, 1.0));
  return mix(c, aura.u_a3dEnvHorizon, clamp(1.0 - abs(d.y), 0.0, 1.0) * 0.55);
}
fn auraGraphEnvMap(direction: vec3<f32>, lod: f32) -> vec3<f32> {
  let d = direction / max(length(direction), 0.0001);
  let uv = vec2<f32>(fract(atan2(d.z, d.x) * 0.15915494 + 0.5 + aura.u_a3dEnvMapRotation), clamp(acos(clamp(d.y, -1.0, 1.0)) * 0.31830989, 0.0, 1.0));
  let texel = textureSampleLevel(u_a3dEnvMapTexture, u_a3dEnvMapSampler, uv, clamp(lod, 0.0, 8.0) * aura.u_a3dEnvMapMaxLod / 8.0);
  var rgb = max(texel.rgb, vec3<f32>(0.0));
  if (aura.u_a3dEnvMapEncoding > 0.5 && aura.u_a3dEnvMapEncoding < 1.5) {
    let exponent = texel.a * 255.0;
    rgb = select(vec3<f32>(0.0), max(texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), vec3<f32>(0.0)), exponent > 0.0);
  }
  return rgb * aura.u_a3dEnvMapIntensity;
}
fn auraGraphEnvDiffuse(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 0.0001);
  let hemi = mix(aura.u_a3dHemiGround, aura.u_a3dHemiSky, clamp(d.y * 0.5 + 0.5, 0.0, 1.0));
  let ambient = max(aura.u_a3dEnvAmbient - 0.5 * (aura.u_a3dHemiSky + aura.u_a3dHemiGround), vec3<f32>(0.0)) + hemi;
  let diffuse = ambient * 0.31830989;
  if (aura.u_a3dEnvMapEnabled > 0.5) { return diffuse + auraGraphEnvMap(n, 8.0); }
  if (aura.u_a3dEnvShEnabled > 0.5) { return diffuse + auraGraphShIrradiance(n) * 0.31830989; }
  return diffuse + auraGraphProcedural(n);
}
fn auraGraphEnvSpecular(r: vec3<f32>, rough: f32) -> vec3<f32> {
  if (aura.u_a3dEnvMapEnabled > 0.5) { return auraGraphEnvMap(r, rough * 8.0); }
  if (aura.u_a3dEnvShEnabled > 0.5) { return auraGraphShIrradiance(r) * 0.31830989; }
  let mean = (aura.u_a3dEnvSky + aura.u_a3dEnvHorizon + aura.u_a3dEnvGround) / 3.0;
  return mix(auraGraphProcedural(r), mean, rough * rough);
}`;

const GRAPH_ENVIRONMENT_GLSL = `
// @graph-environment begin cube
uniform samplerCube u_graphGlobalEnvCube;
uniform vec4 u_graphGlobalEnvCubeInfo;
uniform float u_graphGlobalEnvCubeEncoding;
uniform float u_graphGlobalEnvCubeDiffuseIntensity;
vec3 auraGraphGlobalCube(vec3 direction, float lod) {
  float a = u_graphGlobalEnvCubeInfo.w * 6.28318530718;
  float c = cos(a), s = sin(a);
  vec3 d = vec3(c * direction.x - s * direction.z, direction.y, s * direction.x + c * direction.z);
  vec4 texel = textureLod(u_graphGlobalEnvCube, d, clamp(lod, 0.0, u_graphGlobalEnvCubeInfo.z));
  vec3 rgb = max(texel.rgb, vec3(0.0));
  if (u_graphGlobalEnvCubeEncoding > 0.5 && u_graphGlobalEnvCubeEncoding < 1.5) {
    float exponent = texel.a * 255.0;
    rgb = exponent <= 0.0 ? vec3(0.0) : max(texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), vec3(0.0));
  }
  return rgb;
}
// @graph-environment end cube
// @graph-environment begin probe
uniform samplerCube u_prd02ProbeCubeA;
uniform samplerCube u_prd02ProbeCubeB;
uniform vec4 u_prd02ProbeCenterA;
uniform vec4 u_prd02ProbeCenterB;
uniform vec4 u_prd02ProbeOriginA;
uniform vec4 u_prd02ProbeOriginB;
uniform vec4 u_prd02ProbeHalfA;
uniform vec4 u_prd02ProbeHalfB;
uniform vec4 u_prd02ProbeWeights;
uniform float u_a3dLocalProbeIntensity;
vec3 auraGraphProbeDirection(vec3 world, vec3 direction, vec4 center, vec4 halfSize, vec4 origin) {
  if (center.w <= 0.5) return direction;
  vec3 inverseDirection = sign(direction + vec3(1e-12)) / max(abs(direction), vec3(1e-6));
  vec3 farSide = max((center.xyz + halfSize.xyz - world) * inverseDirection, (center.xyz - halfSize.xyz - world) * inverseDirection);
  float t = max(min(farSide.x, min(farSide.y, farSide.z)), 0.0);
  return world + direction * t - (origin.w > 0.5 ? origin.xyz : center.xyz);
}
vec3 auraGraphProbeRadiance(vec3 world, vec3 direction, float roughness) {
  float lod = roughness * max(u_prd02ProbeWeights.w - 1.0, 0.0);
  vec3 result = vec3(0.0);
  if (u_prd02ProbeWeights.x > 0.0) result += u_prd02ProbeWeights.x * textureLod(u_prd02ProbeCubeA, auraGraphProbeDirection(world, direction, u_prd02ProbeCenterA, u_prd02ProbeHalfA, u_prd02ProbeOriginA), lod).rgb;
  if (u_prd02ProbeWeights.y > 0.0) result += u_prd02ProbeWeights.y * textureLod(u_prd02ProbeCubeB, auraGraphProbeDirection(world, direction, u_prd02ProbeCenterB, u_prd02ProbeHalfB, u_prd02ProbeOriginB), lod).rgb;
  return result * u_a3dLocalProbeIntensity;
}
// @graph-environment end probe
// @graph-environment begin volume
uniform highp sampler2DArray u_prd02IrradianceR;
uniform highp sampler2DArray u_prd02IrradianceG;
uniform highp sampler2DArray u_prd02IrradianceB;
uniform vec4 u_prd02IrradianceMin;
uniform vec4 u_prd02IrradianceMax;
uniform vec4 u_prd02IrradianceGrid;
vec4 auraGraphVolumeSample(highp sampler2DArray field, ivec3 lo, ivec3 hi, vec3 t) {
  vec4 a = mix(texelFetch(field, ivec3(lo.x, lo.y, lo.z), 0), texelFetch(field, ivec3(hi.x, lo.y, lo.z), 0), t.x);
  vec4 b = mix(texelFetch(field, ivec3(lo.x, hi.y, lo.z), 0), texelFetch(field, ivec3(hi.x, hi.y, lo.z), 0), t.x);
  vec4 c = mix(texelFetch(field, ivec3(lo.x, lo.y, hi.z), 0), texelFetch(field, ivec3(hi.x, lo.y, hi.z), 0), t.x);
  vec4 d = mix(texelFetch(field, ivec3(lo.x, hi.y, hi.z), 0), texelFetch(field, ivec3(hi.x, hi.y, hi.z), 0), t.x);
  return mix(mix(a, b, t.y), mix(c, d, t.y), t.z);
}
vec3 auraGraphVolumeBlend(vec3 globalIrradiance, vec3 world, vec3 normal) {
  ivec3 grid = max(ivec3(u_prd02IrradianceGrid.xyz), ivec3(1));
  vec3 cell = (u_prd02IrradianceMax.xyz - u_prd02IrradianceMin.xyz) / vec3(grid);
  vec3 n = normal / max(length(normal), 0.0001);
  vec3 p = world + n * cell * 0.5;
  vec3 outside = max(max(u_prd02IrradianceMin.xyz - p, p - u_prd02IrradianceMax.xyz), vec3(0.0));
  vec3 halfCells = outside / (0.5 * cell);
  float fade = clamp(1.0 - max(halfCells.x, max(halfCells.y, halfCells.z)), 0.0, 1.0);
  vec3 coord = clamp((p - u_prd02IrradianceMin.xyz) / cell - 0.5, vec3(0.0), vec3(grid - 1));
  ivec3 lo = ivec3(floor(coord)), hi = min(lo + 1, grid - 1);
  vec3 t = fract(coord);
  vec4 basis = vec4(0.282095 * 3.14159265, -0.488603 * n.y * (2.0 * 3.14159265 / 3.0), 0.488603 * n.z * (2.0 * 3.14159265 / 3.0), -0.488603 * n.x * (2.0 * 3.14159265 / 3.0));
  vec3 local = max(vec3(dot(auraGraphVolumeSample(u_prd02IrradianceR, lo, hi, t), basis), dot(auraGraphVolumeSample(u_prd02IrradianceG, lo, hi, t), basis), dot(auraGraphVolumeSample(u_prd02IrradianceB, lo, hi, t), basis)), vec3(0.0)) * u_prd02IrradianceGrid.w;
  return mix(globalIrradiance, local, fade);
}
// @graph-environment end volume`;

const GRAPH_ENVIRONMENT_WGSL = `
// @graph-environment begin cube
fn auraGraphGlobalCube(direction: vec3<f32>, lod: f32) -> vec3<f32> {
  let angle = aura.u_graphGlobalEnvCubeInfo.w * 6.28318530718;
  let c = cos(angle); let s = sin(angle);
  let d = vec3<f32>(c * direction.x - s * direction.z, direction.y, s * direction.x + c * direction.z);
  let texel = textureSampleLevel(u_graphGlobalEnvCubeTexture, u_graphGlobalEnvCubeSampler, d, clamp(lod, 0.0, aura.u_graphGlobalEnvCubeInfo.z));
  var rgb = max(texel.rgb, vec3<f32>(0.0));
  if (aura.u_graphGlobalEnvCubeEncoding > 0.5 && aura.u_graphGlobalEnvCubeEncoding < 1.5) {
    let exponent = texel.a * 255.0;
    rgb = select(vec3<f32>(0.0), max(texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), vec3<f32>(0.0)), exponent > 0.0);
  }
  return rgb;
}
// @graph-environment end cube
// @graph-environment begin probe
fn auraGraphProbeDirection(world: vec3<f32>, direction: vec3<f32>, center: vec4<f32>, halfSize: vec4<f32>, origin: vec4<f32>) -> vec3<f32> {
  if (center.w <= 0.5) { return direction; }
  let inverseDirection = sign(direction + vec3<f32>(1e-12)) / max(abs(direction), vec3<f32>(1e-6));
  let farSide = max((center.xyz + halfSize.xyz - world) * inverseDirection, (center.xyz - halfSize.xyz - world) * inverseDirection);
  let t = max(min(farSide.x, min(farSide.y, farSide.z)), 0.0);
  return world + direction * t - select(center.xyz, origin.xyz, origin.w > 0.5);
}
fn auraGraphProbeRadiance(world: vec3<f32>, direction: vec3<f32>, roughness: f32) -> vec3<f32> {
  let lod = roughness * max(aura.u_prd02ProbeWeights.w - 1.0, 0.0);
  var result = vec3<f32>(0.0);
  if (aura.u_prd02ProbeWeights.x > 0.0) { result += aura.u_prd02ProbeWeights.x * textureSampleLevel(u_prd02ProbeCubeATexture, u_prd02ProbeCubeASampler, auraGraphProbeDirection(world, direction, aura.u_prd02ProbeCenterA, aura.u_prd02ProbeHalfA, aura.u_prd02ProbeOriginA), lod).rgb; }
  if (aura.u_prd02ProbeWeights.y > 0.0) { result += aura.u_prd02ProbeWeights.y * textureSampleLevel(u_prd02ProbeCubeBTexture, u_prd02ProbeCubeBSampler, auraGraphProbeDirection(world, direction, aura.u_prd02ProbeCenterB, aura.u_prd02ProbeHalfB, aura.u_prd02ProbeOriginB), lod).rgb; }
  return result * aura.u_a3dLocalProbeIntensity;
}
// @graph-environment end probe
// @graph-environment begin volume
fn auraGraphVolumeSample(field: texture_2d_array<f32>, lo: vec3<i32>, hi: vec3<i32>, t: vec3<f32>) -> vec4<f32> {
  let a = mix(textureLoad(field, vec2<i32>(lo.x, lo.y), lo.z, 0), textureLoad(field, vec2<i32>(hi.x, lo.y), lo.z, 0), t.x);
  let b = mix(textureLoad(field, vec2<i32>(lo.x, hi.y), lo.z, 0), textureLoad(field, vec2<i32>(hi.x, hi.y), lo.z, 0), t.x);
  let c = mix(textureLoad(field, vec2<i32>(lo.x, lo.y), hi.z, 0), textureLoad(field, vec2<i32>(hi.x, lo.y), hi.z, 0), t.x);
  let d = mix(textureLoad(field, vec2<i32>(lo.x, hi.y), hi.z, 0), textureLoad(field, vec2<i32>(hi.x, hi.y), hi.z, 0), t.x);
  return mix(mix(a, b, t.y), mix(c, d, t.y), t.z);
}
fn auraGraphVolumeBlend(globalIrradiance: vec3<f32>, world: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let grid = max(vec3<i32>(aura.u_prd02IrradianceGrid.xyz), vec3<i32>(1));
  let cell = (aura.u_prd02IrradianceMax.xyz - aura.u_prd02IrradianceMin.xyz) / vec3<f32>(grid);
  let n = normal / max(length(normal), 0.0001);
  let p = world + n * cell * 0.5;
  let outside = max(max(aura.u_prd02IrradianceMin.xyz - p, p - aura.u_prd02IrradianceMax.xyz), vec3<f32>(0.0));
  let halfCells = outside / (0.5 * cell);
  let fade = clamp(1.0 - max(halfCells.x, max(halfCells.y, halfCells.z)), 0.0, 1.0);
  let coord = clamp((p - aura.u_prd02IrradianceMin.xyz) / cell - vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(grid - vec3<i32>(1)));
  let lo = vec3<i32>(floor(coord)); let hi = min(lo + vec3<i32>(1), grid - vec3<i32>(1));
  let t = fract(coord);
  let basis = vec4<f32>(0.282095 * 3.14159265, -0.488603 * n.y * (2.0 * 3.14159265 / 3.0), 0.488603 * n.z * (2.0 * 3.14159265 / 3.0), -0.488603 * n.x * (2.0 * 3.14159265 / 3.0));
  let local = max(vec3<f32>(dot(auraGraphVolumeSample(u_prd02IrradianceRTexture, lo, hi, t), basis), dot(auraGraphVolumeSample(u_prd02IrradianceGTexture, lo, hi, t), basis), dot(auraGraphVolumeSample(u_prd02IrradianceBTexture, lo, hi, t), basis)), vec3<f32>(0.0)) * aura.u_prd02IrradianceGrid.w;
  return mix(globalIrradiance, local, fade);
}
// @graph-environment end volume`;

const GRAPH_FOG_WGSL = `
fn auraGraphFog(color: vec3<f32>, world: vec3<f32>, screen: vec2<f32>) -> vec3<f32> {
  if (aura.u_environmentFogEnabled < 0.5) { return color; }
  let distanceToCamera = length(aura.u_cameraPosition - world);
  var factor = 0.0;
  if (aura.u_environmentFogMode < 1.5) {
    factor = (distanceToCamera - aura.u_environmentFogNear) / max(aura.u_environmentFogFar - aura.u_environmentFogNear, 0.000001);
  } else if (aura.u_environmentFogMode < 2.5) {
    factor = 1.0 - exp(-max(aura.u_environmentFogDensity, 0.0) * distanceToCamera);
  } else {
    let density = max(aura.u_environmentFogDensity, 0.0) * distanceToCamera;
    factor = 1.0 - exp(-density * density);
  }
  var height = 1.0;
  if (aura.u_environmentFogHeightFalloff > 0.0) {
    height = exp(-max(0.0, world.y - aura.u_environmentFogHeightReference) * aura.u_environmentFogHeightFalloff);
  }
  factor = clamp(factor * height, 0.0, 1.0) * clamp(aura.u_environmentFogMaxOpacity, 0.0, 1.0);
  var fogged = mix(color, aura.u_environmentFogColor, factor);
  if (aura.u_volumetricIntensity > 0.0) {
    let view = (aura.u_cameraPosition - world) / max(distanceToCamera, 0.000001);
    let lobe = pow(max(dot(view, aura.u_volumetricLightDirection), 0.0), 6.0);
    let inscatter = aura.u_volumetricIntensity * height * lobe * aura.u_volumetricLightColor * (0.15 + 0.85 * factor);
    let dither = fract(sin(dot(screen, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5;
    fogged += inscatter + vec3<f32>(dither / 255.0);
  }
  return fogged;
}`;

const GRAPH_CLIPPING_GLSL = `
uniform vec4 u_a3dClipPlanes[8];
uniform vec4 u_a3dClipGroups[2];
uniform float u_a3dClipGroupCount;
bool auraGraphIsClipped(vec3 localPosition, vec3 worldPosition) {
  for (int g = 0; g < 2; g++) {
    if (float(g) >= u_a3dClipGroupCount) break;
    vec4 group = u_a3dClipGroups[g];
    vec3 point = group.w > 0.5 ? localPosition : worldPosition;
    bool anyMode = group.z > 0.5;
    bool retained = !anyMode;
    for (int p = 0; p < 8; p++) {
      if (float(p) < group.x || float(p) >= group.x + group.y) continue;
      bool inside = dot(u_a3dClipPlanes[p], vec4(point, 1.0)) >= 0.0;
      retained = anyMode ? (retained || inside) : (retained && inside);
    }
    if (!retained) return true;
  }
  return false;
}`;

const GRAPH_CLIPPING_WGSL = `
fn auraGraphIsClipped(localPosition: vec3<f32>, worldPosition: vec3<f32>) -> bool {
  for (var g = 0u; g < 2u; g++) {
    if (f32(g) >= aura.u_a3dClipGroupCount) { break; }
    let group = aura.u_a3dClipGroups[g];
    let point = select(worldPosition, localPosition, group.w > 0.5);
    let anyMode = group.z > 0.5;
    var retained = !anyMode;
    for (var p = 0u; p < 8u; p++) {
      if (f32(p) < group.x || f32(p) >= group.x + group.y) { continue; }
      let inside = dot(aura.u_a3dClipPlanes[p], vec4<f32>(point, 1.0)) >= 0.0;
      if (anyMode) { retained = retained || inside; } else { retained = retained && inside; }
    }
    if (!retained) { return true; }
  }
  return false;
}`;

const GRAPH_DEPTH_GLSL = `#version 300 es
precision highp float;
in vec3 v_a3dGraphDepthLocal;
in vec3 v_a3dGraphDepthWorld;
in float v_a3dGraphViewDistance;
uniform vec4 u_a3dClipPlanes[8];
uniform vec4 u_a3dClipGroups[2];
uniform float u_a3dClipGroupCount;
uniform vec2 u_a3dLogDepthRange;
uniform float u_a3dLogDepthEnabled;
out vec4 a3dDepthColor;
void main() {
  for (int g = 0; g < 2; g++) {
    if (float(g) >= u_a3dClipGroupCount) break;
    vec4 group = u_a3dClipGroups[g];
    vec3 point = group.w > 0.5 ? v_a3dGraphDepthLocal : v_a3dGraphDepthWorld;
    bool anyMode = group.z > 0.5;
    bool retained = !anyMode;
    for (int p = 0; p < 8; p++) {
      if (float(p) < group.x || float(p) >= group.x + group.y) continue;
      bool inside = dot(u_a3dClipPlanes[p], vec4(point, 1.0)) >= 0.0;
      retained = anyMode ? (retained || inside) : (retained && inside);
    }
    if (!retained) discard;
  }
  float depth = gl_FragCoord.z;
  if (u_a3dLogDepthEnabled > 0.5) {
    float nearLog = log(u_a3dLogDepthRange.x);
    depth = clamp((log(max(v_a3dGraphViewDistance, u_a3dLogDepthRange.x)) - nearLog) / (log(u_a3dLogDepthRange.y) - nearLog), 0.0, 1.0);
  }
  gl_FragDepth = depth;
  a3dDepthColor = vec4(vec3(depth), 1.0);
}`;

function graphDepthFragmentWgsl(
  firstLocation: number,
  varyings: readonly ShaderGraphBuiltin[] = [],
  alphaSetup: readonly string[] = [],
  alphaDiscard?: string,
  storageDeclarations: readonly string[] = [],
  graphDeclarations: readonly string[] = []
): string {
  return `/* @aura3d-bindings */
${graphDeclarations.join("\n")}
${storageDeclarations.join("\n")}
struct AuraGraphDepthInput {
  @builtin(position) position: vec4<f32>,
${varyings.map((name, index) => `  @location(${index}) v_${name}: ${wgslType(BUILTINS[name])},`).join("\n")}
  @location(${firstLocation}) localPosition: vec3<f32>,
  @location(${firstLocation + 1}) worldPosition: vec3<f32>,
  @location(${firstLocation + 2}) viewDistance: f32,
};
struct AuraGraphDepthOutput { @location(0) color: vec4<f32>, @builtin(frag_depth) depth: f32, };
@fragment fn fs_main(input: AuraGraphDepthInput) -> AuraGraphDepthOutput {
  for (var g = 0u; g < 2u; g++) {
    if (f32(g) >= aura.u_a3dClipGroupCount) { break; }
    let group = aura.u_a3dClipGroups[g];
    let point = select(input.worldPosition, input.localPosition, group.w > 0.5);
    let anyMode = group.z > 0.5;
    var retained = !anyMode;
    for (var p = 0u; p < 8u; p++) {
      if (f32(p) < group.x || f32(p) >= group.x + group.y) { continue; }
      let inside = dot(aura.u_a3dClipPlanes[p], vec4<f32>(point, 1.0)) >= 0.0;
      if (anyMode) { retained = retained || inside; } else { retained = retained && inside; }
    }
    if (!retained) { discard; }
  }
${alphaSetup.map((line) => `  ${line}`).join("\n")}
${alphaDiscard ? `  ${alphaDiscard}` : ""}
  var depth = input.position.z;
  if (aura.u_a3dLogDepthEnabled > 0.5) {
    let nearLog = log(aura.u_a3dLogDepthRange.x);
    depth = clamp((log(max(input.viewDistance, aura.u_a3dLogDepthRange.x)) - nearLog) / (log(aura.u_a3dLogDepthRange.y) - nearLog), 0.0, 1.0);
  }
  return AuraGraphDepthOutput(vec4<f32>(depth, depth, depth, 1.0), depth);
}`;
}

// The portable graph variants use the same array-or-data-texture palette as
// the renderer's legacy skinning binder. Graph position expressions see the
// skinned local position, just as they do in ProgramGenerator's deform hook.
const GRAPH_SKINNING_WGSL = `
fn auraGraphJoint(raw: f32) -> mat4x4<f32> {
  let joint = clamp(i32(raw), 0, max(i32(aura.u_jointCount) - 1, 0));
  if (aura.u_jointPaletteMode > 0.5) {
    let first = joint * 4;
    let width = max(i32(aura.u_jointPaletteTextureSize.x), 1);
    let row = first / width;
    let column = first - row * width;
    return mat4x4<f32>(
      textureLoad(u_jointPaletteTextureTexture, vec2<i32>(column, row), 0),
      textureLoad(u_jointPaletteTextureTexture, vec2<i32>(column + 1, row), 0),
      textureLoad(u_jointPaletteTextureTexture, vec2<i32>(column + 2, row), 0),
      textureLoad(u_jointPaletteTextureTexture, vec2<i32>(column + 3, row), 0));
  }
  return aura.u_jointMatrices[u32(min(joint, 95))];
}
fn auraGraphSkin4(joints: vec4<f32>, weights: vec4<f32>) -> mat4x4<f32> {
  return auraGraphJoint(joints.x) * weights.x + auraGraphJoint(joints.y) * weights.y
    + auraGraphJoint(joints.z) * weights.z + auraGraphJoint(joints.w) * weights.w;
}`;

/**
 * Produce standalone unlit stages or PBR hook expressions, plus WGSL compute.
 * Material graphs with physical outputs also get standalone scene-lit
 * portable stages for both backends. Their expressions remain available to
 * generated-program consumers in `material.vertex` and `material.fragment`.
 */
export function compileShaderGraph(graph: ShaderGraphDocument, target: ShaderGraphTarget, options: { readonly fog?: boolean; readonly skinning?: 4 | 8 } = {}): ShaderGraphCompileResult {
  if (options.skinning !== undefined && (graph?.stage !== "material" || (options.skinning !== 4 && options.skinning !== 8))) {
    throw new ShaderGraphError([{ code: "invalid-skinning", message: "skinning variants require a material graph and four or eight influences" }]);
  }
  const diagnostics = validateShaderGraph(graph, target);
  if (diagnostics.length) throw new ShaderGraphError(diagnostics);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const structs = new Map((graph.structs ?? []).map((entry) => [entry.name, entry]));
  const bindings = bindingList(graph.resources ?? [], graph.stage, structs);
  const resourceKinds = new Map(bindings.map((binding) => [binding.name, binding.kind]));
  const uniformLayouts = new Map<string, UniformBlockLayout>();
  const uniformRoots = new Map<string, ShaderDataLayout>();
  for (const binding of bindings) if (binding.kind === "uniform" && binding.dataType) {
    const layout: UniformBlockLayout = {
      name: `auraGraph_uniform_${graphSymbol(binding.name)}`, group: binding.group, binding: binding.binding,
      members: [{ name: "value", type: binding.dataType }]
    };
    uniformLayouts.set(binding.name, layout);
    uniformRoots.set(binding.name, deriveUniformDataLayout(layout, "wgsl-uniform").members![0]!.layout);
  }
  // Trace only access chains rooted in aggregate uniforms. This keeps the
  // portable binder's WGSL paths contiguous so it can insert array padding.
  const uniformPathLayout = (id: string, scopeNodes: ReadonlyMap<string, ShaderGraphNode>): ShaderDataLayout | undefined => {
    if (scopeNodes !== nodes) return undefined;
    const node = nodes.get(id);
    if (!node) return undefined;
    if (node.op === "uniform") return uniformRoots.get(node.resource ?? "");
    if (node.op !== "structField" && node.op !== "arrayIndex") return undefined;
    const parent = uniformPathLayout(node.inputs![0]!, scopeNodes);
    return node.op === "structField" ? parent?.members?.find((member) => member.name === node.name)?.layout : parent?.element;
  };
  const emittedAlignment = (layout: ShaderDataLayout): number =>
    typeof layout.type !== "string" && layout.type.kind === "array" ? emittedAlignment(layout.element!) : layout.alignment;
  const needsArrayWrapper = (layout: ShaderDataLayout): boolean => {
    const element = layout.element!;
    const alignment = emittedAlignment(element);
    return Math.ceil(element.size / alignment) * alignment !== layout.stride;
  };
  const sources: Record<string, string> = Object.create(null) as Record<string, string>;
  const expressionCache = new Map<string, string>();
  const usedBuiltins = new Set<ShaderGraphBuiltin>();
  const atomicResources = new Set<string>();
  const scanStatements = (statements: readonly ShaderGraphStatement[]): void => {
    for (const statement of statements) {
      if (statement.op === "atomicAdd") atomicResources.add(statement.resource);
      else if (statement.op === "if") { scanStatements(statement.then); scanStatements(statement.otherwise ?? []); }
      else if (statement.op === "loop") scanStatements(statement.body);
    }
  };
  scanStatements(graph.statements ?? []);
  const expr = (
    id: string,
    shaderStage: "vertex" | "fragment" | "compute" = graph.stage === "compute" ? "compute" : "fragment",
    scopeNodes: ReadonlyMap<string, ShaderGraphNode> = nodes,
    cache: Map<string, string> = expressionCache,
    record = true
  ): string => {
    const cacheKey = `${shaderStage}:${id}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const n = scopeNodes.get(id)!;
    const a = (n.inputs ?? []).map((input) => expr(input, shaderStage, scopeNodes, cache, record));
    const name = n.resource ?? "";
    let value: string;
    switch (n.op) {
      case "constant": value = literal(n.value!, n.type, target); break;
      case "input": usedBuiltins.add(n.name as ShaderGraphBuiltin); value = `auraGraph_${n.name}`; break;
      case "local": value = `auraGraph_local_${n.name}`; break;
      case "output": value = `auraGraph_output_${n.name}`; break;
      case "parameter": value = `auraGraph_param_${graphSymbol(n.name!)}`; break;
      case "structConstruct": value = `${target === "glsl" ? glslType(n.type) : wgslType(n.type)}(${a.join(", ")})`; break;
      case "structField": {
        const isUniform = uniformPathLayout(n.id, scopeNodes) !== undefined;
        value = isUniform
          ? `${a[0]}.${target === "glsl" ? `auraGraph_field_${graphSymbol(n.name!)}` : n.name}`
          : `(${a[0]}).auraGraph_field_${graphSymbol(n.name!)}`;
        if (isUniform && target === "wgsl" && n.type === "bool") value = `(${value} != 0u)`;
        break;
      }
      case "arrayIndex": {
        const layout = uniformPathLayout(n.inputs![0]!, scopeNodes);
        value = layout ? `${a[0]}[${a[1]}]` : `(${a[0]})[${a[1]}]`;
        if (layout && target === "wgsl" && graph.stage === "compute" && needsArrayWrapper(layout)) value += ".value";
        if (layout && target === "wgsl" && n.type === "bool") value = `(${value} != 0u)`;
        break;
      }
      case "call": value = `auraGraph_fn_${graphSymbol(n.name!)}(${a.join(", ")})`; break;
      case "noise": {
        const inputType = scopeNodes.get(n.inputs![0]!)!.type;
        const dimension = inputType === "f32" ? 1 : Number(inputType.slice(-1));
        value = `auraGraph_noise${dimension}(${a[0]})`;
        break;
      }
      case "uniform":
        if (graph.stage === "compute") value = n.type === "bool" ? `(auraGraph_resource_${name} != 0u)` : `auraGraph_resource_${name}${uniformLayouts.has(name) ? ".value" : ""}`;
        else if (target === "glsl") value = `auraGraph_resource_${name}`;
        else if (n.type === "bool") value = `(aura.u_auraGraph_resource_${name} != 0u)`;
        else value = `aura.u_auraGraph_resource_${name}`;
        break;
      case "construct": value = `${target === "glsl" ? glslType(n.type) : wgslType(n.type)}(${a.join(", ")})`; break;
      case "swizzle": value = `(${a[0]}).${n.components}`; break;
      case "textureSample":
        if (target === "glsl") value = shaderStage === "vertex" ? `textureLod(auraGraph_resource_${name}, ${a[0]}, 0.0)` : `texture(auraGraph_resource_${name}, ${a[0]})`;
        else if (graph.stage === "compute") value = `textureSampleLevel(auraGraph_resource_${name}, auraGraph_sampler_${name}, ${a[0]}, 0.0)`;
        else if (shaderStage === "vertex") value = `textureSampleLevel(u_auraGraph_resource_${name}Texture, u_auraGraph_resource_${name}Sampler, ${a[0]}, 0.0)`;
        else value = `textureSample(u_auraGraph_resource_${name}Texture, u_auraGraph_resource_${name}Sampler, ${a[0]})`;
        break;
      case "storageLoad": value = atomicResources.has(name) ? `atomicLoad(&auraGraph_resource_${name}[${a[0]}])` : `auraGraph_resource_${name}[${a[0]}]`; break;
      case "textureLoad": {
        if (resourceKinds.get(name) === "depth2d") {
          // Graph pixel coordinates use the same lower-left origin as the
          // viewport and GLSL. WebGPU textureLoad addresses from the top-left.
          if (target === "glsl") value = `texelFetch(auraGraph_resource_${name}, ivec2(${a[0]}), 0).r`;
          else {
            const texture = graph.stage === "compute" ? `auraGraph_resource_${name}` : `u_auraGraph_resource_${name}Texture`;
            value = `textureLoad(${texture}, vec2<i32>(i32((${a[0]}).x), i32(textureDimensions(${texture}, 0).y) - 1 - i32((${a[0]}).y)), 0)`;
          }
        } else value = `textureLoad(auraGraph_resource_${name}, vec2<i32>(${a[0]}))`;
        break;
      }
      case "add": case "sub": case "mul": case "div": case "less": case "greater": case "equal": value = `(${a[0]} ${{ add: "+", sub: "-", mul: "*", div: "/", less: "<", greater: ">", equal: "==" }[n.op]} ${a[1]})`; break;
      // WGSL's % is a truncating remainder, unlike the legacy GLSL mod.
      // Emit the floor definition for both targets, including negative divisors.
      case "mod": value = `(${a[0]} - ${a[1]} * floor(${a[0]} / ${a[1]}))`; break;
      case "atan2": value = `${target === "glsl" ? "atan" : "atan2"}(${a[0]}, ${a[1]})`; break;
      // WGSL's distance is a vector operation; scalar distance is abs(a - b).
      case "distance": value = scopeNodes.get(n.inputs![0]!)!.type === "f32" ? `abs(${a[0]} - ${a[1]})` : `distance(${a[0]}, ${a[1]})`; break;
      case "negate": value = `(-${a[0]})`; break;
      case "saturate": case "oneMinus": {
        const one = n.type === "f32" ? "1.0" : `${target === "glsl" ? glslType(n.type) : wgslType(n.type)}(1.0)`;
        if (n.op === "oneMinus") value = `(${one} - ${a[0]})`;
        else {
          const zero = n.type === "f32" ? "0.0" : `${target === "glsl" ? glslType(n.type) : wgslType(n.type)}(0.0)`;
          value = `clamp(${a[0]}, ${zero}, ${one})`;
        }
        break;
      }
      case "select": value = structName(n.type) !== undefined ? `auraGraph_select_${graphSymbol(structName(n.type)!)}(${a[0]}, ${a[1]}, ${a[2]})` : target === "glsl" ? `(${a[0]} ? ${a[1]} : ${a[2]})` : `select(${a[2]}, ${a[1]}, ${a[0]})`; break;
      default: value = `${n.op}(${a.join(", ")})`; break;
    }
    if (value.length > 1_000_000) throw new ShaderGraphError([{ code: "graph-limit", nodeId: id, message: "expanded shader expression exceeds the 1 MB limit" }]);
    if (record) sources[id] = value;
    cache.set(cacheKey, value);
    return value;
  };
  const graphDeclarations: string[] = [];
  const orderedStructs: ShaderGraphStruct[] = [];
  const visitedStructs = new Set<string>();
  const orderStruct = (name: string): void => {
    if (visitedStructs.has(name)) return;
    visitedStructs.add(name);
    const declaration = structs.get(name)!;
    for (const field of declaration.fields) {
      const dependency = nestedStructName(field.type);
      if (dependency !== undefined) orderStruct(dependency);
    }
    orderedStructs.push(declaration);
  };
  for (const name of structs.keys()) orderStruct(name);
  const typeName = target === "glsl" ? glslType : wgslType;
  for (const declaration of orderedStructs) {
    const fields = declaration.fields.map((field) => target === "glsl"
      ? `  ${glslDeclaration(field.type, `auraGraph_field_${graphSymbol(field.name)}`)};`
      : `  auraGraph_field_${graphSymbol(field.name)}: ${typeName(field.type)},`);
    graphDeclarations.push([`struct auraGraph_struct_${graphSymbol(declaration.name)} {`, ...fields, "};"].join("\n"));
  }
  if (target === "glsl" && graph.stage === "material") for (const binding of bindings) {
    if (binding.kind !== "uniform" || !binding.dataType) continue;
    graphDeclarations.push(`uniform ${glslDeclaration(binding.type!, `u_${binding.shaderName}`)};\n#define ${binding.shaderName} u_${binding.shaderName}`);
  }
  const functionEntries = graph.functions ?? [];
  const allNodes = [...graph.nodes, ...functionEntries.flatMap((entry) => entry.nodes)];
  if (allNodes.some((node) => node.op === "noise")) graphDeclarations.push(noiseDeclarations(target));
  const selectedStructs = new Set(allNodes.filter((node) => node.op === "select").map((node) => structName(node.type)).filter((name): name is string => name !== undefined));
  for (const name of selectedStructs) {
    const type = `auraGraph_struct_${graphSymbol(name)}`;
    graphDeclarations.push(target === "glsl"
      ? `${type} auraGraph_select_${graphSymbol(name)}(bool condition, ${type} yes, ${type} no) { if (condition) { return yes; } return no; }`
      : `fn auraGraph_select_${graphSymbol(name)}(condition: bool, yes: ${type}, no: ${type}) -> ${type} { if (condition) { return yes; } return no; }`);
  }
  const functions = new Map(functionEntries.map((entry) => [entry.name, entry]));
  const orderedFunctions: ShaderGraphFunction[] = [];
  const visitedFunctions = new Set<string>();
  const orderFunction = (name: string): void => {
    if (visitedFunctions.has(name)) return;
    visitedFunctions.add(name);
    const declaration = functions.get(name)!;
    for (const node of declaration.nodes) if (node.op === "call") orderFunction(node.name!);
    orderedFunctions.push(declaration);
  };
  for (const name of functions.keys()) orderFunction(name);
  for (const declaration of orderedFunctions) {
    const localNodes = new Map(declaration.nodes.map((node) => [node.id, node]));
    const body = expr(declaration.output, graph.stage === "compute" ? "compute" : "fragment", localNodes, new Map(), false);
    const params = declaration.parameters.map((parameter) => target === "glsl"
      ? `${typeName(parameter.type)} auraGraph_param_${graphSymbol(parameter.name)}`
      : `auraGraph_param_${graphSymbol(parameter.name)}: ${typeName(parameter.type)}`).join(", ");
    graphDeclarations.push(target === "glsl"
      ? `${typeName(declaration.returnType)} auraGraph_fn_${graphSymbol(declaration.name)}(${params}) { return ${body}; }`
      : `fn auraGraph_fn_${graphSymbol(declaration.name)}(${params}) -> ${typeName(declaration.returnType)} { return ${body}; }`);
  }
  const makeStatements = (
    statements: readonly ShaderGraphStatement[],
    shaderStage: "vertex" | "fragment" | "compute",
    depth = 1,
    budget?: { chars: number }
  ): string[] => {
    const indent = "  ".repeat(depth);
    const line = (source: string): string => {
      if (budget) {
        budget.chars += source.length + 1;
        if (budget.chars > MATERIAL_SOURCE_LIMIT) {
          throw new ShaderGraphError([{ code: "graph-limit", message: "expanded material control flow exceeds the 1 MB stage limit" }]);
        }
      }
      return source;
    };
    return statements.flatMap((statement): string[] => {
      switch (statement.op) {
        case "store": return atomicResources.has(statement.resource)
          ? [line(`${indent}atomicStore(&auraGraph_resource_${statement.resource}[${expr(statement.index, shaderStage)}], ${expr(statement.value, shaderStage)});`)]
          : [line(`${indent}auraGraph_resource_${statement.resource}[${expr(statement.index, shaderStage)}] = ${expr(statement.value, shaderStage)};`)];
        case "atomicAdd": return [line(`${indent}atomicAdd(&auraGraph_resource_${statement.resource}[${expr(statement.index, shaderStage)}], ${expr(statement.value, shaderStage)});`)];
        case "textureStore": return [line(`${indent}textureStore(auraGraph_resource_${statement.resource}, vec2<i32>(${expr(statement.coordinates, shaderStage)}), ${expr(statement.value, shaderStage)});`)];
        case "barrier": return [line(`${indent}${statement.scope === "storage" ? "storageBarrier" : "workgroupBarrier"}();`)];
        case "setOutput": return [line(`${indent}auraGraph_output_${statement.output} = ${expr(statement.value, shaderStage)};`)];
        case "if": return [line(`${indent}if (${expr(statement.condition, shaderStage)}) {`), ...makeStatements(statement.then, shaderStage, depth + 1, budget), ...(statement.otherwise ? [line(`${indent}} else {`), ...makeStatements(statement.otherwise, shaderStage, depth + 1, budget)] : []), line(`${indent}}`)];
        case "loop": {
          const declaration = target === "glsl" ? `uint auraGraph_local_${statement.index}` : `var auraGraph_local_${statement.index}: u32`;
          return [line(`${indent}for (${declaration} = 0u; auraGraph_local_${statement.index} < ${statement.count}u; auraGraph_local_${statement.index}++) {`), ...makeStatements(statement.body, shaderStage, depth + 1, budget), line(`${indent}}`)];
        }
      }
    });
  };
  if (graph.stage === "compute") {
    const body = makeStatements(graph.statements ?? [], "compute");
    const declarations = bindings.map((binding) => {
      const slot = `@group(${binding.group}) @binding(${binding.binding})`;
      const name = `auraGraph_resource_${binding.name}`;
      if (binding.kind === "uniform") {
        const layout = uniformLayouts.get(binding.name);
        return layout ? emitWgslStruct(layout, "uniform", { variableName: name })
          : `${slot} var<uniform> ${name}: ${binding.type === "bool" ? "u32" : wgslType(binding.type!)};`;
      }
      if (binding.kind === "storage-buffer") {
        const scalar = wgslType(binding.type!);
        const element = atomicResources.has(binding.name) ? `atomic<${scalar}>` : scalar;
        return `${slot} var<storage, ${(binding.access ?? "read_write") === "read" ? "read" : "read_write"}> ${name}: array<${element}>;`;
      }
      if (binding.kind === "storage-texture") return `${slot} var ${name}: texture_storage_2d<${binding.format}, ${binding.access ?? "write"}>;`;
      if (binding.kind === "depth2d") return `${slot} var ${name}: texture_depth_2d;`;
      // Compute sampling needs distinct sampler binding. Binding metadata reserves
      // the immediately following slot for it; the resource validator enforces it.
      return `${slot} var ${name}: texture_${binding.kind === "texture3d" ? "3d" : "2d"}<f32>;\n@group(${binding.group}) @binding(${binding.binding + 1}) var auraGraph_sampler_${binding.name}: sampler;`;
    });
    const params = [...usedBuiltins].filter((name) => COMPUTE_BUILTINS.has(name)).map((name) => `@builtin(${{ globalInvocationId: "global_invocation_id", localInvocationId: "local_invocation_id", workgroupId: "workgroup_id" }[name as "globalInvocationId" | "localInvocationId" | "workgroupId"]}) auraGraph_${name}: vec3<u32>`);
    const workgroup = graph.workgroupSize ?? [64, 1, 1];
    const compute = [...graphDeclarations, ...declarations, `@compute @workgroup_size(${workgroup.join(", ")})`, `fn main(${params.join(", ")}) {`, ...body, "}"].join("\n");
    return { target, stage: graph.stage, key: graphKey(graph), bindings, compute, nodeSources: sources };
  }
  const outputEntries = (Object.keys(OUTPUTS) as ShaderGraphMaterialOutput[]).flatMap((channel) =>
    graph.outputs && Object.hasOwn(graph.outputs, channel) ? [[channel, graph.outputs[channel]!] as const] : []);
  const initialOutputs: Partial<Record<ShaderGraphMaterialOutput, string>> = {};
  for (const [channel, id] of outputEntries) initialOutputs[channel] = expr(id, materialOutputStage(channel));
  const vertexFlow = selectMaterialStatements(graph.statements ?? [], (output) => materialOutputStage(output) === "vertex");
  const fragmentFlow = selectMaterialStatements(graph.statements ?? [], (output) => materialOutputStage(output) === "fragment");
  const colorNode = graph.outputs?.color ? nodes.get(graph.outputs.color)! : undefined;
  const alphaEnabled = graph.alphaTest !== undefined && graph.alphaTest > 0;
  const alphaChannels = new Set<ShaderGraphMaterialOutput>([
    ...(colorNode?.type === "vec4" ? ["color" as const] : []),
    ...(graph.outputs?.opacity ? ["opacity" as const] : [])
  ]);
  const alphaFlow = alphaEnabled ? selectMaterialStatements(fragmentFlow, (output) => alphaChannels.has(output)) : [];
  const vertexWritten = materialStatementOutputs(vertexFlow);
  const fragmentWritten = materialStatementOutputs(fragmentFlow);
  const materialBody = (flow: readonly ShaderGraphStatement[], shaderStage: MaterialGraphStage): string[] => {
    const written = materialStatementOutputs(flow);
    const declarations = outputEntries.filter(([channel]) => written.has(channel)).map(([channel, id]) => {
      const name = `auraGraph_output_${channel}`;
      const type = nodes.get(id)!.type;
      return target === "glsl"
        ? `${glslType(type)} ${name} = ${initialOutputs[channel]};`
        : `var ${name}: ${wgslType(type)} = ${initialOutputs[channel]};`;
    });
    const budget = { chars: declarations.reduce((size, source) => size + source.length + 1, 0) };
    if (budget.chars > MATERIAL_SOURCE_LIMIT) {
      throw new ShaderGraphError([{ code: "graph-limit", message: "expanded material control flow exceeds the 1 MB stage limit" }]);
    }
    return [...declarations, ...makeStatements(flow, shaderStage, 0, budget)];
  };
  const vertexStatements = materialBody(vertexFlow, "vertex");
  const fragmentStatements = materialBody(fragmentFlow, "fragment");
  const alphaStatements = materialBody(alphaFlow, "fragment");
  const outputs = { ...initialOutputs };
  for (const channel of [...vertexWritten, ...fragmentWritten]) outputs[channel] = `auraGraph_output_${channel}`;
  const collectBuiltins = (ids: readonly string[]): Set<ShaderGraphBuiltin> => {
    const found = new Set<ShaderGraphBuiltin>(); const visited = new Set<string>();
    const visit = (id: string): void => { if (visited.has(id)) return; visited.add(id); const node = nodes.get(id)!; if (node.op === "input") found.add(node.name as ShaderGraphBuiltin); for (const input of node.inputs ?? []) visit(input); };
    for (const id of ids) visit(id);
    return found;
  };
  const positionRoots = [...outputEntries.filter(([channel]) => channel === "position").map(([, id]) => id), ...materialStatementRoots(vertexFlow)];
  const fragmentRoots = [...outputEntries.filter(([channel]) => channel !== "position").map(([, id]) => id), ...materialStatementRoots(fragmentFlow)];
  const positionUsed = collectBuiltins(positionRoots);
  const fragmentUsed = collectBuiltins(fragmentRoots);
  const alphaRoots = alphaEnabled
    ? [...outputEntries.filter(([channel]) => alphaChannels.has(channel)).map(([, id]) => id), ...materialStatementRoots(alphaFlow)]
    : [];
  const alphaBuiltins = collectBuiltins(alphaRoots);
  const collectStorage = (ids: readonly string[]): Set<string> => {
    const found = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = nodes.get(id)!;
      if ((node.op === "storageLoad" || node.op === "textureLoad") && node.resource && (resourceKinds.get(node.resource) === "storage-buffer" || resourceKinds.get(node.resource) === "storage-texture")) found.add(node.resource);
      for (const input of node.inputs ?? []) visit(input);
    };
    for (const id of ids) visit(id);
    return found;
  };
  const vertexStorage = collectStorage(positionRoots);
  const fragmentStorage = collectStorage(fragmentRoots);
  const alphaStorage = collectStorage(alphaRoots);
  const storageStages = {
    forward: bindings.filter((binding) => vertexStorage.has(binding.name) || fragmentStorage.has(binding.name)).map((binding) => ({
      name: binding.name, visibility: vertexStorage.has(binding.name) && fragmentStorage.has(binding.name) ? "vertex-fragment" as const : vertexStorage.has(binding.name) ? "vertex" as const : "fragment" as const
    })),
    depth: bindings.filter((binding) => vertexStorage.has(binding.name) || alphaStorage.has(binding.name)).map((binding) => ({
      name: binding.name, visibility: vertexStorage.has(binding.name) && alphaStorage.has(binding.name) ? "vertex-fragment" as const : vertexStorage.has(binding.name) ? "vertex" as const : "fragment" as const
    }))
  };
  const varyings = [...fragmentUsed].filter((name) => BUILTIN_VERTEX.has(name)).sort();
  const requiresLighting = outputs.normal !== undefined || outputs.roughness !== undefined || outputs.metalness !== undefined;
  const outputTypes = Object.fromEntries(outputEntries.map(([channel, id]) => [channel, nodes.get(id)!.type]));
  const material = {
    vertex: { statements: vertexStatements, outputs: outputs.position === undefined ? {} : { position: outputs.position }, ...(graphDeclarations.length ? { declarations: graphDeclarations } : {}) },
    fragment: { statements: fragmentStatements, outputs: Object.fromEntries(Object.entries(outputs).filter(([key]) => key !== "position")), ...(graphDeclarations.length ? { declarations: graphDeclarations } : {}) },
    outputTypes, varyings, builtins: [...new Set([...positionUsed, ...fragmentUsed])].sort(), requiresLighting,
    ...(alphaEnabled ? { alphaTest: graph.alphaTest } : {})
  };
  const allVertex = new Set([...positionUsed, ...varyings]);
  const needNormal = requiresLighting || allVertex.has("normalLocal") || allVertex.has("normalWorld");
  const needUv0 = allVertex.has("uv0"); const needUv1 = allVertex.has("uv1");
  const color = outputs.color ?? (target === "glsl" ? "vec3(1.0)" : "vec3<f32>(1.0)");
  const alpha = colorNode?.type === "vec4" ? `(${color}).a` : "1.0";
  const rgb = colorNode?.type === "vec4" ? `(${color}).rgb` : color;
  const emission = outputs.emissive ?? (target === "glsl" ? "vec3(0.0)" : "vec3<f32>(0.0)");
  const opacity = outputs.opacity ?? "1.0";
  const alphaDiscard = alphaEnabled ? `if ((${alpha}) * (${opacity}) < ${literal(graph.alphaTest!, "f32", target)}) ${target === "glsl" ? "discard;" : "{ discard; }"}` : undefined;
  const position = outputs.position ?? "auraGraph_positionLocal";
  const skinning = options.skinning;
  if (target === "glsl") {
    const standaloneLit = requiresLighting;
    const worldPositionNeeded = standaloneLit || options.fog === true;
    const varyDecl = (qualifier: "in" | "out"): string[] => varyings.map((name) => `${qualifier} ${glslType(BUILTINS[name])} auraGraph_v_${name};`);
    const builtins = (needed: ReadonlySet<ShaderGraphBuiltin>, inVertex: boolean): string[] => [...needed].sort().map((name) => {
      if (!inVertex && BUILTIN_VERTEX.has(name)) return `${glslType(BUILTINS[name])} auraGraph_${name} = auraGraph_v_${name};`;
      const localPosition = skinning ? "auraGraph_deformedPosition" : "position";
      const localNormal = skinning ? "auraGraph_deformedNormal" : "normal";
      const expressions: Partial<Record<ShaderGraphBuiltin, string>> = { positionLocal: localPosition, positionWorld: `(modelMatrix * u_geometryMatrix * vec4(${localPosition}, 1.0)).xyz`, normalLocal: localNormal, normalWorld: "normalize(normalMatrix * auraGraph_geometryNormal)", uv0: "uv", uv1: "a_uv1", time: "uTime", cameraPosition: "cameraPosition", viewportUV: "gl_FragCoord.xy / uResolution", depth: "gl_FragCoord.z" };
      return `${glslType(BUILTINS[name])} auraGraph_${name} = ${expressions[name]};`;
    });
    const vertex = [
      ...graphDeclarations, "uniform float u_a3dClipRange;", "uniform mat4 u_geometryMatrix;", ...(needUv1 ? ["in vec2 a_uv1;"] : []), ...varyDecl("out"),
      "out vec3 auraGraph_clipLocal;", "out vec3 auraGraph_clipWorld;",
      ...(worldPositionNeeded ? ["out vec3 auraGraph_surfaceWorldPosition;"] : []),
      ...(standaloneLit ? ["out vec3 auraGraph_surfaceWorldNormal;"] : []),
      ...(skinning ? ["#include <skinning_common>", "layout(location = 5) in vec4 a_joints;", "layout(location = 6) in vec4 a_weights;", ...(skinning === 8 ? ["layout(location = 8) in vec4 a_joints1;", "layout(location = 9) in vec4 a_weights1;"] : [])] : []),
      ...(needNormal ? ["vec3 auraGraphGeometryNormal(vec3 source) { mat3 geometry = mat3(u_geometryMatrix); float det = determinant(geometry); return abs(det) > 1e-8 ? transpose(inverse(geometry)) * source : source; }"] : []),
      "void main() {", ...(skinning ? [
        `  float auraGraph_weightSum = dot(a_weights, vec4(1.0))${skinning === 8 ? " + dot(a_weights1, vec4(1.0))" : ""};`,
        `  mat4 auraGraph_skin = a3dSkinMatrix${skinning}(a_joints, a_weights${skinning === 8 ? ", a_joints1, a_weights1" : ""});`,
        "  vec3 auraGraph_deformedPosition = auraGraph_weightSum > 0.0001 ? (auraGraph_skin * vec4(position, 1.0)).xyz : position;",
        ...(needNormal ? [
          "  vec3 auraGraph_deformedNormal = normal;",
          "  if (auraGraph_weightSum > 0.0001) {",
          "    mat3 auraGraph_skinBasis = mat3(auraGraph_skin);",
          "    mat3 auraGraph_skinCofactors = mat3(cross(auraGraph_skinBasis[1], auraGraph_skinBasis[2]), cross(auraGraph_skinBasis[2], auraGraph_skinBasis[0]), cross(auraGraph_skinBasis[0], auraGraph_skinBasis[1]));",
          "    float auraGraph_skinDeterminant = dot(auraGraph_skinBasis[0], auraGraph_skinCofactors[0]);",
          "    float auraGraph_skinScale = max(max(length(auraGraph_skinBasis[0]), length(auraGraph_skinBasis[1])), length(auraGraph_skinBasis[2]));",
          "    float auraGraph_skinDeterminantLimit = max(auraGraph_skinScale * auraGraph_skinScale * auraGraph_skinScale * 0.000001, 1e-30);",
          "    auraGraph_deformedNormal = abs(auraGraph_skinDeterminant) > auraGraph_skinDeterminantLimit ? (auraGraph_skinCofactors * normal) / auraGraph_skinDeterminant : auraGraph_skinBasis * normal;",
          "  }"
        ] : [])
      ] : []), ...(needNormal ? [`  vec3 auraGraph_geometryNormal = auraGraphGeometryNormal(${skinning ? "auraGraph_deformedNormal" : "normal"});`] : []),
      ...builtins(new Set([...allVertex, "positionLocal"]), true).map((line) => `  ${line}`),
      ...vertexStatements.map((line) => `  ${line}`),
      `  vec3 auraGraph_finalPosition = ${position};`,
      "  vec4 auraGraph_geometryLocal = u_geometryMatrix * vec4(auraGraph_finalPosition, 1.0);",
      "  auraGraph_clipLocal = auraGraph_geometryLocal.xyz;", "  auraGraph_clipWorld = (modelMatrix * auraGraph_geometryLocal).xyz;",
      ...varyings.map((name) => name === "positionLocal" ? "  auraGraph_v_positionLocal = auraGraph_finalPosition;" : name === "positionWorld" ? "  auraGraph_v_positionWorld = auraGraph_clipWorld;" : `  auraGraph_v_${name} = auraGraph_${name};`),
      ...(worldPositionNeeded ? ["  auraGraph_surfaceWorldPosition = auraGraph_clipWorld;"] : []),
      ...(standaloneLit ? ["  auraGraph_surfaceWorldNormal = normalMatrix * auraGraph_geometryNormal;"] : []),
      "  gl_Position = modelViewProjectionMatrix * auraGraph_geometryLocal;", "}"
    ].join("\n");
    const fragment = standaloneLit
      ? [
        ...graphDeclarations, "#include <a3d_ibl>", GRAPH_DIRECT_GLSL, GRAPH_ENVIRONMENT_GLSL, GRAPH_CLIPPING_GLSL, ...varyDecl("in"),
        "in vec3 auraGraph_clipLocal;", "in vec3 auraGraph_clipWorld;",
        "in vec3 auraGraph_surfaceWorldPosition;", "in vec3 auraGraph_surfaceWorldNormal;", "out vec4 outColor;",
        "void main() {", "  if (auraGraphIsClipped(auraGraph_clipLocal, auraGraph_clipWorld)) discard;", ...builtins(fragmentUsed, false).map((line) => `  ${line}`),
        ...fragmentStatements.map((line) => `  ${line}`),
        ...(alphaDiscard ? [`  ${alphaDiscard}`] : []),
        `  vec3 auraGraph_normal = ${outputs.normal ?? "(auraGraph_surfaceWorldNormal * (gl_FrontFacing ? 1.0 : -1.0))"};`,
        "  auraGraph_normal /= max(length(auraGraph_normal), 0.0001);",
        "  vec3 auraGraph_view = cameraPosition - auraGraph_surfaceWorldPosition;",
        "  auraGraph_view /= max(length(auraGraph_view), 0.0001);",
        `  vec3 auraGraph_baseColor = clamp(${rgb}, vec3(0.0), vec3(1.0));`,
        `  float auraGraph_roughness = clamp(${outputs.roughness ?? "1.0"}, 0.0, 1.0);`,
        `  float auraGraph_metalness = clamp(${outputs.metalness ?? "0.0"}, 0.0, 1.0);`,
        "  vec3 auraGraph_direct = auraGraphDirect(auraGraph_normal, auraGraph_view, auraGraph_baseColor, auraGraph_roughness, auraGraph_metalness, auraGraph_surfaceWorldPosition);",
        "  vec3 auraGraph_f0 = mix(vec3(0.04), auraGraph_baseColor, auraGraph_metalness);",
        "  vec3 auraGraph_fresnel = auraGraph_f0 + (vec3(1.0) - auraGraph_f0) * pow(1.0 - clamp(dot(auraGraph_normal, auraGraph_view), 0.0, 1.0), 5.0);",
        "  vec3 auraGraph_reflection = reflect(-auraGraph_view, auraGraph_normal);",
        "  vec3 auraGraph_ambient = (max(u_a3dEnvAmbient - 0.5 * (u_a3dHemiSky + u_a3dHemiGround), vec3(0.0)) + a3dHemiLight(auraGraph_normal)) * 0.31830989;",
        "  vec3 auraGraph_envDiffuse = a3dEnvDiffuse(auraGraph_normal) - auraGraph_ambient;",
        "  vec3 auraGraph_envSpecular = a3dEnvSpecular(auraGraph_reflection, auraGraph_roughness);",
        "// @graph-environment begin cube",
        "  if (u_graphGlobalEnvCubeInfo.x > 0.5) { if (u_a3dEnvShEnabled < 0.5) auraGraph_envDiffuse = auraGraphGlobalCube(auraGraph_normal, u_graphGlobalEnvCubeInfo.z) * u_graphGlobalEnvCubeDiffuseIntensity; auraGraph_envSpecular = auraGraphGlobalCube(auraGraph_reflection, auraGraph_roughness * u_graphGlobalEnvCubeInfo.z) * u_graphGlobalEnvCubeInfo.y; }",
        "// @graph-environment end cube",
        "// @graph-environment begin volume",
        "  auraGraph_envDiffuse = auraGraphVolumeBlend(auraGraph_envDiffuse * 3.14159265, auraGraph_surfaceWorldPosition, auraGraph_normal) * 0.31830989;",
        "// @graph-environment end volume",
        "// @graph-environment begin probe",
        "  auraGraph_envSpecular = auraGraph_envSpecular * u_prd02ProbeWeights.z + auraGraphProbeRadiance(auraGraph_surfaceWorldPosition, auraGraph_reflection, auraGraph_roughness);",
        "// @graph-environment end probe",
        "  vec3 auraGraph_indirect = (auraGraph_ambient + auraGraph_envDiffuse) * auraGraph_baseColor * (1.0 - auraGraph_metalness) * (vec3(1.0) - auraGraph_fresnel) + auraGraph_envSpecular * auraGraph_fresnel;",
        `  outColor = vec4(auraGraph_direct + auraGraph_indirect + (${emission}), (${alpha}) * (${opacity}));`, "}"
      ].join("\n")
      : [...graphDeclarations, GRAPH_CLIPPING_GLSL, ...varyDecl("in"), "in vec3 auraGraph_clipLocal;", "in vec3 auraGraph_clipWorld;", ...(worldPositionNeeded ? ["in vec3 auraGraph_surfaceWorldPosition;"] : []), "out vec4 outColor;", "void main() {", "  if (auraGraphIsClipped(auraGraph_clipLocal, auraGraph_clipWorld)) discard;", ...builtins(fragmentUsed, false).map((line) => `  ${line}`), ...fragmentStatements.map((line) => `  ${line}`), ...(alphaDiscard ? [`  ${alphaDiscard}`] : []), `  outColor = vec4((${rgb}) + (${emission}), (${alpha}) * (${opacity}));`, "}"].join("\n");
    const depthVertex = vertex.replace("void main() {", "uniform mat4 u_a3dClipModel;\nuniform mat4 u_a3dLogDepthView;\nout vec3 v_a3dGraphDepthLocal;\nout vec3 v_a3dGraphDepthWorld;\nout float v_a3dGraphViewDistance;\nvoid main() {")
      .replace("  vec4 auraGraph_geometryLocal = u_geometryMatrix * vec4(auraGraph_finalPosition, 1.0);", (line) => `${line}\n  vec4 auraGraph_depthWorld = u_a3dClipModel * auraGraph_geometryLocal;\n  v_a3dGraphDepthLocal = auraGraph_geometryLocal.xyz;\n  v_a3dGraphDepthWorld = auraGraph_depthWorld.xyz;\n  v_a3dGraphViewDistance = -(u_a3dLogDepthView * auraGraph_depthWorld).z;`);
    const depthFragmentBase = !alphaDiscard ? GRAPH_DEPTH_GLSL : GRAPH_DEPTH_GLSL
      .replace("in vec3 v_a3dGraphDepthLocal;", `// @aura3d-graph-alpha-test\n${varyDecl("in").join("\n")}\nin vec3 v_a3dGraphDepthLocal;`)
      .replace("  float depth = gl_FragCoord.z;", `${[...builtins(alphaBuiltins, false), ...alphaStatements].map((line) => `  ${line}`).join("\n")}\n  ${alphaDiscard}\n  float depth = gl_FragCoord.z;`);
    const depthFragment = graphDeclarations.length
      ? depthFragmentBase.replace("precision highp float;", `precision highp float;\n${graphDeclarations.join("\n")}`)
      : depthFragmentBase;
    return { target, stage: graph.stage, key: graphKey(options.fog || skinning ? { graph, ...(options.fog ? { fog: true } : {}), ...(skinning ? { skinning } : {}) } : graph), bindings, vertex, fragment, storageStages,
      ...(outputs.position === undefined && !skinning && !alphaEnabled ? {} : { depth: { vertex: depthVertex, fragment: depthFragment } }), material, nodeSources: sources };
  }
  const fog = options.fog === true;
  const worldPositionNeeded = requiresLighting || fog;
  const varyingFields = varyings.map((name, i) => `  @location(${i}) v_${name}: ${wgslType(BUILTINS[name])},`);
  const clippingLocation = varyings.length + (worldPositionNeeded ? 1 : 0) + (requiresLighting ? 1 : 0);
  const vertexOut = ["struct AuraGraphVertexOut {", "  @builtin(position) position: vec4<f32>,", ...varyingFields,
    ...(worldPositionNeeded ? [`  @location(${varyings.length}) surfaceWorldPosition: vec3<f32>,`] : []),
    ...(requiresLighting ? [`  @location(${varyings.length + 1}) surfaceWorldNormal: vec3<f32>,`] : []),
    `  @location(${clippingLocation}) graphClipLocal: vec3<f32>,`, `  @location(${clippingLocation + 1}) graphClipWorld: vec3<f32>,`, "};"].join("\n");
  const storageDeclarations = bindings.filter((binding) => binding.kind === "storage-buffer" || binding.kind === "storage-texture").map((binding) => {
    const slot = `@group(${binding.group}) @binding(${binding.binding})`;
    if (binding.kind === "storage-buffer") return `${slot} var<storage, read> auraGraph_resource_${binding.name}: array<${wgslType(binding.type!)}>;`;
    return `${slot} var auraGraph_resource_${binding.name}: texture_storage_2d<${binding.format}, read>;`;
  });
  const builtins = (needed: ReadonlySet<ShaderGraphBuiltin>, inVertex: boolean): string[] => [...needed].sort().map((name) => {
    if (!inVertex && BUILTIN_VERTEX.has(name)) return `let auraGraph_${name} = input.v_${name};`;
    const localPosition = skinning ? "auraGraph_deformedPosition" : "position";
    const localNormal = skinning ? "auraGraph_deformedNormal" : "normal";
    const expressions: Partial<Record<ShaderGraphBuiltin, string>> = { positionLocal: localPosition, positionWorld: `(aura.u_modelMatrix * aura.u_geometryMatrix * vec4<f32>(${localPosition}, 1.0)).xyz`, normalLocal: localNormal, normalWorld: "normalize((aura.u_normalMatrix * vec4<f32>(auraGraph_geometryNormal, 0.0)).xyz)", uv0: "uv0", uv1: "uv1", time: "aura.u_time", cameraPosition: "aura.u_cameraPosition", viewportUV: "vec2<f32>(input.position.x, aura.u_resolution.y - input.position.y) / aura.u_resolution", depth: "input.position.z" };
    return `let auraGraph_${name} = ${expressions[name]};`;
  });
  const params = ["@location(0) position: vec3<f32>", ...(needNormal ? ["@location(1) normal: vec3<f32>"] : []), ...(needUv0 ? ["@location(2) uv0: vec2<f32>"] : []), ...(needUv1 ? ["@location(7) uv1: vec2<f32>"] : []), ...(skinning ? ["@location(5) joints: vec4<f32>", "@location(6) weights: vec4<f32>", ...(skinning === 8 ? ["@location(8) joints1: vec4<f32>", "@location(9) weights1: vec4<f32>"] : [])] : [])];
  const vertex = ["/* @aura3d-bindings */", ...graphDeclarations, ...storageDeclarations, ...(skinning ? [GRAPH_SKINNING_WGSL] : []), vertexOut, `@vertex fn vs_main(${params.join(", ")}) -> AuraGraphVertexOut {`, ...(skinning ? [
    `  let auraGraph_weightSum = dot(weights, vec4<f32>(1.0))${skinning === 8 ? " + dot(weights1, vec4<f32>(1.0))" : ""};`,
    `  let auraGraph_skin = auraGraphSkin4(joints, weights)${skinning === 8 ? " + auraGraphSkin4(joints1, weights1)" : ""};`,
    "  let auraGraph_deformedPosition = select(position, (auraGraph_skin * vec4<f32>(position, 1.0)).xyz, auraGraph_weightSum > 0.0001);",
    ...(needNormal ? [
      "  var auraGraph_deformedNormal = normal;",
      "  if (auraGraph_weightSum > 0.0001) {",
      "    let auraGraph_skinBasis = mat3x3<f32>(auraGraph_skin[0].xyz, auraGraph_skin[1].xyz, auraGraph_skin[2].xyz);",
      "    let auraGraph_skinCofactors = mat3x3<f32>(cross(auraGraph_skinBasis[1], auraGraph_skinBasis[2]), cross(auraGraph_skinBasis[2], auraGraph_skinBasis[0]), cross(auraGraph_skinBasis[0], auraGraph_skinBasis[1]));",
      "    let auraGraph_skinDeterminant = dot(auraGraph_skinBasis[0], auraGraph_skinCofactors[0]);",
      "    let auraGraph_skinScale = max(max(length(auraGraph_skinBasis[0]), length(auraGraph_skinBasis[1])), length(auraGraph_skinBasis[2]));",
      "    let auraGraph_skinDeterminantLimit = max(auraGraph_skinScale * auraGraph_skinScale * auraGraph_skinScale * 0.000001, 1e-30);",
      "    if (abs(auraGraph_skinDeterminant) > auraGraph_skinDeterminantLimit) {",
      "      auraGraph_deformedNormal = (auraGraph_skinCofactors * normal) / auraGraph_skinDeterminant;",
      "    } else {",
      "      auraGraph_deformedNormal = auraGraph_skinBasis * normal;",
      "    }",
      "  }"
    ] : [])
  ] : []), ...(needNormal ? [
    "  let auraGraph_geometryBasis = mat3x3<f32>(aura.u_geometryMatrix[0].xyz, aura.u_geometryMatrix[1].xyz, aura.u_geometryMatrix[2].xyz);",
    "  let auraGraph_geometryCofactors = mat3x3<f32>(cross(auraGraph_geometryBasis[1], auraGraph_geometryBasis[2]), cross(auraGraph_geometryBasis[2], auraGraph_geometryBasis[0]), cross(auraGraph_geometryBasis[0], auraGraph_geometryBasis[1]));",
    "  let auraGraph_geometryDeterminant = dot(auraGraph_geometryBasis[0], auraGraph_geometryCofactors[0]);",
    `  var auraGraph_geometryNormal = ${skinning ? "auraGraph_deformedNormal" : "normal"};`,
    "  if (abs(auraGraph_geometryDeterminant) > 1e-8) { auraGraph_geometryNormal = (auraGraph_geometryCofactors * auraGraph_geometryNormal) / auraGraph_geometryDeterminant; }"
  ] : []), ...builtins(new Set([...allVertex, "positionLocal"]), true).map((line) => `  ${line}`),
  ...vertexStatements.map((line) => `  ${line}`),
  `  let auraGraph_finalPosition = ${position};`,
  "  let auraGraph_geometryLocal = aura.u_geometryMatrix * vec4<f32>(auraGraph_finalPosition, 1.0);",
  "  var output: AuraGraphVertexOut;",
  "  let auraGraph_clip = aura.u_modelViewProjection * auraGraph_geometryLocal;",
  "  let auraGraph_clipZ = select(auraGraph_clip.z * 0.5 + auraGraph_clip.w * 0.5, auraGraph_clip.z, aura.u_a3dClipRange > 0.5);",
  "  output.position = vec4<f32>(auraGraph_clip.xy, auraGraph_clipZ, auraGraph_clip.w);",
  "  output.graphClipLocal = auraGraph_geometryLocal.xyz;",
  "  output.graphClipWorld = (aura.u_modelMatrix * auraGraph_geometryLocal).xyz;",
  ...varyings.map((name) => name === "positionLocal" ? "  output.v_positionLocal = auraGraph_finalPosition;" : name === "positionWorld" ? "  output.v_positionWorld = output.graphClipWorld;" : `  output.v_${name} = auraGraph_${name};`),
  ...(worldPositionNeeded ? ["  output.surfaceWorldPosition = output.graphClipWorld;"] : []),
  ...(requiresLighting ? ["  output.surfaceWorldNormal = (aura.u_normalMatrix * vec4<f32>(auraGraph_geometryNormal, 0.0)).xyz;"] : []),
  "  return output;", "}"].join("\n");
  const fragment = requiresLighting
    ? ["/* @aura3d-bindings */", ...graphDeclarations, ...storageDeclarations, vertexOut, GRAPH_LIGHTING_WGSL, GRAPH_ENVIRONMENT_WGSL, GRAPH_CLIPPING_WGSL, ...(fog ? [GRAPH_FOG_WGSL] : []),
      "@fragment fn fs_main(input: AuraGraphVertexOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4<f32> {",
      "  if (auraGraphIsClipped(input.graphClipLocal, input.graphClipWorld)) { discard; }",
      ...builtins(fragmentUsed, false).map((line) => `  ${line}`),
      ...fragmentStatements.map((line) => `  ${line}`),
      ...(alphaDiscard ? [`  ${alphaDiscard}`] : []),
      `  let auraGraph_normalRaw = ${outputs.normal ?? "(input.surfaceWorldNormal * select(-1.0, 1.0, frontFacing))"};`,
      "  let auraGraph_normal = auraGraph_normalRaw / max(length(auraGraph_normalRaw), 0.0001);",
      "  let auraGraph_viewRaw = aura.u_cameraPosition - input.surfaceWorldPosition;",
      "  let auraGraph_view = auraGraph_viewRaw / max(length(auraGraph_viewRaw), 0.0001);",
      `  let auraGraph_baseColor = clamp(${rgb}, vec3<f32>(0.0), vec3<f32>(1.0));`,
      `  let auraGraph_roughness = clamp(${outputs.roughness ?? "1.0"}, 0.0, 1.0);`,
      `  let auraGraph_metalness = clamp(${outputs.metalness ?? "0.0"}, 0.0, 1.0);`,
      "  let auraGraph_direct = auraGraphDirect(auraGraph_normal, auraGraph_view, auraGraph_baseColor, auraGraph_roughness, auraGraph_metalness, input.surfaceWorldPosition, vec2<f32>(input.position.x, aura.u_clusterViewportSize.y - input.position.y), input.position.xy);",
      "  let auraGraph_f0 = mix(vec3<f32>(0.04), auraGraph_baseColor, auraGraph_metalness);",
      "  let auraGraph_fresnel = auraGraph_f0 + (vec3<f32>(1.0) - auraGraph_f0) * pow(1.0 - clamp(dot(auraGraph_normal, auraGraph_view), 0.0, 1.0), 5.0);",
      "  let auraGraph_reflection = reflect(-auraGraph_view, auraGraph_normal);",
      "  let auraGraph_hemi = mix(aura.u_a3dHemiGround, aura.u_a3dHemiSky, clamp(auraGraph_normal.y * 0.5 + 0.5, 0.0, 1.0));",
      "  let auraGraph_ambient = (max(aura.u_a3dEnvAmbient - 0.5 * (aura.u_a3dHemiSky + aura.u_a3dHemiGround), vec3<f32>(0.0)) + auraGraph_hemi) * 0.31830989;",
      "  var auraGraph_envDiffuse = auraGraphEnvDiffuse(auraGraph_normal) - auraGraph_ambient;",
      "  var auraGraph_envSpecular = auraGraphEnvSpecular(auraGraph_reflection, auraGraph_roughness);",
      "// @graph-environment begin cube",
      "  if (aura.u_graphGlobalEnvCubeInfo.x > 0.5) { if (aura.u_a3dEnvShEnabled < 0.5) { auraGraph_envDiffuse = auraGraphGlobalCube(auraGraph_normal, aura.u_graphGlobalEnvCubeInfo.z) * aura.u_graphGlobalEnvCubeDiffuseIntensity; } auraGraph_envSpecular = auraGraphGlobalCube(auraGraph_reflection, auraGraph_roughness * aura.u_graphGlobalEnvCubeInfo.z) * aura.u_graphGlobalEnvCubeInfo.y; }",
      "// @graph-environment end cube",
      "// @graph-environment begin volume",
      "  auraGraph_envDiffuse = auraGraphVolumeBlend(auraGraph_envDiffuse * 3.14159265, input.surfaceWorldPosition, auraGraph_normal) * 0.31830989;",
      "// @graph-environment end volume",
      "// @graph-environment begin probe",
      "  auraGraph_envSpecular = auraGraph_envSpecular * aura.u_prd02ProbeWeights.z + auraGraphProbeRadiance(input.surfaceWorldPosition, auraGraph_reflection, auraGraph_roughness);",
      "// @graph-environment end probe",
      "  let auraGraph_indirect = (auraGraph_ambient + auraGraph_envDiffuse) * auraGraph_baseColor * (1.0 - auraGraph_metalness) * (vec3<f32>(1.0) - auraGraph_fresnel) + auraGraph_envSpecular * auraGraph_fresnel;",
      `  let auraGraph_color = auraGraph_direct + auraGraph_indirect + (${emission});`,
      `  return vec4<f32>(${fog ? "auraGraphFog(auraGraph_color, input.surfaceWorldPosition, vec2<f32>(input.position.x, aura.u_resolution.y - input.position.y))" : "auraGraph_color"}, (${alpha}) * (${opacity}));`, "}"
    ].join("\n")
    : ["/* @aura3d-bindings */", ...graphDeclarations, ...storageDeclarations, vertexOut, GRAPH_CLIPPING_WGSL, ...(fog ? [GRAPH_FOG_WGSL] : []), "@fragment fn fs_main(input: AuraGraphVertexOut) -> @location(0) vec4<f32> {", "  if (auraGraphIsClipped(input.graphClipLocal, input.graphClipWorld)) { discard; }", ...builtins(fragmentUsed, false).map((line) => `  ${line}`), ...fragmentStatements.map((line) => `  ${line}`), ...(alphaDiscard ? [`  ${alphaDiscard}`] : []), `  let auraGraph_color = (${rgb}) + (${emission});`, `  return vec4<f32>(${fog ? "auraGraphFog(auraGraph_color, input.surfaceWorldPosition, vec2<f32>(input.position.x, aura.u_resolution.y - input.position.y))" : "auraGraph_color"}, (${alpha}) * (${opacity}));`, "}"].join("\n");
  const depthLocation = clippingLocation + 2;
  const depthOut = vertexOut.replace("};", `  @location(${depthLocation}) graphDepthLocal: vec3<f32>,\n  @location(${depthLocation + 1}) graphDepthWorld: vec3<f32>,\n  @location(${depthLocation + 2}) graphViewDistance: f32,\n};`);
  const depthVertex = vertex.replace(vertexOut, depthOut).replace("  var output: AuraGraphVertexOut;", "  var output: AuraGraphVertexOut;\n  let auraGraph_depthWorld = aura.u_a3dClipModel * auraGraph_geometryLocal;\n  output.graphDepthLocal = auraGraph_geometryLocal.xyz;\n  output.graphDepthWorld = auraGraph_depthWorld.xyz;\n  output.graphViewDistance = -(aura.u_a3dLogDepthView * auraGraph_depthWorld).z;");
  return { target, stage: graph.stage, key: graphKey(fog || skinning ? { graph, ...(fog ? { fog: true } : {}), ...(skinning ? { skinning } : {}) } : graph), bindings, vertex, fragment, storageStages,
    ...(outputs.position === undefined && !skinning && !alphaEnabled ? {} : { depth: { vertex: depthVertex, fragment: graphDepthFragmentWgsl(depthLocation, alphaEnabled ? varyings : [], alphaEnabled ? [...builtins(alphaBuiltins, false), ...alphaStatements] : [], alphaDiscard, alphaEnabled ? storageDeclarations : [], graphDeclarations) } }), material, nodeSources: sources };
}
