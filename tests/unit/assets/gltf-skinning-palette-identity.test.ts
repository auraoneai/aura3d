import { describe, expect, it } from "vitest";
import { Renderable, Scene } from "@aura3d/scene";
import type { GLTFAsset } from "../../../packages/assets/src";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src";

/**
 * PRD-06 T0.11 — the runtime keeps ONE palette Float32Array per skinned binding
 * (allocated at bind, written in place each frame) and stamps the C-18
 * `paletteKey` (the binding itself) onto `renderable.skinning` so the renderer's
 * palette cache can key its texture pair per skin instance. Across N frames the
 * key and buffer identities must be identical; a different actor must produce a
 * different key. Flag-off safety: `paletteKey` is extra metadata on the same
 * `{jointCount, matrices}` shape — `MAX_UNIFORM_SKINNING_JOINTS` consumers only
 * read those two fields.
 */
const IDENTITY_MAT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function buildRiggedScene() {
  const scene = new Scene();
  const jointA = scene.createNode("JointA");
  const jointB = scene.createNode("JointB");
  const meshNode = scene.createNode("skinned-geometry");
  scene.root.addChild(jointA);
  scene.root.addChild(jointB);
  scene.root.addChild(meshNode);
  const renderable = new Renderable({
    geometry: "skinned-geometry",
    material: "skinned-material",
    skinning: { jointCount: 2, matrices: new Float32Array(32) }
  });
  scene.addRenderable(meshNode, renderable);
  const asset = {
    meshes: [{ name: "skinned-geometry", skinIndex: 0 }],
    skins: [{
      name: "skin",
      joints: [0, 1],
      jointNames: ["JointA", "JointB"],
      inverseBindMatrices: [IDENTITY_MAT4, IDENTITY_MAT4]
    }]
  } as unknown as Pick<GLTFAsset, "meshes" | "skins">;
  return { scene, renderable, asset, jointA };
}

type StampedSkinning = { jointCount: number; matrices: Float32Array; paletteKey?: object };

describe("runtime skinning palette identity (T0.11)", () => {
  it("keeps one palette buffer + one paletteKey per binding across 10 frames", () => {
    const { scene, renderable, asset, jointA } = buildRiggedScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });

    runtime.applyPose({ bones: {} });
    const first = renderable.skinning as StampedSkinning;
    expect(first.paletteKey).toBeTypeOf("object");
    const firstMatrices = first.matrices;
    expect(firstMatrices.length).toBe(2 * 16);

    for (let frame = 0; frame < 9; frame += 1) {
      jointA.transform.setPosition(frame * 0.1, 0, 0);
      runtime.applyPose({ bones: {} });
      const skinning = renderable.skinning as StampedSkinning;
      expect(skinning.paletteKey).toBe(first.paletteKey);
      expect(skinning.matrices).toBe(firstMatrices);
    }
    expect(runtime.snapshot().skinningBindingCount).toBe(1);
  });

  it("writes joint world x inverseBind into the persistent buffer", () => {
    const { scene, renderable, asset, jointA } = buildRiggedScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    jointA.transform.setPosition(0, 2, 0);
    runtime.applyPose({ bones: {} });
    const skinning = renderable.skinning as StampedSkinning;
    // Column-major: translation lives at indices 12..14 of the first matrix.
    expect(skinning.matrices[13]).toBeCloseTo(2);
    expect(skinning.matrices[16 + 13]).toBeCloseTo(0);
  });

  it("produces a different paletteKey for a second actor's binding", () => {
    const first = buildRiggedScene();
    const second = buildRiggedScene();
    const runtimeA = createGLTFSceneAnimationRuntime({ scene: first.scene, clips: [], asset: first.asset });
    const runtimeB = createGLTFSceneAnimationRuntime({ scene: second.scene, clips: [], asset: second.asset });
    runtimeA.applyPose({ bones: {} });
    runtimeB.applyPose({ bones: {} });
    const keyA = (first.renderable.skinning as StampedSkinning).paletteKey;
    const keyB = (second.renderable.skinning as StampedSkinning).paletteKey;
    expect(keyA).toBeTypeOf("object");
    expect(keyB).toBeTypeOf("object");
    expect(keyA).not.toBe(keyB);
  });
});
