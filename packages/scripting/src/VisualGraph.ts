import { validateNode, type VisualNode } from "./VisualNode";
import { getVisualNodeDefinition } from "./VisualNodeCatalog";
import {
  type VisualGraphExecutionContext,
  type VisualGraphValidationOptions,
  type VisualStateCollection
} from "./VisualGraphContext";

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

export function validateGraph(graph: VisualGraph, options: VisualGraphValidationOptions = {}): readonly string[] {
  const errors: string[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const seenNodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (seenNodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    seenNodeIds.add(node.id);
    errors.push(...validateNode(node));
    const definition = getVisualNodeDefinition(node.kind);
    if (!definition) {
      errors.push(`Unknown visual node kind: ${node.kind}`);
    } else {
      for (const port of definition.ports.filter((entry) => entry.direction === "input")) {
        if (!port.optional && port.defaultValue === undefined && !hasInputOrLiteral(graph, node, port.id)) {
          errors.push(`Missing required input on node ${node.id}: ${port.id}`);
        }
      }
    }
    errors.push(...validateContextReferences(graph, node, options.context, options.strictReferences === true));
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

  if (options.allowCycles !== true) {
    errors.push(...validateAcyclic(graph));
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

function hasInputOrLiteral(graph: VisualGraph, node: VisualNode, portId: string): boolean {
  if (node.data && node.data[portId] !== undefined) return true;
  return graph.edges.some((edge) => edge.toNode === node.id && edge.toPort === portId);
}

function validateAcyclic(graph: VisualGraph): readonly string[] {
  const errors: string[] = [];
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (adjacency.has(edge.fromNode)) {
      adjacency.get(edge.fromNode)?.push(edge.toNode);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string, path: readonly string[]): void => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      errors.push(`Visual graph cycle detected: ${[...path, nodeId].join(" -> ")}`);
      return;
    }
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      visit(next, [...path, nodeId]);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of graph.nodes) {
    visit(node.id, []);
  }

  return errors;
}

function validateContextReferences(
  graph: VisualGraph,
  node: VisualNode,
  context: VisualGraphExecutionContext | undefined,
  strictReferences: boolean
): readonly string[] {
  const errors: string[] = [];
  const nodeId = literalString(node, "nodeId");
  const controllerId = literalString(node, "controllerId");
  const bodyId = literalString(node, "bodyId");

  if (runtimeNodeKinds.has(node.kind)) {
    if (strictReferences && !hasInputOrLiteral(graph, node, "nodeId")) {
      errors.push(`Missing runtime node id on node ${node.id}`);
    }
    if (nodeId && context?.runtimeNodes && !collectionHas(context.runtimeNodes, nodeId)) {
      errors.push(`Unknown runtime node id on node ${node.id}: ${nodeId}`);
    }
  }

  if (animationNodeKinds.has(node.kind)) {
    if (strictReferences && !hasInputOrLiteral(graph, node, "controllerId")) {
      errors.push(`Missing animation controller id on node ${node.id}`);
    }
    const controller = controllerId && context?.animationControllers ? collectionGet(context.animationControllers, controllerId) : undefined;
    if (controllerId && context?.animationControllers && !controller) {
      errors.push(`Unknown animation controller id on node ${node.id}: ${controllerId}`);
    }
    const clip = literalString(node, "clip");
    if (controller && clip && controller.clips && !controller.clips.includes(clip)) {
      errors.push(`Unknown animation clip on node ${node.id}: ${clip}`);
    }
    const morphTarget = literalString(node, "morphTarget");
    if (controller && morphTarget && controller.morphTargets && !controller.morphTargets.includes(morphTarget)) {
      errors.push(`Unknown morph target on node ${node.id}: ${morphTarget}`);
    }
  }

  if (physicsNodeKinds.has(node.kind)) {
    if (strictReferences && physicsBodyRequiredKinds.has(node.kind) && !hasInputOrLiteral(graph, node, "bodyId")) {
      errors.push(`Missing physics body id on node ${node.id}`);
    }
    if (bodyId && context?.physicsBodies && !collectionHas(context.physicsBodies, bodyId)) {
      errors.push(`Unknown physics body id on node ${node.id}: ${bodyId}`);
    }
  }

  return errors;
}

function literalString(node: VisualNode, key: string): string | undefined {
  const value = node.data?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function collectionHas<T extends { readonly id: string }>(collection: VisualStateCollection<T>, id: string): boolean {
  return collectionGet(collection, id) !== undefined;
}

function collectionGet<T extends { readonly id: string }>(collection: VisualStateCollection<T>, id: string): T | undefined {
  return Array.isArray(collection) ? collection.find((entry) => entry.id === id) : (collection as Readonly<Record<string, T>>)[id];
}

const runtimeNodeKinds = new Set(["getNode", "setPosition", "translate", "rotate", "setVisible", "setMaterial"]);
const animationNodeKinds = new Set([
  "playClip",
  "restartClip",
  "crossFade",
  "setLayerWeight",
  "onAnimationEvent",
  "setMorphTarget",
  "setMorphTargets",
  "getClipTime"
]);
const physicsNodeKinds = new Set(["setVelocity", "jump", "dash", "onCollisionEnter", "onCollisionExit", "raycast", "overlap"]);
const physicsBodyRequiredKinds = new Set(["setVelocity", "jump", "dash", "onCollisionEnter", "onCollisionExit"]);
