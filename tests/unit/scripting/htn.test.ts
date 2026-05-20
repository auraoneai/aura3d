import assert from "node:assert/strict";
import { test } from "vitest";
import { HTNPlanner, HTNTask, WorldState } from "../../../packages/scripting/src/index.js";

test("HTN planner decomposes a compound objective into primitive tasks", () => {
  const avoidHazard = HTNTask.primitive({
    name: "avoid-hazard",
    preconditions: { hazardSafe: false },
    effects: { hazardSafe: true }
  });
  const navigateToPickup = HTNTask.primitive({
    name: "navigate-to-pickup",
    preconditions: { hazardSafe: true, nearPickup: false },
    effects: { nearPickup: true }
  });
  const collectPickup = HTNTask.primitive({
    name: "collect-pickup",
    preconditions: { nearPickup: true, hasPickup: false },
    effects: { hasPickup: true }
  });
  const navigateToExit = HTNTask.primitive({
    name: "navigate-to-exit",
    preconditions: { hasPickup: true, nearExit: false },
    effects: { nearExit: true }
  });
  const finishObjective = HTNTask.primitive({
    name: "finish-objective",
    preconditions: { hasPickup: true, nearExit: true },
    effects: { objectiveComplete: true }
  });
  const objective = HTNTask.compound({
    name: "complete-objective",
    methods: [
      {
        name: "finish-current-run",
        preconditions: { objectiveComplete: false },
        priority: 10,
        subtasks: [avoidHazard, navigateToPickup, collectPickup, navigateToExit, finishObjective]
      }
    ]
  });

  const plan = new HTNPlanner().plan(objective, WorldState.from({
    hazardSafe: false,
    nearPickup: false,
    hasPickup: false,
    nearExit: false,
    objectiveComplete: false
  }));

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.tasks, ["avoid-hazard", "navigate-to-pickup", "collect-pickup", "navigate-to-exit", "finish-objective"]);
  assert.deepEqual(plan.methodTrace, ["complete-objective:finish-current-run"]);
  assert.equal(plan.finalState.objectiveComplete, true);
  assert.equal(plan.decompositions, 1);
});

test("HTN planner selects the highest-priority satisfiable method and can validate the plan", () => {
  const finish = HTNTask.primitive({
    name: "finish-objective",
    preconditions: { hasPickup: true, nearExit: true },
    effects: { objectiveComplete: true }
  });
  const shortcut = HTNTask.primitive({
    name: "use-shortcut",
    preconditions: { shortcutReady: true },
    effects: { hasPickup: true, nearExit: true }
  });
  const objective = HTNTask.compound({
    name: "complete-objective",
    methods: [
      {
        name: "direct-finish",
        preconditions: { hasPickup: true, nearExit: true },
        priority: 20,
        subtasks: [finish]
      },
      {
        name: "shortcut-route",
        preconditions: { shortcutReady: true },
        priority: 10,
        subtasks: [shortcut, finish]
      }
    ]
  });
  const planner = new HTNPlanner();
  const state = WorldState.from({ shortcutReady: true, hasPickup: false, nearExit: false, objectiveComplete: false });
  const plan = planner.plan(objective, state);

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.tasks, ["use-shortcut", "finish-objective"]);
  assert.deepEqual(plan.methodTrace, ["complete-objective:shortcut-route"]);
  assert.equal(planner.isPlanValid(plan, objective, state), true);
});

test("HTN planner fails closed when no compound method is satisfiable", () => {
  const task = HTNTask.compound({
    name: "complete-objective",
    methods: [
      {
        name: "needs-pickup",
        preconditions: { hasPickup: true },
        subtasks: [HTNTask.primitive({ name: "finish", preconditions: { hasPickup: true }, effects: { objectiveComplete: true } })]
      }
    ]
  });

  const plan = new HTNPlanner().plan(task, WorldState.from({ hasPickup: false, objectiveComplete: false }));

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.tasks, []);
  assert.deepEqual(plan.methodTrace, []);
});
