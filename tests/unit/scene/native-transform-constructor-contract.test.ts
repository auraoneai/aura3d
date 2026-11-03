import { describe, expect, it } from "vitest";
import * as sceneApi from "../../../packages/scene/src/index";
import { cloneMat4, identityMat4, Scene, SceneNode, TransformNode, transformPoint, type Mat4 } from "../../../packages/scene/src/index";

// The staging bridge is a private implementation detail, including its types.
// @ts-expect-error Internal bridge types must not be exported by the scene root.
type InternalAccess = import("../../../packages/scene/src/index").TransformNodeAccess;
// @ts-expect-error Staged world updates must not be exported by the scene root.
type InternalWorld = import("../../../packages/scene/src/index").StagedWorldUpdate;
// @ts-expect-error Staged local updates must not be exported by the scene root.
type InternalLocal = import("../../../packages/scene/src/index").StagedLocalUpdate;

function expectVector(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 8));
}

function assignCopy(node: SceneNode): Mat4 {
  const assigned = cloneMat4(node.transform.inverseWorldMatrix);
  node.transform.inverseWorldMatrix = assigned;
  return assigned;
}

function createScene() {
  const scene = new Scene();
  const oldParent = scene.createNode("old");
  const newParent = scene.createNode("new");
  const child = scene.createNode("child");
  scene.root.addChild(oldParent).addChild(newParent);
  oldParent.addChild(child);
  oldParent.transform.setPosition(10, 0, 0);
  newParent.transform.setPosition(-5, 0, 0);
  child.transform.setPosition(2, 0, 0);
  scene.updateWorldTransforms();
  return { scene, oldParent, newParent, child };
}

describe("scene transform constructor and staging contract", () => {
  it("uses the exact public transform constructor and prototype for scene objects", () => {
    const scene = new Scene();
    const nodes = [
      new SceneNode(),
      scene.root,
      scene.createNode("node"),
      scene.createObject3D({ name: "object" }),
      scene.createPerspectiveCamera({ name: "perspective" }),
      scene.createOrthographicCamera({ name: "orthographic" })
    ];
    for (const node of nodes) {
      expect(node.transform).toBeInstanceOf(TransformNode);
      expect(node.transform.constructor).toBe(TransformNode);
      expect(Object.getPrototypeOf(node.transform)).toBe(TransformNode.prototype);
    }
  });

  it("does not publish staging or access bridge names from the scene root", () => {
    const exports = Object.keys(sceneApi);
    for (const name of [
      "SceneNodeTransform",
      "installTransformNodeAccess",
      "getTransformNodeAccess",
      "TransformNodeAccess",
      "StagedWorldUpdate",
      "StagedLocalUpdate"
    ]) {
      expect(exports).not.toContain(name);
    }
  });

  it("retains assigned inverse identities and published worlds when a dirty preview fails", () => {
    const { scene, oldParent, newParent, child } = createScene();
    const nodes = [scene.root, oldParent, newParent, child];
    const assigned = nodes.map(assignCopy);
    const worlds = nodes.map((node) => node.transform.worldMatrix);
    const worldValues = worlds.map((matrix) => [...matrix]);
    oldParent.transform.setPosition(20, 0, 0);
    newParent.transform.setScale(0, 1, 1);

    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).toThrow();
    expect(child.parent).toBe(oldParent);
    nodes.forEach((node, index) => {
      expect(node.transform.worldMatrix).toBe(worlds[index]);
      expect(node.transform.worldMatrix).toEqual(worldValues[index]);
      expect(node.transform.inverseWorldMatrix).toBe(assigned[index]);
    });
  });

  it("retains assigned inverses during clean previews until an actual world update commits", () => {
    const { scene, oldParent, newParent, child } = createScene();
    const nodes = [scene.root, oldParent, newParent, child];
    const assigned = nodes.map(assignCopy);
    const before = [...child.transform.worldMatrix];

    newParent.addChild(child, { preserveWorldTransform: true });
    expect(child.parent).toBe(newParent);
    nodes.forEach((node, index) => expect(node.transform.inverseWorldMatrix).toBe(assigned[index]));
    expect(child.transform.isDirty()).toBe(true);

    scene.updateWorldTransforms();
    expectVector(child.transform.worldMatrix, before);
    expect(child.transform.inverseWorldMatrix).not.toBe(assigned[3]);
    expectVector(transformPoint(child.transform.inverseWorldMatrix, [12, 0, 0]), [0, 0, 0]);
    nodes.slice(0, 3).forEach((node, index) => expect(node.transform.inverseWorldMatrix).toBe(assigned[index]));
  });

  it("invalidates assigned inverses for dirty ancestor previews that commit", () => {
    const { scene, oldParent, newParent, child } = createScene();
    const rootInverse = assignCopy(scene.root);
    const oldInverse = assignCopy(oldParent);
    const newInverse = assignCopy(newParent);
    const childInverse = assignCopy(child);
    oldParent.transform.setPosition(20, 0, 0);
    newParent.transform.setPosition(-7, 0, 0);

    newParent.addChild(child, { preserveWorldTransform: true });
    expect(child.parent).toBe(newParent);
    expect(scene.root.transform.inverseWorldMatrix).toBe(rootInverse);
    expect(oldParent.transform.inverseWorldMatrix).not.toBe(oldInverse);
    expect(newParent.transform.inverseWorldMatrix).not.toBe(newInverse);
    expect(child.transform.inverseWorldMatrix).not.toBe(childInverse);
    expectVector(transformPoint(oldParent.transform.inverseWorldMatrix, [20, 0, 0]), [0, 0, 0]);
    expectVector(transformPoint(newParent.transform.inverseWorldMatrix, [-7, 0, 0]), [0, 0, 0]);
    expectVector(transformPoint(child.transform.inverseWorldMatrix, [22, 0, 0]), [0, 0, 0]);
    scene.updateWorldTransforms();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [22, 0, 0]);
  });

  it("does not invoke an own inverse setter during failed previews, staged commits, or world updates", () => {
    const { scene, oldParent, newParent, child } = createScene();
    const accessor = Object.getOwnPropertyDescriptor(TransformNode.prototype, "inverseWorldMatrix");
    if (!accessor?.get || !accessor.set) throw new Error("TransformNode inverse accessor is unavailable.");
    const get = accessor.get;
    const set = accessor.set;
    const writes: Mat4[] = [];
    let reads = 0;
    Object.defineProperty(child.transform, "inverseWorldMatrix", {
      configurable: true,
      get: () => { reads += 1; return get.call(child.transform); },
      set: (value: Mat4) => { writes.push(value); set.call(child.transform, value); }
    });
    const assigned = cloneMat4(child.transform.inverseWorldMatrix);
    child.transform.inverseWorldMatrix = assigned;
    expect(writes).toEqual([assigned]);
    writes.length = 0;
    oldParent.transform.setPosition(20, 0, 0);
    newParent.transform.setScale(0, 1, 1);

    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).toThrow();
    expect(writes).toEqual([]);
    expect(child.transform.inverseWorldMatrix).toBe(assigned);
    newParent.transform.setScale(1, 1, 1);
    newParent.addChild(child, { preserveWorldTransform: true });
    expect(writes).toEqual([]);
    expect(child.transform.inverseWorldMatrix).not.toBe(assigned);
    scene.updateWorldTransforms();
    expect(writes).toEqual([]);
    expect(reads).toBeGreaterThan(0);
    expectVector(transformPoint(child.transform.inverseWorldMatrix, [22, 0, 0]), [0, 0, 0]);
  });

  it("retains singular child reparenting and inverse failure and recovery", () => {
    const { scene, oldParent, newParent, child } = createScene();
    child.transform.setScale(0, 1, 1);
    scene.updateWorldTransforms();
    expect(() => child.transform.inverseWorldMatrix).toThrow();
    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    scene.updateWorldTransforms();
    expect(child.parent).toBe(newParent);
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [12, 0, 0]);
    expect(() => child.transform.inverseWorldMatrix).toThrow();
    expect(oldParent.children).not.toContain(child);

    // Replacing the local matrix removes the retained singular linear part.
    child.transform.setFromLocalMatrix(identityMat4());
    scene.updateWorldTransforms();
    expectVector(transformPoint(child.transform.inverseWorldMatrix, [-5, 0, 0]), [0, 0, 0]);
  });
});
