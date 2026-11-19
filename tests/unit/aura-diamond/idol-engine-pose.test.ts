import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { computeBaseballBoneMatrices, computeBaseballRolePose, type BaseballActorRole } from "../../../apps/showcase-aura-diamond-3d/src/art/proceduralModels";
import { IDOL_ATHLETE_BINDS } from "../../../apps/showcase-aura-diamond-3d/src/idol/bind.generated";
import { IDOL_ATHLETE_KEYS, IDOL_GRIP, idolPoseForActor, type IdolAthleteKey } from "../../../apps/showcase-aura-diamond-3d/src/idol/drive";

/**
 * FIX-CHECKLIST (Nov 2026) end to end on the shipped Diamond GLBs: game role pose -> idolPoseForActor -> runtime handle
 * `setAnimationPose` (which clones the pose) -> the engine's typed-GLB actor -> skinning palette. Proves the pose is accepted
 * (object-form transforms), the arms hang instead of a frozen T-pose, and the athlete moves between gameplay times.
 */
async function rig(key: IdolAthleteKey) {
  const file = `apps/showcase-aura-diamond-3d/assets/idol/${key}.glb`;
  const bytes = readFileSync(file);
  const url = `https://offline-idol.invalid/${key}.glb`;
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url } as never, id: "idol", name: "idol", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
  const snapshot = scene().add(model(assets.body, { name: "body", scaleMode: "world" }).runtime({ id: "body" })).toJSON();
  const handle = createAuraRuntimeNodeRegistry(snapshot).require("body");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointIndex = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  const posed = (role: BaseballActorRole, clip: string, t: number) => {
    const pose = idolPoseForActor(key, computeBaseballBoneMatrices(computeBaseballRolePose(role, clip, t, 0.3, 1)), IDOL_GRIP.relaxed);
    handle.setAnimationPose({ bones: pose.bones, morphTargets: {} } as never);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
    return { result, at };
  };
  return { posed, roles: IDOL_ATHLETE_BINDS[key]!.roles, bindAt: (bone: string) => bindPos(jointIndex.get(bone)!) };
}

const ROLE_FOR: Record<IdolAthleteKey, BaseballActorRole> = { diaIdolFielderA: "infielder", diaIdolFielderB: "outfielder", diaIdolBatterA: "runner", diaIdolCatcher: "catcher" };

describe("Aura Diamond Idol athletes through the engine (real GLBs)", () => {
  for (const key of IDOL_ATHLETE_KEYS) {
    it(`${key}: game poses are accepted, the arms hang (no T-pose) and the athlete moves`, async () => {
      const { posed, roles, bindAt } = await rig(key);
      for (const [role, clip, t] of [[ROLE_FOR[key], "Crouch_Idle_Loop", 0.2], [ROLE_FOR[key], "Idle_Loop", 0.6], ["runner", "Sprint_Loop", 0.1], ["runner", "Sprint_Loop", 0.35]] as const) {
        const { result, at } = posed(role, clip, t);
        expect(result.missingTargets, `${key} ${clip}`).toEqual([]);
        expect(result.transformTracksApplied).toBeGreaterThan(20);
        for (const arm of [roles.armL, roles.armR]) {
          const shoulder = at(arm.upper), wrist = at(arm.hand);
          const armLen = Math.hypot(...shoulder.map((v, i) => v - wrist[i]!));
          // never the bind T-pose: every wrist leaves its bind spot ...
          expect(Math.hypot(...wrist.map((v, i) => v - bindAt(arm.hand)[i]!)), `${key} ${clip} t=${t} left bind`).toBeGreaterThan(0.4 * armLen);
          // ... and drops well below the shoulder (the catcher crouches with the mitt up as a target, so not his own role)
          if (role !== "catcher") expect(shoulder[1] - wrist[1], `${key} ${clip} t=${t}`).toBeGreaterThan(0.3 * armLen);
        }
      }
      // it moves: two times of the sprint cycle put the hands and feet in different places
      const ends = (t: number) => { const { at } = posed("runner", "Sprint_Loop", t); return [roles.armL.hand, roles.armR.hand, roles.legL.foot, roles.legR.foot].map((b) => at(b)); };
      const a0 = ends(0.05), a1 = ends(0.3);
      expect(Math.max(...a0.map((p, i) => Math.hypot(p[0] - a1[i]![0], p[1] - a1[i]![1], p[2] - a1[i]![2])))).toBeGreaterThan(0.1);
    }, 60_000);
  }
});
