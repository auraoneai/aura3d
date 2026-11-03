import { describe, expect, it, vi } from "vitest";
import { Group, Renderable, Scene, SceneNode, SkinnedMesh, deserializeScene, serializeScene, type SerializedScene } from "@aura3d/scene";
import { SceneAnimationBridge } from "../../../packages/animation/src/SceneAnimationBridge";
import { bindSkeleton } from "../../../packages/animation/src/pose/SkeletonBinding";

describe("scene registry integration", () => {
  it("round-trips a registered detached node", () => {
    const scene = new Scene();
    const detached = scene.createGroup({ id: "detached", name: "detached" });
    detached.transform.setPosition(3, 4, 5);

    const document = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    const restored = deserializeScene(document);

    expect(restored.getNodeById("detached")).toBeDefined();
    expect(restored.getNodeById("detached")!.parent).toBeNull();
    expect(restored.getNodeById("detached")!.transform.position).toEqual([3, 4, 5]);
  });

  it("allocates a fresh ID after importing node-2", async () => {
    vi.resetModules();
    const { SceneNode, deserializeScene: readScene } = await import("@aura3d/scene");
    expect(new SceneNode().id).toBe("node-1");
    const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const;
    const imported = readScene({
      version: 1,
      root: {
        id: "root", name: "root", visible: true, layerMask: 1, kind: "node",
        transform: { position: [...identity.position], rotation: [...identity.rotation], scale: [...identity.scale] },
        children: [{
          id: "node-2", name: "imported", visible: true, layerMask: 1, kind: "node",
          transform: { position: [...identity.position], rotation: [...identity.rotation], scale: [...identity.scale] },
          children: []
        }]
      }
    });

    const created = imported.createNode();
    expect(created.id).not.toBe("node-2");
    expect(imported.getNodeById("node-2")?.name).toBe("imported");
    expect(imported.getNodeById(created.id)).toBe(created);
  });

  it("returns an insertion-ordered registry snapshot independent of subsequent mutations", () => {
    const scene = new Scene();
    const first = scene.createGroup({ id: "first" });
    const snapshot = scene.getRegisteredNodes();
    const second = scene.createGroup({ id: "second" });
    expect(snapshot).toEqual([scene.root, first]);
    expect(scene.getRegisteredNodes()).toEqual([scene.root, first, second]);
    (snapshot as SceneNode[]).pop();
    expect(scene.getRegisteredNodes()).toEqual([scene.root, first, second]);
  });

  it("disposes attached and detached registered subtrees once while callers retain unregistered ancestors", () => {
    const scene = new Scene();
    const shared = new Renderable({ geometry: "shared", material: "shared" });
    const attached = scene.createMesh({ id: "attached", renderable: shared });
    const attachedUnregistered = new SceneNode({ id: "attached-unregistered" });
    const detachedChild = scene.createMesh({ id: "detached-child", renderable: shared });
    const detachedParent = scene.createGroup({ id: "detached-parent" });
    const detachedLeaf = new SceneNode({ id: "detached-leaf" });
    const externalAncestor = new SceneNode({ id: "external-ancestor" });
    const externalSibling = new SceneNode({ id: "external-sibling" });
    const otherRegistered = scene.createMesh({ id: "other-registered", renderable: shared });
    externalSibling.renderable = shared;
    scene.root.addChild(attachedUnregistered);
    attachedUnregistered.addChild(attached);
    detachedParent.addChild(detachedChild);
    detachedChild.addChild(detachedLeaf);
    externalAncestor.addChild(otherRegistered).addChild(externalSibling);
    const disposedNodes = [attachedUnregistered, attached, detachedParent, detachedChild, detachedLeaf, otherRegistered];
    const calls = disposedNodes.map((node) => vi.spyOn(node, "dispose"));

    scene.dispose();

    expect(attached.disposed).toBe(true);
    expect(detachedParent.disposed).toBe(true);
    expect(otherRegistered.disposed).toBe(true);
    expect(disposedNodes.every((node) => node.disposed)).toBe(true);
    for (const call of calls) expect(call).toHaveBeenCalledTimes(1);
    expect(scene.root.disposed).toBe(false);
    expect(scene.root.children).toEqual([]);
    expect(scene.getRegisteredNodes()).toEqual([scene.root]);
    expect(externalAncestor.disposed).toBe(false);
    expect(externalAncestor.children).toEqual([externalSibling]);
    expect(externalSibling.disposed).toBe(false);
    expect(externalSibling.renderable).toBe(shared);

    scene.dispose();
    for (const call of calls) expect(call).toHaveBeenCalledTimes(1);
    externalAncestor.dispose();
    expect(externalSibling.disposed).toBe(true);
  });

  it("continues disposal after a node throws and retries a detached unregistered failure", () => {
    class FlakyNode extends SceneNode {
      attempts = 0;

      override dispose(options?: Parameters<SceneNode["dispose"]>[0]): void {
        this.attempts += 1;
        if (this.attempts === 1) throw new Error("disposer failed");
        super.dispose(options);
      }
    }
    const scene = new Scene();
    const parent = scene.createGroup({ id: "parent" });
    const sibling = scene.createGroup({ id: "sibling" });
    const detached = scene.createGroup({ id: "detached" });
    const flaky = new FlakyNode({ id: "flaky" });
    scene.root.addChild(parent).addChild(sibling);
    parent.addChild(flaky);

    expect(() => scene.dispose()).toThrow(AggregateError);
    expect(flaky.attempts).toBe(1);
    expect(flaky.disposed).toBe(false);
    expect(flaky.parent).toBeNull();
    expect(parent.disposed).toBe(true);
    expect(sibling.disposed).toBe(true);
    expect(detached.disposed).toBe(true);
    expect(scene.getRegisteredNodes()).toEqual([scene.root]);

    scene.dispose();
    expect(flaky.attempts).toBe(2);
    expect(flaky.disposed).toBe(true);
    scene.dispose();
    expect(flaky.attempts).toBe(2);
  });

  it("does not retry a failed child through a parent override that disposes recursively", () => {
    class RecursiveParent extends SceneNode {
      override dispose(): void {
        super.dispose();
      }
    }
    class FlakyChild extends SceneNode {
      attempts = 0;

      override dispose(options?: Parameters<SceneNode["dispose"]>[0]): void {
        this.attempts += 1;
        if (this.attempts === 1) throw new Error("disposer failed");
        super.dispose(options);
      }
    }
    const scene = new Scene();
    const parent = new RecursiveParent({ id: "parent" });
    const child = new FlakyChild({ id: "child" });
    scene.registerNode(parent);
    scene.root.addChild(parent);
    parent.addChild(child);

    expect(() => scene.dispose()).toThrow(AggregateError);
    expect(child.attempts).toBe(1);
    expect(child.disposed).toBe(false);
    expect(child.parent).toBeNull();
    expect(parent.disposed).toBe(true);

    scene.dispose();
    expect(child.attempts).toBe(2);
    expect(child.disposed).toBe(true);
  });

  it("rejects inconsistent parent links before disposing any registered nodes", () => {
    const scene = new Scene();
    const attached = scene.createGroup({ id: "attached" });
    const detached = scene.createGroup({ id: "detached" });
    const ancestor = new SceneNode({ id: "ancestor" });
    scene.root.addChild(attached);
    detached.parent = ancestor;

    expect(() => scene.dispose()).toThrow(/inconsistent parent link/i);
    expect(attached.disposed).toBe(false);
    expect(detached.disposed).toBe(false);
    expect(scene.root.children).toEqual([attached]);
    expect(scene.getRegisteredNodes()).toEqual([scene.root, attached, detached]);
  });

  it("round-trips cloned detached ancestry without registering or disposing caller-owned ancestors", () => {
    const scene = new Scene();
    const registered = scene.createGroup({ id: "registered", name: "registered" });
    const ancestor = new SceneNode({ id: "ancestor", name: "ancestor" });
    const sibling = new SceneNode({ id: "sibling", name: "sibling" });
    ancestor.addChild(registered).addChild(sibling);
    scene.metadata.registerAsset({ id: "asset", nodeIds: [ancestor.id, registered.id, "outside"] });

    const copy = scene.clone();
    const clonedNode = copy.getRegisteredNodes()[1]!;
    const clonedAncestor = clonedNode.parent!;
    const clonedSibling = clonedAncestor.children[1]!;
    const document = JSON.parse(JSON.stringify(serializeScene(copy))) as SerializedScene;
    const restored = deserializeScene(document);

    expect(document.version).toBe(2);
    expect(document.registeredNodeIds).toEqual(["root", clonedNode.id]);
    expect(document.detached?.[0]?.id).toBe(clonedAncestor.id);
    expect(restored.getNodeById(clonedNode.id)?.parent?.id).toBe(clonedAncestor.id);
    expect(restored.getNodeById(clonedAncestor.id)).toBeUndefined();
    expect(restored.metadata.assets[0]?.nodeIds).toEqual([clonedAncestor.id, clonedNode.id, "outside"]);
    expect(JSON.parse(JSON.stringify(serializeScene(restored)))).toEqual(document);

    copy.dispose();
    expect(clonedNode.disposed).toBe(true);
    expect(clonedAncestor.disposed).toBe(false);
    expect(clonedAncestor.children).toEqual([clonedSibling]);
    expect(clonedSibling.disposed).toBe(false);
    expect(ancestor.children).toEqual([registered, sibling]);
    clonedAncestor.dispose();
    expect(clonedSibling.disposed).toBe(true);
  });

  it("preserves detached forests, registration order, nonregistered relations and shared renderables", () => {
    const scene = new Scene();
    const shared = new Renderable({ geometry: "g", material: "m", morphWeights: [0.4] });
    const attached = scene.createMesh({ id: "attached", renderable: shared });
    scene.root.addChild(attached);
    const ancestor = new SceneNode({ id: "unregistered-ancestor" });
    const registered = scene.createMesh({ id: "registered-child", renderable: shared });
    const registeredSibling = scene.createGroup({ id: "registered-sibling" });
    const unregistered = new SceneNode({ id: "unregistered-leaf" });
    registered.transform.setPosition(2, 3, 4);
    ancestor.addChild(registered).addChild(registeredSibling);
    registered.addChild(unregistered);
    const other = scene.createSkinnedMesh({
      id: "other-root",
      renderable: { geometry: "skin", material: "mat", skinning: { jointCount: 1, matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } }
    });
    scene.metadata.registerAsset({ id: "asset", nodeIds: [attached.id, registered.id, other.id] });
    const registeredIds = scene.getRegisteredNodes().map((node) => node.id);

    const document = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    expect(document.version).toBe(2);
    expect(document.detached?.map((node) => node.id)).toEqual(["unregistered-ancestor", "other-root"]);
    expect(document.registeredNodeIds).toEqual(registeredIds);
    const restored = deserializeScene(document);
    const restoredAttached = restored.getNodeById(attached.id)!;
    const restoredChild = restored.getNodeById(registered.id)!;
    const restoredSibling = restored.getNodeById(registeredSibling.id)!;
    const restoredOther = restored.getNodeById(other.id)!;
    expect(restored.getRegisteredNodes().map((node) => node.id)).toEqual(registeredIds);
    expect(restored.getNodeById("unregistered-ancestor")).toBeUndefined();
    expect(restored.getNodeById("unregistered-leaf")).toBeUndefined();
    expect(restoredChild.parent?.id).toBe("unregistered-ancestor");
    expect(restoredChild.parent?.parent).toBeNull();
    expect(restoredChild.parent?.children).toEqual([restoredChild, restoredSibling]);
    expect(restoredChild.children[0]?.id).toBe("unregistered-leaf");
    expect(restoredChild.transform.position).toEqual([2, 3, 4]);
    expect(restoredAttached.renderable).toBe(restoredChild.renderable);
    expect(restoredChild.renderable).not.toBe(shared);
    expect(restoredOther).toBeInstanceOf(SkinnedMesh);
    expect(restoredOther.parent).toBeNull();
    expect(restored.metadata.assets[0]?.nodeIds).toEqual([attached.id, registered.id, other.id]);
    expect(JSON.parse(JSON.stringify(serializeScene(restored)))).toEqual(document);
  });

  it("preserves non-preorder registry membership for an attached hierarchy", () => {
    const scene = new Scene();
    const child = scene.createGroup({ id: "child" });
    const parent = scene.createGroup({ id: "parent" });
    const unregistered = new SceneNode({ id: "not-registered" });
    scene.root.addChild(parent);
    parent.addChild(child).addChild(unregistered);

    const document = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    expect(document.version).toBe(2);
    expect(document.detached).toEqual([]);
    expect(document.registeredNodeIds).toEqual(["root", "child", "parent"]);
    const restored = deserializeScene(document);
    expect(restored.getRegisteredNodes().map((node) => node.id)).toEqual(["root", "child", "parent"]);
    expect(restored.getNodeById("not-registered")).toBeUndefined();
    expect(restored.getNodeById("parent")?.children.map((node) => node.id)).toEqual(["child", "not-registered"]);
    expect(JSON.parse(JSON.stringify(serializeScene(restored)))).toEqual(document);
  });

  it("keeps legacy v1 connected documents unchanged and rejects v1 extensions that would be lost", () => {
    const scene = new Scene();
    const node = scene.createGroup({ id: "connected" });
    scene.root.addChild(node);
    const legacy = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    expect(legacy.version).toBe(1);
    expect(legacy).not.toHaveProperty("detached");
    expect(legacy).not.toHaveProperty("registeredNodeIds");
    expect(deserializeScene(legacy).getNodeById("connected")).toBeInstanceOf(Group);
    expect(JSON.parse(JSON.stringify(serializeScene(deserializeScene(legacy))))).toEqual(legacy);
    expect(() => deserializeScene({ ...legacy, detached: [legacy.root] })).toThrow(/version|detached/i);
    expect(() => deserializeScene({ ...legacy, registeredNodeIds: ["root"] })).toThrow(/version|registry/i);
  });

  it("rejects malformed detached hierarchies and duplicate IDs without discarding data", () => {
    const inconsistent = new Scene();
    const child = inconsistent.createNode("child");
    child.parent = new SceneNode({ id: "missing-parent-link" });
    expect(() => serializeScene(inconsistent)).toThrow(/hierarchy/i);

    const cycle = new Scene();
    const cycleNode = cycle.createNode("cycle");
    cycleNode.children.push(cycleNode);
    cycleNode.parent = cycleNode;
    expect(() => serializeScene(cycle)).toThrow(/hierarchy|cycle/i);

    const duplicate = new Scene();
    duplicate.createGroup({ id: "duplicate" });
    duplicate.root.addChild(new SceneNode({ id: "duplicate" }));
    expect(() => serializeScene(duplicate)).toThrow(/duplicate/i);

    const disposed = new Scene();
    disposed.createNode("disposed").dispose();
    expect(() => serializeScene(disposed)).toThrow(/disposed/i);
  });

  it("rejects malformed v2 registry and detached documents", () => {
    const scene = new Scene();
    scene.createGroup({ id: "detached" });
    const original = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    expect(original.version).toBe(2);

    const missingDetached = structuredClone(original);
    delete missingDetached.detached;
    expect(() => deserializeScene(missingDetached)).toThrow(/detached/i);

    const missingRegistry = structuredClone(original);
    delete missingRegistry.registeredNodeIds;
    expect(() => deserializeScene(missingRegistry)).toThrow(/registry|registered/i);

    for (const ids of [[], ["detached"], ["root", "unknown"], ["root", "detached", "detached"], ["root"]]) {
      const document = structuredClone(original);
      document.registeredNodeIds = ids;
      expect(() => deserializeScene(document)).toThrow(/registry|registered/i);
    }

    const duplicateId = structuredClone(original);
    duplicateId.root.children.push(structuredClone(duplicateId.detached![0]!));
    expect(() => deserializeScene(duplicateId)).toThrow(/duplicate/i);

    const repeatedNode = structuredClone(original);
    repeatedNode.detached!.push(repeatedNode.detached![0]!);
    expect(() => deserializeScene(repeatedNode)).toThrow(/hierarchy/i);
  });

  it("rejects a registry change during serialization rather than producing an incomplete snapshot", () => {
    const scene = new Scene();
    const node = scene.createGroup({ id: "mutator" });
    Object.defineProperty(node, "userData", {
      configurable: true,
      get() {
        scene.createNode("late");
        return {};
      }
    });
    expect(() => serializeScene(scene)).toThrow(/registry.*changed/i);
  });

  it("registers a subtree atomically when a descendant ID is already registered", () => {
    const scene = new Scene();
    scene.createGroup({ id: "taken" });
    const root = new SceneNode({ id: "candidate" });
    root.addChild(new SceneNode({ id: "taken" }));
    expect(() => scene.registerSubtree(root)).toThrow(/duplicate/i);
    expect(scene.getNodeById("candidate")).toBeUndefined();
    expect(scene.getNodeById("taken")).toBeDefined();
  });

  it("uses distinct generated IDs after explicit large numeric IDs and across scene factories", async () => {
    vi.resetModules();
    const { Scene: FreshScene, SceneNode: FreshNode } = await import("@aura3d/scene");
    const scene = new FreshScene();
    scene.createGroup({ id: "node-9007199254740991" });
    const nodes = [
      scene.createNode(),
      scene.createObject3D(),
      scene.createGroup(),
      scene.createMesh(),
      scene.createSkinnedMesh(),
      scene.createInstancedMesh(),
      scene.createPerspectiveCamera(),
      scene.createOrthographicCamera(),
      scene.createLight("point"),
      new FreshNode()
    ];
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    expect(nodes.every((node) => node.id !== "node-9007199254740991")).toBe(true);
    expect(nodes.every((node) => /^node-[1-9][0-9]*$/.test(node.id))).toBe(true);
  });

  it("preserves detached bone poses and palettes while requiring external animation bindings to be rebuilt", () => {
    const scene = new Scene();
    const first = scene.createGroup({ id: "joint-a", name: "same-name" });
    const second = scene.createGroup({ id: "joint-b", name: "same-name" });
    const skin = scene.createSkinnedMesh({
      id: "skin",
      renderable: {
        geometry: "skin-g", material: "skin-m",
        skinning: { jointCount: 2, matrices: new Float32Array(32).fill(2) }
      }
    });
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(3, 0, 0);
    first.addChild(second);
    const bind = (a: SceneNode, b: SceneNode) => bindSkeleton({
      joints: [4, 9],
      resolveNode: (index) => {
        const node = index === 4 ? a : index === 9 ? b : undefined;
        return node && { name: node.name, position: node.transform.position, rotation: node.transform.rotation, scale: node.transform.scale };
      },
      parentIndices: [-1, 0]
    });
    const originalBinding = bind(first, second);
    const oldBridge = new SceneAnimationBridge();
    oldBridge.register("joint-a", { setPosition: (value) => first.transform.setPosition(...value) });

    const restored = deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene);
    const restoredFirst = restored.getNodeById(first.id)!;
    const restoredSecond = restored.getNodeById(second.id)!;
    const restoredSkin = restored.getNodeById(skin.id) as SkinnedMesh;
    const restoredBinding = bind(restoredFirst, restoredSecond);
    expect(restoredBinding.jointIndicesByName.get("same-name")).toEqual([0, 1]);
    expect(Array.from(restoredBinding.restPose.positions)).toEqual([1, 0, 0, 3, 0, 0]);
    expect(Array.from(restoredSkin.skinning!.matrices)).toEqual(new Array(32).fill(2));

    oldBridge.setAnimationValue("joint-a.position", [7, 0, 0]);
    expect(originalBinding.joints[0]!.position[0]).toBe(7);
    expect(restoredBinding.joints[0]!.position[0]).toBe(1);
    const restoredBridge = new SceneAnimationBridge();
    restoredBridge.register("joint-a", { setPosition: (value) => restoredFirst.transform.setPosition(...value) });
    restoredBridge.setAnimationValue("joint-a.position", [9, 0, 0]);
    expect(restoredBinding.joints[0]!.position[0]).toBe(9);
    expect(originalBinding.joints[0]!.position[0]).toBe(7);
  });

  it("rejects attached skeleton or animation bindings instead of silently dropping them", () => {
    const scene = new Scene();
    const mesh = scene.createSkinnedMesh({ id: "skinned" });
    scene.root.addChild(mesh);
    const extensible = mesh as unknown as Record<string, unknown>;
    extensible.skeleton = { bones: [] };
    expect(() => serializeScene(scene)).toThrow(/skeleton|binding/i);
    delete extensible.skeleton;
    extensible.animations = [{ name: "walk" }];
    expect(() => serializeScene(scene)).toThrow(/animation|binding/i);
    delete extensible.animations;

    const document = serializeScene(scene);
    (document.root.children[0] as unknown as Record<string, unknown>).skeleton = { bones: [] };
    expect(() => deserializeScene(document)).toThrow(/skeleton|binding/i);
  });
});
