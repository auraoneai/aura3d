/**
 * Mocap upgrade of the rigged Idol Bellkeeper: fal.ai text-to-motion clips (Idle, Walk, Hop, RingBell) played through the
 * shared animator and humanoid driver. The walk follows the ground metres walked (planted feet), the hop's apex lands on
 * the sim's apex, the bell salute raises the staff hand, the head takes the gaze, and the live pose reaches the shipped
 * GLB's skinning palette at a frozen engine clock.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { dispatchActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { MOTION_CLIPS } from "../../../apps/showcase-where-the-wind-wanders-port/src/motion.generated";
import { HOP_SECONDS, HOP_WINDOW, bellkeeperDriver, createBellkeeperMotion, measureWalkTable, type BellkeeperMotionInput } from "../../../examples/where-the-wind-wanders-port/art/idolMotion";
import { WALK_SPEED } from "../../../examples/where-the-wind-wanders-port/sim";

const DT = 1 / 60;
const base: BellkeeperMotionInput = { gait: "Idle", metres: 0, dt: DT, hopPhase: "idle", ring: 0, lookYaw: 0, lookPitch: 0, onBoat: false };

describe("Bellkeeper Idol mocap clips", () => {
  it("ships the captured clips and maps every humanoid role on the hero skeleton", () => {
    expect(Object.keys(MOTION_CLIPS).sort()).toEqual(["Hop", "Idle", "RingBell", "Walk"]);
    expect(Number(MOTION_CLIPS.Walk.meta?.loop)).toBe(1);
    expect(Number(MOTION_CLIPS.Walk.meta?.groundSpeedHip)).toBeGreaterThan(0.5);
    const d = bellkeeperDriver();
    expect(d.map.ok).toBe(true);
    expect(d.map.missing).toEqual([]);
  });

  it("walks at the sim's speed with each planted foot held within 5 cm", () => {
    const m = createBellkeeperMotion(), d = m.driver, R = d.map.roles;
    let metres = 0, worst = 0, steps = 0, planted: { foot: string; at: number[] } | null = null;
    for (let f = 0; f < 600; f++) {
      metres += WALK_SPEED * DT;
      const fr = m.frame({ ...base, gait: "Walk", metres });
      if (f < 30) continue; // the fade in from Idle
      expect(fr.clip).toBe("Walk");
      const P = d.modelPositions(fr.input);
      const foot = P[R.leftFoot!]![1] <= P[R.rightFoot!]![1] ? R.leftFoot! : R.rightFoot!;
      const at = [P[foot]![0], P[foot]![2] + metres]; // the body walks +Z
      if (!planted || planted.foot !== foot) { planted = { foot, at }; steps++; }
      else worst = Math.max(worst, Math.hypot(at[0]! - planted.at[0]!, at[1]! - planted.at[1]!));
    }
    expect(steps).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.05);
    // one captured cycle covers several metres on this body (the clip is not a shuffle)
    expect(measureWalkTable(d).cycle).toBeGreaterThan(2);
  });

  it("the skeleton moves every frame at real frame time, walking and idling", () => {
    for (const gait of ["Walk", "Idle"] as const) {
      const m = createBellkeeperMotion();
      const seen = new Set<string>();
      for (let f = 0; f < 20; f++) seen.add(JSON.stringify(m.frame({ ...base, gait, metres: f * WALK_SPEED * DT }).pose.bones));
      expect(seen.size).toBeGreaterThan(18);
    }
  });

  it("maps the sim hop onto the captured hop with the apex on the sim's apex, and the world keeps the lift", () => {
    const m = createBellkeeperMotion();
    const apexAt = HOP_SECONDS.takeoff + 5.6 / 13;
    let t = 0, clipAtApex = -1;
    for (let f = 0; t < apexAt + 0.3; f++) {
      const phase = t < HOP_SECONDS.takeoff ? "takeoff" : "air";
      const fr = m.frame({ ...base, hopPhase: phase });
      expect(fr.clip).toBe("Hop");
      expect(fr.input.hipsOffset![1]).toBeLessThanOrEqual(1e-9); // world.ts lifts the hero by the sim's hop height
      if (clipAtApex < 0 && t + DT > apexAt) clipAtApex = fr.time;
      t += DT;
    }
    const apex = Number(MOTION_CLIPS.Hop.meta?.apexTime);
    expect(apex).toBeGreaterThan(HOP_WINDOW[0]);
    expect(apex).toBeLessThan(HOP_WINDOW[1]);
    expect(Math.abs(clipAtApex - apex)).toBeLessThan(0.05);
  });

  it("the bell salute raises the staff hand and the gaze turns the head", () => {
    const m = createBellkeeperMotion();
    const rest = m.frame(base).hand;
    const peak = Number(MOTION_CLIPS.RingBell.meta?.wristRHighTime) / MOTION_CLIPS.RingBell.duration;
    const raised = createBellkeeperMotion().frame({ ...base, ring: 1 - peak }).hand;
    expect(raised[1] - rest[1]).toBeGreaterThan(0.5);
    const a = createBellkeeperMotion().frame(base).input.rotations.head!;
    const b = createBellkeeperMotion().frame({ ...base, lookYaw: 0.5 }).input.rotations.head!;
    expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])).toBeLessThan(0.99);
  });

  it("models.ts drives the Idol hero from the motion frames", () => {
    const src = readFileSync("examples/where-the-wind-wanders-port/models.ts", "utf8");
    expect(src).toContain("applyIdolBellkeeperMotion(getJoint, frame, pose, idlePose)");
    expect(src).toContain("metres += Math.hypot(x - lastX, z - lastZ)");
  });

  it("the motion pose reaches the shipped GLB's skinning palette at a frozen engine clock, and it moves", async () => {
    const bytes = readFileSync("examples/where-the-wind-wanders-port/assets/idol/bkHero.glb");
    const url = "https://offline-idol.invalid/bkHero.glb";
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
    const actor = await createTypedGLBActor({
      asset: { type: "model", format: "glb", url } as never, id: "idol", name: "idol", width: 64, height: 64, shareTextures: false,
      imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
    } as never);
    vi.unstubAllGlobals();
    const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
    const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "body", scaleMode: "world" }).runtime({ id: "body" })).toJSON()).require("body");
    const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
    const m = createBellkeeperMotion();
    const palettes: string[] = [];
    let metres = 0;
    for (let k = 0; k < 3; k++) {
      for (let f = 0; f < 12; f++) { metres += WALK_SPEED * DT; handle.setAnimationPose(m.frame({ ...base, gait: "Walk", metres }).pose as never); }
      const warnings = new Set<string>();
      dispatchActorAnimation({ actor } as never, { animationPose: handle.animationPose() as never }, { kind: "model", runtime: { id: "body" } } as never, 0, warnings, identity, () => {});
      expect([...warnings]).toEqual([]);
      const result = actor.applyRetargetedPose(handle.animationPose() as never);
      expect(result.missingTargets).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(15);
      palettes.push(Array.from((actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array).slice(0, 16 * 22), (v) => v.toFixed(4)).join());
    }
    expect(new Set(palettes).size).toBe(3);
  });
});
