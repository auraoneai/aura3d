import {
  compileShaderGraph,
  ShaderGraphError,
  type ShaderGraphCompileResult,
  type ShaderGraphDiagnostic,
  type ShaderGraphDocument,
  type ShaderGraphResource,
  type ShaderGraphTarget
} from "@aura3d/rendering/shader-graph";

/** Supplies the graph currently attached to a material, not a cached fixture. */
export interface ShaderGraphInspectionSource {
  getShaderGraph(): ShaderGraphDocument | null;
}

export interface InspectedShaderDiagnostic {
  readonly code: string;
  readonly message: string;
  /** Index into the current graph's node array; no graph-owned identifier is exposed. */
  readonly nodeIndex: number | null;
}

export interface InspectedShaderBinding {
  readonly kind: ShaderGraphResource["kind"];
  readonly group: number;
  readonly binding: number;
  /** Compiler-declared sampler slot, if this resource uses one in its portable layout. */
  readonly samplerBinding: number | null;
  readonly type: NonNullable<ShaderGraphResource["type"]> | null;
  readonly access: NonNullable<ShaderGraphResource["access"]> | null;
  readonly format: NonNullable<ShaderGraphResource["format"]> | null;
}

export interface ShaderGraphInspection {
  readonly status: "empty" | "compiled" | "error";
  readonly target: ShaderGraphTarget;
  readonly stage: "material" | "compute" | null;
  readonly diagnostics: readonly InspectedShaderDiagnostic[];
  readonly bindings: readonly InspectedShaderBinding[];
  readonly outputs: readonly string[];
  /** Node expressions omit literal values and anonymize graph-defined identifiers. */
  readonly expressions: readonly { readonly nodeIndex: number; readonly expression: string }[];
  readonly shaderStages: readonly { readonly stage: "vertex" | "fragment" | "compute"; readonly lines: number }[];
  readonly requiresLighting: boolean | null;
}

/**
 * Compiles the live material graph on demand and returns an inspection-safe
 * summary. The compiler's key is canonical graph JSON and is intentionally
 * not returned. Raw shader sources, resource names, values, URLs and arbitrary
 * compiler exception text are also excluded; none is needed to inspect graph
 * structure, backend support or binding layout.
 */
export class ShaderGraphInspector {
  constructor(private readonly source: ShaderGraphInspectionSource) {}

  inspect(target: ShaderGraphTarget): ShaderGraphInspection {
    let graph: ShaderGraphDocument | null;
    try {
      graph = this.source.getShaderGraph();
    } catch {
      return emptyResult(target, "error", [{ code: "source-error", message: "Could not read the current material graph.", nodeIndex: null }]);
    }
    if (!graph) return emptyResult(target, "empty", []);
    try {
      return summarize(graph, compileShaderGraph(graph, target));
    } catch (error) {
      const diagnostics = error instanceof ShaderGraphError
        ? error.diagnostics.map((diagnostic) => safeDiagnostic(diagnostic, graph))
        : [{ code: "compile-error", message: "Graph compilation failed. Check the graph and target.", nodeIndex: null }];
      return { ...emptyResult(target, "error", diagnostics), stage: safeStage(graph.stage) };
    }
  }
}

function emptyResult(target: ShaderGraphTarget, status: "empty" | "error", diagnostics: readonly InspectedShaderDiagnostic[]): ShaderGraphInspection {
  return { status, target, stage: null, diagnostics, bindings: [], outputs: [], expressions: [], shaderStages: [], requiresLighting: null };
}

// Inspection is a privacy boundary, so metadata is explicitly allowlisted
// even though the current compiler also validates these fields.
const SAFE_TYPES = new Set<NonNullable<ShaderGraphResource["type"]>>(["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4", "uvec3"]);
const SAFE_ACCESS = new Set<NonNullable<ShaderGraphResource["access"]>>(["read", "write", "read_write"]);
const SAFE_FORMATS = new Set<NonNullable<ShaderGraphResource["format"]>>(["rgba8unorm", "rgba16float", "rgba32float", "r32float", "r32uint", "r32sint"]);

function safeMetadata<T extends string>(value: T | undefined, allowed: ReadonlySet<T>): T | null {
  return value !== undefined && allowed.has(value) ? value : null;
}

function summarize(graph: ShaderGraphDocument, result: ShaderGraphCompileResult): ShaderGraphInspection {
  const bindings = result.bindings.map((entry): InspectedShaderBinding => ({
    kind: entry.kind,
    group: entry.group,
    binding: entry.binding,
    samplerBinding: entry.samplerBinding ?? null,
    // Resource objects may contain irrelevant, graph-owned fields that the
    // compiler does not consume. Only report fields meaningful to the kind.
    type: entry.kind === "uniform" || entry.kind === "storage-buffer" ? safeMetadata(entry.type, SAFE_TYPES) : null,
    access: entry.kind === "storage-buffer" || entry.kind === "storage-texture" ? safeMetadata(entry.access, SAFE_ACCESS) : null,
    format: entry.kind === "storage-texture" ? safeMetadata(entry.format, SAFE_FORMATS) : null
  }));
  const shaderStages: { stage: "vertex" | "fragment" | "compute"; lines: number }[] = [];
  for (const stage of ["vertex", "fragment", "compute"] as const) {
    const source = result[stage];
    if (source !== undefined) shaderStages.push({ stage, lines: source.split("\n").length });
  }
  const expressions: { nodeIndex: number; expression: string }[] = [];
  const graphNames = new Set<string>();
  for (const node of graph.nodes) {
    graphNames.add(node.id);
    if (node.resource) graphNames.add(node.resource);
    if (node.op === "local" && node.name) graphNames.add(node.name);
  }
  for (const resource of graph.resources ?? []) graphNames.add(resource.name);
  graph.nodes.forEach((node, nodeIndex) => {
    const expression = result.nodeSources[node.id];
    if (expression !== undefined) expressions.push({ nodeIndex, expression: redactExpression(expression, graphNames) });
  });
  const outputNames = new Set(["color", "normal", "roughness", "metalness", "emissive", "opacity", "position"]);
  return {
    status: "compiled",
    target: result.target,
    stage: result.stage,
    diagnostics: [],
    bindings,
    outputs: Object.keys(graph.outputs ?? {}).filter((key) => outputNames.has(key)),
    expressions,
    shaderStages,
    requiresLighting: result.material?.requiresLighting ?? null
  };
}

const DIAGNOSTIC_MESSAGES: Readonly<Record<string, string>> = {
  "invalid-graph": "Graph must be an object.",
  "invalid-version": "Graph version is unsupported.",
  "graph-limit": "Graph exceeds a supported complexity limit.",
  "invalid-stage": "An operation is not available in this shader stage.",
  "invalid-target": "Shader target is unsupported.",
  "unsupported-backend": "This operation or resource is unavailable on the selected backend.",
  "invalid-nodes": "Graph nodes must be an array.",
  "invalid-node-id": "Each node needs a valid identifier.",
  "duplicate-node": "Node identifiers must be unique.",
  "invalid-type": "A node has an unsupported value type.",
  "unsupported-operation": "A node operation is unsupported.",
  "invalid-inputs": "Node inputs must be an array.",
  "invalid-arity": "Connect the required number of inputs for this operation.",
  "invalid-resources": "Graph resources must be an array.",
  "invalid-resource": "Check the resource kind, format, access and value type.",
  "duplicate-resource": "Resource names must be unique.",
  "invalid-binding": "Check the resource group and binding against the shader stage's layout.",
  "duplicate-binding": "Resources cannot occupy the same binding.",
  "cycle": "Graph contains a cycle; disconnect an edge.",
  "missing-node": "A connection or output references a missing node.",
  "type-mismatch": "Connected ports or output types do not match.",
  "invalid-outputs": "Graph outputs must be an object.",
  "invalid-output": "The selected output is not valid for this graph stage.",
  "invalid-workgroup-size": "Compute workgroup dimensions must be positive and within the supported limit.",
  "invalid-statement": "A compute statement is invalid.",
  "invalid-scope": "A loop index is used outside its scope.",
  "invalid-loop": "A compute loop has an invalid iteration count."
};

function safeDiagnostic(diagnostic: ShaderGraphDiagnostic, graph: ShaderGraphDocument): InspectedShaderDiagnostic {
  const known = Object.hasOwn(DIAGNOSTIC_MESSAGES, diagnostic.code);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const index = diagnostic.nodeId === undefined ? -1 : nodes.findIndex((node) => node?.id === diagnostic.nodeId);
  return {
    code: known ? diagnostic.code : "compile-error",
    message: known ? DIAGNOSTIC_MESSAGES[diagnostic.code]! : "Graph validation failed. Check the graph and selected target.",
    nodeIndex: index < 0 ? null : index
  };
}

function safeStage(stage: unknown): "material" | "compute" | null {
  return stage === "material" || stage === "compute" ? stage : null;
}

const SHADER_WORDS = new Set([
  "vec2", "vec3", "vec4", "f32", "i32", "u32", "float", "int", "uint", "bool",
  "sin", "cos", "abs", "normalize", "length", "min", "max", "pow", "dot", "cross", "mix", "clamp", "select",
  "texture", "textureSample", "textureSampleLevel", "textureLoad", "atomicLoad", "xy", "xyz", "xyzw", "x", "y", "z", "w", "rgb", "rgba", "r", "g", "b", "a"
]);

function redactExpression(expression: string, graphNames: ReadonlySet<string>): string {
  const aliases = new Map<string, string>();
  return expression.replace(/[A-Za-z_][A-Za-z0-9_]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fu]?/g, (token) => {
    if (/^(?:\d|\.)/.test(token) || token === "true" || token === "false") return "<value>";
    if (!graphNames.has(token) && SHADER_WORDS.has(token)) return token;
    if (!aliases.has(token)) aliases.set(token, `input${aliases.size + 1}`);
    return aliases.get(token)!;
  });
}
