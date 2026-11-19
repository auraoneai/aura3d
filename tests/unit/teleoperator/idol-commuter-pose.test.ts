import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { COMMUTER_CLIPS, COMMUTER_RIGHT_ARM, commuterHailOverlay } from "../../../apps/showcase-teleoperator/src/art/idolModels";
import { idolClipRig, maxTravel } from "./idolClipDispatch";

/**
 * Grid Dispatch kerbside commuter (rigged Idol GLB) end to end: pose -> runtime handle `setAnimationPose` (clone) -> the
 * engine's typed-GLB actor -> skinning palette. The idle / walk clips the game plays hang the arms and move; the hail
 * overlay raises the right arm and waves (two gameplay times differ).
 */
const FILE = "apps/showcase-teleoperator/assets/idol/gdCommuter.glb";
type Quat = { x: number; y: number; z: number; w: number };

async function rig() {
  const bytes = readFileSync(FILE);
  const url = "https://offline-idol.invalid/gdCommuter.glb";
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
  const posed = (pose: { bones: Record<string, { rotation?: Quat }>; mode?: "replace" | "overlay" }) => {
    handle.setAnimationPose(pose as never);
    const cloned = handle.animationPose()!;
    const result = actor.applyRetargetedPose(cloned as never);
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (bone: string): [number, number, number] => {
      const k = jointIndex.get(bone)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
    return { cloned, result, at };
  };
  /** Full-body pose from a GLB clip at time fraction `u` of its duration (nearest earlier key of every rotation channel). */
  const clipPose = (clip: string, u: number) => {
    const anim = doc.getRoot().listAnimations().find((a) => a.getName() === clip)!;
    const duration = Math.max(...anim.listChannels().map((ch) => { const t = ch.getSampler()!.getInput()!.getArray()!; return t[t.length - 1]!; }));
    const time = u * duration;
    const bones: Record<string, { rotation: Quat }> = {};
    let keys = 0;
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "rotation") continue;
      const t = ch.getSampler()!.getInput()!.getArray()!, out = ch.getSampler()!.getOutput()!.getArray()!;
      keys = Math.max(keys, t.length);
      let k = 0;
      while (k + 1 < t.length && t[k + 1]! <= time) k++;
      bones[ch.getTargetNode()!.getName()] = { rotation: { x: out[k * 4]!, y: out[k * 4 + 1]!, z: out[k * 4 + 2]!, w: out[k * 4 + 3]! } };
    }
    return { bones, keys, duration };
  };
  return { posed, clipPose };
}

describe("Grid Dispatch Idol commuter moves through the engine (real GLB)", () => {
  it("idle and walk clips exist under the names main.ts plays, hang both arms and move between keyframes", async () => {
    const { posed, clipPose } = await rig();
    for (const clip of [COMMUTER_CLIPS.idle, COMMUTER_CLIPS.walk]) {
      const { keys, duration } = clipPose(clip, 0);
      expect(keys, clip).toBeGreaterThan(4);
      expect(duration, clip).toBeGreaterThan(0.3);
      const samples = [0, 0.3, 0.6].map((u) => {
        const { result, at } = posed(clipPose(clip, u));
        expect(result.transformTracksApplied, clip).toBeGreaterThan(20);
        for (const [shoulder, wrist] of [["bone_7", "bone_9"], ["bone_14", "bone_16"]] as const) {
          const s = at(shoulder), w = at(wrist);
          const armLen = Math.hypot(s[0] - w[0], s[1] - w[1], s[2] - w[2]);
          // T-pose keeps the wrist at shoulder height; the played clips hang the arm well below it.
          expect(s[1] - w[1], `${clip} ${shoulder}`).toBeGreaterThan(0.45 * armLen);
        }
        return ["bone_9", "bone_16", "bone_23", "bone_27"].map((b) => at(b));
      });
      const moved = Math.max(...samples[0]!.map((p, i) => Math.max(...samples.slice(1).map((q) => Math.hypot(p[0] - q[i]![0], p[1] - q[i]![1], p[2] - q[i]![2])))));
      expect(moved, `${clip} moves`).toBeGreaterThan(clip === COMMUTER_CLIPS.walk ? 0.05 : 0.002);
    }
  }, 60_000);

  it("hail overlay: object quaternions survive the handle clone, raise the right hand above the shoulder and wave over time", async () => {
    const { posed } = await rig();
    const a = posed(commuterHailOverlay(0.1, true));
    expect(a.cloned.mode).toBe("overlay");
    const q = a.cloned.bones[COMMUTER_RIGHT_ARM.forearm]!.rotation!;
    expect([q.x, q.y, q.z, q.w].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 4);
    expect(a.result.missingTargets).toEqual([]);
    const shoulder = a.at(COMMUTER_RIGHT_ARM.upperArm), wrist = a.at("bone_16");
    expect(wrist[1] - shoulder[1]).toBeGreaterThan(0.15); // raised hail (1 m-tall unscaled rig)
    expect(wrist[2] - shoulder[2]).toBeGreaterThan(0); // toward the street the commuter faces (+Z)
    const b = posed(commuterHailOverlay(0.45, true));
    const w2 = b.at("bone_16");
    expect(Math.hypot(wrist[0] - w2[0], wrist[1] - w2[1], wrist[2] - w2[2])).toBeGreaterThan(0.01);
    // reduced motion holds the raised arm still
    const r0 = posed(commuterHailOverlay(0.1, false)).at("bone_16"), r1 = posed(commuterHailOverlay(0.9, false)).at("bone_16");
    expect(Math.hypot(r0[0] - r1[0], r0[1] - r1[1], r0[2] - r1[2])).toBeLessThan(1e-6);
  }, 60_000);

  it("main.ts lets the engine clock run (auto-started frame loop, no app.step(0)), so the commuter's clips advance", () => {
    const main = readFileSync("apps/showcase-teleoperator/src/main.ts", "utf8");
    expect(main).not.toMatch(/app\.step\(0\)|\.step\(0\)/);
    expect(main).not.toMatch(/autoStart:\s*false/);
  });

  it("commuter: clips play through the engine's per-frame dispatch at real frame time; a frozen engine clock stays in the T-pose", async () => {
    for (const key of ["gdCommuter"] as const) {
      const r = await idolClipRig(`apps/showcase-teleoperator/assets/idol/${key}.glb`);
      expect(r.clipNames, key).toEqual(expect.arrayContaining([COMMUTER_CLIPS.walk, COMMUTER_CLIPS.idle]));
      for (const clip of [COMMUTER_CLIPS.walk, COMMUTER_CLIPS.idle]) {
        const spec = { clip, loop: true, speed: 1 };
        // app.step(0): engine time never moves, the clip never fades in, the bind T-pose is drawn
        let f = r.frame(spec, 5000);
        for (let i = 0; i < 10; i++) f = r.frame(spec, 5000);
        // (checked on the first clip only: the actor keeps the last played pose when the next clip starts)
        if (clip === COMMUTER_CLIPS.walk) for (const d of r.handDrop(f)) expect(d, `${key} ${clip} frozen clock`).toBeLessThan(0.15);
        // real frame time (60 fps)
        let ms = 5000;
        const advance = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) f = r.frame(spec, (ms += 1000 / 60)); return f; };
        const a = advance(1.0);
        expect(a.warnings, key).toEqual([]);
        for (const d of r.handDrop(a)) expect(d, `${key} ${clip} arms hang`).toBeGreaterThan(0.2);
        const b = advance(clip === COMMUTER_CLIPS.walk ? 0.4 : 1.2);
        expect(maxTravel(a, b), `${key} ${clip} moves`).toBeGreaterThan(clip === COMMUTER_CLIPS.walk ? 0.03 : 0.002);
      }
    }
  }, 180_000);
});
