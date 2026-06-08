import { type VisualNode, type VisualPort } from "./VisualNode";
import { animationVisualNodeDefinitions } from "./AnimationVisualNodes";

export type VisualNodeCategory =
  | "value"
  | "math"
  | "logic"
  | "flow"
  | "debug"
  | "runtime"
  | "input"
  | "animation"
  | "physics"
  | "combat"
  | "scene"
  | "dialogue"
  | "audio"
  | "timing"
  | "publishing"
  | "camera"
  | "evidence";

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
  define("gate", "flow", "Gate", "Allow or block flow with an initial open/closed state.", [{ id: "in", direction: "input", type: "flow", optional: true }, { id: "startClosed", direction: "input", type: "boolean", defaultValue: false }], [{ id: "out", direction: "output", type: "flow" }, { id: "isOpen", direction: "output", type: "boolean" }], ["src/scripting/nodes/FlowNodes.ts"]),

  define("onStart", "runtime", "On Start", "Emit flow when the deterministic frame context is at start.", [], [{ id: "out", direction: "output", type: "flow" }, { id: "active", direction: "output", type: "boolean" }], ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("onFrame", "runtime", "On Frame", "Emit deterministic frame timing from app.onFrame or app.step context.", [], [{ id: "out", direction: "output", type: "flow" }, { id: "dt", direction: "output", type: "number" }, { id: "time", direction: "output", type: "number" }, { id: "frame", direction: "output", type: "number" }, { id: "context", direction: "output", type: "object" }], ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("getNode", "runtime", "Get Runtime Node", "Read a runtime node snapshot by id.", [stringInput("nodeId")], [{ id: "node", direction: "output", type: "object" }, { id: "nodeId", direction: "output", type: "string" }, { id: "exists", direction: "output", type: "boolean" }, { id: "position", direction: "output", type: "object" }], ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("setPosition", "runtime", "Set Position", "Create a deterministic runtime node position command.", [flowInput(), stringInput("nodeId"), objectInput("position")], commandOutputs(), ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("translate", "runtime", "Translate", "Create a deterministic runtime node translation command.", [flowInput(), stringInput("nodeId"), objectInput("delta")], commandOutputs(), ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("rotate", "runtime", "Rotate", "Create a deterministic runtime node rotation command.", [flowInput(), stringInput("nodeId"), objectInput("rotation")], commandOutputs(), ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("setVisible", "runtime", "Set Visible", "Create a deterministic runtime node visibility command.", [flowInput(), stringInput("nodeId"), booleanInput("visible", true)], commandOutputs(), ["src/scripting/nodes/RuntimeNodes.ts"]),
  define("setMaterial", "runtime", "Set Material", "Create a deterministic runtime node material override command.", [flowInput(), stringInput("nodeId"), objectInput("material")], commandOutputs(), ["src/scripting/nodes/RuntimeNodes.ts"]),

  define("pressed", "input", "Pressed", "Read a deterministic pressed input action snapshot.", [stringInput("action")], booleanOutput(), ["src/scripting/nodes/InputNodes.ts"]),
  define("held", "input", "Held", "Read a deterministic held input action snapshot.", [stringInput("action")], booleanOutput(), ["src/scripting/nodes/InputNodes.ts"]),
  define("released", "input", "Released", "Read a deterministic released input action snapshot.", [stringInput("action")], booleanOutput(), ["src/scripting/nodes/InputNodes.ts"]),
  define("axis", "input", "Axis", "Read a deterministic input axis snapshot.", [stringInput("axis")], numberOutput(), ["src/scripting/nodes/InputNodes.ts"]),
  define("buffered", "input", "Buffered", "Read a deterministic buffered input action snapshot.", [stringInput("action")], booleanOutput(), ["src/scripting/nodes/InputNodes.ts"]),
  define("combo", "input", "Combo", "Read a deterministic combo match snapshot.", [stringInput("combo")], booleanOutput(), ["src/scripting/nodes/InputNodes.ts"]),

  define("playClip", "animation", "Play Clip", "Create an animation play command for a named clip.", [flowInput(), stringInput("controllerId"), stringInput("clip"), booleanInput("loop", true)], commandOutputs(), ["src/scripting/nodes/AnimationNodes.ts"]),
  define("restartClip", "animation", "Restart Clip", "Create an animation restart command for a named clip.", [flowInput(), stringInput("controllerId"), stringInput("clip")], commandOutputs(), ["src/scripting/nodes/AnimationNodes.ts"]),
  define("crossFade", "animation", "Cross Fade", "Create an animation crossfade command for a named clip.", [flowInput(), stringInput("controllerId"), stringInput("clip"), numberInput("duration", 0.12), booleanInput("restart", false), stringInput("layer", true)], commandOutputs(), ["src/scripting/nodes/AnimationNodes.ts"]),
  define("setLayerWeight", "animation", "Set Layer Weight", "Create an animation layer weight command.", [flowInput(), stringInput("controllerId"), stringInput("layer"), numberInput("weight", 1)], commandOutputs(), ["src/scripting/nodes/AnimationNodes.ts"]),
  define("onAnimationEvent", "animation", "On Animation Event", "Read a deterministic animation event emitted from clip-local time.", [stringInput("controllerId"), stringInput("eventType"), stringInput("clip", true)], [{ id: "out", direction: "output", type: "flow" }, { id: "fired", direction: "output", type: "boolean" }, { id: "event", direction: "output", type: "object" }], ["src/scripting/nodes/AnimationNodes.ts"]),
  define("setMorphTarget", "animation", "Set Morph Target", "Create a morph target weight command.", [flowInput(), stringInput("controllerId"), stringInput("morphTarget"), numberInput("weight", 0)], commandOutputs(), ["src/scripting/nodes/AnimationNodes.ts"]),
  define("setMorphTargets", "animation", "Set Morph Targets", "Create a batch morph target weight command.", [flowInput(), stringInput("controllerId"), objectInput("weights")], commandOutputs(), ["src/scripting/nodes/AnimationNodes.ts"]),
  define("getClipTime", "animation", "Get Clip Time", "Read deterministic animation clip time from a controller snapshot.", [stringInput("controllerId")], [{ id: "out", direction: "output", type: "number" }, { id: "clip", direction: "output", type: "string" }], ["src/scripting/nodes/AnimationNodes.ts"]),

  define("setVelocity", "physics", "Set Velocity", "Create a kinematic body velocity command.", [flowInput(), stringInput("bodyId"), objectInput("velocity")], commandOutputs(), ["src/scripting/nodes/PhysicsNodes.ts"]),
  define("jump", "physics", "Jump", "Create a kinematic jump command.", [flowInput(), stringInput("bodyId"), numberInput("impulse", 1)], commandOutputs(), ["src/scripting/nodes/PhysicsNodes.ts"]),
  define("dash", "physics", "Dash", "Create a kinematic dash command.", [flowInput(), stringInput("bodyId"), objectInput("direction"), numberInput("speed", 1)], commandOutputs(), ["src/scripting/nodes/PhysicsNodes.ts"]),
  define("onCollisionEnter", "physics", "On Collision Enter", "Read a deterministic collision-enter event snapshot.", [stringInput("bodyId"), stringInput("otherBodyId", true)], [{ id: "out", direction: "output", type: "flow" }, { id: "collided", direction: "output", type: "boolean" }, { id: "event", direction: "output", type: "object" }], ["src/scripting/nodes/PhysicsNodes.ts"]),
  define("onCollisionExit", "physics", "On Collision Exit", "Read a deterministic collision-exit event snapshot.", [stringInput("bodyId"), stringInput("otherBodyId", true)], [{ id: "out", direction: "output", type: "flow" }, { id: "collided", direction: "output", type: "boolean" }, { id: "event", direction: "output", type: "object" }], ["src/scripting/nodes/PhysicsNodes.ts"]),
  define("raycast", "physics", "Raycast", "Read a deterministic raycast result by query id.", [stringInput("queryId")], [{ id: "hit", direction: "output", type: "boolean" }, { id: "result", direction: "output", type: "object" }], ["src/scripting/nodes/PhysicsNodes.ts"]),
  define("overlap", "physics", "Overlap", "Read a deterministic overlap result by query id.", [stringInput("queryId")], [{ id: "hit", direction: "output", type: "boolean" }, { id: "result", direction: "output", type: "object" }], ["src/scripting/nodes/PhysicsNodes.ts"]),

  define("openHitbox", "combat", "Open Hitbox", "Create a combat hitbox-open command.", [flowInput(), stringInput("hitboxId"), stringInput("ownerId"), numberInput("damage", 0), objectInput("payload", true)], commandOutputs(), ["src/scripting/nodes/CombatNodes.ts"]),
  define("closeHitbox", "combat", "Close Hitbox", "Create a combat hitbox-close command.", [flowInput(), stringInput("hitboxId")], commandOutputs(), ["src/scripting/nodes/CombatNodes.ts"]),
  define("setHurtbox", "combat", "Set Hurtbox", "Create a combat hurtbox command.", [flowInput(), stringInput("hurtboxId"), stringInput("ownerId"), objectInput("payload", true)], commandOutputs(), ["src/scripting/nodes/CombatNodes.ts"]),
  define("onHit", "combat", "On Hit", "Read a deterministic combat hit event snapshot.", [stringInput("actorId", true), stringInput("hitboxId", true)], [{ id: "out", direction: "output", type: "flow" }, { id: "hit", direction: "output", type: "boolean" }, { id: "event", direction: "output", type: "object" }], ["src/scripting/nodes/CombatNodes.ts"]),
  define("applyDamage", "combat", "Apply Damage", "Create a deterministic damage command.", [flowInput(), stringInput("targetId"), numberInput("amount", 0), stringInput("sourceId", true)], commandOutputs(), ["src/scripting/nodes/CombatNodes.ts"]),
  define("applyKnockback", "combat", "Apply Knockback", "Create a deterministic knockback command.", [flowInput(), stringInput("targetId"), objectInput("velocity"), stringInput("sourceId", true)], commandOutputs(), ["src/scripting/nodes/CombatNodes.ts"]),

  define("follow", "camera", "Follow", "Create a camera follow command.", [flowInput(), stringInput("targetId"), numberInput("stiffness", 1)], commandOutputs(), ["src/scripting/nodes/CameraNodes.ts"]),
  define("frameTargets", "camera", "Frame Targets", "Create a camera framing command for a deterministic target list.", [flowInput(), objectInput("targetIds"), numberInput("padding", 0)], commandOutputs(), ["src/scripting/nodes/CameraNodes.ts"]),
  define("shake", "camera", "Shake", "Create a deterministic camera shake command.", [flowInput(), numberInput("intensity", 0.2), numberInput("duration", 0.12)], commandOutputs(), ["src/scripting/nodes/CameraNodes.ts"]),
  define("cutTo", "camera", "Cut To", "Create a camera cut command.", [flowInput(), objectInput("position"), objectInput("target", true)], commandOutputs(), ["src/scripting/nodes/CameraNodes.ts"]),

  define("captureSnapshot", "evidence", "Capture Snapshot", "Create an evidence snapshot command from deterministic graph context.", [flowInput(), stringInput("label", true)], [{ id: "out", direction: "output", type: "flow" }, { id: "snapshot", direction: "output", type: "object" }], ["src/scripting/nodes/EvidenceNodes.ts"]),
  define("markProof", "evidence", "Mark Proof", "Create a deterministic proof marker command.", [flowInput(), stringInput("proofId"), objectInput("details", true)], commandOutputs(), ["src/scripting/nodes/EvidenceNodes.ts"]),
  define("assertState", "evidence", "Assert State", "Compare actual and expected values for deterministic evidence.", [{ id: "actual", direction: "input", type: "any", optional: true }, { id: "expected", direction: "input", type: "any", optional: true }, stringInput("operator", true)], [{ id: "out", direction: "output", type: "flow" }, { id: "passed", direction: "output", type: "boolean" }, { id: "assertion", direction: "output", type: "object" }], ["src/scripting/nodes/EvidenceNodes.ts"]),
  ...animationVisualNodeDefinitions
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

function flowInput(): VisualPort {
  return { id: "in", direction: "input", type: "flow", optional: true };
}

function stringInput(id: string, optional = false): VisualPort {
  return { id, direction: "input", type: "string", ...(optional ? { optional: true } : {}) };
}

function numberInput(id: string, defaultValue: number): VisualPort {
  return { id, direction: "input", type: "number", defaultValue };
}

function booleanInput(id: string, defaultValue: boolean): VisualPort {
  return { id, direction: "input", type: "boolean", defaultValue };
}

function objectInput(id: string, optional = false): VisualPort {
  return { id, direction: "input", type: "object", ...(optional ? { optional: true } : {}) };
}

function commandOutputs(): readonly VisualPort[] {
  return [{ id: "out", direction: "output", type: "flow" }, { id: "command", direction: "output", type: "object" }];
}
