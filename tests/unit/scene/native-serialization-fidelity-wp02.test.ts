import {
  Bounds3,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  Renderable,
  Scene,
  SceneNode,
  SkinnedMesh,
  deserializeScene,
  deserializeSceneAsync,
  serializeScene,
  type SceneSerializationAdapter,
  type SerializedScene
} from "@aura3d/scene";
import { AnimationClip, AnimationMixer, AnimationTrack, type AnimationAction, type AnimationActionSnapshot } from "@aura3d/animation";
import { describe, expect, it } from "vitest";

function asJson(scene: Scene): SerializedScene {
  return JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
}

const identity = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

describe("native scene serialization fidelity", () => {
  it("retains public object subtypes, child order, registry identity and world transforms through JSON", () => {
    const scene = new Scene();
    const group = scene.createGroup({ id: "group", name: "group" });
    const object = scene.createObject3D({ id: "object", name: "object" });
    const mesh = scene.createMesh({ id: "mesh", name: "mesh", renderable: { geometry: "g", material: "m" } });
    const skin = scene.createSkinnedMesh({ id: "skin", name: "skin", renderable: { geometry: "sg", material: "sm" } });
    const instances = scene.createInstancedMesh({
      id: "instances",
      name: "instances",
      renderable: { geometry: "ig", material: "im", instanceTransforms: identity, instanceColors: [1, 0.5, 0, 1] }
    });
    const plain = new SceneNode({ id: "plain", name: "plain" });
    scene.root.transform.setPosition(7, 0, 0);
    group.transform.setPosition(2, 3, 0).setPivot(1, 0, 0);
    mesh.transform.setPosition(0, 0, 4);
    scene.root.addChild(group);
    group.addChild(object).addChild(skin).addChild(instances).addChild(plain);
    object.addChild(mesh);
    scene.registerSubtree(plain);
    scene.updateWorldTransforms();
    const expectedWorld = [...mesh.transform.worldMatrix];

    const serialized = asJson(scene);
    expect(serialized.root.children[0]!.kind).toBe("node");
    const restored = deserializeScene(serialized);
    restored.updateWorldTransforms();

    const restoredGroup = restored.getNodeById("group");
    const restoredObject = restored.getNodeById("object");
    const restoredMesh = restored.getNodeById("mesh");
    const restoredSkin = restored.getNodeById("skin");
    const restoredInstances = restored.getNodeById("instances");
    const restoredPlain = restored.getNodeById("plain");
    expect(restoredGroup).toBeInstanceOf(Group);
    expect(restoredObject).toBeInstanceOf(Object3D);
    expect(restoredObject).not.toBeInstanceOf(Group);
    expect(restoredMesh).toBeInstanceOf(Mesh);
    expect(restoredSkin).toBeInstanceOf(SkinnedMesh);
    expect(restoredInstances).toBeInstanceOf(InstancedMesh);
    expect(restoredPlain?.constructor).toBe(SceneNode);
    expect(restoredGroup?.children.map((child) => child.id)).toEqual(["object", "skin", "instances", "plain"]);
    expect(restoredObject?.parent).toBe(restoredGroup);
    expect(restoredMesh?.parent).toBe(restoredObject);
    expect(restoredMesh?.transform.worldMatrix).toEqual(expectedWorld);
    expect(Array.from((restoredInstances as InstancedMesh).instanceTransforms!)).toEqual(identity);
    expect(asJson(restored)).toEqual(serialized);
  });

  it("preserves root and child data, bounds, draw settings and root renderables without sharing objects", () => {
    const scene = new Scene();
    const node = scene.createNode("child");
    scene.root.name = "authored-root";
    scene.root.userData = { annotation: { labels: ["one", "two"], enabled: true, nullable: null } };
    scene.root.renderOrder = 4;
    scene.root.frustumCulled = false;
    scene.root.setLocalBounds(new Bounds3([-2, -1, 0], [2, 1, 3]));
    scene.root.renderable = new Renderable({ geometry: "root-geometry", material: "root-material", morphWeights: [0.25] });
    node.userData = { nested: { value: 42 }, list: [false, 7, "x"] };
    node.renderOrder = -3;
    node.frustumCulled = false;
    node.setLocalBounds(new Bounds3([-1, -2, -3], [3, 2, 1]));
    scene.root.addChild(node);
    const rootData = scene.root.userData.annotation as { labels: string[] };
    const childData = node.userData.nested as { value: number };

    const serialized = serializeScene(scene);
    rootData.labels.push("source-only");
    childData.value = 99;
    const document = JSON.parse(JSON.stringify(serialized)) as SerializedScene;
    const restored = deserializeScene(document);
    const restoredChild = restored.getNodeById(node.id)!;
    expect(restored.root.name).toBe("authored-root");
    expect(restored.root.userData).toEqual({ annotation: { labels: ["one", "two"], enabled: true, nullable: null } });
    expect(restored.root.renderOrder).toBe(4);
    expect(restored.root.frustumCulled).toBe(false);
    expect(restored.root.localBounds).toEqual(new Bounds3([-2, -1, 0], [2, 1, 3]));
    expect(restored.root.renderable).toMatchObject({ geometry: "root-geometry", material: "root-material", morphWeights: [0.25] });
    expect(restoredChild.userData).toEqual({ nested: { value: 42 }, list: [false, 7, "x"] });
    expect(restoredChild.renderOrder).toBe(-3);
    expect(restoredChild.frustumCulled).toBe(false);
    expect(restoredChild.localBounds).toEqual(new Bounds3([-1, -2, -3], [3, 2, 1]));
    (restoredChild.userData.nested as { value: number }).value = -1;
    restoredChild.localBounds!.min[0] = -10;
    expect(childData.value).toBe(99);
    expect(node.localBounds!.min[0]).toBe(-1);
    expect((document.root.children[0] as unknown as { userData: { nested: { value: number } } }).userData.nested.value).toBe(42);
  });

  it("round-trips empty local bounds without turning infinities into JSON nulls", () => {
    const scene = new Scene();
    const child = scene.createNode("empty-bounds");
    child.setLocalBounds(new Bounds3());
    scene.root.addChild(child);
    const restored = deserializeScene(asJson(scene)).getNodeById(child.id)!;
    expect(restored.localBounds).toBeInstanceOf(Bounds3);
    expect(restored.localBounds?.isEmpty()).toBe(true);
    expect(restored.localBounds?.min).toEqual([Infinity, Infinity, Infinity]);
    expect(restored.localBounds?.max).toEqual([-Infinity, -Infinity, -Infinity]);
  });

  it("rejects cycles, inconsistent hierarchy links and duplicate node IDs before producing a document", () => {
    const cyclic = new Scene();
    const child = cyclic.createNode("child");
    cyclic.root.addChild(child);
    child.children.push(cyclic.root);
    expect(() => serializeScene(cyclic)).toThrow(/hierarchy/i);

    const inconsistent = new Scene();
    inconsistent.root.children.push(new SceneNode({ id: "orphan" }));
    expect(() => serializeScene(inconsistent)).toThrow(/hierarchy/i);

    const duplicate = new Scene();
    duplicate.root.addChild(new SceneNode({ id: "same" })).addChild(new SceneNode({ id: "same" }));
    expect(() => serializeScene(duplicate)).toThrow(/duplicate/i);
  });

  it("rejects cyclic document references and root identities that cannot be represented by Scene", () => {
    const scene = new Scene();
    const child = scene.createNode("child");
    scene.root.addChild(child);
    const cyclic = asJson(scene);
    cyclic.root.children[0]!.children.push(cyclic.root);
    expect(() => deserializeScene(cyclic)).toThrow(/hierarchy/i);

    const invalidRoot = asJson(scene);
    invalidRoot.root.id = "not-root";
    expect(() => deserializeScene(invalidRoot)).toThrow(/root/i);
    invalidRoot.root.id = "root";
    invalidRoot.root.objectType = "group";
    expect(() => deserializeScene(invalidRoot)).toThrow(/root/i);
  });

  it("preserves skinning palettes on both skinned meshes and ordinary renderable nodes", () => {
    const scene = new Scene();
    const palette = new Float32Array([...identity, ...identity]);
    palette[1] = -0;
    palette[28] = 3.5;
    const skinning = { jointCount: 2, matrices: palette };
    const mesh = scene.createSkinnedMesh({
      id: "skinned",
      renderable: { geometry: "skin-geometry", material: "skin-material", skinning, morphWeights: [0.125, 0.75] }
    });
    const generic = scene.createNode("generic");
    generic.renderable = new Renderable({ geometry: "generic-geometry", material: "generic-material", skinning });
    scene.root.addChild(mesh).addChild(generic);
    const expected = Array.from(mesh.skinning!.matrices);
    const serialized = serializeScene(scene);
    expect(serialized.root.children[0]!.renderable!.skinning!.matrices.every((value) => typeof value === "number")).toBe(true);
    mesh.skinning!.matrices[0] = 17;
    generic.renderable!.skinning!.matrices[1] = 9;

    const restored = deserializeScene(JSON.parse(JSON.stringify(serialized)) as SerializedScene);
    const restoredMesh = restored.getNodeById("skinned") as SkinnedMesh;
    const restoredGeneric = restored.getNodeById(generic.id)!;
    expect(restoredMesh).toBeInstanceOf(SkinnedMesh);
    expect(restoredMesh.skinning?.jointCount).toBe(2);
    expect(restoredMesh.skinning?.matrices).toBeInstanceOf(Float32Array);
    expect(Array.from(restoredMesh.skinning!.matrices)).toEqual(expected);
    expect(restoredMesh.renderable?.morphWeights).toEqual([0.125, 0.75]);
    expect(Array.from(restoredGeneric.renderable!.skinning!.matrices)).toEqual(expected);
    restoredMesh.skinning!.matrices[2] = 55;
    expect(restoredGeneric.renderable!.skinning!.matrices[2]).toBe(expected[2]);
    expect(mesh.skinning!.matrices[2]).toBe(expected[2]);
  });

  it("retains explicitly authored JSON rig and mixer metadata without inventing a live binding", () => {
    const scene = new Scene();
    scene.root.userData.gltfSceneContainer = true;
    const jointA = scene.createGroup({ id: "joint-a", name: "joint" });
    const jointB = scene.createGroup({ id: "joint-b", name: "joint" });
    jointA.userData.gltfNodeIndex = 4;
    jointB.userData.gltfNodeIndex = 9;
    jointA.addChild(jointB);
    const mesh = scene.createSkinnedMesh({
      id: "mesh",
      renderable: {
        geometry: "g", material: "m",
        skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...identity]) }
      }
    });
    scene.root.addChild(jointA).addChild(mesh);
    const clip = new AnimationClip({
      name: "move", duration: 2,
      tracks: [new AnimationTrack({
        target: "joint.translation", valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 2, value: [2, 0, 0] }]
      })]
    });
    const mixer = new AnimationMixer({
      setAnimationValue: (target, value) => {
        if (target === "joint.translation" && Array.isArray(value)) {
          jointB.transform.setPosition(value[0]!, value[1]!, value[2]!);
        }
      }
    });
    mixer.play(clip).setWeight(0.75);
    mixer.update(0.5);
    const metadata = {
      jointNodeIds: [jointA.id, jointB.id],
      jointNodeIndices: [4, 9],
      inverseBindMatrices: [[...identity], identity.map((value, index) => index === 12 ? -3 : value)],
      clipNames: [clip.name],
      mixerSnapshot: mixer.snapshot()
    };
    mesh.userData = { authoredRig: metadata };

    const document = asJson(scene);
    const restored = deserializeScene(document);
    const restoredMesh = restored.getNodeById(mesh.id) as SkinnedMesh;
    expect(restored.root.userData.gltfSceneContainer).toBe(true);
    expect(restored.getNodeById(jointA.id)?.userData.gltfNodeIndex).toBe(4);
    expect(restored.getNodeById(jointB.id)?.userData.gltfNodeIndex).toBe(9);
    expect(restoredMesh.userData.authoredRig).toEqual(metadata);
    expect(restoredMesh.userData.authoredRig).not.toBe(metadata);
    expect((restoredMesh.userData.authoredRig as typeof metadata).mixerSnapshot.actions[0]?.time).toBe(0.5);
    expect("skeletonBinding" in restoredMesh).toBe(false);
    expect("animationMixer" in restoredMesh).toBe(false);
    mixer.update(0.5);
    expect(jointB.transform.position[0]).toBe(1);
    expect(restored.getNodeById(jointB.id)!.transform.position[0]).toBe(0.5);
    (restoredMesh.userData.authoredRig as typeof metadata).inverseBindMatrices[1]![12] = 10;
    expect(metadata.inverseBindMatrices[1]![12]).toBe(-3);
    expect(asJson(deserializeScene(document))).toEqual(document);
    mixer.dispose();
  });

  it("copies an active palette without retaining its cyclic, runtime-owned cache key", () => {
    const scene = new Scene();
    const mesh = scene.createSkinnedMesh({
      id: "mesh",
      renderable: { geometry: "g", material: "m", skinning: { jointCount: 1, matrices: new Float32Array(identity) } }
    });
    scene.root.addChild(mesh);
    const key: { self?: unknown } = {};
    key.self = key;
    (mesh.skinning as unknown as { paletteKey: object }).paletteKey = key;
    const document = asJson(scene);
    expect(document.root.children[0]!.renderable!.skinning).not.toHaveProperty("paletteKey");
    const restored = deserializeScene(document).getNodeById(mesh.id) as SkinnedMesh;
    expect(Array.from(restored.skinning!.matrices)).toEqual(identity);
    expect(restored.skinning).not.toHaveProperty("paletteKey");
    expect(restored.skinning!.matrices).not.toBe(mesh.skinning!.matrices);
  });

  it.each([
    ["scene", "mixerState"],
    ["node", "jointNodeIndices"],
    ["node", "inverseBindMatrices"],
    ["node", "clipNames"],
    ["node", "rigSnapshot"],
    ["renderable", "skeletonBinding"],
    ["renderable", "clipIds"],
    ["palette", "jointNodeIndices"],
    ["palette", "inverseBindMatrices"],
    ["palette", "mixerState"],
    ["palette", "negativeZero"]
  ] as const)("rejects unsupported %s.%s state instead of dropping it from a scene", (target, field) => {
    const scene = new Scene();
    const mesh = scene.createSkinnedMesh({
      id: "mesh",
      renderable: { geometry: "g", material: "m", skinning: { jointCount: 1, matrices: new Float32Array(identity) } }
    });
    scene.root.addChild(mesh);
    const owner = target === "scene" ? scene : target === "node" ? mesh : target === "renderable" ? mesh.renderable! : mesh.skinning!;
    (owner as unknown as Record<string, unknown>)[field] = { required: true };

    let error: unknown;
    try { serializeScene(scene); } catch (caught) { error = caught; }
    expect(error).toMatchObject({
      code: expect.stringMatching(/^VALIDATION_SCENE_/),
      message: expect.stringContaining(field)
    });
  });

  it.each([
    ["scene", "mixerState"],
    ["node", "jointNodeIndices"],
    ["node", "inverseBindMatrices"],
    ["node", "clipNames"],
    ["node", "rigSnapshot"],
    ["renderable", "skeletonBinding"],
    ["renderable", "clipIds"],
    ["palette", "jointNodeIndices"],
    ["palette", "inverseBindMatrices"],
    ["palette", "mixerState"],
    ["palette", "paletteKey"]
  ] as const)("rejects unsupported serialized %s.%s state instead of dropping it", (target, field) => {
    const scene = new Scene();
    const mesh = scene.createSkinnedMesh({
      id: "mesh",
      renderable: { geometry: "g", material: "m", skinning: { jointCount: 1, matrices: new Float32Array(identity) } }
    });
    scene.root.addChild(mesh);
    const document = asJson(scene);
    const node = document.root.children[0]!;
    const owner = target === "scene" ? document : target === "node" ? node : target === "renderable" ? node.renderable! : node.renderable!.skinning!;
    (owner as unknown as Record<string, unknown>)[field] = { required: true };

    let error: unknown;
    try { deserializeScene(document); } catch (caught) { error = caught; }
    expect(error).toMatchObject({
      code: expect.stringMatching(/^VALIDATION_SCENE_/),
      message: expect.stringContaining(field)
    });
  });

  it("rejects unsupported binding accessors without executing them", () => {
    const scene = new Scene();
    const mesh = scene.createSkinnedMesh({
      id: "mesh",
      renderable: { geometry: "g", material: "m", skinning: { jointCount: 1, matrices: new Float32Array(identity) } }
    });
    scene.root.addChild(mesh);
    let reads = 0;
    Object.defineProperty(mesh.skinning!, "externalRig", {
      get() { reads += 1; return {}; }
    });
    expect(() => serializeScene(scene)).toThrow(/externalRig/);
    expect(reads).toBe(0);
  });

  it("retains a shared renderable and its mutable state across different node subtypes", () => {
    const scene = new Scene();
    const shared = new Renderable({
      geometry: "shared-geometry",
      material: "shared-material",
      morphWeights: [0.25],
      skinning: { jointCount: 1, matrices: new Float32Array(identity) }
    });
    const first = scene.createMesh({ id: "first", renderable: shared });
    const second = scene.createSkinnedMesh({ id: "second", renderable: shared });
    scene.root.addChild(first).addChild(second);

    const document = asJson(scene);
    const restored = deserializeScene(document);
    const restoredFirst = restored.getNodeById("first") as Mesh;
    const restoredSecond = restored.getNodeById("second") as SkinnedMesh;
    expect(restoredFirst.renderable).toBe(restoredSecond.renderable);
    expect(restoredFirst.renderable).not.toBe(shared);
    restoredFirst.renderable!.morphWeights[0] = 0.75;
    expect(restoredSecond.renderable!.morphWeights[0]).toBe(0.75);
    expect(shared.morphWeights[0]).toBe(0.25);
    expect(asJson(deserializeScene(document))).toEqual(document);
  });

  it("preserves negative zero in morph weights and instance data through JSON", () => {
    const scene = new Scene();
    const transforms = [...identity];
    transforms[1] = -0;
    const node = scene.createInstancedMesh({
      id: "signed-zeros",
      renderable: {
        geometry: "g",
        material: "m",
        morphWeights: [-0, 0.5],
        instanceTransforms: transforms,
        instanceColors: [1, -0, 0, 1]
      }
    });
    scene.root.addChild(node);
    const restored = deserializeScene(asJson(scene)).getNodeById(node.id) as InstancedMesh;
    expect(Object.is(restored.renderable!.morphWeights[0], -0)).toBe(true);
    expect(Object.is(restored.instanceTransforms![1], -0)).toBe(true);
    expect(Object.is(restored.instanceColors![1], -0)).toBe(true);
  });

  it("reads old version-1 node data without inventing object subtypes or new non-default state", () => {
    const legacy: SerializedScene = {
      version: 1,
      root: {
        id: "root", name: "root", visible: true, layerMask: 1, kind: "node",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        children: [{
          id: "legacy", name: "legacy", visible: true, layerMask: 1, kind: "node",
          transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          renderable: { geometry: "legacy-g", material: "legacy-m", layerMask: 1, castShadow: true, receiveShadow: true },
          children: []
        }]
      }
    };
    const restored = deserializeScene(legacy);
    const child = restored.getNodeById("legacy")!;
    expect(child.constructor).toBe(SceneNode);
    expect(child.userData).toEqual({});
    expect(child.renderOrder).toBe(0);
    expect(child.frustumCulled).toBe(true);
    expect(child.localBounds).toBeNull();
    expect(child.transform.pivot).toEqual([0, 0, 0]);
    expect(child.renderable?.skinning).toBeUndefined();
    expect(asJson(restored)).toEqual(legacy);
  });

  it("retains exact authored quaternion values and transform negative zeros through JSON", () => {
    const scene = new Scene();
    const node = scene.createNode("precise-transform");
    node.transform.setPosition(-0, 2, 3);
    node.transform.setRotation(0.1, 0.2, 0.3, 0.4);
    node.transform.setScale(1, -0, 3);
    node.transform.setPivot(-0, 0, 0);
    scene.root.addChild(node);
    const originalRotation = [...node.transform.rotation];
    const document = asJson(scene);
    const restored = deserializeScene(document).getNodeById(node.id)!;
    expect(restored.transform.rotation).toEqual(originalRotation);
    expect(Object.is(restored.transform.position[0], -0)).toBe(true);
    expect(Object.is(restored.transform.scale[1], -0)).toBe(true);
    expect(Object.is(restored.transform.pivot[0], -0)).toBe(true);
    expect(asJson(deserializeScene(document))).toEqual(document);
  });

  it("keeps legacy quaternion normalization when the exact authored-value marker is absent", () => {
    const scene = new Scene();
    const node = scene.createNode("legacy-rotation");
    scene.root.addChild(node);
    const document = asJson(scene);
    document.root.children[0]!.transform.rotation = [0, 0, 0, 2];
    const restored = deserializeScene(document).getNodeById(node.id)!;
    expect(restored.transform.rotation).toEqual([0, 0, 0, 1]);
  });

  it.each(["position", "rotation", "scale", "pivot"] as const)(
    "rejects non-finite %s coordinates before JSON corrupts the transform",
    (field) => {
      const scene = new Scene();
      const node = scene.createNode("invalid-transform");
      node.transform[field][0] = NaN;
      scene.root.addChild(node);
      expect(() => serializeScene(scene)).toThrow(/transform/i);
    }
  );

  it.each([
    ["undefined", () => ({ value: undefined })],
    ["function", () => ({ value: () => 1 })],
    ["bigint", () => ({ value: 1n })],
    ["non-finite number", () => ({ value: NaN })],
    ["date", () => ({ value: new Date(0) })],
    ["typed array", () => ({ value: new Uint8Array([1, 2]) })],
    ["node reference", () => ({ value: new SceneNode({ name: "referenced" }) })],
    ["cycle", () => { const value: Record<string, unknown> = {}; value.self = value; return value; }],
    ["shared reference", () => { const value = { enabled: true }; return { first: value, second: value }; }],
    ["negative zero", () => ({ value: -0 })],
    ["sparse array", () => ({ value: Array(2) })]
  ])("rejects unsupported %s userData rather than silently losing it in JSON", (_label, makeData) => {
    const scene = new Scene();
    const child = scene.createNode("unsupported");
    child.userData = makeData();
    scene.root.addChild(child);
    expect(() => serializeScene(scene)).toThrow(/userData/i);
  });

  it("preserves a userData __proto__ key without mutating object prototypes", () => {
    const scene = new Scene();
    scene.root.userData = JSON.parse('{"__proto__":{"visible":false},"constructor":"authored"}');
    const restored = deserializeScene(asJson(scene));
    expect(Object.getPrototypeOf(restored.root.userData)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(restored.root.userData, "__proto__")).toBe(true);
    expect(restored.root.userData.__proto__).toEqual({ visible: false });
    expect(restored.root.userData.constructor).toBe("authored");
    expect(({} as { visible?: boolean }).visible).toBeUndefined();
  });

  it("rejects unknown object types and invalid userData supplied in a document", () => {
    const scene = new Scene();
    const child = scene.createGroup({ id: "child" });
    scene.root.addChild(child);
    const document = asJson(scene) as unknown as { root: { children: Array<{ objectType: unknown; userData: unknown }> } };
    document.root.children[0]!.objectType = "unrecognized";
    expect(() => deserializeScene(document as unknown as SerializedScene)).toThrow(/object type/i);
    document.root.children[0]!.objectType = "group";
    document.root.children[0]!.userData = { bad: undefined };
    expect(() => deserializeScene(document as unknown as SerializedScene)).toThrow(/userData/i);

    const unknownKind = asJson(scene) as unknown as { root: { children: Array<{ kind: unknown; objectType?: unknown }> } };
    unknownKind.root.children[0]!.kind = "unrecognized";
    delete unknownKind.root.children[0]!.objectType;
    expect(() => deserializeScene(unknownKind as unknown as SerializedScene)).toThrow(/kind/i);
  });

  it("reports unsupported custom node types and render callbacks instead of dropping behavior", () => {
    class CustomNode extends SceneNode {}
    const custom = new Scene();
    custom.root.addChild(new CustomNode({ name: "custom" }));
    expect(() => serializeScene(custom)).toThrow(/custom.*node/i);

    const callbacks = new Scene();
    const node = callbacks.createNode("callback");
    node.onBeforeRender = () => {};
    callbacks.root.addChild(node);
    expect(() => serializeScene(callbacks)).toThrow(/onBeforeRender/i);
  });

  it("rejects inconsistent repeated renderable identities and malformed signed-zero markers", () => {
    const scene = new Scene();
    const shared = new Renderable({ geometry: "g", material: "m", morphWeights: [-0] });
    scene.root.addChild(scene.createMesh({ id: "one", renderable: shared }));
    scene.root.addChild(scene.createMesh({ id: "two", renderable: shared }));
    const conflicting = asJson(scene);
    conflicting.root.children[1]!.renderable!.material = "different";
    expect(() => deserializeScene(conflicting)).toThrow(/conflicting/i);

    const invalidMarker = asJson(scene);
    invalidMarker.root.children[0]!.renderable!.negativeZero = { morphWeights: [3] };
    expect(() => deserializeScene(invalidMarker)).toThrow(/negativeZero/i);
  });

  it("rejects invalid skinning palettes instead of emitting corrupt data", () => {
    const scene = new Scene();
    const mesh = scene.createSkinnedMesh({
      id: "skin",
      renderable: { geometry: "g", material: "m", skinning: { jointCount: 1, matrices: new Float32Array(identity) } }
    });
    scene.root.addChild(mesh);
    const document = asJson(scene) as unknown as { root: { children: Array<{ renderable: { skinning: { jointCount: number; matrices: unknown[] } } }> } };
    mesh.skinning!.matrices[0] = NaN;
    expect(() => serializeScene(scene)).toThrow(/skinning/i);

    document.root.children[0]!.renderable.skinning.matrices[0] = null;
    expect(() => deserializeScene(document as unknown as SerializedScene)).toThrow(/skinning/i);
    document.root.children[0]!.renderable.skinning.matrices[0] = 1e100;
    expect(() => deserializeScene(document as unknown as SerializedScene)).toThrow(/skinning/i);
    document.root.children[0]!.renderable.skinning.matrices[0] = 1;
    document.root.children[0]!.renderable.skinning.jointCount = 0;
    expect(() => deserializeScene(document as unknown as SerializedScene)).toThrow(/skinning/i);
  });
});

describe("caller-owned scene serialization adapters", () => {
  function adapter(id: string, nodeIds = ["root"], assetIds: string[] = []): SceneSerializationAdapter {
    return {
      id,
      version: 1,
      capture: () => ({ nodeIds: [...nodeIds], assetIds: [...assetIds], payload: { label: id } }),
      restore: () => undefined
    };
  }

  function jsonCopy(document: SerializedScene): SerializedScene {
    return JSON.parse(JSON.stringify(document)) as SerializedScene;
  }

  it("round-trips a test-owned animated rig via asset and node IDs without sharing its runtime", async () => {
    const source = new Scene();
    const joint = source.createGroup({ id: "joint" });
    const mesh = source.createSkinnedMesh({
      id: "mesh",
      renderable: { geometry: "g", material: "m", skinning: { jointCount: 1, matrices: new Float32Array(identity) } }
    });
    source.root.addChild(joint).addChild(mesh);
    source.metadata.registerAsset({ id: "asset:rig", uri: "/rig.glb", digest: "test-digest", nodeIds: ["joint", "mesh"] });
    const clip = new AnimationClip({
      name: "move", duration: 2,
      tracks: [new AnimationTrack({
        target: "joint.translation", valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 2, value: [2, 0, 0] }]
      })]
    });
    type TestRig = { mixer: AnimationMixer; action: AnimationAction };
    const runtimes = new WeakMap<Scene, TestRig>();
    const bind = (targetJoint: SceneNode, targetMesh: SkinnedMesh): AnimationMixer => new AnimationMixer({
      setAnimationValue: (target, value) => {
        if (target === "joint.translation" && Array.isArray(value)) {
          targetJoint.transform.setPosition(value[0]!, value[1]!, value[2]!);
          targetMesh.skinning!.matrices[12] = value[0]!;
        }
      }
    });
    const sourceMixer = bind(joint, mesh);
    const sourceAction = sourceMixer.play(clip).setWeight(0.75);
    sourceMixer.update(0.5);
    runtimes.set(source, { mixer: sourceMixer, action: sourceAction });
    let restoredRuntime: TestRig | undefined;
    const testAdapter: SceneSerializationAdapter = {
      id: "test.rig",
      version: 1,
      capture(context) {
        const runtime = runtimes.get(context.scene);
        if (!runtime) return undefined;
        expect(context.getNode("joint")).toBe(context.scene.getNodeById("joint"));
        return {
          nodeIds: ["joint", "mesh"],
          assetIds: ["asset:rig"],
          payload: {
            jointId: "joint",
            meshId: "mesh",
            action: JSON.parse(JSON.stringify(runtime.action.serialize()))
          }
        };
      },
      async restore(context, payload) {
        const data = payload as { jointId: string; meshId: string; action: unknown };
        const asset = context.getAsset("asset:rig") as { clip?: unknown };
        if (!(asset.clip instanceof AnimationClip)) throw new Error("invalid test rig asset");
        const restoredJoint = context.getNode(data.jointId);
        const restoredMesh = context.getNode(data.meshId) as SkinnedMesh;
        const mixer = bind(restoredJoint, restoredMesh);
        context.deferDispose(() => {
          runtimes.delete(context.scene);
          mixer.dispose();
        });
        const action = mixer.play(asset.clip).restore(data.action as AnimationActionSnapshot);
        restoredRuntime = { mixer, action };
        runtimes.set(context.scene, restoredRuntime);
        return restoredRuntime;
      }
    };
    const document = jsonCopy(serializeScene(source, { adapters: [testAdapter] }));
    expect(document.version).toBe(3);
    expect(document.extensions).toMatchObject([{ id: "test.rig", version: 1, nodeIds: ["joint", "mesh"], assetIds: ["asset:rig"] }]);
    expect(() => deserializeScene(document)).toThrow(/deserializeSceneAsync/i);

    const resolvedIds: string[] = [];
    const owner = await deserializeSceneAsync(document, {
      adapters: [testAdapter],
      resolveAsset: async (asset) => {
        resolvedIds.push(asset.id);
        expect(asset.digest).toBe("test-digest");
        return { clip };
      }
    });
    expect(resolvedIds).toEqual(["asset:rig"]);
    expect(owner.extensions.get("test.rig")).toBe(restoredRuntime);
    expect(jsonCopy(serializeScene(owner.scene, { adapters: [testAdapter] }))).toEqual(document);
    expect(restoredRuntime!.action.time).toBeCloseTo(0.5);
    restoredRuntime!.mixer.update(0.25);
    expect(owner.scene.getNodeById("joint")!.transform.position[0]).toBeCloseTo(0.75);
    expect((owner.scene.getNodeById("mesh") as SkinnedMesh).skinning!.matrices[12]).toBeCloseTo(0.75);
    expect(joint.transform.position[0]).toBeCloseTo(0.5);
    expect(mesh.skinning!.matrices[12]).toBeCloseTo(0.5);
    sourceMixer.update(0.5);
    expect(joint.transform.position[0]).toBeCloseTo(1);
    expect(owner.scene.getNodeById("joint")!.transform.position[0]).toBeCloseTo(0.75);

    const restoredJoint = owner.scene.getNodeById("joint")!;
    await owner.dispose();
    expect(restoredJoint.disposed).toBe(true);
    expect(owner.extensions.size).toBe(0);
    expect(() => restoredRuntime!.mixer.update(0.1)).toThrow(/disposed/i);
    expect(joint.disposed).toBe(false);
    sourceMixer.dispose();
  });

  it("keeps version-1 and version-2 snapshots compatible, including omitted captures", async () => {
    const v1 = new Scene();
    v1.root.addChild(v1.createGroup({ id: "child" }));
    const absent: SceneSerializationAdapter = { ...adapter("absent"), capture: () => undefined };
    const first = jsonCopy(serializeScene(v1, { adapters: [absent] }));
    expect(first.version).toBe(1);
    expect(first.extensions).toBeUndefined();
    expect(deserializeScene(first).getNodeById("child")).toBeInstanceOf(Group);
    const firstOwner = await deserializeSceneAsync(first);
    expect(firstOwner.scene.getNodeById("child")).toBeInstanceOf(Group);
    await firstOwner.dispose();

    const v2 = new Scene();
    const detached = v2.createGroup({ id: "detached" });
    const second = jsonCopy(serializeScene(v2));
    expect(second.version).toBe(2);
    expect(deserializeScene(second).getNodeById("detached")).toBeDefined();
    const secondOwner = await deserializeSceneAsync(second);
    expect(secondOwner.scene.getNodeById("detached")?.parent).toBeNull();
    await secondOwner.dispose();
    expect(detached.disposed).toBe(false);
  });

  it("preflights missing, mismatched and duplicate handlers before invoking any callback", async () => {
    const scene = new Scene();
    const rig = adapter("rig");
    const document = jsonCopy(serializeScene(scene, { adapters: [rig] }));
    let calls = 0;
    const unexpected: SceneSerializationAdapter = { ...rig, restore: () => { calls += 1; } };
    await expect(deserializeSceneAsync(document)).rejects.toThrow(/matching adapter/i);
    await expect(deserializeSceneAsync(document, { adapters: [{ ...unexpected, version: 2 }] })).rejects.toThrow(/rig@1/i);
    await expect(deserializeSceneAsync(document, { adapters: [unexpected, unexpected] })).rejects.toThrow(/duplicate.*adapter/i);
    expect(() => serializeScene(scene, { adapters: [rig, { ...rig, version: 2 }] })).toThrow(/duplicate.*adapter/i);
    expect(calls).toBe(0);

    let reads = 0;
    const bad = { ...rig, get capture() { reads += 1; return rig.capture; } };
    expect(() => serializeScene(scene, { adapters: [bad] })).toThrow(/capture.*data property/i);
    expect(reads).toBe(0);
    await expect(deserializeSceneAsync(document, { adapters: [{ ...rig, restore: null } as unknown as SceneSerializationAdapter] }))
      .rejects.toThrow(/capture and restore/i);
  });

  it.each([
    ["undefined", () => ({ value: undefined })],
    ["non-finite", () => ({ value: Infinity })],
    ["negative zero", () => ({ value: -0 })],
    ["function", () => ({ value: () => {} })],
    ["typed array", () => ({ value: new Uint8Array([1]) })],
    ["sparse array", () => ({ value: Array(2) })],
    ["cyclic data", () => { const value: Record<string, unknown> = {}; value.self = value; return value; }],
    ["shared data", () => { const value = {}; return { a: value, b: value }; }]
  ])("rejects %s extension payloads rather than losing data", (_name, makePayload) => {
    const scene = new Scene();
    const bad: SceneSerializationAdapter = {
      ...adapter("bad"),
      capture: () => ({ nodeIds: ["root"], payload: makePayload() } as unknown as ReturnType<SceneSerializationAdapter["capture"]>)
    };
    expect(() => serializeScene(scene, { adapters: [bad] })).toThrow(/adapter bad capture/i);
  });

  it("rejects undeclared or duplicate IDs and missing, ambiguous or malformed assets", async () => {
    const scene = new Scene();
    scene.metadata.registerAsset({ id: "valid", digest: "sha256:test" });
    expect(() => serializeScene(scene, { adapters: [adapter("bad-node", ["missing"])] })).toThrow(/unknown node ID.*missing/i);
    expect(() => serializeScene(scene, { adapters: [adapter("duplicate-node", ["root", "root"])] })).toThrow(/unique.*IDs/i);
    expect(() => serializeScene(scene, { adapters: [adapter("bad-asset", ["root"], ["missing"])] })).toThrow(/unknown asset ID.*missing/i);
    expect(() => serializeScene(scene, { adapters: [adapter("duplicate-asset", ["root"], ["valid", "valid"])] })).toThrow(/unique.*IDs/i);
    const rig = adapter("rig", ["root"], ["valid"]);
    const document = jsonCopy(serializeScene(scene, { adapters: [rig] }));
    await expect(deserializeSceneAsync(document, { adapters: [rig] })).rejects.toThrow(/resolver.*required/i);
    await expect(deserializeSceneAsync(document, { adapters: [rig], resolveAsset: () => null })).rejects.toThrow(/not resolved/i);
    const missing = jsonCopy(document);
    missing.extensions![0]!.assetIds = ["missing"];
    await expect(deserializeSceneAsync(missing, { adapters: [rig], resolveAsset: () => ({}) })).rejects.toThrow(/unknown asset ID.*missing/i);
    const missingNode = jsonCopy(document);
    missingNode.extensions![0]!.nodeIds = ["missing"];
    await expect(deserializeSceneAsync(missingNode, { adapters: [rig], resolveAsset: () => ({}) })).rejects.toThrow(/unknown node ID.*missing/i);
    const badMetadata = jsonCopy(document);
    (badMetadata.metadata!.assets![0] as unknown as { digest: number }).digest = 5;
    await expect(deserializeSceneAsync(badMetadata, { adapters: [rig], resolveAsset: () => ({}) })).rejects.toThrow(/digest.*string/i);
    const duplicateMetadata = jsonCopy(document);
    (duplicateMetadata.metadata!.assets as unknown[]).push({ id: "valid" });
    await expect(deserializeSceneAsync(duplicateMetadata, { adapters: [rig], resolveAsset: () => ({}) })).rejects.toThrow(/unique.*IDs/i);
  });

  it("rejects malformed extension envelopes, unsafe getters and legacy extension smuggling", async () => {
    const scene = new Scene();
    const rig = adapter("rig");
    const document = jsonCopy(serializeScene(scene, { adapters: [rig] }));
    const duplicate = jsonCopy(document);
    duplicate.extensions!.push(JSON.parse(JSON.stringify(duplicate.extensions![0]!)));
    await expect(deserializeSceneAsync(duplicate, { adapters: [rig] })).rejects.toThrow(/unique IDs/i);
    const empty = jsonCopy(document);
    empty.extensions = [];
    await expect(deserializeSceneAsync(empty, { adapters: [rig] })).rejects.toThrow(/non-empty extensions/i);
    const invalidVersion = jsonCopy(document);
    invalidVersion.extensions![0]!.version = 0;
    await expect(deserializeSceneAsync(invalidVersion, { adapters: [rig] })).rejects.toThrow(/positive integer/i);
    const badPayload = jsonCopy(document);
    let reads = 0;
    Object.defineProperty(badPayload.extensions![0]!.payload as object, "accessor", {
      enumerable: true,
      get() { reads += 1; return 1; }
    });
    await expect(deserializeSceneAsync(badPayload, { adapters: [rig] })).rejects.toThrow(/JSON data property/i);
    expect(reads).toBe(0);
    const legacy = jsonCopy(serializeScene(scene));
    legacy.extensions = document.extensions;
    expect(() => deserializeScene(legacy)).toThrow(/extensions/i);
    await expect(deserializeSceneAsync(legacy)).rejects.toThrow(/extensions/i);
  });

  it("resolves assets first and restores in snapshot order; disposal is reverse, async and idempotent", async () => {
    const scene = new Scene();
    scene.root.addChild(scene.createGroup({ id: "child" }));
    scene.metadata.registerAsset({ id: "asset-a" }).registerAsset({ id: "asset-b" });
    const events: string[] = [];
    let lateRegistration: ((dispose: () => void) => void) | undefined;
    const make = (id: string, assets: string[]): SceneSerializationAdapter => ({
      ...adapter(id, ["child"], assets),
      async restore(context) {
        events.push(`restore:${id}`);
        expect(context.getNode("child").disposed).toBe(false);
        for (const assetId of assets) expect(context.getAsset(assetId)).toEqual({ id: assetId });
        context.deferDispose(() => {
          expect(context.getNode("child").disposed).toBe(false);
          events.push(`dispose:${id}:first`);
        });
        context.deferDispose(async () => {
          await Promise.resolve();
          events.push(`dispose:${id}:last`);
        });
        lateRegistration = context.deferDispose;
        return id;
      }
    });
    const first = make("first", ["asset-a", "asset-b"]);
    const second = make("second", ["asset-b"]);
    const document = jsonCopy(serializeScene(scene, { adapters: [first, second] }));
    const owner = await deserializeSceneAsync(document, {
      adapters: [second, first],
      async resolveAsset(asset, scope) {
        events.push(`resolve:${asset.id}`);
        scope.deferDispose(() => { events.push(`dispose:${asset.id}`); });
        await Promise.resolve();
        return { id: asset.id };
      }
    });
    expect(events).toEqual(["resolve:asset-a", "resolve:asset-b", "restore:first", "restore:second"]);
    expect([...owner.extensions.keys()]).toEqual(["first", "second"]);
    expect(() => lateRegistration!(() => {})).toThrow(/callback is active/i);
    await Promise.all([owner.dispose(), owner.dispose()]);
    await owner.dispose();
    expect(events).toEqual([
      "resolve:asset-a", "resolve:asset-b", "restore:first", "restore:second",
      "dispose:second:last", "dispose:second:first", "dispose:first:last", "dispose:first:first",
      "dispose:asset-b", "dispose:asset-a"
    ]);
  });

  it("rolls back resources and every detached, unregistered node when a handler throws", async () => {
    const source = new Scene();
    const ancestor = new SceneNode({ id: "ancestor" });
    const registered = source.createGroup({ id: "registered" });
    const sibling = new SceneNode({ id: "sibling" });
    ancestor.addChild(registered).addChild(sibling);
    source.metadata.registerAsset({ id: "asset" });
    const events: string[] = [];
    let restoredNodes: SceneNode[] = [];
    let restoredScene: Scene | undefined;
    const first: SceneSerializationAdapter = {
      ...adapter("first", ["ancestor", "registered", "sibling"], ["asset"]),
      restore(context) {
        restoredScene = context.scene;
        restoredNodes = context.nodeIds.map((id) => context.getNode(id));
        expect(context.scene.getNodeById("ancestor")).toBeUndefined();
        context.deferDispose(() => { events.push("first"); });
      }
    };
    const second: SceneSerializationAdapter = {
      ...adapter("second", ["registered"]),
      async restore(context) {
        context.deferDispose(() => { events.push("second-a"); });
        context.deferDispose(() => { events.push("second-b"); });
        await Promise.resolve();
        throw new Error("cannot restore rig");
      }
    };
    const document = jsonCopy(serializeScene(source, { adapters: [first, second] }));
    await expect(deserializeSceneAsync(document, {
      adapters: [first, second],
      resolveAsset(_asset, scope) {
        scope.deferDispose(() => { events.push("asset"); });
        return {};
      }
    })).rejects.toMatchObject({ code: "VALIDATION_SCENE_ADAPTER_RESTORE", cause: { message: "cannot restore rig" } });
    expect(events).toEqual(["second-b", "second-a", "first", "asset"]);
    expect(restoredNodes.map((node) => node.disposed)).toEqual([true, true, true]);
    expect(restoredScene!.getNodeById("registered")).toBeUndefined();
    expect([ancestor.disposed, registered.disposed, sibling.disposed]).toEqual([false, false, false]);
  });

  it("cleans previously resolved assets when a later resolution fails", async () => {
    const scene = new Scene();
    scene.metadata.registerAsset({ id: "a" }).registerAsset({ id: "b" });
    const rig = adapter("rig", ["root"], ["a", "b"]);
    const events: string[] = [];
    const document = jsonCopy(serializeScene(scene, { adapters: [rig] }));
    await expect(deserializeSceneAsync(document, {
      adapters: [rig],
      async resolveAsset(asset, scope) {
        events.push(`resolve:${asset.id}`);
        scope.deferDispose(() => { events.push(`dispose:${asset.id}`); });
        if (asset.id === "b") throw new Error("asset unavailable");
        return {};
      }
    })).rejects.toMatchObject({ code: "VALIDATION_SCENE_ASSET", cause: { message: "asset unavailable" } });
    expect(events).toEqual(["resolve:a", "resolve:b", "dispose:b", "dispose:a"]);
  });

  it("cleans a resolved lease when its domain-specific asset is malformed", async () => {
    const scene = new Scene();
    scene.metadata.registerAsset({ id: "asset" });
    const events: string[] = [];
    const rig: SceneSerializationAdapter = {
      ...adapter("rig", ["root"], ["asset"]),
      restore(context) {
        const asset = context.getAsset("asset") as { clip?: unknown };
        if (!(asset.clip instanceof AnimationClip)) throw new Error("malformed clip asset");
      }
    };
    const document = jsonCopy(serializeScene(scene, { adapters: [rig] }));
    await expect(deserializeSceneAsync(document, {
      adapters: [rig],
      resolveAsset(_asset, scope) {
        scope.deferDispose(() => { events.push("asset disposed"); });
        return {};
      }
    })).rejects.toMatchObject({
      code: "VALIDATION_SCENE_ADAPTER_RESTORE", cause: { message: "malformed clip asset" }
    });
    expect(events).toEqual(["asset disposed"]);
  });

  it("reports both the primary restore failure and cleanup failures while attempting every cleanup", async () => {
    const scene = new Scene();
    scene.root.addChild(scene.createGroup({ id: "child" }));
    const events: string[] = [];
    let child: SceneNode | undefined;
    const failing: SceneSerializationAdapter = {
      ...adapter("failing", ["child"]),
      restore(context) {
        child = context.getNode("child");
        context.deferDispose(() => { events.push("first"); throw new Error("cleanup first"); });
        context.deferDispose(() => { events.push("second"); throw new Error("cleanup second"); });
        throw new Error("primary");
      }
    };
    const document = jsonCopy(serializeScene(scene, { adapters: [failing] }));
    let error: unknown;
    try { await deserializeSceneAsync(document, { adapters: [failing] }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((item: Error) => item.message)).toEqual([
      "Scene adapter failing restore failed.", "cleanup second", "cleanup first"
    ]);
    expect(events).toEqual(["second", "first"]);
    expect(child!.disposed).toBe(true);
  });

  it("attempts all disposers on normal disposal and reports failures without retrying", async () => {
    const source = new Scene();
    source.root.addChild(source.createGroup({ id: "child" }));
    const events: string[] = [];
    const failing: SceneSerializationAdapter = {
      ...adapter("failing-dispose", ["child"]),
      restore(context) {
        context.deferDispose(() => { events.push("first"); });
        context.deferDispose(() => { events.push("second"); throw new Error("dispose failed"); });
      }
    };
    const document = jsonCopy(serializeScene(source, { adapters: [failing] }));
    const owner = await deserializeSceneAsync(document, { adapters: [failing] });
    const restoredChild = owner.scene.getNodeById("child")!;
    const first = owner.dispose();
    expect(owner.dispose()).toBe(first);
    await expect(first).rejects.toMatchObject({
      message: expect.stringMatching(/resources.*disposed/i),
      errors: [expect.objectContaining({ message: "dispose failed" })]
    });
    await expect(owner.dispose()).rejects.toThrow(/resources.*disposed/i);
    expect(events).toEqual(["second", "first"]);
    expect(restoredChild.disposed).toBe(true);
  });

  it("does not restart cleanup when a synchronous disposer re-enters the owner", async () => {
    const source = new Scene();
    const events: string[] = [];
    let owner: Awaited<ReturnType<typeof deserializeSceneAsync>>;
    const reentrant: SceneSerializationAdapter = {
      ...adapter("reentrant"),
      restore(context) {
        context.deferDispose(() => { events.push("first"); });
        context.deferDispose(() => { events.push("second"); void owner.dispose(); });
      }
    };
    const document = jsonCopy(serializeScene(source, { adapters: [reentrant] }));
    owner = await deserializeSceneAsync(document, { adapters: [reentrant] });
    await owner.dispose();
    expect(events).toEqual(["second", "first"]);
  });

  it("isolates captured payload copies and reports capture callback failures", async () => {
    const scene = new Scene();
    const payload = { nested: { count: 2 } };
    const changing: SceneSerializationAdapter = {
      ...adapter("copy"),
      capture: () => ({ nodeIds: ["root"], payload }),
      restore(_context, captured) {
        (captured as typeof payload).nested.count = 42;
      }
    };
    const document = serializeScene(scene, { adapters: [changing] });
    payload.nested.count = 9;
    expect(document.extensions![0]!.payload).toEqual({ nested: { count: 2 } });
    const owner = await deserializeSceneAsync(document, { adapters: [changing] });
    expect(document.extensions![0]!.payload).toEqual({ nested: { count: 2 } });
    await owner.dispose();

    const failing: SceneSerializationAdapter = {
      ...adapter("capture-failure"),
      capture() { throw new Error("bad capture"); }
    };
    try {
      serializeScene(scene, { adapters: [failing] });
      throw new Error("capture unexpectedly succeeded");
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION_SCENE_ADAPTER_CAPTURE", cause: { message: "bad capture" } });
    }
    const asynchronous = {
      ...adapter("async-capture"),
      async capture() { throw new Error("not supported"); }
    } as unknown as SceneSerializationAdapter;
    expect(() => serializeScene(scene, { adapters: [asynchronous] })).toThrow(/capture must be synchronous/i);
  });

  it("rejects undeclared context access, capture mutations and unsupported live properties", async () => {
    const scene = new Scene();
    const child = scene.createGroup({ id: "child" });
    scene.root.addChild(child);
    const badAccess: SceneSerializationAdapter = {
      ...adapter("access", ["root"]),
      restore(context) {
        context.deferDispose(() => {});
        return context.getNode("child");
      }
    };
    const document = jsonCopy(serializeScene(scene, { adapters: [badAccess] }));
    await expect(deserializeSceneAsync(document, { adapters: [badAccess] })).rejects.toMatchObject({
      code: "VALIDATION_SCENE_ADAPTER_RESTORE",
      cause: { message: expect.stringMatching(/did not declare node ID.*child/i) }
    });
    const mutating: SceneSerializationAdapter = {
      ...adapter("mutating"),
      capture(context) {
        context.scene.root.transform.setPosition(1, 0, 0);
        return { nodeIds: ["root"], payload: null };
      }
    };
    expect(() => serializeScene(scene, { adapters: [mutating] })).toThrow(/changed during adapter capture/i);
    (child as unknown as { skeletonBinding: object }).skeletonBinding = {};
    expect(() => serializeScene(scene)).toThrow(/skeletonBinding/i);
    expect(() => serializeScene(scene, { adapters: [adapter("rig", ["child"])] })).toThrow(/skeletonBinding/i);
  });
});
