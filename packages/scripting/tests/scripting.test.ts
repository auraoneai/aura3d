import assert from "node:assert/strict";
import test from "node:test";
import { BehaviorHost, BehaviorSystem, validateGraph, VisualGraphExecutor } from "../src/index";

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
