import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { idolFighterPose } from "../../../apps/showcase-iron-crown/src/game/idolFighters";
import { IC_IDOL_RIGS } from "../../../apps/showcase-iron-crown/src/game/idol-rigs";
import type { IdolSkeleton } from "../../../apps/showcase-iron-crown/src/game/idolHumanoid";
import { computeEnemyRigPose } from "../../../apps/showcase-bunker-zero/src/art/proceduralModels";
import { poseIdolEnemy } from "../../../apps/showcase-bunker-zero/src/art/idolModels";
import { BZ_IDOL_RIGS } from "../../../apps/showcase-bunker-zero/src/art/idol-rigs";

/**
 * Idol FIX-CHECKLIST: real Iron Crown / Bunker Zero GLBs, pose pushed through the runtime node handle
 * (`setAnimationPose` -> `animationPose()` clone) into the engine's typed-GLB actor and its skinning palette. Asserts the
 * pose is accepted, the arms hang (no T-pose) and two gameplay times give different limb positions (it moves).
 */
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
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointIndex = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  const posed = (bones: Record<string, unknown>) => {
    handle.setAnimationPose({ bones, mode: "replace" } as never);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
    return { result, at };
  };
  return { posed };
}

const name = (skel: IdolSkeleton, i: number) => skel.joints[i]!.name;
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function checkPose(skel: IdolSkeleton, at: (b: string) => [number, number, number], label: string) {
  const r = skel.roles;
  for (const [sh, el] of [[r.upperArmL, r.forearmL], [r.upperArmR, r.forearmR]] as const) {
    const s = at(name(skel, sh)), e = at(name(skel, el));
    // A T-pose (the failure this guards against) holds the upper arm level and straight out to the side; hanging arms
    // drop the elbow, a raised fighting guard drops it and brings it forward.
    const d = dist(s, e);
    const tPose = Math.abs(e[0] - s[0]) > 0.8 * d && Math.abs(e[1] - s[1]) < 0.3 * d;
    expect(tPose, `${label} T-pose`).toBe(false);
  }
}

describe("Idol fighters and enemies through the engine pose path (FIX-CHECKLIST)", () => {
  for (const key of ["icKenjiP1", "icSovereignP1", "icVoltP2"]) {
    it(`${key}: accepted, arms down, walk cycle moves`, async () => {
      const skel = IC_IDOL_RIGS[key]!;
      const { posed } = await rig(`apps/showcase-iron-crown/assets/idol/${key}.glb`);
      const pose = (clip: "idle" | "walk", time: number) => idolFighterPose(skel, "kenji", { clip, time, clipProgress: 0.5, clipTime: time, moveDir: 1 }).solved.bones;
      const idle = posed(pose("idle", 0.3));
      expect(idle.result.transformTracksApplied).toBeGreaterThan(20);
      checkPose(skel, idle.at, `${key} idle`);
      const r = skel.roles;
      const limbs = [r.handL, r.handR, r.footL, r.footR].map((i) => name(skel, i));
      const a = posed(pose("walk", 0.1)), aPts = limbs.map((b) => a.at(b));
      checkPose(skel, a.at, `${key} walk`);
      const b = posed(pose("walk", 0.29)), bPts = limbs.map((x) => b.at(x));
      expect(Math.max(...aPts.map((p, i) => dist(p, bPts[i]!)))).toBeGreaterThan(0.02); // mesh space is unit height: 2% of the body
    }, 60_000);
  }

  for (const [kind, key] of [["guard", "bzGuard"], ["gunner", "bzGunner"], ["boss", "bzWardenNoPack"]] as const) {
    it(`${key}: accepted, gun hold / hanging arms, patrol stride moves`, async () => {
      const skel = BZ_IDOL_RIGS[key]!;
      const { posed } = await rig(`apps/showcase-bunker-zero/assets/idol/${key}.glb`);
      const pose = (state: "idle" | "patrol", time: number) => {
        let bones: Record<string, unknown> = {};
        const nodes: Record<string, unknown> = {
          "e-idol": { setPosition() {}, setRotation() {}, setAnimationPose: (p: { bones: Record<string, unknown> }) => { bones = p.bones; } },
          "e-idol-gun": { setPosition() {}, setRotation() {} }
        };
        poseIdolEnemy((id) => nodes[id] as never, "e", kind, computeEnemyRigPose({ kind, state, time, stateT: time, painT: 0, deathT: 0, phaseSeed: 0.4 }), state);
        return bones;
      };
      const idle = posed(pose("idle", 0.4));
      expect(idle.result.transformTracksApplied).toBeGreaterThan(15);
      checkPose(skel as unknown as IdolSkeleton, idle.at, `${key} idle`);
      const r = skel.roles;
      const feet = [r.footL, r.footR].map((i) => skel.joints[i]!.name);
      const a = posed(pose("patrol", 0.1)), aPts = feet.map((x) => a.at(x));
      const b = posed(pose("patrol", 0.45)), bPts = feet.map((x) => b.at(x));
      expect(Math.max(...aPts.map((p, i) => dist(p, bPts[i]!)))).toBeGreaterThan(0.02); // mesh space is unit height: 2% of the body
    }, 60_000);
  }
});
