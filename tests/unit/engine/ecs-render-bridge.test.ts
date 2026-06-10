import { describe, expect, it } from "vitest";
import {
  ActiveComponent,
  HierarchyComponent,
  MeshComponent,
  NameComponent,
  TransformComponent,
  World,
  WorldTransformComponent,
  TransformSystem,
  ActiveSystem,
  LightComponent,
  CameraComponent,
} from "@aura3d/ecs";
import { createECSRenderSource } from "@aura3d/engine-runtime";

describe("ECS → RenderSource bridge", () => {
  it("collects render items from visible mesh entities", () => {
    const world = new World();
    world.registerComponent(TransformComponent);
    world.registerComponent(HierarchyComponent);
    world.registerComponent(WorldTransformComponent);
    world.registerComponent(MeshComponent);
    world.registerComponent(NameComponent);
    world.systems.add(new TransformSystem(), world);

    const entity = world.createEntity();
    world.add(entity, NameComponent, new NameComponent("test-cube"));
    world.add(entity, TransformComponent, new TransformComponent());
    world.add(entity, HierarchyComponent, new HierarchyComponent());
    world.add(entity, MeshComponent, new MeshComponent("test-geo", "test-mat"));

    world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

    const libraries = {
      geometry: new Map([["test-geo", { kind: "dummy" } as any]]),
      material: new Map([["test-mat", { kind: "dummy" } as any]]),
    };

    const source = createECSRenderSource({ world, libraries });
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : [];
    expect(items.length).toBe(1);
    expect(items[0]?.label).toBe("test-cube");
    expect(items[0]?.geometry).toBeDefined();
  });

  it("skips entities without resolved geometry", () => {
    const world = new World();
    world.registerComponent(TransformComponent);
    world.registerComponent(HierarchyComponent);
    world.registerComponent(WorldTransformComponent);
    world.registerComponent(MeshComponent);
    world.systems.add(new TransformSystem(), world);

    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent());
    world.add(entity, HierarchyComponent, new HierarchyComponent());
    world.add(entity, MeshComponent, new MeshComponent("missing-geo", "mat"));

    const libraries = {
      geometry: new Map<string, any>(),
      material: new Map<string, any>(),
    };

    const source = createECSRenderSource({ world, libraries });
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : [];
    expect(items.length).toBe(0);
  });

  it("skips inactive entities", () => {
    const world = new World();
    world.registerComponent(TransformComponent);
    world.registerComponent(HierarchyComponent);
    world.registerComponent(WorldTransformComponent);
    world.registerComponent(MeshComponent);
    world.registerComponent(ActiveComponent);
    world.systems.add(new ActiveSystem(), world);
    world.systems.add(new TransformSystem(), world);

    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent());
    world.add(entity, HierarchyComponent, new HierarchyComponent());
    world.add(entity, MeshComponent, new MeshComponent("geo", "mat"));
    world.add(entity, ActiveComponent, new ActiveComponent(false));

    const libraries = {
      geometry: new Map([["geo", { kind: "dummy" } as any]]),
      material: new Map([["mat", { kind: "dummy" } as any]]),
    };

    const source = createECSRenderSource({ world, libraries });
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : [];
    expect(items.length).toBe(0);
  });

  it("collects lights from light entities", () => {
    const world = new World();
    world.registerComponent(TransformComponent);
    world.registerComponent(HierarchyComponent);
    world.registerComponent(WorldTransformComponent);
    world.registerComponent(LightComponent);
    world.systems.add(new TransformSystem(), world);

    const lightEntity = world.createEntity();
    world.add(lightEntity, TransformComponent, new TransformComponent());
    world.add(lightEntity, HierarchyComponent, new HierarchyComponent());
    const light = new LightComponent();
    light.kind = "point";
    light.intensity = 2;
    world.add(lightEntity, LightComponent, light);

    world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

    const libraries = {
      geometry: new Map<string, any>(),
      material: new Map<string, any>(),
    };

    const source = createECSRenderSource({ world, libraries });
    const lights = source.collectedLights ? [...source.collectedLights] : [];
    expect(lights.length).toBe(1);
    expect(lights[0]?.kind).toBe("point");
    expect(lights[0]?.intensity).toBe(2);
  });

  it("provides cameraPosition when cameraEntity is set", () => {
    const world = new World();
    world.registerComponent(TransformComponent);
    world.registerComponent(HierarchyComponent);
    world.registerComponent(WorldTransformComponent);
    world.registerComponent(CameraComponent);
    world.systems.add(new TransformSystem(), world);

    const camEntity = world.createEntity();
    const tc = new TransformComponent();
    tc.position = [0, 5, 10];
    world.add(camEntity, TransformComponent, tc);
    world.add(camEntity, HierarchyComponent, new HierarchyComponent());
    world.add(camEntity, CameraComponent, new CameraComponent());

    world.update({ deltaTime: 1 / 60, elapsedTime: 0, frame: 0 });

    const libraries = {
      geometry: new Map<string, any>(),
      material: new Map<string, any>(),
    };

    const source = createECSRenderSource({ world, libraries, cameraEntity: camEntity });
    expect(source.cameraPosition).toEqual([0, 5, 10]);
  });
});
