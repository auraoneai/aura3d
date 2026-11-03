import { describe, expect, it } from "vitest";
import {
  Scene,
  TransformNode,
  deserializeScene,
  serializeScene,
  transformPoint,
  type Mat4
} from "../../../packages/scene/src/index";

function expectVector(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 8));
}

describe("singular scene transforms", () => {
  it("updates a zero-scale child and descendants, then reparents the dirty hierarchy without moving it", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    const grandchild = scene.createNode("grandchild");
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    child.addChild(grandchild);
    oldParent.transform.setPosition(4, 0, 0);
    child.transform.setPosition(2, 3, 4).setPivot(1, 1, 0).setScale(0, 2, 1);
    grandchild.transform.setPosition(1, 2, 3);

    expect(() => scene.updateWorldTransforms()).not.toThrow();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [7, 2, 4]);
    expectVector(transformPoint(grandchild.transform.worldMatrix, [0, 0, 0]), [7, 6, 7]);
    expect(() => child.transform.inverseWorldMatrix).toThrow();
    expect(() => grandchild.transform.inverseWorldMatrix).toThrow();

    // Leave both ancestors dirty: preservation must use their current transforms.
    oldParent.transform.setPosition(5, 1, 0);
    newParent.transform.setPosition(-3, 5, 0);
    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    scene.updateWorldTransforms();

    expect(child.parent).toBe(newParent);
    expect(oldParent.children).not.toContain(child);
    expect(newParent.children).toContain(child);
    expect(child.transform.pivot).toEqual([1, 1, 0]);
    // Translation is parent position + position + pivot - linear * pivot.
    expectVector(child.transform.worldMatrix, [
      0, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 1, 0,
      8, 3, 4, 1
    ]);
    expectVector(transformPoint(child.transform.worldMatrix, [1, 1, 0]), [8, 5, 4]);
    expectVector(transformPoint(grandchild.transform.worldMatrix, [0, 0, 0]), [8, 7, 7]);
    expect(() => child.transform.inverseWorldMatrix).toThrow();
  });

  it("rejects a singular destination without changing the child's hierarchy or local transform", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    oldParent.transform.setPosition(3, 4, 0);
    child.transform.setPosition(2, 0, 1).setPivot(1, 0, 0).setScale(0, 2, 1);
    scene.updateWorldTransforms();

    const worldBefore = [...child.transform.worldMatrix];
    const localBefore = [...child.transform.localMatrix];
    const positionBefore = [...child.transform.position];
    const rotationBefore = [...child.transform.rotation];
    const scaleBefore = [...child.transform.scale];
    const residualBefore = child.transform.getLinearResidual();
    newParent.transform.setPosition(-2, 1, 0).setScale(1, 0, 1);

    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).toThrow();
    expect(child.parent).toBe(oldParent);
    expect(oldParent.children).toContain(child);
    expect(newParent.children).not.toContain(child);
    expect(child.transform.localMatrix).toEqual(localBefore);
    expect(child.transform.position).toEqual(positionBefore);
    expect(child.transform.rotation).toEqual(rotationBefore);
    expect(child.transform.scale).toEqual(scaleBefore);
    expect(child.transform.getLinearResidual()).toEqual(residualBefore);
    expectVector(child.transform.worldMatrix, worldBefore);

    newParent.transform.setScale(1, 1, 1);
    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).not.toThrow();
    scene.updateWorldTransforms();
    expect(child.parent).toBe(newParent);
    expectVector(child.transform.worldMatrix, worldBefore);
  });

  it("preserves a sheared rank-deficient matrix with no zero columns through reparenting and serialization", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("rank-deficient");
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    oldParent.transform.setPosition(4, 0, 0);
    newParent.transform.setPosition(-2, 0, 0);
    // The third linear column is the sum of the first two. All three are
    // nonzero, but their span is only two-dimensional.
    const local: Mat4 = [
      1, 0, 1, 0,
      1, 1, 2, 0,
      2, 1, 3, 0,
      4, 5, 6, 1
    ];
    child.transform.setPivot(1, 2, 3).setFromLocalMatrix(local);
    scene.updateWorldTransforms();
    const expectedWorld: Mat4 = [
      1, 0, 1, 0,
      1, 1, 2, 0,
      2, 1, 3, 0,
      8, 5, 6, 1
    ];
    expectVector(child.transform.worldMatrix, expectedWorld);
    expectVector(transformPoint(child.transform.worldMatrix, [1, 1, 1]), [12, 7, 12]);
    expect(() => child.transform.inverseWorldMatrix).toThrow();

    newParent.addChild(child, { preserveWorldTransform: true });
    scene.updateWorldTransforms();
    expectVector(child.transform.worldMatrix, expectedWorld);
    expect(child.transform.getLinearResidual()).toBeDefined();
    expect(child.transform.pivot).toEqual([1, 2, 3]);
    expect(child.transform.matrixAutoUpdate).toBe(true);

    const restored = deserializeScene(serializeScene(scene));
    restored.updateWorldTransforms();
    const loaded = restored.findByName("rank-deficient")[0]!;
    expect(loaded.transform.getLinearResidual()).toBeDefined();
    expectVector(loaded.transform.worldMatrix, expectedWorld);
    expect(() => loaded.transform.inverseWorldMatrix).toThrow();

    // Recomposition after an authored translation must retain every column.
    const [x, y, z] = loaded.transform.position;
    loaded.transform.setPosition(x + 2, y, z);
    restored.updateWorldTransforms();
    expectVector(loaded.transform.worldMatrix, [
      1, 0, 1, 0,
      1, 1, 2, 0,
      2, 1, 3, 0,
      10, 5, 6, 1
    ]);
  });

  it("does not expose a stale or assigned inverse for a singular world and recovers after an invertible update", () => {
    const transform = new TransformNode();
    const assignedIdentity: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    transform.inverseWorldMatrix = assignedIdentity;
    expect(transform.inverseWorldMatrix).toBe(assignedIdentity);

    transform.setPosition(4, -3, 2).setScale(2, 4, 5);
    expect(transform.updateWorld()).toBe(true);
    expectVector(transformPoint(transform.worldMatrix, [1, 2, 3]), [6, 5, 17]);
    const previousInverse = transform.inverseWorldMatrix;
    expectVector(transformPoint(previousInverse, [6, 5, 17]), [1, 2, 3]);
    expect(transform.updateWorld()).toBe(false);
    expect(transform.inverseWorldMatrix).toBe(previousInverse);

    transform.setScale(0, 4, 5);
    expect(() => transform.updateWorld()).not.toThrow();
    expectVector(transformPoint(transform.worldMatrix, [1, 2, 3]), [4, 5, 17]);
    expect(() => transform.inverseWorldMatrix).toThrow();
    expect(() => transform.inverseWorldMatrix).toThrow();
    transform.inverseWorldMatrix = assignedIdentity;
    expect(() => transform.inverseWorldMatrix).toThrow();

    transform.setScale(2, 4, 5);
    expect(transform.updateWorld()).toBe(true);
    expectVector(transformPoint(transform.inverseWorldMatrix, [6, 5, 17]), [1, 2, 3]);
    expect(transform.inverseWorldMatrix).not.toBe(previousInverse);
    expect(transform.inverseWorldMatrix).not.toBe(assignedIdentity);
  });

  it("refreshes the inverse after direct changes to the published world matrix", () => {
    const transform = new TransformNode();
    transform.setPosition(2, 0, 0).updateWorld();
    const previousInverse = transform.inverseWorldMatrix;
    expectVector(transformPoint(previousInverse, [2, 0, 0]), [0, 0, 0]);

    // The published matrix is mutable; a cache must follow its actual values.
    transform.worldMatrix[12] = 5;
    expectVector(transformPoint(transform.inverseWorldMatrix, [5, 0, 0]), [0, 0, 0]);
    expect(transform.inverseWorldMatrix).not.toBe(previousInverse);
    transform.worldMatrix[0] = 0;
    expect(() => transform.inverseWorldMatrix).toThrow();
    transform.worldMatrix[0] = 2;
    expectVector(transformPoint(transform.inverseWorldMatrix, [7, 0, 0]), [1, 0, 0]);
  });

  it("retains a nearly dependent but invertible basis without treating it as singular", () => {
    const transform = new TransformNode();
    const thinShear: Mat4 = [
      1, 0, 0, 0,
      1, 1e-13, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    transform.setFromLocalMatrix(thinShear).updateWorld();
    expectVector(transform.worldMatrix, thinShear);
    expect(transform.getLinearResidual()).toBeDefined();
    expectVector(transformPoint(transform.inverseWorldMatrix, [1, 1e-13, 0]), [0, 1, 0]);
  });

  it("keeps singular cameras explicit when their view inverse is requested", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    scene.root.addChild(camera);
    camera.transform.setScale(0, 1, 1);
    expect(() => scene.updateWorldTransforms()).not.toThrow();
    expect(() => camera.updateCameraMatrices()).toThrow();
    camera.transform.setScale(1, 1, 1).setPosition(1, 2, 3);
    expect(() => camera.updateCameraMatrices()).not.toThrow();
    expectVector(transformPoint(camera.viewMatrix, [1, 2, 3]), [0, 0, 0]);
  });
});
