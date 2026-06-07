import assert from "node:assert/strict";
import test from "node:test";
import {
  BehaviorHost,
  BehaviorSystem,
  createVisualNode,
  listVisualNodeDefinitions,
  validateGraph,
  VisualGraphExecutor,
  type VisualGraphExecutionContext
} from "../src/index";

test("BehaviorSystem runs start before update and fixed phase separately", async () => {
  const calls: string[] = [];
  const host = new BehaviorHost();
  host.attach({
    onStart: () => calls.push("start"),
    onFixedUpdate: () => calls.push("fixed"),
    onUpdate: () => calls.push("update")
  });

  const system = new BehaviorSystem();
  system.registerHost(host);
  await system.fixedUpdate({ fixedDeltaSeconds: 1 / 60 });
  await system.update({ deltaSeconds: 1 / 30 });
  await system.update({ deltaSeconds: 1 / 30 });

  assert.deepEqual(calls, ["fixed", "start", "update", "update"]);
});

test("Visual graph validates ports and executes simple constants plus add", () => {
  const graph = {
    nodes: [
      { id: "a", kind: "const", data: { value: 2 }, ports: [{ id: "out", direction: "output", type: "number" }] },
      { id: "b", kind: "const", data: { value: 3 }, ports: [{ id: "out", direction: "output", type: "number" }] },
      { id: "sum", kind: "add", ports: [{ id: "in", direction: "input", type: "number" }] }
    ],
    edges: [
      { fromNode: "a", fromPort: "out", toNode: "sum", toPort: "in" },
      { fromNode: "b", fromPort: "out", toNode: "sum", toPort: "in" }
    ]
  } as const;

  assert.deepEqual(validateGraph(graph), []);
  assert.equal(new VisualGraphExecutor().execute(graph).values.get("sum"), 5);
});

test("Visual graph executes catalog math and logic nodes", () => {
  const graph = {
    nodes: [
      createVisualNode("const", "a", { value: 12 }),
      createVisualNode("const", "b", { value: 5 }),
      createVisualNode("subtract", "delta"),
      createVisualNode("lessEqual", "bounded", { b: 7 })
    ],
    edges: [
      { fromNode: "a", fromPort: "out", toNode: "delta", toPort: "a" },
      { fromNode: "b", fromPort: "out", toNode: "delta", toPort: "b" },
      { fromNode: "delta", fromPort: "out", toNode: "bounded", toPort: "a" }
    ]
  };

  const result = new VisualGraphExecutor().execute(graph);

  assert.equal(result.values.get("delta"), 7);
  assert.equal(result.values.get("bounded"), true);
});

test("Visual graph executes bounded flow-control catalog nodes", () => {
  const graph = {
    nodes: [
      createVisualNode("branch", "branch", { condition: false }),
      createVisualNode("forRange", "loop", { startIndex: 1, endIndex: 4 }),
      createVisualNode("gate", "gate", { startClosed: true })
    ],
    edges: []
  };

  const result = new VisualGraphExecutor().execute(graph);

  assert.equal(result.values.get("branch.selected"), "false");
  assert.equal(result.values.get("branch.false"), true);
  assert.deepEqual(result.values.get("loop.indices"), [1, 2, 3]);
  assert.equal(result.values.get("gate.isOpen"), false);
  assert.equal(result.values.get("gate.out"), false);
  assert.ok(result.blockedClaims.includes("Unreal Blueprint parity"));
});

test("Visual node catalog exposes Aura3D 1.0.5 runtime-facing node families", () => {
  const definitions = listVisualNodeDefinitions();
  const byCategory = new Map(definitions.map((definition) => [definition.kind, definition.category]));

  for (const [kind, category] of Object.entries({
    onFrame: "runtime",
    translate: "runtime",
    pressed: "input",
    combo: "input",
    restartClip: "animation",
    onAnimationEvent: "animation",
    setVelocity: "physics",
    onCollisionEnter: "physics",
    openHitbox: "combat",
    onHit: "combat",
    follow: "camera",
    captureSnapshot: "evidence",
    assertState: "evidence"
  })) {
    assert.equal(byCategory.get(kind), category);
  }
});

test("Cartoon visual scripting nodes are cataloged and execute deterministic commands", () => {
  const definitions = listVisualNodeDefinitions();
  const byKind = new Map(definitions.map((definition) => [definition.kind, definition]));

  for (const kind of ["setScene", "sayLine", "frameCharacter", "playMusic", "waitForBeat", "captureThumbnail"]) {
    assert.ok(byKind.has(kind), `missing cartoon visual node ${kind}`);
  }

  const graph = {
    nodes: [
      createVisualNode("setScene", "scene", { sceneId: "garden" }),
      createVisualNode("sayLine", "line", { speakerId: "hero", text: "Hello moon.", emotion: "happy" }),
      createVisualNode("captureThumbnail", "thumb", { time: 1, path: "thumb.png" })
    ],
    edges: []
  };
  const result = new VisualGraphExecutor().execute(graph);

  assert.equal((result.values.get("scene.command") as { kind?: string }).kind, "cartoon.scene.setScene");
  assert.equal((result.values.get("line.command") as { kind?: string }).kind, "cartoon.dialogue.sayLine");
  assert.equal((result.values.get("thumb.command") as { kind?: string }).kind, "cartoon.publishing.captureThumbnail");
  assert.equal(result.sideEffects.length, 3);
});

test("Visual graph validation catches missing inputs and invalid deterministic context references", () => {
  const context: VisualGraphExecutionContext = {
    runtimeNodes: [{ id: "player" }],
    animationControllers: [{ id: "playerAnim", clips: ["Idle", "LightPunch"], morphTargets: ["AA", "FV"] }],
    physicsBodies: [{ id: "playerBody" }]
  };

  const missingInputGraph = {
    nodes: [createVisualNode("getNode", "missing-node-id")],
    edges: []
  };

  assert.ok(validateGraph(missingInputGraph).some((error) => error.includes("Missing required input")));

  const invalidGraph = {
    nodes: [
      createVisualNode("getNode", "bad-runtime-node", { nodeId: "ghost" }),
      createVisualNode("playClip", "bad-clip", { controllerId: "playerAnim", clip: "Uppercut" }),
      createVisualNode("setMorphTarget", "bad-morph", { controllerId: "playerAnim", morphTarget: "ZZ", weight: 1 }),
      createVisualNode("setVelocity", "bad-body", { bodyId: "ghostBody", velocity: { x: 1, y: 0, z: 0 } })
    ],
    edges: []
  };

  const errors = validateGraph(invalidGraph, { context, strictReferences: true });

  assert.ok(errors.some((error) => error.includes("Unknown runtime node id")));
  assert.ok(errors.some((error) => error.includes("Unknown animation clip")));
  assert.ok(errors.some((error) => error.includes("Unknown morph target")));
  assert.ok(errors.some((error) => error.includes("Unknown physics body id")));

  const cycleGraph = {
    nodes: [createVisualNode("add", "a"), createVisualNode("add", "b")],
    edges: [
      { fromNode: "a", fromPort: "out", toNode: "b", toPort: "in" },
      { fromNode: "b", fromPort: "out", toNode: "a", toPort: "in" }
    ]
  };

  assert.ok(validateGraph(cycleGraph).some((error) => error.includes("Visual graph cycle detected")));
});

test("Visual graph executes deterministic runtime input animation physics combat camera and evidence hooks", () => {
  const context: VisualGraphExecutionContext = {
    frame: 12,
    time: 0.2,
    dt: 1 / 60,
    runtimeNodes: [{ id: "player", position: { x: 1, y: 0, z: 0 }, visible: true }],
    input: {
      pressed: ["attack"],
      held: { right: true },
      buffered: ["dash"],
      combos: ["light-light"],
      axes: { moveX: 1 }
    },
    animationControllers: [
      {
        id: "playerAnim",
        currentClip: "Idle",
        clipTime: 0.24,
        clips: ["Idle", "LightPunch"],
        morphTargets: ["AA"],
        events: [{ type: "hitbox.open", controllerId: "playerAnim", clip: "LightPunch", time: 0.12, payload: { hitboxId: "player.light" } }]
      }
    ],
    physicsBodies: [{ id: "playerBody", velocity: { x: 0, y: 0, z: 0 }, grounded: true }],
    collisionEvents: [{ type: "enter", bodyId: "playerBody", otherBodyId: "dummyBody" }],
    combatEvents: [{ type: "hit", actorId: "player", targetId: "dummy", hitboxId: "player.light", amount: 8 }],
    camera: { id: "mainCamera", position: { x: 0, y: 2, z: 5 } },
    evidence: { proofId: "visual-scripting-runtime" }
  };

  const graph = {
    nodes: [
      createVisualNode("onFrame", "frame"),
      createVisualNode("pressed", "attack-pressed", { action: "attack" }),
      createVisualNode("axis", "move-axis", { axis: "moveX" }),
      createVisualNode("translate", "move", { nodeId: "player", delta: { x: 0.25, y: 0, z: 0 } }),
      createVisualNode("restartClip", "attack-clip", { controllerId: "playerAnim", clip: "LightPunch" }),
      createVisualNode("onAnimationEvent", "hitbox-event", { controllerId: "playerAnim", eventType: "hitbox.open", clip: "LightPunch" }),
      createVisualNode("openHitbox", "open-hitbox", { hitboxId: "player.light", ownerId: "player", damage: 8 }),
      createVisualNode("setMorphTarget", "mouth-aa", { controllerId: "playerAnim", morphTarget: "AA", weight: 0.7 }),
      createVisualNode("setVelocity", "velocity", { bodyId: "playerBody", velocity: { x: 3, y: 0, z: 0 } }),
      createVisualNode("onCollisionEnter", "collision", { bodyId: "playerBody", otherBodyId: "dummyBody" }),
      createVisualNode("onHit", "hit", { actorId: "player", hitboxId: "player.light" }),
      createVisualNode("follow", "camera-follow", { targetId: "player", stiffness: 0.85 }),
      createVisualNode("captureSnapshot", "snapshot", { label: "visual-scripting-runtime" }),
      createVisualNode("assertState", "assert-attack", { actual: true, expected: true })
    ],
    edges: []
  };

  assert.deepEqual(validateGraph(graph, { context }), []);

  const result = new VisualGraphExecutor(context).execute(graph);
  const second = new VisualGraphExecutor(context).execute(graph);

  assert.equal(result.values.get("attack-pressed"), true);
  assert.equal(result.values.get("move-axis"), 1);
  assert.equal(result.values.get("hitbox-event.fired"), true);
  assert.equal(result.values.get("collision.collided"), true);
  assert.equal(result.values.get("hit.hit"), true);
  assert.equal(result.values.get("assert-attack.passed"), true);

  assert.deepEqual((result.values.get("move.command") as { position: unknown }).position, { x: 1.25, y: 0, z: 0 });
  assert.deepEqual(result.sideEffects.map((effect) => effect.kind), [
    "runtime.translate",
    "animation.restartClip",
    "combat.openHitbox",
    "animation.setMorphTarget",
    "physics.setVelocity",
    "camera.follow",
    "evidence.captureSnapshot",
    "evidence.assertState"
  ]);
  assert.deepEqual(result.sideEffects, second.sideEffects);
  assert.deepEqual(result.diagnostics, []);
});
