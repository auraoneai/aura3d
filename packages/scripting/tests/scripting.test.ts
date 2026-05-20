import assert from "node:assert/strict";
import test from "node:test";
import { BehaviorHost, BehaviorSystem, createVisualNode, validateGraph, VisualGraphExecutor } from "../src/index";

test("BehaviorSystem runs start before update and fixed phase separately", async () => {
  const calls: string[] = [];
  const host = new BehaviorHost();
  host.attach({
    onStart: () => calls.push("start"),
    onFixedUpdate: () => calls.push("fixed"),
    onUpdate: () => calls.push("update")
  });

  const system = new BehaviorSystem();
  system.registerHost(host);
  await system.fixedUpdate({ fixedDeltaSeconds: 1 / 60 });
  await system.update({ deltaSeconds: 1 / 30 });
  await system.update({ deltaSeconds: 1 / 30 });

  assert.deepEqual(calls, ["fixed", "start", "update", "update"]);
});

test("Visual graph validates ports and executes simple constants plus add", () => {
  const graph = {
    nodes: [
      { id: "a", kind: "const", data: { value: 2 }, ports: [{ id: "out", direction: "output", type: "number" }] },
      { id: "b", kind: "const", data: { value: 3 }, ports: [{ id: "out", direction: "output", type: "number" }] },
      { id: "sum", kind: "add", ports: [{ id: "in", direction: "input", type: "number" }] }
    ],
    edges: [
      { fromNode: "a", fromPort: "out", toNode: "sum", toPort: "in" },
      { fromNode: "b", fromPort: "out", toNode: "sum", toPort: "in" }
    ]
  } as const;

  assert.deepEqual(validateGraph(graph), []);
  assert.equal(new VisualGraphExecutor().execute(graph).values.get("sum"), 5);
});

test("Visual graph executes catalog math and logic nodes", () => {
  const graph = {
    nodes: [
      createVisualNode("const", "a", { value: 12 }),
      createVisualNode("const", "b", { value: 5 }),
      createVisualNode("subtract", "delta"),
      createVisualNode("lessEqual", "bounded", { b: 7 })
    ],
    edges: [
      { fromNode: "a", fromPort: "out", toNode: "delta", toPort: "a" },
      { fromNode: "b", fromPort: "out", toNode: "delta", toPort: "b" },
      { fromNode: "delta", fromPort: "out", toNode: "bounded", toPort: "a" }
    ]
  };

  const result = new VisualGraphExecutor().execute(graph);

  assert.equal(result.values.get("delta"), 7);
  assert.equal(result.values.get("bounded"), true);
});

test("Visual graph executes bounded flow-control catalog nodes", () => {
  const graph = {
    nodes: [
      createVisualNode("branch", "branch", { condition: false }),
      createVisualNode("forRange", "loop", { startIndex: 1, endIndex: 4 }),
      createVisualNode("gate", "gate", { startClosed: true })
    ],
    edges: []
  };

  const result = new VisualGraphExecutor().execute(graph);

  assert.equal(result.values.get("branch.selected"), "false");
  assert.equal(result.values.get("branch.false"), true);
  assert.deepEqual(result.values.get("loop.indices"), [1, 2, 3]);
  assert.equal(result.values.get("gate.isOpen"), false);
  assert.equal(result.values.get("gate.out"), false);
  assert.ok(result.blockedClaims.includes("Unreal Blueprint parity"));
});
