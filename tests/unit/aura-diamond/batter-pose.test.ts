import { describe, expect, it } from "vitest";
import {
  ACTOR_FIT,
  BATTER_YAW,
  buildContactConfig,
  dirW,
  FIT_GROUND_N,
  HEAD_FACE,
  PITCHER_DIR,
  rotY,
  sampleBatterTarget,
  solveBatterPose,
  type ContactConfig,
  type PoseSolve,
  type Vec3
} from "../../../apps/showcase-aura-diamond-3d/src/batter-pose";

/**
 * Pose test for the Aura Diamond batter: the stance and every swing phase must read as baseball batting, not just keep both hands on the
 * bat. World terms: the plate is +x, the pitcher -z, the catcher +z (see `dirW`). Pure kinematics, no engine; the rendered frames of the
 * same phases are read from the owner's default and side cameras (evidence/aura-diamond-3d/bat-fix).
 */
const BATTER_POS: Vec3 = [-0.82, 0, 0.28];
const deg = (r: number): number => (r * 180) / Math.PI;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const elevation = (d: Vec3): number => deg(Math.asin(Math.max(-1, Math.min(1, d[1] / len(d)))));
const CATCHER_DIR = dirW(0, 0, 1);
const PLATE_DIR = dirW(1, 0, 0);

function actorFromWorld(p: Vec3): Vec3 {
  const loc = rotY(-BATTER_YAW, sub(p, BATTER_POS));
  return [loc[0] / ACTOR_FIT - FIT_GROUND_N[0], loc[1] / ACTOR_FIT - FIT_GROUND_N[1], loc[2] / ACTOR_FIT - FIT_GROUND_N[2]];
}

/** Head centre in the actor frame: the Head bone sits at the base of the skull, the head's middle about 11 cm above it. */
function headCentre(pose: PoseSolve, phi: number): Vec3 {
  const up = rotY(phi, [0, 0.2249 + 0.11, 0.015]);
  return [pose.chestActor[0] + up[0], pose.chestActor[1] + up[1], pose.chestActor[2] + up[2]];
}

/** Closest the bat (knob to tip) comes to a point. */
function batToPoint(pose: PoseSolve, p: Vec3): number {
  const a: Vec3 = [pose.palmActor[0] - pose.batDir[0] * 0.07, pose.palmActor[1] - pose.batDir[1] * 0.07, pose.palmActor[2] - pose.batDir[2] * 0.07];
  const ab = sub(pose.tipActor, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
}

const yawOf = (q: readonly number[]): number => 2 * Math.atan2(q[1]!, q[3]!);

interface Sample { t: number; phase: string; pose: PoseSolve; K: Vec3; phi: number; hip: Vec3; stride: number }

function run(contact: ContactConfig | null, ts: number[]): Sample[] {
  const out: Sample[] = [];
  let tau = 0;
  let tauL = 0;
  let gamma = 0;
  for (const t of ts) {
    let pose!: PoseSolve;
    let s!: ReturnType<typeof sampleBatterTarget>;
    for (let i = 0; i < 4; i++) {
      s = sampleBatterTarget({ active: t >= 0, t: Math.max(0, t), recover: 0, contact }, 0);
      pose = solveBatterPose(s.K, s.D, s.phi, s.hip, s.pole, tau, tauL, gamma, s.stride);
      tau = pose.tau;
      tauL = pose.tauL;
      gamma = pose.gamma;
    }
    out.push({ t, phase: t < 0 ? "stance" : t < 0.3 ? "load" : t < 0.42 ? "stride" : t < 0.56 ? "contact" : "follow-through", pose, K: s.K, phi: s.phi, hip: s.hip, stride: s.stride });
  }
  return out;
}

const ts = [-1, ...Array.from({ length: 51 }, (_, i) => i * 0.02)];
const balls: Array<{ name: string; world: Vec3 }> = [
  { name: "middle", world: [0.18, 1.06, 0.32] },
  { name: "high-inside", world: [-0.05, 1.45, 0.32] },
  { name: "low-away", world: [0.28, 0.75, 0.32] }
];
const hipYFor = (ball: Vec3): number => -Math.max(0.03, Math.min(0.18, (0.121 - ball[1]) * 0.9 + 0.03));
const sweeps = balls.map((b) => {
  const a = actorFromWorld(b.world);
  const cfg = buildContactConfig(a, hipYFor(a));
  return { ...b, cfg, samples: run(cfg, ts) };
});
const at = (samples: Sample[], t: number): Sample => samples.find((s) => Math.abs(s.t - t) < 1e-6)!;

describe("batter pose reads as baseball batting", () => {
  it("ready stance: bat upright and tilted back over the rear shoulder, not a barbell across the head", () => {
    const st = at(sweeps[0]!.samples, -1);
    const elev = elevation(st.pose.batDir);
    expect(elev).toBeGreaterThanOrEqual(55);
    expect(elev).toBeLessThanOrEqual(80);
    // 15 to 30 degrees off vertical, leaning back toward the catcher, not toward the pitcher or the plate.
    expect(dot(st.pose.batDir, CATCHER_DIR)).toBeGreaterThan(0.15);
    expect(dot(st.pose.batDir, PLATE_DIR)).toBeLessThan(0.1);
    // Barrel above the hands and above the rear shoulder, behind the rear ear (on the catcher side of the head).
    expect(st.pose.tipActor[1]).toBeGreaterThan(st.pose.palmActor[1] + 0.5);
    expect(st.pose.tipActor[1]).toBeGreaterThan(st.pose.shoulderActor[1] + 0.5);
    expect(dot(sub(st.pose.tipActor, headCentre(st.pose, st.phi)), CATCHER_DIR)).toBeGreaterThan(0);
  });

  it("ready stance: hands near the rear shoulder, elbows placed like a hitter's", () => {
    const st = at(sweeps[0]!.samples, -1).pose;
    const toShoulder = sub(st.palmActor, st.shoulderActor);
    // 10 to 30 cm in front of and above the rear shoulder.
    expect(dot(toShoulder, [0, 0, 1])).toBeGreaterThan(0.1);
    expect(toShoulder[1]).toBeGreaterThan(-0.05);
    expect(len(toShoulder)).toBeLessThan(0.34);
    // Rear elbow raised to about shoulder height; front elbow lower.
    expect(st.elbow[1]).toBeGreaterThan(st.shoulderActor[1] - 0.1);
    expect(st.elbowL[1]).toBeLessThan(st.elbow[1] - 0.06);
  });

  it("ready stance: knees bent, weight on the back leg, head turned to the pitcher, chest toward the plate", () => {
    const st = at(sweeps[0]!.samples, -1);
    expect(st.hip[1]).toBeLessThanOrEqual(-0.05);
    expect(dot(st.hip, PITCHER_DIR)).toBeLessThan(0);
    const headYaw = yawOf(st.pose.bones.Head.rotation) + st.phi;
    expect(headYaw).toBeGreaterThan(0.6 * HEAD_FACE);
    expect(headYaw).toBeLessThan(1.15 * HEAD_FACE);
    // The chest (actor +z at yaw 0) faces within about 40 degrees of the plate, not the pitcher.
    expect(dot([0, 0, 1], PLATE_DIR)).toBeGreaterThan(0.75);
  });

  it("load: hands back, front foot striding, bat 45 to 62 degrees up with the barrel back", () => {
    const stance = at(sweeps[0]!.samples, -1);
    const load = at(sweeps[0]!.samples, 0.22);
    const e = elevation(load.pose.batDir);
    expect(e).toBeGreaterThanOrEqual(45);
    expect(e).toBeLessThanOrEqual(62);
    expect(dot(load.pose.batDir, CATCHER_DIR)).toBeGreaterThan(0.4);
    expect(dot(sub(load.pose.palmActor, stance.pose.palmActor), PITCHER_DIR)).toBeLessThan(0.02);
    expect(load.stride).toBeGreaterThan(0.2);
    expect(at(sweeps[0]!.samples, 0.34).stride).toBe(1);
  });

  it("swing: hands lead the barrel, bat sweeps in a level arc at hip to chest height, level and in front at contact", () => {
    for (const sw of sweeps) {
      const contact = at(sw.samples, 0.5);
      expect(Math.abs(elevation(contact.pose.batDir)), `${sw.name} contact elevation`).toBeLessThan(35);
      expect(dot(contact.pose.batDir, PLATE_DIR), `${sw.name} bat toward the plate`).toBeGreaterThan(0.6);
      // Contact in front of the front hip: the sweet spot is on the pitcher side of the chest.
      expect(dot(sub(contact.pose.sweetActor, contact.pose.chestActor), [PLATE_DIR[0], 0, PLATE_DIR[2]])).toBeGreaterThan(0.4);
      // Hips and shoulders open before the bat arrives: chest yaw grows through the slot.
      expect(at(sw.samples, 0.44).phi).toBeGreaterThan(at(sw.samples, 0.22).phi);
    }
    const mid = sweeps[0]!.samples;
    // Hands lead: at the slot the barrel is still behind the hands (toward the catcher) while the hands are ahead of the stance.
    const slot = at(mid, 0.42);
    expect(dot(sub(slot.pose.tipActor, slot.pose.palmActor), CATCHER_DIR)).toBeGreaterThan(0.3);
    expect(dot(sub(slot.pose.palmActor, at(mid, -1).pose.palmActor), PITCHER_DIR)).toBeGreaterThan(0.0);
    for (const s of mid.filter((x) => x.t >= 0.46 && x.t <= 0.58)) {
      const hitterCentre = s.pose.chestActor[1];
      expect(s.pose.sweetActor[1]).toBeGreaterThan(hitterCentre - 0.7);
      expect(s.pose.sweetActor[1]).toBeLessThan(hitterCentre + 0.55);
    }
  });

  it("follow-through: bat wraps over the front shoulder, hands finish high beside it", () => {
    const fin = at(sweeps[0]!.samples, 0.9).pose;
    expect(len(sub(fin.palmActor, fin.shoulderLActor))).toBeLessThan(0.36);
    expect(fin.palmActor[1]).toBeGreaterThan(fin.shoulderLActor[1] - 0.06);
    // The barrel ends up behind the body, on the catcher side of the hands.
    expect(dot(sub(fin.tipActor, fin.palmActor), CATCHER_DIR)).toBeGreaterThan(0.3);
  });

  it("the bat never passes within 8 cm of the head centre, in any phase, on any pitch", () => {
    let worst = Infinity;
    for (const sw of sweeps) {
      for (const s of sw.samples) {
        const d = batToPoint(s.pose, headCentre(s.pose, s.phi));
        worst = Math.min(worst, d);
        expect(d, `${sw.name} t=${s.t}`).toBeGreaterThanOrEqual(0.08);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0.08);
  });

  it("both hands stay within 6 cm of the handle in every phase", () => {
    for (const sw of sweeps) {
      for (const s of sw.samples) {
        const p = s.pose;
        const left = len(cross(sub(p.palmLActor, p.palmActor), p.batDir));
        expect(left, `${sw.name} t=${s.t} left palm to the bat axis`).toBeLessThanOrEqual(0.06);
        expect(len(sub(p.palmActor, s.K)), `${sw.name} t=${s.t} right palm reaches the knob`).toBeLessThanOrEqual(0.06);
        expect(len(sub(p.palmLActor, p.targetL)), `${sw.name} t=${s.t} left palm reaches the handle`).toBeLessThanOrEqual(0.06);
      }
    }
  });
});
