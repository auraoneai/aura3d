import assert from "node:assert/strict";
import { test } from "vitest";
import { NavigationAgent, NavigationGrid, type NavigationPath } from "../../../packages/physics/src/index.js";

test("navigation grid finds deterministic walkable paths around blocked cells", () => {
  const grid = new NavigationGrid({
    width: 7,
    height: 5,
    origin: [-1.4, -0.6],
    cellSize: 0.4,
    blocked: [[2, 1], [2, 2], [3, 2], [4, 2]]
  });

  const path = grid.findPath([-1.1, -0.2], [1.0, 0.8]);

  assert.equal(path.status, "success");
  assert.ok(path.cells.length > 5);
  assert.ok(path.waypoints.length >= 3);
  assert.ok(path.length > 2);
  assert.ok(path.cost >= path.cells.length - 1);
  assert.ok(path.visitedCells >= path.cells.length);
  assert.equal(path.cells.some((cell) => grid.isBlocked(cell)), false);
  assert.deepEqual(path.waypoints[0], [-1.1, -0.2]);
  assert.deepEqual(path.waypoints[path.waypoints.length - 1], [1.0, 0.8]);
});

test("navigation grid supports weighted terrain costs and diagonal search", () => {
  const grid = new NavigationGrid({
    width: 5,
    height: 5,
    allowDiagonal: true,
    costs: [
      { cell: [1, 1], cost: 8 },
      { cell: [2, 2], cost: 8 },
      { cell: [3, 3], cost: 8 },
      { cell: [2, 1], cost: 1.5 }
    ]
  });

  const path = grid.findPath([0.2, 0.2], [4.2, 4.2]);

  assert.equal(path.status, "success");
  assert.equal(grid.allowDiagonal, true);
  assert.equal(grid.cellCost([1, 1]), 8);
  assert.equal(path.cells.some((cell) => cell[0] === 1 && cell[1] === 1), false);
  assert.ok(path.cells.some((cell) => cell[0] !== 0 && cell[1] !== 0));
  assert.ok(path.cost > 0);
  assert.ok(path.cost < 8 * 3);
});

test("navigation grid returns partial paths when the target is unreachable", () => {
  const grid = new NavigationGrid({
    width: 5,
    height: 5,
    blocked: [[1, 0], [1, 1], [0, 1]]
  });

  const path = grid.findPath([0.2, 0.2], [4.2, 4.2]);

  assert.equal(path.status, "partial");
  assert.ok(path.cells.length >= 1);
  assert.ok(path.visitedCells >= 1);
  assert.notDeepEqual(path.cells[path.cells.length - 1], [4, 4]);
});

test("navigation agent advances along path snapshots with stable metrics", () => {
  const path: NavigationPath = {
    status: "success",
    cells: [[0, 0], [1, 0], [2, 0]],
    waypoints: [[0, 0], [0.5, 0], [1, 0]],
    length: 1,
    cost: 2,
    visitedCells: 3
  };
  const agent = new NavigationAgent({ position: [0, 0], speed: 0.25, waypointRadius: 0.001 });
  agent.setPath(path);

  const first = agent.update(1);
  const second = agent.update(2);
  const third = agent.update(1);
  const final = agent.update(4);

  assert.deepEqual(first.position, [0.25, 0]);
  assert.equal(first.state, "moving");
  assert.equal(first.remainingWaypoints, 2);
  assert.deepEqual(second.position, [0.5, 0]);
  assert.equal(second.distanceTraveled, 0.5);
  assert.deepEqual(third.position, [0.75, 0]);
  assert.equal(third.distanceTraveled, 0.75);
  assert.deepEqual(final.position, [1, 0]);
  assert.equal(final.state, "arrived");
  assert.equal(final.remainingWaypoints, 0);
});
