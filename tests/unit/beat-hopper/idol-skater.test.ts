import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { applyProductionActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { BeatHopperSim } from "../../../apps/showcase-beat-hopper/src/sim";
import { IDOL_BOT_CLIPS, IDOL_BOT_HEIGHT, buildWorld, idolBotAnimation } from "../../../apps/showcase-beat-hopper/src/world";

/**
 * Idol wow pass: the Beat Hopper hero is the rigged Idol skater-bot, animated by its own idle / run / jump clips through
 * `node.animation`: runtime handle `setAnimation` -> handle snapshot -> the engine's per-frame actor dispatch
 * (`applyProductionActorAnimation`, which with the default-on A3D_QR_ANIMATION runs the pose mixer and advances it by the
 * frame-time delta). This drives the real GLB through that path and checks it is not a frozen T-pose: the arms hang and
 * the bones move. It also pins the Nov 2026 root cause: rendering at a constant engine time (main.ts used `app.step(0)`)
 * never advances the mixer, so the crossfade weight stays 0 and the bind T-pose is drawn.
 */
const GLB = "apps/showcase-beat-hopper/assets/idol/bhSkaterBot.glb";

async function rig() {
  const bytes = readFileSync(GLB);
  const url = "https://offline-idol.invalid/bhSkaterBot.glb";
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url } as never, id: "bot", name: "bot", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const assets = defineAuraAssets({ bot: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
  const snapshot = scene().add(model(assets.bot, { name: "bot", scaleMode: "world" }).runtime({ id: "bot" })).toJSON();
  const handle = createAuraRuntimeNodeRegistry(snapshot).require("bot");
  // Joints read from this rig's hierarchy (bone_3 chest -> clavicle -> shoulder -> elbow -> wrist on each side; bone_0
  // hips -> hip -> knee -> ankle). The shared humanoid mapper does not resolve this rig's right arm (one extra bone).
  const roles: Record<string, string> = {
    leftUpperArm: "bone_14", leftHand: "bone_16", rightUpperArm: "bone_7", rightHand: "bone_9",
    leftFoot: "bone_26", rightFoot: "bone_22"
  };
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointIndex = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
  const bindPos = (k: number): [number, number, number] => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as [number, number, number];
  };
  const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  /** Set a spec on the runtime handle and run the engine's actor dispatch for one frame at engine time `ms`. */
  const at = (spec: ReturnType<typeof idolBotAnimation>, ms: number) => {
    handle.setAnimation(spec);
    const node = { kind: "model", animation: handle.snapshot().animation, runtime: { id: "bot" } };
    const warnings = new Set<string>();
    applyProductionActorAnimation({ actor } as never, node as never, undefined, ms, warnings, identity, () => {});
    expect([...warnings]).toEqual([]);
    const result = { clip: handle.snapshot().animation!.clip };
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const bone = (role: string): [number, number, number] => {
      const k = jointIndex.get(roles[role]!)!, p = bindPos(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as [number, number, number];
    };
    return { result, bone };
  };
  return { at };
}

describe("beat-hopper Idol skater-bot motion (real GLB through the runtime node)", () => {
  it("picks run / jump / idle from the pose", () => {
    expect(idolBotAnimation("grounded", true, false).clip).toBe("run");
    expect(idolBotAnimation("air", true, false)).toMatchObject({ clip: "jump", loop: false });
    expect(idolBotAnimation("duck", true, false).clip).toBe("idle");
    expect(idolBotAnimation("grounded", false, false).clip).toBe("idle");
  });

  it("main.ts advances the engine clock by frame time (the mixer needs dt; step(0) froze the bot in its T-pose)", () => {
    const main = readFileSync("apps/showcase-beat-hopper/src/main.ts", "utf8");
    expect(main).not.toMatch(/app\.step\(0\)/);
    expect(main).toMatch(/app\.step\(frameDt\)/);
  });

  it("mounts the bot at world scale inside the player group", () => {
    const nodes = buildWorld({ sim: new BeatHopperSim(7), aspect: 16 / 9 }).scene.toJSON().nodes as unknown as { name?: string; children?: { name?: string; scaleMode?: string; scale?: unknown }[] }[];
    const bot = nodes.find((n) => n.name === "player")?.children?.find((c) => c.name === "bot-idol");
    expect(bot?.scaleMode).toBe("world");
    expect(bot?.scale).toBe(IDOL_BOT_HEIGHT);
  }, 60_000);

  it("frame-stepped clips hang the arms and move the bones; a frozen engine clock stays in the bind T-pose", async () => {
    const { at } = await rig();
    const armsHang = (bone: (r: string) => [number, number, number], label: string, hang: boolean) => {
      for (const side of ["left", "right"]) {
        const shoulder = bone(`${side}UpperArm`), wrist = bone(`${side}Hand`);
        const armLen = Math.hypot(...shoulder.map((v, i) => v - wrist[i]!));
        if (hang) expect(shoulder[1] - wrist[1], `${label} ${side} wrist below shoulder`).toBeGreaterThan(0.3 * armLen);
        else expect(Math.abs(shoulder[1] - wrist[1]), `${label} ${side} T-pose arm level`).toBeLessThan(0.15 * armLen);
      }
    };
    // step(0): the engine time never moves, so the run crossfade never fades in.
    const run = idolBotAnimation("grounded", true, false);
    let frozen = at(run, 5000);
    for (let f = 0; f < 10; f++) frozen = at(run, 5000);
    armsHang(frozen.bone, "frozen clock", false);
    // real frame time (60 fps): the run plays; sample two gameplay times half a cycle apart.
    let ms = 5000, cur = frozen;
    const advance = (seconds: number, spec = run) => { for (let f = 0; f < Math.round(seconds * 60); f++) cur = at(spec, (ms += 1000 / 60)); return cur; };
    const a = advance(0.5);
    armsHang(a.bone, "run", true);
    const pa = ["leftHand", "rightHand", "leftFoot", "rightFoot"].map((r) => a.bone(r));
    const b = advance(IDOL_BOT_CLIPS.run / (2 * run.speed));
    const pb = ["leftHand", "rightHand", "leftFoot", "rightFoot"].map((r) => b.bone(r));
    const moved = Math.max(...pa.map((p, i) => Math.hypot(p[0] - pb[i]![0], p[1] - pb[i]![1], p[2] - pb[i]![2])));
    expect(moved, "run cycle moves hands and feet").toBeGreaterThan(0.05);
    // take-off: the jump clip crossfades in and plays.
    const j = advance(0.4, idolBotAnimation("air", true, false));
    expect(j.result.clip).toBe("jump");
    armsHang(j.bone, "jump", true);
  }, 60_000);
});
