/**
 * Aura Links 3D: text-to-motion clips (fal.ai hunyuan-motion, tools/idol/motion-specs/aura-links-3d.json -> motion.generated.ts)
 * on the Idol golfer and caddie, with the swing solve as the club / contact authority and an arm IK overlay.
 *
 *  - Address / idle: the Address waggle loop. Walk (re-aiming): the Shuffle loop. Celebrate: the Celebrate loop (club hidden).
 *  - Full swing: the Swing clip, time-warped on its own key frames (top, impact, finish, found from the hands at load) so
 *    backswing 0..1 = start..top, downswing 0..1 = top..impact and follow 0..1 = impact..finish: the clip's impact frame
 *    lands exactly on downswing t = 1, the solve's (and the sim's) contact. The backswing cross-fades in from the waggle.
 *  - Putt: the Putt clip warped the same way (back = hands furthest from the target, impact = hands back over the ball at
 *    putt-through t = 0.5).
 *  - The club always stays on the solve; both arms are re-solved with two-bone IK from the clip's shoulders onto the
 *    solve's grip and lead-palm points (keeping the solve's elbow direction and forearm roll). Where the clip's shoulders
 *    would leave the grip out of reach, the torso blends toward the solve's just enough (smooth per-rig weight curve).
 *  - Caddie: the CaddieIdle loop.
 * Canonical clip -> solve deltas: Idol world = G_src * A * R_rest (humanoid.ts rule; A turns the T-pose limbs to hang), and
 * retargetIdol takes world = delta * R_rest, so delta = G_src * A. Pure (no engine imports): unit tested offline.
 */
import {
  blendHumanoidPoses,
  mirrorHumanoidPose,
  quatMul,
  sampleHumanoidClip,
  type HumanoidClip,
  type HumanoidPoseInput,
  type HumanoidRole,
  type Quat as TQuat
} from "@aura3d/engine/animation";
import { MOTION_CLIPS, type MotionClipName } from "./motion.generated";
import {
  createLinksHumanoidAnimator,
  idolForwardKinematics,
  idolProfile,
  layerGolferArms,
  mapIdolRoles,
  retargetIdol,
  type IdolRigBind
} from "./idolHumanoid";
import {
  evaluateSwing, qFromTo, qMul, qRotate, solveSwing, toModel, unit, vAdd, vCross, vDot, vLen, vScale, vSub,
  type Quat, type RootFrame, type SolvedDeltas, type SolvedSwing, type SwingPosePhase, type V3
} from "./swingMath";

export type GolferMotionPhase = SwingPosePhase | "walk";
/** which clip plays the body in each solve phase */
export function clipForPhase(phase: GolferMotionPhase | "celebrate"): MotionClipName {
  switch (phase) {
    case "address": case "idle": return "Address";
    case "backswing": case "top": case "downswing": case "follow": return "Swing";
    case "putt-address": case "putt-back": case "putt-through": return "Putt";
    case "walk": return "Shuffle";
    case "celebrate": return "Celebrate";
  }
}

const tq = (q: TQuat): Quat => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
const ID: TQuat = [0, 0, 0, 1];
const PARENT: Readonly<Partial<Record<HumanoidRole, HumanoidRole>>> = {
  spine: "hips", chest: "spine", neck: "chest", head: "neck",
  leftShoulder: "chest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "chest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg",
  rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg"
};

const alignCache = new WeakMap<IdolRigBind, Record<string, Quat>>();
/** A per limb: the turn that points the Idol T-pose limb straight down (humanoid.ts limbAlignments) */
function limbAlign(bind: IdolRigBind): Record<string, Quat> {
  const hit = alignCache.get(bind);
  if (hit) return hit;
  const r = mapIdolRoles(bind);
  const P = (n: string): V3 => { const j = bind.joints.find((x) => x.name === n)!; return [j.pos[0]!, j.pos[1]!, j.pos[2]!]; };
  const down = (a: string, b: string) => qFromTo(unit(vSub(P(b), P(a))), [0, -1, 0]);
  const out = {
    upperArmL: down(r.upperArmL, r.foreArmL), foreArmL: down(r.foreArmL, r.handL),
    upperArmR: down(r.upperArmR, r.foreArmR), foreArmR: down(r.foreArmR, r.handR),
    thighL: down(r.thighL, r.shinL), shinL: down(r.shinL, r.footL),
    thighR: down(r.thighR, r.shinR), shinR: down(r.shinR, r.footR)
  };
  alignCache.set(bind, out);
  return out;
}

/** a canonical clip pose -> the deltas + hips position retargetIdol takes, on this Idol body */
export function canonToDeltas(bind: IdolRigBind, pose: HumanoidPoseInput): { deltas: SolvedDeltas; hipsPos: V3 } {
  const G: Partial<Record<HumanoidRole, TQuat>> = {};
  const g = (role: HumanoidRole): TQuat => {
    const hit = G[role];
    if (hit) return hit;
    const local = pose.rotations[role] ?? ID;
    const p = PARENT[role];
    const w = p ? quatMul(g(p), local) : local;
    G[role] = w;
    return w;
  };
  const A = limbAlign(bind);
  const prof = idolProfile(bind);
  const h = pose.hipsOffset ?? [0, 0, 0];
  const hipH = prof.rig.hipsBind[1];
  return {
    hipsPos: [prof.rig.hipsBind[0] + h[0] * hipH, prof.rig.hipsBind[1] + h[1] * hipH, prof.rig.hipsBind[2] + h[2] * hipH],
    deltas: {
      hips: tq(g("hips")), spine: tq(g("spine")), chest: tq(g("chest")), head: tq(g("head")),
      upperArmL: qMul(tq(g("leftUpperArm")), A.upperArmL!), foreArmL: qMul(tq(g("leftLowerArm")), A.foreArmL!),
      upperArmR: qMul(tq(g("rightUpperArm")), A.upperArmR!), foreArmR: qMul(tq(g("rightLowerArm")), A.foreArmR!),
      thighL: qMul(tq(g("leftUpperLeg")), A.thighL!), shinL: qMul(tq(g("leftLowerLeg")), A.shinL!),
      thighR: qMul(tq(g("rightUpperLeg")), A.thighR!), shinR: qMul(tq(g("rightLowerLeg")), A.shinR!),
      footL: tq(g("leftFoot")), footR: tq(g("rightFoot"))
    }
  };
}

/* ------------------------------------------------------------------ *
 *  Clip analysis: handedness and key frames, from the hands           *
 * ------------------------------------------------------------------ */

export interface StrokeKeys {
  /** play the clip mirrored (the generated golfer swung toward -X, not toward the target at +X) */
  readonly mirror: boolean;
  readonly start: number; readonly top: number; readonly impact: number; readonly end: number;
}

const handsAt = (bind: IdolRigBind, pose: HumanoidPoseInput): V3 => {
  const r = mapIdolRoles(bind);
  const fk = idolForwardKinematics(bind, retargetIdol(bind, canonToDeltas(bind, pose)));
  const a = fk.get(r.handL)!.pos, b = fk.get(r.handR)!.pos;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};

const keysCache = new Map<string, StrokeKeys>();
/**
 * Swing: top = highest hands before the strike, impact = lowest hands after the top, end = highest hands after impact
 * (+0.4 s hold). Putt: top (end of the backstroke) = hands furthest from the target, impact = hands back over their
 * address x after it, end = clip end. Handedness: at the top the hands must be on the golfer's right (-X).
 */
export function strokeKeys(name: "Swing" | "Putt", bind: IdolRigBind): StrokeKeys {
  const ck = `${name}`;
  const hit = keysCache.get(ck);
  if (hit) return hit;
  const clip = MOTION_CLIPS[name];
  const n = Math.max(2, Math.round(clip.duration * clip.fps));
  const ts = Array.from({ length: n + 1 }, (_, i) => (i / n) * clip.duration);
  const hands = ts.map((t) => handsAt(bind, sampleHumanoidClip(clip, t, { loop: false })));
  let keys: StrokeKeys;
  // the stroke starts when the hands first leave their address spot (the clips open with a still set-up)
  let start = 0;
  while (start < hands.length - 1 && Math.hypot(hands[start + 1]![0] - hands[0]![0], hands[start + 1]![1] - hands[0]![1]) < 0.03) start++;
  start = Math.max(0, start - 3);
  if (name === "Swing") {
    // top: the first height peak of the hands above 1.4 m (the clip may wind up twice; the first swing is the one used)
    let top = start;
    for (let i = start; i < hands.length; i++) {
      if (hands[i]![1] > hands[top]![1]) top = i;
      if (hands[top]![1] > 1.4 && hands[i]![1] < hands[top]![1] - 0.15) break;
    }
    // impact: the lowest hands on the way down; end: the finish peak after it (+0.3 s hold)
    let impact = top;
    for (let i = top; i < hands.length; i++) { if (hands[i]![1] < hands[impact]![1]) impact = i; if (hands[i]![1] > hands[impact]![1] + 0.2) break; }
    let fin = impact;
    for (let i = impact; i < hands.length && ts[i]! - ts[impact]! < 0.9; i++) if (hands[i]![1] > hands[fin]![1]) fin = i;
    // handedness: a right-handed backswing takes the hands to the golfer's right (-X)
    let dx = 0;
    for (let i = start; i <= top; i++) dx += hands[i]![0] - hands[start]![0];
    keys = { mirror: dx > 0, start: ts[start]!, top: ts[top]!, impact: ts[impact]!, end: Math.min(clip.duration, ts[fin]! + 0.3) };
  } else {
    // backstroke end: hands furthest from their address x; impact: hands back over that x; end: clip end
    let away = start;
    for (let i = start; i < hands.length * 0.85; i++) if (Math.abs(hands[i]![0] - hands[start]![0]) > Math.abs(hands[away]![0] - hands[start]![0])) away = i;
    const mirror = hands[away]![0] > hands[start]![0];
    let impact = away;
    for (let i = away; i < hands.length; i++) { impact = i; if ((hands[i]![0] - hands[start]![0]) * (hands[away]![0] - hands[start]![0]) <= 0) break; }
    keys = { mirror, start: ts[start]!, top: ts[away]!, impact: ts[impact]!, end: clip.duration };
  }
  keysCache.set(ck, keys);
  return keys;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** clip time (s) for a stroke phase and its 0..1 progress */
export function strokeTime(phase: GolferMotionPhase, t: number, bind: IdolRigBind): number {
  if (phase === "backswing" || phase === "top" || phase === "downswing" || phase === "follow") {
    const k = strokeKeys("Swing", bind);
    return phase === "backswing" ? lerp(k.start, k.top, t) : phase === "top" ? k.top : phase === "downswing" ? lerp(k.top, k.impact, t) : lerp(k.impact, k.end, t);
  }
  if (phase === "putt-address" || phase === "putt-back" || phase === "putt-through") {
    const k = strokeKeys("Putt", bind);
    return phase === "putt-address" ? k.start : phase === "putt-back" ? lerp(k.start, k.top, t)
      : t <= 0.5 ? lerp(k.top, k.impact, t / 0.5) : lerp(k.impact, k.end, (t - 0.5) / 0.5);
  }
  return 0;
}

/** the canonical body pose for a phase: `t` = phase progress (strokes), `clock` = seconds (loops) */
export function golferClipPose(phase: GolferMotionPhase | "celebrate", t: number, clock: number, bind: IdolRigBind): HumanoidPoseInput {
  const name = clipForPhase(phase);
  const clip: HumanoidClip = MOTION_CLIPS[name];
  if (name === "Swing" || name === "Putt") {
    const k = strokeKeys(name, bind);
    let p = sampleHumanoidClip(clip, strokeTime(phase as GolferMotionPhase, t, bind), { loop: false });
    if (k.mirror) p = mirrorHumanoidPose(p);
    // the takeaway cross-fades in from the waggle loop
    if (phase === "backswing" && t < 0.3) {
      const s = t / 0.3;
      p = blendHumanoidPoses(sampleHumanoidClip(MOTION_CLIPS.Address, clock), p, s * s * (3 - 2 * s));
    }
    return p;
  }
  return sampleHumanoidClip(clip, clock);
}

/* ------------------------------------------------------------------ *
 *  Arm IK overlay onto the solve's grip                               *
 * ------------------------------------------------------------------ */

const SEGMENTS = ["hips", "spine", "chest", "head", "upperArmL", "foreArmL", "upperArmR", "foreArmR", "thighL", "shinL", "thighR", "shinR", "footL", "footR"] as const;
const slerp = (a: Quat, b: Quat, t: number): Quat => {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sgn = d < 0 ? -1 : 1;
  d = Math.abs(d);
  let wa = 1 - t, wb = t * sgn;
  if (d < 0.9995) {
    const th = Math.acos(Math.min(1, d)), sn = Math.sin(th);
    wa = Math.sin((1 - t) * th) / sn;
    wb = (Math.sin(t * th) / sn) * sgn;
  }
  const r = { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb, w: a.w * wa + b.w * wb };
  const l = Math.hypot(r.x, r.y, r.z, r.w) || 1;
  return { x: r.x / l, y: r.y / l, z: r.z / l, w: r.w / l };
};
const IDQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
type Body = { deltas: SolvedDeltas; hipsPos: V3 };
/** clip weight of the body at address / idle / walk (the rest is the solve's set-up posture) */
export const ADDRESS_CLIP_WEIGHT = 0.1;
const UPPER_BODY: ReadonlySet<string> = new Set(["hips", "spine", "chest", "head"]);
/** slerp the solve toward the clip body by `w`; with `only`, the other segments (the stepping legs) stay on the clip */
const blendBody = (solved: SolvedSwing, body: Body, w: number, only?: ReadonlySet<string>): Body => {
  const d: Record<string, Quat> = {};
  const sd = solved.deltas as unknown as Record<string, Quat | undefined>, bd = body.deltas as unknown as Record<string, Quat | undefined>;
  for (const seg of SEGMENTS) d[seg] = only && !only.has(seg) ? (bd[seg] ?? IDQ) : slerp(sd[seg] ?? IDQ, bd[seg] ?? IDQ, w);
  return { deltas: d as unknown as SolvedDeltas, hipsPos: [0, 1, 2].map((c) => solved.hipsPos[c]! * (1 - w) + body.hipsPos[c]! * w) as V3 };
};

function reachDeficit(bind: IdolRigBind, body: Body, solved: SolvedSwing, root: RootFrame): number {
  const roles = mapIdolRoles(bind), prof = idolProfile(bind);
  const fk = idolForwardKinematics(bind, retargetIdol(bind, body));
  const over = (upper: string, tFore: V3, palm: V3, target: V3) => Math.max(0, vLen(vSub(target, fk.get(upper)!.pos)) - (vLen(tFore) + vLen(palm)) + 0.005);
  return Math.max(
    over(roles.upperArmR, prof.rig.tForearmR, prof.rig.palmR, toModel(root, solved.grip)),
    over(roles.upperArmL, prof.rig.tForearmL, prof.rig.palmL, toModel(root, solved.leftPalm))
  );
}
function maxReachableWeight(bind: IdolRigBind, solved: SolvedSwing, body: Body, root: RootFrame, hiW = 1, only?: ReadonlySet<string>): number {
  if (reachDeficit(bind, blendBody(solved, body, hiW, only), solved, root) <= 0) return hiW;
  let lo = 0, hi = hiW;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (reachDeficit(bind, blendBody(solved, body, mid, only), solved, root) > 0) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** stroke clocks: swing address 0 .. backswing 0-1 .. downswing 1-2 .. follow 2-3; putt address 0 .. back 0-1 .. through 1-2 */
export function strokeTimeline(phase: GolferMotionPhase, t: number): { stroke: "Swing" | "Putt" | null; x: number } {
  const u = Math.min(1, Math.max(0, t));
  switch (phase) {
    case "backswing": return { stroke: "Swing", x: u };
    case "top": return { stroke: "Swing", x: 1 };
    case "downswing": return { stroke: "Swing", x: 1 + u };
    case "follow": return { stroke: "Swing", x: 2 + u };
    case "putt-address": return { stroke: "Putt", x: 0 };
    case "putt-back": return { stroke: "Putt", x: u };
    case "putt-through": return { stroke: "Putt", x: 1 + u };
    default: return { stroke: null, x: 0 };
  }
}
const fromTimeline = (stroke: "Swing" | "Putt", x: number): [GolferMotionPhase, number] =>
  stroke === "Swing"
    ? (x <= 1 ? ["backswing", x] : x <= 2 ? ["downswing", x - 1] : ["follow", Math.min(1, x - 2)])
    : (x <= 1 ? ["putt-back", x] : ["putt-through", Math.min(1, x - 1)]);

const SAMPLES = 61;
const curveCache = new Map<string, number[]>();
function weightCurve(bind: IdolRigBind, root: RootFrame, stroke: "Swing" | "Putt", key: string): number[] {
  const ck = `${key}:${stroke}`;
  const hit = curveCache.get(ck);
  if (hit) return hit;
  const span = stroke === "Swing" ? 3 : 2;
  const raw: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const [phase, t] = fromTimeline(stroke, (i / (SAMPLES - 1)) * span);
    const solved = solveSwing(evaluateSwing(phase as SwingPosePhase, t), root);
    raw.push(maxReachableWeight(bind, solved, canonToDeltas(bind, golferClipPose(phase, t, 0, bind)), root));
  }
  const eroded = raw.map((_, i) => Math.min(...raw.slice(Math.max(0, i - 4), i + 5)));
  const curve = eroded.map((_, i) => { const w = eroded.slice(Math.max(0, i - 2), i + 3); return w.reduce((a, b) => a + b, 0) / w.length; });
  curveCache.set(ck, curve);
  return curve;
}
const sampleCurve = (c: readonly number[], x: number, span: number) => {
  const f = Math.min(SAMPLES - 1, Math.max(0, (x / span) * (SAMPLES - 1)));
  const i = Math.min(SAMPLES - 2, Math.floor(f));
  return c[i]! + (c[i + 1]! - c[i]!) * (f - i);
};

function elbowFor(S: V3, P: V3, a: number, b: number, pole: V3): V3 {
  const toP = vSub(P, S);
  const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, vLen(toP)));
  const dir = unit(toP);
  const ang = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const pr = vSub(pole, vScale(dir, vDot(pole, dir)));
  const perp = vLen(pr) > 1e-6 ? unit(pr) : unit(vCross(dir, [0, 1, 0]));
  return vAdd(S, vScale(vAdd(vScale(dir, Math.cos(ang)), vScale(perp, Math.sin(ang))), a));
}

/**
 * Clip body + arms on the solve's grip: the deltas and hips position retargetIdol takes for a club-holding phase
 * (address / idle / walk / swing / putt). `key` names the rig for the weight-curve cache, `clock` drives the loops.
 */
export function golferMotionDeltas(
  bind: IdolRigBind, key: string, solved: SolvedSwing, root: RootFrame, phase: GolferMotionPhase, t: number, clock: number
): Body & { readonly clipWeight: number; readonly clip: MotionClipName } {
  const roles = mapIdolRoles(bind), prof = idolProfile(bind);
  const clipBody = canonToDeltas(bind, golferClipPose(phase, t, clock, bind));
  const tl = strokeTimeline(phase, t);
  let w = tl.stroke ? sampleCurve(weightCurve(bind, root, tl.stroke, key), tl.x, tl.stroke === "Swing" ? 3 : 2) : 1;
  // Owner fix (slouch): the Address / Shuffle clips round the upper back (chest->neck ~66 deg) and drop the head below
  // horizontal. At address / idle / walk the torso follows the solve's athletic set-up (hip hinge ~30 deg, straight spine),
  // keeping ADDRESS_CLIP_WEIGHT of the clip for the waggle; walk keeps the clip's legs so the feet still step. The takeaway
  // ramps from that weight up to the stroke curve so the backswing starts without a pop.
  const posture = phase === "address" || phase === "idle" || phase === "walk";
  if (posture) w = ADDRESS_CLIP_WEIGHT;
  if (phase === "backswing" && t < 0.3) {
    const s = t / 0.3;
    w = Math.min(w, ADDRESS_CLIP_WEIGHT + (w - ADDRESS_CLIP_WEIGHT) * s * s * (3 - 2 * s));
  }
  const only = phase === "walk" ? UPPER_BODY : undefined;
  if (reachDeficit(bind, blendBody(solved, clipBody, w, only), solved, root) > 0.01) w = maxReachableWeight(bind, solved, clipBody, root, w, only);
  const body = w >= 1 ? clipBody : blendBody(solved, clipBody, w, only);
  const solveFk = idolForwardKinematics(bind, retargetIdol(bind, solved));
  const bodyFk = idolForwardKinematics(bind, retargetIdol(bind, body));
  const arm = (upper: string, fore: string, tFore: V3, palm: V3, target: V3, dU: Quat, dF: Quat): [Quat, Quat] => {
    const S = bodyFk.get(upper)!.pos;
    const E = elbowFor(S, target, vLen(tFore), vLen(palm), vSub(solveFk.get(fore)!.pos, solveFk.get(upper)!.pos));
    return [qMul(qFromTo(unit(qRotate(dU, tFore)), unit(vSub(E, S))), dU), qMul(qFromTo(unit(qRotate(dF, palm)), unit(vSub(target, E))), dF)];
  };
  const [uR, fR] = arm(roles.upperArmR, roles.foreArmR, prof.rig.tForearmR, prof.rig.palmR, toModel(root, solved.grip), solved.deltas.upperArmR, solved.deltas.foreArmR);
  const [uL, fL] = arm(roles.upperArmL, roles.foreArmL, prof.rig.tForearmL, prof.rig.palmL, toModel(root, solved.leftPalm), solved.deltas.upperArmL, solved.deltas.foreArmL);
  return { deltas: { ...body.deltas, upperArmR: uR, foreArmR: fR, upperArmL: uL, foreArmL: fL }, hipsPos: body.hipsPos, clipWeight: w, clip: clipForPhase(phase) };
}

const caddieAnimator = createLinksHumanoidAnimator(MOTION_CLIPS);
const celebrateAnimator = createLinksHumanoidAnimator(MOTION_CLIPS);

/** celebrate (club hidden): the Celebrate loop via `@aura3d/engine/animation` `createHumanoidAnimator`, full body */
export function celebrateDeltas(bind: IdolRigBind, clock: number): Body {
  return canonToDeltas(bind, celebrateAnimator.update(0, { clip: "Celebrate", time: clock, loop: true }));
}

/** caddie: the CaddieIdle loop via `@aura3d/engine/animation` `createHumanoidAnimator`, full body */
export function caddieIdleDeltas(bind: IdolRigBind, clock: number): Body {
  return canonToDeltas(bind, caddieAnimator.update(0, { clip: "CaddieIdle", time: clock, loop: true }));
}

export { createLinksHumanoidAnimator, layerGolferArms };
