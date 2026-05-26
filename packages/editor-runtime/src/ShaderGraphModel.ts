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
