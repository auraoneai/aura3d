import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyVisualGameplaySideEffects,
  attachVisualScriptingGraph,
  createVisualGameplayState,
  createVisualNode,
  createVisualScriptingGraph,
  getVisualNodeDefinition,
  listVisualNodeDefinitions,
  listVisualScriptingNodeCatalog,
  VisualGraphExecutor
} from "../../../packages/scripting/src/index.js";
import type { VisualGraph } from "../../../packages/scripting/src/index.js";

const AI_KINDS = [
  "runBehaviorTree",
  "onBehaviorTreeStatus",
  "planGoap",
  "onGoapPlan",
  "planHtn",
  "onHtnPlan",
  "scoreUtility",
  "evaluateDecision",
  "sensePerception",
  "fireWeaponBurst"
] as const;

const GAME_KINDS = [
  "setState",
  "onStateEnter",
  "startTimer",
  "onTimerElapsed",
  "addScore",
  "getScore",
  "setObjective",
  "onObjectiveComplete",
  "despawnCharacter",
  "spawnWave"
] as const;

describe("O2 visual scripting game-loop catalog", () => {
  test("catalog covers 25+ node kinds across input/AI/animation/audio/camera/game-state", () => {
    const definitions = listVisualNodeDefinitions();
    const byCategory = new Map<string, number>();
    for (const definition of definitions) {
      byCategory.set(definition.category, (byCategory.get(definition.category) ?? 0) + 1);
    }
    for (const category of ["input", "ai", "animation", "audio", "camera", "game"]) {
      assert.ok((byCategory.get(category) ?? 0) > 0, `missing category coverage: ${category}`);
    }
    assert.ok(definitions.length >= 25, `expected 25+ node kinds, saw ${definitions.length}`);
  });

  test("every AI/game kind resolves a definition with a typed-backend evidence path", () => {
    for (const kind of [...AI_KINDS, ...GAME_KINDS]) {
      const definition = getVisualNodeDefinition(kind);
      assert.ok(definition, `missing catalog definition: ${kind}`);
      assert.ok(definition.oldBranchSource.length > 0, `missing backend evidence: ${kind}`);
    }
  });

  test("AI reads degrade honestly with no snapshot present", () => {
    const result = new VisualGraphExecutor({}).execute({
      nodes: [
        createVisualNode("onBehaviorTreeStatus", "bt", { treeId: "missing" }),
        createVisualNode("onGoapPlan", "goap", { goalId: "missing" }),
        createVisualNode("onHtnPlan", "htn", { taskId: "missing" }),
        createVisualNode("scoreUtility", "util", { contextId: "missing" }),
        createVisualNode("evaluateDecision", "decide", { treeId: "missing" }),
        createVisualNode("sensePerception", "sense", { sensorId: "missing" }),
        createVisualNode("getScore", "score", { playerId: "missing" }),
        createVisualNode("onObjectiveComplete", "obj", { objectiveId: "missing" }),
        createVisualNode("onStateEnter", "st", { machineId: "missing", state: "open" }),
        createVisualNode("onTimerElapsed", "tm", { timerId: "missing" })
      ],
      edges: []
    });
    assert.equal(result.values.get("bt.status"), "idle");
    assert.equal(result.values.get("bt.succeeded"), false);
    assert.equal(result.values.get("goap.planned"), false);
    assert.equal(result.values.get("htn.planned"), false);
    assert.equal(result.values.get("util.action"), "");
    assert.equal(result.values.get("util.score"), 0);
    assert.equal(result.values.get("decide.decided"), false);
    assert.equal(result.values.get("sense.hits"), 0);
    assert.equal(result.values.get("score.score"), 0);
    assert.equal(result.values.get("obj.complete"), false);
    assert.equal(result.values.get("st.entered"), false);
    assert.equal(result.values.get("tm.fired"), false);
  });

  test("AI reads resolve snapshots by id with data-supplied keys", () => {
    const graph: VisualGraph = {
      nodes: [
        createVisualNode("onBehaviorTreeStatus", "bt", { treeId: "guard" }),
        createVisualNode("onGoapPlan", "goap", { goalId: "eat" }),
        createVisualNode("onHtnPlan", "htn", { taskId: "raid" }),
        createVisualNode("scoreUtility", "util", { contextId: "ctx" }),
        createVisualNode("evaluateDecision", "decide", { treeId: "tactics" }),
        createVisualNode("sensePerception", "sense", { sensorId: "eyes" })
      ],
      edges: []
    };
    const result = new VisualGraphExecutor({
      aiSnapshots: [
        { id: "guard", planner: "behavior-tree", status: "success" },
        { id: "eat", planner: "goap", status: "planned", output: { steps: ["find-food"] } },
        { id: "raid", planner: "htn", status: "planned", output: { tasks: ["breach"] } },
        { id: "ctx", planner: "utility", status: "scored", output: { action: "flee", score: 0.9 } },
        { id: "tactics", planner: "decision-tree", status: "decided", output: "flank" },
        { id: "eyes", planner: "perception", status: "sensed", output: { hits: 2 } }
      ]
    }).execute(graph);
    assert.equal(result.values.get("bt.status"), "success");
    assert.equal(result.values.get("bt.succeeded"), true);
    assert.equal(result.values.get("goap.planned"), true);
    assert.deepEqual(result.values.get("goap.plan"), { steps: ["find-food"] });
    assert.equal(result.values.get("htn.planned"), true);
    assert.equal(result.values.get("util.action"), "flee");
    assert.equal(result.values.get("util.score"), 0.9);
    assert.equal(result.values.get("decide.decision"), "flank");
    assert.equal(result.values.get("decide.decided"), true);
    assert.equal(result.values.get("sense.hits"), 2);
    const kinds = result.sideEffects.map((effect) => effect.kind).sort();
    assert.deepEqual(kinds, []);
  });

  test("game nodes change gameplay state through side effects", () => {
    const graph: VisualGraph = {
      nodes: [
        createVisualNode("addScore", "score", { playerId: "p1", points: 3 }),
        createVisualNode("setObjective", "obj", { objectiveId: "gate", status: "complete" }),
        createVisualNode("setState", "st", { machineId: "door", state: "open" }),
        createVisualNode("startTimer", "tm", { timerId: "wave", duration: 5 }),
        createVisualNode("spawnWave", "wave", { waveId: "w1", count: 4 }),
        createVisualNode("getScore", "read-score", { playerId: "p1" }),
        createVisualNode("onObjectiveComplete", "read-obj", { objectiveId: "gate" }),
        createVisualNode("onStateEnter", "read-st", { machineId: "door", state: "open" }),
        createVisualNode("onTimerElapsed", "read-tm", { timerId: "wave" })
      ],
      edges: []
    };
    const context = {
      gameScores: [{ id: "p1", score: 10 }],
      objectives: [{ id: "gate", status: "complete" as const }],
      stateMachines: [{ id: "door", state: "open" }],
      timers: [{ id: "wave", elapsed: 6, duration: 5, running: true }]
    };
    const result = new VisualGraphExecutor(context).execute(graph);
    assert.equal(result.values.get("read-score.score"), 10);
    assert.equal(result.values.get("read-obj.complete"), true);
    assert.equal(result.values.get("read-st.entered"), true);
    assert.equal(result.values.get("read-tm.fired"), true);

    const state = createVisualGameplayState();
    const applied = applyVisualGameplaySideEffects(state, result);
    assert.equal(applied, 5);
    assert.equal(state.scores.p1, 3);
    assert.equal(state.objectives.gate, "complete");
    assert.equal(state.machines.door, "open");
    assert.deepEqual(state.timers.wave, { elapsed: 0, duration: 5, running: true });
    assert.deepEqual(state.events, ["game.spawnWave:w1"]);

    assert.throws(() => new VisualGraphExecutor({}).execute({
      nodes: [createVisualNode("setObjective", "bad", { objectiveId: "x", status: "bogus" })],
      edges: []
    }), /active\|complete\|failed/);
  });

  test("root graph helper validates, round-trips stably, and attaches", () => {
    const handle = createVisualScriptingGraph({
      nodes: [
        createVisualNode("onStart", "start"),
        createVisualNode("addScore", "score", { playerId: "p1", points: 1 }),
        createVisualNode("getScore", "read", { playerId: "p1" })
      ],
      edges: []
    });
    const roundTrip = handle.roundTrip();
    assert.equal(roundTrip.stable, true);
    const state = createVisualGameplayState();
    const result = handle.attach({ gameScores: [{ id: "p1", score: 0 }] });
    assert.equal(result.values.get("read.score"), 0);
    assert.equal(applyVisualGameplaySideEffects(state, result), 1);
    assert.equal(state.scores.p1, 1);

    assert.throws(() => createVisualScriptingGraph({
      nodes: [createVisualNode("addScore", "missing-inputs")],
      edges: []
    }), /Missing required input/);
  });

  test("node catalog groups carry per-node backend evidence", () => {
    const groups = listVisualScriptingNodeCatalog();
    const kinds = groups.flatMap((group) => group.kinds.map((entry) => entry.kind));
    assert.ok(kinds.length >= 25);
    for (const group of groups) {
      for (const entry of group.kinds) {
        assert.ok(entry.title.length > 0, entry.kind);
        assert.ok(entry.description.length > 0, entry.kind);
      }
    }
    const ai = groups.find((group) => group.category === "ai");
    const game = groups.find((group) => group.category === "game");
    assert.ok(ai && ai.kinds.length >= 10);
    assert.ok(game && game.kinds.length >= 10);
  });

  test("despawn + fireWeaponBurst emit typed commands", () => {
    const result = attachVisualScriptingGraph({
      nodes: [
        createVisualNode("despawnCharacter", "despawn", { characterId: "c1" }),
        createVisualNode("fireWeaponBurst", "burst", { weaponId: "w1", rounds: 3 })
      ],
      edges: []
    });
    const kinds = result.sideEffects.map((effect) => effect.kind).sort();
    assert.deepEqual(kinds, ["animation.scene.despawnCharacter", "combat.fireWeaponBurst"]);
    const state = createVisualGameplayState();
    assert.equal(applyVisualGameplaySideEffects(state, result), 2);
  });
});
