import { AnimationClip, AnimationMixer, AnimationTrack, ECSAnimationBridge, SceneAnimationBridge, type ECSAnimationComponent, type RootMotionSample } from "@aura3d/animation";
import { TransformComponent, World } from "@aura3d/ecs";
import { Scene } from "@aura3d/scene";
import { describe, expect, it } from "vitest";

describe("animation root motion scene/ECS integration", () => {
  it("applies mixer root-motion deltas to scene transforms while sampling local pose tracks", () => {
    const scene = new Scene();
    const actor = scene.createNode("runner");
    const visual = scene.createNode("runnerVisual");
    scene.root.addChild(actor);
    actor.addChild(visual);
    actor.transform.setPosition(10, 0, -2);

    const bridge = new SceneAnimationBridge();
    bridge.register("runnerVisual", {
      setPosition: ([x, y, z]) => visual.transform.setPosition(x, y, z)
    });

    const rootMotionDeltas: RootMotionSample[] = [];
    const target = {
      get position(): [number, number, number] {
        return actor.transform.position;
      },
      set position(value: [number, number, number]) {
        actor.transform.setPosition(value[0], value[1], value[2]);
      },
      setAnimationValue: bridge.setAnimationValue.bind(bridge),
      applyRootMotion(sample: RootMotionSample): void {
        rootMotionDeltas.push(sample);
      }
    };
    const mixer = new AnimationMixer(target, { applyRootMotion: true, rootMotionTrack: "root.position" });

    mixer.play(createRootMotionClip());
    mixer.update(0.25);

    expect(rootMotionDeltas).toHaveLength(1);
    expect(rootMotionDeltas[0]?.delta).toEqual([1, 0, 0.5]);
    expect(actor.transform.position).toEqual([11, 0, -1.5]);
    expect(visual.transform.position).toEqual([0, 0.25, 0]);

    mixer.update(0.25);
    scene.updateWorldTransforms();

    expect(rootMotionDeltas).toHaveLength(2);
    expect(rootMotionDeltas[1]?.delta).toEqual([1, 0, 0.5]);
    expect(actor.transform.position).toEqual([12, 0, -1]);
    expect(visual.transform.position).toEqual([0, 0.5, 0]);
    expect(actor.transform.worldMatrix[12]).toBeCloseTo(12);
    expect(actor.transform.worldMatrix[14]).toBeCloseTo(-1);
    expect(visual.transform.worldMatrix[12]).toBeCloseTo(12);
    expect(visual.transform.worldMatrix[13]).toBeCloseTo(0.5);
  });

  it("applies mixer root-motion deltas to ECS transform components with loop wrap", () => {
    const world = new World();
    const rootEntity = world.createEntity();
    const poseEntity = world.createEntity();
    const rootTransform = new TransformComponent([5, 0, 0]);
    const poseTransform = new TransformComponent();
    world.add(rootEntity, TransformComponent, rootTransform);
    world.add(poseEntity, TransformComponent, poseTransform);

    const bridge = new ECSAnimationBridge();
    bridge.register("runnerVisual", poseTransform as unknown as ECSAnimationComponent);

    const mixer = new AnimationMixer(
      {
        get position(): [number, number, number] {
          return rootTransform.position;
        },
        set position(value: [number, number, number]) {
          rootTransform.position = value;
        },
        setAnimationValue: bridge.setAnimationValue.bind(bridge)
      },
      { applyRootMotion: true, rootMotionTrack: "root.position", rootMotionScale: 0.5 }
    );
    const action = mixer.play(createRootMotionClip());

    mixer.update(0.75);
    expect(world.get(rootEntity, TransformComponent)?.position).toEqual([6.5, 0, 0.75]);
    expect(world.get(poseEntity, TransformComponent)?.position).toEqual([0, 0.75, 0]);

    action.loopMode = "repeat";
    mixer.update(0.5);

    expect(world.get(rootEntity, TransformComponent)?.position).toEqual([7.5, 0, 1.25]);
    expect(world.get(poseEntity, TransformComponent)?.position).toEqual([0, 0.25, 0]);
  });
});

function createRootMotionClip(): AnimationClip {
  return new AnimationClip({
    name: "root-motion-run",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [4, 0, 2] }
        ]
      }),
      new AnimationTrack({
        target: "runnerVisual.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [0, 1, 0] }
        ]
      })
    ]
  });
}
