import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTOR_FIT,
  BATTER_YAW,
  BAT_LEN,
  buildContactConfig,
  FIT_GROUND_N,
  rotY,
  sampleBatterTarget,
  solveBatterPose,
  SWING_CONTACT_T,
  type ContactConfig,
  type PoseSolve,
  type Vec3
} from "../../../apps/showcase-aura-diamond-3d/src/batter-pose";

/**
 * Kinematic grip probe: both palms against the bat axis for every batter phase (stance sway, load, stride, contact across
 * the strike zone, follow-through, recovery to stance). Pure functions only, no engine: this checks the solver. The
 * engine-bone check against the same bat runs on the remote runner (tests/browser/diamond-bat-fix.spec.ts).
 */
const FIT = { s: ACTOR_FIT, n: FIT_GROUND_N };
const BATTER_POS: Vec3 = [-0.82, 0, 0.28];

function actorFromWorld(p: Vec3): Vec3 {
  const d: Vec3 = [p[0] - BATTER_POS[0], p[1] - BATTER_POS[1], p[2] - BATTER_POS[2]];
  const loc = rotY(-BATTER_YAW, d);
  return [loc[0] / FIT.s - FIT.n[0], loc[1] / FIT.s - FIT.n[1], loc[2] / FIT.s - FIT.n[2]];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function phaseOf(t: number, active: boolean, recover: number): string {
  if (!active) return "stance";
  if (t < 0.26) return "load";
  if (t < 0.4) return "stride";
  if (t < 0.56) return "contact";
  if (recover > 0) return "recover";
  return "follow-through";
}

const reachMiss: Array<{ ball: Vec3; miss: number }> = [];

interface Row { phase: string; leftToAxis: number; rightReach: number; leftReach: number; flexR: number; flexL: number; batVsD: number; handsApart: number }

function measure(pose: PoseSolve, K: Vec3, D: Vec3): Omit<Row, "phase"> {
  const axisPoint = pose.palmActor;
  const toAxis = (p: Vec3): number => len(cross(sub(p, axisPoint), pose.batDir));
  return {
    leftToAxis: toAxis(pose.palmLActor),
    rightReach: len(sub(pose.palmActor, K)),
    leftReach: len(sub(pose.palmLActor, pose.targetL)),
    flexR: (pose.flexR * 180) / Math.PI,
    flexL: (pose.flexL * 180) / Math.PI,
    batVsD: (Math.acos(Math.max(-1, Math.min(1, dot(pose.batDir, D)))) * 180) / Math.PI,
    handsApart: len(sub(pose.palmLActor, pose.palmActor))
  };
}

/** Pitches the batter can reach with the bat's sweet spot: not jammed into the body, not off the plate's far edge, not in the dirt. */
const inReach = (b: Vec3): boolean => b[0] >= -0.2 && b[0] <= 0.3 && b[1] >= 0.8;

function runPlateAppearance(): Row[] {
  const rows: Row[] = [];
  // Ball positions across the strike zone (world, at the contact plane).
  const balls: Vec3[] = [];
  for (const x of [-0.4, -0.2, 0, 0.18, 0.3, 0.45]) for (const y of [0.5, 0.8, 1.06, 1.3, 1.6]) balls.push([x, y, 0.32]);
  // Stance sway across a few seconds of idle.
  let tau = 0;
  let tauL = 0;
  let gamma = 0;
  for (let now = 0; now < 8; now += 0.05) {
    const s = sampleBatterTarget({ active: false, t: 0, recover: 0, contact: null }, now);
    const pose = solveBatterPose(s.K, s.D, s.phi, s.hip, s.pole, tau, tauL, gamma, s.stride);
    tau = pose.tau;
    tauL = pose.tauL;
    gamma = pose.gamma;
    rows.push({ phase: "stance", ...measure(pose, s.K, s.D) });
  }
  for (const ball of balls) {
    const outside = inReach(ball) ? "" : "outside-";
    const ballActor = actorFromWorld(ball);
    const hipY = -Math.max(0.03, Math.min(0.18, (0.121 - ballActor[1]) * 0.9 + 0.03));
    const contact: ContactConfig = buildContactConfig(ballActor, hipY);
    {
      const s = sampleBatterTarget({ active: true, t: SWING_CONTACT_T, recover: 0, contact }, 0);
      const pose = solveBatterPose(s.K, s.D, s.phi, s.hip, s.pole, 0, 0, 0);
      reachMiss.push({ ball, miss: len(sub(pose.sweetActor, ballActor)) });
    }
    tau = 0;
    tauL = 0;
    gamma = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const s = sampleBatterTarget({ active: true, t, recover: 0, contact }, 0);
      const pose = solveBatterPose(s.K, s.D, s.phi, s.hip, s.pole, tau, tauL, gamma, s.stride);
      tau = pose.tau;
      tauL = pose.tauL;
      gamma = pose.gamma;
      rows.push({ phase: outside + phaseOf(t, true, 0), ...measure(pose, s.K, s.D) });
    }
    for (let r = 0.02; r <= 1.0001; r += 0.02) {
      const s = sampleBatterTarget({ active: true, t: 1, recover: r, contact }, 0);
      const pose = solveBatterPose(s.K, s.D, s.phi, s.hip, s.pole, tau, tauL, gamma, s.stride);
      tau = pose.tau;
      tauL = pose.tauL;
      gamma = pose.gamma;
      rows.push({ phase: outside + "recover", ...measure(pose, s.K, s.D) });
    }
  }
  return rows;
}

const p95 = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!;

describe("batter grip kinematics (human and CPU batters share this solver)", () => {
  const rows = runPlateAppearance();
  const phases = ["stance", "load", "stride", "contact", "follow-through", "recover"];
  const tablePhases = [...phases, "outside-contact", "outside-follow-through", "outside-recover"];
  const table = tablePhases.map((phase) => {
    const r = rows.filter((x) => x.phase === phase);
    const col = (k: keyof Omit<Row, "phase">) => ({ max: Math.max(...r.map((x) => x[k])), p95: p95(r.map((x) => x[k])) });
    return {
      phase,
      samples: r.length,
      leftToAxis_cm: { max: col("leftToAxis").max * 100, p95: col("leftToAxis").p95 * 100 },
      rightReach_cm: { max: col("rightReach").max * 100, p95: col("rightReach").p95 * 100 },
      leftReach_cm: { max: col("leftReach").max * 100, p95: col("leftReach").p95 * 100 },
      flexR_deg: { min: Math.min(...r.map((x) => x.flexR)), max: col("flexR").max },
      flexL_deg: { min: Math.min(...r.map((x) => x.flexL)), max: col("flexL").max },
      batVsD_deg: { max: col("batVsD").max, p95: col("batVsD").p95 },
      handsApart_cm: { min: Math.min(...r.map((x) => x.handsApart)) * 100, max: col("handsApart").max * 100 }
    };
  });
  it("puts the sweet spot on the ball for every pitch the batter can physically reach", () => {
    const inside = reachMiss.filter((r) => inReach(r.ball));
    expect(inside.length).toBeGreaterThan(10);
    for (const r of inside) expect(r.miss, `ball ${r.ball.join(",")}`).toBeLessThanOrEqual(0.05);
  });
  it("reports the per-phase table", () => {
    if (process.env.DIAMOND_GRIP_REPORT) {
      mkdirSync(process.env.DIAMOND_GRIP_REPORT, { recursive: true });
      writeFileSync(`${process.env.DIAMOND_GRIP_REPORT}/kinematic-grip.json`, JSON.stringify({ batLenActor: BAT_LEN, contactT: SWING_CONTACT_T, table }, null, 1));
    }
    expect(table.length).toBe(tablePhases.length);
  });
  it("puts the top palm on the bat axis in every phase", () => {
    for (const row of table.filter((r) => phases.includes(r.phase))) expect(row.leftToAxis_cm.max, `${row.phase} left palm to bat axis`).toBeLessThanOrEqual(6);
  });
  it("lands both palms on their grip targets (reachable, no clamped arm)", () => {
    for (const row of table.filter((r) => phases.includes(r.phase))) {
      expect(row.rightReach_cm.max, `${row.phase} right palm reach`).toBeLessThanOrEqual(6);
      expect(row.leftReach_cm.max, `${row.phase} left palm reach`).toBeLessThanOrEqual(6);
    }
  });
  it("keeps elbows inside a believable range (no straight or fully folded arm)", () => {
    for (const row of table.filter((r) => phases.includes(r.phase))) {
      for (const flex of [row.flexR_deg, row.flexL_deg]) {
        expect(flex.min, `${row.phase} elbow min`).toBeGreaterThanOrEqual(12);
        expect(flex.max, `${row.phase} elbow max`).toBeLessThanOrEqual(160);
      }
    }
  });
  it("keeps the hands together on the handle (hands 6 to 14 cm apart)", () => {
    for (const row of table.filter((r) => phases.includes(r.phase))) {
      expect(row.handsApart_cm.min, `${row.phase} hands apart min`).toBeGreaterThanOrEqual(6);
      expect(row.handsApart_cm.max, `${row.phase} hands apart max`).toBeLessThanOrEqual(14);
    }
  });
});
