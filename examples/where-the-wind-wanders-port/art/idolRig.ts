/**
 * Idol rig driver (render layer only): poses an Idol image-to-3D rigged GLB (unnamed `bone_N` joints) from model-space
 * segment rotations, the way the procedural actors posed their six rigid parts. Bone semantics (hips, spine, neck, head,
 * arm and leg chains) come from `idolRigData.ts`, extracted from each GLB's skin by hierarchy and rest positions.
 *
 * Model space: the Idol GLB after `tools/idol/normalize.mjs` stands on y = 0, faces +Z, the character's left is +X.
 * Every segment rotation is a model-space rotation about the segment's root joint applied to its rest (T-pose)
 * orientation; bones without a segment follow their parent rigidly. The result is written as parent-space local
 * rotations (the runtime handle's live pose (`setAnimationPose`, object-form local rotations)) and the joint world positions are returned for weapon sockets.
 */

export type V3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface IdolBoneData { readonly name: string; readonly parent: number; readonly t: readonly number[]; readonly q: readonly number[] }
export interface IdolRigMap {
  readonly hips: number;
  readonly spine: readonly number[];
  readonly neck: readonly number[];
  readonly head: number;
  /** [shoulder (-1 when absent), upper arm, forearm, hand] */
  readonly armL: readonly number[];
  readonly armR: readonly number[];
  /** [thigh, shin, foot, toe (-1 when absent)] */
  readonly legL: readonly number[];
  readonly legR: readonly number[];
}
export interface IdolRigData {
  readonly bones: readonly IdolBoneData[];
  /** World rotation / position / uniform scale of the skeleton root's non-joint parent chain (model space). */
  readonly rootQ: readonly number[];
  readonly rootP: readonly number[];
  readonly rootS: number;
  readonly map: IdolRigMap;
}

export const qIdentity = (): Quat => [0, 0, 0, 1];
export function qMul(a: readonly number[], b: readonly number[]): Quat {
  return [
    a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
    a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
    a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
    a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!
  ];
}
export const qConj = (q: readonly number[]): Quat => [-q[0]!, -q[1]!, -q[2]!, q[3]!];
export function qRot(q: readonly number[], v: readonly number[]): V3 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)];
}
export function qAxis(ax: number, ay: number, az: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}
export const qX = (a: number): Quat => qAxis(1, 0, 0, a);
export const qY = (a: number): Quat => qAxis(0, 1, 0, a);
export const qZ = (a: number): Quat => qAxis(0, 0, 1, a);
/** Shortest-arc rotation taking unit-ish `from` onto `to`. */
/** Euler angles for the engine's default node rotation order ("ZYX": R = Rz Ry Rx, as the scene graph composes it). */
export function qToEngineEuler(q: readonly number[]): V3 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const r00 = 1 - 2 * (y * y + z * z), r10 = 2 * (x * y + z * w), r20 = 2 * (x * z - y * w);
  const r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y), r01 = 2 * (x * y - z * w), r11 = 1 - 2 * (x * x + z * z);
  const ey = Math.asin(Math.max(-1, Math.min(1, -r20)));
  if (Math.abs(r20) < 0.9999999) return [Math.atan2(r21, r22), ey, Math.atan2(r10, r00)];
  return [0, ey, Math.atan2(-r01, r11)];
}
/** Quaternion of engine Euler angles ("ZYX": R = Rz Ry Rx). */
export const qFromEngineEuler = (e: readonly number[]): Quat => qMul(qZ(e[2]!), qMul(qY(e[1]!), qX(e[0]!)));

export function qFromTo(from: readonly number[], to: readonly number[]): Quat {
  const lf = Math.hypot(from[0]!, from[1]!, from[2]!) || 1, lt = Math.hypot(to[0]!, to[1]!, to[2]!) || 1;
  const f = [from[0]! / lf, from[1]! / lf, from[2]! / lf], t = [to[0]! / lt, to[1]! / lt, to[2]! / lt];
  const d = f[0]! * t[0]! + f[1]! * t[1]! + f[2]! * t[2]!;
  if (d < -0.999999) {
    const ax = Math.abs(f[0]!) < 0.9 ? [0, -f[2]!, f[1]!] : [f[2]!, 0, -f[0]!];
    const l = Math.hypot(ax[0]!, ax[1]!, ax[2]!);
    return [ax[0]! / l, ax[1]! / l, ax[2]! / l, 0];
  }
  const c = [f[1]! * t[2]! - f[2]! * t[1]!, f[2]! * t[0]! - f[0]! * t[2]!, f[0]! * t[1]! - f[1]! * t[0]!];
  const q: Quat = [c[0]!, c[1]!, c[2]!, 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Model-space segment rotations for one frame (identity = T-pose rest; arms get their rest-to-down turn from the driver). */
export interface IdolSegmentPose {
  /** Every spine bone (and the hips when `pelvis` is not given). */
  body: Quat;
  /** Hips bone alone (optional; defaults to `body`). */
  pelvis?: Quat;
  /** Neck and head. */
  head: Quat;
  /** Upper arm / forearm as hanging-down limbs: rotations applied after turning the T-pose arm straight down. */
  armL: Quat; foreL: Quat;
  armR: Quat; foreR: Quat;
  /** Thigh / shin / foot (legs already hang down in the T-pose). */
  legL: Quat; shinL: Quat; footL: Quat;
  legR: Quat; shinR: Quat; footR: Quat;
}

export interface IdolRigDriver {
  readonly data: IdolRigData;
  /** Solve the pose; returns the parent-space local rotation of every bone (index order of `data.bones`). */
  solve(pose: IdolSegmentPose): readonly Quat[];
  /** Model-space joint position after the last `solve` (metres, before the node's own scale). */
  jointPosition(bone: number): V3;
  /** Rest model-space height of the hips joint. */
  readonly hipsHeight: number;
}

export function createIdolRigDriver(data: IdolRigData): IdolRigDriver {
  const n = data.bones.length;
  const rwQ: Quat[] = new Array(n);
  const rwP: V3[] = new Array(n);
  const s = data.rootS;
  for (let i = 0; i < n; i++) {
    const b = data.bones[i]!;
    const pq = b.parent >= 0 ? rwQ[b.parent]! : (data.rootQ as Quat);
    const pp = b.parent >= 0 ? rwP[b.parent]! : (data.rootP as V3);
    rwQ[i] = qMul(pq, b.q);
    const o = qRot(pq, [b.t[0]! * s, b.t[1]! * s, b.t[2]! * s]);
    rwP[i] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
  }
  const m = data.map;
  const dirOf = (a: number, b: number): V3 => [rwP[b]![0] - rwP[a]![0], rwP[b]![1] - rwP[a]![1], rwP[b]![2] - rwP[a]![2]];
  const down: V3 = [0, -1, 0];
  // Rest-to-hanging corrections for the arm chains (T-pose arms point along +-X).
  const toDown = (chain: readonly number[], k: number): Quat => {
    const a = chain[k]!, b = chain[k + 1] ?? -1;
    return b >= 0 ? qFromTo(dirOf(a, b), down) : qIdentity();
  };
  const upperL = m.armL[1]!, foreLb = m.armL[2]!, upperR = m.armR[1]!, foreRb = m.armR[2]!;
  const cUpperL = toDown(m.armL, 1), cForeL = toDown(m.armL, 2), cUpperR = toDown(m.armR, 1), cForeR = toDown(m.armR, 2);
  // Legs: straighten each rest leg segment to vertical so the procedural angles read the same on every model.
  const cThighL = qFromTo(dirOf(m.legL[0]!, m.legL[1]!), down), cShinL = qFromTo(dirOf(m.legL[1]!, m.legL[2]!), down);
  const cThighR = qFromTo(dirOf(m.legR[0]!, m.legR[1]!), down), cShinR = qFromTo(dirOf(m.legR[1]!, m.legR[2]!), down);

  const seg: (null | ((p: IdolSegmentPose) => Quat))[] = new Array(n).fill(null);
  seg[m.hips] = (p) => p.pelvis ?? p.body;
  for (const b of m.spine) seg[b] = (p) => p.body;
  for (const b of m.neck) seg[b] = (p) => p.head;
  seg[m.head] = (p) => p.head;
  if (m.armL[0]! >= 0) seg[m.armL[0]!] = (p) => p.body;
  if (m.armR[0]! >= 0) seg[m.armR[0]!] = (p) => p.body;
  seg[upperL] = (p) => qMul(p.armL, cUpperL);
  seg[foreLb] = (p) => qMul(p.foreL, cForeL);
  seg[m.armL[3]!] = (p) => qMul(p.foreL, cForeL);
  seg[upperR] = (p) => qMul(p.armR, cUpperR);
  seg[foreRb] = (p) => qMul(p.foreR, cForeR);
  seg[m.armR[3]!] = (p) => qMul(p.foreR, cForeR);
  seg[m.legL[0]!] = (p) => qMul(p.legL, cThighL);
  seg[m.legL[1]!] = (p) => qMul(p.shinL, cShinL);
  seg[m.legL[2]!] = (p) => qMul(p.footL, cShinL);
  seg[m.legR[0]!] = (p) => qMul(p.legR, cThighR);
  seg[m.legR[1]!] = (p) => qMul(p.shinR, cShinR);
  seg[m.legR[2]!] = (p) => qMul(p.footR, cShinR);

  const pwQ: Quat[] = new Array(n);
  const pwP: V3[] = new Array(n);
  const local: Quat[] = new Array(n);
  const hipsHeight = rwP[m.hips]![1];
  return {
    data,
    hipsHeight,
    solve(pose) {
      for (let i = 0; i < n; i++) {
        const b = data.bones[i]!;
        const pq = b.parent >= 0 ? pwQ[b.parent]! : (data.rootQ as Quat);
        const pp = b.parent >= 0 ? pwP[b.parent]! : (data.rootP as V3);
        const f = seg[i];
        pwQ[i] = f ? qMul(f(pose), rwQ[i]!) : qMul(pq, b.q);
        const o = qRot(pq, [b.t[0]! * s, b.t[1]! * s, b.t[2]! * s]);
        pwP[i] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
        local[i] = qMul(qConj(pq), pwQ[i]!);
      }
      return local;
    },
    jointPosition(bone) {
      const p = pwP[bone] ?? rwP[bone]!;
      return [p[0], p[1], p[2]];
    }
  };
}
