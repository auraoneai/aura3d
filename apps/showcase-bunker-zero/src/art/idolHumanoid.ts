/**
 * Drives a rigged Idol GLB (28-34 unnamed bones) from Bunker Zero's procedural enemy joint rotations.
 *
 * The procedural rig's joints all rest at identity with the arms hanging and the legs straight down; the Idol bind is a
 * T-pose. Each driven Idol bone gets the procedural joint's world rotation (rig space) applied on top of its own bind
 * world rotation, with a fixed "arms down" / "legs straight" correction for the limbs, then is converted back to the
 * bone's local rotation. Bones without a role keep their bind local rotation. Pure math, no engine state.
 */

export type V3 = readonly [number, number, number];
export type Q = readonly [number, number, number, number];

export interface IdolJoint {
  readonly name: string;
  readonly parent: number;
  readonly t: readonly number[];
  readonly r: readonly number[];
  readonly s: number;
}

export interface IdolRoles {
  readonly hips: number;
  readonly spine: readonly number[];
  readonly chest: number;
  readonly neck: number;
  readonly head: number;
  readonly clavicleL: number;
  readonly upperArmL: number;
  readonly forearmL: number;
  readonly handL: number;
  readonly clavicleR: number;
  readonly upperArmR: number;
  readonly forearmR: number;
  readonly handR: number;
  readonly thighL: number;
  readonly shinL: number;
  readonly footL: number;
  readonly toeL: number;
  readonly thighR: number;
  readonly shinR: number;
  readonly footR: number;
  readonly toeR: number;
}

export interface IdolSkeleton {
  readonly joints: readonly IdolJoint[];
  readonly rootParent: { readonly t: readonly number[]; readonly r: readonly number[]; readonly s: number };
  readonly roles: IdolRoles;
  /** Scale the scene node applies to the (unit-height) GLB; the bind data above is already in the scaled space. */
  readonly sceneScale?: number;
}

// ---- quaternion helpers ([x, y, z, w]) ----
export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const qConj = (a: Q): Q => [-a[0], -a[1], -a[2], a[3]];
export const qNorm = (a: Q): Q => {
  const n = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n, a[3] / n];
};
export function qRot(q: Q, v: V3): V3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
export function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  if (d > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}
/** Shortest-arc rotation taking unit-ish vector `from` onto `to`. */
export function qFromTo(from: V3, to: V3): Q {
  const fl = Math.hypot(...from) || 1;
  const tl = Math.hypot(...to) || 1;
  const f: V3 = [from[0] / fl, from[1] / fl, from[2] / fl];
  const t: V3 = [to[0] / tl, to[1] / tl, to[2] / tl];
  const d = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
  if (d < -0.999999) return qNorm(Math.abs(f[0]) < 0.9 ? [0, -f[2], f[1], 0] : [f[2], 0, -f[0], 0]);
  return qNorm([f[1] * t[2] - f[2] * t[1], f[2] * t[0] - f[0] * t[2], f[0] * t[1] - f[1] * t[0], 1 + d]);
}
/** Engine node Euler (`rotation: [x, y, z]`, default "ZYX" order = Rz·Ry·Rx) to quaternion. */
export function qEulerZYX(e: V3): Q {
  const hx = e[0] / 2, hy = e[1] / 2, hz = e[2] / 2;
  const qx: Q = [Math.sin(hx), 0, 0, Math.cos(hx)];
  const qy: Q = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qz: Q = [0, 0, Math.sin(hz), Math.cos(hz)];
  return qMul(qz, qMul(qy, qx));
}
/** Quaternion to engine node Euler (inverse of {@link qEulerZYX}). */
export function eulerZYXFromQ(q: Q): [number, number, number] {
  const [x, y, z, w] = q;
  const m20 = 2 * (x * z - w * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, -m20)));
  if (Math.abs(m20) < 0.999999) {
    return [Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y)), ey, Math.atan2(2 * (x * y + w * z), 1 - 2 * (y * y + z * z))];
  }
  return [0, ey, Math.atan2(-2 * (x * y - w * z), 1 - 2 * (x * x + z * z))];
}

const asQ = (r: readonly number[]): Q => [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 1];
const asV = (t: readonly number[]): V3 => [t[0] ?? 0, t[1] ?? 0, t[2] ?? 0];

export interface IdolBind {
  readonly skel: IdolSkeleton;
  /** World (model-space) bind rotation per joint. */
  readonly worldR: readonly Q[];
  /** World (model-space) bind position per joint. */
  readonly worldT: readonly V3[];
  /** Uniform scale of each joint's parent space (root parent scale times joint scales above). */
  readonly parentScale: readonly number[];
  /** Rotation taking each T-pose upper arm onto straight down, and each bind thigh onto straight down. */
  readonly armDownL: Q;
  readonly armDownR: Q;
  readonly legDownL: Q;
  readonly legDownR: Q;
  /** Bind hips height (model space). */
  readonly hipsY: number;
}

const bindCache = new WeakMap<IdolSkeleton, IdolBind>();

export function idolBind(skel: IdolSkeleton): IdolBind {
  const hit = bindCache.get(skel);
  if (hit) return hit;
  const n = skel.joints.length;
  const worldR: Q[] = new Array(n);
  const worldT: V3[] = new Array(n);
  const worldS: number[] = new Array(n);
  const parentScale: number[] = new Array(n);
  const rpR = asQ(skel.rootParent.r);
  const rpT = asV(skel.rootParent.t);
  const done = new Array<boolean>(n).fill(false);
  const visit = (i: number): void => {
    if (done[i]) return;
    const j = skel.joints[i]!;
    let pR = rpR, pT = rpT, pS = skel.rootParent.s;
    if (j.parent >= 0) {
      visit(j.parent);
      pR = worldR[j.parent]!; pT = worldT[j.parent]!; pS = worldS[j.parent]!;
    }
    const lt = qRot(pR, asV(j.t));
    worldT[i] = [pT[0] + lt[0] * pS, pT[1] + lt[1] * pS, pT[2] + lt[2] * pS];
    worldR[i] = qNorm(qMul(pR, asQ(j.r)));
    worldS[i] = pS * j.s;
    parentScale[i] = pS;
    done[i] = true;
  };
  for (let i = 0; i < n; i++) visit(i);
  const dir = (a: number, b: number): V3 => [worldT[b]![0] - worldT[a]![0], worldT[b]![1] - worldT[a]![1], worldT[b]![2] - worldT[a]![2]];
  const ro = skel.roles;
  const down: V3 = [0, -1, 0];
  const out: IdolBind = {
    skel,
    worldR,
    worldT,
    parentScale,
    armDownL: qFromTo(dir(ro.upperArmL, ro.handL), down),
    armDownR: qFromTo(dir(ro.upperArmR, ro.handR), down),
    legDownL: qFromTo(dir(ro.thighL, ro.footL), down),
    legDownR: qFromTo(dir(ro.thighR, ro.footR), down),
    hipsY: worldT[ro.hips]![1]
  };
  bindCache.set(skel, out);
  return out;
}

/** World (rig-space) rotations of the source joints, all relative to an identity rest with arms and legs hanging. */
export interface HumanoidDrive {
  readonly hips: Q;
  readonly chest: Q;
  readonly head: Q;
  readonly upperArmL: Q;
  readonly forearmL: Q;
  readonly handL?: Q;
  readonly upperArmR: Q;
  readonly forearmR: Q;
  readonly handR?: Q;
  readonly thighL: Q;
  readonly shinL: Q;
  readonly footL: Q;
  readonly thighR: Q;
  readonly shinR: Q;
  readonly footR: Q;
  /** Hips offset from its rest position, in the source rig's metres (scaled to the Idol leg length here). */
  readonly hipsOffset: V3;
  /** Source rig's rest hips height, used to scale `hipsOffset` to the Idol skeleton. */
  readonly sourceHipsY: number;
}

export interface IdolBonePose {
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
}

export interface IdolPoseResult {
  readonly bones: Record<string, IdolBonePose>;
  /** Posed world (model-space) rotation and position per joint, for attaching held props. */
  readonly worldR: readonly Q[];
  readonly worldT: readonly V3[];
}

/** Solve every Idol bone's local rotation (and the hips position) for one frame. */
export function solveIdolPose(skel: IdolSkeleton, drive: HumanoidDrive): IdolPoseResult {
  const b = idolBind(skel);
  const ro = skel.roles;
  const n = skel.joints.length;
  const target = new Map<number, Q>();
  const set = (i: number, q: Q) => { if (i >= 0) target.set(i, q); };
  const D = (q: Q, i: number, pre?: Q) => qNorm(qMul(q, pre ? qMul(pre, b.worldR[i]!) : b.worldR[i]!));
  set(ro.hips, D(drive.hips, ro.hips));
  const spineN = ro.spine.length;
  ro.spine.forEach((i, k) => set(i, D(qSlerp(drive.hips, drive.chest, (k + 1) / (spineN + 1)), i)));
  set(ro.chest, D(drive.chest, ro.chest));
  if (ro.neck >= 0) set(ro.neck, D(qSlerp(drive.chest, drive.head, 0.5), ro.neck));
  set(ro.head, D(drive.head, ro.head));
  set(ro.upperArmL, D(drive.upperArmL, ro.upperArmL, b.armDownL));
  set(ro.forearmL, D(drive.forearmL, ro.forearmL, b.armDownL));
  set(ro.handL, D(drive.handL ?? drive.forearmL, ro.handL, b.armDownL));
  set(ro.upperArmR, D(drive.upperArmR, ro.upperArmR, b.armDownR));
  set(ro.forearmR, D(drive.forearmR, ro.forearmR, b.armDownR));
  set(ro.handR, D(drive.handR ?? drive.forearmR, ro.handR, b.armDownR));
  set(ro.thighL, D(drive.thighL, ro.thighL, b.legDownL));
  set(ro.shinL, D(drive.shinL, ro.shinL, b.legDownL));
  set(ro.footL, D(drive.footL, ro.footL, b.legDownL));
  set(ro.thighR, D(drive.thighR, ro.thighR, b.legDownR));
  set(ro.shinR, D(drive.shinR, ro.shinR, b.legDownR));
  set(ro.footR, D(drive.footR, ro.footR, b.legDownR));

  const rpR = asQ(skel.rootParent.r);
  const rpT = asV(skel.rootParent.t);
  const k = b.hipsY / Math.max(1e-3, drive.sourceHipsY);
  const worldR: Q[] = new Array(n);
  const worldT: V3[] = new Array(n);
  const bones: Record<string, IdolBonePose> = {};
  const done = new Array<boolean>(n).fill(false);
  const visit = (i: number): void => {
    if (done[i]) return;
    const j = skel.joints[i]!;
    let pR = rpR, pT = rpT;
    if (j.parent >= 0) { visit(j.parent); pR = worldR[j.parent]!; pT = worldT[j.parent]!; }
    const pS = b.parentScale[i]!;
    const w = target.get(i) ?? qNorm(qMul(pR, asQ(j.r)));
    const local = qNorm(qMul(qConj(pR), w));
    worldR[i] = w;
    let pose: IdolBonePose = { rotation: { x: local[0], y: local[1], z: local[2], w: local[3] } };
    if (i === ro.hips) {
      const bw = b.worldT[i]!;
      const pw: V3 = [bw[0] + drive.hipsOffset[0] * k, bw[1] + drive.hipsOffset[1] * k, bw[2] + drive.hipsOffset[2] * k];
      worldT[i] = pw;
      const lt = qRot(qConj(pR), [(pw[0] - pT[0]) / pS, (pw[1] - pT[1]) / pS, (pw[2] - pT[2]) / pS]);
      pose = { ...pose, position: { x: lt[0], y: lt[1], z: lt[2] } };
    } else {
      const lt = qRot(pR, asV(j.t));
      worldT[i] = [pT[0] + lt[0] * pS, pT[1] + lt[1] * pS, pT[2] + lt[2] * pS];
    }
    bones[j.name] = pose;
    done[i] = true;
  };
  for (let i = 0; i < n; i++) visit(i);
  return { bones, worldR, worldT };
}
