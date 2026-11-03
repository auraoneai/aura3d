import { Vector3 } from "@aura3d/math";
import {
  Bounds3,
  DirectionalLight,
  Group,
  InstancedMesh,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  RectAreaLight,
  Renderable,
  Scene,
  SceneNode,
  SkinnedMesh,
  SpotLight,
  type Mat4
} from "@aura3d/scene";
import { describe, expect, it, vi } from "vitest";

const identity: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

describe("public scene hierarchy cloning", () => {
  it("recursively copies node types, transforms, bounds and graph links without retaining the old parent", () => {
    const ancestor = new SceneNode({ name: "ancestor" });
    const group = new Group({ id: "authored-group", name: "group", visible: false, layerMask: 12, renderOrder: 9 });
    const mesh = new Mesh({ name: "mesh", renderable: { geometry: "geometry:box", material: "material:blue" } });
    const child = new SceneNode({ name: "manual-child" });
    const manual: Mat4 = [
      1, 0, 0, 0,
      0.4, 1, 0, 0,
      0, 0, 1, 0,
      3, 4, 5, 1
    ];
    ancestor.transform.setPosition(100, 0, 0);
    group.transform.setPosition(2, 3, 4).setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2).setScale(2, 3, 1).setPivot(1, 2, 0);
    group.transform.setLinearResidual([
      1, 0, 0, 0,
      0.2, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    group.frustumCulled = false;
    group.setLocalBounds(new Bounds3([-1, -2, -3], [1, 2, 3]));
    child.transform.setPivot(2, 1, 0).setLocalMatrix(manual, { decompose: false });
    ancestor.addChild(group);
    group.addChild(mesh);
    mesh.addChild(child);
    ancestor.updateWorldTransform();
    const oldWorld = [...group.transform.worldMatrix];

    const copy = group.clone();

    expect(copy).toBeInstanceOf(Group);
    expect(copy).not.toBe(group);
    expect(copy.id).not.toBe(group.id);
    expect(copy.parent).toBeNull();
    expect(copy.name).toBe("group");
    expect(copy.visible).toBe(false);
    expect(copy.layerMask).toBe(12);
    expect(copy.renderOrder).toBe(9);
    expect(copy.frustumCulled).toBe(false);
    expect(copy.transform.position).toEqual(group.transform.position);
    expect(copy.transform.rotation).toEqual(group.transform.rotation);
    expect(copy.transform.scale).toEqual(group.transform.scale);
    expect(copy.transform.pivot).toEqual(group.transform.pivot);
    expect(copy.transform.getLinearResidual()).toEqual(group.transform.getLinearResidual());
    expect(copy.localBounds).toEqual(group.localBounds);
    expect(copy.localBounds).not.toBe(group.localBounds);
    expect(copy.children[0]).toBeInstanceOf(Mesh);
    expect(copy.children[0]?.parent).toBe(copy);
    expect(copy.children[0]?.children[0]?.parent).toBe(copy.children[0]);
    expect(copy.children[0]?.id).not.toBe(mesh.id);
    expect(copy.children[0]?.children[0]?.id).not.toBe(child.id);
    expect(copy.children[0]?.children[0]?.transform.matrixAutoUpdate).toBe(false);
    expect(copy.children[0]?.children[0]?.transform.localMatrix).toEqual(manual);
    expect(copy.children[0]?.children[0]?.transform.pivot).toEqual([2, 1, 0]);
    expect(copy.transform.isDirty()).toBe(true);
    copy.updateWorldTransform();
    copy.updateWorldBounds();
    expect(copy.transform.worldMatrix).toEqual(group.transform.localMatrix);
    expect(copy.worldBounds).toEqual(copy.localBounds?.transform(copy.transform.worldMatrix));
    expect(group.transform.worldMatrix).toEqual(oldWorld);

    copy.transform.setPosition(20, 30, 40);
    copy.localBounds!.min[0] = -99;
    copy.children[0]!.transform.setScale(4, 4, 4);
    expect(group.transform.position).toEqual([2, 3, 4]);
    expect(group.localBounds?.min).toEqual([-1, -2, -3]);
    expect(mesh.transform.scale).toEqual([1, 1, 1]);
  });

  it("supports shallow clones and creates fresh IDs even when a constructor uses a fixed ID", () => {
    class FixedNode extends SceneNode {
      constructor() {
        super({ id: "fixed", name: "fixed" });
      }
    }
    const node = new FixedNode();
    node.addChild(new SceneNode({ name: "child" }));

    const shallow = node.clone(false);
    const shallowOptions = node.clone({ recursive: false });

    expect(shallow).toBeInstanceOf(FixedNode);
    expect(shallow.children).toEqual([]);
    expect(shallowOptions.children).toEqual([]);
    expect(shallow.id).not.toBe(node.id);
    expect(shallowOptions.id).not.toBe(node.id);
    expect(shallowOptions.id).not.toBe(shallow.id);
    expect(node.children).toHaveLength(1);
  });

  it("copies mutable renderable state while preserving sharing inside the cloned hierarchy", () => {
    const root = new Group({ name: "root" });
    const renderable = new Renderable({
      geometry: "geometry:shared",
      material: "material:shared",
      layerMask: 4,
      castShadow: false,
      receiveShadow: true,
      skinning: { jointCount: 1, matrices: new Float32Array(identity) },
      morphWeights: [0.25, 0.75],
      instanceTransforms: identity,
      instanceColors: [1, 0, 0, 1]
    });
    const skin = new SkinnedMesh({ name: "skin", renderable });
    const instances = new InstancedMesh({ name: "instances", renderable });
    root.addChild(skin).addChild(instances);

    const copy = root.clone();
    const skinCopy = copy.children[0] as SkinnedMesh;
    const instanceCopy = copy.children[1] as InstancedMesh;

    expect(skinCopy).toBeInstanceOf(SkinnedMesh);
    expect(instanceCopy).toBeInstanceOf(InstancedMesh);
    expect(skinCopy.renderable).not.toBe(renderable);
    expect(skinCopy.renderable).toBe(instanceCopy.renderable);
    expect(skinCopy.renderable?.geometry).toBe("geometry:shared");
    expect(skinCopy.renderable?.material).toBe("material:shared");
    expect(skinCopy.renderable?.layerMask).toBe(4);
    expect(skinCopy.renderable?.castShadow).toBe(false);
    expect(skinCopy.renderable?.receiveShadow).toBe(true);
    expect(skinCopy.skinning?.matrices).toEqual(renderable.skinning?.matrices);
    expect(skinCopy.skinning?.matrices).not.toBe(renderable.skinning?.matrices);
    expect(instanceCopy.instanceTransforms).not.toBe(renderable.instanceTransforms);
    expect(instanceCopy.instanceColors).not.toBe(renderable.instanceColors);
    skinCopy.skinning!.matrices[0] = 7;
    skinCopy.renderable!.morphWeights[0] = 1;
    instanceCopy.instanceTransforms![12] = 11;
    instanceCopy.instanceColors![0] = 0;
    expect(renderable.skinning?.matrices[0]).toBe(1);
    expect(renderable.morphWeights).toEqual([0.25, 0.75]);
    expect(renderable.instanceTransforms?.[12]).toBe(0);
    expect(renderable.instanceColors?.[0]).toBe(1);
  });

  it("remaps cross-node references from bounds and renderable extension state", () => {
    const root = new Group();
    const child = new SceneNode({ name: "child" });
    root.addChild(child);
    const shared = { strength: 2 };
    const bounds = new Bounds3([-1, -1, -1], [1, 1, 1]) as Bounds3 & {
      childTransform?: SceneNode["transform"];
      childMatrix?: Mat4;
    };
    bounds.childTransform = child.transform;
    bounds.childMatrix = child.transform.localMatrix;
    root.localBounds = bounds;
    const renderable = new Renderable({ geometry: "g", material: "m" }) as Renderable & { extra?: typeof shared };
    renderable.extra = shared;
    root.renderable = renderable;
    child.userData = { shared };

    const copy = root.clone();
    const copyBounds = copy.localBounds as typeof bounds;
    const copyRenderable = copy.renderable as typeof renderable;

    expect(copyBounds.childTransform).toBe(copy.children[0]?.transform);
    expect(copyBounds.childMatrix).toBe(copy.children[0]?.transform.localMatrix);
    expect(copyRenderable.extra).toBe(copy.children[0]?.userData.shared);
    expect(copyRenderable.extra).not.toBe(shared);
  });

  it("clones cyclic metadata, shared containers and typed views, and remaps references to cloned nodes", () => {
    const group = new Group({ name: "group" });
    const child = new Mesh({ name: "child" });
    group.addChild(child);
    const buffer = new ArrayBuffer(16);
    const view = new Uint8Array(buffer, 4, 4);
    view.set([1, 2, 3, 4]);
    const shared = { count: 1 };
    const data: Record<string, unknown> = {
      owner: group,
      child,
      shared,
      nested: [shared],
      lookup: new Map([[child, shared]]),
      flags: new Set([shared]),
      date: new Date("2026-01-01T00:00:00.000Z"),
      buffer,
      view
    };
    data.self = data;
    group.userData = data;
    child.userData = { shared };

    const copy = group.clone();
    const copyData = copy.userData;
    const copyShared = copyData.shared as { count: number };
    const copyView = copyData.view as Uint8Array;

    expect(copyData).not.toBe(data);
    expect(copyData.self).toBe(copyData);
    expect(copyData.owner).toBe(copy);
    expect(copyData.child).toBe(copy.children[0]);
    expect(copyShared).not.toBe(shared);
    expect((copyData.nested as unknown[])[0]).toBe(copyShared);
    expect(copy.children[0]?.userData.shared).toBe(copyShared);
    expect((copyData.lookup as Map<unknown, unknown>).get(copy.children[0])).toBe(copyShared);
    expect((copyData.flags as Set<unknown>).has(copyShared)).toBe(true);
    expect(copyData.date).toEqual(data.date);
    expect(copyData.date).not.toBe(data.date);
    expect(copyData.buffer).not.toBe(buffer);
    expect(copyView.buffer).toBe(copyData.buffer);
    expect(copyView.byteOffset).toBe(4);
    expect([...copyView]).toEqual([1, 2, 3, 4]);
    copyShared.count = 9;
    copyView[0] = 8;
    expect(shared.count).toBe(1);
    expect(view[0]).toBe(1);
  });

  it("copies explicit render callbacks without copying transform listeners or sharing disposal", () => {
    const root = new Group({ name: "root" });
    const child = new Mesh({ name: "child", renderable: { geometry: "g", material: "m" } });
    root.addChild(child);
    root.updateWorldTransform();
    const dirty = vi.fn();
    const beforeRender = vi.fn();
    root.transform.onDirty(dirty);
    root.onBeforeRender = beforeRender;

    const copy = root.clone();
    copy.transform.setPosition(1, 2, 3);
    copy.onBeforeRender?.(undefined, copy);

    expect(dirty).not.toHaveBeenCalled();
    expect(beforeRender).toHaveBeenCalledWith(undefined, copy);
    copy.dispose();
    expect(copy.disposed).toBe(true);
    expect(copy.children).toEqual([]);
    expect(root.disposed).toBe(false);
    expect(child.disposed).toBe(false);
    expect(root.children).toEqual([child]);
    root.dispose();
    expect(child.disposed).toBe(true);
  });

  it("does not dispatch constructor-installed dirty listeners while copying state", () => {
    const dirty = vi.fn();
    class ObservedNode extends SceneNode {
      constructor() {
        super();
        this.updateWorldTransform();
        this.transform.onDirty(dirty);
      }
    }
    const source = new ObservedNode();
    source.transform.setPosition(1, 2, 3);
    dirty.mockClear();

    const copy = source.clone();

    expect(dirty).not.toHaveBeenCalled();
    copy.updateWorldTransform();
    copy.transform.setPosition(4, 5, 6);
    expect(dirty).toHaveBeenCalledTimes(1);
  });

  it("copies camera and light subtypes with independent projection, color and derived state", () => {
    const root = new Group({ name: "views" });
    const perspective = new PerspectiveCamera({
      name: "perspective",
      fovYRadians: 0.7,
      aspect: 1.5,
      near: 0.5,
      far: Infinity,
      focalLength: 42,
      filmGauge: 38,
      filmOffset: 1.2,
      depth: { mode: "reversed", clipRange: "zero-to-one" },
      viewOffset: { fullWidth: 1200, fullHeight: 800, x: 0, y: 0, width: 600, height: 800 }
    });
    perspective.setViewport({ x: 0.1, y: 0.2, width: 0.4, height: 0.5 });
    perspective.transform.setPosition(1, 2, 3);
    const orthographic = new OrthographicCamera({ name: "orthographic", left: -4, right: 3, top: 2, bottom: -1, zoom: 2, resizeMode: "fit-horizontal" });
    const directional = new DirectionalLight("directional");
    const point = new PointLight("point");
    const spot = new SpotLight("spot");
    const area = new RectAreaLight("area");
    directional.color = new Vector3(0.2, 0.4, 0.6);
    directional.intensity = 3;
    directional.castsShadow = true;
    point.range = 19;
    spot.range = 21;
    spot.angle = 0.5;
    spot.penumbra = 0.3;
    area.width = 5;
    area.height = 6;
    area.range = 27;
    root.transform.setPosition(4, 0, 0);
    root.addChild(perspective).addChild(orthographic).addChild(directional).addChild(point).addChild(spot).addChild(area);
    perspective.updateCameraMatrices();

    const copy = root.clone();
    const [pc, oc, dl, pl, sl, al] = copy.children as [PerspectiveCamera, OrthographicCamera, DirectionalLight, PointLight, SpotLight, RectAreaLight];

    expect(pc).toBeInstanceOf(PerspectiveCamera);
    expect(oc).toBeInstanceOf(OrthographicCamera);
    expect(dl).toBeInstanceOf(DirectionalLight);
    expect(pl).toBeInstanceOf(PointLight);
    expect(sl).toBeInstanceOf(SpotLight);
    expect(al).toBeInstanceOf(RectAreaLight);
    expect(pc.getAuthoredFieldOfView()).toBe(0.7);
    expect(pc.focalLength).toBe(42);
    expect(pc.far).toBe(Infinity);
    expect(pc.filmGauge).toBe(38);
    expect(pc.filmOffset).toBe(1.2);
    expect(pc.depth).toEqual(perspective.depth);
    expect(pc.depth).not.toBe(perspective.depth);
    expect(pc.viewport).toEqual(perspective.viewport);
    expect(pc.viewport).not.toBe(perspective.viewport);
    expect(pc.viewOffset).toEqual(perspective.viewOffset);
    expect(pc.viewOffset).not.toBe(perspective.viewOffset);
    expect(pc.projectionMatrix).toEqual(perspective.projectionMatrix);
    expect(pc.viewMatrix).toEqual(perspective.viewMatrix);
    expect(oc.resizeMode).toBe("fit-horizontal");
    expect(oc.zoom).toBe(2);
    expect(dl.color).toBeInstanceOf(Vector3);
    expect(dl.color).toEqual(directional.color);
    expect(dl.color).not.toBe(directional.color);
    expect(dl.intensity).toBe(3);
    expect(dl.castsShadow).toBe(true);
    expect(pl.range).toBe(19);
    expect([sl.range, sl.angle, sl.penumbra]).toEqual([21, 0.5, 0.3]);
    expect([al.width, al.height, al.range]).toEqual([5, 6, 27]);
    pc.viewport.width = 0.25;
    (dl.color as { x: number }).x = 0.9;
    expect(perspective.viewport.width).toBe(0.4);
    expect((directional.color as Vector3).x).toBe(0.2);
  });

  it("clones scenes, their detached registrations and metadata node IDs without sharing state", () => {
    const scene = new Scene();
    const group = scene.createGroup({ id: "group", name: "group" });
    const child = scene.createMesh({ id: "mesh", name: "mesh", renderable: { geometry: "g", material: "m" } });
    const detached = scene.createObject3D({ id: "detached", name: "detached" });
    scene.root.addChild(group);
    group.addChild(child);
    scene.root.userData = { target: child };
    group.userData = { detached };
    detached.userData = { attached: child };
    scene.metadata.registerAsset({ id: "asset", nodeIds: [scene.root.id, group.id, child.id, detached.id, "external"] });
    scene.metadata.assignMaterial({ nodeId: child.id, materialId: "material", unsupportedFeatures: ["detail"] });
    scene.metadata.addPlan({ id: "plan", kind: "animation", description: "move", nodeIds: [group.id, child.id] });

    const copy = scene.clone();
    const copyGroup = copy.findByName("group")[0]!;
    const copyChild = copy.findByName("mesh")[0]!;
    const copyDetached = copyGroup.userData.detached as SceneNode;

    expect(copy).not.toBe(scene);
    expect(copy.root.id).toBe("root");
    expect(copy.getNodeById(copy.root.id)).toBe(copy.root);
    expect(copyGroup.id).not.toBe(group.id);
    expect(copyChild.id).not.toBe(child.id);
    expect(copyDetached.id).not.toBe(detached.id);
    expect(copy.getNodeById(copyGroup.id)).toBe(copyGroup);
    expect(copy.getNodeById(copyChild.id)).toBe(copyChild);
    expect(copy.getNodeById(copyDetached.id)).toBe(copyDetached);
    expect(copyDetached.parent).toBeNull();
    expect(copy.root.userData.target).toBe(copyChild);
    expect(copyDetached.userData.attached).toBe(copyChild);
    expect(copy.metadata.assets[0]?.nodeIds).toEqual(["root", copyGroup.id, copyChild.id, copyDetached.id, "external"]);
    expect(copy.metadata.materialAssignments[0]?.nodeId).toBe(copyChild.id);
    expect(copy.metadata.plans[0]?.nodeIds).toEqual([copyGroup.id, copyChild.id]);
    expect(copy.metadata).not.toBe(scene.metadata);
    (copy.metadata.materialAssignments[0]!.unsupportedFeatures as string[]).push("extra");
    expect(scene.metadata.materialAssignments[0]?.unsupportedFeatures).toEqual(["detail"]);
    copy.dispose();
    expect(group.disposed).toBe(false);
    expect(child.disposed).toBe(false);
    expect(scene.findByName("mesh")).toEqual([child]);
  });

  it("clones detached registered nodes through unregistered ancestors while preserving registry membership and metadata", () => {
    const scene = new Scene();
    const attached = scene.createGroup({ id: "attached", name: "attached" });
    const registered = scene.createGroup({ id: "registered", name: "registered" });
    const sibling = scene.createGroup({ id: "sibling", name: "sibling" });
    const attachedUnregistered = new SceneNode({ id: "attached-unregistered", name: "attached-unregistered" });
    const ancestor = new SceneNode({ id: "ancestor", name: "ancestor" });
    const middle = new SceneNode({ id: "middle", name: "middle" });
    const leaf = new SceneNode({ id: "leaf", name: "leaf" });
    const externalSibling = new SceneNode({ id: "external-sibling", name: "external-sibling" });
    scene.root.addChild(attached).addChild(attachedUnregistered);
    ancestor.transform.setPosition(10, 0, 0);
    middle.transform.setPosition(2, 0, 0);
    registered.transform.setPosition(3, 0, 0);
    ancestor.addChild(sibling).addChild(middle).addChild(externalSibling);
    middle.addChild(registered);
    registered.addChild(leaf);
    scene.root.userData = { ancestor, middle, leaf, externalSibling };
    ancestor.userData = { scene, metadata: scene.metadata, registered };
    scene.metadata.registerAsset({ id: "asset", nodeIds: [ancestor.id, middle.id, registered.id, leaf.id, "outside"] });
    scene.metadata.assignMaterial({ nodeId: ancestor.id, materialId: "material" });
    scene.metadata.addPlan({ id: "plan", kind: "animation", description: "move", nodeIds: [middle.id, sibling.id] });

    const copy = scene.clone();
    const copiedRoot = copy.root;
    const copiedAttached = copy.getRegisteredNodes().find((node) => node.name === "attached");
    const copiedRegistered = copy.getRegisteredNodes().find((node) => node.name === "registered");
    const copiedSibling = copy.getRegisteredNodes().find((node) => node.name === "sibling");
    const copiedMiddle = copiedRegistered!.parent;
    const copiedAncestor = copiedMiddle?.parent;
    const copiedLeaf = copiedRegistered!.children[0];
    const copiedExternalSibling = copiedAncestor?.children[2];

    expect(copiedMiddle).not.toBeNull();
    expect(copiedAncestor).not.toBe(ancestor);
    expect(copiedAncestor?.parent).toBeNull();
    expect(copiedAncestor?.children).toEqual([copiedSibling, copiedMiddle, copiedExternalSibling]);
    expect(copiedMiddle?.children).toEqual([copiedRegistered]);
    expect(copiedLeaf?.parent).toBe(copiedRegistered);
    expect(copy.getRegisteredNodes()).toEqual([copiedRoot, copiedAttached, copiedRegistered, copiedSibling]);
    expect(copy.getNodeById(copiedAncestor!.id)).toBeUndefined();
    expect(copy.getNodeById(copiedMiddle!.id)).toBeUndefined();
    expect(copy.getNodeById(copiedLeaf!.id)).toBeUndefined();
    expect(copy.getNodeById(copy.root.children[1]!.id)).toBeUndefined();
    expect(copy.root.userData).toEqual({
      ancestor: copiedAncestor, middle: copiedMiddle, leaf: copiedLeaf, externalSibling: copiedExternalSibling
    });
    expect(copiedAncestor?.userData).toEqual({ scene: copy, metadata: copy.metadata, registered: copiedRegistered });
    expect(copy.metadata.assets[0]?.nodeIds).toEqual([
      copiedAncestor!.id, copiedMiddle!.id, copiedRegistered!.id, copiedLeaf!.id, "outside"
    ]);
    expect(copy.metadata.materialAssignments[0]?.nodeId).toBe(copiedAncestor!.id);
    expect(copy.metadata.plans[0]?.nodeIds).toEqual([copiedMiddle!.id, copiedSibling!.id]);
    copiedAncestor!.updateWorldTransform();
    expect(copiedRegistered!.transform.worldMatrix.slice(12, 15)).toEqual([15, 0, 0]);
    expect(registered.parent).toBe(middle);
    expect(ancestor.children).toEqual([sibling, middle, externalSibling]);
  });

  it("reserves IDs of unregistered detached ancestors when cloning into a scene", () => {
    let constructions = 0;
    class CollidingNode extends SceneNode {
      constructor() {
        super({ id: constructions++ === 0 ? "source" : "ancestor", name: "source" });
      }
    }
    const scene = new Scene();
    const ancestor = new SceneNode({ id: "ancestor" });
    const source = new CollidingNode();
    ancestor.addChild(source);
    scene.registerNode(source);

    const copy = scene.cloneNode(source);

    expect(copy.id).not.toBe(ancestor.id);
    expect(scene.getNodeById(copy.id)).toBe(copy);
    expect(scene.getNodeById(ancestor.id)).toBeUndefined();
    expect(source.parent).toBe(ancestor);
  });

  it("rejects inconsistent detached parent links rather than omitting ancestry", () => {
    const scene = new Scene();
    const node = scene.createGroup({ id: "registered" });
    const ancestor = new SceneNode({ id: "ancestor" });
    node.parent = ancestor;

    expect(() => scene.clone()).toThrow(/hierarchy/i);
    expect(node.parent).toBe(ancestor);
    expect(scene.getNodeById(node.id)).toBe(node);
  });

  it("rejects a registry change made by a scene clone factory", () => {
    const scene = new Scene();
    class RegisteringNode extends SceneNode {
      protected override createCloneInstance(): this {
        scene.createGroup({ id: "late" });
        return new RegisteringNode() as this;
      }
    }
    const source = new RegisteringNode({ id: "source" });
    scene.registerNode(source);

    expect(() => scene.clone()).toThrow(/registry.*changed/i);
    expect(scene.getNodeById("source")).toBe(source);
    expect(scene.getNodeById("late")).toBeDefined();
  });

  it("rejects an ancestor ID changed by a clone factory before remapping metadata", () => {
    const scene = new Scene();
    const ancestor = new SceneNode({ id: "ancestor" });
    class RenamingNode extends SceneNode {
      protected override createCloneInstance(): this {
        (ancestor as { id: string }).id = "renamed";
        return new RenamingNode() as this;
      }
    }
    const node = new RenamingNode({ id: "registered" });
    ancestor.addChild(node);
    scene.registerNode(node);
    scene.metadata.registerAsset({ id: "asset", nodeIds: ["ancestor", "registered"] });

    expect(() => scene.clone()).toThrow(/changed/i);
    expect(scene.metadata.assets[0]?.nodeIds).toEqual(["ancestor", "registered"]);
  });

  it("remaps scene and scene-metadata references only when their owning scene is cloned", () => {
    const scene = new Scene();
    const node = scene.createNode("node");
    scene.root.addChild(node);
    scene.root.userData = { scene, metadata: scene.metadata };
    node.userData = { scene, metadata: scene.metadata };

    const copiedScene = scene.clone();
    const copiedNode = copiedScene.findByName("node")[0]!;
    const ownedCopy = scene.cloneNode(node);
    const detachedCopy = node.clone();

    expect(copiedScene.root.userData.scene).toBe(copiedScene);
    expect(copiedScene.root.userData.metadata).toBe(copiedScene.metadata);
    expect(copiedNode.userData.scene).toBe(copiedScene);
    expect(copiedNode.userData.metadata).toBe(copiedScene.metadata);
    expect(ownedCopy.userData.scene).toBe(scene);
    expect(ownedCopy.userData.metadata).toBe(scene.metadata);
    expect(detachedCopy.userData.scene).toBe(scene);
  });

  it("does not turn an external metadata ID into a cloned node ID", () => {
    let constructed = 0;
    class ReservedIdNode extends SceneNode {
      constructor() {
        super({ id: constructed++ === 0 ? "source" : "external", name: "named" });
      }
    }
    const scene = new Scene();
    const node = new ReservedIdNode();
    scene.root.addChild(node);
    scene.registerSubtree(node);
    scene.metadata.registerAsset({ id: "asset", nodeIds: ["external", node.id] });
    scene.metadata.addPlan({ id: "plan", kind: "camera", description: "view", nodeIds: ["external"] });

    const copy = scene.clone();
    const clonedNode = copy.findByName("named")[0]!;

    expect(clonedNode.id).not.toBe("external");
    expect(copy.getNodeById("external")).toBeUndefined();
    expect(copy.metadata.assets[0]?.nodeIds).toEqual(["external", clonedNode.id]);
    expect(copy.metadata.plans[0]?.nodeIds).toEqual(["external"]);
  });

  it("can register and reparent a cloned subtree without affecting the source subtree", () => {
    const scene = new Scene();
    const source = scene.createGroup({ id: "source", name: "source" });
    const child = scene.createMesh({ id: "child", name: "child", renderable: { geometry: "g", material: "m" } });
    scene.root.addChild(source);
    source.addChild(child);
    source.transform.setPosition(5, 0, 0);
    child.transform.setPosition(0, 2, 0);
    scene.update();

    const copy = source.clone();
    scene.registerSubtree(copy);
    scene.root.addChild(copy);
    copy.transform.setPosition(-3, 0, 0);
    scene.update();

    expect(scene.findByName("child")).toEqual([child, copy.children[0]]);
    expect(scene.getNodeById(copy.id)).toBe(copy);
    expect(scene.getNodeById(copy.children[0]!.id)).toBe(copy.children[0]);
    expect(child.transform.worldMatrix.slice(12, 15)).toEqual([5, 2, 0]);
    expect(copy.children[0]!.transform.worldMatrix.slice(12, 15)).toEqual([-3, 2, 0]);
    expect(scene.removeNode(copy)).toBe(true);
    expect(scene.getNodeById(copy.id)).toBeUndefined();
    expect(scene.getNodeById(copy.children[0]!.id)).toBeUndefined();
    expect(scene.getNodeById(child.id)).toBe(child);
    copy.dispose();
    expect(child.disposed).toBe(false);
  });

  it("registers scene-owned clones with IDs distinct from registered, attached and external IDs", () => {
    let constructed = 0;
    class CollidingNode extends SceneNode {
      constructor() {
        const id = ["source", "already-attached", "external"][constructed++] ?? "later";
        super({ id, name: "colliding" });
      }
    }
    const scene = new Scene();
    const attached = new SceneNode({ id: "already-attached", name: "attached" });
    const source = new CollidingNode();
    const child = new SceneNode({ id: "child", name: "child" });
    source.addChild(child);
    scene.registerSubtree(source);
    scene.root.addChild(attached).addChild(source);
    scene.metadata.registerAsset({ id: "asset", nodeIds: ["external"] });

    const copy = scene.cloneNode(source);

    expect(copy).toBeInstanceOf(CollidingNode);
    expect(copy.parent).toBeNull();
    expect(copy.id).not.toBe("already-attached");
    expect(copy.id).not.toBe("external");
    expect(scene.getNodeById(copy.id)).toBe(copy);
    expect(scene.getNodeById(copy.children[0]!.id)).toBe(copy.children[0]);
    expect(source.children).toEqual([child]);
    expect(scene.findByName("colliding")).toEqual([source]);
    scene.root.addChild(copy);
    expect(scene.findByName("colliding")).toEqual([source, copy]);
    const shallow = scene.cloneNode(source, false);
    expect(shallow.id).not.toBe("external");
    expect(scene.getNodeById("external")).toBeUndefined();
  });

  it("supports shallow scene-owned clones without registering skipped descendants", () => {
    const scene = new Scene();
    const source = scene.createGroup({ name: "source" });
    const child = scene.createNode("child");
    source.addChild(child);
    scene.root.addChild(source);

    const copy = scene.cloneNode(source, { recursive: false });

    expect(copy.children).toEqual([]);
    expect(copy.id).not.toBe(source.id);
    expect(scene.getNodeById(copy.id)).toBe(copy);
    expect(scene.getNodeById(child.id)).toBe(child);
    expect(child.parent).toBe(source);
  });

  it("copies a dirty affine transform without updating the source or its listeners", () => {
    const source = new SceneNode({ name: "source" });
    source.setLocalBounds(new Bounds3([-1, -1, -1], [1, 1, 1]));
    source.updateWorldTransform();
    const dirty = vi.fn();
    source.transform.onDirty(dirty);
    source.transform.setPosition(3, 0, 0).setPivot(1, 0, 0).setScale(0, 2, -1);
    const publishedWorld = [...source.transform.worldMatrix];
    dirty.mockClear();

    const copy = source.clone();
    copy.updateWorldTransform();
    const bounds = copy.updateWorldBounds();

    expect(source.transform.isDirty()).toBe(true);
    expect(source.transform.worldMatrix).toEqual(publishedWorld);
    expect(dirty).not.toHaveBeenCalled();
    expect(copy.transform.pivot).toEqual([1, 0, 0]);
    expect(copy.transform.scale).toEqual([0, 2, -1]);
    expect(bounds.min).toEqual([4, -2, -1]);
    expect(bounds.max).toEqual([4, 2, 1]);
  });

  it("preserves external node references and rejects unsupported state without running accessors", () => {
    const source = new SceneNode({ name: "source" });
    const external = new SceneNode({ name: "external" });
    source.userData = { external };
    expect(source.clone().userData.external).toBe(external);

    const getter = vi.fn(() => 7);
    source.userData = Object.defineProperty({}, "danger", { enumerable: true, get: getter });
    expect(() => source.clone()).toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled();

    source.userData = { pending: Promise.resolve(1) };
    expect(() => source.clone()).toThrow(/clone method/i);
    expect(source.disposed).toBe(false);
  });

  it("never evaluates accessors while detecting scene ownership or custom clone methods", () => {
    const source = new SceneNode();
    const brandGetter = vi.fn(() => true);
    source.userData = Object.defineProperty({}, Symbol.for("@aura3d/scene/clone-owner"), { get: brandGetter });
    expect(() => source.clone()).toThrow(/accessor/i);
    expect(brandGetter).not.toHaveBeenCalled();

    const cloneGetter = vi.fn(() => () => ({}));
    class AccessorData {
      get clone(): () => object {
        return cloneGetter();
      }
    }
    source.userData = { data: new AccessorData() };
    expect(() => source.clone()).toThrow(/accessor/i);
    expect(cloneGetter).not.toHaveBeenCalled();
  });

  it("does not register a partial scene clone when copying state fails", () => {
    let constructed = 0;
    class StatefulNode extends SceneNode {
      constructor() {
        super({ id: constructed++ === 0 ? "source" : "attempt" });
      }
    }
    const scene = new Scene();
    const source = new StatefulNode();
    scene.registerSubtree(source);
    scene.root.addChild(source);
    source.userData = { pending: Promise.resolve(1) };

    expect(() => scene.cloneNode(source)).toThrow(/clone method/i);
    expect(scene.getNodeById("source")).toBe(source);
    expect(scene.getNodeById("attempt")).toBeUndefined();
    expect(scene.root.children).toEqual([source]);
    expect(source.parent).toBe(scene.root);
  });

  it("does not overwrite a scene registration created during a clone factory", () => {
    const scene = new Scene();
    class ReentrantNode extends SceneNode {
      constructor(id: string) {
        super({ id });
      }

      protected override createCloneInstance(): this {
        scene.createObject3D({ id: "created-during-clone", name: "existing" });
        return new ReentrantNode("created-during-clone") as this;
      }
    }
    const source = new ReentrantNode("source");
    scene.registerSubtree(source);

    expect(() => scene.cloneNode(source)).toThrow(/duplicate/i);
    expect(scene.getNodeById("created-during-clone")?.name).toBe("existing");
    expect(scene.getNodeById("source")).toBe(source);
  });

  it("rejects a hierarchy changed by a custom clone factory", () => {
    class ChangingNode extends SceneNode {
      protected override createCloneInstance(): this {
        this.addChild(new SceneNode({ name: "late" }));
        return new ChangingNode() as this;
      }
    }
    const source = new ChangingNode();
    const child = new SceneNode({ name: "original" });
    source.addChild(child);

    expect(() => source.clone()).toThrow(/hierarchy.*changed/i);
    expect(source.children.map((node) => node.name)).toEqual(["original", "late"]);
    expect(child.parent).toBe(source);
  });

  it("does not silently strip container subclass behavior from cloned metadata", () => {
    class NamedMap extends Map<string, number> {
      readonly label = "counts";
    }
    const node = new SceneNode();
    node.userData = { counts: new NamedMap([["a", 1]]) };

    expect(() => node.clone()).toThrow(/subclass/i);
    expect((node.userData.counts as NamedMap).get("a")).toBe(1);
  });

  it("copies custom state on standard metadata containers without sharing it", () => {
    const node = new SceneNode();
    const shared = { count: 1 };
    const date = Object.assign(new Date("2026-01-01T00:00:00.000Z"), { shared });
    const lookup = Object.assign(new Map([["x", 1]]), { shared });
    const view = Object.assign(new Uint8Array([1, 2]), { shared });
    node.userData = { shared, date, lookup, view };

    const copy = node.clone();
    const copiedShared = copy.userData.shared as { count: number };

    expect((copy.userData.date as typeof date).shared).toBe(copiedShared);
    expect((copy.userData.lookup as typeof lookup).shared).toBe(copiedShared);
    expect((copy.userData.view as typeof view).shared).toBe(copiedShared);
    expect(copiedShared).not.toBe(shared);
  });

  it("preserves cyclic references between cloned buffers and their views", () => {
    const buffer = new ArrayBuffer(8) as ArrayBuffer & { owner?: Uint8Array };
    const view = new Uint8Array(buffer, 2, 2) as Uint8Array & { bufferOwner?: ArrayBuffer };
    buffer.owner = view;
    view.bufferOwner = buffer;
    view.set([3, 7]);
    const node = new SceneNode();
    node.userData = { view };

    const copiedView = node.clone().userData.view as typeof view;
    const copiedBuffer = copiedView.buffer as typeof buffer;

    expect(copiedView).not.toBe(view);
    expect(copiedBuffer).not.toBe(buffer);
    expect(copiedBuffer.owner).toBe(copiedView);
    expect(copiedView.bufferOwner).toBe(copiedBuffer);
    expect([...copiedView]).toEqual([3, 7]);
  });

  it("rejects subclass accessor state instead of copying a closure bound to the original", () => {
    class AccessorNode extends SceneNode {
      constructor() {
        super();
        Object.defineProperty(this, "computed", { enumerable: true, get: () => this.name });
      }
    }
    const source = new AccessorNode();
    expect(() => source.clone()).toThrow(/accessor/i);
  });

  it("rejects disposed and inconsistent hierarchies without modifying the originals", () => {
    const disposed = new SceneNode({ name: "disposed" });
    disposed.dispose();
    expect(() => disposed.clone()).toThrow(/disposed/i);

    const root = new SceneNode({ name: "root" });
    const child = new SceneNode({ name: "child" });
    root.children.push(child);
    expect(() => root.clone()).toThrow(/hierarchy/i);
    expect(root.children).toEqual([child]);
    expect(child.parent).toBeNull();
  });

  it("allows subclasses with required constructors to provide a fresh clone instance", () => {
    class TaggedNode extends SceneNode {
      readonly payload: { value: number };

      constructor(readonly tag: string) {
        if (!tag) throw new Error("tag is required");
        super({ name: tag });
        this.payload = { value: 3 };
      }

      protected override createCloneInstance(): this {
        return new TaggedNode(this.tag) as this;
      }
    }
    const source = new TaggedNode("tagged");
    source.payload.value = 7;
    const copy = source.clone();
    expect(copy).toBeInstanceOf(TaggedNode);
    expect(copy.tag).toBe("tagged");
    expect(copy.payload).toEqual({ value: 7 });
    expect(copy.payload).not.toBe(source.payload);
  });

  it("lets subclass clone factories preserve private constructor state", () => {
    class PrivateNode extends SceneNode {
      #level: number;

      constructor(level: number) {
        if (!Number.isInteger(level)) throw new Error("level is required");
        super();
        this.#level = level;
      }

      protected override createCloneInstance(): this {
        return new PrivateNode(this.#level) as this;
      }

      get level(): number {
        return this.#level;
      }

      set level(value: number) {
        this.#level = value;
      }
    }
    const source = new PrivateNode(4);
    const copy = source.clone();
    copy.level = 10;
    expect(copy.level).toBe(10);
    expect(source.level).toBe(4);
  });

  it("keeps constructor-created subclass callbacks bound to their own instance", () => {
    class CallbackNode extends SceneNode {
      readonly activate = () => { this.name = "activated"; };
    }
    const source = new CallbackNode({ name: "original" });
    source.userData = { activate: source.activate };
    const copy = source.clone();

    expect(copy.userData.activate).toBe(copy.activate);
    copy.activate();

    expect(copy.name).toBe("activated");
    expect(source.name).toBe("original");
  });

  it("remaps render callbacks that are bound subclass methods", () => {
    class DrawNode extends SceneNode {
      readonly draw = () => { this.name = "drawn"; };

      constructor() {
        super({ name: "original" });
        this.onBeforeRender = this.draw;
      }
    }
    const source = new DrawNode();
    const copy = source.clone();

    copy.onBeforeRender?.(undefined, copy);

    expect(copy.onBeforeRender).toBe(copy.draw);
    expect(copy.name).toBe("drawn");
    expect(source.name).toBe("original");
  });
});
