import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeBaseballBoneMatrices, computeBaseballRolePose } from "../../../apps/showcase-aura-diamond-3d/src/art/proceduralModels";
import { SWING_CONTACT_T } from "../../../apps/showcase-aura-diamond-3d/src/batter-pose";
import { WINDUP_RELEASE_T } from "../../../apps/showcase-aura-diamond-3d/src/rules";
import { gameFrameFromMats, idolPoseForActor } from "../../../apps/showcase-aura-diamond-3d/src/idol/drive";
import { PoseSmoother, batterMotion, clipFacts, diamondMotionPose, headingFix, mocapClipFor, mocapGamePose, swingClipTime } from "../../../apps/showcase-aura-diamond-3d/src/idol/mocap";
import { MOTION_CLIPS } from "../../../apps/showcase-aura-diamond-3d/src/idol/motion.generated";

const frameOf = (pose: ReturnType<typeof mocapGamePose>) => gameFrameFromMats(computeBaseballBoneMatrices(pose));
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const req = (id: string, role: string, clip: string, localT: number, speed = 1) =>
  diamondMotionPose({ id, role, clip, localT, speed, procedural: computeBaseballRolePose(role as never, clip, localT, 0.3, speed) });

describe("Aura Diamond athletes on fal text-to-motion clips (fal-ai/hunyuan-motion)", () => {
  it("plays the right clip for each game state", () => {
    expect(mocapClipFor("pitcher", "Crouch_Idle_Loop")).toBe("PitchSet");
    expect(mocapClipFor("pitcher", "Telegraph")).toBe("Pitch");
    expect(mocapClipFor("pitcher", "Release")).toBe("Pitch");
    expect(mocapClipFor("infielder", "Release")).toBe("Throw");
    expect(mocapClipFor("catcher", "Release")).toBe("Throw");
    expect(mocapClipFor("outfielder", "Contest")).toBe("Catch");
    expect(mocapClipFor("infielder", "Crouch_Idle_Loop")).toBe("Ready");
    expect(mocapClipFor("outfielder", "Crouch_Idle_Loop")).toBe("Ready");
    expect(mocapClipFor("runner", "Sprint_Loop")).toBe("Sprint");
    expect(mocapClipFor("runner", "Crouch_Idle_Loop")).toBe("Leadoff");
    expect(mocapClipFor("coach", "Crouch_Idle_Loop")).toBe("CoachIdle");
    expect(mocapClipFor("catcher", "Crouch_Idle_Loop")).toBe("CatcherSquat");
    expect(Object.keys(MOTION_CLIPS).sort()).toEqual(["BatStance", "Catch", "CatcherSquat", "CoachIdle", "Leadoff", "Pitch", "PitchSet", "Ready", "Sprint", "Swing", "Throw"]);
  });

  it("moves: every clip's bones change over time and standing feet stay near the ground", () => {
    for (const key of Object.keys(MOTION_CLIPS) as (keyof typeof MOTION_CLIPS)[]) {
      const d = MOTION_CLIPS[key].duration;
      const fa = frameOf(mocapGamePose(key, d * 0.2, false)), fb = frameOf(mocapGamePose(key, d * 0.7, false));
      const moved = Math.max(dist(fa.palmL, fb.palmL), dist(fa.palmR, fb.palmR), dist(fa.pos.LeftFoot, fb.pos.LeftFoot), dist(fa.pos.RightFoot, fb.pos.RightFoot), dist(fa.pos.Head, fb.pos.Head));
      expect(moved, key).toBeGreaterThan(0.03);
    }
    for (const key of ["CoachIdle", "PitchSet", "BatStance"] as const) {
      const f = frameOf(mocapGamePose(key, 1, true));
      expect(Math.min(f.pos.LeftFoot[1], f.pos.RightFoot[1]), key).toBeGreaterThan(0.03);
      expect(Math.min(f.pos.LeftFoot[1], f.pos.RightFoot[1]), key).toBeLessThan(0.3);
    }
    expect(frameOf(mocapGamePose("CatcherSquat", 1, true)).pos.Hips[1]).toBeLessThan(0.75);
  });

  it("releases the pitch on the sim's clock, toward home: the throwing hand is fastest at WINDUP_RELEASE_T and moving +Z", () => {
    const dt = 1 / 120;
    const samples: { t: number; palm: readonly number[] }[] = [];
    for (let t = 0; t <= WINDUP_RELEASE_T + 0.3; t += dt) {
      const pose = t < WINDUP_RELEASE_T ? req("pitcher", "pitcher", "Telegraph", t) : req("pitcher", "pitcher", "Release", t - WINDUP_RELEASE_T);
      samples.push({ t, palm: frameOf(pose).palmR });
    }
    let best = 0, at = 0, vz = 0;
    for (let i = 1; i < samples.length; i++) {
      const v = dist(samples[i]!.palm, samples[i - 1]!.palm) / dt;
      if (v > best) { best = v; at = samples[i]!.t; vz = samples[i]!.palm[2]! - samples[i - 1]!.palm[2]!; }
    }
    expect(Math.abs(at - WINDUP_RELEASE_T)).toBeLessThanOrEqual(1.5 / 30);
    expect(vz).toBeGreaterThan(0);
  });

  it("swings on the sim's clock: the swing clip's contact frame lands on SWING_CONTACT_T, the arms stay the grip solve", () => {
    expect(swingClipTime(SWING_CONTACT_T)).toBeCloseTo(clipFacts("Swing").contactTime, 6);
    expect(swingClipTime(0)).toBeLessThan(swingClipTime(SWING_CONTACT_T));
    expect(swingClipTime(1)).toBeGreaterThan(swingClipTime(SWING_CONTACT_T));
    const solve = computeBaseballRolePose("batter", "Idle_Loop", 0.4, 0.3, 1);
    const yaw = headingFix(solve);
    const solveMats = computeBaseballBoneMatrices(solve);
    const solveFrame = gameFrameFromMats(solveMats);
    const tilts: number[] = [];
    for (const [swinging, swingT] of [[false, 0], [true, 0.2], [true, SWING_CONTACT_T], [true, 0.8]] as const) {
      const display = batterMotion(solve, { swinging, swingT, stanceT: 0.7, yaw });
      const mats = computeBaseballBoneMatrices(display);
      // the arm bones keep the solve's world orientation (the bat is placed from the solve)
      const q = (m: Record<string, number[]>) => [m.RightUpperArm![0], m.RightUpperArm![5], m.RightUpperArm![10]];
      expect(dist(q(mats as never), q(solveMats as never)), `swingT ${swingT}`).toBeLessThan(1e-6);
      // the Idol palms land on the solve's palms (the grip) despite the clip body
      const pose = idolPoseForActor("diaIdolBatterA", mats, undefined, solveMats);
      // lessons M17 grip budget: 0.06 m through contact, 0.08 m in the follow-through tail
      const tol = swingT <= SWING_CONTACT_T ? 0.06 : 0.08;
      expect(dist(pose.palmR, solveFrame.palmR), `swingT ${swingT}`).toBeLessThan(tol);
      expect(dist(pose.palmL, solveFrame.palmL), `swingT ${swingT}`).toBeLessThan(tol);
      tilts.push(gameFrameFromMats(mats).pos.LeftFoot[2]!);
    }
    expect(new Set(tilts.map((v) => v.toFixed(3))).size).toBeGreaterThan(1); // the legs stride / turn through the swing
  });

  it("cross-fades state switches but passes a running clip straight through", () => {
    const s = new PoseSmoother(0.2);
    const a = mocapGamePose("CoachIdle", 0, true), b = mocapGamePose("Sprint", 0.1, true);
    s.apply("x", "idle", a, 0);
    const mid = s.apply("x", "sprint", b, 0.1) as Record<string, { rotation: number[] }>;
    expect(mid.LeftUpperLeg!.rotation).not.toEqual((b as Record<string, { rotation: number[] }>).LeftUpperLeg!.rotation);
    expect(s.apply("x", "sprint", b, 0.35)).toBe(b);
  });

  it("uses no Meshy clips (owner rule): fal provenance only", () => {
    const dir = "apps/showcase-aura-diamond-3d/src/idol";
    for (const f of readdirSync(dir)) expect(readFileSync(`${dir}/${f}`, "utf8"), f).not.toMatch(/meshy/i);
    expect(readFileSync(`${dir}/motion.generated.ts`, "utf8")).toMatch(/hunyuan-motion/);
  });
});
