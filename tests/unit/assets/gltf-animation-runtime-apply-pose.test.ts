import { describe, expect, it } from "vitest";
import { Renderable, Scene, SceneNode } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime, type GLTFScenePose } from "../../../packages/assets/src";

/**
 * Phase 2.3 pose -> runtime bridge. Proves that a pose keyed directly by GLB node names (exactly
 * what `@aura3d/animation`'s `retargetHumanoidPose(...).bones` produces -- keys are the target
 * rig's node names) drives the matching scene nodes' LOCAL transforms and morph weights through
 * `GLTFSceneAnimationRuntime.applyPose`.
 */
function buildSkeletonScene(): Scene {
  const scene = new Scene();
  const hips = new SceneNode({ name: "hips" });
  const head = new SceneNode({ name: "head" });
  const faceMesh = new SceneNode({ name: "face" });
  scene.root.addChild(hips);
  hips.addChild(head);
  hips.addChild(faceMesh);
  scene.addRenderable(
    faceMesh,
    new Renderable({ geometry: "face-geo", material: "face-mat", morphWeights: [0, 0] })
  );
  return scene;
}

describe("GLTFSceneAnimationRuntime.applyPose", () => {
  it("writes node-name-keyed transforms onto the matching local transforms and morph weights", () => {
    const scene = buildSkeletonScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });

    // Pose keyed by GLB node names. Mix tuple form (hips) and object form (head, like the raw
    // retargetHumanoidPose AnimationPose output) to prove the bridge accepts both.
    const pose: GLTFScenePose = {
      bones: {
        hips: {
          position: [1, 2, 3],
          rotation: [0, 0, 0, 1],
          scale: [2, 2, 2]
        },
        head: {
          // object form {x,y,z}/{x,y,z,w} as emitted by @aura3d/animation
          position: { x: 0.5, y: -0.5, z: 0.25 },
          rotation: { x: 0, y: 0.7071067811865476, z: 0, w: 0.7071067811865476 }
        }
      },
      morphTargets: {
        face: 0.8
      }
    };

    const result = runtime.applyPose(pose);

    const hips = scene.findByName("hips")[0]!;
    const head = scene.findByName("head")[0]!;
    const face = scene.findByName("face")[0]!;

    expect([...hips.transform.position]).toEqual([1, 2, 3]);
    expect([...hips.transform.scale]).toEqual([2, 2, 2]);

    expect(head.transform.position[0]).toBeCloseTo(0.5, 6);
    expect(head.transform.position[1]).toBeCloseTo(-0.5, 6);
    expect(head.transform.position[2]).toBeCloseTo(0.25, 6);
    expect(head.transform.rotation[1]).toBeCloseTo(0.7071067811865476, 6);
    expect(head.transform.rotation[3]).toBeCloseTo(0.7071067811865476, 6);

    expect(face.renderable!.morphWeights).toEqual([0.8]);

    // Two transform tracks (hips full T/R/S counts as one node target per path) + morph weight.
    expect(result.transformTracksApplied).toBe(5);
    expect(result.morphWeightTracksApplied).toBe(1);
    expect(result.missingTargets).toEqual([]);
  });

  it("reports unknown node names as missing targets without throwing", () => {
    const scene = buildSkeletonScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });

    const result = runtime.applyPose({
      bones: { doesNotExist: { position: [1, 1, 1] } }
    });

    expect(result.transformTracksApplied).toBe(0);
    expect(result.missingTargets).toContain("doesNotExist.translation");
  });
});
