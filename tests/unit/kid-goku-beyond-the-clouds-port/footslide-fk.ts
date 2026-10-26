import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFootSlideMeter, type FootSlideReport } from "../../../packages/game/src/motion/footSlide";
import { LEG_CLIPS } from "../../../examples/kid-goku-beyond-the-clouds-port/legcycle";
import { advanceGaitPhase, gaitTouchdowns, gaitWeight, plantedGaitPose, type GaitPose } from "../../../examples/kid-goku-beyond-the-clouds-port/gait";

type V3 = [number, number, number];
type Q = [number, number, number, number];
const glb = readFileSync(resolve(process.cwd(), "examples/kid-goku-beyond-the-clouds-port/assets/meshy/hero.glb"));
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as { nodes: Array<{ name?: string; translation?: number[]; scale?: number[] }>; accessors: Array<{ min?: number[]; max?: number[] }>; meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }> };
const node = (name: string) => json.nodes.find((n) => n.name === name)!;
const acc = json.accessors[json.meshes[0]!.primitives[0]!.attributes.POSITION]!;
export const UNIT = node("Armature").scale![0]! * (1.5 / (acc.max![1]! - acc.min![1]!));
const T = (name: string): V3 => node(name).translation!.map((x) => x * UNIT) as V3;

const rot = (q: Q, v: V3): V3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const mul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const q = (r: { x: number; y: number; z: number; w: number }): Q => [r.x, r.y, r.z, r.w];

/** Independent forward kinematics straight from the GLB's rest translations: hips, knee and ankle positions (m) in the hero frame for a bone pose. */
export function legPositions(pose: { bones: Record<string, { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } }> }, hipsFallback: { t: V3; r: Q }): Record<"left" | "right", { hip: V3; knee: V3; ankle: V3 }> {
  const hp = pose.bones.Hips?.position;
  const hipsPos: V3 = hp ? [hp.x * UNIT, hp.y * UNIT, hp.z * UNIT] : hipsFallback.t;
  const hipsRot: Q = pose.bones.Hips?.rotation ? q(pose.bones.Hips.rotation) : hipsFallback.r;
  const out = {} as Record<"left" | "right", { hip: V3; knee: V3; ankle: V3 }>;
  for (const [side, up, leg, foot] of [["left", "LeftUpLeg", "LeftLeg", "LeftFoot"], ["right", "RightUpLeg", "RightLeg", "RightFoot"]] as const) {
    const rUp = mul(hipsRot, q(pose.bones[up]!.rotation!));
    const rLeg = mul(rUp, q(pose.bones[leg]!.rotation!));
    const o = rot(hipsRot, T(up));
    const hip: V3 = [hipsPos[0] + o[0], hipsPos[1] + o[1], hipsPos[2] + o[2]];
    const k = rot(rUp, T(leg));
    const knee: V3 = [hip[0] + k[0], hip[1] + k[1], hip[2] + k[2]];
    const a = rot(rLeg, T(foot));
    out[side] = { hip, knee, ankle: [knee[0] + a[0], knee[1] + a[1], knee[2] + a[2]] };
  }
  return out;
}

export interface SlideResult { readonly speed: number; readonly left: FootSlideReport; readonly right: FootSlideReport; readonly p95: number; readonly max: number; readonly plantedShare: number; readonly passed: boolean; readonly minKneeBend: number; readonly forwardKnee: boolean; readonly reachFailures: number; readonly lowestAnkle: number }

/** Feed both ankles of a pose stream into the library foot-slide meter at 60 Hz while the hero travels +Z at `speed`. */
export function measure(speed: number, seconds: number, poseAt: (t: number, dt: number) => { pose: GaitPose | { bones: Record<string, never> } | undefined; clipPhase: number }, step = 1 / 60): SlideResult {
  const mL = createFootSlideMeter({ plantedHeight: 0.06 }), mR = createFootSlideMeter({ plantedHeight: 0.06 });
  const dt = step;
  let minBend = 180, forwardKnee = true, lowest = 9, reachFailures = 0, planted = 0, total = 0;
  const lowCut = 0.1 - 0.01;
  for (let t = 0; t < seconds; t += dt) {
    const { pose, clipPhase } = poseAt(t, dt);
    const fallback = { t: [LEG_CLIPS.run.hipsT[0]![0] * UNIT, LEG_CLIPS.run.hipsT[0]![1] * UNIT, LEG_CLIPS.run.hipsT[0]![2] * UNIT] as V3, r: LEG_CLIPS.run.hipsR[0] as Q };
    if (!pose || !("Hips" in pose.bones)) continue;
    void clipPhase;
    const p = legPositions(pose as never, fallback);
    const body: V3 = [0, 0, speed * t];
    for (const [side, meter] of [["left", mL], ["right", mR]] as const) {
      const a = p[side].ankle;
      meter.feed(t, [a[0] + body[0], a[1], a[2] + body[2]], { groundHeight: 0.1, bodySpeed: speed });
      lowest = Math.min(lowest, a[1]);
      total += 1; if (a[1] - 0.1 <= 0.06) planted += 1;
      const thigh = [p[side].hip[0] - p[side].knee[0], p[side].hip[1] - p[side].knee[1], p[side].hip[2] - p[side].knee[2]];
      const shin = [p[side].ankle[0] - p[side].knee[0], p[side].ankle[1] - p[side].knee[1], p[side].ankle[2] - p[side].knee[2]];
      const dot = thigh[0]! * shin[0]! + thigh[1]! * shin[1]! + thigh[2]! * shin[2]!;
      const ang = (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...(thigh as V3)) * Math.hypot(...(shin as V3)))))) * 180) / Math.PI;
      minBend = Math.min(minBend, ang);
      // knee must sit ahead of the hip-ankle line (forward = +Z) whenever the leg is bent
      const mid = [(p[side].hip[2] + p[side].ankle[2]) / 2];
      if (ang < 170 && p[side].knee[2] < mid[0]! - 1e-3) forwardKnee = false;
      if (Math.hypot(p[side].ankle[0] - p[side].hip[0], p[side].ankle[1] - p[side].hip[1], p[side].ankle[2] - p[side].hip[2]) > 0.601 * 0.999 + 0.0006) reachFailures += 1;
    }
    void lowCut;
  }
  const l = mL.report(), r = mR.report();
  return { speed, left: l, right: r, p95: Math.max(l.p95PlantedSpeed, r.p95PlantedSpeed), max: Math.max(l.maxPlantedSpeed, r.maxPlantedSpeed), plantedShare: planted / Math.max(1, total), passed: l.passed && r.passed, minKneeBend: minBend, forwardKnee, reachFailures, lowestAnkle: lowest };
}

/** The new gait driven the way world.ts drives it. */
export function newGaitStream(speed: number) {
  let phase = 0;
  return (_t: number, dt: number) => {
    phase = advanceGaitPhase(phase, speed, dt);
    return { pose: plantedGaitPose(speed, phase, 1), clipPhase: phase };
  };
}

export { gaitTouchdowns, gaitWeight };
