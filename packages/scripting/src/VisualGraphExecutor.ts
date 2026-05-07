import { validateGraph, type VisualGraph } from "./VisualGraph";

export interface VisualExecutionResult {
  readonly values: ReadonlyMap<string, unknown>;
  readonly executionOrder: readonly string[];
}

export class VisualGraphExecutor {
  execute(graph: VisualGraph): VisualExecutionResult {
    const errors = validateGraph(graph);
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const values = new Map<string, unknown>();
    const executionOrder: string[] = [];
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const executeNode = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error(`Visual graph cycle detected at node: ${nodeId}`);
      }
      const node = nodes.get(nodeId);
      if (!node) {
        throw new Error(`Missing visual node: ${nodeId}`);
      }
      visiting.add(nodeId);
      for (const edge of graph.edges.filter((candidate) => candidate.toNode === node.id)) {
        executeNode(edge.fromNode);
      }

      if (node.kind === "const") {
        values.set(node.id, node.data?.value);
      } else if (node.kind === "add") {
        const inputs = graph.edges.filter((edge) => edge.toNode === node.id);
        const sum = inputs.reduce((total, edge) => total + Number(values.get(edge.fromNode) ?? 0), 0);
        values.set(node.id, sum);
      } else if (node.kind === "log") {
        const input = graph.edges.find((edge) => edge.toNode === node.id);
        values.set(node.id, input ? values.get(input.fromNode) : undefined);
      } else {
        throw new Error(`Unsupported visual node kind: ${node.kind}`);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      executionOrder.push(nodeId);
    };

    for (const node of graph.nodes) {
      executeNode(node.id);
    }

    return { values, executionOrder };
  }
}
