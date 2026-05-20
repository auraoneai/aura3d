import assert from "node:assert/strict";
import { test } from "vitest";
import {
  BehaviorAction,
  BehaviorCondition,
  BehaviorSelector,
  BehaviorSequence,
  BehaviorTree,
  Blackboard
} from "../../../packages/scripting/src/index.js";

test("behavior tree sequences conditions and actions through a blackboard", () => {
  const blackboard = new Blackboard();
  blackboard.set("hasRoute", true);
  const tree = new BehaviorTree(new BehaviorSequence("objective-sequence", [
    new BehaviorCondition("has-route", ({ blackboard }) => blackboard.get<boolean>("hasRoute", false) === true),
    new BehaviorAction("set-intent", ({ blackboard }) => {
      blackboard.set("intent", "seek-pickup");
      return "success";
    })
  ]), blackboard);

  const result = tree.tick(1 / 60);

  assert.equal(result.status, "success");
  assert.equal(result.tickCount, 1);
  assert.equal(blackboard.get("intent"), "seek-pickup");
  assert.deepEqual(result.trace, ["objective-sequence:intent=seek-pickup", "objective-sequence:success"]);
  assert.equal(blackboard.changeLog().some((entry) => entry.key === "intent" && entry.value === "seek-pickup"), true);
});

test("behavior selector falls back when a condition fails", () => {
  const blackboard = new Blackboard();
  blackboard.set("objectivePhase", "playing");
  const tree = new BehaviorTree(new BehaviorSelector("root", [
    new BehaviorSequence("celebrate-when-won", [
      new BehaviorCondition("is-won", ({ blackboard }) => blackboard.get("objectivePhase") === "won"),
      new BehaviorAction("celebrate", ({ blackboard }) => {
        blackboard.set("intent", "celebrate");
        return "success";
      })
    ]),
    new BehaviorAction("keep-driving", ({ blackboard }) => {
      blackboard.set("intent", "seek-objective");
      return "success";
    })
  ]), blackboard);

  const result = tree.tick(0.016);

  assert.equal(result.status, "success");
  assert.equal(blackboard.get("intent"), "seek-objective");
  assert.equal(result.blackboardVersion, 2);
});

test("running behavior actions preserve status across ticks", () => {
  let remaining = 2;
  const tree = new BehaviorTree(new BehaviorAction("wait", () => {
    remaining -= 1;
    return remaining > 0 ? "running" : "success";
  }));

  assert.equal(tree.tick(0.016).status, "running");
  assert.equal(tree.tick(0.016).status, "success");
});
