import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { pose } from "../../../examples/aura-slam/view/pose";
import { athleteHumanoid, athleteNodeScale, solveAthletePose } from "../../../examples/aura-slam/view/idolAthleteRig";
import { IDOL_BINDS } from "../../../examples/aura-slam/view/idolBind.generated";
import { createIdolHumanoid } from "../../../examples/aura-slam/view/idolHumanoid";
import { umpireScale, umpireSeatedTargets } from "../../../examples/aura-slam/view/idolUmpire";

/**
 * Aura Slam Idol characters end to end: game pose -> runtime handle `setAnimationPose` (clones the pose) -> the engine's typed
 * GLB actor -> skinning palette, on the shipped GLBs. Arms hang (wrists below shoulders) and two gameplay times move the bones.
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
  const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "body", scaleMode: "world" }).runtime({ id: "body" })).toJSON()).require("body");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointIndex = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  return (bones: Record<string, unknown>) => {
    handle.setAnimationPose({ bones, morphTargets: {} } as never);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
    return { result, at };
  };
}

const actorAt = (stride: number, swing: number) => ({
  side: "player", moveBlend: 1, stride, vx: 0.6, vy: 0, splitStep: 0, swingAge: 0.1, strokeContactAge: 0.17, strokeConnected: false, swing, stroke: "forehand"
}) as never;
const state = { phase: "rally", time: 3, server: "player", serveAttempt: null } as never;

describe("Aura Slam Idol characters through the engine (shipped GLBs)", () => {
  it("athlete: the game pose is accepted, arms hang below the shoulders, and two gameplay times move the bones", async () => {
    const key = "slamAthleteMatchPlayer";
    const posed = await rig(`examples/aura-slam/assets/idol/${key}.glb`);
    const h = athleteHumanoid(key);
    const k = athleteNodeScale(key);
    const m = h.map;
    const a = posed(solveAthletePose(h, k, pose(actorAt(0.4, 0), state)).bones);
    expect(a.result.missingTargets).toEqual([]);
    expect(a.result.transformTracksApplied).toBeGreaterThan(15);
    for (const [upper, hand] of [[m.upperArmL, m.handL], [m.upperArmR, m.handR]] as const) {
      expect(a.at(upper)[1] - a.at(hand)[1]).toBeGreaterThan(0.15);
    }
    const ends = (p: ReturnType<typeof posed>) => [m.handL, m.handR, m.footL, m.footR].map((b) => p.at(b));
    const p0 = ends(a);
    const p1 = ends(posed(solveAthletePose(h, k, pose(actorAt(2.0, 0.25), state)).bones));
    expect(Math.max(...p0.map((p, i) => Math.hypot(p[0] - p1[i]![0], p[1] - p1[i]![1], p[2] - p1[i]![2])))).toBeGreaterThan(0.1);
  }, 60_000);

  it("umpire: seated pose is accepted, hands on the lap below the shoulders, head and chest move over time", async () => {
    const posed = await rig("examples/aura-slam/assets/idol/slamUmpireOfficial.glb");
    const h = createIdolHumanoid(IDOL_BINDS.slamUmpireOfficial!);
    const k = umpireScale();
    const m = h.map;
    const a = posed(h.solve(umpireSeatedTargets(h, k, 0, 0)).bones);
    expect(a.result.missingTargets).toEqual([]);
    for (const [upper, hand] of [[m.upperArmL, m.handL], [m.upperArmR, m.handR]] as const) {
      expect(a.at(upper)[1] - a.at(hand)[1]).toBeGreaterThan(0.15);
    }
    const headA = a.at(m.head);
    const handA = a.at(m.handR);
    const b = posed(h.solve(umpireSeatedTargets(h, k, 0.6, 2.5)).bones);
    expect(Math.hypot(...headA.map((v, i) => v - b.at(m.head)[i]!)) + Math.hypot(...handA.map((v, i) => v - b.at(m.handR)[i]!))).toBeGreaterThan(0.005);
    const rotA = (posed(h.solve(umpireSeatedTargets(h, k, 0, 0)).bones), h.solve(umpireSeatedTargets(h, k, 0, 0)).bones[m.head]!.rotation);
    const rotB = h.solve(umpireSeatedTargets(h, k, 0.6, 2.5)).bones[m.head]!.rotation;
    expect(Math.abs(rotA.y - rotB.y) + Math.abs(rotA.x - rotB.x)).toBeGreaterThan(0.05);
  }, 60_000);
});
