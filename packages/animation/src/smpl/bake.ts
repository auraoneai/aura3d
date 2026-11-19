/**
 * Canonical humanoid frames -> glTF animation channel data on a target skeleton (any rigged humanoid GLB, including
 * Idol's unnamed `bone_N` rigs). Each frame goes through the same driver the games use at runtime
 * (`createHumanoidDriver(...).pose(frame)`), so a baked clip plays exactly like the live pose did. The bake reports:
 *
 *   - `flips`: rotation keys swinging more than `flipThresholdDeg` in one frame (the engine's `LimbFlip` shape; the
 *     swing is the shortest-arc angle 2·acos(|q0·q1|) between consecutive keys);
 *   - `limbError`: angle between each limb segment the target draws and the source's canonical limb direction
 *     (upper/lower arms and legs; ~0 for a correct retarget, float noise only);
 *   - `motionDeg`: the largest angle any limb moves away from the target's bind pose (0 = a silent T-pose).
 *
 * Callers fail on flips, on a limb error above their bound and on `motionDeg` near zero instead of writing a clip that
 * renders a broken or frozen body.
 */
import type { LimbFlip } from "../pose/Retarget.js";
import {
  createHumanoidDriver,
  quatAxisAngle,
  quatInv,
  quatMul,
  rotateVec,
  type HumanoidDriverOptions,
  type HumanoidMap,
  type HumanoidPoseInput,
  type HumanoidRole,
  type IdolSkeleton,
  type Quat,
  type Vec3
} from "./humanoid";

/** Limb segments checked for retarget error: role -> the role at the segment's far end. */
export const LIMB_SEGMENTS: readonly (readonly [HumanoidRole, HumanoidRole])[] = [
  ["leftUpperArm", "leftLowerArm"], ["leftLowerArm", "leftHand"],
  ["rightUpperArm", "rightLowerArm"], ["rightLowerArm", "rightHand"],
  ["leftUpperLeg", "leftLowerLeg"], ["leftLowerLeg", "leftFoot"],
  ["rightUpperLeg", "rightLowerLeg"], ["rightLowerLeg", "rightFoot"]
];

const CANON_PARENT: Readonly<Record<HumanoidRole, HumanoidRole | null>> = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  leftShoulder: "chest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "chest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg",
  rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg"
};

const FACING_YAW: Readonly<Record<string, number>> = { "+z": 0, "+x": Math.PI / 2, "-z": Math.PI, "-x": -Math.PI / 2 };

/** Facing rotation (model space) for a driver `facing` option. */
export function facingQuat(facing: HumanoidDriverOptions["facing"]): Quat {
  return quatAxisAngle([0, 1, 0], FACING_YAW[facing ?? "+z"] ?? 0);
}

/** Canonical-frame direction of every limb segment in a frame (accumulated role rotations applied to straight down). */
export function canonicalLimbDirections(frame: HumanoidPoseInput): Partial<Record<HumanoidRole, Vec3>> {
  const global: Partial<Record<HumanoidRole, Quat>> = {};
  const g = (role: HumanoidRole): Quat => {
    const known = global[role];
    if (known) return known;
    const parent = CANON_PARENT[role];
    const local = frame.rotations[role] ?? [0, 0, 0, 1];
    const value = parent ? quatMul(g(parent), local) : local;
    global[role] = value;
    return value;
  };
  const out: Partial<Record<HumanoidRole, Vec3>> = {};
  for (const [role] of LIMB_SEGMENTS) out[role] = rotateVec(g(role), [0, -1, 0]);
  return out;
}

export function angleDeg(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a[0], a[1], a[2]) || 1, lb = Math.hypot(b[0], b[1], b[2]) || 1;
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

export interface GltfChannelData {
  /** Target joint name and index in `skeleton.bones`. */
  readonly bone: string;
  readonly boneIndex: number;
  readonly path: "rotation" | "translation";
  /** Flat values, 4 (rotation) or 3 (translation) per key, one key per entry of `times`. */
  readonly values: Float32Array;
}

export interface BakeHumanoidGltfOptions extends HumanoidDriverOptions {
  /** Single-key swing that counts as a limb flip (default 120 degrees, the engine detector's default). */
  readonly flipThresholdDeg?: number;
}

export interface HumanoidGltfBake {
  readonly name: string;
  readonly fps: number;
  readonly duration: number;
  readonly times: Float32Array;
  readonly channels: readonly GltfChannelData[];
  readonly flips: readonly LimbFlip[];
  readonly limbError: { readonly maxDeg: number; readonly meanDeg: number };
  readonly motionDeg: number;
  readonly map: HumanoidMap;
  /** Expected model-space limb directions per frame (for verifying a written file): role -> unit vector. */
  readonly expected: readonly Partial<Record<HumanoidRole, Vec3>>[];
}

/** Bake canonical frames (at `fps`) into per-joint glTF rotation channels plus the hips translation channel. */
export function bakeHumanoidFramesToGltf(name: string, target: IdolSkeleton, frames: readonly HumanoidPoseInput[], fps: number, opts: BakeHumanoidGltfOptions = {}): HumanoidGltfBake {
  if (frames.length < 2) throw new Error(`${name}: a clip needs at least 2 frames`);
  if (!(fps > 0)) throw new Error(`${name}: fps must be positive`);
  const driver = createHumanoidDriver(target, opts);
  const map = driver.map;
  const bones = target.bones;
  const hipsName = map.roles.hips!;
  const hipsIndex = bones.findIndex((b) => b.name === hipsName);
  const n = frames.length;
  const times = new Float32Array(n);
  const rot = bones.map(() => new Float32Array(n * 4));
  const hipsT = new Float32Array(n * 3);
  const F = facingQuat(opts.facing);
  const Finv = quatInv(F);
  const roleBone = (role: HumanoidRole) => map.roles[role];
  // Bind-pose (rest) limb directions of the target, to measure how far the clip moves the body.
  const bindPos = restModelPositions(target);
  const expected: Partial<Record<HumanoidRole, Vec3>>[] = [];
  let errMax = 0, errSum = 0, errN = 0, motion = 0;
  for (let f = 0; f < n; f++) {
    times[f] = f / fps;
    const frame = frames[f]!;
    const pose = driver.pose(frame);
    bones.forEach((b, i) => {
      const p = pose.bones[b.name]!;
      let q: Quat = [p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w];
      // Keep consecutive keys on the same hemisphere so linear interpolation never takes the long way round.
      if (f > 0) {
        const o = (f - 1) * 4, prev = rot[i]!;
        if (prev[o]! * q[0] + prev[o + 1]! * q[1] + prev[o + 2]! * q[2] + prev[o + 3]! * q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
      }
      rot[i]!.set(q, f * 4);
      if (i === hipsIndex && p.position) hipsT.set([p.position.x, p.position.y, p.position.z], f * 3);
    });
    const want = canonicalLimbDirections(frame);
    const pos = driver.modelPositions(frame);
    const exp: Partial<Record<HumanoidRole, Vec3>> = {};
    for (const [role, tip] of LIMB_SEGMENTS) {
      const a = roleBone(role), b = roleBone(tip);
      const w = want[role];
      if (!a || !b || !w || !pos[a] || !pos[b]) continue;
      const got: Vec3 = [pos[b]![0] - pos[a]![0], pos[b]![1] - pos[a]![1], pos[b]![2] - pos[a]![2]];
      const wantModel = rotateVec(F, w);
      exp[role] = wantModel;
      const e = angleDeg(rotateVec(Finv, got), w);
      errMax = Math.max(errMax, e); errSum += e; errN += 1;
      const ra = bindPos[a], rb = bindPos[b];
      if (ra && rb) motion = Math.max(motion, angleDeg(got, [rb[0] - ra[0], rb[1] - ra[1], rb[2] - ra[2]]));
    }
    expected.push(exp);
  }
  const channels: GltfChannelData[] = bones.map((b, i) => ({ bone: b.name, boneIndex: i, path: "rotation" as const, values: rot[i]! }));
  channels.push({ bone: hipsName, boneIndex: hipsIndex, path: "translation", values: hipsT });

  const duration = (n - 1) / fps;
  const flips = detectKeyFlips(channels, opts.flipThresholdDeg ?? 120);
  return {
    name, fps, duration, times, channels, flips,
    limbError: { maxDeg: errMax, meanDeg: errN ? errSum / errN : 0 },
    motionDeg: motion, map, expected
  };
}

/** Model-space rest (bind) positions of every joint, by name. */
function restModelPositions(sk: IdolSkeleton): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  const xf: { t: Vec3; r: Quat; s: number }[] = new Array(sk.bones.length);
  const visit = (i: number): { t: Vec3; r: Quat; s: number } => {
    if (xf[i]) return xf[i]!;
    const b = sk.bones[i]!;
    const p = b.parent >= 0 ? visit(b.parent) : (sk.rootParents[i] ?? { t: [0, 0, 0] as Vec3, r: [0, 0, 0, 1] as Quat, s: 1 });
    const v = rotateVec(p.r, b.t);
    return (xf[i] = { t: [p.t[0] + v[0] * p.s, p.t[1] + v[1] * p.s, p.t[2] + v[2] * p.s], r: quatMul(p.r, b.r), s: p.s * b.s[0] });
  };
  sk.bones.forEach((b, i) => { out[b.name] = visit(i).t; });
  return out;
}

/**
 * Rotation keys whose single-key swing exceeds `thresholdDeg`. The swing between unit quaternions a, b is
 * 2·acos(|a·b|), so the test is |a·b| < cos(threshold / 2).
 */
export function detectKeyFlips(channels: readonly GltfChannelData[], thresholdDeg = 120): LimbFlip[] {
  const flips: LimbFlip[] = [];
  const cosHalf = Math.cos((thresholdDeg * Math.PI) / 360);
  for (const c of channels) {
    if (c.path !== "rotation") continue;
    const v = c.values;
    for (let k = 1; k * 4 < v.length; k++) {
      const a = (k - 1) * 4, b = k * 4;
      const d = Math.min(1, Math.abs(v[a]! * v[b]! + v[a + 1]! * v[b + 1]! + v[a + 2]! * v[b + 2]! + v[a + 3]! * v[b + 3]!));
      if (d < cosHalf) flips.push({ track: `${c.bone}.rotation`, keyframeIndex: k, degrees: (2 * Math.acos(d) * 180) / Math.PI });
    }
  }
  return flips;
}
