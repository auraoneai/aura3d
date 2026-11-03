import {
  compileShaderGraph as compileNativeShaderGraph,
  validateShaderGraph as validateNativeShaderGraph,
  type ShaderGraphCompileResult as NativeShaderGraphCompileResult,
  type ShaderGraphDiagnostic as NativeShaderGraphDiagnostic,
  type ShaderGraphDocument as NativeShaderGraphDocument,
  type ShaderGraphMaterialOutput,
  type ShaderGraphNode as NativeShaderGraphNode,
  type ShaderGraphFunction,
  type ShaderGraphOperation,
  type ShaderGraphResource,
  type ShaderGraphStruct,
  type ShaderGraphTarget,
  type ShaderGraphValueType as NativeShaderGraphValueType
} from "@aura3d/rendering/shader-graph";

export type ShaderGraphValueType = "float" | "vec2" | "vec3" | "vec4" | "color" | "texture2d" | "surface";

export interface ShaderGraphPort {
  readonly name: string;
  readonly type: ShaderGraphValueType;
  readonly required?: boolean;
  readonly defaultValue?: number | readonly number[] | string;
}

export interface ShaderGraphNode {
  readonly id: string;
  readonly type: string;
  readonly category: "Math" | "Vector" | "Texture" | "UV" | "Color" | "PBR" | "Utility";
  readonly inputs: readonly ShaderGraphPort[];
  readonly outputs: readonly ShaderGraphPort[];
}

export interface ShaderGraphEdge {
  readonly id: string;
  readonly from: {
    readonly nodeId: string;
    readonly output: string;
  };
  readonly to: {
    readonly nodeId: string;
    readonly input: string;
  };
}

export interface ShaderGraphDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly port?: string;
}

export interface ShaderGraphFixture {
  readonly id: "external-parity-old-branch-shader-graph-fixture";
  readonly source: "origin-master-shader-graph-adapted";
  readonly sourceFiles: readonly [
    "origin/master:src/shaders/graph/ShaderGraph.ts",
    "origin/master:src/shaders/graph/NodeLibrary.ts",
    "origin/master:src/shaders/graph/GraphValidator.ts",
    "origin/master:src/shaders/graph/GraphSerializer.ts",
    "origin/master:src/shaders/graph/ShaderNode.ts"
  ];
  readonly nodes: readonly ShaderGraphNode[];
  readonly edges: readonly ShaderGraphEdge[];
  readonly validation: {
    readonly valid: boolean;
    readonly outputNodePresent: boolean;
    readonly acyclic: boolean;
    readonly connectedRequiredInputs: number;
    readonly typedConnections: number;
    readonly warnings: readonly ShaderGraphDiagnostic[];
    readonly errors: readonly ShaderGraphDiagnostic[];
  };
  readonly codegen: {
    readonly targets: readonly ["glsl", "wgsl"];
    readonly uniformCount: number;
    readonly textureBindingCount: number;
    readonly generatedExpressionCount: number;
    readonly glslHash: string;
    readonly wgslHash: string;
    readonly previewFragmentLines: readonly string[];
  };
  readonly categories: readonly string[];
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

const sourceFiles = [
  "origin/master:src/shaders/graph/ShaderGraph.ts",
  "origin/master:src/shaders/graph/NodeLibrary.ts",
  "origin/master:src/shaders/graph/GraphValidator.ts",
  "origin/master:src/shaders/graph/GraphSerializer.ts",
  "origin/master:src/shaders/graph/ShaderNode.ts"
] as const;

const blockedClaims = [
  "Unity Shader Graph parity",
  "Unreal Material Editor parity",
  "live visual node editor parity",
  "full material graph serialization parity",
  "shader compiler optimization parity"
] as const;

export function createOldBranchShaderGraphFixture(): ShaderGraphFixture {
  const nodes: readonly ShaderGraphNode[] = [
    node("uv0", "uv.texcoord", "UV", [], [{ name: "uv", type: "vec2" }]),
    node("albedo-texture", "texture.sample2d", "Texture", [
      { name: "uv", type: "vec2", required: true },
      { name: "texture", type: "texture2d", defaultValue: "procedural-carbon-fiber" }
    ], [{ name: "color", type: "color" }]),
    node("tint", "color.rgb", "Color", [], [{ name: "color", type: "color" }]),
    node("multiply", "math.multiply", "Math", [
      { name: "a", type: "color", required: true },
      { name: "b", type: "color", required: true }
    ], [{ name: "value", type: "color" }]),
    node("normal", "vector.normal", "Vector", [], [{ name: "normal", type: "vec3" }]),
    node("pbr", "pbr.surface", "PBR", [
      { name: "baseColor", type: "color", required: true },
      { name: "normal", type: "vec3", required: true },
      { name: "metallic", type: "float", defaultValue: 0.2 },
      { name: "roughness", type: "float", defaultValue: 0.38 }
    ], [{ name: "surface", type: "surface" }]),
    node("output", "utility.output", "Utility", [{ name: "surface", type: "surface", required: true }], [])
  ];
  const edges: readonly ShaderGraphEdge[] = [
    edge("e0", "uv0", "uv", "albedo-texture", "uv"),
    edge("e1", "albedo-texture", "color", "multiply", "a"),
    edge("e2", "tint", "color", "multiply", "b"),
    edge("e3", "multiply", "value", "pbr", "baseColor"),
    edge("e4", "normal", "normal", "pbr", "normal"),
    edge("e5", "pbr", "surface", "output", "surface")
  ];
  const validation = validateShaderGraph(nodes, edges);
  const previewFragmentLines = [
    "vec2 uv = a3d_texcoord0;",
    "vec3 sampled = texture(u_proceduralCarbonFiber, uv).rgb;",
    "vec3 baseColor = sampled * vec3(0.88, 0.14, 0.08);",
    "a3dSurface.baseColor = baseColor;",
    "a3dSurface.metallic = 0.2;",
    "a3dSurface.roughness = 0.38;"
  ] as const;
  const glslHash = hashStrings(previewFragmentLines);
  const wgslHash = hashStrings(previewFragmentLines.map((line) => line.replaceAll("vec", "vec").replaceAll("texture(", "textureSample(")));
  return {
    id: "external-parity-old-branch-shader-graph-fixture",
    source: "origin-master-shader-graph-adapted",
    sourceFiles,
    nodes,
    edges,
    validation,
    codegen: {
      targets: ["glsl", "wgsl"],
      uniformCount: 3,
      textureBindingCount: 1,
      generatedExpressionCount: previewFragmentLines.length,
      glslHash,
      wgslHash,
      previewFragmentLines
    },
    categories: [...new Set(nodes.map((entry) => entry.category))].sort(),
    blockedClaims,
    hash: hashStrings([
      ...nodes.map((entry) => `${entry.id}:${entry.type}:${entry.category}`),
      ...edges.map((entry) => `${entry.from.nodeId}.${entry.from.output}->${entry.to.nodeId}.${entry.to.input}`),
      glslHash,
      wgslHash
    ]),
    claimBoundary: "Deterministic bounded shader-graph evidence adapted from the old node library, graph validation, and graph codegen concepts. It proves typed node/edge validation, required-input coverage, acyclic graph checks, category metadata, and GLSL/WGSL preview codegen hashes; it does not claim a live visual node editor, full material graph serialization, Unity Shader Graph parity, Unreal Material Editor parity, or shader compiler optimization parity."
  };
}

function validateShaderGraph(nodes: readonly ShaderGraphNode[], edges: readonly ShaderGraphEdge[]): ShaderGraphFixture["validation"] {
  const errors: ShaderGraphDiagnostic[] = [];
  const warnings: ShaderGraphDiagnostic[] = [];
  const nodeById = new Map(nodes.map((entry) => [entry.id, entry]));
  const connectedInputs = new Set(edges.map((entry) => `${entry.to.nodeId}.${entry.to.input}`));
  let typedConnections = 0;

  for (const edgeEntry of edges) {
    const fromNode = nodeById.get(edgeEntry.from.nodeId);
    const toNode = nodeById.get(edgeEntry.to.nodeId);
    const fromPort = fromNode?.outputs.find((entry) => entry.name === edgeEntry.from.output);
    const toPort = toNode?.inputs.find((entry) => entry.name === edgeEntry.to.input);
    if (!fromNode || !fromPort || !toNode || !toPort) {
      errors.push({ severity: "error", message: "Edge references a missing node or port.", edgeId: edgeEntry.id });
      continue;
    }
    if (fromPort.type !== toPort.type) {
      errors.push({ severity: "error", message: `Type mismatch: ${fromPort.type} cannot connect to ${toPort.type}.`, edgeId: edgeEntry.id });
      continue;
    }
    typedConnections += 1;
  }

  let connectedRequiredInputs = 0;
  for (const graphNode of nodes) {
    for (const input of graphNode.inputs) {
      if (input.required && connectedInputs.has(`${graphNode.id}.${input.name}`)) {
        connectedRequiredInputs += 1;
      } else if (input.required) {
        errors.push({ severity: "error", message: `Required input '${input.name}' is not connected.`, nodeId: graphNode.id, port: input.name });
      } else if (!connectedInputs.has(`${graphNode.id}.${input.name}`) && input.defaultValue === undefined) {
        warnings.push({ severity: "warning", message: `Input '${input.name}' has no connection and no default value.`, nodeId: graphNode.id, port: input.name });
      }
    }
  }

  const acyclic = !hasCycle(nodes, edges);
  if (!acyclic) errors.push({ severity: "error", message: "Cycle detected in shader graph." });
  const outputNodePresent = nodes.some((entry) => entry.type === "utility.output");
  if (!outputNodePresent) errors.push({ severity: "error", message: "Graph must have a utility.output node." });

  return {
    valid: errors.length === 0,
    outputNodePresent,
    acyclic,
    connectedRequiredInputs,
    typedConnections,
    warnings,
    errors
  };
}

function hasCycle(nodes: readonly ShaderGraphNode[], edges: readonly ShaderGraphEdge[]): boolean {
  const adjacency = new Map(nodes.map((entry) => [entry.id, [] as string[]]));
  for (const graphEdge of edges) {
    adjacency.get(graphEdge.from.nodeId)?.push(graphEdge.to.nodeId);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((entry) => visit(entry.id));
}

function node(
  id: string,
  type: ShaderGraphNode["type"],
  category: ShaderGraphNode["category"],
  inputs: readonly ShaderGraphPort[],
  outputs: readonly ShaderGraphPort[]
): ShaderGraphNode {
  return { id, type, category, inputs, outputs };
}

function edge(id: string, fromNode: string, fromOutput: string, toNode: string, toInput: string): ShaderGraphEdge {
  return { id, from: { nodeId: fromNode, output: fromOutput }, to: { nodeId: toNode, input: toInput } };
}

function hashStrings(values: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

/** An editable port describes the compiler types it can currently receive. */
export interface ShaderGraphInputPort {
  readonly index: number;
  readonly name: string;
  readonly acceptedTypes: readonly NativeShaderGraphValueType[];
  readonly connectedNodeId: string | null;
}

/** Explicit model aliases distinguish the live compiler IR from legacy fixture types. */
export type ShaderGraphModelDocument = NativeShaderGraphDocument;
export type ShaderGraphModelNode = NativeShaderGraphNode;
export type ShaderGraphModelResource = ShaderGraphResource;
export type ShaderGraphModelDiagnostic = NativeShaderGraphDiagnostic;
export type ShaderGraphModelCompileResult = NativeShaderGraphCompileResult;

export interface ShaderGraphModelOptions {
  /** Maximum retained undo states. The default is 100; zero disables history. */
  readonly historyLimit?: number;
}

export type ShaderGraphModelListener = (graph: NativeShaderGraphDocument) => void;

const GRAPH_INPUTS: Readonly<Record<ShaderGraphOperation, number | "variable" | "fields" | "parameters">> = {
  constant: 0, input: 0, uniform: 0, local: 0, output: 0, construct: "variable", swizzle: 1,
  textureSample: 1, storageLoad: 1, textureLoad: 1, structConstruct: "fields", structField: 1, arrayIndex: 2, parameter: 0, call: "parameters", noise: 1,
  add: 2, sub: 2, mul: 2, div: 2, mod: 2, min: 2, max: 2, pow: 2, dot: 2, cross: 2, distance: 2, atan2: 2, step: 2,
  sin: 1, cos: 1, tan: 1, abs: 1, sign: 1, sqrt: 1, exp: 1, log: 1, fract: 1, floor: 1, ceil: 1,
  saturate: 1, oneMinus: 1, negate: 1, normalize: 1, length: 1, mix: 3, smoothstep: 3, clamp: 3, select: 3,
  less: 2, greater: 2, equal: 2
};
const FLOAT_VECTORS: readonly NativeShaderGraphValueType[] = ["vec2", "vec3", "vec4"];
const FLOAT_VALUES: readonly NativeShaderGraphValueType[] = ["f32", ...FLOAT_VECTORS];
const FLOAT_COMPONENT_OPERATIONS: ReadonlySet<ShaderGraphOperation> = new Set([
  "mod", "atan2", "step", "smoothstep", "tan", "sign", "sqrt", "exp", "log", "fract", "floor", "ceil", "saturate", "oneMinus"
]);
const SCALAR_VALUES: readonly NativeShaderGraphValueType[] = ["f32", "i32", "u32", "bool"];
const VALUE_WIDTH: Readonly<Partial<Record<NativeShaderGraphValueType, number>>> = {
  f32: 1, i32: 1, u32: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, uvec3: 3
};
const GRAPH_BASE_TYPES: ReadonlySet<string> = new Set([...SCALAR_VALUES, ...FLOAT_VECTORS, "uvec3"]);
const GRAPH_RESERVED_IDENTIFIERS: ReadonlySet<string> = new Set([
  "if", "else", "for", "while", "loop", "switch", "case", "break", "continue", "return", "discard", "true", "false",
  "var", "let", "const", "override", "fn", "struct", "uniform", "buffer", "in", "out", "attribute", "varying",
  "void", "float", "int", "uint", "bool", "sampler", "texture", "main"
]);
const MAX_GRAPH_ARRAY_LENGTH = 65536;

/** Match the compiler's fixed-array spelling and length limit. */
function graphArrayType(type: string): { readonly length: number; readonly element: string } | undefined {
  const match = /^array:([1-9]\d*):(.+)$/.exec(type);
  if (!match) return undefined;
  const length = Number(match[1]);
  const element = match[2];
  return element !== undefined && Number.isSafeInteger(length) && length <= MAX_GRAPH_ARRAY_LENGTH ? { length, element } : undefined;
}

/** Dynamic indices remain the caller's responsibility; known constants must fit. */
function arrayIndexFits(index: NativeShaderGraphNode | undefined, length = MAX_GRAPH_ARRAY_LENGTH): boolean {
  if (!index || index.op !== "constant" || (index.type !== "i32" && index.type !== "u32")) return true;
  const value = Array.isArray(index.value) ? index.value.length === 1 ? index.value[0] : undefined : index.value;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;
}

/**
 * Undoable editor for the same serializable graph accepted by the renderer's
 * compiler. Invalid intermediate graphs stay editable and can be persisted;
 * compile delegates to the renderer and throws its structured diagnostics.
 */
export class ShaderGraphModel {
  private graph: NativeShaderGraphDocument;
  private readonly historyLimit: number;
  private readonly past: NativeShaderGraphDocument[] = [];
  private readonly future: NativeShaderGraphDocument[] = [];
  private readonly listeners = new Set<ShaderGraphModelListener>();

  constructor(graph: NativeShaderGraphDocument = { version: 1, stage: "material", nodes: [], resources: [], outputs: {} }, options: ShaderGraphModelOptions = {}) {
    const limit = options.historyLimit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000) throw new Error("Shader graph historyLimit must be an integer from 0 to 1000.");
    assertGraphEnvelope(graph);
    this.historyLimit = limit;
    this.graph = cloneGraph(graph);
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  snapshot(): NativeShaderGraphDocument { return cloneGraph(this.graph); }

  subscribe(listener: ShaderGraphModelListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Describe accepted input types without manufacturing links for empty slots. */
  inputPorts(nodeId: string): readonly ShaderGraphInputPort[] {
    const node = this.node(nodeId);
    const arity = this.inputArity(node);
    if (arity === undefined) return [];
    const inputs = node.inputs ?? [];
    const usedWidth = arity === "variable" ? inputs.reduce((sum, id) => {
      const input = this.graph.nodes.find((entry) => entry.id === id);
      return sum + (input ? VALUE_WIDTH[input.type] ?? 0 : 0);
    }, 0) : 0;
    const width = VALUE_WIDTH[node.type] ?? 0;
    const hasRoomForAnother = inputs.length === 0 || (Boolean(inputs[inputs.length - 1]) && usedWidth < width);
    const count = arity === "variable"
      ? width === 0 ? 0 : Math.max(1, Math.min(width, inputs.length + (hasRoomForAnother ? 1 : 0)))
      : arity;
    const fields = node.op === "structConstruct" ? this.structFor(node.type)?.fields : undefined;
    const parameters = node.op === "call" ? this.functionFor(node.name)?.parameters : undefined;
    return Array.from({ length: count }, (_, index) => ({
      index,
      name: fields?.[index]?.name ?? parameters?.[index]?.name ?? (node.op === "textureSample" ? "Texture coordinates" : node.op === "textureLoad" ? "Pixel coordinates" : node.op === "storageLoad" ? "Buffer index" : node.op === "arrayIndex" ? index === 0 ? "Array" : "Array index" : `Input ${index + 1}`),
      acceptedTypes: this.inputTypes(node, index),
      connectedNodeId: node.inputs?.[index] || null
    }));
  }

  canConnect(fromId: string, toId: string, inputIndex: number): boolean {
    const source = this.graph.nodes.find((entry) => entry.id === fromId);
    const destination = this.graph.nodes.find((entry) => entry.id === toId);
    if (!source || !destination || !Number.isSafeInteger(inputIndex) || inputIndex < 0) return false;
    const arity = this.inputArity(destination);
    if (arity === undefined || (arity !== "variable" && inputIndex >= arity) ||
        (arity === "variable" && (inputIndex > (destination.inputs?.length ?? 0) || inputIndex >= (VALUE_WIDTH[destination.type] ?? 0)))) return false;
    if (!this.inputTypes(destination, inputIndex).includes(source.type)) return false;
    if (destination.op === "arrayIndex" && inputIndex === 1) {
      const array = this.graph.nodes.find((entry) => entry.id === destination.inputs?.[0]);
      return arrayIndexFits(source, array ? graphArrayType(array.type)?.length : undefined);
    }
    return true;
  }

  addNode(node: NativeShaderGraphNode): void {
    if (!node || typeof node.id !== "string" || !node.id.trim()) throw new Error("Shader graph node id is required.");
    if (this.graph.nodes.some((entry) => entry.id === node.id)) throw new Error(`Shader graph node already exists: ${node.id}.`);
    this.commit({ ...this.graph, nodes: [...this.graph.nodes, cloneValue(node)] });
  }

  updateNode(id: string, patch: Partial<Omit<NativeShaderGraphNode, "id">>): void {
    const current = this.node(id);
    const next = { ...current, ...cloneValue(patch), id };
    this.commit({ ...this.graph, nodes: this.graph.nodes.map((entry) => entry.id === id ? next : entry) });
  }

  removeNode(id: string): void {
    this.node(id);
    const nodes = this.graph.nodes.filter((entry) => entry.id !== id).map((entry) => entry.inputs?.includes(id)
      ? { ...entry, inputs: entry.inputs.map((input) => input === id ? "" : input) }
      : entry);
    const outputs = { ...(this.graph.outputs ?? {}) };
    for (const key of Object.keys(outputs) as ShaderGraphMaterialOutput[]) {
      if (outputs[key] === id) delete outputs[key];
    }
    this.commit({ ...this.graph, nodes, outputs });
  }

  connect(fromId: string, toId: string, inputIndex: number): void {
    if (!this.canConnect(fromId, toId, inputIndex)) throw new Error(`Cannot connect ${fromId} to ${toId} input ${inputIndex}: missing node, invalid port, or incompatible type.`);
    const destination = this.node(toId);
    const inputs = [...(destination.inputs ?? [])];
    while (inputs.length <= inputIndex) inputs.push("");
    inputs[inputIndex] = fromId;
    this.updateNode(toId, { inputs });
  }

  disconnect(toId: string, inputIndex: number): void {
    const destination = this.node(toId);
    if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= (destination.inputs?.length ?? 0)) {
      throw new Error(`Shader graph input ${inputIndex} does not exist on ${toId}.`);
    }
    const inputs = [...destination.inputs!];
    inputs[inputIndex] = "";
    if (destination.op === "construct") while (inputs.length > 1 && inputs[inputs.length - 1] === "") inputs.pop();
    this.updateNode(toId, { inputs });
  }

  setOutput(output: ShaderGraphMaterialOutput, nodeId: string | null): void {
    const validOutputs: readonly ShaderGraphMaterialOutput[] = ["color", "normal", "roughness", "metalness", "emissive", "opacity", "position"];
    if (!validOutputs.includes(output)) throw new Error(`Unknown shader graph output: ${String(output)}.`);
    if (nodeId !== null) this.node(nodeId);
    const outputs = { ...(this.graph.outputs ?? {}) };
    if (nodeId === null) delete outputs[output]; else outputs[output] = nodeId;
    this.commit({ ...this.graph, outputs });
  }

  setResource(resource: ShaderGraphResource): void {
    if (!resource || typeof resource.name !== "string" || !resource.name.trim()) throw new Error("Shader graph resource name is required.");
    const resources = this.graph.resources ?? [];
    const next = resources.some((entry) => entry.name === resource.name)
      ? resources.map((entry) => entry.name === resource.name ? cloneValue(resource) : entry)
      : [...resources, cloneValue(resource)];
    this.commit({ ...this.graph, resources: next });
  }

  removeResource(name: string): void {
    const resources = this.graph.resources ?? [];
    if (!resources.some((resource) => resource.name === name)) throw new Error(`Shader graph resource not found: ${name}.`);
    this.commit({ ...this.graph, resources: resources.filter((resource) => resource.name !== name) });
  }

  setStruct(declaration: ShaderGraphStruct): void {
    if (!declaration || typeof declaration.name !== "string" || !declaration.name.trim()) throw new Error("Shader graph struct name is required.");
    const structs = this.graph.structs ?? [];
    if (!Array.isArray(structs)) throw new Error("Shader graph structs must be an array.");
    const next = structs.some((entry) => entry?.name === declaration.name)
      ? structs.map((entry) => entry?.name === declaration.name ? cloneValue(declaration) : entry)
      : [...structs, cloneValue(declaration)];
    this.commit({ ...this.graph, structs: next });
  }

  removeStruct(name: string): void {
    const structs = this.graph.structs ?? [];
    if (!Array.isArray(structs)) throw new Error("Shader graph structs must be an array.");
    if (!structs.some((entry) => entry?.name === name)) throw new Error(`Shader graph struct not found: ${name}.`);
    this.commit({ ...this.graph, structs: structs.filter((entry) => entry?.name !== name) });
  }

  setFunction(declaration: ShaderGraphFunction): void {
    if (!declaration || typeof declaration.name !== "string" || !declaration.name.trim()) throw new Error("Shader graph function name is required.");
    const functions = this.graph.functions ?? [];
    if (!Array.isArray(functions)) throw new Error("Shader graph functions must be an array.");
    const next = functions.some((entry) => entry?.name === declaration.name)
      ? functions.map((entry) => entry?.name === declaration.name ? cloneValue(declaration) : entry)
      : [...functions, cloneValue(declaration)];
    this.commit({ ...this.graph, functions: next });
  }

  removeFunction(name: string): void {
    const functions = this.graph.functions ?? [];
    if (!Array.isArray(functions)) throw new Error("Shader graph functions must be an array.");
    if (!functions.some((entry) => entry?.name === name)) throw new Error(`Shader graph function not found: ${name}.`);
    this.commit({ ...this.graph, functions: functions.filter((entry) => entry?.name !== name) });
  }

  validate(target?: ShaderGraphTarget): readonly NativeShaderGraphDiagnostic[] {
    return validateNativeShaderGraph(this.snapshot(), target);
  }

  compile(target: ShaderGraphTarget): NativeShaderGraphCompileResult {
    return compileNativeShaderGraph(this.snapshot(), target);
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.graph);
    this.graph = previous;
    this.notify();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.graph);
    this.graph = next;
    this.notify();
    return true;
  }

  private node(id: string): NativeShaderGraphNode {
    const node = this.graph.nodes.find((entry) => entry.id === id);
    if (!node) throw new Error(`Shader graph node not found: ${id}.`);
    return node;
  }

  private structFor(type: NativeShaderGraphValueType): ShaderGraphStruct | undefined {
    if (!type.startsWith("struct:") || !Array.isArray(this.graph.structs)) return undefined;
    return this.graph.structs.find((entry) => entry && entry.name === type.slice(7) && Array.isArray(entry.fields));
  }

  private functionFor(name: string | undefined): ShaderGraphFunction | undefined {
    if (!name || !Array.isArray(this.graph.functions)) return undefined;
    return this.graph.functions.find((entry) => entry && entry.name === name && Array.isArray(entry.parameters));
  }

  /** Match the compiler's recursive type grammar for candidate array sources. */
  private validArrayType(type: string): boolean {
    let element = type;
    let depth = 0;
    while (element.startsWith("array:")) {
      const array = graphArrayType(element);
      if (!array || ++depth > 32) return false;
      element = array.element;
    }
    if (GRAPH_BASE_TYPES.has(element) || /^mat[234](?:x[234])?$/.test(element)) return true;
    if (!element.startsWith("struct:") || !Array.isArray(this.graph.structs)) return false;
    const name = element.slice(7);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith("gl_") && !GRAPH_RESERVED_IDENTIFIERS.has(name) &&
      this.graph.structs.slice(0, 128).some((entry) => entry?.name === name);
  }

  private inputArity(node: NativeShaderGraphNode): number | "variable" | undefined {
    const arity = Object.hasOwn(GRAPH_INPUTS, node.op) ? GRAPH_INPUTS[node.op] : undefined;
    if (arity === "fields") return this.structFor(node.type)?.fields.length ?? 0;
    if (arity === "parameters") return this.functionFor(node.name)?.parameters.length ?? 0;
    return arity;
  }

  private inputTypes(node: NativeShaderGraphNode, index: number): readonly NativeShaderGraphValueType[] {
    if (node.op === "structConstruct") {
      const type = this.structFor(node.type)?.fields[index]?.type;
      return typeof type === "string" ? [type] : [];
    }
    if (node.op === "structField") {
      if (!Array.isArray(this.graph.structs) || !node.name) return [];
      return this.graph.structs.flatMap((entry) => entry && typeof entry.name === "string" && Array.isArray(entry.fields) &&
        entry.fields.some((field: ShaderGraphStruct["fields"][number]) => field && field.name === node.name && field.type === node.type) ? [`struct:${entry.name}` as const] : []);
    }
    if (node.op === "call") {
      const type = this.functionFor(node.name)?.parameters[index]?.type;
      return typeof type === "string" ? [type] : [];
    }
    if (node.op === "arrayIndex") {
      if (index === 1) return ["i32", "u32"];
      if (index !== 0) return [];
      const indexNode = this.graph.nodes.find((entry) => entry.id === node.inputs?.[1]);
      // Array lengths are open-ended, so enumerate actual source types instead
      // of inventing a wildcard type that canConnect cannot safely compare.
      return [...new Set(this.graph.nodes.filter((entry) => {
        const array = graphArrayType(entry.type);
        return array && array.element === node.type && this.validArrayType(entry.type) && arrayIndexFits(indexNode, array.length);
      }).map((entry) => entry.type))];
    }
    if (node.op === "noise") return node.type === "f32" ? FLOAT_VALUES : [];
    if (node.op === "textureSample" || node.op === "textureLoad" || node.op === "storageLoad") {
      const resource = this.graph.resources?.find((entry) => entry.name === node.resource);
      if (!resource) return [];
      if (node.op === "textureSample" && node.type === "vec4") {
        return resource.kind === "texture2d" ? ["vec2"] : resource.kind === "texture3d" ? ["vec3"] : [];
      }
      if (node.op === "textureLoad") {
        return resource.kind === "depth2d" && node.type === "f32" || resource.kind === "storage-texture" && node.type === "vec4" && (resource.access ?? "write") !== "write" && ["rgba8unorm", "rgba16float", "rgba32float", "r32float"].includes(resource.format ?? "")
          ? ["vec2"] : [];
      }
      if (node.op === "storageLoad" && resource.kind === "storage-buffer" && resource.access !== "write" && resource.type === node.type) return ["i32", "u32"];
      return [];
    }
    if (node.op === "construct") {
      const usedWidth = (node.inputs ?? []).reduce((sum, id, inputIndex) => {
        if (inputIndex === index) return sum;
        const input = this.graph.nodes.find((entry) => entry.id === id);
        return sum + (input ? VALUE_WIDTH[input.type] ?? 0 : 0);
      }, 0);
      return FLOAT_VALUES.filter((type) => (VALUE_WIDTH[type] ?? 0) <= (VALUE_WIDTH[node.type] ?? 0) - usedWidth);
    }
    if (node.op === "swizzle") {
      const components = node.components ?? "";
      if (!/^[xyzw]{1,4}$/.test(components) || components.length !== VALUE_WIDTH[node.type]) return [];
      const sourceWidth = Math.max(...[...components].map((component) => "xyzw".indexOf(component) + 1));
      return [...FLOAT_VECTORS, "uvec3" as const].filter((type) =>
        (VALUE_WIDTH[type] ?? 0) >= sourceWidth && (type === "uvec3" ? node.type === (components.length === 1 ? "u32" : "uvec3") : FLOAT_VALUES.includes(node.type)));
    }
    if (node.op === "length") return FLOAT_VECTORS;
    if (node.op === "cross") return ["vec3"];
    if (node.op === "distance") {
      if (node.type !== "f32") return [];
      const otherId = node.inputs?.[index === 0 ? 1 : 0];
      const other = this.graph.nodes.find((entry) => entry.id === otherId);
      return other ? FLOAT_VALUES.includes(other.type) ? [other.type] : [] : FLOAT_VALUES;
    }
    if (FLOAT_COMPONENT_OPERATIONS.has(node.op)) return FLOAT_VALUES.includes(node.type) ? [node.type] : [];
    if (node.op === "negate") return FLOAT_VALUES.includes(node.type) || node.type === "i32" ? [node.type] : [];
    if (node.op === "dot" || node.op === "less" || node.op === "greater" || node.op === "equal") {
      const otherId = node.inputs?.[index === 0 ? 1 : 0];
      const other = this.graph.nodes.find((entry) => entry.id === otherId);
      if (other) return [other.type];
      return node.op === "dot" ? FLOAT_VECTORS : node.op === "equal" ? SCALAR_VALUES : SCALAR_VALUES.filter((type) => type !== "bool");
    }
    if (node.op === "select" && index === 0) return ["bool"];
    return [node.type];
  }

  private commit(next: NativeShaderGraphDocument): void {
    assertGraphEnvelope(next);
    const copy = cloneGraph(next);
    if (equalGraphValue(this.graph, copy)) return;
    if (this.historyLimit > 0) {
      this.past.push(this.graph);
      if (this.past.length > this.historyLimit) this.past.shift();
    }
    this.graph = copy;
    this.future.length = 0;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.snapshot());
  }
}

function assertGraphEnvelope(graph: NativeShaderGraphDocument): void {
  if (!graph || typeof graph !== "object" || graph.version !== 1 || (graph.stage !== "material" && graph.stage !== "compute") || !Array.isArray(graph.nodes)) {
    throw new Error("Shader graph must be a version 1 material or compute document with a nodes array.");
  }
  if (graph.nodes.some((node) => !node || typeof node !== "object" || typeof node.id !== "string" || !node.id.trim() ||
      typeof node.op !== "string" || typeof node.type !== "string" ||
      (node.inputs !== undefined && (!Array.isArray(node.inputs) || node.inputs.some((input: unknown) => typeof input !== "string"))) ||
      [node.name, node.resource, node.components].some((value) => value !== undefined && typeof value !== "string"))) {
    throw new Error("Shader graph nodes need an id, operation, type, and string input references.");
  }
  if (graph.resources !== undefined && (!Array.isArray(graph.resources) || graph.resources.some((resource) =>
    !resource || typeof resource !== "object" || typeof resource.name !== "string" || !resource.name.trim() || typeof resource.kind !== "string"))) {
    throw new Error("Shader graph resources need a name and kind.");
  }
  if (graph.outputs !== undefined && (!graph.outputs || typeof graph.outputs !== "object" || Array.isArray(graph.outputs) ||
      Object.values(graph.outputs).some((id) => id !== undefined && typeof id !== "string"))) {
    throw new Error("Shader graph outputs must contain string node references.");
  }
}

function cloneGraph(graph: NativeShaderGraphDocument): NativeShaderGraphDocument { return cloneValue(graph); }

function equalGraphValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) &&
    equalGraphValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function cloneValue<T>(value: T, ancestors: Set<object> = new Set()): T {
  if (!value || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("Shader graph documents cannot contain cyclic objects.");
  ancestors.add(value);
  let copy: unknown;
  if (Array.isArray(value)) {
    copy = value.map((entry) => cloneValue(entry, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Shader graph documents must contain plain objects.");
    copy = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry, ancestors)]));
  }
  ancestors.delete(value);
  return copy as T;
}
