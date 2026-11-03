import { describe, expect, test, vi } from "vitest";
import { AnimationObjectGroup } from "../../../packages/animation/src/AnimationObjectGroup.js";
import { PropertyBinding, findNode, parseTrackName, sanitizeNodeName } from "../../../packages/animation/src/PropertyBinding.js";
import { SceneAnimationBridge, type SceneAnimationNode } from "../../../packages/animation/src/SceneAnimationBridge.js";
import { SceneNode } from "../../../packages/scene/src/SceneNode.js";
import { Object3D } from "../../../packages/scene/src/Object3D.js";

describe("native property paths", () => {
  test("resolves Unicode, escaped delimiters, quoted keys, indexed bones and morph names", () => {
    const bone = { name: "腕.左", position: [0, 0, 0] };
    const mesh = {
      name: "人.形/一",
      skeleton: { bones: [bone] },
      morphTargetDictionary: { "笑]顔": 1, "wink.right": 0 },
      morphTargetInfluences: [0, 0],
      "色.強度": 0
    };
    const root = { children: [mesh] };
    const boneBinding = new PropertyBinding(root, "人\\.形\\/一.bones[腕.左].position[y]");
    const morphBinding = new PropertyBinding(root, "人\\.形\\/一.morphTargetInfluences[笑\\]顔]");
    const quotedBinding = new PropertyBinding(root, '人\\.形\\/一.morphTargetInfluences["wink.right"]');
    const directBinding = new PropertyBinding(root, "人\\.形\\/一.色\\.強度");
    boneBinding.setValue(3);
    morphBinding.setValue(0.8);
    quotedBinding.setValue(0.4);
    directBinding.setValue(0.7);
    expect(bone.position).toEqual([0, 3, 0]);
    expect(mesh.morphTargetInfluences).toEqual([0.4, 0.8]);
    expect(mesh["色.強度"]).toBe(0.7);
    expect(parseTrackName("parent/人\\.形\\/一.色\\.強度")).toMatchObject({
      directoryName: "parent/", nodeName: "人.形/一", propertyName: "色.強度"
    });
    expect(sanitizeNodeName("人物\\手/左")).toBe("人物手左");
  });

  test("resolves materials, typed vectors and native class accessors without writing inherited data", () => {
    class Node {
      readonly isObject3D = true;
      readonly data = new Float32Array([1, 2, 3]);
      matrixWorldNeedsUpdate = false;
      get position() { return this.data; }
    }
    const node = new Node();
    const binding = new PropertyBinding(node as never, ".position");
    binding.setValue([4, 5, 6]);
    expect([...node.data]).toEqual([4, 5, 6]);
    expect(binding.getValue()).toEqual([4, 5, 6]);
    expect(node.matrixWorldNeedsUpdate).toBe(true);

    const material = { opacity: 1, isMaterial: true, needsUpdate: false };
    const materialBinding = new PropertyBinding({ material: [material] }, ".materials[0].opacity");
    materialBinding.setValue(0.25);
    expect(material.opacity).toBe(0.25);
    expect(material.needsUpdate).toBe(true);

    const inherited = Object.create({ hidden: 7 }) as { hidden: number };
    const badBinding = new PropertyBinding(inherited, ".hidden");
    badBinding.setValue(42);
    expect(badBinding.getValue()).toBeUndefined();
    expect(Object.hasOwn(inherited, "hidden")).toBe(false);
    expect(inherited.hidden).toBe(7);
    const accessorPrototype = { get inheritedAccessor() { return 3; } };
    const inheritedAccessor = Object.create(accessorPrototype) as { inheritedAccessor: number };
    const accessorBinding = new PropertyBinding(inheritedAccessor, ".inheritedAccessor");
    expect(accessorBinding.getValue()).toBeUndefined();
  });

  test("rejects prototype keys, including manually supplied parsed paths, and malformed accessors", () => {
    for (const path of [".__proto__", ".constructor", ".prototype", ".material[__proto__].opacity", ".weights[constructor]"]) {
      expect(() => parseTrackName(path)).toThrow(/Unsafe property path/);
    }
    expect(() => new PropertyBinding({}, "safe.value", { propertyName: "__proto__" })).toThrow(/Unsafe property path/);
    for (const path of ["", "node", ".value[]", ".value[broken", ".value[x]tail", ".value[[x]]", ".value\\"]) {
      expect(() => parseTrackName(path)).toThrow(/Cannot parse/);
    }
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test("missing nodes, missing keys and invalid indices stay inert and can bind after the target appears", () => {
    const root: { children: { name: string; weights: number[]; morphTargetInfluences: number[] }[] } = { children: [] };
    const deferred = new PropertyBinding(root, "face.weights[1]");
    deferred.setValue(8);
    expect(deferred.getValue()).toBeUndefined();
    const node = { name: "face", weights: [0, 0], morphTargetInfluences: [0, 0] };
    root.children.push(node);
    deferred.setValue(0.5);
    expect(node.weights).toEqual([0, 0.5]);
    new PropertyBinding(root, "face.weights[8]").setValue(4);
    new PropertyBinding(root, "face.weights[length]").setValue(4);
    new PropertyBinding(root, "face.morphTargetInfluences[missing]").setValue(4);
    new PropertyBinding(root, "face.morphTargetInfluences[1]").setValue(0.3);
    expect(node.weights).toEqual([0, 0.5]);
    expect(node.morphTargetInfluences).toEqual([0, 0.3]);
  });

  test("morph dictionaries may be supplied by a class method", () => {
    class Face {
      morphTargetInfluences = [0, 0];
      morphTargetDictionary() { return { smile: 1 }; }
    }
    const face = new Face();
    new PropertyBinding(face as never, ".morphTargetInfluences[smile]").setValue(0.7);
    expect(face.morphTargetInfluences).toEqual([0, 0.7]);
  });

  test("duplicate names resolve deterministically; UUIDs select a distinct duplicate and cycles terminate", () => {
    const a = { name: "leaf", uuid: "a", weight: 1 };
    const b = { name: "leaf", uuid: "b", weight: 2 };
    const root = { children: [a, b] };
    expect(findNode(root, "leaf")).toBe(a);
    new PropertyBinding(root, "b.weight").setValue(3);
    expect([a.weight, b.weight]).toEqual([1, 3]);
    const nameCollision = { name: "b", uuid: "c", weight: 10 };
    root.children.unshift(nameCollision);
    new PropertyBinding(root, "b.weight").setValue(5);
    expect([nameCollision.weight, b.weight]).toEqual([10, 5]);
    const cycle: { children?: unknown[] } = {};
    cycle.children = [cycle];
    expect(findNode(cycle as never, "missing")).toBeNull();
  });
});

describe("scene pivot tracks", () => {
  test("binding an object transform invalidates its cached matrix", () => {
    const node = new Object3D();
    node.updateWorldTransform();
    const binding = new PropertyBinding(node as never, ".position[x]");
    binding.setValue(6);
    expect(node.transform.isDirty()).toBe(true);
    node.updateWorldTransform();
    expect(node.transform.worldMatrix[12]).toBe(6);
  });

  test("whole and indexed tracks call the transform setter and update descendant world transforms", () => {
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    parent.addChild(child);
    parent.transform.setScale(2, 2, 2);
    child.transform.setPosition(5, 0, 0);
    parent.updateWorldTransform();
    expect(child.transform.worldMatrix[12]).toBe(10);

    const bridge = new SceneAnimationBridge();
    bridge.register("parent", parent as unknown as SceneAnimationNode);
    bridge.setAnimationValue("parent.pivot", [1, 0, 0]);
    parent.updateWorldTransform();
    expect(child.transform.worldMatrix[12]).toBe(9);
    bridge.setAnimationValue("parent.pivot[y]", 3);
    parent.updateWorldTransform();
    expect(parent.transform.pivot).toEqual([1, 3, 0]);
    expect(child.transform.worldMatrix[13]).toBe(-3);
    expect(() => bridge.setAnimationValue("parent.pivot[w]", 4)).toThrow(/Invalid index/);
  });

  test("a runtime handle receives all components, and generic paths ignore inherited data", () => {
    const setPivot = vi.fn();
    const handle = { pivot: [1, 2, 3] as [number, number, number], setPivot };
    const bridge = new SceneAnimationBridge();
    bridge.register("handle", handle);
    bridge.setAnimationValue("handle.pivot[z]", 7);
    expect(setPivot).toHaveBeenCalledWith(1, 2, 7);
    const inherited = Object.create({ unsafe: 1 }) as SceneAnimationNode;
    bridge.register("inherited", inherited);
    expect(() => bridge.setAnimationValue("inherited.unsafe", 3)).toThrow(/Unsupported scene animation property/);
    expect(Object.hasOwn(inherited, "unsafe")).toBe(false);
  });
});

describe("animation object group ownership", () => {
  test("remove, middle and final uncache, and re-add preserve exact member bindings", () => {
    const a = { uuid: "a", value: 0 };
    const b = { uuid: "b", value: 0 };
    const c = { uuid: "c", value: 0 };
    const group = new AnimationObjectGroup(a, b, c, b);
    const binding = PropertyBinding.create(group, ".value");
    expect(group.stats.objects.total).toBe(3);
    group.remove(a, b);
    binding.setValue(1);
    expect([a.value, b.value, c.value]).toEqual([0, 0, 1]);
    group.uncache(b, c);
    group.add(b);
    binding.setValue(2);
    expect([a.value, b.value, c.value]).toEqual([0, 2, 1]);
    group.add(a);
    binding.setValue(3);
    expect([a.value, b.value, c.value]).toEqual([3, 3, 1]);
    group.uncache(a, b);
    expect(group.stats.objects).toMatchObject({ total: 0, inUse: 0 });
    group.add(c);
    binding.setValue(4);
    expect([a.value, b.value, c.value]).toEqual([3, 3, 4]);
  });

  test("path unsubscription never redirects a stale composite, including with cached members", () => {
    const node = { a: 0, b: 0, c: 0 };
    const cached = { a: 0, b: 0, c: 0 };
    const group = new AnimationObjectGroup(node, cached);
    const a = PropertyBinding.create(group, ".a");
    const staleB = PropertyBinding.create(group, ".b");
    const c = PropertyBinding.create(group, ".c");
    group.remove(cached);
    group.unsubscribe_(".b");
    const freshB = PropertyBinding.create(group, ".b");
    staleB.bind();
    staleB.setValue(99);
    staleB.unbind();
    a.setValue(1);
    c.setValue(2);
    freshB.setValue(3);
    expect(node).toEqual({ a: 1, b: 3, c: 2 });
    expect(cached).toEqual({ a: 0, b: 0, c: 0 });
    expect(group.stats.bindingsPerObject).toBe(3);
  });

  test("a path cannot reuse a different parsed selector or register an unsafe empty subscription", () => {
    const group = new AnimationObjectGroup();
    expect(() => group.subscribe_("safe", { propertyName: "__proto__" })).toThrow(/Unsafe property path/);
    expect(group.stats.bindingsPerObject).toBe(0);
    const node = { first: 0, second: 0 };
    group.add(node);
    const binding = PropertyBinding.create(group, ".first");
    expect(() => PropertyBinding.create(group, ".first", { propertyName: "second" })).toThrow(/Conflicting parsed path/);
    binding.setValue(4);
    expect(node).toEqual({ first: 4, second: 0 });
  });

  test("mutating a caller-owned selector cannot redirect existing or later members", () => {
    const selector = { propertyName: "first" };
    const first = { first: 0, second: 0 };
    const second = { first: 0, second: 0 };
    const group = new AnimationObjectGroup(first);
    const binding = PropertyBinding.create(group, ".first", selector);
    selector.propertyName = "second";
    group.add(second);
    binding.setValue(9);
    expect([first.first, first.second, second.first, second.second]).toEqual([9, 0, 9, 0]);
  });

  test("duplicate UUIDs cannot replace or remove the owner, and disposal releases all handles", () => {
    const first = { uuid: "same", value: 0 };
    const collision = { uuid: "same", value: 0 };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const group = new AnimationObjectGroup(first, collision);
      const binding = PropertyBinding.create(group, ".value");
      group.remove(collision);
      group.uncache(collision);
      binding.setValue(2);
      expect([first.value, collision.value]).toEqual([2, 0]);
      expect(group.stats.objects.total).toBe(1);
      group.dispose();
      group.dispose();
      binding.setValue(8);
      expect(first.value).toBe(2);
      expect(group.stats.objects.total).toBe(0);
      expect(() => group.add(first)).toThrow(/disposed/);
      expect(() => group.subscribe_(".value")).toThrow(/disposed/);
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  test("composite reads the first available target when an earlier member lacks the property", () => {
    const group = new AnimationObjectGroup({ name: "missing" }, { value: 4 });
    const binding = PropertyBinding.create(group, ".value");
    expect(binding.getValue()).toBe(4);
  });
});
