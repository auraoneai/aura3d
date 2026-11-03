/**
 * Serializable Aura3D shader graphs and the bridge to node materials.
 * GPU objects and live uniform values are deliberately kept outside the graph
 * document so it can be saved, edited, and reused independently of a device.
 */
import {
  compileShaderGraph,
  validateShaderGraph,
  shaderGraphStorageLayout,
  packShaderGraphStorage,
  ShaderGraphError,
  type ShaderGraphDocument,
  type ShaderGraphNode,
  type ShaderGraphResource,
  type ShaderGraphMaterialOutput,
  type ShaderGraphStatement,
  type ShaderGraphValueType,
  type ShaderGraphTarget,
  type ShaderGraphCompileResult,
  type ShaderGraphDiagnostic
} from "@aura3d/rendering/shader-graph";
import type { AuraCustomMaterialSpec, AuraCustomUniformSpec, AuraMaterialSpec } from "./types.js";
import { cloneMaterialUniformValue, Texture, type NativeShaderStorageLayout, type NativeStorageBinding, type RenderBuffer, type ShaderDataType, type UniformDataValue } from "@aura3d/rendering";
import { assertAuraCustomMaterialSpec, certifyCompiledGraphMaterialSpec, normalizeCustomUniformValue } from "../compiler/customMaterial.js";
import { TslNode, parseHexColor, toNode, type TslInput, type TslOpName, type TslType } from "./tsl/ir.js";
import type { TslMaterialNodeOptions } from "./tsl/emit.js";

export type {
  ShaderGraphDocument, ShaderGraphNode, ShaderGraphResource, ShaderGraphMaterialOutput,
  ShaderGraphStatement, ShaderGraphValueType, ShaderGraphTarget, ShaderGraphCompileResult, ShaderGraphDiagnostic,
  ShaderGraphStruct, ShaderGraphStructField, ShaderGraphFunction, ShaderGraphFunctionParameter
} from "@aura3d/rendering/shader-graph";

/**
 * Resource values are supplied separately from a serializable graph.
 * Physical outputs use scene-lit portable GLSL and WGSL materials. The
 * portable light model does not yet evaluate rectangular area lights.
 */
export interface ShaderGraphMaterialOptions {
  readonly graph: ShaderGraphDocument;
  /** Require this compiled backend to be available when the material is built. */
  readonly backend?: "glsl" | "wgsl";
  /** Initial values keyed by graph resource name; texture values are borrowed. */
  readonly uniforms?: Readonly<Record<string, unknown>>;
  /** Borrowed WebGPU storage resources, keyed by the declared graph resource name. */
  readonly storage?: Readonly<Record<string, ShaderGraphStorageValue>>;
  readonly transparent?: boolean;
  readonly depthWrite?: boolean;
  readonly depthTest?: boolean;
  readonly side?: "front" | "back" | "double";
  readonly blending?: "normal" | "additive" | "subtractive" | "multiply" | "custom";
  readonly fog?: boolean;
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
}

export type ShaderGraphStorageValue =
  | { readonly kind: "storage-buffer"; readonly buffer: RenderBuffer; readonly offset?: number; readonly size?: number }
  | { readonly kind: "storage-texture"; readonly texture: Texture };

export interface LegacyShaderGraphMigration {
  readonly graph: ShaderGraphDocument;
  /** Original live uniform and texture values; these are not serialized. */
  readonly uniforms: Readonly<Record<string, unknown>>;
}

function graphFailure(code: string, message: string, path?: string): never {
  throw new ShaderGraphError([{ code, message, ...(path ? { path } : {}) }]);
}

type GraphSampledTextureKind = "texture2d" | "texture3d" | "depth2d";

/** Check known live values without replacing the original handle or its sampler. */
function validateGraphTextureValue(kind: GraphSampledTextureKind, name: string, value: unknown): void {
  if (value === undefined) return;
  try { normalizeCustomUniformValue(kind, value, name); }
  catch (error) {
    return graphFailure("invalid-resource", error instanceof Error ? error.message : `invalid graph texture ${name}`);
  }
}

/** Validate the authored logical value, before any backend allocates buffers. */
function validateGraphDataValue(type: ShaderDataType, value: unknown, path: string): asserts value is UniformDataValue {
  if (typeof type === "string") {
    if (type === "bool") {
      if (value !== true && value !== false && value !== 0 && value !== 1) graphFailure("invalid-resource", `${path} needs a boolean or 0/1`);
    } else if (typeof value !== "number" || !Number.isFinite(value)
      || (type === "f32" && !Number.isFinite(Math.fround(value)))
      || (type === "i32" && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647))
      || (type === "u32" && (!Number.isInteger(value) || value < 0 || value > 4294967295))) {
      graphFailure("invalid-resource", `${path} needs a valid ${type}`);
    }
    return;
  }
  if (type.kind === "struct") {
    if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      return graphFailure("invalid-resource", `${path} needs a plain struct value`);
    }
    const record = value as Record<string, unknown>;
    for (const field of type.fields) {
      if (!Object.hasOwn(record, field.name)) graphFailure("invalid-resource", `${path}.${field.name} is missing`);
      validateGraphDataValue(field.type, record[field.name], `${path}.${field.name}`);
    }
    for (const name of Object.keys(record)) {
      if (!type.fields.some((field) => field.name === name)) graphFailure("invalid-resource", `${path}.${name} is not declared`);
    }
    return;
  }
  const count = type.kind === "matrix" ? type.columns * type.rows : type.length;
  if ((!Array.isArray(value) && !(value instanceof Float32Array) && !(value instanceof Int32Array) && !(value instanceof Uint32Array))
    || (value as ArrayLike<unknown>).length !== count) {
    return graphFailure("invalid-resource", `${path} needs ${count} values`);
  }
  const values = value as ArrayLike<unknown>;
  for (let index = 0; index < count; index++) {
    if (!(index in values)) graphFailure("invalid-resource", `${path}[${index}] is missing`);
    validateGraphDataValue(type.kind === "array" ? type.element : type.kind === "vector" ? type.element : "f32", values[index], `${path}[${index}]`);
  }
}

/** Deterministic JSON, rejecting non-data input instead of silently losing it. */
function canonical(value: unknown, path: string, active: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return graphFailure("invalid-serialization", "non-finite numbers are not serializable", path);
    return JSON.stringify(value);
  }
  if (!value || typeof value !== "object") return graphFailure("invalid-serialization", `unsupported ${typeof value} value`, path);
  if (active.has(value)) return graphFailure("invalid-serialization", "cyclic object reference", path);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return graphFailure("invalid-serialization", "graph data must contain only plain objects and arrays", path);
  }
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const entries: string[] = [];
      const length = value.length;
      for (let index = 0; index < length; index++) {
        const itemPath = `${path}[${index}]`;
        if (!Object.hasOwn(value, index)) return graphFailure("invalid-serialization", "sparse arrays are not serializable", itemPath);
        entries.push(canonical(value[index], itemPath, active));
      }
      return `[${entries.join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(record[key], `${path}.${key}`, active)}`).join(",")}}`;
  } finally {
    active.delete(value);
  }
}

/** Validate and serialize graph data in a stable, versioned form. */
export function serializeShaderGraph(graph: ShaderGraphDocument): string {
  const data = canonical(graph, "$", new Set());
  const diagnostics = validateShaderGraph(graph);
  if (diagnostics.length) throw new ShaderGraphError(diagnostics);
  return data;
}

/** Parse and validate a graph before it is admitted to the compiler. */
export function deserializeShaderGraph(serialized: string): ShaderGraphDocument {
  if (typeof serialized !== "string") return graphFailure("invalid-serialization", "graph must be a JSON string");
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { return graphFailure("invalid-serialization", "graph is not valid JSON"); }
  const graph = value as ShaderGraphDocument;
  const diagnostics = validateShaderGraph(graph);
  if (diagnostics.length) throw new ShaderGraphError(diagnostics);
  return graph;
}

const TSL_TYPE: Partial<Record<TslType, ShaderGraphValueType>> = {
  float: "f32", int: "i32", bool: "bool", vec2: "vec2", vec3: "vec3", vec4: "vec4"
};
const TSL_OP: Partial<Record<TslOpName, ShaderGraphNode["op"]>> = {
  add: "add", sub: "sub", mul: "mul", div: "div", min: "min", max: "max", pow: "pow",
  dot: "dot", cross: "cross", distance: "distance", atan2: "atan2", step: "step", mod: "mod",
  sin: "sin", cos: "cos", tan: "tan", abs: "abs", sign: "sign", sqrt: "sqrt", exp: "exp", log: "log",
  fract: "fract", floor: "floor", ceil: "ceil", saturate: "saturate", oneMinus: "oneMinus", negate: "negate",
  normalize: "normalize", length: "length", mix: "mix", smoothstep: "smoothstep", clamp: "clamp", select: "select", lessThan: "less", greaterThan: "greater", equal: "equal"
};
const LEGACY_OUTPUTS: readonly [keyof TslMaterialNodeOptions, ShaderGraphMaterialOutput][] = [
  ["colorNode", "color"], ["normalNode", "normal"], ["roughnessNode", "roughness"],
  ["metalnessNode", "metalness"], ["emissiveNode", "emissive"], ["opacityNode", "opacity"], ["positionNode", "position"]
];

/**
 * Migrate the expression subset of the existing TSL API. Imperative blocks and
 * unsupported operations fail with the offending operation instead of silently
 * changing their semantics. Their existing GLSL material path remains usable.
 */
export function migrateTslShaderGraph(options: TslMaterialNodeOptions): LegacyShaderGraphMigration {
  const nodes: ShaderGraphNode[] = [];
  const resources: ShaderGraphResource[] = [];
  const uniforms: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const memo = new Map<TslNode, string>();
  const active = new Set<TslNode>();
  const resourceNames = new Set<string>();
  let nextNode = 0;
  let nextUniform = 0;
  let nextTexture = 0;
  const insert = (node: Omit<ShaderGraphNode, "id">): string => {
    const id = `node${nextNode++}`;
    nodes.push({ id, ...node });
    return id;
  };
  const resource = (node: TslNode): string => {
    if (node.data.k !== "uniform") return graphFailure("legacy-unsupported", "texture sampler must be a TSL uniform");
    const existing = memo.get(node);
    if (existing) return existing;
    const name = node.data.name ?? (node.type === "sampler2D" ? `graphTexture${nextTexture++}` : `graphUniform${nextUniform++}`);
    if (resourceNames.has(name)) return graphFailure("duplicate-resource", `multiple TSL uniforms use the name ${name}`);
    resourceNames.add(name);
    const type = TSL_TYPE[node.type];
    if (node.type === "sampler2D") resources.push({ name, kind: "texture2d" });
    else if (type) resources.push({ name, kind: "uniform", type });
    else return graphFailure("legacy-unsupported", `uniform type ${node.type} cannot be migrated`);
    let value = node.data.value;
    if (node.data.specType === "color3" && typeof value === "string") value = [...parseHexColor(value)];
    uniforms[name] = value;
    // Sampler nodes represent resources, not value expressions.
    if (node.type === "sampler2D") { memo.set(node, name); return name; }
    const id = insert({ op: "uniform", type: type!, resource: name });
    memo.set(node, id);
    return id;
  };
  const expandScalar = (id: string, source: TslNode, target: ShaderGraphValueType): string => {
    if (TSL_TYPE[source.type] === target) return id;
    if (source.type !== "float" || !["vec2", "vec3", "vec4"].includes(target)) {
      return graphFailure("legacy-unsupported", `cannot migrate implicit conversion ${source.type} to ${target}; provide float input values or retain the GLSL node material path`);
    }
    const count = Number(target.slice(-1));
    return insert({ op: "construct", type: target, inputs: Array.from({ length: count }, () => id) });
  };
  const convert = (node: TslNode): string => {
    const known = memo.get(node); if (known) return known;
    if (active.has(node)) return graphFailure("cycle", "legacy TSL graph contains an object cycle");
    active.add(node);
    try {
      const type = TSL_TYPE[node.type];
      if (!type) return graphFailure("legacy-unsupported", `node type ${node.type} cannot be migrated as a value`);
      const data = node.data;
      let id: string;
      switch (data.k) {
        case "const": id = insert({ op: "constant", type, value: type === "bool" ? data.value[0] !== 0 : data.value.length === 1 ? data.value[0] : [...data.value] }); break;
        case "builtin": id = insert({ op: "input", type, name: data.name === "uv" ? "uv0" : data.name }); break;
        case "uniform": id = resource(node); break;
        case "swizzle": id = insert({ op: "swizzle", type, inputs: [convert(data.src)], components: data.comps.replace(/[rgba]/g, (component) => ({ r: "x", g: "y", b: "z", a: "w" })[component]!) }); break;
        case "construct": {
          if (data.args.some((arg) => arg.type === "int")) return graphFailure("legacy-unsupported", "cannot migrate implicit conversion int to float in a vector constructor; provide float input values or retain the GLSL node material path");
          const parts = data.args.map(convert);
          // The legacy constructor also accepts a single scalar splat, while
          // serialized graph constructors require each component explicitly.
          id = data.args.length === 1 && data.args[0]!.type === "float"
            ? expandScalar(parts[0]!, data.args[0]!, type)
            : insert({ op: "construct", type, inputs: parts });
          break;
        }
        case "texture": id = insert({ op: "textureSample", type, resource: resource(data.sampler), inputs: [convert(data.uv)] }); break;
        case "op": {
          const op = TSL_OP[data.op];
          if (!op) return graphFailure("legacy-unsupported", `TSL operation ${data.op} has no graph equivalent`);
          let inputs = data.args.map(convert);
          if (["add", "sub", "mul", "div", "mod", "min", "max", "pow", "atan2", "step", "mix", "smoothstep", "clamp", "tan", "sign", "sqrt", "exp", "log", "fract", "floor", "ceil", "saturate", "oneMinus", "negate"].includes(op)) {
            inputs = inputs.map((id, index) => expandScalar(id, data.args[index]!, type));
          } else if (op === "distance") {
            // Distance returns a scalar, but its inputs can be vectors. Legacy
            // expressions broadcast a scalar to the vector width before measuring.
            const vector = data.args.find((arg) => arg.type === "vec2" || arg.type === "vec3" || arg.type === "vec4");
            const operandType = vector ? TSL_TYPE[vector.type]! : "f32";
            inputs = inputs.map((id, index) => expandScalar(id, data.args[index]!, operandType));
          }
          id = insert({ op, type, inputs });
          break;
        }
        default: return graphFailure("legacy-unsupported", `TSL ${data.k} nodes cannot yet be serialized; keep the existing GLSL node material path`);
      }
      memo.set(node, id);
      return id;
    } finally { active.delete(node); }
  };
  const outputs: Partial<Record<ShaderGraphMaterialOutput, string>> = {};
  for (const [key, channel] of LEGACY_OUTPUTS) {
    const input = options[key];
    if (input !== undefined) outputs[channel] = convert(toNode(input as TslInput));
  }
  const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes, resources, outputs,
    ...(options.alphaTest !== undefined ? { alphaTest: options.alphaTest } : {}) };
  const diagnostics = validateShaderGraph(graph);
  if (diagnostics.length) throw new ShaderGraphError(diagnostics);
  return { graph, uniforms };
}

function graphReflectionForStorage(graph: ShaderGraphDocument, storageNames: ReadonlySet<string>): {
  readonly graph: ShaderGraphDocument;
  readonly usedResources: ReadonlySet<string>;
} {
  const originals = new Map(graph.nodes.map((node) => [node.id, node]));
  const usedIds = new Set(originals.keys());
  const structs = new Map((graph.structs ?? []).map((declaration) => [declaration.name, declaration]));
  const reflected: ShaderGraphNode[] = [];
  const visited = new Set<string>();
  const reached = new Set<string>();
  const usedResources = new Set<string>();
  const zeroValues = new Map<ShaderGraphValueType, string>();
  let needsOutputFallback = false;
  let nextId = 0;
  const newId = (): string => {
    let id: string;
    do { id = `auraGraphReflection${nextId++}`; } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  const placeholder = (id: string, type: ShaderGraphValueType): ShaderGraphNode => {
    if (type.startsWith("struct:")) {
      const declaration = structs.get(type.slice(7));
      if (!declaration) return graphFailure("invalid-type", `missing struct ${type} in reflection graph`);
      return { id, op: "structConstruct", type, inputs: declaration.fields.map((field) => zero(field.type)) };
    }
    const matrix = /^mat([234])(?:x([234]))?$/.exec(type);
    const value = matrix ? Array(Number(matrix[1]) * Number(matrix[2] ?? matrix[1])).fill(0) as number[]
      : type === "bool" ? false
      : type === "f32" || type === "i32" || type === "u32" ? 0
      : type === "vec2" ? [0, 0]
      : type === "vec3" || type === "uvec3" ? [0, 0, 0]
      : type === "vec4" ? [0, 0, 0, 0]
      : graphFailure("invalid-type", `unsupported ${type} in reflection graph`);
    return { id, op: "constant", type, value };
  };
  const zero = (type: ShaderGraphValueType): string => {
    const known = zeroValues.get(type);
    if (known) return known;
    const id = newId();
    const node = placeholder(id, type);
    zeroValues.set(type, id);
    reflected.push(node);
    return id;
  };
  const collectResources = (id: string): void => {
    if (reached.has(id)) return;
    reached.add(id);
    const node = originals.get(id);
    if (!node) return graphFailure("missing-node", `missing ${id} in reflection graph`);
    if (node.resource && !storageNames.has(node.resource)) usedResources.add(node.resource);
    for (const input of node.inputs ?? []) collectResources(input);
  };
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = originals.get(id);
    if (!node) return graphFailure("missing-node", `missing ${id} in reflection graph`);
    if (node.op === "storageLoad" || node.op === "textureLoad" && node.resource !== undefined && storageNames.has(node.resource)) {
      // Graph IR cannot construct array literals. Preserve the real WGSL
      // storage read and use the bounded output-only GLSL reflection fallback.
      const hasArray = (type: ShaderGraphValueType): boolean => {
        if (type.startsWith("array:")) return true;
        if (!type.startsWith("struct:")) return false;
        const declaration = structs.get(type.slice(7));
        if (!declaration) return graphFailure("invalid-type", `missing struct ${type} in reflection graph`);
        return declaration.fields.some((field) => hasArray(field.type));
      };
      if (hasArray(node.type)) { needsOutputFallback = true; return; }
      reflected.push(placeholder(node.id, node.type));
      return;
    }
    for (const input of node.inputs ?? []) visit(input);
    reflected.push(node);
  };
  for (const id of Object.values(graph.outputs ?? {})) {
    if (id === undefined) continue;
    collectResources(id);
    visit(id);
  }
  const visitStatements = (statements: readonly ShaderGraphStatement[]): void => {
    for (const statement of statements) {
      if (statement.op === "setOutput") {
        collectResources(statement.value);
        visit(statement.value);
      } else if (statement.op === "if") {
        collectResources(statement.condition);
        visit(statement.condition);
        visitStatements(statement.then);
        visitStatements(statement.otherwise ?? []);
      } else if (statement.op === "loop") {
        visitStatements(statement.body);
      }
    }
  };
  visitStatements(graph.statements ?? []);
  const resources = graph.resources?.filter((resource) => resource.kind !== "storage-buffer" && resource.kind !== "storage-texture");
  const functionNodeCount = (graph.functions ?? []).reduce((count, declaration) => count + declaration.nodes.length, 0);
  if (needsOutputFallback || reflected.length + functionNodeCount > 512) {
    const nodes: ShaderGraphNode[] = [];
    const outputValues = new Map<ShaderGraphValueType, string>();
    const outputs: Partial<Record<ShaderGraphMaterialOutput, string>> = {};
    for (const [channel, sourceId] of Object.entries(graph.outputs ?? {})) {
      const type = originals.get(sourceId!)!.type;
      let id = outputValues.get(type);
      if (!id) {
        id = newId();
        nodes.push(placeholder(id, type));
        outputValues.set(type, id);
      }
      outputs[channel as ShaderGraphMaterialOutput] = id;
    }
    return { graph: { ...graph, resources, nodes, outputs, statements: [], functions: [] }, usedResources };
  }
  return { graph: {
    ...graph,
    resources,
    nodes: reflected
  }, usedResources };
}

/** Compile a material graph and bind its resource values to the existing renderer path. */
export function shaderGraphMaterial(options: ShaderGraphMaterialOptions): AuraMaterialSpec {
  if (!options || !options.graph || options.graph.stage !== "material") return graphFailure("invalid-stage", "material.node requires a material graph");
  if (options.backend !== undefined && options.backend !== "glsl" && options.backend !== "wgsl") {
    return graphFailure("unsupported-backend", `unknown graph material backend ${String(options.backend)}`);
  }
  const wgsl = compileShaderGraph(options.graph, "wgsl", { fog: options.fog === true });
  const aggregateBindings = wgsl.bindings.filter((binding) => binding.kind === "uniform" && binding.dataType !== undefined);
  // Aggregate and matrix uniforms bind on both backends: WebGPU packs the
  // portable uniform buffer, WebGL2 uploads the GLSL struct/array leaves.
  const storageResources = (options.graph.resources ?? []).filter((resource) => resource.kind === "storage-buffer" || resource.kind === "storage-texture");
  const storageNames = new Set(storageResources.map((resource) => resource.name));
  if (storageResources.length && options.backend === "glsl") return graphFailure("unsupported-backend", "material storage resources require WebGPU");
  // The GLSL half supplies reflection and attributes only for a WebGPU-only
  // storage graph. Replace storage reads only: sampled depth textureLoad nodes
  // also have a real GLSL implementation and must remain visible to reflection.
  // Both render passes reject storage materials on other backends.
  const storageReflection = storageResources.length ? graphReflectionForStorage(options.graph, storageNames) : undefined;
  const reflectionGraph = storageReflection?.graph ?? options.graph;
  const glsl = compileShaderGraph(reflectionGraph, "glsl", { fog: options.fog === true });
  if (!glsl.vertex || !glsl.fragment) return graphFailure("unsupported-backend", "the graph has no GLSL material stages");
  if (!wgsl.vertex || !wgsl.fragment) return graphFailure("unsupported-backend", "the graph has no WGSL material stages");
  const values = options.uniforms ?? {};
  const uniforms: Record<string, AuraCustomUniformSpec> = {};
  const uniformAliases: Record<string, string> = Object.create(null) as Record<string, string>;
  const declared = new Set<string>();
  for (const resource of options.graph.resources ?? []) {
    if (resource.kind === "storage-buffer" || resource.kind === "storage-texture") continue;
    const type = resource.kind === "uniform" ? resource.type : resource.kind;
    const aggregate = aggregateBindings.find((binding) => binding.name === resource.name);
    if (aggregate?.dataType) {
      declared.add(resource.name);
      const shaderName = glsl.bindings.find((binding) => binding.name === resource.name)?.shaderName;
      if (!shaderName) return graphFailure("invalid-resource", `compiler did not return a binding for ${resource.name}`);
      if (!Object.hasOwn(values, resource.name)) return graphFailure("invalid-resource", `aggregate graph uniform ${resource.name} requires an initial value`);
      const value = values[resource.name];
      validateGraphDataValue(aggregate.dataType, value, `uniforms.${resource.name}`);
      let snapshot: UniformDataValue;
      try { snapshot = cloneMaterialUniformValue(value); }
      catch (error) {
        return graphFailure("invalid-resource", error instanceof Error ? error.message : `aggregate graph uniform ${resource.name} could not be copied`);
      }
      validateGraphDataValue(aggregate.dataType, snapshot, `uniforms.${resource.name}`);
      uniformAliases[resource.name] = shaderName;
      uniforms[shaderName] = { type: "data", dataType: aggregate.dataType, value: snapshot };
      continue;
    }
    if (type !== "f32" && type !== "i32" && type !== "u32" && type !== "bool" && type !== "vec2" && type !== "vec3" && type !== "vec4" && type !== "texture2d" && type !== "texture3d" && type !== "depth2d") {
      return graphFailure("unsupported-resource", `material graph uniform ${resource.name} has unsupported type ${String(type)}`);
    }
    declared.add(resource.name);
    const hasValue = Object.prototype.hasOwnProperty.call(values, resource.name);
    if (hasValue && (type === "texture2d" || type === "texture3d" || type === "depth2d")) validateGraphTextureValue(type, resource.name, values[resource.name]);
    const shaderName = glsl.bindings.find((binding) => binding.name === resource.name)?.shaderName;
    if (!shaderName) return graphFailure("invalid-resource", `compiler did not return a binding for ${resource.name}`);
    uniformAliases[resource.name] = shaderName;
    uniforms[shaderName] = hasValue
      ? { type, value: values[resource.name] }
      : type;
  }
  for (const name of Object.keys(values)) if (!declared.has(name)) return graphFailure("unknown-resource", `no graph resource named ${name}`);
  const graphBuiltins = new Set(wgsl.material?.builtins ?? []);
  const attributes = ["a_position"];
  if (wgsl.material?.requiresLighting || graphBuiltins.has("normalLocal") || graphBuiltins.has("normalWorld")) attributes.push("a_normal");
  if (graphBuiltins.has("uv0")) attributes.push("a_uv");
  if (graphBuiltins.has("uv1")) attributes.push("a_uv1");
  if ((glsl.depth === undefined) !== (wgsl.depth === undefined)) return graphFailure("unsupported-backend", "the graph has incomplete paired shadow stages");
  const storageValues = options.storage ?? {};
  for (const name of Object.keys(storageValues)) if (!storageResources.some((resource) => resource.name === name)) return graphFailure("unknown-resource", `no graph storage resource named ${name}`);
  const storageByName = new Map<string, NativeStorageBinding>();
  for (const resource of storageResources) {
    const value = storageValues[resource.name];
    const binding = wgsl.bindings.find((entry) => entry.name === resource.name)!;
    if (!value || value.kind !== resource.kind) return graphFailure("invalid-resource", `graph storage ${resource.name} requires a matching ${resource.kind} value`);
    if (value.kind === "storage-buffer") {
      const { buffer, offset = 0 } = value;
      const size = value.size ?? (buffer ? buffer.byteLength - offset : 0);
      const minimumSize = binding.minBindingSize;
      if (!minimumSize || !buffer || buffer.disposed || buffer.usage !== "storage" || !Number.isSafeInteger(offset) || offset < 0 || offset % 4 !== 0 || !Number.isSafeInteger(size) || size < minimumSize || size % 4 !== 0 || offset + size > buffer.byteLength) {
        return graphFailure("invalid-resource", `graph storage buffer ${resource.name} requires a live storage buffer and an in-bounds byte range containing at least one element`);
      }
      storageByName.set(resource.name, { name: resource.name, kind: "storage-buffer", group: binding.group, binding: binding.binding, buffer, offset, size });
    } else {
      const expectedFormat: Readonly<Record<string, string>> = { rgba8unorm: "rgba8", rgba16float: "rgba16f", rgba32float: "rgba32f", r32float: "r32f" };
      if (!(value.texture instanceof Texture) || value.texture.disposed || value.texture.dimension !== "2d"
        || !value.texture.usage.includes("storage") || value.texture.format !== expectedFormat[resource.format ?? ""]) {
        return graphFailure("invalid-resource", `graph storage texture ${resource.name} requires a live 2D storage texture with the declared format`);
      }
      storageByName.set(resource.name, { name: resource.name, kind: "storage-texture", group: binding.group, binding: binding.binding, texture: value.texture, format: resource.format });
    }
  }
  const stageBindings = (pass: "forward" | "depth") => {
    const stages = wgsl.storageStages?.[pass] ?? [];
    const resources = stages.map(({ name }) => storageByName.get(name)!);
    const layouts: NativeShaderStorageLayout[] = stages.map(({ name, visibility }) => {
      const binding = wgsl.bindings.find((entry) => entry.name === name)!;
      return binding.kind === "storage-buffer"
        ? { kind: "storage-buffer", group: binding.group, binding: binding.binding, visibility, access: "read" }
        : { kind: "storage-texture", group: binding.group, binding: binding.binding, visibility, access: "read", format: binding.format!, viewDimension: "2d" };
    });
    return { resources, layouts };
  };
  const forwardStorage = stageBindings("forward"), depthStorage = stageBindings("depth");
  const graphStorage = storageResources.length ? { forward: forwardStorage.resources, depth: depthStorage.resources, forwardLayouts: forwardStorage.layouts, depthLayouts: depthStorage.layouts } : undefined;
  const reflectedUniforms: string[] = [];
  let needsSampler3DPrecision = false;
  if (storageReflection) for (const resource of options.graph.resources ?? []) {
    if (!storageReflection.usedResources.has(resource.name)) continue;
    const binding = glsl.bindings.find((entry) => entry.name === resource.name);
    if (!binding || new RegExp(`\\b${binding.shaderName}\\b`).test(`${glsl.vertex}\n${glsl.fragment}`)) continue;
    const type = resource.kind === "texture2d" || resource.kind === "depth2d" ? "sampler2D"
      : resource.kind === "texture3d" ? "sampler3D"
      : resource.type === "f32" ? "float" : resource.type === "i32" ? "int" : resource.type === "u32" ? "uint"
      : resource.type === "bool" || resource.type === "vec2" || resource.type === "vec3" || resource.type === "vec4" ? resource.type
      : typeof resource.type === "string" && /^mat[234](?:x[234])?$/.test(resource.type)
        ? resource.type.replace(/^mat([234])x\1$/, "mat$1")
      : undefined;
    if (!type) return graphFailure("unsupported-resource", `cannot reflect graph resource ${resource.name}`);
    if (type === "sampler3D") needsSampler3DPrecision = true;
    reflectedUniforms.push(`uniform ${type} ${binding.shaderName};`);
  }
  const reflectionVertex = (source: string): string => storageResources.length
    ? `${[...(needsSampler3DPrecision ? ["precision highp sampler3D;"] : []), ...reflectedUniforms, ...attributes.filter((name) => name !== "a_position" && !new RegExp(`\\bin\\s+\\w+\\s+${name}\\b`).test(source)).map((name) => `in ${name === "a_normal" ? "vec3" : "vec2"} ${name};`)].join("\n")}\n${source}`
    : source;
  const skinVariant = (skinning: 4 | 8) => {
    const gl = compileShaderGraph(reflectionGraph, "glsl", { fog: options.fog === true, skinning });
    const gpu = compileShaderGraph(options.graph, "wgsl", { fog: options.fog === true, skinning });
    if (!gl.vertex || !gl.fragment || !gl.depth || !gpu.vertex || !gpu.fragment || !gpu.depth) {
      return graphFailure("unsupported-backend", `the ${skinning}-influence graph is missing paired stages`);
    }
    return { forward: { glsl: { vertex: reflectionVertex(gl.vertex), fragment: gl.fragment }, wgsl: { vertex: gpu.vertex, fragment: gpu.fragment } }, depth: { glsl: { ...gl.depth, vertex: reflectionVertex(gl.depth.vertex) }, wgsl: gpu.depth } };
  };
  const graphSkinning = { four: skinVariant(4), eight: skinVariant(8) };
  const spec: AuraCustomMaterialSpec & {
    readonly graphDepth?: { readonly glsl: { readonly vertex: string; readonly fragment: string }; readonly wgsl: { readonly vertex: string; readonly fragment: string } };
    readonly graphSkinning: typeof graphSkinning;
    readonly graphStorage?: typeof graphStorage;
  } = {
    // The portable adapter consumes this validated attribute list so missing
    // normals/UVs fail the geometry contract instead of reading zero values.
    glsl: { vertex: `// @aura3d-graph-attributes:${attributes.join(",")}\n${wgsl.material?.requiresLighting ? "// @aura3d-graph-lighting:metallic-roughness\n" : ""}${reflectionVertex(glsl.vertex)}`, fragment: glsl.fragment },
    wgsl: { vertex: wgsl.vertex, fragment: wgsl.fragment },
    ...(glsl.depth && wgsl.depth ? { graphDepth: { glsl: { ...glsl.depth, vertex: reflectionVertex(glsl.depth.vertex) }, wgsl: wgsl.depth } } : {}),
    graphSkinning,
    ...(graphStorage ? { graphStorage } : {}),
    ...(Object.keys(uniforms).length ? { uniforms } : {}),
    ...(Object.keys(uniformAliases).length ? { uniformAliases } : {}),
    ...(options.transparent !== undefined ? { transparent: options.transparent } : {}),
    ...(options.depthWrite !== undefined ? { depthWrite: options.depthWrite } : {}),
    ...(options.depthTest !== undefined ? { depthTest: options.depthTest } : {}),
    ...(options.side !== undefined ? { side: options.side } : {}),
    ...(options.blending !== undefined ? { blending: options.blending } : {}),
    ...(options.fog !== undefined ? { fog: options.fog } : {}),
    ...(options.defines !== undefined ? { defines: options.defines } : {}),
    // The shadow pass must use the same displacement and alpha coverage.
    ...(wgsl.material?.vertex.outputs.position || wgsl.material?.alphaTest ? { castShadow: true } : {})
  };
  assertAuraCustomMaterialSpec(spec, "material.node");
  certifyCompiledGraphMaterialSpec(spec);
  return { kind: "custom", custom: spec };
}

type GraphOutputValueType<Output extends ShaderGraphMaterialOutput> =
  Output extends "color" ? "vec3" | "vec4"
    : Output extends "opacity" | "roughness" | "metalness" ? "f32" : "vec3";

/** Namespace for graph persistence, validation, compilation and material creation. */
export const shaderGraph = {
  create(stage: "material" | "compute" = "material"): ShaderGraphDocument {
    return { version: 1, stage, nodes: [], resources: [], ...(stage === "material" ? { outputs: {} } : { statements: [] }) };
  },
  /** Read the current value only in a setOutput for the same initialized channel. */
  output<Output extends ShaderGraphMaterialOutput>(id: string, name: Output, type: GraphOutputValueType<Output>): ShaderGraphNode {
    return { id, op: "output", name, type };
  },
  /** Set a material channel to a node expression; graph validation checks its type and scope. */
  setOutput(output: ShaderGraphMaterialOutput, value: string): Extract<ShaderGraphStatement, { readonly op: "setOutput" }> {
    return { op: "setOutput", output, value };
  },
  if(condition: string, then: readonly ShaderGraphStatement[], otherwise?: readonly ShaderGraphStatement[]): Extract<ShaderGraphStatement, { readonly op: "if" }> {
    return { op: "if", condition, then, ...(otherwise === undefined ? {} : { otherwise }) };
  },
  loop(index: string, count: number, body: readonly ShaderGraphStatement[]): Extract<ShaderGraphStatement, { readonly op: "loop" }> {
    return { op: "loop", index, count, body };
  },
  serialize: serializeShaderGraph,
  deserialize: deserializeShaderGraph,
  validate: validateShaderGraph,
  compile: compileShaderGraph,
  fromTsl: migrateTslShaderGraph,
  material: shaderGraphMaterial,
  /** WGSL storage layout of a graph storage-buffer resource for `elementCount` elements. */
  storageLayout: shaderGraphStorageLayout,
  /** Typed element values -> exact layout-derived bytes for a graph storage buffer. */
  packStorage: packShaderGraphStorage
};
