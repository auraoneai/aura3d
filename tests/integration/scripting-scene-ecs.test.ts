import { describe, expect, it } from "vitest";
import { Scene, type SceneNode } from "@galileo3d/scene";
import { TransformComponent, type Entity, World } from "@galileo3d/ecs";
import { BehaviorHost, BehaviorSystem, type ScriptContext } from "@galileo3d/scripting";

describe("scripting scene and ECS integration", () => {
  it("moves a scene node and updates an ECS component through behavior services", async () => {
    const scene = new Scene();
    const node = scene.createNode("script-target");
    scene.root.addChild(node);

    const world = new World();
    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent([0, 0, 0]));

    const system = new BehaviorSystem();
    system.setService("world", world);
    system.setService("entity", entity);

    const host = new BehaviorHost({ target: node });
    host.attach({
      onUpdate: (context: ScriptContext) => {
        const target = context.target as SceneNode;
        target.transform.setPosition(1, 2, 3);

        const behaviorWorld = context.getService<World>("world");
        const behaviorEntity = context.getService<Entity>("entity");
        const transform = behaviorWorld.get(behaviorEntity, TransformComponent);
        if (!transform) throw new Error("Missing TransformComponent");
        transform.position = [4, 5, 6];
      }
    });
    system.registerHost(host);

    await system.update({ deltaSeconds: 1 / 60 });
    scene.updateWorldTransforms();

    expect(system.errors).toEqual([]);
    expect(node.transform.position).toEqual([1, 2, 3]);
    expect(node.transform.worldMatrix[12]).toBe(1);
    expect(world.get(entity, TransformComponent)?.position).toEqual([4, 5, 6]);
  });
});
