/**
 * fal `fal-ai/hunyuan-motion` (HY-Motion) dict output -> canonical humanoid frames / a HumanoidClip (moved from
 * apps/showcase-port-shared/idol/smplMotion.ts, which re-exports this module). `aura3d animation import motion.json`
 * bakes the frames into glTF channels on a rigged GLB (./bake.ts).
 *
 * Format (verified Nov 2026 against keypoints3d: FK of these rotations over the rest offsets reproduces every keypoint):
 *   rot6d [1][F][22][6]  LOCAL joint rotations, SMPL 22-joint body order (SMPL_JOINTS); each 6-vector is a 3x2 matrix
 *                        flattened row-major, i.e. columns = (v[0],v[2],v[4]) and (v[1],v[3],v[5]), Gram-Schmidt.
 *                        Joint 0 (pelvis) is the global root orientation (== root_rotations_mat).
 *   transl [1][F][3]     root translation (metres, Y up); keypoints3d [1][F][52][3] joint positions without transl
 *                        (pelvis world height = transl.y + keypoints3d.pelvis.y).
 *   30 fps. Rest pose = T-pose, Y up, character facing +Z, its left = +X: exactly the canonical humanoid frame.
 * Root motion is stripped (horizontal translation and the clip's mean heading); the vertical hip bob is kept. Loop clips
 * are made seamless by cross-fading their last `loopBlend` seconds into the start.
 */
import {
  createHumanoidSource,
  encodeHumanoidClip,
  HUMANOID_ROLES,
  quatAxisAngle,
  quatMul,
  quatNorm,
  quatSlerp,
  rotateVec,
  type HumanoidClip,
  type HumanoidPoseInput,
  type IdolSkeleton,
  type Quat,
  type Vec3
} from "./humanoid";

export const SMPL_JOINTS = [
  "pelvis", "L_hip", "R_hip", "spine1", "L_knee", "R_knee", "spine2", "L_ankle", "R_ankle", "spine3", "L_foot", "R_foot",
  "neck", "L_collar", "R_collar", "head", "L_shoulder", "R_shoulder", "L_elbow", "R_elbow", "L_wrist", "R_wrist"
] as const;
export const SMPL_PARENTS = [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19] as const;

export interface HyMotionDict {
  readonly rot6d: readonly (readonly (readonly (readonly number[])[])[])[];
  readonly transl: readonly (readonly (readonly number[])[])[];
  readonly keypoints3d: readonly (readonly (readonly (readonly number[])[])[])[];
}

type M3 = number[]; // column-major 3x3

function rot6dToMat(v: readonly number[]): M3 {
  const a1: Vec3 = [v[0]!, v[2]!, v[4]!], a2: Vec3 = [v[1]!, v[3]!, v[5]!];
  const n1 = Math.hypot(...a1) || 1;
  const b1: Vec3 = [a1[0] / n1, a1[1] / n1, a1[2] / n1];
  const d = b1[0] * a2[0] + b1[1] * a2[1] + b1[2] * a2[2];
  const u: Vec3 = [a2[0] - d * b1[0], a2[1] - d * b1[1], a2[2] - d * b1[2]];
  const n2 = Math.hypot(...u) || 1;
  const b2: Vec3 = [u[0] / n2, u[1] / n2, u[2] / n2];
  const b3: Vec3 = [b1[1] * b2[2] - b1[2] * b2[1], b1[2] * b2[0] - b1[0] * b2[2], b1[0] * b2[1] - b1[1] * b2[0]];
  return [...b1, ...b2, ...b3];
}

function matToQuat(m: M3): Quat {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = m as [number, number, number, number, number, number, number, number, number];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  return quatNorm([x, y, z, w]);
}

export interface SmplClipOptions {
  readonly loop?: boolean;
  /** Seconds of the end cross-faded into the start for loops (default 0.2). */
  readonly loopBlend?: number;
  /** Trim [start, end] seconds before conversion. */
  readonly window?: readonly [number, number];
  /** Remove the clip's mean heading so it faces +Z (default true). Event clips that turn keep their turn. */
  readonly faceForward?: boolean;
  /**
   * Root translation: "in-place" (default) strips horizontal travel and keeps the vertical hip bob; "keep" also keeps
   * the horizontal travel (relative to the first frame, in the face-forward frame); "strip" removes all of it.
   */
  readonly rootMotion?: "in-place" | "keep" | "strip";
}

/** Canonical frames (30 fps) of one HY-Motion dict, before packing into a HumanoidClip. */
export interface SmplFramesResult {
  readonly fps: number;
  readonly frames: readonly HumanoidPoseInput[];
  readonly roles: readonly (typeof HUMANOID_ROLES)[number][];
  readonly meta: Readonly<Record<string, number | string>>;
  /** Rest offsets (parent-local, metres) the clip was retargeted from. */
  readonly restOffsets: readonly Vec3[];
}

export interface SmplClipResult {
  readonly clip: HumanoidClip;
  /** Rest offsets (parent-local, metres) the clip was retargeted from. */
  readonly restOffsets: readonly Vec3[];
}

/** Convert one HY-Motion dict to a canonical clip with timing facts in `meta` (ground speed, contacts, apex, ...). */
export function smplMotionToClip(name: string, dict: HyMotionDict, opts: SmplClipOptions = {}): SmplClipResult {
  const r = smplMotionToFrames(dict, opts);
  return { clip: encodeHumanoidClip(name, r.fps, r.roles, r.frames, { ...r.meta }), restOffsets: r.restOffsets };
}

/** True when `value` has the HY-Motion dict shape (rot6d [1][F][22][6], transl [1][F][3], keypoints3d [1][F][J][3]). */
export function isHyMotionDict(value: unknown): value is HyMotionDict {
  const v = value as Partial<HyMotionDict> | null;
  const r6 = v?.rot6d?.[0], tr = v?.transl?.[0], kp = v?.keypoints3d?.[0];
  return Array.isArray(r6) && Array.isArray(tr) && Array.isArray(kp) && r6.length > 1 && tr.length === r6.length && kp.length === r6.length
    && Array.isArray(r6[0]) && r6[0]!.length >= SMPL_JOINTS.length && (r6[0]![0]?.length ?? 0) === 6 && (kp[0]?.length ?? 0) >= SMPL_JOINTS.length;
}

/** Convert one HY-Motion dict to canonical frames (30 fps) with timing facts in `meta`. */
export function smplMotionToFrames(dict: HyMotionDict, opts: SmplClipOptions = {}): SmplFramesResult {
  const fps = 30;
  const rootMotion = opts.rootMotion ?? "in-place";
  const r6 = dict.rot6d[0]!, tr = dict.transl[0]!, kp = dict.keypoints3d[0]!;
  const total = r6.length;
  const [w0, w1] = opts.window ?? [0, (total - 1) / fps];
  const f0 = Math.max(0, Math.round(w0 * fps)), f1 = Math.min(total - 1, Math.round(w1 * fps));
  const J = SMPL_JOINTS.length;
  // local rotations and global rotations per frame
  const local: Quat[][] = [], global: Quat[][] = [];
  for (let f = 0; f < total; f++) {
    const L = r6[f]!.map((v) => matToQuat(rot6dToMat(v)));
    const G: Quat[] = new Array(J);
    for (let j = 0; j < J; j++) G[j] = SMPL_PARENTS[j]! < 0 ? L[j]! : quatNorm(quatMul(G[SMPL_PARENTS[j]!]!, L[j]!));
    local.push(L); global.push(G);
  }
  // rest offsets: parent-frame bone vectors, constant over the clip (averaged)
  const restOffsets: Vec3[] = SMPL_JOINTS.map(() => [0, 0, 0]);
  for (let j = 1; j < J; j++) {
    const acc: [number, number, number] = [0, 0, 0];
    for (let f = 0; f < total; f++) {
      const p = SMPL_PARENTS[j]!, a = kp[f]![j]!, b = kp[f]![p]!;
      const o = rotateVec([-global[f]![p]![0], -global[f]![p]![1], -global[f]![p]![2], global[f]![p]![3]], [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]);
      acc[0] += o[0]; acc[1] += o[1]; acc[2] += o[2];
    }
    restOffsets[j] = [acc[0] / total, acc[1] / total, acc[2] / total];
  }
  const skeleton: IdolSkeleton = {
    bones: SMPL_JOINTS.map((n, j) => ({ name: n, parent: SMPL_PARENTS[j]!, t: restOffsets[j]!, r: [0, 0, 0, 1] as Quat, s: [1, 1, 1] as Vec3 })),
    rootParents: { 0: { t: [0, 0, 0], r: [0, 0, 0, 1], s: 1 } }
  };
  const source = createHumanoidSource(skeleton);
  const hipH = source.map.hipHeight;
  // world positions (with transl) for timing facts
  const world = (f: number, j: number): Vec3 => [kp[f]![j]![0]! + tr[f]![0]!, kp[f]![j]![1]! + tr[f]![1]!, kp[f]![j]![2]! + tr[f]![2]!];
  const J_ = (n: (typeof SMPL_JOINTS)[number]) => SMPL_JOINTS.indexOf(n);
  let ground = Infinity;
  for (let f = f0; f <= f1; f++) for (const n of ["L_ankle", "R_ankle", "L_foot", "R_foot"] as const) ground = Math.min(ground, world(f, J_(n))[1]);
  // heading (yaw of the pelvis forward) and its mean, to face +Z
  const yawOf = (f: number) => { const fw = rotateVec(global[f]![0]!, [0, 0, 1]); return Math.atan2(fw[0], fw[2]); };
  let sx = 0, sz = 0;
  for (let f = f0; f <= f1; f++) { const y = yawOf(f); sx += Math.sin(y); sz += Math.cos(y); }
  const meanYaw = opts.faceForward === false ? 0 : Math.atan2(sx, sz);
  const unYaw = quatAxisAngle([0, 1, 0], -meanYaw);
  const frames: HumanoidPoseInput[] = [];
  for (let f = f0; f <= f1; f++) {
    const wr = global[f]!.map((q) => quatNorm(quatMul(unYaw, q)));
    // canonical hips height: pelvis above the clip's lowest foot joint, minus the rest hip height (the bob)
    const pelvisAbove = world(f, 0)[1] - ground;
    const pose = source.toCanonical(wr, [0, pelvisAbove - hipH, 0]);
    if (rootMotion === "strip") frames.push({ ...pose, hipsOffset: [0, 0, 0] });
    else if (rootMotion === "keep") {
      const d = rotateVec(unYaw, [tr[f]![0]! - tr[f0]![0]!, 0, tr[f]![2]! - tr[f0]![2]!]);
      frames.push({ ...pose, hipsOffset: [d[0] / hipH, pose.hipsOffset![1], d[2] / hipH] });
    } else frames.push({ ...pose, hipsOffset: [0, pose.hipsOffset![1], 0] });
  }
  let out = frames;
  if (opts.loop) {
    const k = Math.max(1, Math.min(Math.floor(frames.length / 3), Math.round((opts.loopBlend ?? 0.2) * fps)));
    const n = frames.length;
    out = [];
    for (let j = 0; j < n - k; j++) {
      if (j < k) {
        const a = frames[n - k + j]!, b = frames[j]!, w = j / k;
        const rotations: Partial<Record<(typeof HUMANOID_ROLES)[number], Quat>> = {};
        for (const r of HUMANOID_ROLES) { const qa = a.rotations[r], qb = b.rotations[r]; if (qa && qb) rotations[r] = quatSlerp(qa, qb, w); }
        const ha = a.hipsOffset!, hb = b.hipsOffset!;
        // Horizontal travel (rootMotion "keep") follows the start of the clip so the seam does not slide backwards.
        out.push({ rotations, hipsOffset: [hb[0], ha[1] + (hb[1] - ha[1]) * w, hb[2]] });
      } else out.push(frames[j]!);
    }
  }
  // timing facts (seconds in the output clip; loops start at frame n-k of the source)
  const meta: Record<string, number | string> = { sourceHipHeight: +hipH.toFixed(4), loop: opts.loop ? 1 : 0 };
  const dur = (f1 - f0) / fps;
  const dist = Math.hypot(tr[f1]![0]! - tr[f0]![0]!, tr[f1]![2]! - tr[f0]![2]!);
  if (dur > 0) meta.groundSpeedHip = +(dist / dur / hipH).toFixed(4);
  {
    // heading-relative travel over the clip (+X = toward the body's left, +Z = forward), in hip heights
    const d = rotateVec(unYaw, [tr[f1]![0]! - tr[f0]![0]!, 0, tr[f1]![2]! - tr[f0]![2]!]);
    meta.travelX = +(d[0] / hipH).toFixed(3);
    meta.travelZ = +(d[2] / hipH).toFixed(3);
  }
  const series = (j: number) => Array.from({ length: f1 - f0 + 1 }, (_, i) => world(f0 + i, j));
  const pel = series(0);
  let hi = 0, lo = 0;
  pel.forEach((p, i) => { if (p[1] > pel[hi]![1]) hi = i; if (p[1] < pel[lo]![1]) lo = i; });
  meta.apexTime = +(hi / fps).toFixed(3);
  meta.lowTime = +(lo / fps).toFixed(3);
  meta.apexRise = +((pel[hi]![1] - pel[0]![1]) / hipH).toFixed(3);
  for (const [key, joint] of [["footR", "R_foot"], ["footL", "L_foot"]] as const) {
    // fastest forward (heading-relative) foot speed relative to the pelvis: a kick's contact
    const s = series(J_(joint));
    let best = 0, bt = 0;
    for (let i = 1; i < s.length; i++) {
      const rel = (k: number) => rotateVec(unYaw, [s[k]![0] - pel[k]![0], 0, s[k]![2] - pel[k]![2]])[2];
      const v = (rel(i) - rel(i - 1)) * fps;
      if (v > best) { best = v; bt = i; }
    }
    meta[`${key}PeakTime`] = +(bt / fps).toFixed(3);
    meta[`${key}PeakSpeed`] = +best.toFixed(3);
  }
  for (const [key, joint] of [["wristR", "R_wrist"], ["wristL", "L_wrist"]] as const) {
    const s = series(J_(joint));
    let lo2 = 0, hi2 = 0;
    s.forEach((p, i) => { if (p[1] < s[lo2]![1]) lo2 = i; if (p[1] > s[hi2]![1]) hi2 = i; });
    meta[`${key}LowTime`] = +(lo2 / fps).toFixed(3);
    meta[`${key}HighTime`] = +(hi2 / fps).toFixed(3);
  }
  const roles = HUMANOID_ROLES.filter((r) => (source.map.roles as Record<string, string | undefined>)[r]);
  return { fps, frames: out, roles, meta, restOffsets };
}
