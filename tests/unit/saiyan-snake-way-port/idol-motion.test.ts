/**
 * Idol motion pass (Serpentine runner): text-to-motion clips (fal hunyuan-motion via tools/idol/motion.mjs) drive the
 * rigged Idol runner through the shared humanoid driver. Run follows the distance-driven run phase, the jump is synced
 * to the sim's ballistic arc, slide / stumble follow the sim timers, flight keeps the code pose; the pose reaches the
 * shipped GLB's skinning palette without an engine clip clock.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { clipGroundSpeed, locomotionTime } from "../../../apps/showcase-port-shared/idol/motion";
import { sampleHumanoidClip } from "../../../apps/showcase-port-shared/idol/humanoid";
import { MOTION_CLIPS } from "../../../apps/showcase-serpentine-sky-run-port/src/motion.generated";
import { createRunnerMotion, heroPartsToHumanoid, jumpTakeoff, runnerMotionRequest, type RunnerMotionState } from "../../../examples/saiyan-snake-way-port/art/idolMotion";
import { IDOL_RUNNER_SKELETONS } from "../../../examples/saiyan-snake-way-port/art/idolSkeletons.data";
import { poseHero } from "../../../examples/saiyan-snake-way-port/hero";
import { GRAVITY, JUMP_SPEED } from "../../../examples/saiyan-snake-way-port/sim";

const SK = IDOL_RUNNER_SKELETONS.ssrHeroViolet!;
const parts = (over: Partial<Parameters<typeof poseHero>[0]> = {}) => poseHero({ phase: 1, time: 1, grounded: true, vy: 0, sliding: false, flying: false, diving: false, lean: 0, surge: 0, stumble: 0, speed: 32, ...over });
const base = (over: Partial<RunnerMotionState> = {}): RunnerMotionState => ({
  dt: 1 / 60, phase: 0, moving: true, grounded: true, y: 0, vy: 0, sliding: 0, stumble: 0, laneVel: 0, flying: false, diving: false, lean: 0, surge: 0, parts: parts(), ...over
});

describe("Serpentine Idol runner motion clips", () => {
  it("ships the six generated clips on the canonical humanoid", () => {
    expect(Object.keys(MOTION_CLIPS).sort()).toEqual(["DodgeLeft", "Idle", "Jump", "Run", "Slide", "Stumble"]);
    expect(Number(MOTION_CLIPS.Run.meta?.loop)).toBe(1);
    expect(Number(MOTION_CLIPS.Jump.meta?.loop)).toBe(0);
    for (const sk of Object.values(IDOL_RUNNER_SKELETONS)) expect(createRunnerMotion(sk).driver.map.ok).toBe(true);
  });

  // Measured: the generated sprint's ankle creeps 7-8 cm over a 0.13 s stance at its own 4.5 m/s (heel roll); the game
  // runs at 32-48 m/s with its own cadence (a 1.9 m body cannot cover that ground), so this checks the clip, not the game.
  it("the run clip keeps a planted foot (under 9 cm stance creep) at its own ground speed when driven by distance", () => {
    const m = createRunnerMotion(SK);
    const hip = m.driver.map.hipHeight, speed = clipGroundSpeed(MOTION_CLIPS.Run, hip);
    const lf = m.driver.map.roles.leftFoot!, rf = m.driver.map.roles.rightFoot!;
    const frames = Array.from({ length: 120 }, (_, k) => {
      const metres = k * (speed / 60);
      const p = m.driver.modelPositions(sampleHumanoidClip(MOTION_CLIPS.Run, locomotionTime(MOTION_CLIPS.Run, metres, hip), { loop: true }));
      return { metres, l: p[lf]!, r: p[rf]! };
    });
    // a foot is planted while it is within 2 cm of its lowest point; its world position (body moves +Z) must hold
    let worst = 0, contacts = 0;
    for (const side of ["l", "r"] as const) {
      let start: number | null = null;
      const ground = Math.min(...frames.map((f) => f[side][1]));
      for (const f of frames) {
        const q = f[side];
        if (q[1] < ground + 0.02) { contacts++; const z = q[2] + f.metres; if (start === null) start = z; else worst = Math.max(worst, Math.abs(z - start)); }
        else start = null;
      }
    }
    expect(contacts).toBeGreaterThan(12);
    expect(worst).toBeLessThan(0.09); // stance creep over a whole contact (m)
  });

  it("run clip time follows the distance-driven run phase, never wall time; standing plays Idle", () => {
    const at = (phase: number, dt = 1 / 60) => runnerMotionRequest(base({ phase, dt }), 2);
    const a = at(3), b = at(3, 0.5);
    expect(a).toEqual(b); // same phase, different frame time: same clip time
    expect((at(3) as { time: number }).time).toBeCloseTo((at(3 + 2 * Math.PI * 2) as { time: number }).time, 6); // one loop later
    expect((at(4) as { time: number }).time).toBeGreaterThan((at(3) as { time: number }).time);
    expect(runnerMotionRequest(base({ moving: false }), 2)).toMatchObject({ clip: "Idle" });
  });

  it("the jump clip's take-off and apex land on the sim jump's take-off and apex", () => {
    const apexH = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    const req = (y: number, vy: number) => runnerMotionRequest(base({ grounded: false, y, vy }), 2) as { clip: string; time: number };
    expect(req(0, JUMP_SPEED).clip).toBe("Jump");
    expect(req(0, JUMP_SPEED).time).toBeCloseTo(jumpTakeoff(), 3);
    expect(req(apexH, 0).time).toBeCloseTo(Number(MOTION_CLIPS.Jump.meta!.apexTime), 3);
    expect(req(apexH * 0.5, -10).time).toBeGreaterThan(req(apexH, 0).time);
  });

  it("slide, stumble, lane hops and flight pick their sources", () => {
    expect(runnerMotionRequest(base({ sliding: 0.3 }), 2)).toMatchObject({ clip: "Slide" });
    expect(runnerMotionRequest(base({ stumble: 0.5 }), 2)).toMatchObject({ clip: "Stumble" });
    const l = runnerMotionRequest(base({ laneVel: -9 }), 2) as { clip: string; mirror: boolean };
    const r = runnerMotionRequest(base({ laneVel: 9 }), 2) as { clip: string; mirror: boolean };
    expect(l.clip).toBe("DodgeLeft");
    expect(l.mirror).not.toBe(r.mirror);
    expect(runnerMotionRequest(base({ flying: true }), 2)).toMatchObject({ key: "code" });
  });

  it("the code pose for flight converts poseHero faithfully (rest = limbs hanging, facing +Z)", () => {
    const m = createRunnerMotion(SK);
    const p = m.driver.modelPositions(heroPartsToHumanoid(parts({ flying: true })));
    const r = m.driver.map.roles;
    // flight: body pitched forward, so the head is ahead of (+Z) the hips
    expect(p[r.head!]![2]).toBeGreaterThan(p[r.hips!]![2] + 0.3);
  });

  it("bones change every frame at real frame time (idle at a standstill, run along the road)", () => {
    const m = createRunnerMotion(SK);
    const seen = new Set<string>();
    for (let f = 0; f < 20; f++) seen.add(JSON.stringify(m.pose(base({ moving: false })).bones));
    expect(seen.size).toBeGreaterThan(15);
    const run = new Set<string>();
    for (let f = 0; f < 20; f++) run.add(JSON.stringify(m.pose(base({ phase: f * 0.33 })).bones));
    expect(run.size).toBe(20);
  });

  it("the live pose reaches the shipped runner's skinning palette with no clip clock", async () => {
    const bytes = readFileSync("apps/showcase-serpentine-sky-run-port/assets/idol/ssrHeroViolet.glb");
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
    const actor = await createTypedGLBActor({
      asset: { type: "model", format: "glb", url: "https://offline-idol.invalid/ssrHeroViolet.glb" } as never, id: "runner", name: "runner", width: 64, height: 64, shareTextures: false,
      imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
    } as never);
    vi.unstubAllGlobals();
    const m = createRunnerMotion(SK);
    const pals: string[] = [];
    for (const phase of [0.5, 2.0, 3.5]) {
      const result = actor.applyRetargetedPose(m.pose(base({ phase })) as never);
      expect(result.missingTargets).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(20);
      pals.push(Array.from(actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array, (v) => v.toFixed(4)).join());
    }
    expect(new Set(pals).size).toBe(3);
  });

  it("world.ts animates the Idol runner from the sim state each frame", () => {
    const src = readFileSync("examples/saiyan-snake-way-port/world.ts", "utf8");
    expect(src).toContain("runner.animate({");
    expect(src).toMatch(/dt, phase: phaseAcc, moving: ds > 1e-5/);
  });
});
