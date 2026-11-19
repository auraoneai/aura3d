import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { dispatchActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { idolActorPose, idolMotionPose, type IdolActorKey } from "../../../examples/ninja-runner-port/art/idolActors";
import { sampleClipAngles } from "../../../examples/ninja-runner-port/art/proceduralActors";
import { IDOL_RIGS } from "../../../examples/ninja-runner-port/art/idolRigData";

/**
 * End to end on the shipped Idol GLBs: clip angles -> `idolActorPose` -> runtime handle `setAnimationPose` (which clones
 * the pose) -> the engine's typed-GLB actor -> skinning palette. Arms must hang (no bind T-pose) and the run must move.
 */
async function rig(key: IdolActorKey) {
  const file = `examples/ninja-runner-port/assets/idol/${key}.glb`;
  const bytes = readFileSync(file);
  const url = `https://offline-idol.invalid/${key}.glb`;
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
  const bindPos = (k: number): number[] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2);
  };
  const firstHand = (() => { const r = IDOL_RIGS as unknown as Record<string, { bones: { name: string }[]; map: { armR: number[] } }>; const k = Object.keys(r).find((x) => file.includes(x))!; return r[k]!.bones[r[k]!.map.armR[3]!]!.name; })();
  const posed = (clip: string, t: number, dur: number, captured?: { slot: number; id: "hero" | "soldier" | "brute"; travel: number }) => {
    handle.setAnimationPose((captured
      ? idolMotionPose(captured.slot, key, captured.id, { clip, time: t, duration: dur }, { travel: captured.travel, dt: 1 / 30 }, 1)!.pose
      : idolActorPose(key, sampleClipAngles(clip, t, dur))) as never);
    // The engine's per-frame actor dispatch at a FROZEN clock (main.ts renders with `app.step(0)`): a replace-mode live
    // pose must still reach the skinning palette (clip playback would stay in the bind T-pose at a constant time).
    const warnings = new Set<string>();
    const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
    dispatchActorAnimation({ actor } as never, { animationPose: handle.animationPose() as never }, { kind: "model", runtime: { id: "body" } } as never, 0, warnings, identity, () => {});
    expect([...warnings]).toEqual([]);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (bone: string): number[] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!);
    };
    return { result, at, rots: JSON.stringify(handle.animationPose()?.bones), wrist: at(firstHand) };
  };
  return { posed, map: IDOL_RIGS[key].map, bones: IDOL_RIGS[key].bones };
}

describe("ninja-runner-port Idol actors through the engine (shipped GLBs)", () => {
  for (const key of ["nrHero", "nrSoldier", "nrCaster"] as const) {
    it(`${key}: idle and run hang the arms (wrists below shoulders), and the run moves`, async () => {
      const { posed, map, bones } = await rig(key);
      for (const [clip, t, dur] of [["idle", 0.3, 1.6], ["run", 0.16, 0.64], ["run", 0.48, 0.64]] as const) {
        const { result, at } = posed(clip, t, dur);
        expect(result.missingTargets).toEqual([]);
        expect(result.transformTracksApplied).toBeGreaterThan(15);
        for (const arm of [map.armL, map.armR]) {
          const shoulder = at(bones[arm[1]!]!.name), wrist = at(bones[arm[3]!]!.name);
          const len = Math.hypot(...shoulder.map((v, i) => v - wrist[i]!));
          expect(shoulder[1]! - wrist[1]!, `${clip} ${t}`).toBeGreaterThan(0.45 * len);
        }
      }
      expect(posed("run", 0.1, 0.64).rots).not.toEqual(posed("run", 0.42, 0.64).rots);
    // the skinned hand itself moves between the two times (both dispatched at engine time 0)
    const w1 = posed("run", 0.1, 0.64).wrist, w2 = posed("run", 0.42, 0.64).wrist;
    expect(Math.hypot(...w1.map((v, k) => v - w2[k]!))).toBeGreaterThan(0.05);
    });
  }

  it("captured clips (fal text-to-motion) reach the skinning palette at a frozen clock: the run moves, death lowers the hips", async () => {
    const { posed, map, bones } = await rig("nrSoldier");
    const hips = bones[map.hips]!.name;
    const a = posed("run", 0, 0.64, { slot: 801, id: "soldier", travel: 0 });
    expect(a.result.missingTargets).toEqual([]);
    const b = posed("run", 0, 0.64, { slot: 801, id: "soldier", travel: 0.6 });
    expect(a.rots).not.toEqual(b.rots);
    const stand = posed("idle", 0, 1.6, { slot: 802, id: "soldier", travel: 0 }).at(hips)[1]!;
    let down = stand;
    for (let k = 0; k < 12; k++) down = posed("death", 0.98 * 1.1, 1.1, { slot: 803, id: "soldier", travel: 0 }).at(hips)[1]!;
    expect(down).toBeLessThan(stand - 0.3);
  });
});

