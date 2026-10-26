import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_BOUNCE_LIMITS, RUNNING_HAND_BOUNCE_LIMITS, clampPalmReach, createHandBounce, handBounceBallXZ, handBounceBallY, handBounceContactWeight,
  handBounceCycle, handBounceOverlayAngles, measureHandBall, resolveHandBounceConfig
} from "../../../packages/game/src/motion/handBounce";

const config = resolveHandBounceConfig();
const holder = { x: 0, z: 0, vx: 0, vz: 0 };
const DT = 1 / 60;

/** Kinematic stand-in for a rig: the shoulder sinks with the effort and the rendered palm follows the target within the arm's reach. */
function run(seconds: number, moving: boolean, options: { lag?: number; floorY?: number } = {}) {
  const lag = options.lag ?? 0.03;
  const bounce = createHandBounce({ floorY: options.floorY ?? 0 });
  const cfg = bounce.config;
  const standing = moving ? 1.45 : 1.5;
  const drop = moving ? 0.36 : 0.46;
  let palmY = cfg.floorY + 1;
  const samples: Array<{ phase: number; moving: boolean; palm: [number, number, number]; ball: [number, number, number] }> = [];
  for (let i = 0; i < seconds / DT; i += 1) {
    const prev = bounce.state();
    const phaseNext = (prev.active ? prev.phase : 0) + DT / (moving ? cfg.running.period : cfg.standing.period);
    const effortGuess = handBounceCycle(cfg, phaseNext % 1, standing, moving).effort;
    const shoulderY = cfg.floorY + standing - drop * effortGuess;
    const cyc = handBounceCycle(cfg, phaseNext % 1, shoulderY, moving);
    const reachable = Math.max(cyc.palmY, shoulderY - cfg.armReach);
    palmY += (reachable - palmY) * Math.min(1, DT / Math.max(lag, 1e-3));
    const frame = bounce.step(DT, { moving, shoulderY, palm: [0.25, palmY, 0.3], holder: { ...holder, vx: moving ? 4 : 0 } });
    samples.push({ phase: frame.phase, moving, palm: [0.25, palmY, 0.3], ball: frame.ball });
  }
  return { samples, bounce };
}

describe("hand bounce kit (promoted from the Aura Hoops dribble)", () => {
  it("phase invariants: contact at the meet and the catch, free in the air, monotonic landmarks", () => {
    const { rideEnd, palmTurn, floorAt, catchFrom } = config.phases;
    expect(rideEnd).toBeLessThan(palmTurn);
    expect(palmTurn).toBeLessThan(floorAt);
    expect(floorAt).toBeLessThan(catchFrom);
    expect(handBounceContactWeight(config, 0)).toBe(1);
    expect(handBounceContactWeight(config, rideEnd - 0.01)).toBe(1);
    expect(handBounceContactWeight(config, 0.97)).toBe(1);
    expect(Math.min(...[0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75].map((t) => handBounceContactWeight(config, t)))).toBeLessThan(0.05);
    expect(handBounceContactWeight(config, 1.25)).toBe(handBounceContactWeight(config, 0.25));
  });

  it("the ball centre is exactly floor + radius at the bounce, for any floor height and radius", () => {
    for (const [floorY, ballRadius] of [[0, 0.13], [2.5, 0.11], [-1, 0.2]] as const) {
      const cfg = resolveHandBounceConfig({ floorY, ballRadius });
      const ys = Array.from({ length: 400 }, (_, i) => handBounceCycle(cfg, i / 400, floorY + 1.5).ballY);
      expect(Math.min(...ys)).toBeCloseTo(floorY + ballRadius, 2);
      expect(handBounceBallY(cfg, cfg.phases.floorAt, floorY + 1, floorY + 0.8, floorY + 0.8)).toBeCloseTo(floorY + ballRadius, 6);
    }
  });

  it("keeps the ball on the palm at contact however fast the handler runs", () => {
    for (const speed of [0, 1.5, 3.7, 5]) {
      for (const phase of [0, 0.1, 0.25, 0.33, 0.9995]) {
        const cyc = handBounceCycle(config, phase, 1.2);
        const palm: [number, number, number] = [0.25, cyc.palmY, 0.3];
        const at = handBounceBallXZ(config, palm, { x: 0, z: 0, vx: speed, vz: 0 }, phase);
        const d = Math.hypot(palm[0] - at.x, cyc.palmY - cyc.ballY, palm[2] - at.z);
        expect(Math.abs(d - config.ballGap)).toBeLessThan(0.005);
      }
    }
  });

  it("standing and running dribbles meet the hard criteria: ball under the hand, touching the palm at the meet, hand follows the ball down", () => {
    for (const moving of [false, true]) {
      const { samples } = run(8, moving);
      const report = measureHandBall(samples);
      const lim = moving ? RUNNING_HAND_BOUNCE_LIMITS : DEFAULT_HAND_BOUNCE_LIMITS;
      expect(report.failures).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.meetMax).toBeLessThanOrEqual(config.ballRadius + 0.05);
      expect(report.floorContactXZMax).toBeLessThanOrEqual(moving ? 0.2 : 0.12);
      expect(report.floorContactPalmHeightMax).toBeLessThanOrEqual(moving ? 0.6 : 0.5);
      expect(report.maxXZ).toBeLessThanOrEqual(0.25);
      expect(report.floorError).toBeLessThanOrEqual(lim.floorError);
      expect(report.floorSamples).toBeGreaterThan(3);
      expect(report.meetSamples).toBeGreaterThan(5);
    }
  });

  it("a standing hand follows the ball at least 60 percent of the way down", () => {
    for (const moving of [false]) {
      const { samples } = run(6, moving);
      const apex = Math.max(...samples.map((s) => s.ball[1]));
      const floor = samples.filter((s) => s.ball[1] <= config.floorBallY + 0.02);
      const palmTop = Math.max(...samples.map((s) => s.palm[1]));
      const palmAtFloor = Math.max(...floor.map((s) => s.palm[1]));
      const ballTravel = apex - config.floorBallY;
      expect((palmTop - palmAtFloor) / ballTravel).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("the ball is directly under the palm: no lead for a stationary handler, lead only along travel (capped) for a runner, never past maxOffset", () => {
    const palm: [number, number, number] = [1, 0.8, 2];
    const still = handBounceBallXZ(config, palm, { x: 0, z: 0, vx: 0.2, vz: 0.1 }, 0.55);
    expect(still).toEqual({ x: 1, z: 2 });
    const run4 = handBounceBallXZ(config, palm, { x: 0, z: 0, vx: 0, vz: -4 }, 0.55);
    expect(run4.x).toBeCloseTo(1, 9);
    expect(run4.z).toBeLessThan(2);
    expect(2 - run4.z).toBeLessThanOrEqual(config.leadMax + 1e-9);
    for (const speed of [1, 4, 9, 30]) {
      for (const phase of [0, 0.2, 0.5, 0.6, 0.7, 0.8, 0.95]) {
        const at = handBounceBallXZ(config, palm, { x: 0, z: 0, vx: speed * 0.6, vz: speed * 0.8 }, phase);
        expect(Math.hypot(at.x - palm[0], at.z - palm[2])).toBeLessThanOrEqual(config.maxOffset + 1e-9);
        // the lead points along the travel direction
        const dx = at.x - palm[0];
        const dz = at.z - palm[2];
        if (Math.hypot(dx, dz) > 1e-9) expect((dx * 0.6 + dz * 0.8) / Math.hypot(dx, dz)).toBeCloseTo(1, 6);
      }
    }
  });

  it("running profile: lower apex and shorter period than standing", () => {
    expect(config.running.period).toBeLessThan(config.standing.period);
    const apex = (moving: boolean) => Math.max(...run(6, moving).samples.map((s) => s.ball[1]));
    expect(apex(true)).toBeLessThanOrEqual(0.88);
    expect(apex(true)).toBeLessThan(apex(false));
  });

  it("works on a raised floor (palm heights are relative to the floor)", () => {
    const { samples } = run(6, false, { floorY: 3 });
    const report = measureHandBall(samples, { floorY: 3 });
    expect(report.failures).toEqual([]);
  });

  it("is deterministic: the same inputs give the same ball, and dt must be a positive fixed step", () => {
    const a = run(3, true).samples.map((s) => s.ball.join(","));
    const b = run(3, true).samples.map((s) => s.ball.join(","));
    expect(a).toEqual(b);
    expect(() => createHandBounce().step(0, { shoulderY: 1.4, holder })).toThrow(/positive fixed step/);
    expect(() => createHandBounce().step(-1, { shoulderY: 1.4, holder })).toThrow();
  });

  it("clamps palm targets to the arm's reach and leaves reachable targets alone", () => {
    const shoulder: [number, number, number] = [0, 1.4, 0];
    const far = clampPalmReach(shoulder, [0, 0.2, 0.4], 0.55);
    expect(Math.hypot(far[0] - shoulder[0], far[1] - shoulder[1], far[2] - shoulder[2])).toBeCloseTo(0.55, 6);
    const near: [number, number, number] = [0.1, 1.0, 0.2];
    expect(clampPalmReach(shoulder, near, 0.55)).toEqual(near);
    expect(clampPalmReach(shoulder, shoulder, 0.55)).toEqual([0, 1.4, 0]);
  });

  it("the cycle never asks the hand below the reach of the arm", () => {
    for (const shoulderY of [1.0, 1.2, 1.5]) {
      for (let i = 0; i < 200; i += 1) {
        const c = handBounceCycle(config, i / 200, shoulderY, false);
        expect(c.palmY).toBeGreaterThanOrEqual(shoulderY - config.armReach - 0.07 - 1e-9);
      }
    }
  });

  it("the overlay names upper-body bones only and never a leg, hip or foot bone", () => {
    const bounce = createHandBounce({ boneNames: ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Head", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:LeftUpLeg", "mixamorig:RightFoot"] });
    for (const moving of [false, true]) {
      bounce.step(DT, { moving, shoulderY: 1.4, holder });
      const overlay = bounce.overlay();
      expect(overlay.mode).toBe(moving ? "overlay" : "pose");
      for (const name of Object.keys(overlay.bones)) expect(name).not.toMatch(/leg|foot|hip|thigh|shin|toe/i);
      expect(Object.keys(overlay.bones).length).toBeGreaterThanOrEqual(2);
      expect(overlay.arm.upper).toBe("mixamorig:RightArm");
      expect(overlay.arm.forearm).toBe("mixamorig:RightForeArm");
    }
    const lean = handBounceOverlayAngles(1, true);
    expect(lean.spine).toBeGreaterThan(handBounceOverlayAngles(0, true).spine);
    expect(handBounceOverlayAngles(1, true, 0)).toEqual({ spine: 0, chest: 0, head: -0 });
  });

  it("left hand mirrors the arm bone roles", () => {
    const bounce = createHandBounce({ hand: "left" });
    bounce.step(DT, { shoulderY: 1.4, holder });
    expect(bounce.overlay().arm).toEqual({ upper: "LeftUpperArm", forearm: "LeftForearm" });
  });

  it("release hands the ball over at the hand with its own velocity (no pop), and stops the cycle", () => {
    const { bounce, samples } = run(1.5, true);
    const last = samples[samples.length - 1]!;
    const prev = samples[samples.length - 2]!;
    const rel = bounce.release();
    expect(rel.position).toEqual(last.ball);
    for (let k = 0; k < 3; k += 1) expect(rel.velocity[k]).toBeCloseTo((last.ball[k]! - prev.ball[k]!) / DT, 6);
    expect(bounce.state().active).toBe(false);
    // continuity: the first free-flight step from the release moves the ball by its velocity, not a jump
    const step = rel.velocity.map((v) => v * DT);
    expect(Math.hypot(step[0]!, step[1]!, step[2]!)).toBeLessThan(0.2);
  });

  it("pickup resumes at the catch with the ball where it is, then rides the palm", () => {
    const bounce = createHandBounce();
    bounce.pickup([1, 0.5, 2]);
    expect(bounce.state().active).toBe(true);
    expect(bounce.state().phase).toBe(config.phases.catchFrom);
    const f = bounce.step(DT, { moving: false, shoulderY: 1.4, palm: [1, 0.8, 2], holder: { x: 1, z: 2, vx: 0, vz: 0 } });
    expect(f.ball[0]).toBeCloseTo(1, 1);
    expect(f.ball[2]).toBeCloseTo(2, 1);
  });

  it("hold (dead ball) keeps the phase at the meet and the ball in the palm", () => {
    const bounce = createHandBounce();
    for (let i = 0; i < 30; i += 1) {
      const f = bounce.step(DT, { shoulderY: 1.4, palm: [0.2, 1.0, 0.3], holder, hold: true });
      expect(f.phase).toBe(0);
      expect(f.ball).toEqual([0.2, 1.0, 0.3]);
      expect(f.effort).toBe(0);
    }
  });

  it("measureHandBall flags a detached ball", () => {
    const bad = Array.from({ length: 60 }, (_, i) => ({ phase: (i / 60) % 1, palm: [0, 1.0, 0] as const, ball: [0, 0.17, 0] as const }));
    const report = measureHandBall(bad);
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/meet|floor contact|strays/);
    expect(measureHandBall([]).ok).toBe(false);
    expect(measureHandBall([{ phase: 0.1, palm: [0, 1, 0], ball: [0, 5, 0], dribbling: false }]).samples).toBe(0);
  });
});
