import { validateGraph, type VisualEdge, type VisualGraph } from "./VisualGraph";
import {
  type VisualAnimationControllerState,
  type VisualAnimationEvent,
  type VisualCollisionEvent,
  type VisualCombatEvent,
  type VisualGraphDiagnostic,
  type VisualGraphExecutionContext,
  type VisualGraphSideEffect,
  type VisualInputSet,
  type VisualStateCollection,
  type VisualVector3
} from "./VisualGraphContext";
import { getVisualNodeDefinition } from "./VisualNodeCatalog";
import { type VisualNode } from "./VisualNode";

const visualNodeOutputsBrand: unique symbol = Symbol("VisualNodeOutputs");

export interface VisualExecutionResult {
  readonly values: ReadonlyMap<string, unknown>;
  readonly executionOrder: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly sideEffects: readonly VisualGraphSideEffect[];
  readonly diagnostics: readonly VisualGraphDiagnostic[];
  readonly blockedClaims: readonly string[];
}

export class VisualGraphExecutor {
  private readonly defaultContext: VisualGraphExecutionContext;

  constructor(context: VisualGraphExecutionContext = {}) {
    this.defaultContext = context;
  }

  execute(graph: VisualGraph, context: VisualGraphExecutionContext = this.defaultContext): VisualExecutionResult {
    const errors = validateGraph(graph, { context });
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const values = new Map<string, unknown>();
    const executionOrder: string[] = [];
    const sideEffects: VisualGraphSideEffect[] = [];
    const diagnostics: VisualGraphDiagnostic[] = [];
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

      setNodeOutput(values, node, executeVisualNode(node, graph.edges.filter((edge) => edge.toNode === node.id), values, context, sideEffects, diagnostics));

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
      sideEffects,
      diagnostics,
      blockedClaims: [
        "Unity Visual Scripting parity",
        "Unreal Blueprint parity",
        "async latent action graph parity",
        "editor-authored visual scripting parity",
        "live engine installGraph bridge parity"
      ]
    };
  }
}

function executeVisualNode(
  node: VisualNode,
  inputEdges: readonly VisualEdge[],
  values: Map<string, unknown>,
  context: VisualGraphExecutionContext,
  sideEffects: VisualGraphSideEffect[],
  diagnostics: VisualGraphDiagnostic[]
): unknown {
  const definition = getVisualNodeDefinition(node.kind);
  if (!definition) throw new Error(`Unsupported visual node kind: ${node.kind}`);
  const input = (port: string): unknown => getInputValue(node, port, inputEdges, values);
  const number = (port: string): number => finiteNumber(input(port));
  const boolean = (port: string): boolean => Boolean(input(port));
  const string = (port: string): string => String(input(port) ?? "");
  const optionalString = (port: string): string | undefined => {
    const value = input(port);
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const object = (port: string): unknown => stableClone(input(port) ?? {});

  switch (node.kind) {
    case "const":
      return node.data?.value;
    case "log":
      return input("in");
    case "add":
      return inputEdges.length > 1
        ? inputEdges.reduce((total, edge) => total + finiteNumber(readEdgeValue(edge, values)), 0)
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

    case "onStart": {
      const active = (context.frame ?? 0) === 0 && (context.time ?? 0) === 0;
      return outputs(active, { out: active, active });
    }
    case "onFrame": {
      const frame = { dt: context.dt ?? 0, time: context.time ?? 0, frame: context.frame ?? 0 };
      return outputs(frame, { out: true, dt: frame.dt, time: frame.time, frame: frame.frame, context: frame });
    }
    case "getNode": {
      const nodeId = string("nodeId");
      const runtimeNode = collectionGet(context.runtimeNodes, nodeId);
      if (!runtimeNode) {
        diagnostics.push({ level: "warning", code: "runtime.nodeMissing", message: `Runtime node not found: ${nodeId}`, nodeId: node.id });
      }
      return outputs(stableClone(runtimeNode ?? null), {
        node: stableClone(runtimeNode ?? null),
        nodeId,
        exists: runtimeNode !== undefined,
        position: normalizeVector(runtimeNode?.position)
      });
    }
    case "setPosition":
      return command("runtime.setPosition", node, context, sideEffects, string("nodeId"), {
        nodeId: string("nodeId"),
        position: normalizeVector(input("position"))
      });
    case "translate": {
      const nodeId = string("nodeId");
      const current = normalizeVector(collectionGet(context.runtimeNodes, nodeId)?.position);
      const delta = normalizeVector(input("delta"));
      return command("runtime.translate", node, context, sideEffects, nodeId, {
        nodeId,
        from: current,
        delta,
        position: addVectors(current, delta)
      });
    }
    case "rotate":
      return command("runtime.rotate", node, context, sideEffects, string("nodeId"), {
        nodeId: string("nodeId"),
        rotation: normalizeVector(input("rotation"))
      });
    case "setVisible":
      return command("runtime.setVisible", node, context, sideEffects, string("nodeId"), {
        nodeId: string("nodeId"),
        visible: boolean("visible")
      });
    case "setMaterial":
      return command("runtime.setMaterial", node, context, sideEffects, string("nodeId"), {
        nodeId: string("nodeId"),
        material: object("material")
      });

    case "pressed":
      return inputFlag(context.input?.pressed, string("action"));
    case "held":
      return inputFlag(context.input?.held, string("action"));
    case "released":
      return inputFlag(context.input?.released, string("action"));
    case "axis":
      return finiteNumber(context.input?.axes?.[string("axis")]);
    case "buffered":
      return inputFlag(context.input?.buffered, string("action"));
    case "combo":
      return inputFlag(context.input?.combos, string("combo"));

    case "playClip":
      return command("animation.playClip", node, context, sideEffects, string("controllerId"), {
        controllerId: string("controllerId"),
        clip: string("clip"),
        loop: boolean("loop")
      });
    case "restartClip":
      return command("animation.restartClip", node, context, sideEffects, string("controllerId"), {
        controllerId: string("controllerId"),
        clip: string("clip"),
        restart: true
      });
    case "crossFade":
      return command("animation.crossFade", node, context, sideEffects, string("controllerId"), {
        controllerId: string("controllerId"),
        clip: string("clip"),
        duration: number("duration"),
        restart: boolean("restart"),
        layer: optionalString("layer")
      });
    case "setLayerWeight":
      return command("animation.setLayerWeight", node, context, sideEffects, string("controllerId"), {
        controllerId: string("controllerId"),
        layer: string("layer"),
        weight: number("weight")
      });
    case "onAnimationEvent": {
      const event = findAnimationEvent(context, string("controllerId"), string("eventType"), optionalString("clip"));
      return outputs(stableClone(event ?? null), {
        out: event !== undefined,
        fired: event !== undefined,
        event: stableClone(event ?? null)
      });
    }
    case "setMorphTarget": {
      const morphTarget = string("morphTarget");
      const weight = number("weight");
      return command("animation.setMorphTarget", node, context, sideEffects, string("controllerId"), {
        controllerId: string("controllerId"),
        morphTarget,
        weight,
        weights: { [morphTarget]: weight }
      });
    }
    case "setMorphTargets":
      return command("animation.setMorphTargets", node, context, sideEffects, string("controllerId"), {
        controllerId: string("controllerId"),
        weights: object("weights")
      });
    case "getClipTime": {
      const controller = collectionGet(context.animationControllers, string("controllerId"));
      return outputs(controller?.clipTime ?? 0, {
        out: controller?.clipTime ?? 0,
        clip: controller?.currentClip ?? ""
      });
    }

    case "setVelocity":
      return command("physics.setVelocity", node, context, sideEffects, string("bodyId"), {
        bodyId: string("bodyId"),
        velocity: normalizeVector(input("velocity"))
      });
    case "jump":
      return command("physics.jump", node, context, sideEffects, string("bodyId"), {
        bodyId: string("bodyId"),
        impulse: number("impulse")
      });
    case "dash":
      return command("physics.dash", node, context, sideEffects, string("bodyId"), {
        bodyId: string("bodyId"),
        direction: normalizeVector(input("direction")),
        speed: number("speed")
      });
    case "onCollisionEnter": {
      const event = findCollisionEvent(context.collisionEvents, "enter", string("bodyId"), optionalString("otherBodyId"));
      return outputs(stableClone(event ?? null), { out: event !== undefined, collided: event !== undefined, event: stableClone(event ?? null) });
    }
    case "onCollisionExit": {
      const event = findCollisionEvent(context.collisionEvents, "exit", string("bodyId"), optionalString("otherBodyId"));
      return outputs(stableClone(event ?? null), { out: event !== undefined, collided: event !== undefined, event: stableClone(event ?? null) });
    }
    case "raycast": {
      const hit = collectionGet(context.raycastHits, string("queryId"));
      return outputs(stableClone(hit ?? null), { hit: hit?.hit === true, result: stableClone(hit ?? null) });
    }
    case "overlap": {
      const overlap = collectionGet(context.overlaps, string("queryId"));
      return outputs(stableClone(overlap ?? null), { hit: (overlap?.bodyIds.length ?? 0) > 0, result: stableClone(overlap ?? null) });
    }

    case "openHitbox":
      return command("combat.openHitbox", node, context, sideEffects, string("hitboxId"), {
        hitboxId: string("hitboxId"),
        ownerId: string("ownerId"),
        damage: number("damage"),
        payload: object("payload")
      });
    case "closeHitbox":
      return command("combat.closeHitbox", node, context, sideEffects, string("hitboxId"), {
        hitboxId: string("hitboxId")
      });
    case "setHurtbox":
      return command("combat.setHurtbox", node, context, sideEffects, string("hurtboxId"), {
        hurtboxId: string("hurtboxId"),
        ownerId: string("ownerId"),
        payload: object("payload")
      });
    case "onHit": {
      const event = findCombatHit(context.combatEvents, optionalString("actorId"), optionalString("hitboxId"));
      return outputs(stableClone(event ?? null), { out: event !== undefined, hit: event !== undefined, event: stableClone(event ?? null) });
    }
    case "applyDamage":
      return command("combat.applyDamage", node, context, sideEffects, string("targetId"), {
        targetId: string("targetId"),
        amount: number("amount"),
        sourceId: optionalString("sourceId")
      });
    case "applyKnockback":
      return command("combat.applyKnockback", node, context, sideEffects, string("targetId"), {
        targetId: string("targetId"),
        velocity: normalizeVector(input("velocity")),
        sourceId: optionalString("sourceId")
      });

    case "follow":
      return command("camera.follow", node, context, sideEffects, string("targetId"), {
        targetId: string("targetId"),
        stiffness: number("stiffness")
      });
    case "frameTargets":
      return command("camera.frameTargets", node, context, sideEffects, undefined, {
        targetIds: object("targetIds"),
        padding: number("padding")
      });
    case "shake":
      return command("camera.shake", node, context, sideEffects, context.camera?.id, {
        intensity: number("intensity"),
        duration: number("duration")
      });
    case "cutTo":
      return command("camera.cutTo", node, context, sideEffects, context.camera?.id, {
        position: normalizeVector(input("position")),
        target: stableClone(input("target") ?? null)
      });

    case "captureSnapshot": {
      const snapshot = cleanObject({
        kind: "evidence.snapshot",
        label: optionalString("label") ?? node.id,
        frame: context.frame,
        time: context.time,
        dt: context.dt,
        runtimeNodes: context.runtimeNodes,
        animationControllers: context.animationControllers,
        physicsBodies: context.physicsBodies,
        camera: context.camera,
        evidence: context.evidence
      });
      pushSideEffect(sideEffects, "evidence.captureSnapshot", node, context, optionalString("label"), snapshot);
      return outputs(snapshot, { out: true, snapshot });
    }
    case "markProof":
      return command("evidence.markProof", node, context, sideEffects, string("proofId"), {
        proofId: string("proofId"),
        details: object("details")
      });
    case "assertState": {
      const operator = optionalString("operator") ?? "equals";
      const actual = input("actual");
      const expected = input("expected");
      const passed = evaluateAssertion(actual, expected, operator);
      const assertion = cleanObject({
        kind: "evidence.assertState",
        operator,
        actual,
        expected,
        passed
      });
      pushSideEffect(sideEffects, "evidence.assertState", node, context, undefined, assertion);
      return outputs(assertion, { out: passed, passed, assertion });
    }
    case "setScene":
      return command("animation.scene.setScene", node, context, sideEffects, string("sceneId"), { sceneId: string("sceneId") });
    case "transitionTo":
      return command("animation.scene.transitionTo", node, context, sideEffects, string("sceneId"), { sceneId: string("sceneId"), transition: optionalString("transition") ?? "cut", duration: number("duration") });
    case "loadSet":
      return command("animation.scene.loadSet", node, context, sideEffects, string("setId"), { setId: string("setId") });
    case "spawnCharacter":
      return command("animation.scene.spawnCharacter", node, context, sideEffects, string("characterId"), { characterId: string("characterId"), position: stableClone(input("position") ?? null) });
    case "sayLine":
      return command("animation.dialogue.sayLine", node, context, sideEffects, string("speakerId"), { speakerId: string("speakerId"), text: string("text"), emotion: optionalString("emotion") });
    case "waitForResponse":
      return command("animation.dialogue.waitForResponse", node, context, sideEffects, optionalString("speakerId"), { speakerId: optionalString("speakerId"), timeout: number("timeout") });
    case "setEmotion":
      return command("animation.dialogue.setEmotion", node, context, sideEffects, string("characterId"), { characterId: string("characterId"), emotion: string("emotion") });
    case "setGesture":
      return command("animation.dialogue.setGesture", node, context, sideEffects, string("characterId"), { characterId: string("characterId"), gestureId: string("gestureId") });
    case "animationCutTo":
      return command("animation.camera.cutTo", node, context, sideEffects, optionalString("targetId"), { presetId: string("presetId"), targetId: optionalString("targetId") });
    case "dollyTo":
      return command("animation.camera.dollyTo", node, context, sideEffects, context.camera?.id, { position: stableClone(input("position") ?? null), duration: number("duration") });
    case "frameCharacter":
      return command("animation.camera.frameCharacter", node, context, sideEffects, string("characterId"), { characterId: string("characterId"), composition: optionalString("composition") ?? "rule-of-thirds" });
    case "shakeCamera":
      return command("animation.camera.shakeCamera", node, context, sideEffects, context.camera?.id, { intensity: number("intensity"), duration: number("duration") });
    case "playMusic":
      return command("animation.audio.playMusic", node, context, sideEffects, string("musicId"), { musicId: string("musicId"), volume: number("volume") });
    case "stopMusic":
      return command("animation.audio.stopMusic", node, context, sideEffects, optionalString("musicId"), { musicId: optionalString("musicId") });
    case "playSfx":
      return command("animation.audio.playSfx", node, context, sideEffects, string("sfxId"), { sfxId: string("sfxId"), volume: number("volume") });
    case "setVolume":
      return command("animation.audio.setVolume", node, context, sideEffects, string("busId"), { busId: string("busId"), volume: number("volume") });
    case "waitForBeat":
      return command("animation.timing.waitForBeat", node, context, sideEffects, string("beatId"), { beatId: string("beatId") });
    case "syncToAudio":
      return command("animation.timing.syncToAudio", node, context, sideEffects, string("audioId"), { audioId: string("audioId"), time: number("time") });
    case "delay":
      return command("animation.timing.delay", node, context, sideEffects, undefined, { duration: number("duration") });
    case "schedule":
      return command("animation.timing.schedule", node, context, sideEffects, optionalString("label"), { time: number("time"), label: optionalString("label") });
    case "captureThumbnail":
      return command("animation.publishing.captureThumbnail", node, context, sideEffects, optionalString("path"), { time: number("time"), path: optionalString("path") });
    case "exportCaption":
      return command("animation.publishing.exportCaption", node, context, sideEffects, optionalString("path"), { format: optionalString("format") ?? "vtt", path: optionalString("path") });
    case "markChapter":
      return command("animation.publishing.markChapter", node, context, sideEffects, string("title"), { title: string("title"), time: number("time") });
  }

  throw new Error(`Unsupported visual node kind: ${node.kind}`);
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

function finiteNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function inputFlag(source: VisualInputSet | undefined, key: string): boolean {
  if (!source || key.length === 0) return false;
  return Array.isArray(source) ? source.includes(key) : (source as Readonly<Record<string, boolean>>)[key] === true;
}

function normalizeVector(value: unknown, fallback: Required<Record<"x" | "y" | "z", number>> = { x: 0, y: 0, z: 0 }): Required<Record<"x" | "y" | "z", number>> {
  if (Array.isArray(value)) {
    return { x: finiteNumber(value[0] ?? fallback.x), y: finiteNumber(value[1] ?? fallback.y), z: finiteNumber(value[2] ?? fallback.z) };
  }
  if (typeof value === "object" && value !== null) {
    const vector = value as VisualVector3 & Record<string, unknown>;
    return {
      x: finiteNumber(vector.x ?? fallback.x),
      y: finiteNumber(vector.y ?? fallback.y),
      z: finiteNumber(vector.z ?? fallback.z)
    };
  }
  return { ...fallback };
}

function addVectors(a: Required<Record<"x" | "y" | "z", number>>, b: Required<Record<"x" | "y" | "z", number>>): Required<Record<"x" | "y" | "z", number>> {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function command(
  kind: string,
  node: VisualNode,
  context: VisualGraphExecutionContext,
  sideEffects: VisualGraphSideEffect[],
  target: string | undefined,
  payload: Readonly<Record<string, unknown>>
): VisualNodeOutputs {
  const commandPayload = cleanObject({ kind, target, ...payload });
  pushSideEffect(sideEffects, kind, node, context, target, commandPayload);
  return outputs(commandPayload, { out: true, command: commandPayload });
}

function pushSideEffect(
  sideEffects: VisualGraphSideEffect[],
  kind: string,
  node: VisualNode,
  context: VisualGraphExecutionContext,
  target: string | undefined,
  payload: unknown
): void {
  sideEffects.push(cleanObject({
    kind,
    nodeId: node.id,
    target,
    frame: context.frame,
    time: context.time,
    payload
  }) as VisualGraphSideEffect);
}

function collectionGet<T extends { readonly id: string }>(collection: VisualStateCollection<T> | undefined, id: string): T | undefined {
  if (!collection || id.length === 0) return undefined;
  return Array.isArray(collection) ? collection.find((entry) => entry.id === id) : (collection as Readonly<Record<string, T>>)[id];
}

function findAnimationEvent(
  context: VisualGraphExecutionContext,
  controllerId: string,
  eventType: string,
  clip: string | undefined
): VisualAnimationEvent | undefined {
  const controller = collectionGet<VisualAnimationControllerState>(context.animationControllers, controllerId);
  const events = [...(context.animationEvents ?? []), ...(controller?.events ?? [])];
  return events.find((event) =>
    event.type === eventType &&
    (event.controllerId === undefined || event.controllerId === controllerId) &&
    (clip === undefined || event.clip === undefined || event.clip === clip)
  );
}

function findCollisionEvent(
  events: readonly VisualCollisionEvent[] | undefined,
  type: VisualCollisionEvent["type"],
  bodyId: string,
  otherBodyId: string | undefined
): VisualCollisionEvent | undefined {
  return events?.find((event) =>
    event.type === type &&
    (event.bodyId === bodyId || event.otherBodyId === bodyId) &&
    (otherBodyId === undefined || event.bodyId === otherBodyId || event.otherBodyId === otherBodyId)
  );
}

function findCombatHit(events: readonly VisualCombatEvent[] | undefined, actorId: string | undefined, hitboxId: string | undefined): VisualCombatEvent | undefined {
  return events?.find((event) =>
    event.type === "hit" &&
    (actorId === undefined || event.actorId === actorId || event.targetId === actorId) &&
    (hitboxId === undefined || event.hitboxId === hitboxId)
  );
}

function evaluateAssertion(actual: unknown, expected: unknown, operator: string): boolean {
  switch (operator) {
    case "equals":
      return stableStringify(actual) === stableStringify(expected);
    case "notEquals":
      return stableStringify(actual) !== stableStringify(expected);
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
    default:
      return false;
  }
}

function stableClone<T>(value: T): T {
  return cleanObject(value) as T;
}

function cleanObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanObject(entry));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        output[key] = cleanObject(entry);
      }
    }
    return output;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(cleanObject(value));
}
