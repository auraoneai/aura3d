/**
 * Aura Links 3D: drive a rigged Idol golfer GLB (unnamed bones bone_0..bone_N) from the procedural swing solve.
 *
 * Game-local equivalent of the shared humanoid helper (apps/showcase-port-shared/idol/ did not exist when this was written).
 *   1. `mapIdolRoles()` assigns humanoid roles from hierarchy + rest positions only: the hips are the joint that branches into
 *      two foot-reaching chains and one upward chain; the chest is the first joint up the spine that branches into two
 *      arm-reaching chains; in each arm / leg chain the two longest consecutive segments are upper-arm + forearm (thigh + shin),
 *      so clavicles before them and finger / toe joints after them fall out of the same rule.
 *   2. `idolProfile()` builds the swing-solve `SkeletonProfile` from those bind positions (exactly like `rigProfile()`), so the
 *      solve uses the Idol body's own arm, torso and leg lengths and the drawn palms land on the solved grip.
 *   3. `retargetIdol()` turns the solved world rotation deltas into local rotations for EVERY joint (world = delta * bindWorld,
 *      local = conj(parentWorld) * world), unmapped joints inheriting their parent's delta; the hips also carry the solved
 *      position, converted into the hips' parent space.
 * Pure (no engine imports): unit tested offline against forward kinematics.
 */
import { RIG_TUNING, PALM_PAST_HAND, type RigBonePose } from "./golferRetarget";
import {
  qConj, qMul, qRotate, unit, vAdd, vLen, vScale, vSub,
  type Quat, type SkeletonProfile, type SolvedDeltas, type SolvedSwing, type V3
} from "./swingMath";

export interface IdolBindJoint {
  readonly name: string;
  readonly parent: string | null;
  readonly pos: readonly number[];
  readonly rot: readonly number[];
  readonly scale: number;
  /** world transform of a top joint's (non-joint) parent node */
  readonly parentWorld?: { readonly pos: readonly number[]; readonly rot: readonly number[]; readonly scale: number };
  /** smallest-variance axis of the vertices this joint dominates (palm normal for the hands) */
  readonly axis?: readonly number[];
}

export interface IdolRigBind {
  readonly clips: readonly string[];
  readonly joints: readonly IdolBindJoint[];
}

export type IdolRole =
  | "hips" | "spine" | "chest" | "neck" | "head"
  | "clavicleL" | "upperArmL" | "foreArmL" | "handL"
  | "clavicleR" | "upperArmR" | "foreArmR" | "handR"
  | "thighL" | "shinL" | "footL" | "toeL"
  | "thighR" | "shinR" | "footR" | "toeR";

export interface IdolRoleMap {
  readonly hips: string;
  /** lowest spine joint (the virtual "Spine"); `spineExtra` are the joints between it and the chest */
  readonly spine: string;
  readonly spineExtra: readonly string[];
  readonly chest: string;
  readonly neck: string | null;
  readonly head: string;
  readonly clavicleL: readonly string[]; readonly upperArmL: string; readonly foreArmL: string; readonly handL: string;
  readonly clavicleR: readonly string[]; readonly upperArmR: string; readonly foreArmR: string; readonly handR: string;
  readonly thighL: string; readonly shinL: string; readonly footL: string; readonly toeL: string | null;
  readonly thighR: string; readonly shinR: string; readonly footR: string; readonly toeR: string | null;
}

const v3 = (a: readonly number[]): V3 => [a[0]!, a[1]!, a[2]!];
const q4 = (a: readonly number[]): Quat => ({ x: a[0]!, y: a[1]!, z: a[2]!, w: a[3]! });
const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};
const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const s = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  if (dot > 0.9995) {
    return qNorm({ x: a.x + (b.x * s - a.x) * t, y: a.y + (b.y * s - a.y) * t, z: a.z + (b.z * s - a.z) * t, w: a.w + (b.w * s - a.w) * t });
  }
  const th = Math.acos(dot);
  const sn = Math.sin(th) || 1;
  const wa = Math.sin((1 - t) * th) / sn;
  const wb = (Math.sin(t * th) / sn) * s;
  return qNorm({ x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb, w: a.w * wa + b.w * wb });
};

/** cached per-bind indexes */
interface BindIndex {
  readonly byName: Map<string, IdolBindJoint>;
  readonly children: Map<string, IdolBindJoint[]>;
  readonly minY: Map<string, number>;
  readonly maxY: Map<string, number>;
  readonly maxAbsX: Map<string, number>;
}
const indexCache = new WeakMap<IdolRigBind, BindIndex>();
function indexOf(bind: IdolRigBind): BindIndex {
  const hit = indexCache.get(bind);
  if (hit) return hit;
  const byName = new Map(bind.joints.map((j) => [j.name, j]));
  const children = new Map<string, IdolBindJoint[]>();
  for (const j of bind.joints) if (j.parent) (children.get(j.parent) ?? children.set(j.parent, []).get(j.parent)!).push(j);
  const minY = new Map<string, number>(), maxY = new Map<string, number>(), maxAbsX = new Map<string, number>();
  const visit = (j: IdolBindJoint): void => {
    let lo = j.pos[1]!, hi = j.pos[1]!, ax = Math.abs(j.pos[0]!);
    for (const c of children.get(j.name) ?? []) {
      visit(c);
      lo = Math.min(lo, minY.get(c.name)!); hi = Math.max(hi, maxY.get(c.name)!); ax = Math.max(ax, maxAbsX.get(c.name)!);
    }
    minY.set(j.name, lo); maxY.set(j.name, hi); maxAbsX.set(j.name, ax);
  };
  for (const j of bind.joints) if (!j.parent) visit(j);
  const idx = { byName, children, minY, maxY, maxAbsX };
  indexCache.set(bind, idx);
  return idx;
}

/** follow a limb from `start`: at each joint take the child whose subtree reaches furthest along `reach` */
function limbChain(idx: BindIndex, start: IdolBindJoint, reach: (j: IdolBindJoint) => number): IdolBindJoint[] {
  const chain = [start];
  let cur = start;
  for (;;) {
    const kids = idx.children.get(cur.name) ?? [];
    if (!kids.length) break;
    cur = kids.reduce((a, b) => (reach(b) > reach(a) ? b : a));
    chain.push(cur);
  }
  return chain;
}

/** index k of the two longest consecutive segments chain[k]->chain[k+1]->chain[k+2] */
function longestPair(chain: readonly IdolBindJoint[]): number {
  let best = 0, bestLen = -1;
  for (let k = 0; k + 2 < chain.length; k++) {
    const a = vLen(vSub(v3(chain[k + 1]!.pos), v3(chain[k]!.pos)));
    const b = vLen(vSub(v3(chain[k + 2]!.pos), v3(chain[k + 1]!.pos)));
    if (Math.min(a, b) > bestLen) { bestLen = Math.min(a, b); best = k; }
  }
  return best;
}

const roleCache = new WeakMap<IdolRigBind, IdolRoleMap>();

/** humanoid roles of an Idol T-pose skeleton (faces +Z, the character's left at +X, feet at y = 0) */
export function mapIdolRoles(bind: IdolRigBind): IdolRoleMap {
  const hit = roleCache.get(bind);
  if (hit) return hit;
  const idx = indexOf(bind);
  const height = Math.max(...bind.joints.map((j) => j.pos[1]!));
  const footY = Math.min(...bind.joints.map((j) => j.pos[1]!)) + height * 0.15;
  const reachesFoot = (j: IdolBindJoint) => idx.minY.get(j.name)! < footY;
  const hips = bind.joints.find((j) => {
    const kids = idx.children.get(j.name) ?? [];
    return kids.filter(reachesFoot).length >= 2 && kids.some((c) => idx.maxY.get(c.name)! > j.pos[1]! + height * 0.2);
  });
  if (!hips) throw new Error("mapIdolRoles: no hips (joint branching into two legs and a spine)");
  const hipKids = idx.children.get(hips.name)!;
  const legs = hipKids.filter(reachesFoot).sort((a, b) => b.pos[0]! - a.pos[0]!);
  const up = hipKids.filter((c) => !reachesFoot(c)).reduce((a, b) => (idx.maxY.get(b.name)! > idx.maxY.get(a.name)! ? b : a));

  // spine: climb until a joint branches into two arm-reaching chains
  const armReach = height * 0.3;
  const spineJoints: IdolBindJoint[] = [];
  let chest: IdolBindJoint | undefined;
  for (let cur: IdolBindJoint | undefined = up; cur; ) {
    const kids: IdolBindJoint[] = idx.children.get(cur.name) ?? [];
    const lateral = kids.filter((c) => idx.maxAbsX.get(c.name)! > armReach);
    if (lateral.length >= 2) { chest = cur; break; }
    spineJoints.push(cur);
    cur = kids.length ? kids.reduce((a: IdolBindJoint, b: IdolBindJoint) => (idx.maxY.get(b.name)! > idx.maxY.get(a.name)! ? b : a)) : undefined;
  }
  if (!chest) throw new Error("mapIdolRoles: no chest (joint branching into two arms)");
  const chestKids = idx.children.get(chest.name)!;
  const arms = chestKids.filter((c) => idx.maxAbsX.get(c.name)! > armReach);
  const armL = arms.reduce((a, b) => (b.pos[0]! > a.pos[0]! ? b : a));
  const armR = arms.reduce((a, b) => (b.pos[0]! < a.pos[0]! ? b : a));
  const neckRoot = chestKids.filter((c) => !arms.includes(c)).reduce<IdolBindJoint | undefined>(
    (a, b) => (!a || idx.maxY.get(b.name)! > idx.maxY.get(a.name)! ? b : a), undefined);
  if (!neckRoot) throw new Error("mapIdolRoles: no neck/head chain above the chest");
  const headChain = limbChain(idx, neckRoot, (j) => idx.maxY.get(j.name)!);
  // the head joint is the chain joint closest to the jaw line (~ 87% of the height); anything below it is neck
  const headIdx = headChain.length === 1 ? 0 : Math.max(1, headChain.findIndex((j) => j.pos[1]! > height * 0.84));
  const head = headChain[headIdx < 0 ? headChain.length - 1 : headIdx]!;
  const neck = headChain[0] !== head ? headChain[0]! : null;

  const arm = (start: IdolBindJoint) => {
    const chain = limbChain(idx, start, (j) => idx.maxAbsX.get(j.name)!);
    const k = longestPair(chain);
    if (k + 2 >= chain.length) throw new Error("mapIdolRoles: arm chain too short");
    return { clav: chain.slice(0, k).map((j) => j.name), upper: chain[k]!.name, fore: chain[k + 1]!.name, hand: chain[k + 2]!.name };
  };
  const leg = (start: IdolBindJoint) => {
    const chain = limbChain(idx, start, (j) => -idx.minY.get(j.name)!);
    const k = longestPair(chain);
    if (k + 2 >= chain.length) throw new Error("mapIdolRoles: leg chain too short");
    const toe = chain[k + 3] ?? null;
    return { thigh: chain[k]!.name, shin: chain[k + 1]!.name, foot: chain[k + 2]!.name, toe: toe?.name ?? null };
  };
  const aL = arm(armL), aR = arm(armR), lL = leg(legs[0]!), lR = leg(legs[legs.length - 1]!);
  const map: IdolRoleMap = {
    hips: hips.name,
    spine: (spineJoints[0] ?? chest).name,
    spineExtra: spineJoints.slice(1).map((j) => j.name),
    chest: chest.name,
    neck: neck?.name ?? null,
    head: head.name,
    clavicleL: aL.clav, upperArmL: aL.upper, foreArmL: aL.fore, handL: aL.hand,
    clavicleR: aR.clav, upperArmR: aR.upper, foreArmR: aR.fore, handR: aR.hand,
    thighL: lL.thigh, shinL: lL.shin, footL: lL.foot, toeL: lL.toe,
    thighR: lR.thigh, shinR: lR.shin, footR: lR.foot, toeR: lR.toe
  };
  roleCache.set(bind, map);
  return map;
}

const P = (bind: IdolRigBind, name: string): V3 => {
  const j = indexOf(bind).byName.get(name);
  if (!j) throw new Error(`idolHumanoid: joint ${name} missing`);
  return v3(j.pos);
};

/** height the game gives the golfer (m): the Idol GLBs are normalised to it, so the fit scale is 1 */
export const IDOL_GOLFER_HEIGHT = 1.84;

const profileCache = new WeakMap<IdolRigBind, SkeletonProfile>();

/** the Idol golfer's proportions as a swing-solve skeleton (GLB space, metres) */
export function idolProfile(bind: IdolRigBind, id = "linksIdolGolfer"): SkeletonProfile {
  const hit = profileCache.get(bind);
  if (hit) return hit;
  const r = mapIdolRoles(bind);
  const p = (n: string) => P(bind, n);
  const hips = p(r.hips);
  const legSide = (up: string, knee: string, ankle: string) => ({
    thigh: vLen(vSub(p(knee), p(up))), shin: vLen(vSub(p(ankle), p(knee))),
    thighBind: unit(vSub(p(knee), p(up))), shinBind: unit(vSub(p(ankle), p(knee)))
  });
  const palm = (fore: string, hand: string): V3 => {
    const v = vSub(p(hand), p(fore));
    return vScale(v, (vLen(v) + PALM_PAST_HAND) / vLen(v));
  };
  const l = legSide(r.thighL, r.shinL, r.footL);
  const rr = legSide(r.thighR, r.shinR, r.footR);
  const handAxis = indexOf(bind).byName.get(r.handR)?.axis;
  const spineTop = r.spine === r.chest ? vAdd(hips, vScale(vSub(p(r.chest), hips), 0.5)) : p(r.spine);
  const oldFit = 1.84 / 1.897;
  const prof: SkeletonProfile = {
    id,
    rig: {
      hipsBind: hips,
      tSpine: vSub(spineTop, hips),
      tChest: vSub(p(r.chest), spineTop),
      tHead: vSub(p(r.head), p(r.chest)),
      tShoulderL: vSub(p(r.upperArmL), p(r.chest)),
      tShoulderR: vSub(p(r.upperArmR), p(r.chest)),
      tForearmL: vSub(p(r.foreArmL), p(r.upperArmL)),
      tForearmR: vSub(p(r.foreArmR), p(r.upperArmR)),
      palmL: palm(r.foreArmL, r.handL),
      palmR: palm(r.foreArmR, r.handR)
    },
    leg: {
      thighL: l.thigh, shinL: l.shin, thighR: rr.thigh, shinR: rr.shin,
      hipJointL: vSub(p(r.thighL), hips), hipJointR: vSub(p(r.thighR), hips),
      thighBindL: l.thighBind, shinBindL: l.shinBind, thighBindR: rr.thighBind, shinBindR: rr.shinBind,
      ankleL: p(r.footL), ankleR: p(r.footR),
      ...(r.toeL ? { toeL: p(r.toeL) } : {}), ...(r.toeR ? { toeR: p(r.toeR) } : {}),
      crouch: RIG_TUNING.crouch, hipsBack: RIG_TUNING.hipsBack, hipsSide: RIG_TUNING.hipsSide
    },
    fitScale: 1,
    clubScale: oldFit,
    flexScale: RIG_TUNING.flexScale,
    anatomic: true,
    // T-pose palms face down on the Idol references; the hand's own vertex spread (smallest-variance axis, signed palm-down /
    // palm-forward by the extractor) only overrides that when it is clearly a palm plane (not a wrist slab across the arm)
    palmNormalBind: handAxis && Math.abs(handAxis[0]!) < 0.5 ? unit(v3(handAxis)) : [0, -1, 0]
  };
  profileCache.set(bind, prof);
  return prof;
}

type Drive = keyof SolvedDeltas | "bind" | "inherit" | { readonly blend: readonly [keyof SolvedDeltas, keyof SolvedDeltas, number] };

const driveCache = new WeakMap<IdolRigBind, Map<string, Drive>>();
/** what drives every joint: a solved delta, a blend of two, the bind world rotation, or the parent's delta */
export function idolDriveTable(bind: IdolRigBind): Map<string, Drive> {
  const hit = driveCache.get(bind);
  if (hit) return hit;
  const r = mapIdolRoles(bind);
  const m = new Map<string, Drive>();
  m.set(r.hips, "hips");
  m.set(r.spine, r.spine === r.chest ? "chest" : "spine");
  for (const n of r.spineExtra) m.set(n, "spine");
  m.set(r.chest, "chest");
  if (r.neck) m.set(r.neck, { blend: ["chest", "head", 0.5] });
  m.set(r.head, "head");
  for (const n of r.clavicleL) m.set(n, "chest");
  for (const n of r.clavicleR) m.set(n, "chest");
  m.set(r.upperArmL, "upperArmL"); m.set(r.foreArmL, "foreArmL"); m.set(r.handL, "foreArmL");
  m.set(r.upperArmR, "upperArmR"); m.set(r.foreArmR, "foreArmR"); m.set(r.handR, "foreArmR");
  m.set(r.thighL, "thighL"); m.set(r.shinL, "shinL"); m.set(r.footL, "footL");
  m.set(r.thighR, "thighR"); m.set(r.shinR, "shinR"); m.set(r.footR, "footR");
  if (r.toeL) m.set(r.toeL, "footL");
  if (r.toeR) m.set(r.toeR, "footR");
  // joints above the hips (armature roots) keep their bind; everything else unmapped follows its parent
  const idx = indexOf(bind);
  const above = new Set<string>();
  for (let j = idx.byName.get(r.hips)!.parent; j; j = idx.byName.get(j)?.parent ?? null) above.add(j);
  for (const j of bind.joints) if (!m.has(j.name)) m.set(j.name, above.has(j.name) ? "bind" : "inherit");
  driveCache.set(bind, m);
  return m;
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Pose for the Idol skeleton from one solved swing: local rotation for every joint (replace mode), plus the hips' local
 * position. `deltas` may be any SolvedDeltas (e.g. a hand-authored celebrate pose); `hipsPos` is in GLB space.
 */
export function retargetIdol(bind: IdolRigBind, solved: Pick<SolvedSwing, "deltas" | "hipsPos">): Record<string, RigBonePose> {
  const idx = indexOf(bind);
  const drive = idolDriveTable(bind);
  const delta = new Map<string, Quat>();
  const deltaOf = (name: string): Quat => {
    const hit = delta.get(name);
    if (hit) return hit;
    const d = drive.get(name) ?? "inherit";
    let q: Quat;
    if (d === "bind") q = IDENTITY;
    else if (d === "inherit") { const par = idx.byName.get(name)!.parent; q = par ? deltaOf(par) : IDENTITY; }
    else if (typeof d === "object") q = qSlerp(solved.deltas[d.blend[0]] ?? IDENTITY, solved.deltas[d.blend[1]] ?? IDENTITY, d.blend[2]);
    else q = solved.deltas[d] ?? IDENTITY;
    delta.set(name, q);
    return q;
  };
  const world = new Map<string, Quat>();
  const worldOf = (name: string): Quat => {
    const hit = world.get(name);
    if (hit) return hit;
    const w = qNorm(qMul(deltaOf(name), q4(idx.byName.get(name)!.rot)));
    world.set(name, w);
    return w;
  };
  const out: Record<string, RigBonePose> = {};
  for (const j of bind.joints) {
    const parentRot = j.parent ? worldOf(j.parent) : j.parentWorld ? q4(j.parentWorld.rot) : IDENTITY;
    out[j.name] = { rotation: qNorm(qMul(qConj(parentRot), worldOf(j.name))) };
  }
  // hips position: GLB-space point -> hips parent space
  const r = mapIdolRoles(bind);
  const hipsJ = idx.byName.get(r.hips)!;
  const pw = hipsParentWorld(bind);
  const local = vScale(qRotate(qConj(pw.rot), vSub(solved.hipsPos, pw.pos)), 1 / pw.scale);
  out[r.hips] = { rotation: out[r.hips]!.rotation, position: { x: local[0], y: local[1], z: local[2] } };
  void hipsJ;
  return out;
}

function hipsParentWorld(bind: IdolRigBind): { pos: V3; rot: Quat; scale: number } {
  const idx = indexOf(bind);
  const hipsJ = idx.byName.get(mapIdolRoles(bind).hips)!;
  if (hipsJ.parent) {
    const p = idx.byName.get(hipsJ.parent)!;
    return { pos: v3(p.pos), rot: q4(p.rot), scale: p.scale };
  }
  const pw = hipsJ.parentWorld;
  return pw ? { pos: v3(pw.pos), rot: q4(pw.rot), scale: pw.scale } : { pos: [0, 0, 0], rot: IDENTITY, scale: 1 };
}

/**
 * Forward kinematics of an Idol pose (what the engine's skeleton evaluates): GLB-space world position and rotation of every
 * joint. Joints the pose does not write keep their bind local transform.
 */
export function idolForwardKinematics(bind: IdolRigBind, pose: Readonly<Record<string, RigBonePose>>): Map<string, { pos: V3; rot: Quat }> {
  const idx = indexOf(bind);
  const out = new Map<string, { pos: V3; rot: Quat; scale: number }>();
  for (const j of bind.joints) {
    const par = j.parent
      ? out.get(j.parent)!
      : j.parentWorld ? { pos: v3(j.parentWorld.pos), rot: q4(j.parentWorld.rot), scale: j.parentWorld.scale } : { pos: [0, 0, 0] as V3, rot: IDENTITY, scale: 1 };
    const parBind = j.parent
      ? { pos: v3(idx.byName.get(j.parent)!.pos), rot: q4(idx.byName.get(j.parent)!.rot), scale: idx.byName.get(j.parent)!.scale }
      : par;
    const bindLocalT = vScale(qRotate(qConj(parBind.rot), vSub(v3(j.pos), parBind.pos)), 1 / parBind.scale);
    const p = pose[j.name];
    const localT: V3 = p?.position ? [p.position.x, p.position.y, p.position.z] : bindLocalT;
    const localR = p?.rotation ?? qMul(qConj(parBind.rot), q4(j.rot));
    out.set(j.name, { pos: vAdd(par.pos, vScale(qRotate(par.rot, localT), par.scale)), rot: qNorm(qMul(par.rot, localR)), scale: j.scale });
  }
  return out as Map<string, { pos: V3; rot: Quat }>;
}
