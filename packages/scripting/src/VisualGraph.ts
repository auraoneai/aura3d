import { validateNode, type VisualNode } from "./VisualNode";

export interface VisualEdge {
  readonly fromNode: string;
  readonly fromPort: string;
  readonly toNode: string;
  readonly toPort: string;
}

export interface VisualGraph {
  readonly nodes: readonly VisualNode[];
  readonly edges: readonly VisualEdge[];
}

export type SerializedVisualGraph = {
  readonly nodes: readonly VisualNode[];
  readonly edges: readonly VisualEdge[];
};

export function validateGraph(graph: VisualGraph): readonly string[] {
  const errors: string[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const seenNodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (seenNodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    seenNodeIds.add(node.id);
    errors.push(...validateNode(node));
  }

  for (const edge of graph.edges) {
    const from = nodes.get(edge.fromNode);
    const to = nodes.get(edge.toNode);
    if (!from) {
      errors.push(`Missing edge source node: ${edge.fromNode}`);
      continue;
    }
    if (!to) {
      errors.push(`Missing edge target node: ${edge.toNode}`);
      continue;
    }

    const fromPort = from.ports.find((port) => port.id === edge.fromPort);
    const toPort = to.ports.find((port) => port.id === edge.toPort);
    if (!fromPort || fromPort.direction !== "output") {
      errors.push(`Invalid source port: ${edge.fromNode}.${edge.fromPort}`);
    }
    if (!toPort || toPort.direction !== "input") {
      errors.push(`Invalid target port: ${edge.toNode}.${edge.toPort}`);
    }
    if (fromPort && toPort && fromPort.type !== toPort.type && fromPort.type !== "any" && toPort.type !== "any") {
      errors.push(`Port type mismatch: ${edge.fromNode}.${edge.fromPort} -> ${edge.toNode}.${edge.toPort}`);
    }
  }

  return errors;
}

export function serializeGraph(graph: VisualGraph): SerializedVisualGraph {
  const errors = validateGraph(graph);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      ports: node.ports.map((port) => ({ ...port })),
      data: cloneData(node.data)
    })),
    edges: graph.edges.map((edge) => ({ ...edge }))
  };
}

export function deserializeGraph(serialized: SerializedVisualGraph): VisualGraph {
  const graph: VisualGraph = {
    nodes: serialized.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      ports: node.ports.map((port) => ({ ...port })),
      data: cloneData(node.data)
    })),
    edges: serialized.edges.map((edge) => ({ ...edge }))
  };
  const errors = validateGraph(graph);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return graph;
}

function cloneData(data: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (data === undefined) return undefined;
  return JSON.parse(JSON.stringify(data)) as Readonly<Record<string, unknown>>;
}
