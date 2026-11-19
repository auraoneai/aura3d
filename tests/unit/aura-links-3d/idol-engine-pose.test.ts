import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { SKELETON_ATHLETE, evaluateSwing, makeRoot, solveSwing, useSkeleton, type SwingPosePhase } from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { IDOL_BINDS } from "../../../apps/showcase-aura-links-3d/src/game/idolBinds";
import { idolForwardKinematics, idolProfile, mapIdolRoles, retargetIdol } from "../../../apps/showcase-aura-links-3d/src/game/idolHumanoid";

/**
 * End to end on the shipped Idol golfer GLBs: swing solve -> retargetIdol -> runtime handle `setAnimationPose` (which clones
 * the pose) -> the engine's typed-GLB actor -> skinning palette. Proves the engine accepts the object-form pose, the grip
 * hands sit below the shoulders at address, the swing moves the bones, and the engine agrees with idolForwardKinematics.
 */
const KEYS = ["linksIdolGolferBlue", "linksIdolGolferOrange"] as const;

async function rig(key: string) {
  const file = `apps/showcase-aura-links-3d/assets/idol/${key}.glb`;
  const bytes = readFileSync(file);
  const url = `https://offline-idol.invalid/${key}.glb`;
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url } as never, id: "idol", name: "idol", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
  const snapshot = scene().add(model(assets.body, { name: "golfer-body", scaleMode: "world" }).runtime({ id: "golfer-body" })).toJSON();
  const handle = createAuraRuntimeNodeRegistry(snapshot).require("golfer-body");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointIndex = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  // the palette is in the skeleton's own (raw Idol, unit-height) space; the GLB's normalising root node (scale, yaw, ground
  // offset, the parent of the top joint and of the skinned mesh) maps it to GLB metres, as the renderer does via the mesh node
  const pw = IDOL_BINDS[key]!.joints.find((j) => !j.parent)!.parentWorld!;
  const toGlb = (v: readonly number[]): [number, number, number] => {
    const [x, y, z, w] = pw.rot as [number, number, number, number];
    const p = [v[0]! * pw.scale, v[1]! * pw.scale, v[2]! * pw.scale];
    const tx = 2 * (y * p[2]! - z * p[1]!), ty = 2 * (z * p[0]! - x * p[2]!), tz = 2 * (x * p[1]! - y * p[0]!);
    return [p[0]! + w * tx + (y * tz - z * ty) + pw.pos[0]!, p[1]! + w * ty + (z * tx - x * tz) + pw.pos[1]!, p[2]! + w * tz + (x * ty - y * tx) + pw.pos[2]!];
  };
  const posed = (pose: ReturnType<typeof retargetIdol>) => {
    handle.setAnimationPose({ bones: pose, morphTargets: {} } as never);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return toGlb([0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!));
    };
    return { result, at };
  };
  return { posed };
}

describe("Idol golfer swing pose through the engine (shipped GLBs)", () => {
  afterAll(() => useSkeleton(SKELETON_ATHLETE));
  for (const key of KEYS) {
    it(`${key}: the engine accepts the pose, grips below the shoulders at address, the swing moves, FK agrees`, async () => {
      const bind = IDOL_BINDS[key]!;
      const roles = mapIdolRoles(bind);
      useSkeleton(idolProfile(bind, key));
      const root = makeRoot(0);
      const { posed } = await rig(key);
      const swing = (phase: SwingPosePhase, t: number) => retargetIdol(bind, solveSwing(evaluateSwing(phase, t), root));

      const address = swing("address", 0);
      const { result, at } = posed(address);
      expect(result.missingTargets ?? []).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(20);
      for (const [hand, shoulder] of [[roles.handL, roles.upperArmL], [roles.handR, roles.upperArmR]] as const) {
        expect(at(shoulder)[1] - at(hand)[1], hand).toBeGreaterThan(0.3);
      }
      // the engine's skinning palette and the offline forward kinematics put the hands in the same place
      const fk = idolForwardKinematics(bind, address);
      for (const b of [roles.handL, roles.handR, roles.head, roles.footL]) {
        const e = at(b), f = fk.get(b)!.pos;
        expect(Math.hypot(e[0] - f[0], e[1] - f[1], e[2] - f[2]), b).toBeLessThan(0.02);
      }

      const handsAt = (phase: SwingPosePhase, t: number) => {
        const p = posed(swing(phase, t));
        return [p.at(roles.handL), p.at(roles.handR)];
      };
      const top = handsAt("top", 0), addr = handsAt("address", 0);
      const moved = Math.max(...top.map((p, i) => Math.hypot(p[0] - addr[i]![0], p[1] - addr[i]![1], p[2] - addr[i]![2])));
      expect(moved).toBeGreaterThan(0.5);
      expect(top[1]![1]).toBeGreaterThan(addr[1]![1] + 0.4);
    }, 60_000);
  }
});
