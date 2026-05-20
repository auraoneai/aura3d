import assert from "node:assert/strict";
import { test } from "vitest";
import { CrowdSimulation } from "../../../packages/physics/src/index.js";

test("crowd simulation finds neighbors and moves agents into formation deterministically", () => {
  const create = () => {
    const crowd = new CrowdSimulation({ neighborRadius: 0.8, maxNeighbors: 3, formationWeight: 1, separationWeight: 1.2 });
    crowd.addAgent({ id: "leader", position: [0, 0], maxSpeed: 0.8, priority: 100 });
    crowd.addAgent({ id: "left", position: [-0.15, -0.08], maxSpeed: 0.8, priority: 80 });
    crowd.addAgent({ id: "right", position: [0.15, -0.08], maxSpeed: 0.8, priority: 80 });
    crowd.setFormation({ type: "wedge", center: [0.5, 0.25], forward: [1, 0], spacing: 0.2 });
    return crowd;
  };

  const run = (crowd: CrowdSimulation) => {
    const snapshots = [];
    for (let index = 0; index < 6; index += 1) snapshots.push(crowd.update(0.1));
    return snapshots;
  };

  const first = run(create());
  assert.deepEqual(run(create()), first);
  assert.equal(first[0]!.agentCount, 3);
  assert.ok(first[0]!.neighborPairs >= 2);
  assert.equal(first[0]!.formationType, "wedge");
  assert.ok(first[first.length - 1]!.averageSpeed > 0);
  assert.ok(first[first.length - 1]!.agents.every((agent) => agent.neighborCount > 0));
});

test("crowd simulation supports line and circle formation slots", () => {
  const crowd = new CrowdSimulation({ neighborRadius: 2 });
  crowd.addAgent({ id: "a", position: [0, 0] });
  crowd.addAgent({ id: "b", position: [0, 0] });
  crowd.addAgent({ id: "c", position: [0, 0] });

  crowd.setFormation({ type: "line", center: [1, 1], forward: [1, 0], spacing: 0.5 });
  const line = crowd.update(0);
  assert.deepEqual(line.agents.map((agent) => agent.formationSlot), [[1, 1.5], [1, 1], [1, 0.5]]);

  crowd.setFormation({ type: "circle", center: [0, 0], spacing: 1 });
  const circle = crowd.update(0);
  assert.deepEqual(circle.agents[0]!.formationSlot, [1, 0]);
  assert.ok(circle.agents[1]!.formationSlot[0] < 0);
  assert.ok(circle.agents[2]!.formationSlot[1] < 0);
});

test("crowd simulation validates duplicate ids and removals", () => {
  const crowd = new CrowdSimulation();
  crowd.addAgent({ id: "a", position: [0, 0] });
  assert.throws(() => crowd.addAgent({ id: "a", position: [1, 1] }), /already exists/);
  assert.equal(crowd.removeAgent("missing"), false);
  assert.equal(crowd.removeAgent("a"), true);
  assert.equal(crowd.snapshot().agentCount, 0);
});
