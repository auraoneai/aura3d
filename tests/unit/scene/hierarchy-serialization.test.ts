import { Bounds3, DirectionalLight, Group, InstancedMesh, Mesh, Object3D, PerspectiveCamera, PointLight, Renderable, Scene, SceneNode, SkinnedMesh, SpotLight, batchReparent, deserializeScene, serializeScene } from "@aura3d/scene";
import { describe, expect, it } from "vitest";

describe("scene hierarchy, query, and serialization", () => {
  it("rejects hierarchy cycles and self-parenting", () => {
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    parent.addChild(child);

    expect(() => parent.addChild(parent)).toThrow(/self/i);
    expect(() => child.addChild(parent)).toThrow(/cycle/i);
  });

  it("keeps traversal deterministic when nodes are removed during traversal", () => {
    const scene = new Scene();
    const a = scene.createNode("a");
    const b = scene.createNode("b");
    scene.root.addChild(a);
    scene.root.addChild(b);
    const visited: string[] = [];

    scene.traverse((node) => {
      visited.push(node.name);
      if (node === a) scene.root.removeChild(b);
    });

    expect(visited).toEqual(["root", "a", "b"]);
  });

  it("collects renderables without mutating scene transforms", () => {
    const scene = new Scene();
    const node = scene.createNode("mesh");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    scene.updateWorldTransforms();

    const before = [...node.transform.worldMatrix];
    const renderables = scene.collectRenderables();

    expect(renderables).toHaveLength(1);
    expect(node.transform.worldMatrix).toEqual(before);
  });

  it("exposes Three.js-style Object3D, Group, Mesh, SkinnedMesh, and InstancedMesh scene objects", () => {
    const scene = new Scene();
    const group = scene.createGroup({ name: "group", userData: { role: "root-group" } });
    const mesh = scene.createMesh({
      name: "mesh",
      renderable: { geometry: "geometry:mesh", material: "material:mesh" }
    });
    const skinned = scene.createSkinnedMesh({
      name: "skinned",
      renderable: {
        geometry: "geometry:skin",
        material: "material:skin",
        skinning: { jointCount: 1, matrices: new Float32Array(16).fill(1) }
      }
    });
    const instanced = scene.createInstancedMesh({
      name: "instanced",
      renderable: {
        geometry: "geometry:instance",
        material: "material:instance",
        instanceTransforms: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          3, 0, 0, 1
        ],
        instanceColors: [0.2, 0.6, 1, 1]
      }
    });

    scene.root.addChild(group);
    group.addChild(mesh).addChild(skinned).addChild(instanced);
    group.position[0] = 2;
    group.transform.markDirty();
    scene.updateWorldTransforms();

    expect(group).toBeInstanceOf(Group);
    expect(group).toBeInstanceOf(Object3D);
    expect(mesh).toBeInstanceOf(Mesh);
    expect(skinned).toBeInstanceOf(SkinnedMesh);
    expect(instanced).toBeInstanceOf(InstancedMesh);
    expect(group.userData.role).toBe("root-group");
    expect(mesh.matrixWorld[12]).toBeCloseTo(2);
    expect(skinned.skinning?.jointCount).toBe(1);
    expect(instanced.instanceTransforms).toBeInstanceOf(Float32Array);
    expect(instanced.instanceColors).toBeInstanceOf(Float32Array);
    instanced.setInstanceColors([1, 0.4, 0.2, 1]);
    expect(Array.from(instanced.instanceColors ?? [])).toEqual(expect.arrayContaining([
      expect.closeTo(1),
      expect.closeTo(0.4),
      expect.closeTo(0.2),
      expect.closeTo(1)
    ]));
    expect(scene.collectRenderables().map((entry) => entry.node.name)).toEqual(["mesh", "skinned", "instanced"]);
  });

  it("tracks visibility, layers, render order, identity, user data, and disposal semantics", () => {
    const scene = new Scene();
    const group = scene.createGroup({
      id: "group-id",
      name: "group",
      visible: false,
      layerMask: 4,
      renderOrder: 7,
      userData: { role: "container" }
    });
    const mesh = scene.createMesh({
      name: "mesh",
      renderable: { geometry: "geometry:mesh", material: "material:mesh" }
    });
    scene.root.addChild(group);
    group.addChild(mesh);

    expect(group.id).toBe("group-id");
    expect(group.visible).toBe(false);
    expect(group.layerMask).toBe(4);
    expect(group.renderOrder).toBe(7);
    expect(group.userData.role).toBe("container");
    expect(scene.findByName("mesh")).toEqual([mesh]);

    group.dispose();

    expect(group.disposed).toBe(true);
    expect(mesh.disposed).toBe(true);
    expect(group.parent).toBeNull();
    expect(group.children).toEqual([]);
    expect(group.userData).toEqual({});
    expect(group.visible).toBe(false);
    expect(group.renderable).toBeUndefined();
    expect(() => group.addChild(scene.createNode("late"))).toThrow(/disposed/i);
  });

  it("can reparent while preserving a node world transform", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old-parent");
    const newParent = scene.createNode("new-parent");
    const child = scene.createNode("child");
    oldParent.transform.setPosition(10, 0, 0);
    newParent.transform.setPosition(-5, 0, 0);
    child.transform.setPosition(1, 2, 3);
    scene.root.addChild(oldParent);
    scene.root.addChild(newParent);
    oldParent.addChild(child);
    scene.updateWorldTransforms();
    const before = [...child.transform.worldMatrix];

    newParent.addChild(child, { preserveWorldTransform: true });
    scene.updateWorldTransforms();

    expect(child.parent).toBe(newParent);
    expect(child.transform.worldMatrix).toEqual(before);
    expect(child.transform.position).toEqual([16, 2, 3]);
  });

  it("supports manual local matrix mode for advanced scene graph users", () => {
    const scene = new Scene();
    const parent = scene.createGroup({ name: "manual-parent" });
    const child = scene.createObject3D({ name: "manual-child" });
    parent.transform.setPosition(10, 0, 0);
    child.setLocalMatrix([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      2, 3, 4, 1
    ], { decompose: false });
    parent.addChild(child);
    scene.root.addChild(parent);

    scene.updateWorldTransforms();
    expect(child.matrixAutoUpdate).toBe(false);
    expect(child.matrix[12]).toBe(2);
    expect(child.matrixWorld[12]).toBe(12);
    expect(child.matrixWorld[13]).toBe(3);
    expect(child.matrixWorld[14]).toBe(4);

    child.position[0] = 100;
    child.transform.markDirty();
    scene.updateWorldTransforms();
    expect(child.matrixWorld[12]).toBe(12);

    child.matrixAutoUpdate = true;
    scene.updateWorldTransforms();
    expect(child.matrixWorld[12]).toBe(110);
  });

  it("propagates dirty transforms from parent mutations to descendants", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = scene.createNode("child");
    parent.addChild(child);
    scene.root.addChild(parent);
    scene.updateWorldTransforms();

    parent.transform.setPosition(3, 0, 0);
    expect(child.transform.isDirty()).toBe(true);
    scene.updateWorldTransforms();

    expect(child.transform.worldMatrix[12]).toBe(3);
  });

  it("batch reparents and rejects cycles through hierarchy helpers", () => {
    const scene = new Scene();
    const target = scene.createNode("target");
    const a = scene.createNode("a");
    const b = scene.createNode("b");
    scene.root.addChild(target);
    scene.root.addChild(a);
    scene.root.addChild(b);

    batchReparent([a, b], target);

    expect(target.children.map((child) => child.name)).toEqual(["a", "b"]);
    expect(() => batchReparent([target], a)).toThrow(/cycle/i);
  });

  it("updates hierarchy world bounds and supports bounds queries after removal", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const inside = scene.createNode("inside");
    const outside = scene.createNode("outside");
    parent.transform.setPosition(10, 0, 0);
    inside.transform.setPosition(1, 0, 0);
    outside.transform.setPosition(100, 0, 0);
    inside.setLocalBounds(Bounds3.fromCenterSize([0, 0, 0], [2, 2, 2]));
    outside.setLocalBounds(Bounds3.fromCenterSize([0, 0, 0], [2, 2, 2]));
    parent.addChild(inside);
    scene.root.addChild(parent);
    scene.root.addChild(outside);

    scene.updateWorldBounds();

    expect(parent.worldBounds.min).toEqual([10, -1, -1]);
    expect(parent.worldBounds.max).toEqual([12, 1, 1]);
    expect(scene.query({ bounds: Bounds3.fromCenterSize([11, 0, 0], [1, 1, 1]) }).map((node) => node.name)).toEqual(["root", "parent", "inside"]);

    scene.removeNode(inside);
    expect(scene.query({ bounds: Bounds3.fromCenterSize([11, 0, 0], [1, 1, 1]) }).map((node) => node.name)).toEqual([]);
  });

  it("roundtrips a simple hierarchy with stable serialized transform data", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = scene.createNode("child");
    child.transform.setPosition(1, 2, 3);
    parent.addChild(child);
    scene.root.addChild(parent);

    const restored = deserializeScene(serializeScene(scene));

    expect(restored.findByName("child")).toHaveLength(1);
    expect(restored.root.children[0]?.children[0]?.transform.position).toEqual([1, 2, 3]);
  });

  it("roundtrips scene metadata for provenance, plans, unsupported features, and revisions", () => {
    const scene = new Scene();
    const mesh = scene.createMesh({
      id: "mesh-node",
      name: "metadata-mesh",
      renderable: { geometry: "geometry:mesh", material: "material:matte" }
    });
    scene.root.addChild(mesh);
    scene.metadata.deterministicSeed = 1337;
    scene.metadata
      .registerAsset({
        id: "asset:robot-arm",
        uri: "/fixtures/robot-arm.glb",
        source: "gltf-corpus",
        loader: "@aura3d/assets",
        nodeIds: [mesh.id],
        materialIds: ["material:matte"]
      })
      .assignMaterial({
        nodeId: mesh.id,
        materialId: "material:matte",
        unsupportedFeatures: ["KHR_materials_transmission"]
      })
      .addPlan({
        id: "shot:orbit",
        kind: "camera",
        description: "Orbit around the imported robot arm.",
        nodeIds: [mesh.id],
        deterministicSeed: 1337
      })
      .discloseUnsupportedFeature("articulated robot dynamics", "Only static imported mesh metadata is present.")
      .recordRevision({
        summary: "Seeded scene metadata contract for route evidence.",
        deterministicSeed: 1337
      });

    const serialized = serializeScene(scene);
    const restored = deserializeScene(serialized);

    expect(serialized.metadata?.deterministicSeed).toBe(1337);
    expect(serialized.metadata?.assets?.[0]?.nodeIds).toEqual([mesh.id]);
    expect(restored.metadata.assets[0]?.source).toBe("gltf-corpus");
    expect(restored.metadata.materialAssignments[0]?.unsupportedFeatures).toEqual(["KHR_materials_transmission"]);
    expect(restored.metadata.plans[0]).toMatchObject({ id: "shot:orbit", kind: "camera", deterministicSeed: 1337 });
    expect(restored.metadata.unsupportedFeatures()[0]).toMatchObject({
      feature: "articulated robot dynamics",
      status: "unsupported"
    });
    expect(restored.metadata.revisions[0]).toMatchObject({
      id: "revision-1",
      summary: "Seeded scene metadata contract for route evidence.",
      deterministicSeed: 1337
    });
  });

  it("roundtrips node registry, renderables, cameras, and lights with stable IDs", () => {
    const scene = new Scene();
    const mesh = scene.createNode("mesh");
    const camera = scene.createPerspectiveCamera({ name: "shot-camera", fovYRadians: Math.PI / 4, aspect: 1.5, near: 0.25, far: 250 });
    const directional = scene.createLight("directional", "sun") as DirectionalLight;
    const point = scene.createLight("point", "lamp") as PointLight;
    const spot = scene.createLight("spot", "cone") as SpotLight;
    camera.setViewport({ x: 1, y: 2, width: 320, height: 180 });
    directional.intensity = 3;
    directional.castsShadow = true;
    point.range = 7;
    spot.angle = Math.PI / 6;
    spot.penumbra = 0.25;
    scene.addRenderable(mesh, new Renderable({
      geometry: "geometry:mesh",
      material: "material:pbr",
      layerMask: 2,
      castShadow: true,
      receiveShadow: false,
      morphWeights: [0.25, 0.75],
      instanceTransforms: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        2, 0, 0, 1
      ],
      instanceColors: [0.1, 0.2, 0.3, 1]
    }));
    scene.root.addChild(mesh);
    scene.root.addChild(camera);
    scene.root.addChild(directional);
    scene.root.addChild(point);
    scene.root.addChild(spot);

    const restored = deserializeScene(serializeScene(scene));
    const restoredCamera = restored.getNodeById(camera.id);
    const restoredMesh = restored.getNodeById(mesh.id);
    const restoredPoint = restored.getNodeById(point.id);
    const restoredSpot = restored.getNodeById(spot.id);

    expect(restoredMesh?.id).toBe(mesh.id);
    expect(restored.collectRenderables()[0]?.renderable).toMatchObject({ geometry: "geometry:mesh", material: "material:pbr", layerMask: 2, castShadow: true, receiveShadow: false, morphWeights: [0.25, 0.75] });
    expect(Array.from(restored.collectRenderables()[0]?.renderable.instanceTransforms ?? [])).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      2, 0, 0, 1
    ]);
    expect(Array.from(restored.collectRenderables()[0]?.renderable.instanceColors ?? [])).toEqual(expect.arrayContaining([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
      expect.closeTo(1)
    ]));
    expect(restoredCamera).toBeInstanceOf(PerspectiveCamera);
    expect((restoredCamera as PerspectiveCamera).aspect).toBe(1.5);
    expect((restoredCamera as PerspectiveCamera).viewport).toEqual({ x: 1, y: 2, width: 320, height: 180 });
    expect(restored.findByName("sun")[0]).toBeInstanceOf(DirectionalLight);
    expect(restored.collectLights()).toHaveLength(3);
    expect((restoredPoint as PointLight).range).toBe(7);
    expect((restoredSpot as SpotLight).penumbra).toBe(0.25);
  });
});
