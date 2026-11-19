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
import { idolHeroPose } from "../../../examples/kid-goku-beyond-the-clouds-port/art/idolHero";
import { IDOL_HERO_RIG } from "../../../examples/kid-goku-beyond-the-clouds-port/art/idolHeroRig";
import { computeSkyKidHeroPose } from "../../../examples/kid-goku-beyond-the-clouds-port/art/proceduralModels";

/**
 * End to end on the shipped Idol GLBs: `computeSkyKidHeroPose` -> `idolHeroPose` -> runtime handle `setAnimationPose` (which clones
 * the pose) -> the engine's typed-GLB actor -> skinning palette. Arms must hang (no bind T-pose) and the run must move.
 */
async function rig(key: "cdSkyKidHero") {
  const file = `examples/kid-goku-beyond-the-clouds-port/assets/idol/${key}.glb`;
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
  const firstHand = IDOL_HERO_RIG.bones[IDOL_HERO_RIG.limbs[0]!.tip]!.name;
  const posed = (clip: string, gaitPhase: number) => {
    handle.setAnimationPose(idolHeroPose(IDOL_HERO_RIG, computeSkyKidHeroPose({ clip, clock: 4, animT: 0.2, gaitPhase, groundSpeed: 15, lean: 0.12 } as never)) as never);
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
  return { posed };
}

describe("Cumulus Dash Idol hero through the engine (shipped GLB)", () => {
  it("run poses reach the skinning palette at a frozen engine clock, and the run moves", async () => {
    const { posed } = await rig("cdSkyKidHero");
    for (const phase of [0.4, 1.7, 3.0]) {
      const { result } = posed("run", phase);
      expect(result.missingTargets).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(15);
    }
    const a = posed("run", 0.4), b = posed("run", 1.9);
    expect(a.rots).not.toEqual(b.rots);
    expect(Math.hypot(...a.wrist.map((v, k) => v - b.wrist[k]!))).toBeGreaterThan(0.02);
  });
});
