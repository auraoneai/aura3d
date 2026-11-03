import { describe, expect, it } from "vitest";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack";
import { SceneAnimationBridge } from "../../../packages/animation/src/SceneAnimationBridge";
import { Scene, TransformNode, deserializeScene, serializeScene, transformPoint } from "../../../packages/scene/src/index";

function expectVector(actual: ArrayLike<number>, expected: readonly number[], precision = 6): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, precision));
}

describe("pivot transforms", () => {
  it("rotates and scales around a local pivot before translation", () => {
    const transform = new TransformNode();
    transform.setPosition(3, 4, 0).setPivot(1, 0, 0).setScale(2, 3, 1);
    transform.setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2);
    transform.updateWorld();

    // The pivot is fixed by R·S and then translated; its neighboring point
    // moves two units along +Y (the local X scale followed by a quarter turn).
    expectVector(transformPoint(transform.localMatrix, [1, 0, 0]), [4, 4, 0]);
    expectVector(transformPoint(transform.localMatrix, [2, 0, 0]), [4, 6, 0]);
    expectVector(transformPoint(transform.inverseWorldMatrix, [4, 6, 0]), [2, 0, 0]);
  });

  it("composes pivots through parent and child transforms and propagates edits", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = scene.createNode("child");
    parent.transform.setPivot(1, 0, 0).setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2);
    child.transform.setPosition(2, 0, 0);
    scene.root.addChild(parent);
    parent.addChild(child);
    scene.updateWorldTransforms();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [1, 1, 0]);
    parent.transform.setPivot(2, 0, 0);
    scene.updateWorldTransforms();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [2, 0, 0]);
  });

  it("preserves pivot and world pose through reparenting", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    oldParent.transform.setPosition(4, 2, 0);
    newParent.transform.setPosition(-2, 0, 0);
    child.transform.setPivot(1, 0, 0).setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2);
    child.transform.setPosition(2, 3, 0);
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    scene.updateWorldTransforms();
    const before = [...child.transform.worldMatrix];
    newParent.addChild(child, { preserveWorldTransform: true });
    scene.updateWorldTransforms();
    expect(child.transform.pivot).toEqual([1, 0, 0]);
    expectVector(child.transform.worldMatrix, before);
    expectVector(child.transform.position, [8, 5, 0]);
  });

  it("recovers pivot-aware local TRS for reflected and sheared matrices", () => {
    const source = new TransformNode();
    source.setPivot(2, 1, 0).setPosition(3, -1, 0).setScale(-2, 3, 1);
    source.setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2).updateWorld();
    const restored = new TransformNode();
    restored.setPivot(2, 1, 0).setFromLocalMatrix(source.localMatrix).updateWorld();
    expectVector(restored.localMatrix, source.localMatrix);
    expectVector(restored.position, source.position);
    const shear: typeof source.localMatrix = [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    restored.setFromLocalMatrix(shear).updateWorld();
    expectVector(restored.localMatrix, shear);
    expect(restored.getLinearResidual()).toBeDefined();
    const before = [...restored.localMatrix];
    expect(() => restored.setFromLocalMatrix([1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toThrow(/affine/i);
    expect(restored.localMatrix).toEqual(before);
  });

  it("reparents dirty hierarchies while retaining shear, later animation and serialization", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    oldParent.transform.setPosition(3, 0, 0).setScale(2, 1, 1);
    child.transform.setPivot(1, 0, 0).setRotation(0, 0, Math.SQRT1_2 / Math.sqrt(2 + Math.SQRT2), Math.sqrt((2 + Math.SQRT2) / 4));
    child.transform.setPosition(1, 2, 0);
    newParent.transform.setPosition(-4, 1, 0);
    // Do not update matrices here: reparent must refresh both ancestor chains.
    newParent.addChild(child, { preserveWorldTransform: true });
    scene.updateWorldTransforms();
    // Independent expectation: old parent scales child translation [1,2,0].
    const diagonal = Math.SQRT1_2;
    expectVector(transformPoint(child.transform.worldMatrix, [1, 0, 0]), [7, 2, 0]);
    expectVector(transformPoint(child.transform.worldMatrix, [2, 0, 0]), [7 + 2 * diagonal, 2 + diagonal, 0]);
    expect(child.transform.getLinearResidual()).toBeDefined();
    expect(child.transform.matrixAutoUpdate).toBe(true);

    const restored = deserializeScene(serializeScene(scene));
    restored.updateWorldTransforms();
    const loaded = restored.findByName("child")[0]!;
    expectVector(loaded.transform.worldMatrix, child.transform.worldMatrix);
    const before = transformPoint(loaded.transform.worldMatrix, [1, 0, 0]);
    loaded.transform.setPosition(loaded.transform.position[0] + 2, loaded.transform.position[1], loaded.transform.position[2]);
    restored.updateWorldTransforms();
    const after = transformPoint(loaded.transform.worldMatrix, [1, 0, 0]);
    expectVector(after, [before[0] + 2, before[1], before[2]]);
    const priorTip = transformPoint(loaded.transform.worldMatrix, [2, 0, 0]);
    loaded.transform.setRotation(0, 0, 0, 1);
    restored.updateWorldTransforms();
    expectVector(transformPoint(loaded.transform.worldMatrix, [1, 0, 0]), after);
    expect(transformPoint(loaded.transform.worldMatrix, [2, 0, 0])).not.toEqual(priorTip);
    const reloaded = deserializeScene(serializeScene(restored));
    reloaded.updateWorldTransforms();
    expectVector(reloaded.findByName("child")[0]!.transform.worldMatrix, loaded.transform.worldMatrix);
  });

  it("preserves manual local matrix mode and its world matrix on reparent", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    oldParent.transform.setPosition(5, 0, 0);
    newParent.transform.setPosition(-3, 0, 0);
    child.transform.setPivot(1, 0, 0).setLocalMatrix([1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 2, 3, 0, 1], { decompose: false });
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    scene.updateWorldTransforms();
    const before = [...child.transform.worldMatrix];
    newParent.addChild(child, { preserveWorldTransform: true });
    scene.updateWorldTransforms();
    expect(child.transform.matrixAutoUpdate).toBe(false);
    expectVector(child.transform.worldMatrix, before);
    const restored = deserializeScene(serializeScene(scene));
    restored.updateWorldTransforms();
    const loaded = restored.findByName("child")[0]!;
    expect(loaded.transform.matrixAutoUpdate).toBe(false);
    expectVector(loaded.transform.worldMatrix, before);
    loaded.transform.setMatrixAutoUpdate(true);
    restored.updateWorldTransforms();
    expectVector(loaded.transform.worldMatrix, before);
  });

  it("leaves hierarchy and local transform unchanged when the destination is singular", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const newParent = scene.createNode("new");
    const child = scene.createNode("child");
    scene.root.addChild(oldParent).addChild(newParent);
    oldParent.addChild(child);
    scene.updateWorldTransforms();
    const oldPosition = [...child.transform.position];
    newParent.transform.setScale(0, 1, 1);
    expect(() => newParent.addChild(child, { preserveWorldTransform: true })).toThrow();
    expect(child.parent).toBe(oldParent);
    expect(oldParent.children).toContain(child);
    expect(newParent.children).not.toContain(child);
    expect(child.transform.position).toEqual(oldPosition);
  });

  it("animates rotation about the pivot through a scene animation binding", () => {
    const scene = new Scene();
    const node = scene.createNode("arm");
    const tip = scene.createNode("tip");
    scene.root.addChild(node);
    node.addChild(tip);
    node.transform.setPivot(1, 0, 0);
    tip.transform.setPosition(2, 0, 0);
    const bridge = new SceneAnimationBridge();
    bridge.register("arm", { setRotation: (value) => node.transform.setRotation(...value) });
    const track = new AnimationTrack({
      target: "arm.rotation",
      valueType: "quaternion",
      keyframes: [
        { time: 0, value: [0, 0, 0, 1] as [number, number, number, number] },
        { time: 1, value: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] }
      ]
    });
    bridge.setAnimationValue(track.target, track.sample(0.5));
    scene.updateWorldTransforms();
    expectVector(transformPoint(tip.transform.worldMatrix, [0, 0, 0]), [1 + Math.SQRT1_2, Math.SQRT1_2, 0]);
    bridge.setAnimationValue(track.target, track.sample(1));
    scene.updateWorldTransforms();
    expectVector(transformPoint(tip.transform.worldMatrix, [0, 0, 0]), [1, 1, 0]);
  });

  it("animates pivot tracks through the scene bridge and invalidates child matrices", () => {
    const scene = new Scene();
    const node = scene.createNode("arm");
    const tip = scene.createNode("tip");
    scene.root.addChild(node);
    node.addChild(tip);
    node.transform.setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2);
    tip.transform.setPosition(2, 0, 0);
    const bridge = new SceneAnimationBridge();
    bridge.register("arm", { name: "arm", transform: node.transform });
    const track = new AnimationTrack({
      target: "arm.pivot", valueType: "vector3",
      keyframes: [
        { time: 0, value: [0, 0, 0] as [number, number, number] },
        { time: 1, value: [2, 0, 0] as [number, number, number] }
      ]
    });
    bridge.setAnimationValue(track.target, track.sample(0.5));
    scene.updateWorldTransforms();
    expectVector(transformPoint(tip.transform.worldMatrix, [0, 0, 0]), [1, 1, 0]);
    bridge.setAnimationValue("arm.pivot[x]", 2);
    scene.updateWorldTransforms();
    expectVector(transformPoint(tip.transform.worldMatrix, [0, 0, 0]), [2, 0, 0]);
  });

  it("round-trips pivots, root transforms and explicit matrices while reading legacy defaults", () => {
    const scene = new Scene();
    scene.root.transform.setPosition(5, 0, 0).setPivot(2, 0, 0);
    const child = scene.createNode("manual");
    child.transform.setPivot(1, 2, 3);
    child.transform.setLocalMatrix([1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1], { decompose: false });
    scene.root.addChild(child);
    const document = serializeScene(scene);
    const restored = deserializeScene(document);
    restored.updateWorldTransforms();
    expect(restored.root.transform.pivot).toEqual([2, 0, 0]);
    expect(restored.root.transform.position).toEqual([5, 0, 0]);
    expect(restored.root.children[0]!.transform.pivot).toEqual([1, 2, 3]);
    expect(restored.root.children[0]!.transform.matrixAutoUpdate).toBe(false);
    expect(restored.root.children[0]!.transform.localMatrix).toEqual(child.transform.localMatrix);
    expectVector(transformPoint(restored.root.children[0]!.transform.worldMatrix, [0, 0, 0]), [12, 8, 9]);

    const legacy = serializeScene(new Scene());
    expect(legacy.root.transform.pivot).toBeUndefined();
    expect(legacy.root.transform.localMatrix).toBeUndefined();
    const fromLegacy = deserializeScene(legacy);
    expect(fromLegacy.root.transform.pivot).toEqual([0, 0, 0]);
    expect(fromLegacy.root.transform.matrixAutoUpdate).toBe(true);
  });

  it("rejects invalid pivots without altering the current value", () => {
    const transform = new TransformNode().setPivot(1, 2, 3);
    expect(() => transform.setPivot(NaN, 0, 0)).toThrow(/finite/);
    expect(transform.pivot).toEqual([1, 2, 3]);
  });
});
