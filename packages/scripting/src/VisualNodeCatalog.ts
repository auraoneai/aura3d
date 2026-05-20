import { type VisualNode, type VisualPort, type VisualPortType } from "./VisualNode";

export type VisualNodeCategory = "value" | "math" | "logic" | "flow" | "debug";

export interface VisualNodeDefinition {
  readonly kind: string;
  readonly category: VisualNodeCategory;
  readonly title: string;
  readonly description: string;
  readonly ports: readonly VisualPort[];
  readonly oldBranchSource: readonly string[];
}

const definitions: readonly VisualNodeDefinition[] = [
  define("const", "value", "Constant", "Constant value node.", [], [{ id: "out", direction: "output", type: "any" }], ["src/scripting/nodes/VariableNodes.ts"]),
  define("log", "debug", "Log", "Pass-through debug log value.", [{ id: "in", direction: "input", type: "any", optional: true }], [{ id: "out", direction: "output", type: "any" }], ["src/scripting/nodes/DebugNodes.ts"]),
  define("add", "math", "Add", "Add all connected numeric inputs.", [{ id: "in", direction: "input", type: "number", defaultValue: 0 }], [{ id: "out", direction: "output", type: "number" }], ["src/scripting/nodes/MathNodes.ts"]),
  define("subtract", "math", "Subtract", "Subtract b from a.", numericBinaryInputs(), numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("multiply", "math", "Multiply", "Multiply a by b.", numericBinaryInputs(1, 1), numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("divide", "math", "Divide", "Divide a by b with zero division rejection.", numericBinaryInputs(1, 1), numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("power", "math", "Power", "Raise base to exponent.", [{ id: "base", direction: "input", type: "number", defaultValue: 2 }, { id: "exponent", direction: "input", type: "number", defaultValue: 2 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("sqrt", "math", "Square Root", "Calculate square root with negative input rejection.", [{ id: "value", direction: "input", type: "number", defaultValue: 4 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("abs", "math", "Absolute", "Absolute numeric value.", numericUnaryInputs(), numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("sin", "math", "Sine", "Sine in radians.", [{ id: "angle", direction: "input", type: "number", defaultValue: 0 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("cos", "math", "Cosine", "Cosine in radians.", [{ id: "angle", direction: "input", type: "number", defaultValue: 0 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("tan", "math", "Tangent", "Tangent in radians.", [{ id: "angle", direction: "input", type: "number", defaultValue: 0 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("min", "math", "Minimum", "Minimum of two numbers.", numericBinaryInputs(), numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("max", "math", "Maximum", "Maximum of two numbers.", numericBinaryInputs(), numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("clamp", "math", "Clamp", "Clamp value between min and max.", [{ id: "value", direction: "input", type: "number", defaultValue: 0 }, { id: "min", direction: "input", type: "number", defaultValue: 0 }, { id: "max", direction: "input", type: "number", defaultValue: 1 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("lerp", "math", "Lerp", "Linear interpolation.", [{ id: "a", direction: "input", type: "number", defaultValue: 0 }, { id: "b", direction: "input", type: "number", defaultValue: 1 }, { id: "t", direction: "input", type: "number", defaultValue: 0.5 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("inverseLerp", "math", "Inverse Lerp", "Calculate interpolation factor for value between a and b.", [{ id: "a", direction: "input", type: "number", defaultValue: 0 }, { id: "b", direction: "input", type: "number", defaultValue: 1 }, { id: "value", direction: "input", type: "number", defaultValue: 0.5 }], numberOutput(), ["src/scripting/nodes/MathNodes.ts"]),
  define("and", "logic", "AND", "Boolean AND.", booleanBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("or", "logic", "OR", "Boolean OR.", booleanBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("not", "logic", "NOT", "Boolean NOT.", [{ id: "value", direction: "input", type: "boolean", defaultValue: false }], booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("xor", "logic", "XOR", "Boolean exclusive OR.", booleanBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("equal", "logic", "Equal", "Strict equality comparison.", anyBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("notEqual", "logic", "Not Equal", "Strict inequality comparison.", anyBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("greater", "logic", "Greater", "Numeric greater-than comparison.", numericBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("less", "logic", "Less", "Numeric less-than comparison.", numericBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("greaterEqual", "logic", "Greater Equal", "Numeric greater-or-equal comparison.", numericBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("lessEqual", "logic", "Less Equal", "Numeric less-or-equal comparison.", numericBinaryInputs(), booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("isNull", "logic", "Is Null", "Null or undefined check.", [{ id: "value", direction: "input", type: "any", optional: true }], booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("isValid", "logic", "Is Valid", "Non-null and non-undefined check.", [{ id: "value", direction: "input", type: "any", optional: true }], booleanOutput(), ["src/scripting/nodes/LogicNodes.ts"]),
  define("select", "logic", "Select", "Ternary select by condition.", [{ id: "condition", direction: "input", type: "boolean", defaultValue: false }, { id: "ifTrue", direction: "input", type: "any", optional: true }, { id: "ifFalse", direction: "input", type: "any", optional: true }], [{ id: "out", direction: "output", type: "any" }], ["src/scripting/nodes/LogicNodes.ts"]),
  define("branch", "flow", "Branch", "Choose true or false flow path from a boolean condition.", [{ id: "in", direction: "input", type: "flow", optional: true }, { id: "condition", direction: "input", type: "boolean", defaultValue: false }], [{ id: "true", direction: "output", type: "flow" }, { id: "false", direction: "output", type: "flow" }, { id: "selected", direction: "output", type: "string" }], ["src/scripting/nodes/FlowNodes.ts"]),
  define("switch", "flow", "Switch", "Choose a numbered case or default path.", [{ id: "in", direction: "input", type: "flow", optional: true }, { id: "value", direction: "input", type: "number", defaultValue: 0 }, { id: "caseCount", direction: "input", type: "number", defaultValue: 3 }], [{ id: "case0", direction: "output", type: "flow" }, { id: "case1", direction: "output", type: "flow" }, { id: "case2", direction: "output", type: "flow" }, { id: "default", direction: "output", type: "flow" }, { id: "selected", direction: "output", type: "string" }], ["src/scripting/nodes/FlowNodes.ts"]),
  define("sequence", "flow", "Sequence", "Publish a deterministic ordered flow-output list.", [{ id: "in", direction: "input", type: "flow", optional: true }, { id: "count", direction: "input", type: "number", defaultValue: 3 }], [{ id: "out0", direction: "output", type: "flow" }, { id: "out1", direction: "output", type: "flow" }, { id: "out2", direction: "output", type: "flow" }, { id: "outputs", direction: "output", type: "object" }], ["src/scripting/nodes/FlowNodes.ts"]),
  define("forRange", "flow", "For Range", "Summarize bounded integer loop iterations.", [{ id: "in", direction: "input", type: "flow", optional: true }, { id: "startIndex", direction: "input", type: "number", defaultValue: 0 }, { id: "endIndex", direction: "input", type: "number", defaultValue: 10 }], [{ id: "body", direction: "output", type: "flow" }, { id: "completed", direction: "output", type: "flow" }, { id: "index", direction: "output", type: "number" }, { id: "indices", direction: "output", type: "object" }], ["src/scripting/nodes/FlowNodes.ts"]),
  define("gate", "flow", "Gate", "Allow or block flow with an initial open/closed state.", [{ id: "in", direction: "input", type: "flow", optional: true }, { id: "startClosed", direction: "input", type: "boolean", defaultValue: false }], [{ id: "out", direction: "output", type: "flow" }, { id: "isOpen", direction: "output", type: "boolean" }], ["src/scripting/nodes/FlowNodes.ts"])
];

export function listVisualNodeDefinitions(): readonly VisualNodeDefinition[] {
  return definitions.map((definition) => ({
    ...definition,
    ports: definition.ports.map((port) => ({ ...port })),
    oldBranchSource: [...definition.oldBranchSource]
  }));
}

export function getVisualNodeDefinition(kind: string): VisualNodeDefinition | undefined {
  const definition = definitions.find((entry) => entry.kind === kind);
  return definition ? { ...definition, ports: definition.ports.map((port) => ({ ...port })), oldBranchSource: [...definition.oldBranchSource] } : undefined;
}

export function createVisualNode(kind: string, id: string, data?: Readonly<Record<string, unknown>>): VisualNode {
  const definition = getVisualNodeDefinition(kind);
  if (!definition) throw new Error(`Unknown visual node kind: ${kind}`);
  return {
    id,
    kind,
    ports: definition.ports.map((port) => ({ ...port })),
    ...(data ? { data: { ...data } } : {})
  };
}

function define(
  kind: string,
  category: VisualNodeCategory,
  title: string,
  description: string,
  inputs: readonly VisualPort[],
  outputs: readonly VisualPort[],
  oldBranchSource: readonly string[]
): VisualNodeDefinition {
  return { kind, category, title, description, ports: [...inputs, ...outputs], oldBranchSource };
}

function numericUnaryInputs(defaultValue = 0): readonly VisualPort[] {
  return [{ id: "value", direction: "input", type: "number", defaultValue }];
}

function numericBinaryInputs(a = 0, b = 0): readonly VisualPort[] {
  return [{ id: "a", direction: "input", type: "number", defaultValue: a }, { id: "b", direction: "input", type: "number", defaultValue: b }];
}

function booleanBinaryInputs(): readonly VisualPort[] {
  return [{ id: "a", direction: "input", type: "boolean", defaultValue: false }, { id: "b", direction: "input", type: "boolean", defaultValue: false }];
}

function anyBinaryInputs(): readonly VisualPort[] {
  return [{ id: "a", direction: "input", type: "any", optional: true }, { id: "b", direction: "input", type: "any", optional: true }];
}

function numberOutput(): readonly VisualPort[] {
  return [{ id: "out", direction: "output", type: "number" }];
}

function booleanOutput(): readonly VisualPort[] {
  return [{ id: "out", direction: "output", type: "boolean" }];
}
