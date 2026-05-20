import assert from "node:assert/strict";
import { test } from "vitest";
import { DecisionTree } from "../../../packages/scripting/src/index.js";

test("decision tree traverses decisions to the selected action", () => {
  const executed: string[] = [];
  const tree = new DecisionTree();
  const enemyVisible = tree.createDecision("enemy-visible", ({ values }) => values?.enemyVisible === true);
  const hasWeapon = tree.createDecision("has-weapon", ({ values }) => values?.hasWeapon === true);
  const attack = tree.createAction("attack", () => executed.push("attack"));
  const flee = tree.createAction("flee", () => executed.push("flee"));
  const patrol = tree.createAction("patrol", () => executed.push("patrol"));

  tree.setBranches(enemyVisible, hasWeapon, patrol);
  tree.setBranches(hasWeapon, attack, flee);
  tree.setRoot(enemyVisible);

  assert.equal(tree.validate(), true);
  assert.deepEqual(tree.getTraversalPath({ values: { enemyVisible: true, hasWeapon: false } }), ["enemy-visible", "has-weapon", "flee"]);
  assert.deepEqual(tree.decide({ values: { enemyVisible: true, hasWeapon: false } }), {
    action: "flee",
    path: ["enemy-visible", "has-weapon", "flee"],
    executed: true
  });
  assert.deepEqual(executed, ["flee"]);
});

test("decision tree publishes stats and clone keeps traversal behavior", () => {
  const tree = new DecisionTree();
  const lowHealth = tree.createDecision("low-health", ({ values }) => Number(values?.health ?? 1) < 0.35);
  const heal = tree.createAction("heal");
  const continueRoute = tree.createAction("continue-route");
  tree.setBranches(lowHealth, heal, continueRoute);
  tree.setRoot(lowHealth);

  assert.deepEqual(tree.getStats(), {
    totalNodes: 3,
    decisionNodes: 1,
    actionNodes: 2,
    maxDepth: 1,
    averageActionDepth: 1
  });
  assert.equal(tree.clone().decide({ values: { health: 0.8 } }).action, "continue-route");
});

test("decision tree fails closed for invalid structures and depth limits", () => {
  const empty = new DecisionTree();
  assert.equal(empty.validate(), false);
  assert.deepEqual(empty.decide({}), { action: "none", path: [], executed: false });

  const invalid = new DecisionTree();
  const decision = invalid.createDecision("broken", () => true);
  invalid.setRoot(decision);
  assert.equal(invalid.validate(), false);
  assert.equal(invalid.traverse({}, 1), undefined);
  assert.deepEqual(invalid.getTraversalPath({}, 1), ["broken"]);
});
