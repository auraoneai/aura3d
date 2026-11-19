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
import { bellkeeperAnimationPose } from "../../../examples/where-the-wind-wanders-port/art/idolModels";
import { sampleBellkeeperRigPose } from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";
import { IDOL_RIGS } from "../../../examples/where-the-wind-wanders-port/art/idolRigData";

/**
 * End to end on the shipped Idol GLBs: `BellkeeperRigPose` -> `bellkeeperAnimationPose` -> runtime handle `setAnimationPose` (which clones
 * the pose) -> the engine's typed-GLB actor -> skinning palette. Arms must hang (no bind T-pose) and the walk must move.
 */
async function rig(key: "bkHero") {
  const file = `examples/where-the-wind-wanders-port/assets/idol/${key}.glb`;
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
  const firstHand = (() => { const r = IDOL_RIGS as unknown as Record<string, { bones: { name: string }[]; map: { armL: number[] } }>; const k = Object.keys(r).find((x) => file.includes(x))!; return r[k]!.bones[r[k]!.map.armL[3]!]!.name; })();
  const posed = (gait: "Idle" | "Walk" | "Run", t: number) => {
    handle.setAnimationPose(bellkeeperAnimationPose(sampleBellkeeperRigPose({ gait, phaseSeconds: t })) as never);
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

describe("where-the-wind-wanders-port Idol Bellkeeper through the engine (shipped GLB)", () => {
  it("idle, walk and run hang the arms (wrists below shoulders), and the walk moves", async () => {
    const { posed, map, bones } = await rig("bkHero");
    for (const [gait, t] of [["Idle", 0.5], ["Walk", 0.1], ["Walk", 0.6], ["Run", 0.2]] as const) {
      const { result, at } = posed(gait, t);
      expect(result.missingTargets).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(15);
      for (const arm of [map.armL, map.armR]) {
        const shoulder = at(bones[arm[1]!]!.name), wrist = at(bones[arm[3]!]!.name);
        const len = Math.hypot(...shoulder.map((v, k) => v - wrist[k]!));
        expect(shoulder[1]! - wrist[1]!, `${gait} ${t}`).toBeGreaterThan(0.45 * len);
      }
    }
    expect(posed("Walk", 0.1).rots).not.toEqual(posed("Walk", 0.6).rots);
    // the swinging (left, staff-free) hand moves between the two times (both dispatched at engine time 0)
    const w1 = posed("Walk", 0.1).wrist, w2 = posed("Walk", 0.6).wrist;
    expect(Math.hypot(...w1.map((v, k) => v - w2[k]!))).toBeGreaterThan(0.02);
  });
});
