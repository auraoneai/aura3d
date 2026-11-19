// Idol wow pass (FIX-CHECKLIST rules 1 + 3): the rigged Idol Pip / Brambleback really move. Ground locomotion plays the
// GLB's own clips (idle/walk/run); every other state overlays the old limb choreography through the runtime handle's
// `setAnimationPose` clone into the engine's typed-GLB actor. Asserts on the skinning palette, not on our own maths.
import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { poseIdolBoss, poseIdolPip, resetIdolPoses, type PipPoseParams } from "../../../apps/showcase-pips-big-leap/src/game/idolPose";
import { BOSS_IDOL_RIG, PIP_IDOL_RIG } from "../../../apps/showcase-pips-big-leap/src/game/idolRigs";
import { PIP_CLIPS } from "../../../apps/showcase-pips-big-leap/src/aura-assets";

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
  const handle = createAuraRuntimeNodeRegistry(snapshot).require("body") as AuraRuntimeNodeHandle;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const joints = skin.listJoints();
  const jointIndex = new Map(joints.map((j, k) => [j.getName(), k] as const));
  const childOf = (bone: string) => joints.find((j) => j.getName() === bone)!.listChildren()[0]!.getName();
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  const palette = () => {
    const pal = Float32Array.from(actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array);
    return (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
  };
  /** Clip at `time`, then the overlay pose the runtime handle holds (the engine's overlay order). */
  const frame = (clip: string, time: number) => {
    actor.playClip(clip, time);
    const pose = handle.animationPose();
    if (pose) actor.applyRetargetedPose(pose as never);
    return palette();
  };
  return { actor, handle, frame, childOf };
}

const PIP = "apps/showcase-pips-big-leap/assets/idol/pipHero.glb";
const BOSS = "apps/showcase-pips-big-leap/assets/idol/pipBrambleback.glb";
const still: PipPoseParams = { headNod: 0, headYaw: 0, headRoll: 0, armPitchL: 0, armPitchR: 0, armSplay: 0.2, legPitchL: 0, legPitchR: 0, legSplay: 0.02, hipBob: 0 };
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("pips-big-leap rigged Idol characters move (FIX-CHECKLIST)", () => {
  it("Pip's GLB ships the clips the game plays", async () => {
    const { actor } = await rig(PIP);
    const names = actor.animation.clipNames();
    for (const clip of [PIP_CLIPS.idle, PIP_CLIPS.walk, PIP_CLIPS.run]) expect(names).toContain(clip);
  }, 60_000);

  it("Pip's walk and run clips swing the limbs with the arms hanging (no T-pose)", async () => {
    const { frame, childOf } = await rig(PIP);
    const r = PIP_IDOL_RIG!;
    const wristL = childOf(r.foreArmL.bone), wristR = childOf(r.foreArmR.bone);
    const footL = childOf(r.shinL.bone);
    for (const clip of [PIP_CLIPS.idle, PIP_CLIPS.walk, PIP_CLIPS.run]) {
      const at = frame(clip, 0.2);
      for (const [shoulder, wrist] of [[r.armL.bone, wristL], [r.armR.bone, wristR]] as const) {
        expect(at(shoulder)[1] - at(wrist)[1], `${clip} ${shoulder}`).toBeGreaterThan(0.02);
      }
    }
    const a = frame(PIP_CLIPS.run, 0.1), b = frame(PIP_CLIPS.run, 0.35);
    expect(Math.max(dist(a(wristL), b(wristL)), dist(a(footL), b(footL)))).toBeGreaterThan(0.03);
  }, 60_000);

  it("Pip's airborne overlay goes through the runtime handle, hangs or swings the arms and changes with the stride", async () => {
    const { handle, frame, childOf } = await rig(PIP);
    const r = PIP_IDOL_RIG!;
    const wristL = childOf(r.foreArmL.bone);
    resetIdolPoses();
    poseIdolPip(handle, "air", { ...still, armPitchL: -0.78, armPitchR: -0.78, armSplay: 0.56, legPitchL: -0.18, legPitchR: 0.24 });
    expect(Object.keys(handle.animationPose()?.bones ?? {}).length).toBeGreaterThanOrEqual(8);
    const fall = frame(PIP_CLIPS.idle, 0.2);
    expect(fall(r.armL.bone)[1] - fall(wristL)[1]).toBeGreaterThan(0.02);
    poseIdolPip(handle, "swim", { ...still, armPitchL: -1.3, armPitchR: 0.6, armSplay: 0.42 });
    const stroke = frame(PIP_CLIPS.walk, 0.2);
    expect(dist(fall(wristL), stroke(wristL))).toBeGreaterThan(0.03);
    // Back on the ground the overlay clears and the clip owns the limbs again.
    poseIdolPip(handle, "run", still);
    expect(handle.animationPose()).toBeUndefined();
  }, 60_000);

  it("Brambleback's run clip strides and the wind-up overlay raises the arms", async () => {
    const { handle, frame, childOf } = await rig(BOSS);
    const r = BOSS_IDOL_RIG!;
    const wristL = childOf(r.foreArmL.bone), footL = childOf(r.shinL.bone);
    const a = frame("run", 0.1), b = frame("run", 0.35);
    expect(Math.max(dist(a(wristL), b(wristL)), dist(a(footL), b(footL)))).toBeGreaterThan(0.02);
    resetIdolPoses();
    poseIdolBoss(handle, "windup", { armSwingL: -1.45, armSwingR: -1.45, legStride: 0.2 });
    const up = frame("idle", 0.2);
    poseIdolBoss(handle, "vulnerable", { armSwingL: 0.52, armSwingR: 0.52, legStride: 0 });
    const slump = frame("idle", 0.2);
    expect(up(wristL)[1]).toBeGreaterThan(slump(wristL)[1]);
  }, 60_000);
});
