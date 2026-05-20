import assert from "node:assert/strict";
import { test } from "vitest";
import { Blackboard, State, StateMachine } from "../../../packages/scripting/src/index.js";

test("state machine runs lifecycle callbacks and priority transitions", () => {
  const blackboard = new Blackboard();
  blackboard.set("danger", false);
  blackboard.set("hasPickup", false);
  const machine = new StateMachine(blackboard);
  const events: string[] = [];
  const collect = new State("collect");
  const exit = new State("exit");
  const avoid = new State("avoid");

  collect.onEnter = (bb) => {
    events.push("enter-collect");
    bb.set("mode", "collect");
  };
  collect.onUpdate = () => events.push("update-collect");
  collect.onExit = () => events.push("exit-collect");
  collect
    .addTransition("avoid", (bb) => bb.get("danger") === true, 20)
    .addTransition("exit", (bb) => bb.get("hasPickup") === true, 10);
  avoid.onEnter = (bb) => {
    events.push("enter-avoid");
    bb.set("mode", "avoid");
  };
  exit.onEnter = (bb) => {
    events.push("enter-exit");
    bb.set("mode", "exit");
  };

  machine.addState(collect).addState(exit).addState(avoid);
  assert.equal(machine.start("collect").currentState, "collect");
  blackboard.set("hasPickup", true);
  blackboard.set("danger", true);
  const snapshot = machine.update(0.016);

  assert.equal(snapshot.currentState, "avoid");
  assert.equal(snapshot.previousState, "collect");
  assert.equal(snapshot.transitionCount, 1);
  assert.deepEqual(snapshot.history, ["collect->avoid"]);
  assert.equal(blackboard.get("mode"), "avoid");
  assert.deepEqual(events, ["enter-collect", "update-collect", "exit-collect", "enter-avoid"]);
  assert.equal(snapshot.trace.some((entry) => entry.includes("collect->avoid")), true);
});

test("state machine keeps bounded history and stops cleanly", () => {
  const blackboard = new Blackboard();
  const machine = new StateMachine(blackboard, { maxHistorySize: 2 });
  const a = new State("a").addTransition("b", (bb) => bb.get("next") === "b");
  const b = new State("b").addTransition("c", (bb) => bb.get("next") === "c");
  const c = new State("c").addTransition("a", (bb) => bb.get("next") === "a");
  machine.addState(a).addState(b).addState(c);
  machine.start("a");

  blackboard.set("next", "b");
  machine.update(0.1);
  blackboard.set("next", "c");
  machine.update(0.1);
  blackboard.set("next", "a");
  const wrapped = machine.update(0.1);

  assert.equal(wrapped.currentState, "a");
  assert.deepEqual(wrapped.history, ["b->c", "c->a"]);
  const stopped = machine.stop();
  assert.equal(stopped.running, false);
  assert.equal(stopped.currentState, "none");
  assert.equal(stopped.previousState, "a");
});

test("state machine rejects duplicate and missing states", () => {
  const machine = new StateMachine();
  machine.addState(new State("idle"));
  assert.throws(() => machine.addState(new State("idle")), /already registered/);
  assert.throws(() => machine.start("missing"), /not registered/);
});
