import assert from "node:assert/strict";
import test from "node:test";
import { Ray, Vector3 } from "@galileo3d/math";
import { Scene } from "@galileo3d/scene";
import {
  CommandHistory,
  CreateNodeCommand,
  DeleteNodeCommand,
  EditorRuntime,
  InspectorModel,
  PickingService,
  Selection,
  SetPropertyCommand,
  TransformCommand,
  TranslateGizmo,
  type Command
} from "../src/index";

test("CommandHistory executes undo and redo deterministically", async () => {
  const target = { position: { x: 0, y: 0, z: 0 } };
  const history = new CommandHistory();

  await history.execute(new TransformCommand(target, { position: { x: 1, y: 2, z: 3 } }));
  assert.deepEqual(target.position, { x: 1, y: 2, z: 3 });
  await history.undo();
  assert.deepEqual(target.position, { x: 0, y: 0, z: 0 });
  await history.redo();
  assert.deepEqual(target.position, { x: 1, y: 2, z: 3 });
});

test("Selection emits changes and can prune deleted ids", () => {
  const selection = new Selection();
  const changes: unknown[] = [];
  selection.subscribe((change) => changes.push(change));
  selection.set(["a", "b"]);
  selection.prune((id) => id !== "a");
  assert.deepEqual(selection.current(), ["b"]);
  assert.equal(changes.length, 2);
});

test("Create, delete, and set-property commands mutate through public command contract", async () => {
  const nodes: string[] = [];
  const container = {
    add: (node: string) => nodes.push(node),
    remove: (node: string) => {
      const index = nodes.indexOf(node);
      if (index >= 0) nodes.splice(index, 1);
    }
  };
  const history = new CommandHistory();
  await history.execute(new CreateNodeCommand(container, "node-a"));
  await history.execute(new DeleteNodeCommand(container, "node-a"));
  assert.deepEqual(nodes, []);
  await history.undo();
  assert.deepEqual(nodes, ["node-a"]);

  const model = { transform: { visible: true } };
  await history.execute(new SetPropertyCommand(model, ["transform", "visible"], false));
  assert.equal(model.transform.visible, false);
  await history.undo();
  assert.equal(model.transform.visible, true);
});

test("CommandHistory transactions roll back partial execution", async () => {
  const history = new CommandHistory();
  const calls: string[] = [];
  const first: Command = {
    name: "first",
    execute() {
      calls.push("first:execute");
    },
    undo() {
      calls.push("first:undo");
    }
  };
  const second: Command = {
    name: "second",
    execute() {
      calls.push("second:execute");
      throw new Error("second failed");
    },
    undo() {
      calls.push("second:undo");
    }
  };

  await assert.rejects(() => history.executeTransaction([first, second]), /second failed/);
  assert.deepEqual(calls, ["first:execute", "second:execute", "first:undo"]);
  assert.equal(history.undoDepth, 0);
  assert.equal(history.redoDepth, 0);
});

test("CommandHistory transactions undo and redo as one history entry", async () => {
  const history = new CommandHistory();
  const values: string[] = [];
  const createPushCommand = (value: string): Command => ({
    name: `push ${value}`,
    execute() {
      values.push(value);
    },
    undo() {
      const index = values.lastIndexOf(value);
      if (index >= 0) {
        values.splice(index, 1);
      }
    }
  });

  await history.executeTransaction([createPushCommand("a"), createPushCommand("b")]);
  assert.deepEqual(values, ["a", "b"]);
  assert.equal(history.undoDepth, 1);

  await history.undo();
  assert.deepEqual(values, []);
  assert.equal(history.redoDepth, 1);

  await history.redo();
  assert.deepEqual(values, ["a", "b"]);
});

test("CommandHistory preserves history entries when undo or redo fail", async () => {
  const undoHistory = new CommandHistory();
  const failingUndo: Command = {
    name: "failing undo",
    execute() {},
    undo() {
      throw new Error("undo failed");
    }
  };
  await undoHistory.execute(failingUndo);
  await assert.rejects(() => undoHistory.undo(), /undo failed/);
  assert.equal(undoHistory.undoDepth, 1);
  assert.equal(undoHistory.redoDepth, 0);

  const redoHistory = new CommandHistory();
  let failRedo = false;
  const failingRedo: Command = {
    name: "failing redo",
    execute() {
      if (failRedo) {
        throw new Error("redo failed");
      }
    },
    undo() {}
  };
  await redoHistory.execute(failingRedo);
  await redoHistory.undo();
  failRedo = true;
  await assert.rejects(() => redoHistory.redo(), /redo failed/);
  assert.equal(redoHistory.undoDepth, 0);
  assert.equal(redoHistory.redoDepth, 1);
});

test("DeleteNodeCommand restores scene parent and sibling order", async () => {
  const scene = new Scene();
  const parent = scene.createNode("parent");
  const child = scene.createNode("child");
  const sibling = scene.createNode("sibling");
  scene.root.addChild(parent);
  parent.addChild(child);
  parent.addChild(sibling);
  const container = {
    add: (node: typeof child) => parent.addChild(node),
    remove: (node: typeof child) => parent.removeChild(node)
  };
  const history = new CommandHistory();

  await history.execute(new DeleteNodeCommand(container, child));
  assert.equal(child.parent, null);
  assert.deepEqual(parent.children.map((node) => node.name), ["sibling"]);

  await history.undo();
  assert.equal(child.parent, parent);
  assert.deepEqual(parent.children.map((node) => node.name), ["child", "sibling"]);

  await history.redo();
  assert.equal(child.parent, null);
  assert.deepEqual(parent.children.map((node) => node.name), ["sibling"]);
});

test("DeleteNodeCommand falls back to generic containers for unparented scene-shaped nodes", async () => {
  const scene = new Scene();
  const node = scene.createNode("loose");
  const nodes = [node];
  const container = {
    add: (value: typeof node) => nodes.push(value),
    remove: (value: typeof node) => {
      const index = nodes.indexOf(value);
      if (index >= 0) {
        nodes.splice(index, 1);
      }
    }
  };
  const history = new CommandHistory();

  await history.execute(new DeleteNodeCommand(container, node));
  assert.deepEqual(nodes, []);

  await history.undo();
  assert.deepEqual(nodes, [node]);
});

test("PickingService and TranslateGizmo use command history for scene node edits", async () => {
  const scene = new Scene();
  const node = scene.createNode("editable");
  scene.root.addChild(node);
  const picking = new PickingService();
  picking.addTarget({ id: "editable", node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });

  const hit = picking.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
  assert.equal(hit?.target.node, node);

  const history = new CommandHistory();
  const gizmo = new TranslateGizmo(history);
  gizmo.setTarget(node);
  await gizmo.drag({ axis: "x", delta: 2 });
  assert.equal(node.transform.position[0], 2);
  await history.undo();
  assert.equal(node.transform.position[0], 0);
});

test("InspectorModel and EditorRuntime apply typed inspector edits through undo history", async () => {
  const target = {
    name: "cube",
    visible: true,
    transform: {
      x: 1,
      y: 2
    }
  };
  const inspector = new InspectorModel();
  const history = new CommandHistory();

  await history.execute(inspector.createSetPropertyCommand(target, ["transform", "x"], 4));
  assert.equal(target.transform.x, 4);
  await history.undo();
  assert.equal(target.transform.x, 1);
  assert.throws(() => inspector.createSetPropertyCommand(target, ["transform"], 0), /not editable/);
  assert.throws(() => inspector.createSetPropertyCommand(target, ["visible"], "false"), /expected boolean/);
  assert.throws(() => inspector.createSetPropertyCommand(target, ["missing"], true), /does not exist/);

  const runtime = new EditorRuntime();
  await runtime.editInspectedProperty(target, ["name"], "hero");
  assert.equal(target.name, "hero");
  await runtime.undo();
  assert.equal(target.name, "cube");
});

test("EditorRuntime exposes public selection, picking, transform, and diagnostics operations", async () => {
  const scene = new Scene();
  const node = scene.createNode("runtime-owned");
  scene.root.addChild(node);
  const runtime = new EditorRuntime();

  runtime.select([node.id]);
  assert.deepEqual(runtime.currentSelection(), [node.id]);

  runtime.setPickTargets([{ id: node.id, node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } }]);
  const hit = runtime.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
  assert.equal(hit?.target.id, node.id);

  await runtime.translateTarget(node, { axis: "x", delta: 1.5 });
  assert.equal(node.transform.position[0], 1.5);
  assert.equal(runtime.snapshot().undoDepth, 1);

  const diagnostics = runtime.updateDiagnostics({
    frameTimeMs: 2,
    drawCalls: 1,
    nodeCount: 1,
    assetCount: 0,
    physicsBodies: 0,
    resources: [{ id: "shader-runtime", label: "Runtime shader", kind: "shader", status: "warning" }]
  });
  assert.equal(diagnostics.warnings, 1);
  assert.equal(runtime.diagnosticsSnapshot().shaderWarnings[0]?.id, "shader-runtime");

  runtime.clearSelection();
  assert.deepEqual(runtime.currentSelection(), []);
});

test("DiagnosticsOverlayModel validates profiler resource and shader diagnostics", () => {
  const runtime = new EditorRuntime();
  const snapshot = runtime.updateDiagnostics({
    frameTimeMs: 4.5,
    drawCalls: 2,
    triangleCount: 12,
    nodeCount: 3,
    assetCount: 1,
    physicsBodies: 1,
    resources: [
      { id: "shader-main", label: "Main shader", kind: "shader", status: "warning", detail: "Missing normal map" },
      { id: "asset-model", label: "model.glb", kind: "asset", status: "ok" }
    ]
  });

  assert.equal(snapshot.warnings, 1);
  assert.equal(snapshot.errors, 0);
  assert.equal(snapshot.shaderWarnings[0]?.id, "shader-main");
  assert.equal(runtime.snapshot().diagnostics.drawCalls, 2);

  assert.throws(() => runtime.updateDiagnostics({
    frameTimeMs: -1,
    drawCalls: 0,
    nodeCount: 0,
    assetCount: 0,
    physicsBodies: 0
  }), /frame time/);
});
