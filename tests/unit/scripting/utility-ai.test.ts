import assert from "node:assert/strict";
import { test } from "vitest";
import { UtilityAI, UtilityAction, UtilityConsideration } from "../../../packages/scripting/src/index.js";

test("utility considerations clamp inputs and apply response curves", () => {
  const context = { values: { danger: 0.7, hasAmmo: true, distance: 1.4 } };

  assert.equal(new UtilityConsideration({ name: "linear", input: () => 1.5 }).evaluate(context), 1);
  assert.equal(new UtilityConsideration({ name: "inverse", input: ({ values }) => Number(values?.danger), curve: "inverse" }).evaluate(context), 0.3);
  assert.equal(new UtilityConsideration({ name: "quadratic", input: () => 0.5, curve: "quadratic" }).evaluate(context), 0.25);
  assert.equal(new UtilityConsideration({ name: "cubic", input: () => 0.5, curve: "cubic" }).evaluate(context), 0.125);
  assert.equal(new UtilityConsideration({ name: "boolean", input: ({ values }) => Boolean(values?.hasAmmo), curve: "boolean" }).evaluate(context), 1);
  assert.equal(new UtilityConsideration({ name: "weighted", input: () => 0.8, weight: 0.5 }).evaluate(context), 0.4);
  assert.equal(new UtilityConsideration({ name: "invalid", input: ({ values }) => Number(values?.missing), curve: "linear" }).evaluate(context), 0);
});

test("utility ai scores actions deterministically and selects the best action", () => {
  const ai = new UtilityAI();
  ai.addAction(new UtilityAction({
    name: "collect-pickup",
    scoring: "average",
    considerations: [
      new UtilityConsideration({ name: "pickup-visible", input: ({ values }) => values?.target === "pickup" }),
      new UtilityConsideration({ name: "needs-pickup", input: ({ values }) => values?.collectedPickup !== true })
    ]
  }));
  ai.addAction(new UtilityAction({
    name: "reach-exit",
    scoring: "average",
    considerations: [
      new UtilityConsideration({ name: "has-pickup", input: ({ values }) => values?.collectedPickup === true }),
      new UtilityConsideration({ name: "exit-confidence", input: ({ values }) => Number(values?.exitConfidence ?? 0) })
    ]
  }));
  ai.addAction(new UtilityAction({
    name: "avoid-hazard",
    scoring: "max",
    considerations: [
      new UtilityConsideration({ name: "hazard-visible", input: ({ values }) => values?.target === "hazard" }),
      new UtilityConsideration({ name: "danger", input: ({ values }) => Number(values?.danger ?? 0) })
    ]
  }));

  const collecting = ai.select({ values: { target: "pickup", collectedPickup: false, exitConfidence: 0.15, danger: 0.1 } });
  assert.equal(collecting?.action, "collect-pickup");
  assert.equal(collecting.score, 1);

  const exiting = ai.select({ values: { target: "exit", collectedPickup: true, exitConfidence: 0.8, danger: 0.15 } });
  assert.equal(exiting?.action, "reach-exit");
  assert.equal(exiting.score, 0.9);

  const avoiding = ai.select({ values: { target: "hazard", collectedPickup: false, exitConfidence: 0.1, danger: 0.95 } });
  assert.equal(avoiding?.action, "avoid-hazard");
  assert.equal(avoiding.score, 1);
});

test("utility ai ignores disabled actions, supports removal, and sorts ties by action name", () => {
  const ai = new UtilityAI();
  ai.addAction(new UtilityAction({ name: "beta", considerations: [new UtilityConsideration({ name: "score", input: () => 0.5 })] }));
  ai.addAction(new UtilityAction({ name: "alpha", considerations: [new UtilityConsideration({ name: "score", input: () => 0.5 })] }));
  ai.addAction(new UtilityAction({ name: "disabled", enabled: false, considerations: [new UtilityConsideration({ name: "score", input: () => 1 })] }));

  assert.deepEqual(ai.evaluate({}).map((score) => score.action), ["alpha", "beta"]);
  assert.equal(ai.select({})?.action, "alpha");

  ai.setActionEnabled("disabled", true);
  assert.equal(ai.select({})?.action, "disabled");
  assert.equal(ai.removeAction("disabled"), true);
  assert.equal(ai.removeAction("missing"), false);
  assert.equal(ai.select({})?.action, "alpha");
  assert.throws(() => ai.setActionEnabled("missing", true), /not registered/);
  assert.throws(() => ai.addAction(new UtilityAction({ name: "alpha", considerations: [] })), /already registered/);
});
