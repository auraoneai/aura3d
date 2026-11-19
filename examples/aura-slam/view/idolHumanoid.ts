/**
 * Game-local humanoid retarget for rigged Idol GLBs (bones are unnamed: bone_0..bone_N).
 *
 * 1. `mapIdolHumanoid(bind)` finds the humanoid roles from the bind hierarchy and rest positions: the pelvis is the first bone
 *    whose subtree reaches both the feet and the head; the legs are its downward children, the spine climbs to the first
 *    bone with three or more children (chest), whose highest child is the neck/head and whose side children are the arms.
 *    The GLB faces +Z after the Idol normaliser, so the character's left side is +X.
 * 2. `createIdolHumanoid(bind)` solves a pose from model-space targets (pelvis offset and lean, two-bone IK for each foot and
 *    hand with a pole, head yaw) into LOCAL bone rotations (and the pelvis translation) for `setAnimationPose`.
 *
 * Pure (no engine imports), so the mapping and the forward kinematics are unit tested offline.
 */

export type V3 = readonly [number, number, number];
export type Q = readonly [number, number, number, number];

export interface IdolBindBone {
  readonly name: string;
  readonly parent: string | null;
  /** model-space bind position (metres) */
  readonly pos: V3;
  /** model-space bind rotation (x, y, z, w) */
  readonly rot: Q;
}

export interface IdolBind {
  readonly key: string;
  readonly scale: number;
  /** model-space transform of the top bone's parent node (the normaliser's wrapper) */
  readonly rootParent: { readonly pos: V3; readonly rot: Q; readonly scale: number };
  readonly bones: readonly IdolBindBone[];
}

export interface HumanoidMap {
  readonly hips: string;
  readonly spine: readonly string[];
  readonly chest: string;
  readonly neck: string | null;
  readonly head: string;
  readonly shoulderL: string | null;
  readonly shoulderR: string | null;
  readonly upperArmL: string;
  readonly foreArmL: string;
  readonly handL: string;
  readonly upperArmR: string;
  readonly foreArmR: string;
  readonly handR: string;
  readonly upperLegL: string;
  readonly lowerLegL: string;
  readonly footL: string;
  readonly upperLegR: string;
  readonly lowerLegR: string;
  readonly footR: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// vector / quaternion helpers
// ---------------------------------------------------------------------------------------------------------------------

export const vAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const vDot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vLen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const vNorm = (a: V3, fallback: V3 = [0, 1, 0]): V3 => {
  const l = vLen(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback;
};
/** component of `v` perpendicular to unit `axis` */
const vPerp = (v: V3, axis: V3): V3 => vSub(v, vScale(axis, vDot(v, axis)));

export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const qConj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
export const qNorm = (q: Q): Q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export const qAxis = (axis: V3, angle: number): Q => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
export const qRotate = (q: Q, v: V3): V3 => {
  const u: V3 = [q[0], q[1], q[2]];
  const s = q[3];
  const t = vScale(vCross(u, v), 2);
  return vAdd(vAdd(v, vScale(t, s)), vCross(u, t));
};
export const qSlerp = (a: Q, b: Q, t: number): Q => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  if (dot > 0.9995) return qNorm([a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t]);
  const th = Math.acos(dot);
  const sn = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / sn;
  const wb = (Math.sin(t * th) / sn) * s;
  return qNorm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb]);
};
const IDENTITY: Q = [0, 0, 0, 1];

/** rotation matrix (columns x, y, z) to quaternion */
function qFromBasis(x: V3, y: V3, z: V3): Q {
  const m00 = x[0], m10 = x[1], m20 = x[2];
  const m01 = y[0], m11 = y[1], m21 = y[2];
  const m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return qNorm([(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return qNorm([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return qNorm([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]);
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return qNorm([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]);
}

/** the rotation taking the orthonormal frame (a0, b0) onto (a1, b1) */
function qFrames(a0: V3, b0: V3, a1: V3, b1: V3): Q {
  const f0 = qFromBasis(a0, b0, vCross(a0, b0));
  const f1 = qFromBasis(a1, b1, vCross(a1, b1));
  return qNorm(qMul(f1, qConj(f0)));
}

// ---------------------------------------------------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------------------------------------------------

export function mapIdolHumanoid(bind: IdolBind): HumanoidMap {
  const byName = new Map(bind.bones.map((b) => [b.name, b]));
  const children = new Map<string, IdolBindBone[]>();
  for (const b of bind.bones) if (b.parent) (children.get(b.parent) ?? children.set(b.parent, []).get(b.parent)!).push(b);
  const kids = (n: string): IdolBindBone[] => children.get(n) ?? [];
  const subtree = (n: string): IdolBindBone[] => [byName.get(n)!, ...kids(n).flatMap((c) => subtree(c.name))];
  const minY = (n: string): number => Math.min(...subtree(n).map((b) => b.pos[1]));
  const maxY = (n: string): number => Math.max(...subtree(n).map((b) => b.pos[1]));
  const ys = bind.bones.map((b) => b.pos[1]);
  const height = Math.max(...ys) - Math.min(...ys);
  const low = Math.min(...ys) + height * 0.2;

  const top = bind.bones.find((b) => !b.parent);
  if (!top) throw new Error(`${bind.key}: no root bone`);
  // pelvis: descend from the root while a single child carries the whole body; stop at the first fork with legs + spine.
  let hips = top.name;
  for (let guard = 0; guard < 8; guard++) {
    const k = kids(hips);
    const legs = k.filter((c) => minY(c.name) < low && maxY(c.name) < byName.get(hips)!.pos[1] + height * 0.05);
    if (legs.length >= 2) break;
    const next = k.find((c) => minY(c.name) < low && maxY(c.name) > byName.get(hips)!.pos[1] + height * 0.2);
    if (!next) break;
    hips = next.name;
  }
  const hipKids = kids(hips);
  const legRoots = hipKids.filter((c) => minY(c.name) < low && maxY(c.name) < byName.get(hips)!.pos[1] + height * 0.05);
  const spineRoot = hipKids.find((c) => maxY(c.name) > byName.get(hips)!.pos[1] + height * 0.2);
  if (legRoots.length < 2 || !spineRoot) throw new Error(`${bind.key}: no pelvis fork (legs ${legRoots.length})`);
  /** single-child chain from a bone down a limb (stops at a fork or the end) */
  const chain = (start: string): string[] => {
    const out = [start];
    let cur = start;
    for (;;) {
      const k = kids(cur);
      if (k.length !== 1) break;
      cur = k[0]!.name;
      out.push(cur);
    }
    return out;
  };
  const legChain = (root: IdolBindBone) => {
    const c = chain(root.name);
    if (c.length < 3) throw new Error(`${bind.key}: leg chain too short (${c.length})`);
    return { upper: c[0]!, lower: c[1]!, foot: c[2]! };
  };
  const sortedLegs = [...legRoots].sort((a, b) => b.pos[0] - a.pos[0]);
  const legL = legChain(sortedLegs[0]!);
  const legR = legChain(sortedLegs[sortedLegs.length - 1]!);

  const spine: string[] = [];
  let chest = spineRoot.name;
  for (let guard = 0; guard < 8; guard++) {
    const k = kids(chest);
    if (k.length >= 3) break;
    if (k.length !== 1) throw new Error(`${bind.key}: spine ends without a chest fork`);
    spine.push(chest);
    chest = k[0]!.name;
  }
  const chestBone = byName.get(chest)!;
  const chestKids = kids(chest);
  const neckRoot = [...chestKids].sort((a, b) => Math.abs(a.pos[0] - chestBone.pos[0]) - Math.abs(b.pos[0] - chestBone.pos[0]) || b.pos[1] - a.pos[1])[0]!;
  const armRoots = chestKids.filter((c) => c !== neckRoot).sort((a, b) => b.pos[0] - a.pos[0]);
  const neckChain = chain(neckRoot.name);
  const head = neckChain.length >= 2 ? neckChain[1]! : neckChain[0]!;
  const neck = neckChain.length >= 2 ? neckChain[0]! : null;
  const armChain = (root: IdolBindBone) => {
    const c = chain(root.name);
    // a clavicle sits close to the chest midline and is short compared with the upper arm
    const reach = (a: string, b: string): number => vLen(vSub(byName.get(b)!.pos, byName.get(a)!.pos));
    const hasClavicle = c.length >= 4 && reach(c[0]!, c[1]!) < reach(c[1]!, c[2]!) * 0.75;
    const o = hasClavicle ? 1 : 0;
    if (c.length < o + 3) throw new Error(`${bind.key}: arm chain too short (${c.length})`);
    return { shoulder: hasClavicle ? c[0]! : null, upper: c[o]!, fore: c[o + 1]!, hand: c[o + 2]! };
  };
  const armL = armChain(armRoots[0]!);
  const armR = armChain(armRoots[armRoots.length - 1]!);
  return {
    hips, spine, chest, neck, head,
    shoulderL: armL.shoulder, shoulderR: armR.shoulder,
    upperArmL: armL.upper, foreArmL: armL.fore, handL: armL.hand,
    upperArmR: armR.upper, foreArmR: armR.fore, handR: armR.hand,
    upperLegL: legL.upper, lowerLegL: legL.lower, footL: legL.foot,
    upperLegR: legR.upper, lowerLegR: legR.lower, footR: legR.foot
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// solver
// ---------------------------------------------------------------------------------------------------------------------

export interface LimbTarget {
  /** model-space end-effector target (the ankle for a leg, the palm for an arm) */
  readonly end: V3;
  /** model-space direction the knee / elbow should point toward */
  readonly pole: V3;
  /** `end` is the wrist joint itself rather than the palm (arms only) */
  readonly joint?: boolean;
}

export interface HumanoidTargets {
  /** model-space translation added to the pelvis bind position */
  readonly hipsOffset?: V3;
  /** model-space world-rotation deltas */
  readonly pelvis?: Q;
  readonly chest?: Q;
  readonly head?: Q;
  readonly legL?: LimbTarget;
  readonly legR?: LimbTarget;
  readonly armL?: LimbTarget;
  readonly armR?: LimbTarget;
  /** keep the feet flat at their bind orientation (default true; a foot listed in boneDeltas follows its delta) */
  readonly flatFeet?: boolean;
  /**
   * World-rotation deltas from the bind, keyed by bone name (motion-capture clips: view/idolMocap.ts). They win over
   * pelvis / chest / head; IK limbs (legL..armR) win over them.
   */
  readonly boneDeltas?: Readonly<Record<string, Q>>;
}

export interface BonePose {
  readonly rotation: { x: number; y: number; z: number; w: number };
  readonly position?: { x: number; y: number; z: number };
}

export interface SolvedHumanoid {
  /** local bone transforms for setAnimationPose */
  readonly bones: Record<string, BonePose>;
  /** model-space posed joint positions */
  readonly positions: Map<string, V3>;
  /** model-space palm points (hand joint pushed `palm` metres along the forearm) */
  readonly palmL: V3;
  readonly palmR: V3;
}

export interface IdolHumanoid {
  readonly bind: IdolBind;
  readonly map: HumanoidMap;
  /** model-space bind position of a bone */
  bindPos(name: string): V3;
  /** bind length of the leg (hip joint to ankle) and arm (shoulder joint to palm), model metres */
  readonly legLength: number;
  readonly armLength: number;
  /** shoulder joint to wrist joint, model metres */
  readonly armToWrist: number;
  solve(targets: HumanoidTargets): SolvedHumanoid;
}

/** extra reach from the hand joint (wrist) to the palm, as a fraction of the forearm */
const PALM_FRACTION = 0.32;

export function createIdolHumanoid(bind: IdolBind, map: HumanoidMap = mapIdolHumanoid(bind)): IdolHumanoid {
  const bones = bind.bones;
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const B = (n: string): IdolBindBone => bones[index.get(n)!]!;
  const parentIdx = bones.map((b) => (b.parent ? index.get(b.parent)! : -1));
  const bindLocalRot = bones.map((b, i) => (parentIdx[i]! >= 0 ? qNorm(qMul(qConj(bones[parentIdx[i]!]!.rot), b.rot)) : b.rot));
  const bindLocalOff = bones.map((b, i) => (parentIdx[i]! >= 0 ? qRotate(qConj(bones[parentIdx[i]!]!.rot), vSub(b.pos, bones[parentIdx[i]!]!.pos)) : b.pos));
  const dist = (a: string, b: string): number => vLen(vSub(B(b).pos, B(a).pos));
  const legLength = dist(map.upperLegL, map.lowerLegL) + dist(map.lowerLegL, map.footL);
  const foreL = dist(map.foreArmL, map.handL);
  const armLength = dist(map.upperArmL, map.foreArmL) + foreL * (1 + PALM_FRACTION);
  const FORWARD: V3 = [0, 0, 1];

  interface Limb { upper: number; lower: number; end: number; l1: number; l2: number; palm: number; a0u: V3; b0u: V3; a0l: V3; b0l: V3 }
  const limb = (upper: string, lower: string, end: string, bend: V3, palm: number): Limb => {
    const a0u = vNorm(vSub(B(lower).pos, B(upper).pos));
    const a0l = vNorm(vSub(B(end).pos, B(lower).pos));
    const b0u = vNorm(vPerp(bend, a0u));
    const h0 = vCross(a0u, b0u);
    const b0l = vNorm(vCross(h0, a0l));
    const l2 = dist(lower, end);
    return { upper: index.get(upper)!, lower: index.get(lower)!, end: index.get(end)!, l1: dist(upper, lower), l2: l2 * (1 + palm), palm: l2 * palm, a0u, b0u, a0l, b0l };
  };
  // flexing a knee swings the shin back (-Z); flexing an elbow brings the hand forward (+Z)
  const limbs = {
    legL: limb(map.upperLegL, map.lowerLegL, map.footL, [0, 0, -1], 0),
    legR: limb(map.upperLegR, map.lowerLegR, map.footR, [0, 0, -1], 0),
    armL: limb(map.upperArmL, map.foreArmL, map.handL, [0, 0, 1], PALM_FRACTION),
    armR: limb(map.upperArmR, map.foreArmR, map.handR, [0, 0, 1], PALM_FRACTION)
  };
  const hipsIdx = index.get(map.hips)!;
  const chestIdx = index.get(map.chest)!;
  const headIdx = index.get(map.head)!;
  const neckIdx = map.neck ? index.get(map.neck)! : -1;
  const spineIdx = map.spine.map((n) => index.get(n)!);
  const footIdx = new Set([index.get(map.footL)!, index.get(map.footR)!]);
  const written = new Set<number>([hipsIdx, chestIdx, headIdx, ...spineIdx, ...(neckIdx >= 0 ? [neckIdx] : []), ...footIdx,
    ...Object.values(limbs).flatMap((l) => [l.upper, l.lower])]);
  const rp = bind.rootParent;

  function solve(t: HumanoidTargets): SolvedHumanoid {
    const n = bones.length;
    const wRot: Q[] = new Array(n);
    const wPos: V3[] = new Array(n);
    const override = new Map<number, Q>();
    const pelvis = t.pelvis ?? IDENTITY;
    const chest = t.chest ?? pelvis;
    const head = t.head ?? IDENTITY;
    const bd = t.boneDeltas;
    const deltaFor = (i: number): Q | undefined => {
      const named = bd?.[bones[i]!.name];
      if (named) return named;
      if (i === hipsIdx) return pelvis;
      if (i === chestIdx) return chest;
      if (i === headIdx) return head;
      if (i === neckIdx) return qSlerp(chest, head, 0.5);
      const s = spineIdx.indexOf(i);
      if (s >= 0) return qSlerp(pelvis, chest, (s + 1) / (spineIdx.length + 1));
      return undefined;
    };
    const solveLimb = (l: Limb, target: LimbTarget | undefined): void => {
      if (!target) return;
      const S = wPos[l.upper]!;
      const d = vSub(target.end, S);
      const u = vNorm(d, [0, -1, 0]);
      const l2 = target.joint ? l.l2 - l.palm : l.l2;
      const reach = Math.min(Math.max(vLen(d), Math.abs(l.l1 - l2) + 1e-4), (l.l1 + l2) * 0.9995);
      const a = (l.l1 * l.l1 - l2 * l2 + reach * reach) / (2 * reach);
      const h = Math.sqrt(Math.max(0, l.l1 * l.l1 - a * a));
      let v = vPerp(target.pole, u);
      if (vLen(v) < 1e-6) v = vPerp(FORWARD, u);
      v = vNorm(v, [0, 0, 1]);
      const E = vAdd(vAdd(S, vScale(u, a)), vScale(v, h));
      const End = vAdd(S, vScale(u, reach));
      const au = vNorm(vSub(E, S));
      const al = vNorm(vSub(End, E), au);
      let bu = vPerp(al, au);
      bu = vLen(bu) > 1e-4 ? vNorm(bu) : vNorm(vScale(v, -1));
      const hinge = vCross(au, bu);
      const bl = vNorm(vCross(hinge, al));
      override.set(l.upper, qNorm(qMul(qFrames(l.a0u, l.b0u, au, bu), bones[l.upper]!.rot)));
      override.set(l.lower, qNorm(qMul(qFrames(l.a0l, l.b0l, al, bl), bones[l.lower]!.rot)));
    };
    for (let i = 0; i < n; i++) {
      const p = parentIdx[i]!;
      if (p < 0) {
        const delta = deltaFor(i);
        wRot[i] = delta ? qNorm(qMul(delta, bones[i]!.rot)) : bones[i]!.rot;
        wPos[i] = i === hipsIdx && t.hipsOffset ? vAdd(bones[i]!.pos, t.hipsOffset) : bones[i]!.pos;
      } else {
        wPos[i] = vAdd(wPos[p]!, qRotate(wRot[p]!, bindLocalOff[i]!));
        if (i === hipsIdx && t.hipsOffset) wPos[i] = vAdd(wPos[i]!, t.hipsOffset);
        // limb roots are solved once their joint position is known (their parents are already posed)
        for (const [key, l] of Object.entries(limbs)) if (l.upper === i) solveLimb(l, t[key as keyof typeof limbs]);
        const delta = deltaFor(i);
        if (override.has(i)) wRot[i] = override.get(i)!;
        else if (delta) wRot[i] = qNorm(qMul(delta, bones[i]!.rot));
        else if (footIdx.has(i) && t.flatFeet !== false && !bd?.[bones[i]!.name]) wRot[i] = bones[i]!.rot;
        else wRot[i] = qNorm(qMul(wRot[p]!, bindLocalRot[i]!));
      }
    }
    const out: Record<string, BonePose> = {};
    const toQ = (q: Q) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
    const writes = bd ? new Set([...written, ...Object.keys(bd).map((n) => index.get(n)).filter((i): i is number => i !== undefined)]) : written;
    for (const i of writes) {
      const p = parentIdx[i]!;
      const parentRot = p >= 0 ? wRot[p]! : rp.rot;
      const local = qNorm(qMul(qConj(parentRot), wRot[i]!));
      if (i === hipsIdx) {
        const parentPos = p >= 0 ? wPos[p]! : rp.pos;
        // a bone's local translation is in its parent's scaled frame (bones carry unit scale: a parent bone's world scale is bind.scale)
        const parentScale = p >= 0 ? bind.scale : rp.scale;
        const lp = vScale(qRotate(qConj(parentRot), vSub(wPos[i]!, parentPos)), 1 / parentScale);
        out[bones[i]!.name] = { rotation: toQ(local), position: { x: lp[0], y: lp[1], z: lp[2] } };
      } else {
        out[bones[i]!.name] = { rotation: toQ(local) };
      }
    }
    const positions = new Map<string, V3>();
    bones.forEach((b, i) => positions.set(b.name, wPos[i]!));
    const palm = (l: Limb): V3 => vAdd(wPos[l.end]!, vScale(vNorm(vSub(wPos[l.end]!, wPos[l.lower]!)), l.palm));
    return { bones: out, positions, palmL: palm(limbs.armL), palmR: palm(limbs.armR) };
  }

  return { bind, map, bindPos: (name) => B(name).pos, legLength, armLength, armToWrist: dist(map.upperArmL, map.foreArmL) + foreL, solve };
}
