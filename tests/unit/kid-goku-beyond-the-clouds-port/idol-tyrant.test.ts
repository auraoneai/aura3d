/**
 * Storm tyrant creature pass: the rigged Idol tyrant (cdStormTyrantRig) is posed every frame from
 * art/rexAnimation.ts. Its walk is driven by the distance it covers, so the stance foot stays planted at chase speeds;
 * it idles when it stands, opens its jaw on the arrival roar and on a lunge, and snaps its head back when stunned.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { dispatchActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { REX_FORWARD, REX_MAP, createRexDriver, rexStrideYaw, type RexDriveInput } from "../../../examples/kid-goku-beyond-the-clouds-port/art/rexAnimation";
import { REX_RIG } from "../../../examples/kid-goku-beyond-the-clouds-port/art/rexRigData";
import { REX_MODEL_SCALE, idolTyrantNode } from "../../../examples/kid-goku-beyond-the-clouds-port/idol";

const MPU = REX_MODEL_SCALE * 1.15; // world.ts scales the tyrant group by 1.15
const DT = 1 / 60;
const base: RexDriveInput = { moved: 0, dt: DT, metresPerUnit: MPU, stunned: false, lunge: 0, swipe: 0, sinceAppear: 10 };
const subtree = (i: number): number[] => [i, ...REX_RIG.bones.flatMap((b, k) => (b.parent === i ? subtree(k) : []))];
const jawTip = subtree(REX_MAP.jaw).at(-1)!;

interface N { kind?: string; name?: string; scale?: number | number[]; runtime?: { id?: string }; children?: N[]; asset?: { id?: string; key?: string } }

describe("Cumulus Dash storm tyrant (rigged Idol creature)", () => {
  it("mounts the rigged tyrant at its generated scene scale inside the group world.ts places", () => {
    const n = idolTyrantNode().toJSON() as unknown as N;
    expect(n.kind).toBe("group");
    expect(n.runtime?.id).toBe("rex-body");
    const m = n.children![0]!;
    expect(m.runtime?.id).toBe("rex-model");
    expect(JSON.stringify(m)).toContain("cdStormTyrantRig");
    expect(JSON.stringify(m.scale)).toContain(String(REX_MODEL_SCALE));
  });

  it.each([4, 12, 26])("walking at %d m/s keeps each stance foot planted within 5 cm", (speed) => {
    const drv = createRexDriver();
    let travelled = 0, worst = 0, steps = 0, planted: { foot: number; at: number[] } | null = null;
    for (let f = 0; f < 60 * 6; f++) {
      travelled += speed * DT;
      drv.step({ ...base, moved: speed * DT });
      if (f < 150) continue; // speed, stride and idle blend settle
      const j = drv.joints();
      const [a, b] = REX_MAP.feet;
      const foot = j[a]![1] <= j[b]![1] ? a : b;
      // world position of the stance foot: rig joint at the model's scale plus how far the body has walked
      const at = j[foot]!.map((v, k) => v * MPU + REX_FORWARD[k]! * travelled);
      if (!planted || planted.foot !== foot) { planted = { foot, at }; steps++; }
      else worst = Math.max(worst, Math.hypot(...at.map((v, k) => v - planted!.at[k]!)));
    }
    expect(steps).toBeGreaterThan(3); // the feet take turns
    expect(worst).toBeLessThan(0.05);
  });

  it("an amplified (fast) stride stays on the walking line", () => {
    expect(Math.abs(rexStrideYaw(1))).toBeLessThan(1e-9);
    expect(Math.abs(rexStrideYaw(2.25))).toBeLessThan(0.1);
  });

  it("the skeleton moves every frame while walking and still breathes standing", () => {
    const drv = createRexDriver();
    const seen = new Set<string>();
    for (let f = 0; f < 30; f++) seen.add(JSON.stringify(drv.step({ ...base, moved: 12 * DT }).bones));
    expect(seen.size).toBe(30);
    const idle = createRexDriver();
    const a = JSON.stringify(idle.step(base).bones);
    for (let f = 0; f < 40; f++) idle.step(base);
    expect(JSON.stringify(idle.step(base).bones)).not.toEqual(a);
  });

  it("roars on arrival and opens the jaw on a lunge; a stun snaps the head back", () => {
    const head = REX_RIG.bones.flatMap((b, k) => (b.parent === REX_MAP.head && k !== REX_MAP.jaw ? [k] : []))[0]!;
    const gape = (inp: Partial<RexDriveInput>) => {
      const drv = createRexDriver();
      for (let f = 0; f < 20; f++) drv.step({ ...base, ...inp });
      const j = drv.joints();
      return { jaw: drv.state.jaw, gap: Math.hypot(...j[jawTip]!.map((v, k) => v - j[head]![k]!)) * MPU };
    };
    const shut = gape({}), roar = gape({ sinceAppear: 0.5 }), bite = gape({ lunge: 1 });
    expect(shut.jaw).toBe(0);
    expect(roar.jaw).toBeGreaterThan(0.5);
    expect(roar.gap).toBeGreaterThan(shut.gap + 0.1);
    expect(bite.jaw).toBeGreaterThan(0.9);
    expect(bite.gap).toBeGreaterThan(shut.gap + 0.15);
    const drv = createRexDriver();
    for (let f = 0; f < 20; f++) drv.step(base);
    const before = drv.joints()[head]!; // a skull joint: it swings with the head
    for (let f = 0; f < 6; f++) drv.step({ ...base, stunned: true });
    expect(drv.state.hurt).toBeGreaterThan(0.5);
    const after = drv.joints()[head]!;
    expect(after[1]! - before[1]!).toBeGreaterThan(0.02 / MPU); // snapped up and back
    expect(Math.hypot(...after.map((v, k) => v - before[k]!)) * MPU).toBeGreaterThan(0.2);
  });

  it("world.ts poses the rigged tyrant from the distance it covers every frame", () => {
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    expect(src).toMatch(/rexDriver\.step\(\{ moved:/);
    expect(src).toContain('node("rex-model").setAnimationPose?.(pose)');
    expect(src).toContain("metresPerUnit: REX_MODEL_SCALE * sc");
  });

  it("the live pose reaches the shipped GLB's skinning palette at a frozen engine clock", async () => {
    const bytes = readFileSync("examples/kid-goku-beyond-the-clouds-port/assets/idol/cdStormTyrantRig.glb");
    const url = "https://offline-idol.invalid/cdStormTyrantRig.glb";
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
    const actor = await createTypedGLBActor({
      asset: { type: "model", format: "glb", url } as never, id: "rex", name: "rex", width: 64, height: 64, shareTextures: false,
      imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
    } as never);
    vi.unstubAllGlobals();
    const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
    const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "rex-model", scaleMode: "world" }).runtime({ id: "rex-model" })).toJSON()).require("rex-model");
    const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
    const drv = createRexDriver();
    const palettes: string[] = [];
    for (let f = 0; f < 3; f++) {
      for (let k = 0; k < 10; k++) handle.setAnimationPose(drv.step({ ...base, moved: 12 * DT }) as never);
      const warnings = new Set<string>();
      dispatchActorAnimation({ actor } as never, { animationPose: handle.animationPose() as never }, { kind: "model", runtime: { id: "rex-model" } } as never, 0, warnings, identity, () => {});
      expect([...warnings]).toEqual([]);
      const result = actor.applyRetargetedPose(handle.animationPose() as never);
      expect(result.missingTargets).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(60);
      palettes.push(Array.from((actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array).slice(0, 16 * 70), (v) => v.toFixed(4)).join());
    }
    expect(new Set(palettes).size).toBe(3);
  });

  it("F3: a bite lunge keeps both feet planted and pitches the torso, not the legs", () => {
    const drv = createRexDriver();
    for (let f = 0; f < 30; f++) drv.step(base);
    const before = drv.joints();
    for (let f = 0; f < 40; f++) drv.step({ ...base, lunge: Math.min(1, f / 20) });
    const after = drv.joints();
    for (const foot of REX_MAP.feet) expect(Math.hypot(...after[foot]!.map((v, k) => v - before[foot]![k]!)) * MPU).toBeLessThan(0.05);
    expect(after[REX_MAP.head]![1]! - before[REX_MAP.head]![1]!).toBeLessThan(-0.02);
  });

  it("F3: even at a 30 m/s chase the thighs swing within ~75 degrees of rest (no torn hip skin)", () => {
    const drv = createRexDriver();
    let worst = 0;
    for (let f = 0; f < 240; f++) {
      const pose = drv.step({ ...base, moved: 30 * DT });
      for (const leg of REX_MAP.legRoots) {
        const q = pose.bones[REX_RIG.bones[leg]!.name]!.rotation, r = REX_RIG.bones[leg]!.r;
        const dot = Math.abs(q.x * r[0]! + q.y * r[1]! + q.z * r[2]! + q.w * r[3]!);
        worst = Math.max(worst, 2 * Math.acos(Math.min(1, dot)));
      }
    }
    expect(worst).toBeLessThan(1.3); // the captured walk itself swings these bones ~1.1 rad
  });
});

