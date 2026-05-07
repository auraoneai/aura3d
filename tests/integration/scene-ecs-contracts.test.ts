import { describe, expect, it } from "vitest";
import { Scene } from "@galileo3d/scene";
import { TransformComponent, World } from "@galileo3d/ecs";

describe("scene and ECS transform contracts", () => {
  it("keeps scene hierarchy ownership separate from ECS transform data", () => {
    const scene = new Scene();
    const node = scene.createNode("scene-node");
    scene.root.addChild(node);
    node.transform.setPosition(10, 0, 0);

    const world = new World();
    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent([1, 2, 3]));

    scene.updateWorldTransforms();

    expect(node.transform.worldMatrix[12]).toBe(10);
    expect(world.get(entity, TransformComponent)?.position).toEqual([1, 2, 3]);
  });
});
