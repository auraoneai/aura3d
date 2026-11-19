/**
 * Aura Diamond 3D: drives a rigged Idol athlete GLB (unnamed bone_N skeleton, T-pose bind) from the game's 14-bone baseball
 * rig, every frame, through the model node's `setAnimationPose` (local bone transforms, replace mode).
 *
 * The game rig (art/proceduralModels.ts) binds every bone at identity rotation in an arms-down stance, so a game bone's world
 * rotation IS its rotation away from bind. The retarget:
 *   - hips, spine, neck, head, clavicles and feet take the game's world deltas on top of their own bind orientation
 *     (spine joints blend Hips -> Spine -> Chest by height, the neck sits halfway between Chest and Head);
 *   - each limb's bind direction is first turned onto the game's bind direction (T-pose arm -> hanging arm) and then the game
 *     delta applies, which also carries the forearm/shin twist;
 *   - the arms are then solved by two-bone IK so the Idol palm (measured from the CPU-skinned hand vertices) lands exactly on
 *     the game palm the bat grip, gloves and the mitt are placed from, bending toward the game's elbow; the legs are solved the
 *     same way to the game ankle (moved by the difference in ankle height) so the soles stay on the ground.
 * The Idol model keeps its own torso proportions; bone lengths only stretch (at most 12 %) when a game hand is out of reach.
 *
 * Pure maths, no engine imports: unit tested offline against the generated bind tables.
 */

export type V3 = readonly [number, number, number];
export type Q = readonly [number, number, number, number];

export interface IdolArmRoles { readonly clavicle: string | null; readonly upper: string; readonly fore: string; readonly hand: string }
export interface IdolLegRoles { readonly thigh: string; readonly shin: string; readonly foot: string; readonly toe: string | null }

export interface IdolAthleteBind {
  readonly key: string;
  readonly rootParent: { readonly pos: readonly number[]; readonly rot: readonly number[]; readonly scale: number };
  readonly jointScale: number;
  readonly joints: readonly { readonly name: string; readonly parent: string | null; readonly pos: readonly number[]; readonly rot: readonly number[] }[];
  readonly roles: {
    readonly hips: string;
    readonly spine: readonly string[];
    readonly neck: readonly string[];
    readonly head: string;
    readonly armL: IdolArmRoles;
    readonly armR: IdolArmRoles;
    readonly legL: IdolLegRoles;
    readonly legR: IdolLegRoles;
  };
  readonly palmL: readonly number[];
  readonly palmR: readonly number[];
  readonly head: {
    readonly crownY: number;
    readonly crownCentre: readonly number[];
    readonly width: number;
    readonly depth: number;
    readonly bandCentre: readonly number[];
    readonly bandWidth: number;
    readonly bandDepth: number;
  };
  readonly soleY: number;
  readonly height: number;
  readonly lengths: { readonly upperArm: number; readonly foreArm: number; readonly thigh: number; readonly shin: number };
}

/** The 14 game bones (the game's `BaseballBoneName`). */
export type GameBone =
  | "Hips" | "Spine" | "Chest" | "Head"
  | "LeftUpperArm" | "LeftForearm" | "RightUpperArm" | "RightForearm"
  | "LeftUpperLeg" | "LeftLowerLeg" | "LeftFoot" | "RightUpperLeg" | "RightLowerLeg" | "RightFoot";

/** One frame of the game rig in actor space (the space the Idol model sits in): joint positions and world rotations, palms. */
export interface GameRigFrame {
  readonly pos: Readonly<Record<GameBone, V3>>;
  readonly rot: Readonly<Record<GameBone, Q>>;
  readonly palmL: V3;
  readonly palmR: V3;
}

export interface IdolBonePose {
  readonly position: { x: number; y: number; z: number };
  readonly rotation: { x: number; y: number; z: number; w: number };
}

export interface IdolPoseResult {
  readonly bones: Record<string, IdolBonePose>;
  /** model-space head joint position and the head's rotation away from bind (cap / helmet socket) */
  readonly headPos: V3;
  readonly headDelta: Q;
  /** model-space palm reached by each hand (for grip evidence) */
  readonly palmL: V3;
  readonly palmR: V3;
}

/* ------------------------------------------------------------------ */
/* quaternion / vector helpers ([x, y, z, w])                          */
/* ------------------------------------------------------------------ */
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const qConj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q: Q): Q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
export const qRot = (q: Q, v: V3): V3 => {
  const t = scale(cross([q[0], q[1], q[2]], v), 2);
  return add(add(v, scale(t, q[3])), cross([q[0], q[1], q[2]], t));
};
export function qFromTo(a: V3, b: V3): Q {
  const u = unit(a), v = unit(b);
  const d = dot(u, v);
  if (d < -0.999999) {
    const axis = unit(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(u, v);
  return qNorm([c[0], c[1], c[2], 1 + d]);
}
export function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d = Math.abs(d);
  if (d > 0.9995) return qNorm([a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t]);
  const th = Math.acos(Math.min(1, d));
  const sn = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / sn, wb = (Math.sin(t * th) / sn) * s;
  return qNorm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb]);
}
const Q_ID: Q = [0, 0, 0, 1];
const v3 = (a: readonly number[]): V3 => [a[0]!, a[1]!, a[2]!];
const q4 = (a: readonly number[]): Q => [a[0]!, a[1]!, a[2]!, a[3]!];

/** Two-bone IK: elbow/knee position for root `a`, target `t`, lengths, bending toward `pole`. Returns the (possibly stretched) mid and end. */
export function solveTwoBoneIK(a: V3, t: V3, l1: number, l2: number, pole: V3, maxStretch = 1.12): { mid: V3; end: V3; stretch: number } {
  const d0 = sub(t, a);
  let d = len(d0);
  const u = d > 1e-6 ? scale(d0, 1 / d) : ([0, -1, 0] as V3);
  let k = 1;
  if (d > (l1 + l2) * 0.9995) k = Math.min(maxStretch, d / ((l1 + l2) * 0.9995));
  const L1 = l1 * k, L2 = l2 * k;
  d = Math.min(d, (L1 + L2) * 0.9995);
  d = Math.max(d, Math.abs(L1 - L2) + 1e-4);
  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  const pv = sub(pole, a);
  let v = sub(pv, scale(u, dot(pv, u)));
  if (len(v) < 1e-6) v = Math.abs(u[1]) < 0.9 ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0]);
  v = unit(v);
  const mid = add(add(a, scale(u, x)), scale(v, h));
  return { mid, end: add(a, scale(u, d)), stretch: k };
}

interface Joint { readonly name: string; readonly parent: string | null; readonly pos: V3; readonly rot: Q; readonly localT: V3; readonly localR: Q; readonly parentScale: number }

export interface PreparedIdolRig {
  readonly bind: IdolAthleteBind;
  readonly order: readonly Joint[];
  readonly byName: ReadonlyMap<string, Joint>;
  readonly align: ReadonlyMap<string, Q>;
  readonly hipsOffset: V3;
  readonly ankleOffsetL: V3;
  readonly ankleOffsetR: V3;
  readonly palmL: V3;
  readonly palmR: V3;
  readonly spineWeights: readonly number[];
  /** finger joints under each hand: the world axis (at bind) they curl about toward the palm, and how strongly */
  readonly fingerCurl: ReadonlyMap<string, { readonly axisLocal: V3; readonly weight: number }>;
}

/**
 * Precompute bind locals and the limb alignments. `gameBind` is the game rig at bind in actor space (pos only matters).
 */
export function prepareIdolRig(bind: IdolAthleteBind, gameBind: GameRigFrame): PreparedIdolRig {
  const rp = { pos: v3(bind.rootParent.pos), rot: q4(bind.rootParent.rot), scale: bind.rootParent.scale };
  const raw = new Map(bind.joints.map((j) => [j.name, j]));
  const order: Joint[] = [];
  const byName = new Map<string, Joint>();
  for (const j of bind.joints) {
    const pos = v3(j.pos), rot = q4(j.rot);
    const p = j.parent ? raw.get(j.parent)! : null;
    const ppos = p ? v3(p.pos) : rp.pos;
    const prot = p ? q4(p.rot) : rp.rot;
    const pscale = p ? bind.jointScale : rp.scale;
    const joint: Joint = {
      name: j.name, parent: j.parent, pos, rot,
      localT: scale(qRot(qConj(prot), sub(pos, ppos)), 1 / pscale),
      localR: qNorm(qMul(qConj(prot), rot)),
      parentScale: pscale
    };
    order.push(joint);
    byName.set(j.name, joint);
  }
  const P = (n: string): V3 => byName.get(n)!.pos;
  const r = bind.roles;
  const align = new Map<string, Q>();
  const gp = gameBind.pos;
  const alignLimb = (idolFrom: string, idolTo: string, gameFrom: V3, gameTo: V3, bone: string) => {
    align.set(bone, qFromTo(sub(P(idolTo), P(idolFrom)), sub(gameTo, gameFrom)));
  };
  alignLimb(r.armL.upper, r.armL.fore, gp.LeftUpperArm, gp.LeftForearm, r.armL.upper);
  alignLimb(r.armL.fore, r.armL.hand, gp.LeftForearm, gameBind.palmL, r.armL.fore);
  alignLimb(r.armR.upper, r.armR.fore, gp.RightUpperArm, gp.RightForearm, r.armR.upper);
  alignLimb(r.armR.fore, r.armR.hand, gp.RightForearm, gameBind.palmR, r.armR.fore);
  alignLimb(r.legL.thigh, r.legL.shin, gp.LeftUpperLeg, gp.LeftLowerLeg, r.legL.thigh);
  alignLimb(r.legL.shin, r.legL.foot, gp.LeftLowerLeg, gp.LeftFoot, r.legL.shin);
  alignLimb(r.legR.thigh, r.legR.shin, gp.RightUpperLeg, gp.RightLowerLeg, r.legR.thigh);
  alignLimb(r.legR.shin, r.legR.foot, gp.RightLowerLeg, gp.RightFoot, r.legR.shin);
  align.set(r.armL.hand, align.get(r.armL.fore)!);
  align.set(r.armR.hand, align.get(r.armR.fore)!);
  const hipsOffset = sub(P(r.hips), gp.Hips);
  const ankle = (idolFoot: string, gameFoot: V3): V3 => [0, P(idolFoot)[1] - gameFoot[1], P(idolFoot)[2] - gameFoot[2]];
  // spine joints blend Hips (0) -> Spine (1) -> Chest (2) by bind height between the Idol hips and the arm split
  const hy = P(r.hips)[1], cy = P(r.spine[r.spine.length - 1]!)[1];
  const spineWeights = r.spine.map((n) => 2 * Math.min(1, Math.max(0, (P(n)[1] - hy) / Math.max(1e-3, cy - hy))));
  // fingers (every joint under a hand): T-pose palms face down, so a finger curls toward -Y about the forward axis; thumb
  // chains (the first child of the hand that leans forward most) curl a third as much
  const fingerCurl = new Map<string, { axisLocal: V3; weight: number }>();
  for (const [arm, sign] of [[r.armL, -1], [r.armR, 1]] as const) {
    const hand = byName.get(arm.hand)!;
    const kids = order.filter((j) => j.parent === arm.hand);
    const thumb = kids.length > 1 ? kids.reduce((a, b) => (b.pos[2] - hand.pos[2] > a.pos[2] - hand.pos[2] ? b : a)) : null;
    const walk = (j: Joint, weight: number) => {
      fingerCurl.set(j.name, { axisLocal: qRot(qConj(j.rot), [0, 0, sign]), weight });
      for (const c of order.filter((k) => k.parent === j.name)) walk(c, weight);
    };
    for (const k of kids) walk(k, k === thumb ? 0.35 : 1);
  }
  return {
    bind, order, byName, align, hipsOffset, fingerCurl,
    ankleOffsetL: ankle(r.legL.foot, gp.LeftFoot),
    ankleOffsetR: ankle(r.legR.foot, gp.RightFoot),
    palmL: v3(bind.palmL), palmR: v3(bind.palmR),
    spineWeights
  };
}

const blend3 = (a: Q, b: Q, c: Q, w: number): Q => (w <= 1 ? qSlerp(a, b, w) : qSlerp(b, c, w - 1));

/** The Idol skeleton pose (local transforms for every driven joint) for one game frame. */
const qAxisAngle = (axis: V3, angle: number): Q => {
  const h = angle / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
};

/**
 * The Idol skeleton pose (local transforms for every driven joint) for one game frame. `grip` (radians per finger joint)
 * closes the fingers: a fist round the bat handle or relaxed hands.
 */
export function idolPoseFromGame(rig: PreparedIdolRig, g: GameRigFrame, grip: { readonly left: number; readonly right: number } = { left: 0.35, right: 0.35 }): IdolPoseResult {
  const r = rig.bind.roles;
  const worldR = new Map<string, Q>();
  const worldP = new Map<string, V3>();
  const B = (n: string) => rig.byName.get(n)!;
  const deltaOf = (n: string, game: Q): Q => qMul(qMul(game, rig.align.get(n) ?? Q_ID), B(n).rot);
  const rootParent = { pos: v3(rig.bind.rootParent.pos), rot: q4(rig.bind.rootParent.rot), scale: rig.bind.rootParent.scale };
  const parentWorld = (j: Joint): { p: V3; q: Q; s: number } =>
    j.parent ? { p: worldP.get(j.parent)!, q: worldR.get(j.parent)!, s: j.parentScale } : { p: rootParent.pos, q: rootParent.rot, s: rootParent.scale };
  /** forward kinematics from bind local for joints not yet placed (positions follow the parent) */
  const fkPos = (j: Joint): V3 => { const pw = parentWorld(j); return add(pw.p, scale(qRot(pw.q, j.localT), pw.s)); };

  // desired world rotations of the rotation-driven joints
  const target = new Map<string, Q>();
  target.set(r.hips, deltaOf(r.hips, g.rot.Hips));
  r.spine.forEach((n, i) => target.set(n, deltaOf(n, blend3(g.rot.Hips, g.rot.Spine, g.rot.Chest, rig.spineWeights[i]!))));
  r.neck.forEach((n, i) => target.set(n, deltaOf(n, qSlerp(g.rot.Chest, g.rot.Head, (i + 1) / (r.neck.length + 1)))));
  target.set(r.head, deltaOf(r.head, g.rot.Head));
  for (const arm of [r.armL, r.armR]) if (arm.clavicle) target.set(arm.clavicle, deltaOf(arm.clavicle, g.rot.Chest));
  const side = (L: boolean) => ({
    arm: L ? r.armL : r.armR, leg: L ? r.legL : r.legR,
    ua: L ? g.rot.LeftUpperArm : g.rot.RightUpperArm, fa: L ? g.rot.LeftForearm : g.rot.RightForearm,
    elbow: L ? g.pos.LeftForearm : g.pos.RightForearm, palm: L ? g.palmL : g.palmR, palmOff: L ? rig.palmL : rig.palmR,
    th: L ? g.rot.LeftUpperLeg : g.rot.RightUpperLeg, sh: L ? g.rot.LeftLowerLeg : g.rot.RightLowerLeg, ft: L ? g.rot.LeftFoot : g.rot.RightFoot,
    knee: L ? g.pos.LeftLowerLeg : g.pos.RightLowerLeg, ankle: L ? g.pos.LeftFoot : g.pos.RightFoot, ankleOff: L ? rig.ankleOffsetL : rig.ankleOffsetR
  });
  for (const L of [true, false]) {
    const s = side(L);
    target.set(s.arm.upper, deltaOf(s.arm.upper, s.ua));
    target.set(s.arm.fore, deltaOf(s.arm.fore, s.fa));
    target.set(s.arm.hand, deltaOf(s.arm.hand, s.fa));
    target.set(s.leg.thigh, deltaOf(s.leg.thigh, s.th));
    target.set(s.leg.shin, deltaOf(s.leg.shin, s.sh));
    target.set(s.leg.foot, qMul(s.ft, B(s.leg.foot).rot));
  }

  // pass 1: torso + clavicles by FK from the hips target position
  const hipsPos = add(g.pos.Hips, rig.hipsOffset);
  const limbJoints = new Set<string>([r.armL.upper, r.armL.fore, r.armL.hand, r.armR.upper, r.armR.fore, r.armR.hand,
    r.legL.thigh, r.legL.shin, r.legL.foot, r.legR.thigh, r.legR.shin, r.legR.foot]);
  const solvedPos = new Map<string, V3>();
  const place = (j: Joint) => {
    const tr = target.get(j.name);
    const pos = j.name === r.hips ? hipsPos : solvedPos.get(j.name) ?? fkPos(j);
    const curl = rig.fingerCurl.get(j.name);
    const isLeftFinger = curl ? isUnder(rig, j, new Set([r.armL.hand])) : false;
    const rot = tr ?? (curl
      ? qMul(parentWorld(j).q, qMul(j.localR, qAxisAngle(curl.axisLocal, curl.weight * (isLeftFinger ? grip.left : grip.right))))
      : qMul(parentWorld(j).q, j.localR));
    worldP.set(j.name, pos);
    worldR.set(j.name, rot);
  };

  // limbs: IK from where the torso puts the shoulder / hip joint
  const solveLimb = (rootName: string, midName: string, endName: string, endTarget: V3, pole: V3) => {
    const root = B(rootName), mid = B(midName), end = B(endName);
    const l1 = len(sub(mid.pos, root.pos)), l2 = len(sub(end.pos, mid.pos));
    const a = worldP.get(rootName)!;
    const ik = solveTwoBoneIK(a, endTarget, l1, l2, pole);
    // swing the delta-driven limb rotations onto the IK segments (keeps the game's twist)
    const rootRot = target.get(rootName)!, midRot = target.get(midName)!;
    const bindUpper = qRot(qMul(rootRot, qConj(root.rot)), sub(mid.pos, root.pos));
    const bindLower = qRot(qMul(midRot, qConj(mid.rot)), sub(end.pos, mid.pos));
    const swingU = qFromTo(bindUpper, sub(ik.mid, a));
    const swingL = qFromTo(bindLower, sub(ik.end, ik.mid));
    target.set(rootName, qNorm(qMul(swingU, rootRot)));
    target.set(midName, qNorm(qMul(swingL, midRot)));
    const endRot = target.get(endName)!;
    if (midName !== rootName) target.set(endName, endName === r.legL.foot || endName === r.legR.foot ? endRot : qNorm(qMul(swingL, endRot)));
    worldR.set(rootName, target.get(rootName)!);
    solvedPos.set(midName, ik.mid);
    solvedPos.set(endName, ik.end);
    return ik;
  };

  const placed = new Set<string>();
  const placeTree = (filter: (j: Joint) => boolean) => {
    for (const j of rig.order) {
      if (placed.has(j.name) || !filter(j)) continue;
      if (j.parent && !placed.has(j.parent)) continue;
      place(j);
      placed.add(j.name);
    }
  };
  // torso and everything not on a limb chain (fingers / toes come later with their parent)
  placeTree((j) => !limbJoints.has(j.name) && !isUnder(rig, j, limbJoints));

  const handTargetsReached: Record<"L" | "R", V3> = { L: g.palmL, R: g.palmR };
  for (const L of [true, false]) {
    const s = side(L);
    // arms: the wrist target puts the measured palm centroid on the game palm; the second solve uses the hand turn of the first
    place(B(s.arm.upper)); placed.add(s.arm.upper);
    const unswung = (): void => {
      target.set(s.arm.upper, deltaOf(s.arm.upper, s.ua));
      target.set(s.arm.fore, deltaOf(s.arm.fore, s.fa));
      target.set(s.arm.hand, deltaOf(s.arm.hand, s.fa));
    };
    const wristFor = (handRot: Q): V3 => sub(s.palm, qRot(qMul(handRot, qConj(B(s.arm.hand).rot)), s.palmOff));
    solveLimb(s.arm.upper, s.arm.fore, s.arm.hand, wristFor(target.get(s.arm.hand)!), s.elbow);
    const wrist = wristFor(target.get(s.arm.hand)!);
    unswung();
    const ik = solveLimb(s.arm.upper, s.arm.fore, s.arm.hand, wrist, s.elbow);
    handTargetsReached[L ? "L" : "R"] = add(ik.end, qRot(qMul(target.get(s.arm.hand)!, qConj(B(s.arm.hand).rot)), s.palmOff));
    for (const n of [s.arm.fore, s.arm.hand]) { place(B(n)); placed.add(n); }
    // legs
    place(B(s.leg.thigh)); placed.add(s.leg.thigh);
    solveLimb(s.leg.thigh, s.leg.shin, s.leg.foot, add(s.ankle, s.ankleOff), s.knee);
    for (const n of [s.leg.shin, s.leg.foot]) { place(B(n)); placed.add(n); }
  }
  placeTree(() => true);

  // world -> local for every driven joint
  const bones: Record<string, IdolBonePose> = {};
  for (const j of rig.order) {
    const pw = parentWorld(j);
    const P = worldP.get(j.name)!, R = worldR.get(j.name)!;
    const t = scale(qRot(qConj(pw.q), sub(P, pw.p)), 1 / pw.s);
    const q = qNorm(qMul(qConj(pw.q), R));
    bones[j.name] = { position: { x: t[0], y: t[1], z: t[2] }, rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } };
  }
  return {
    bones,
    headPos: worldP.get(r.head)!,
    headDelta: qNorm(qMul(worldR.get(r.head)!, qConj(B(r.head).rot))),
    palmL: handTargetsReached.L,
    palmR: handTargetsReached.R
  };
}

function isUnder(rig: PreparedIdolRig, j: Joint, set: ReadonlySet<string>): boolean {
  let p = j.parent;
  while (p) {
    if (set.has(p)) return true;
    p = rig.byName.get(p)?.parent ?? null;
  }
  return false;
}

/** Model-space world positions of every joint for a pose (forward kinematics of the local result; used by tests). */
export function idolForwardKinematics(rig: PreparedIdolRig, bones: Readonly<Record<string, IdolBonePose>>): Map<string, { pos: V3; rot: Q }> {
  const out = new Map<string, { pos: V3; rot: Q }>();
  const rp = { pos: v3(rig.bind.rootParent.pos), rot: q4(rig.bind.rootParent.rot), scale: rig.bind.rootParent.scale };
  for (const j of rig.order) {
    const pw = j.parent ? { ...out.get(j.parent)!, s: j.parentScale } : { pos: rp.pos, rot: rp.rot, s: rp.scale };
    const b = bones[j.name];
    const t: V3 = b ? [b.position.x, b.position.y, b.position.z] : j.localT;
    const q: Q = b ? [b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w] : j.localR;
    out.set(j.name, { pos: add(pw.pos, scale(qRot(pw.rot, t), pw.s)), rot: qNorm(qMul(pw.rot, q)) });
  }
  return out;
}
