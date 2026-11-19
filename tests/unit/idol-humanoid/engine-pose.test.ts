import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { computeFootballerJointPose } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";
import { footballerHumanoidPose } from "../../../apps/showcase-aura-fc-3d/src/game/idolBodies";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, type HumanoidPoseInput } from "../../../apps/showcase-port-shared/idol/humanoid";

/**
 * End to end on real Idol GLBs: driver pose -> runtime handle `setAnimationPose` (which clones the pose) -> the engine's
 * typed-GLB actor -> skinning palette. The Nov 2026 T-pose bug lived in that clone (tuple quaternions became `{0,1,2,3}`
 * and the actor rejected the pose), so this test goes through the handle, not the driver alone.
 */
const GLBS = [
  "apps/showcase-aura-fc-3d/assets/idol/fcIdolAwayA.glb",
  "apps/showcase-aura-fc-3d/assets/idol/fcIdolKeeperHome.glb",
  "apps/showcase-aura-hoops-3d/assets/idol/hoopsIdolOrange.glb"
];

async function rig(file: string) {
  const bytes = readFileSync(file);
  const url = `https://offline-idol.invalid/${file.split("/").pop()}`;
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url } as never, id: "idol", name: "idol", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
  const snapshot = scene().add(model(assets.body, { name: "body", scaleMode: "world" }).runtime({ id: "body" })).toJSON();
  const handle = createAuraRuntimeNodeRegistry(snapshot).require("body");
  const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(bytes)));
  // Bind positions of every joint in mesh space (the space the actor's palette works in): inverse(IBM) origins.
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointIndex = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    // origin of inverse(IBM) = -(R^T t) for a rigid+uniform-scale IBM
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  const posed = (input: HumanoidPoseInput) => {
    handle.setAnimationPose(driver.pose(input) as never);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = (actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices) as Float32Array;
    const at = (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
    return { result, at };
  };
  return { driver, posed };
}

describe("Idol humanoid pose through the engine (real GLBs)", () => {
  for (const file of GLBS) {
    it(`${file.split("/").pop()}: idle and run hang the arms (wrists below shoulders), the pose is accepted`, async () => {
      const { driver, posed } = await rig(file);
      const r = driver.map.roles as Record<string, string>;
      const tpose = posed({ rotations: {} }); // canonical rest: arms hang
      expect(tpose.result.missingTargets).toEqual([]);
      for (const [clip, phase, duration] of [["Ready", 0.3, 1.8], ["Run", 0.14, 0.56], ["Run", 0.42, 0.56], ["Walk_Loop", 0.2, 0.8]] as const) {
        const { result, at } = posed(footballerHumanoidPose(computeFootballerJointPose({ clip, phase, duration })));
        expect(result.transformTracksApplied).toBeGreaterThan(20);
        for (const side of ["left", "right"]) {
          const shoulder = at(r[`${side}UpperArm`]!), wrist = at(r[`${side}Hand`]!);
          const armLen = Math.hypot(...shoulder.map((v, i) => v - wrist[i]!));
          // a T-pose keeps the wrist at shoulder height; a hanging / swinging arm drops it well below
          expect(shoulder[1] - wrist[1], `${clip} ${side}`).toBeGreaterThan(0.45 * armLen);
        }
      }
      // it moves: two gameplay times of the run cycle give different bone rotations through the runtime handle clone
      const rotsAt = (phase: number) => {
        const { at } = posed(footballerHumanoidPose(computeFootballerJointPose({ clip: "Run", phase, duration: 0.56 })));
        return [r.leftHand!, r.rightHand!, r.leftFoot!, r.rightFoot!].map((b) => at(b));
      };
      const a0 = rotsAt(0.05), a1 = rotsAt(0.33);
      const moved = Math.max(...a0.map((p, i) => Math.hypot(p[0] - a1[i]![0], p[1] - a1[i]![1], p[2] - a1[i]![2])));
      expect(moved).toBeGreaterThan(0.1);
    }, 60_000);
  }
});
