import assert from "node:assert/strict";
import { test } from "vitest";
import { GOAPAction, GOAPPlanner, WorldState } from "../../../packages/scripting/src/index.js";

test("goap planner finds a lowest-cost objective plan", () => {
  const planner = new GOAPPlanner();
  const actions = [
    new GOAPAction({ name: "avoid-hazard", cost: 0.5, preconditions: { hazardSafe: false }, effects: { hazardSafe: true } }),
    new GOAPAction({ name: "move-to-pickup", cost: 1, preconditions: { hazardSafe: true, nearPickup: false }, effects: { nearPickup: true } }),
    new GOAPAction({ name: "collect-pickup", cost: 1, preconditions: { nearPickup: true, hasPickup: false }, effects: { hasPickup: true } }),
    new GOAPAction({ name: "move-to-exit", cost: 1.2, preconditions: { hasPickup: true, nearExit: false }, effects: { nearExit: true } }),
    new GOAPAction({ name: "finish-objective", cost: 0.2, preconditions: { hasPickup: true, nearExit: true }, effects: { objectiveComplete: true } }),
    new GOAPAction({ name: "expensive-shortcut", cost: 10, preconditions: { hazardSafe: true }, effects: { objectiveComplete: true } })
  ];

  const plan = planner.plan(
    WorldState.from({ hazardSafe: false, nearPickup: false, hasPickup: false, nearExit: false, objectiveComplete: false }),
    WorldState.from({ objectiveComplete: true }),
    actions
  );

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.actions, ["avoid-hazard", "move-to-pickup", "collect-pickup", "move-to-exit", "finish-objective"]);
  assert.equal(plan.cost, 3.9);
  assert.equal(plan.finalState.objectiveComplete, true);
  assert.ok(plan.nodesExplored > 0);
});

test("goap planner handles already-satisfied goals and blocked plans", () => {
  const planner = new GOAPPlanner({ maxIterations: 4 });
  const satisfied = planner.plan(WorldState.from({ doorOpen: true }), WorldState.from({ doorOpen: true }), []);
  assert.deepEqual(satisfied, {
    valid: true,
    actions: [],
    cost: 0,
    nodesExplored: 0,
    finalState: { doorOpen: true }
  });

  const blocked = planner.plan(
    WorldState.from({ hasKey: false, doorOpen: false }),
    WorldState.from({ doorOpen: true }),
    [new GOAPAction({ name: "open-door", preconditions: { hasKey: true }, effects: { doorOpen: true } })]
  );
  assert.equal(blocked.valid, false);
  assert.deepEqual(blocked.actions, []);
  assert.equal(blocked.finalState.doorOpen, false);
});

test("goap planner ignores disabled actions", () => {
  const planner = new GOAPPlanner();
  const plan = planner.plan(
    WorldState.from({ hasBridge: false, crossed: false }),
    WorldState.from({ crossed: true }),
    [
      new GOAPAction({ name: "build-bridge", effects: { hasBridge: true }, enabled: false }),
      new GOAPAction({ name: "cross-bridge", preconditions: { hasBridge: true }, effects: { crossed: true } })
    ]
  );

  assert.equal(plan.valid, false);
});
