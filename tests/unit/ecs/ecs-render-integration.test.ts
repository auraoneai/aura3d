import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "@aura3d/math";
import {
  ActiveComponent,
  CameraComponent,
  HierarchyComponent,
  HierarchySystem,
  LightComponent,
  MeshComponent,
  NameComponent,
  TransformComponent,
  World,
  WorldTransformComponent,
  TransformSystem,
  CameraSystem,
  ActiveSystem,
} from "@aura3d/ecs";

describe("ECS render components and systems", () => {
  describe("WorldTransformComponent", () => {
    it("is written by TransformSystem for root entities", () => {
      const world = new World();
      world.registerComponent(TransformComponent);
      world.registerComponent(HierarchyComponent);
      world.registerComponent(WorldTransformComponent);
      world.systems.add(new TransformSystem(), world);

      const entity = world.createEntity();
      world.add(entity, TransformComponent, new TransformComponent(
        new Vector3(1, 2, 3),
        Quaternion.identity,
        Vector3.one
      ));
      world.add(entity, HierarchyComponent, new HierarchyComponent());

      world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

      const wt = world.get(entity, WorldTransformComponent);
      expect(wt).toBeDefined();
      // Position should be [1,2,3] in the 4th column
      expect(Array.from(wt!.worldMatrix).slice(12, 15)).toEqual([1, 2, 3]);
    });

    it("inherits parent transform via hierarchy", () => {
      const world = new World();
      world.registerComponent(TransformComponent);
      world.registerComponent(HierarchyComponent);
      world.registerComponent(WorldTransformComponent);
      const hierarchy = new HierarchySystem();
      world.systems.add(hierarchy, world);
      world.systems.add(new TransformSystem(), world);

      const parent = world.createEntity();
      world.add(parent, TransformComponent, new TransformComponent(
        new Vector3(10, 0, 0),
        Quaternion.identity,
        Vector3.one
      ));
      world.add(parent, HierarchyComponent, new HierarchyComponent());

      const child = world.createEntity();
      world.add(child, TransformComponent, new TransformComponent(
        new Vector3(5, 0, 0),
        Quaternion.identity,
        Vector3.one
      ));
      world.add(child, HierarchyComponent, new HierarchyComponent());
      hierarchy.setParent(world, child, parent);

      world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

      const childWt = world.get(child, WorldTransformComponent);
      expect(childWt).toBeDefined();
      // Child world position = parent(10,0,0) + child(5,0,0) = (15,0,0)
      expect(Array.from(childWt!.worldMatrix).slice(12, 15)).toEqual([15, 0, 0]);
    });

    it("computes normal matrix from world matrix", () => {
      const world = new World();
      world.registerComponent(TransformComponent);
      world.registerComponent(HierarchyComponent);
      world.registerComponent(WorldTransformComponent);
      world.systems.add(new TransformSystem(), world);

      const entity = world.createEntity();
      world.add(entity, TransformComponent, new TransformComponent(
        Vector3.zero,
        Quaternion.identity,
        Vector3.one
      ));
      world.add(entity, HierarchyComponent, new HierarchyComponent());

      world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

      const wt = world.get(entity, WorldTransformComponent)!;
      // For identity world matrix, normal matrix should also be identity-ish
      expect(wt.normalMatrix[0]).toBeCloseTo(1);
      expect(wt.normalMatrix[5]).toBeCloseTo(1);
      expect(wt.normalMatrix[10]).toBeCloseTo(1);
    });
  });

  describe("CameraSystem", () => {
    it("computes projection and view matrices", () => {
      const world = new World();
      world.registerComponent(TransformComponent);
      world.registerComponent(HierarchyComponent);
      world.registerComponent(WorldTransformComponent);
      world.registerComponent(CameraComponent);
      world.systems.add(new TransformSystem(), world);
      world.systems.add(new CameraSystem(), world);

      const camEntity = world.createEntity();
      world.add(camEntity, TransformComponent, new TransformComponent(
        new Vector3(0, 0, 10),
        Quaternion.identity,
        Vector3.one
      ));
      world.add(camEntity, HierarchyComponent, new HierarchyComponent());

      const cam = new CameraComponent();
      cam.aspect = 16 / 9;
      world.add(camEntity, CameraComponent, cam);

      world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

      // View matrix should position camera at (0,0,10), so the translation
      // component of the inverse should be (0,0,-10) roughly
      const viewZ = cam.viewMatrix[14];
      expect(viewZ).toBeLessThan(0); // camera looks toward origin from +Z

      // Projection matrix should have perspective characteristics
      expect(cam.projectionMatrix[0]).not.toBe(1); // first element is f/aspect, not identity
      expect(cam.viewProjectionMatrix).toBeDefined();
    });

    it("supports orthographic kind", () => {
      const world = new World();
      world.registerComponent(TransformComponent);
      world.registerComponent(HierarchyComponent);
      world.registerComponent(WorldTransformComponent);
      world.registerComponent(CameraComponent);
      world.systems.add(new TransformSystem(), world);
      world.systems.add(new CameraSystem(), world);

      const camEntity = world.createEntity();
      world.add(camEntity, TransformComponent, new TransformComponent());
      world.add(camEntity, HierarchyComponent, new HierarchyComponent());

      const cam = new CameraComponent();
      cam.kind = "orthographic";
      world.add(camEntity, CameraComponent, cam);

      world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

      // Orthographic projection first element should be finite and non-zero
      expect(Number.isFinite(cam.projectionMatrix[0])).toBe(true);
      expect(cam.projectionMatrix[0]).not.toBe(0);
    });
  });

  describe("MeshComponent", () => {
    it("stores geometry and material handles", () => {
      const mesh = new MeshComponent("cube_geo", "red_mat");
      expect(mesh.geometry).toBe("cube_geo");
      expect(mesh.material).toBe("red_mat");
      expect(mesh.layerMask).toBe(1);
    });

    it("defaults castShadow and receiveShadow to true", () => {
      const mesh = new MeshComponent("g", "m");
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    });
  });

  describe("LightComponent", () => {
    it("defaults to white directional light", () => {
      const light = new LightComponent();
      expect(light.kind).toBe("directional");
      expect(light.color).toEqual([1, 1, 1]);
      expect(light.intensity).toBe(1);
      expect(light.range).toBe(10);
    });

    it("can be configured as point light", () => {
      const light = new LightComponent();
      light.kind = "point";
      light.range = 5;
      expect(light.kind).toBe("point");
      expect(light.range).toBe(5);
    });
  });

  describe("System ordering", () => {
    it("runs TransformSystem before CameraSystem", () => {
      const world = new World();
      world.registerComponent(TransformComponent);
      world.registerComponent(HierarchyComponent);
      world.registerComponent(WorldTransformComponent);
      world.registerComponent(CameraComponent);
      world.systems.add(new TransformSystem(), world);
      world.systems.add(new CameraSystem(), world);

      const camEntity = world.createEntity();
      world.add(camEntity, TransformComponent, new TransformComponent());
      world.add(camEntity, HierarchyComponent, new HierarchyComponent());
      world.add(camEntity, CameraComponent, new CameraComponent());

      // Should not throw — CameraSystem.after = ["TransformSystem"] is valid
      expect(() => world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 })).not.toThrow();
    });
  });
});
