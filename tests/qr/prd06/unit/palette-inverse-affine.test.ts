// 06 Track 0 (#867 / #375): `invertMat4Into` (GLTFAnimationRuntime) feeds
// every skinning palette as `inverse(meshWorld) · jointWorld · inverseBind`.
// It had five wrong cofactor rows, so even inverse(identity) produced
// out[11] = -1 and every palette carried a non-affine row 3. On the GPU that
// row reaches gl_Position.w and throws skinned vertices off-screen (the fox
// "wedge" in GPU run 38121323128). These tests pin the inverse and the
// palette's affine row on the real fox rig.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext } from "../../../../packages/assets/src";
import {
  createGLTFSceneAnimationRuntime,
  invertMat4Into,
  multiplyMat4Into
} from "../../../../packages/assets/src/GLTFAnimationRuntime";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function expectIdentity(m: ArrayLike<number>, label: string): void {
  for (let i = 0; i < 16; i += 1) expect(m[i]!, `${label}[${i}]`).toBeCloseTo(IDENTITY[i]!, 5);
}

describe("invertMat4Into", () => {
  it("inverts the identity to the identity", () => {
    expectIdentity(invertMat4Into(new Float32Array(16), IDENTITY), "inverse(I)");
  });

  it("A · inverse(A) is the identity for affine and general matrices", () => {
    let seed = 0x5eed;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000) * 4 - 2;
    for (let sample = 0; sample < 50; sample += 1) {
      const general = sample % 2 === 1;
      const a = Array.from({ length: 16 }, rng);
      if (!general) { a[3] = 0; a[7] = 0; a[11] = 0; a[15] = 1; }
      const inverse = invertMat4Into(new Float32Array(16), a);
      const product = new Float32Array(16);
      multiplyMat4Into(product, 0, a, inverse);
      expectIdentity(product, `A·inv(A) sample ${sample}`);
    }
  });
});

describe("skinning palette row 3 on a real rig (fox.glb)", () => {
  it("every joint matrix is affine in the bind pose and mid-walk", async () => {
    const bytes = readFileSync("packages/create-aura3d/templates/animation-studio/public/hifi-cast/rpm/fox.glb");
    const asset = await new GLTFLoader().load(
      { url: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, type: "gltf" },
      new LoadContext()
    );
    const scene = asset.createScene();
    scene.updateWorldTransforms();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    let skinned: { jointCount: number; matrices: Float32Array } | undefined;
    scene.traverse((node) => {
      const skinning = node.renderable?.skinning as { jointCount: number; matrices: Float32Array } | undefined;
      if (skinning) skinned = skinning;
    });
    for (const step of ["bind", "walk"] as const) {
      if (step === "bind") runtime.applyPose({ bones: {} });
      else runtime.applyClipByName("Walk", 1.25);
      scene.traverse((node) => {
        const skinning = node.renderable?.skinning as { jointCount: number; matrices: Float32Array } | undefined;
        if (skinning) skinned = skinning;
      });
      expect(skinned, "fox renderable carries a skinning palette").toBeDefined();
      const m = skinned!.matrices;
      for (let joint = 0; joint < skinned!.jointCount; joint += 1) {
        const at = joint * 16;
        expect(m[at + 3]!, `${step} joint ${joint} m[3]`).toBeCloseTo(0, 5);
        expect(m[at + 7]!, `${step} joint ${joint} m[7]`).toBeCloseTo(0, 5);
        expect(m[at + 11]!, `${step} joint ${joint} m[11]`).toBeCloseTo(0, 5);
        expect(m[at + 15]!, `${step} joint ${joint} m[15]`).toBeCloseTo(1, 5);
      }
    }
  });
});
