import { validateGraph, type VisualEdge, type VisualGraph } from "./VisualGraph";
import { getVisualNodeDefinition } from "./VisualNodeCatalog";
import { type VisualNode } from "./VisualNode";

const visualNodeOutputsBrand: unique symbol = Symbol("VisualNodeOutputs");

export interface VisualExecutionResult {
  readonly values: ReadonlyMap<string, unknown>;
  readonly executionOrder: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly blockedClaims: readonly string[];
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

      setNodeOutput(values, node, executeVisualNode(node, graph.edges.filter((edge) => edge.toNode === node.id), values));

      visiting.delete(nodeId);
      visited.add(nodeId);
      executionOrder.push(nodeId);
    };

    for (const node of graph.nodes) {
      executeNode(node.id);
    }

    return {
      values,
      executionOrder,
      nodeKinds: [...new Set(graph.nodes.map((node) => node.kind))].sort(),
      blockedClaims: [
        "Unity Visual Scripting parity",
        "Unreal Blueprint parity",
        "async latent action graph parity",
        "editor-authored visual scripting parity"
      ]
    };
  }
}

function executeVisualNode(node: VisualNode, inputEdges: readonly VisualEdge[], values: Map<string, unknown>): unknown {
  const definition = getVisualNodeDefinition(node.kind);
  if (!definition) throw new Error(`Unsupported visual node kind: ${node.kind}`);
  const input = (port: string): unknown => getInputValue(node, port, inputEdges, values);
  const number = (port: string): number => Number(input(port) ?? 0);
  const boolean = (port: string): boolean => Boolean(input(port));
  switch (node.kind) {
    case "const":
      return node.data?.value;
    case "log":
      return input("in");
    case "add":
      return inputEdges.length > 1
        ? inputEdges.reduce((total, edge) => total + Number(readEdgeValue(edge, values) ?? 0), 0)
        : number("in");
    case "subtract":
      return number("a") - number("b");
    case "multiply":
      return number("a") * number("b");
    case "divide": {
      const divisor = number("b");
      if (divisor === 0) throw new Error(`Visual node ${node.id} divide by zero.`);
      return number("a") / divisor;
    }
    case "power":
      return Math.pow(number("base"), number("exponent"));
    case "sqrt": {
      const value = number("value");
      if (value < 0) throw new Error(`Visual node ${node.id} cannot calculate square root of a negative number.`);
      return Math.sqrt(value);
    }
    case "abs":
      return Math.abs(number("value"));
    case "sin":
      return Math.sin(number("angle"));
    case "cos":
      return Math.cos(number("angle"));
    case "tan":
      return Math.tan(number("angle"));
    case "min":
      return Math.min(number("a"), number("b"));
    case "max":
      return Math.max(number("a"), number("b"));
    case "clamp":
      return Math.max(number("min"), Math.min(number("max"), number("value")));
    case "lerp":
      return number("a") + (number("b") - number("a")) * number("t");
    case "inverseLerp": {
      const a = number("a");
      const b = number("b");
      if (a === b) throw new Error(`Visual node ${node.id} inverseLerp requires different a and b values.`);
      return (number("value") - a) / (b - a);
    }
    case "and":
      return boolean("a") && boolean("b");
    case "or":
      return boolean("a") || boolean("b");
    case "not":
      return !boolean("value");
    case "xor":
      return boolean("a") !== boolean("b");
    case "equal":
      return input("a") === input("b");
    case "notEqual":
      return input("a") !== input("b");
    case "greater":
      return number("a") > number("b");
    case "less":
      return number("a") < number("b");
    case "greaterEqual":
      return number("a") >= number("b");
    case "lessEqual":
      return number("a") <= number("b");
    case "isNull": {
      const value = input("value");
      return value === null || value === undefined;
    }
    case "isValid": {
      const value = input("value");
      return value !== null && value !== undefined;
    }
    case "select":
      return boolean("condition") ? input("ifTrue") : input("ifFalse");
    case "branch": {
      const selected = boolean("condition") ? "true" : "false";
      return outputs(selected, {
        true: selected === "true",
        false: selected === "false",
        selected
      });
    }
    case "switch": {
      const caseCount = Math.max(1, Math.min(3, Math.floor(number("caseCount"))));
      const selectedIndex = Math.floor(number("value"));
      const selected = selectedIndex >= 0 && selectedIndex < caseCount ? `case${selectedIndex}` : "default";
      return outputs(selected, {
        case0: selected === "case0",
        case1: selected === "case1",
        case2: selected === "case2",
        default: selected === "default",
        selected
      });
    }
    case "sequence": {
      const count = Math.max(1, Math.min(3, Math.floor(number("count"))));
      const orderedOutputs = Array.from({ length: count }, (_, index) => `out${index}`);
      return outputs(orderedOutputs, {
        out0: count > 0,
        out1: count > 1,
        out2: count > 2,
        outputs: orderedOutputs
      });
    }
    case "forRange": {
      const startIndex = Math.floor(number("startIndex"));
      const endIndex = Math.floor(number("endIndex"));
      const iterations = Math.max(0, Math.min(256, endIndex - startIndex));
      const indices = Array.from({ length: iterations }, (_, index) => startIndex + index);
      return outputs(indices, {
        body: iterations > 0,
        completed: true,
        index: indices[0] ?? startIndex,
        indices
      });
    }
    case "gate": {
      const isOpen = !boolean("startClosed");
      return outputs(isOpen ? "out" : undefined, {
        out: isOpen,
        isOpen
      });
    }
  }
}

function getInputValue(node: VisualNode, portId: string, inputEdges: readonly VisualEdge[], values: Map<string, unknown>): unknown {
  const edge = inputEdges.find((candidate) => candidate.toPort === portId);
  if (edge) return readEdgeValue(edge, values);
  const dataValue = node.data?.[portId];
  if (dataValue !== undefined) return dataValue;
  return node.ports.find((port) => port.id === portId)?.defaultValue;
}

function readEdgeValue(edge: VisualEdge, values: Map<string, unknown>): unknown {
  return values.get(`${edge.fromNode}.${edge.fromPort}`) ?? values.get(edge.fromNode);
}

function setNodeOutput(values: Map<string, unknown>, node: VisualNode, value: unknown): void {
  const resolved = isOutputMap(value) ? value : outputs(value);
  values.set(node.id, resolved.value);
  for (const port of node.ports.filter((entry) => entry.direction === "output")) {
    values.set(`${node.id}.${port.id}`, resolved.byPort?.[port.id] ?? resolved.value);
  }
}

function outputs(value: unknown, byPort?: Readonly<Record<string, unknown>>): VisualNodeOutputs {
  return { [visualNodeOutputsBrand]: true, value, byPort };
}

function isOutputMap(value: unknown): value is VisualNodeOutputs {
  return typeof value === "object" && value !== null && (value as VisualNodeOutputs)[visualNodeOutputsBrand] === true;
}

interface VisualNodeOutputs {
  readonly [visualNodeOutputsBrand]: true;
  readonly value: unknown;
  readonly byPort?: Readonly<Record<string, unknown>>;
}
