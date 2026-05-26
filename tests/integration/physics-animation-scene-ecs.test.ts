import { AnimationClip, AnimationMixer, AnimationTrack, ECSAnimationBridge, SceneAnimationBridge, type ECSAnimationComponent } from "@aura3d/animation";
import { TransformComponent, World } from "@aura3d/ecs";
import { ECSPhysicsBridge, PhysicsWorld, ScenePhysicsBridge } from "@aura3d/physics";
import { Scene } from "@aura3d/scene";
import { describe, expect, it } from "vitest";

describe("physics and animation scene/ECS integration", () => {
  it("syncs physics body positions into scene nodes and ECS transforms", () => {
    const physics = new PhysicsWorld({ gravity: [0, 0, 0] });
    const body = physics.createRigidBody({ position: [0, 0, 0], velocity: [2, 0, 0] });

    const scene = new Scene();
    const node = scene.createNode("physics-cube");
    scene.root.addChild(node);

    const ecs = new World();
    const entity = ecs.createEntity();
    const transform = new TransformComponent();
    ecs.add(entity, TransformComponent, transform);

    const sceneBridge = new ScenePhysicsBridge();
    sceneBridge.bind({
      bodyId: body.id,
      node: {
        position: node.transform.position,
        setPosition: ([x, y, z]) => node.transform.setPosition(x, y, z)
      }
    });

    const ecsBridge = new ECSPhysicsBridge();
    ecsBridge.bind({ bodyId: body.id, transform });

    physics.step(0.5);
    sceneBridge.pullDynamic(physics);
    ecsBridge.pullDynamic(physics);
    scene.updateWorldTransforms();

    expect(node.transform.position[0]).toBeCloseTo(1);
    expect(node.transform.worldMatrix[12]).toBeCloseTo(1);
    expect(ecs.get(entity, TransformComponent)?.position[0]).toBeCloseTo(1);
  });

  it("pushes kinematic scene transforms into physics and applies animation values to scene and ECS targets", () => {
    const physics = new PhysicsWorld({ gravity: [0, 0, 0] });
    const kinematic = physics.createRigidBody({ type: "kinematic", position: [0, 0, 0] });

    const scene = new Scene();
    const platform = scene.createNode("platform");
    scene.root.addChild(platform);
    platform.transform.setPosition(3, 4, 5);

    const scenePhysics = new ScenePhysicsBridge();
    scenePhysics.bind({
      bodyId: kinematic.id,
      mode: "kinematic",
      node: {
        getWorldPosition: () => [...platform.transform.position] as [number, number, number]
      }
    });
    scenePhysics.pushKinematic(physics);
    expect(kinematic.position).toEqual([3, 4, 5]);

    const sceneAnimation = new SceneAnimationBridge();
    sceneAnimation.register("platform", {
      setPosition: ([x, y, z]) => platform.transform.setPosition(x, y, z)
    });
    const sceneMixer = new AnimationMixer(sceneAnimation);
    sceneMixer.play(
      new AnimationClip({
        name: "raise-platform",
        duration: 1,
        tracks: [
          new AnimationTrack({
            target: "platform.position",
            valueType: "vector3",
            keyframes: [
              { time: 0, value: [0, 0, 0] },
              { time: 1, value: [0, 2, 0] }
            ]
          })
        ]
      })
    );
    sceneMixer.update(1);
    expect(platform.transform.position).toEqual([0, 2, 0]);

    const ecsTransform = new TransformComponent();
    const ecsAnimation = new ECSAnimationBridge();
    ecsAnimation.register("entity", ecsTransform as unknown as ECSAnimationComponent);
    const ecsMixer = new AnimationMixer(ecsAnimation);
    ecsMixer.play(
      new AnimationClip({
        name: "move-entity",
        duration: 1,
        tracks: [
          new AnimationTrack({
            target: "entity.position",
            valueType: "vector3",
            keyframes: [
              { time: 0, value: [0, 0, 0] },
              { time: 1, value: [5, 0, 0] }
            ]
          })
        ]
      })
    );
    ecsMixer.update(1);
    expect(ecsTransform.position).toEqual([5, 0, 0]);
  });
});
