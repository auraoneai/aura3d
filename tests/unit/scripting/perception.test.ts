import assert from "node:assert/strict";
import { test } from "vitest";
import { PerceptionSensor } from "../../../packages/scripting/src/index.js";

test("perception sensor detects targets inside range and field of view", () => {
  const sensor = new PerceptionSensor({ position: [0, 0], forward: [1, 0], range: 3, fovRadians: Math.PI / 2, peripheralRadians: Math.PI });

  const snapshot = sensor.scan([
    { id: "pickup", position: [1, 0], priority: 1.1 },
    { id: "side", position: [0.3, 1] },
    { id: "behind", position: [-1, 0] },
    { id: "far", position: [4, 0] }
  ], 0.1);

  assert.deepEqual(snapshot.visible.map((hit) => hit.id), ["pickup", "side"]);
  assert.equal(snapshot.visible[0]?.peripheral, false);
  assert.equal(snapshot.visible[1]?.peripheral, true);
  assert.equal(snapshot.closestVisible?.id, "pickup");
  assert.deepEqual(snapshot.enteredIds, ["pickup", "side"]);
  assert.equal(snapshot.memories.length, 2);
});

test("perception sensor keeps decaying memories and forgets below threshold", () => {
  const sensor = new PerceptionSensor({
    position: [0, 0],
    forward: [1, 0],
    range: 3,
    memoryDecayPerSecond: 0.5,
    forgetBelowConfidence: 0.2
  });

  sensor.scan([{ id: "pickup", position: [1, 0] }], 0.1);
  sensor.updateTransform([0, 0], [-1, 0]);
  const retained = sensor.scan([], 0.5);
  const forgotten = sensor.scan([], 2);

  assert.equal(retained.strongestMemory?.id, "pickup");
  assert.ok((retained.strongestMemory?.confidence ?? 0) < 1);
  assert.deepEqual(forgotten.forgottenIds, ["pickup"]);
  assert.equal(forgotten.memories.length, 0);
});

test("perception sensor reports just-entered only for newly visible targets", () => {
  const sensor = new PerceptionSensor({ position: [0, 0], forward: [1, 0], range: 3 });

  const first = sensor.scan([{ id: "exit", position: [1, 0] }], 0.016);
  const second = sensor.scan([{ id: "exit", position: [1, 0] }], 0.016);

  assert.deepEqual(first.enteredIds, ["exit"]);
  assert.deepEqual(second.enteredIds, []);
  assert.equal(second.visible[0]?.justEntered, false);
  assert.equal(second.memories[0]?.seenCount, 2);
});
