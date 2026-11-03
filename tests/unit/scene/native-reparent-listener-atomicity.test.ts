import { describe, expect, it } from "vitest";
import { Scene, SceneNode, transformPoint, type Mat4 } from "../../../packages/scene/src/index";

interface NodeState {
  node: SceneNode;
  parent: SceneNode | null;
  children: SceneNode[];
  local: Mat4;
  localValues: number[];
  world: Mat4;
  worldValues: number[];
  inverse?: Mat4;
  inverseValues?: number[];
  inverseThrows: boolean;
  position: number[];
  rotation: number[];
  scale: number[];
  pivot: number[];
  residual?: Mat4;
  auto: boolean;
  dirty: boolean;
  disposed: boolean;
}

function captureState(node: SceneNode): NodeState {
  let inverse: Mat4 | undefined;
  let inverseThrows = false;
  try {
    inverse = node.transform.inverseWorldMatrix;
  } catch {
    inverseThrows = true;
  }
  return {
    node,
    parent: node.parent,
    children: [...node.children],
    local: node.transform.localMatrix,
    localValues: [...node.transform.localMatrix],
    world: node.transform.worldMatrix,
    worldValues: [...node.transform.worldMatrix],
    inverse,
    inverseValues: inverse && [...inverse],
    inverseThrows,
    position: [...node.transform.position],
    rotation: [...node.transform.rotation],
    scale: [...node.transform.scale],
    pivot: [...node.transform.pivot],
    residual: node.transform.getLinearResidual(),
    auto: node.transform.matrixAutoUpdate,
    dirty: node.transform.isDirty(),
    disposed: node.disposed
  };
}

function expectSameState(before: NodeState, after: NodeState): void {
  expect(after.node).toBe(before.node);
  expect(after.parent).toBe(before.parent);
  expect(after.children).toHaveLength(before.children.length);
  before.children.forEach((child, index) => expect(after.children[index]).toBe(child));
  expect(after.local).toBe(before.local);
  expect(after.localValues).toEqual(before.localValues);
  expect(after.world).toBe(before.world);
  expect(after.worldValues).toEqual(before.worldValues);
  expect(after.inverseThrows).toBe(before.inverseThrows);
  expect(after.inverse).toBe(before.inverse);
  expect(after.inverseValues).toEqual(before.inverseValues);
  expect(after.position).toEqual(before.position);
  expect(after.rotation).toEqual(before.rotation);
  expect(after.scale).toEqual(before.scale);
  expect(after.pivot).toEqual(before.pivot);
  expect(after.residual).toEqual(before.residual);
  expect(after.auto).toBe(before.auto);
  expect(after.dirty).toBe(before.dirty);
  expect(after.disposed).toBe(before.disposed);
}

function expectVector(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 8));
}

function createBranchedScene() {
  const scene = new Scene();
  const oldParent = scene.createNode("old");
  const newParent = scene.createNode("new");
  const child = scene.createNode("child");
  const left = scene.createNode("left");
  const leaf = scene.createNode("leaf");
  const right = scene.createNode("right");
  const oldSibling = scene.createNode("old-sibling");
  const newSibling = scene.createNode("new-sibling");
  scene.root.addChild(oldParent).addChild(newParent);
  oldParent.addChild(child).addChild(oldSibling);
  newParent.addChild(newSibling);
  child.addChild(left).addChild(right);
  left.addChild(leaf);
  return { scene, oldParent, newParent, child, left, leaf, right, oldSibling, newSibling };
}

describe("preserve-world reparent listener atomicity", () => {
  it("leaves dirty ancestors, descendants, links, matrices and inverse caches untouched on preflight failure", () => {
    const { scene, oldParent, newParent, child, left, leaf, right, oldSibling, newSibling } = createBranchedScene();
    const nodes = [scene.root, oldParent, newParent, child, left, leaf, right, oldSibling, newSibling];
    child.transform.setPivot(1, 2, 0).setLocalMatrix([
      1, 0, 0, 0,
      1, 1, 0, 0,
      0, 0, 1, 0,
      2, 3, 0, 1
    ], { decompose: false });
    scene.updateWorldTransforms();
    // The published matrices and inverses are still from the preceding frame.
    oldParent.transform.setPosition(5, 1, 0);
    newParent.transform.setPosition(-2, 0, 0).setScale(0, 1, 1);
    const calls: string[] = [];
    nodes.forEach((node) => node.transform.onDirty(() => calls.push(node.name)));
    const before = nodes.map(captureState);

    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).toThrow();
    nodes.map(captureState).forEach((state, index) => expectSameState(before[index]!, state));
    expect(calls).toEqual([]);

    expect(() => child.addChild(scene.root, { preserveWorldTransform: true })).toThrow();
    nodes.map(captureState).forEach((state, index) => expectSameState(before[index]!, state));
    expect(calls).toEqual([]);
  });

  it.each([
    {
      kind: "manual sheared",
      auto: false,
      configure: (node: SceneNode) => node.transform.setPivot(1, 2, 0).setLocalMatrix([
        1, 0, 0, 0,
        1, 1, 0, 0,
        0, 0, 1, 0,
        2, 3, 0, 1
      ], { decompose: false }),
      expectedWorld: [
        1, 0, 0, 0,
        1, 1, 0, 0,
        0, 0, 1, 0,
        7, 3, 0, 1
      ]
    },
    {
      kind: "zero-scale",
      auto: true,
      configure: (node: SceneNode) => node.transform.setPosition(2, 3, 0).setPivot(1, 0, 0).setScale(0, 2, 1),
      expectedWorld: [
        0, 0, 0, 0,
        0, 2, 0, 0,
        0, 0, 1, 0,
        8, 3, 0, 1
      ]
    }
  ])("publishes the whole moved subtree before notifying $kind callbacks", ({ configure, expectedWorld, auto }) => {
    const { scene, oldParent, newParent, child, left, leaf, right, oldSibling, newSibling } = createBranchedScene();
    oldParent.transform.setPosition(5, 0, 0);
    newParent.transform.setPosition(-4, 2, 0);
    configure(child);
    scene.updateWorldTransforms();
    expectVector(child.transform.worldMatrix, expectedWorld);

    const moved = [child, left, leaf, right];
    const seen: Array<{ name: string; linked: boolean; allDirty: boolean; unaffectedClean: boolean }> = [];
    for (const node of moved) {
      node.transform.onDirty(() => {
        seen.push({
          name: node.name,
          linked: child.parent === newParent && !oldParent.children.includes(child) && newParent.children.includes(child),
          allDirty: moved.every((item) => item.transform.isDirty()),
          unaffectedClean: !oldSibling.transform.isDirty() && !newSibling.transform.isDirty()
        });
      });
    }
    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    expect(seen.map((observation) => observation.name).sort()).toEqual(["child", "leaf", "left", "right"]);
    expect(seen.every((observation) => observation.linked && observation.allDirty && observation.unaffectedClean)).toBe(true);
    expect(child.transform.matrixAutoUpdate).toBe(auto);
    scene.updateWorldTransforms();
    expectVector(child.transform.worldMatrix, expectedWorld);
  });

  it("allows listeners to refresh world transforms without dropping notifications to other branches", () => {
    const { scene, oldParent, newParent, child, left, leaf, right } = createBranchedScene();
    oldParent.transform.setPosition(5, 0, 0);
    newParent.transform.setPosition(-4, 2, 0);
    child.transform.setPosition(2, 3, 0).setPivot(1, 0, 0).setScale(0, 2, 1);
    leaf.transform.setPosition(2, 1, 0);
    scene.updateWorldTransforms();
    const observations: Array<{ name: string; parent: SceneNode | null; childOrigin: number[]; leafOrigin: number[] }> = [];
    for (const node of [child, left, leaf, right]) {
      node.transform.onDirty(() => {
        scene.updateWorldTransforms();
        observations.push({
          name: node.name,
          parent: child.parent,
          childOrigin: transformPoint(child.transform.worldMatrix, [0, 0, 0]),
          leafOrigin: transformPoint(leaf.transform.worldMatrix, [0, 0, 0])
        });
      });
    }
    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    expect(observations.map((observation) => observation.name).sort()).toEqual(["child", "leaf", "left", "right"]);
    for (const observation of observations) {
      expect(observation.parent).toBe(newParent);
      expectVector(observation.childOrigin, [8, 3, 0]);
      expectVector(observation.leafOrigin, [8, 5, 0]);
    }
  });

  it("notifies the remaining listeners and reports all errors after committing the graph", () => {
    const { scene, oldParent, newParent, child, left, leaf, right } = createBranchedScene();
    oldParent.transform.setPosition(3, 0, 0);
    newParent.transform.setPosition(-2, 0, 0);
    child.transform.setPosition(1, 2, 0);
    scene.updateWorldTransforms();
    const expectedWorld = [...child.transform.worldMatrix];
    const first = new Error("child listener failed");
    const second = new Error("left listener failed");
    const calls: string[] = [];
    const unsubscribe = [
      child.transform.onDirty(() => { calls.push("child-throw"); throw first; }),
      child.transform.onDirty(() => calls.push("child-after")),
      left.transform.onDirty(() => { calls.push("left-throw"); throw second; }),
      leaf.transform.onDirty(() => calls.push("leaf")),
      right.transform.onDirty(() => calls.push("right"))
    ];

    let thrown: unknown;
    try {
      newParent.addChild(child, { preserveWorldTransform: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError & { readonly committed: boolean };
    expect(aggregate.committed).toBe(true);
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors).toContain(first);
    expect(aggregate.errors).toContain(second);
    expect(calls.sort()).toEqual(["child-after", "child-throw", "leaf", "left-throw", "right"]);
    expect(child.parent).toBe(newParent);
    expect(oldParent.children).not.toContain(child);
    expect(newParent.children).toContain(child);
    scene.updateWorldTransforms();
    expectVector(child.transform.worldMatrix, expectedWorld);

    unsubscribe.forEach((remove) => remove());
    expect(() => oldParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    scene.updateWorldTransforms();
    expect(child.parent).toBe(oldParent);
    expectVector(child.transform.worldMatrix, expectedWorld);
  });

  it("rejects reentrant structural changes without writes and releases the lock after dispatch", () => {
    const { scene, oldParent, newParent, child, left, leaf, right, oldSibling, newSibling } = createBranchedScene();
    const spare = scene.createNode("spare");
    const independentRoot = new SceneNode({ name: "independent-root" });
    const independentChild = new SceneNode({ name: "independent-child" });
    scene.updateWorldTransforms();
    const nodes = [scene.root, oldParent, newParent, child, left, leaf, right, oldSibling, newSibling, spare];
    const operations: Array<{ name: string; action: () => unknown }> = [
      { name: "attach", action: () => newParent.addChild(spare) },
      { name: "reparent", action: () => newParent.addChild(oldParent) },
      { name: "cycle", action: () => child.addChild(scene.root) },
      { name: "remove", action: () => newParent.removeChild(child) },
      { name: "removeFromParent", action: () => child.removeFromParent() },
      { name: "dispose", action: () => left.dispose() }
    ];
    const attempts: Array<{ name: string; before: NodeState[]; after: NodeState[]; error: unknown }> = [];
    let independentError: unknown;
    const unsubscribe = child.transform.onDirty(() => {
      for (const operation of operations) {
        const before = nodes.map(captureState);
        let error: unknown;
        try {
          operation.action();
        } catch (caught) {
          error = caught;
        }
        attempts.push({ name: operation.name, before, after: nodes.map(captureState), error });
      }
      try {
        independentRoot.addChild(independentChild);
      } catch (error) {
        independentError = error;
      }
    });

    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    expect(attempts.map((attempt) => attempt.name)).toEqual(operations.map((operation) => operation.name));
    for (const attempt of attempts) {
      expect(attempt.error).toBeInstanceOf(Error);
      attempt.after.forEach((state, index) => expectSameState(attempt.before[index]!, state));
    }
    expect(independentError).toBeUndefined();
    expect(independentChild.parent).toBe(independentRoot);
    expect(child.parent).toBe(newParent);
    expect(left.disposed).toBe(false);
    unsubscribe();
    expect(() => oldParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    expect(child.parent).toBe(oldParent);
  });

  it("preserves ordinary local-transform reparenting and dirty notifications", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    oldParent.transform.setPosition(10, 0, 0);
    newParent.transform.setPosition(-10, 0, 0);
    child.transform.setPosition(3, 0, 0);
    scene.updateWorldTransforms();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [13, 0, 0]);
    const calls: string[] = [];
    child.transform.onDirty(() => calls.push("dirty"));

    expect(newParent.addChild(child)).toBe(newParent);
    expect(calls).toEqual(["dirty"]);
    expect(child.transform.position).toEqual([3, 0, 0]);
    expect(child.parent).toBe(newParent);
    scene.updateWorldTransforms();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [-7, 0, 0]);
  });
});
