/**
 * Motion-captured-quality fighter animation for the Idol fighters.
 *
 * Plays Iron Crown's text-to-motion clips (fal.ai fal-ai/hunyuan-motion, generated for this game by tools/idol/motion.mjs
 * from tools/idol/motion-specs/iron-crown.json and baked by scripts/bake-idol-motion.mjs into idol-mocap.ts) on any Idol
 * skeleton: each role's world-rotation delta from the SMPL rest pose is applied after turning the Idol bone onto the
 * source bind direction, so the Idol limbs follow the generated limb directions exactly. Logical fighter states map to
 * clips per fighter (spear, knife, sword-and-shield and heavyweight move sets over a shared stance/locomotion/reaction
 * set); attack clips are time-warped so the clip's strike frame lands on the sim's first active frame; crossfades are
 * 0.12 s; root travel is removed (the sim owns position). Pure functions plus a small per-fighter blend state.
 */
import { MOCAP_BIND_DIRS, MOCAP_CLIPS, MOCAP_FPS, MOCAP_ROLES } from "./idol-mocap";
import { idolBind, qConj, qFromTo, qMul, qNorm, qRot, qSlerp, type HumanoidDrive, type IdolSkeleton, type Q, type V3 } from "./idolHumanoid";

export type MocapRole = (typeof MOCAP_ROLES)[number];
export interface MocapSample {
  readonly rot: Readonly<Record<MocapRole, Q>>;
  readonly hips: V3;
}

interface DecodedClip {
  readonly name: string;
  readonly duration: number;
  readonly contact: number;
  readonly span: readonly [number, number];
  readonly frames: number;
  readonly data: Float32Array;
}

const STRIDE = MOCAP_ROLES.length * 4 + 3;
let decoded: Map<string, DecodedClip> | null = null;

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function clips(): Map<string, DecodedClip> {
  if (decoded) return decoded;
  decoded = new Map();
  for (const c of MOCAP_CLIPS) {
    const bytes = b64(c.data);
    const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const data = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) data[i] = (i16[i]! / 32767) * 2;
    // Layout in the bake: all role quaternions per frame first, then all hips offsets per frame.
    decoded.set(c.name, { name: c.name, duration: c.duration, contact: c.contact, span: c.span, frames: c.frames, data: reorder(data, c.frames) });
  }
  return decoded;
}

/** Bake layout is [frames × roles×4][frames × 3]; interleave to [frames × (roles×4 + 3)]. */
function reorder(data: Float32Array, frames: number): Float32Array {
  const qn = MOCAP_ROLES.length * 4;
  const out = new Float32Array(frames * STRIDE);
  for (let f = 0; f < frames; f++) {
    out.set(data.subarray(f * qn, f * qn + qn), f * STRIDE);
    out.set(data.subarray(frames * qn + f * 3, frames * qn + f * 3 + 3), f * STRIDE + qn);
  }
  return out;
}

export function mocapClipNames(): readonly string[] {
  return [...clips().keys()];
}

export function mocapClip(name: string): { readonly duration: number; readonly contact: number; readonly span: readonly [number, number] } {
  const c = clips().get(name);
  if (!c) throw new Error(`IRON_CROWN_MOCAP_CLIP_MISSING: ${name}`);
  return c;
}

/** Sample a clip at time t (seconds; looped or clamped). */
export function sampleMocap(name: string, t: number, loop: boolean): MocapSample {
  const c = clips().get(name);
  if (!c) throw new Error(`IRON_CROWN_MOCAP_CLIP_MISSING: ${name}`);
  let time = loop ? ((t % c.duration) + c.duration) % c.duration : Math.max(0, Math.min(c.duration, t));
  const fpos = Math.min(c.frames - 1, time * MOCAP_FPS);
  const f0 = Math.floor(fpos);
  const f1 = loop ? (f0 + 1) % c.frames : Math.min(c.frames - 1, f0 + 1);
  const u = fpos - f0;
  const rot = {} as Record<MocapRole, Q>;
  MOCAP_ROLES.forEach((role, r) => {
    const a = c.data.subarray(f0 * STRIDE + r * 4, f0 * STRIDE + r * 4 + 4);
    const b = c.data.subarray(f1 * STRIDE + r * 4, f1 * STRIDE + r * 4 + 4);
    rot[role] = qNorm(qSlerp([a[0]!, a[1]!, a[2]!, a[3]!], [b[0]!, b[1]!, b[2]!, b[3]!], u));
  });
  const qn = MOCAP_ROLES.length * 4;
  const h0 = c.data.subarray(f0 * STRIDE + qn, f0 * STRIDE + qn + 3);
  const h1 = c.data.subarray(f1 * STRIDE + qn, f1 * STRIDE + qn + 3);
  void time;
  return { rot, hips: [h0[0]! + (h1[0]! - h0[0]!) * u, h0[1]! + (h1[1]! - h0[1]!) * u, h0[2]! + (h1[2]! - h0[2]!) * u] };
}

export function blendMocap(a: MocapSample, b: MocapSample, w: number): MocapSample {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const rot = {} as Record<MocapRole, Q>;
  for (const role of MOCAP_ROLES) rot[role] = qSlerp(a.rot[role], b.rot[role], w);
  return { rot, hips: [a.hips[0] + (b.hips[0] - a.hips[0]) * w, a.hips[1] + (b.hips[1] - a.hips[1]) * w, a.hips[2] + (b.hips[2] - a.hips[2]) * w] };
}

const UPPER: ReadonlySet<MocapRole> = new Set(["chest", "head", "upperArmL", "forearmL", "handL", "upperArmR", "forearmR", "handR"]);

/** Upper body from `top`, hips and legs from `base` (attack layered over locomotion). */
export function layerMocap(base: MocapSample, top: MocapSample): MocapSample {
  const rot = {} as Record<MocapRole, Q>;
  for (const role of MOCAP_ROLES) rot[role] = UPPER.has(role) ? top.rot[role] : base.rot[role];
  return { rot, hips: base.hips };
}

// ---- retarget onto an Idol skeleton --------------------------------------------------------------------------

const retargetCache = new WeakMap<IdolSkeleton, Record<MocapRole, Q>>();

/** Per role: K such that drive = delta * K reproduces delta * C * idolBind, with the solver's limb pre-rotation undone. */
function retargetConstants(skel: IdolSkeleton): Record<MocapRole, Q> {
  const hit = retargetCache.get(skel);
  if (hit) return hit;
  const b = idolBind(skel);
  const ro = skel.roles;
  const pos = (i: number) => b.worldT[i]!;
  const dir = (a: number, c: number): V3 => {
    const p = pos(a), q = pos(c);
    return [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  };
  const firstChild = (i: number) => skel.joints.findIndex((j) => j.parent === i);
  const headChild = firstChild(ro.head);
  const idolDirs: Record<MocapRole, V3 | null> = {
    hips: dir(ro.hips, ro.spine[0] ?? ro.chest),
    chest: dir(ro.chest, ro.neck >= 0 ? ro.neck : ro.head),
    head: headChild >= 0 ? dir(ro.head, headChild) : ro.neck >= 0 ? dir(ro.neck, ro.head) : null,
    upperArmL: dir(ro.upperArmL, ro.forearmL), forearmL: dir(ro.forearmL, ro.handL), handL: dir(ro.forearmL, ro.handL),
    upperArmR: dir(ro.upperArmR, ro.forearmR), forearmR: dir(ro.forearmR, ro.handR), handR: dir(ro.forearmR, ro.handR),
    thighL: dir(ro.thighL, ro.shinL), shinL: dir(ro.shinL, ro.footL), footL: ro.toeL >= 0 ? dir(ro.footL, ro.toeL) : null,
    thighR: dir(ro.thighR, ro.shinR), shinR: dir(ro.shinR, ro.footR), footR: ro.toeR >= 0 ? dir(ro.footR, ro.toeR) : null
  };
  const pre: Partial<Record<MocapRole, Q>> = {
    upperArmL: b.armDownL, forearmL: b.armDownL, handL: b.armDownL,
    upperArmR: b.armDownR, forearmR: b.armDownR, handR: b.armDownR,
    thighL: b.legDownL, shinL: b.legDownL, footL: b.legDownL,
    thighR: b.legDownR, shinR: b.legDownR, footR: b.legDownR
  };
  const out = {} as Record<MocapRole, Q>;
  for (const role of MOCAP_ROLES) {
    const d = idolDirs[role];
    const c: Q = d ? qFromTo(d, MOCAP_BIND_DIRS[role]) : role === "footL" || role === "footR" ? qFromTo(idolDirs[role === "footL" ? "shinL" : "shinR"]!, MOCAP_BIND_DIRS[role === "footL" ? "shinL" : "shinR"]) : [0, 0, 0, 1];
    const p = pre[role];
    out[role] = qNorm(p ? qMul(c, qConj(p)) : c);
  }
  retargetCache.set(skel, out);
  return out;
}

/**
 * Largest upper-arm elevation (radians from the chest's down axis; a T-pose is 90 deg) the Idol bodies are posed at.
 * Idol's auto-rig binds the whole shoulder, armpit and chest to a few bones, so arms raised toward vertical tear the
 * armpit and pull the chest through the shoulder (real-GPU QA, Boulder's slam and victory). The clamp turns the whole
 * arm (upper arm, forearm and hand together) back toward the body by the excess, so the arm keeps its shape.
 */
export const MAX_ARM_ELEVATION = (100 * Math.PI) / 180;

function axisAngle(axis: V3, angle: number): Q {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Clamp each upper arm's elevation (see MAX_ARM_ELEVATION); returns the sample unchanged when within range. */
export function clampArmElevation(s: MocapSample, max = MAX_ARM_ELEVATION): MocapSample {
  const down = qRot(s.rot.chest, [0, -1, 0]);
  let rot: Record<MocapRole, Q> | null = null;
  for (const [upper, fore, hand] of [["upperArmL", "forearmL", "handL"], ["upperArmR", "forearmR", "handR"]] as const) {
    const dir = qRot(s.rot[upper], MOCAP_BIND_DIRS[upper]);
    const cos = Math.max(-1, Math.min(1, dir[0] * down[0] + dir[1] * down[1] + dir[2] * down[2]));
    const angle = Math.acos(cos);
    if (angle <= max) continue;
    let axis: V3 = [dir[1] * down[2] - dir[2] * down[1], dir[2] * down[0] - dir[0] * down[2], dir[0] * down[1] - dir[1] * down[0]];
    const n = Math.hypot(...axis);
    // Straight overhead: lower the arm out to its side (the chest's own side axis).
    axis = n > 1e-6 ? [axis[0] / n, axis[1] / n, axis[2] / n] : qRot(s.rot.chest, upper === "upperArmL" ? [0, 0, -1] : [0, 0, 1]);
    const corr = axisAngle(axis, angle - max);
    rot ??= { ...s.rot };
    rot[upper] = qNorm(qMul(corr, s.rot[upper]));
    rot[fore] = qNorm(qMul(corr, s.rot[fore]));
    rot[hand] = qNorm(qMul(corr, s.rot[hand]));
  }
  return rot ? { rot, hips: s.hips } : s;
}

/** Twist / swing limits of the forearm against the upper arm and the hand against the forearm (radians). */
export const ARM_TWIST_LIMITS = { upperArmTwist: (50 * Math.PI) / 180, forearmTwist: (75 * Math.PI) / 180, handTwist: (60 * Math.PI) / 180, handSwing: (70 * Math.PI) / 180 };

/**
 * Limit a child's rotation relative to its parent: twist about the child's bind axis to +-maxTwist and the remaining
 * swing to maxSwing. Clip rotations are world deltas from a rest pose with identity rotations, so parent^-1 * child is
 * the joint's relative rotation in the rest frame, where the bone axis is the child's bind direction.
 */
function limitJoint(parent: Q, child: Q, axis: V3, maxTwist: number, maxSwing: number): Q {
  const r = qNorm(qMul(qConj(parent), child));
  const d = r[0] * axis[0] + r[1] * axis[1] + r[2] * axis[2];
  let twist: Q = qNorm([axis[0] * d, axis[1] * d, axis[2] * d, r[3]]);
  if (twist[3] < 0) twist = [-twist[0], -twist[1], -twist[2], -twist[3]];
  let swing = qNorm(qMul(r, qConj(twist)));
  if (swing[3] < 0) swing = [-swing[0], -swing[1], -swing[2], -swing[3]];
  const clampQ = (q: Q, max: number): Q => {
    const a = 2 * Math.acos(Math.min(1, q[3]));
    if (a <= max) return q;
    const n = Math.hypot(q[0], q[1], q[2]) || 1;
    return axisAngle([q[0] / n, q[1] / n, q[2] / n], max);
  };
  return qNorm(qMul(parent, qMul(clampQ(swing, maxSwing), clampQ(twist, maxTwist))));
}

/**
 * Forearm and wrist limits: generated wrists can twist far past what a single-bone Idol forearm skins (candy-wrapper
 * collapse, shards at the hand). Twist is clamped at the elbow and wrist; the wrist's bend is clamped too.
 */
export function limitArmTwist(s: MocapSample): MocapSample {
  const rot = { ...s.rot };
  for (const [upper, fore, hand] of [["upperArmL", "forearmL", "handL"], ["upperArmR", "forearmR", "handR"]] as const) {
    // Upper-arm roll against the chest: a rolled shoulder folds Idol's deltoid / armpit skin over itself.
    const upperBefore = rot[upper];
    rot[upper] = limitJoint(rot.chest, rot[upper], MOCAP_BIND_DIRS[upper], ARM_TWIST_LIMITS.upperArmTwist, Math.PI);
    // Keep the forearm and hand where they were relative to the (corrected) upper arm.
    const corr = qNorm(qMul(rot[upper], qConj(upperBefore)));
    rot[fore] = qNorm(qMul(corr, rot[fore]));
    rot[hand] = qNorm(qMul(corr, rot[hand]));
    const fa = MOCAP_BIND_DIRS[fore];
    rot[fore] = limitJoint(rot[upper], rot[fore], fa, ARM_TWIST_LIMITS.forearmTwist, Math.PI);
    rot[hand] = limitJoint(rot[fore], rot[hand], MOCAP_BIND_DIRS[hand], ARM_TWIST_LIMITS.handTwist, ARM_TWIST_LIMITS.handSwing);
  }
  return { rot, hips: s.hips };
}

/** The humanoid drive for one mocap sample on this skeleton (arm elevation and twist limited, see above). */
/**
 * Limit the chest's bend (swing) and twist against the hips. Idol spreads the chest rotation over a short spine chain,
 * so a deep arch or side bend folds a heavy torso's skin over itself (Boulder's leap and hammer fist). The chest turns
 * back toward the hips; head and arms keep their world directions (the arm limits run after this).
 */
export function limitSpine(s: MocapSample, maxBend: number, maxTwist = (45 * Math.PI) / 180): MocapSample {
  if (!Number.isFinite(maxBend)) return s;
  const chest = limitJoint(s.rot.hips, s.rot.chest, MOCAP_BIND_DIRS.chest, maxTwist, maxBend);
  return { rot: { ...s.rot, chest }, hips: s.hips };
}

/**
 * Limit how far each upper arm swings behind the chest's frontal plane (radians). Arms flung back stretch a heavy chest's
 * pectoral skin into the armpit (Boulder's leap); the whole arm turns forward by the excess.
 */
export function clampArmBack(s: MocapSample, maxBack: number): MocapSample {
  if (!Number.isFinite(maxBack)) return s;
  const fwd = qRot(s.rot.chest, [0, 0, 1]);
  let rot: Record<MocapRole, Q> | null = null;
  for (const [upper, fore, hand] of [["upperArmL", "forearmL", "handL"], ["upperArmR", "forearmR", "handR"]] as const) {
    const dir = qRot((rot ?? s.rot)[upper], MOCAP_BIND_DIRS[upper]);
    const back = Math.asin(Math.max(-1, Math.min(1, -(dir[0] * fwd[0] + dir[1] * fwd[1] + dir[2] * fwd[2]))));
    if (back <= maxBack) continue;
    let axis: V3 = [dir[1] * fwd[2] - dir[2] * fwd[1], dir[2] * fwd[0] - dir[0] * fwd[2], dir[0] * fwd[1] - dir[1] * fwd[0]];
    const n = Math.hypot(...axis);
    if (n < 1e-6) continue;
    axis = [axis[0] / n, axis[1] / n, axis[2] / n];
    const corr = axisAngle(axis, back - maxBack);
    rot ??= { ...s.rot };
    rot[upper] = qNorm(qMul(corr, rot[upper]));
    rot[fore] = qNorm(qMul(corr, rot[fore]));
    rot[hand] = qNorm(qMul(corr, rot[hand]));
  }
  return rot ? { rot, hips: s.hips } : s;
}

export function mocapDrive(skel: IdolSkeleton, sample: MocapSample, maxArmElevation = MAX_ARM_ELEVATION, maxSpineBend = Infinity, maxArmBack = Infinity): HumanoidDrive {
  const k = retargetConstants(skel);
  const s = limitArmTwist(clampArmBack(clampArmElevation(limitSpine(sample, maxSpineBend), maxArmElevation), maxArmBack));
  const d = (role: MocapRole): Q => qNorm(qMul(s.rot[role], k[role]));
  return {
    hips: d("hips"), chest: d("chest"), head: d("head"),
    upperArmL: d("upperArmL"), forearmL: d("forearmL"), handL: d("handL"),
    upperArmR: d("upperArmR"), forearmR: d("forearmR"), handR: d("handR"),
    thighL: d("thighL"), shinL: d("shinL"), footL: d("footL"),
    thighR: d("thighR"), shinR: d("shinR"), footR: d("footR"),
    hipsOffset: s.hips,
    sourceHipsY: 1
  };
}

// ---- logical fighter state -> clip, time --------------------------------------------------------------------

export type FighterMocapClip = "idle" | "walk" | "jump" | "dash" | "crouch" | "guard" | "light" | "heavy" | "special" | "throw" | "hitstun" | "ko" | "win";
export type MocapAttack = "light" | "heavy" | "special" | "throw";

export interface FighterMocapInput {
  readonly clip: FighterMocapClip;
  /** Fighter id (kenji, volt, boulder, seraph, jinx, sovereign); picks that fighter's move set. */
  readonly fighter?: string;
  /** Monotonic seconds. */
  readonly time: number;
  /** Seconds since the logical state began. */
  readonly clipTime: number;
  /** 0..1 progress through the state's sim hold (attacks, hitstun, jump air time). */
  readonly clipProgress: number;
  readonly moveDir: number;
  readonly layerAttack?: MocapAttack;
  readonly layerProgress?: number;
  /** Sim first-active-frame fraction of the state's hold (attacks); defaults to SIM_HIT_FRACTION. */
  readonly hitFraction?: number;
  readonly layerHitFraction?: number;
}

/** Fraction of the attack hold at which the sim's first active frame lands (moves.ts activeFrames at 60 fps / hold). */
export const SIM_HIT_FRACTION: Readonly<Record<MocapAttack, number>> = {
  light: 4 / 60 / 0.38,
  heavy: 9 / 60 / 0.56,
  special: 12 / 60 / 0.78,
  throw: 6 / 60 / 0.58
};

type StateClipName = Exclude<FighterMocapClip, "walk" | "dash">;

/** Shared clip per logical state (walk/dash pick WalkForward or WalkBack by direction). */
export const MOCAP_STATE_CLIP: Readonly<Record<StateClipName, string>> = {
  idle: "Idle",
  jump: "Jump",
  crouch: "Crouch",
  guard: "Guard",
  light: "Jab",
  heavy: "Uppercut",
  special: "Combo",
  throw: "Throw",
  hitstun: "Hit",
  ko: "Knockdown",
  win: "Victory"
};

/** Each fighter's own moves over the shared set: kick and lunge, heavyweight slams, spear, knife, sword and shield. */
export const FIGHTER_MOCAP_CLIPS: Readonly<Record<string, Partial<Record<StateClipName, string>>>> = {
  kenji: { heavy: "RoundhouseKick", special: "LungePunch" },
  volt: {},
  boulder: { heavy: "HammerFist", special: "GroundSlam" },
  seraph: { light: "SpearJab", heavy: "SpearThrust", special: "SpearSpecial" },
  jinx: { light: "KnifeSlash", special: "KnifeFlurry" },
  sovereign: { light: "SwordSlash", heavy: "SwordOverhead", special: "SwordSpin", guard: "ShieldBlock" }
};

/** The clip a fighter plays for a logical state. */
export function fighterClip(fighter: string | undefined, state: StateClipName): string {
  return (fighter ? FIGHTER_MOCAP_CLIPS[fighter]?.[state] : undefined) ?? MOCAP_STATE_CLIP[state];
}

/**
 * Clip time for an attack: piecewise-linear event timing, so the clip's strike frame (`contact`) lands on the sim's
 * hit fraction of the hold (the same mapping as eventTime in apps/showcase-port-shared/idol/motion.ts).
 */
export function attackClipTime(kind: MocapAttack, progress: number, hitFraction?: number, fighter?: string): number {
  const c = mocapClip(fighterClip(fighter, kind));
  const p = Math.max(0, Math.min(1, progress));
  const h = Math.max(0.05, Math.min(0.95, hitFraction ?? SIM_HIT_FRACTION[kind]));
  return p <= h ? (p / h) * c.contact : c.contact + ((p - h) / (1 - h)) * (c.duration - c.contact);
}

/** Into a hold (crouch, guard): play to the settled frame, then drift slowly through the rest of the clip. */
function holdTime(name: string, clipTime: number): number {
  const c = mocapClip(name);
  const settle = c.span[1];
  return clipTime <= settle ? clipTime : Math.min(c.duration, settle + (clipTime - settle) * 0.35);
}

export function stateClip(input: FighterMocapInput): { readonly clip: string; readonly t: number; readonly loop: boolean } {
  const f = input.fighter;
  switch (input.clip) {
    case "idle":
      return { clip: fighterClip(f, "idle"), t: input.time, loop: true };
    case "walk":
      return { clip: input.moveDir < 0 ? "WalkBack" : "WalkForward", t: input.time, loop: true };
    case "dash":
      return { clip: input.moveDir < 0 ? "WalkBack" : "WalkForward", t: input.time * 1.9, loop: true };
    case "crouch":
    case "guard": {
      const clip = fighterClip(f, input.clip);
      return { clip, t: holdTime(clip, input.clipTime), loop: false };
    }
    case "light":
    case "heavy":
    case "special":
    case "throw":
      return { clip: fighterClip(f, input.clip), t: attackClipTime(input.clip, input.clipProgress, input.hitFraction, f), loop: false };
    case "hitstun": {
      const clip = fighterClip(f, "hitstun");
      return { clip, t: input.clipProgress * mocapClip(clip).duration * 0.85, loop: false };
    }
    case "jump": {
      const clip = fighterClip(f, "jump");
      const [a, b] = mocapClip(clip).span;
      return { clip, t: a + Math.max(0, Math.min(1, input.clipProgress)) * (b - a), loop: false };
    }
    case "ko":
      return { clip: fighterClip(f, "ko"), t: input.clipTime, loop: false };
    case "win":
      return { clip: fighterClip(f, "win"), t: input.clipTime, loop: true };
  }
}

/** Per-fighter crossfade state (0.12 s between clips). */
export interface MocapBlendState {
  key: string;
  from: MocapSample | null;
  since: number;
}

export const MOCAP_CROSSFADE = 0.12;

export function createMocapBlend(): MocapBlendState {
  return { key: "", from: null, since: 0 };
}

/** Sample the fighter's state (with attack layering and crossfade) for this frame. */
export function fighterMocapSample(input: FighterMocapInput, blend?: MocapBlendState): MocapSample {
  const sc = stateClip(input);
  let s = sampleMocap(sc.clip, sc.t, sc.loop);
  if (input.layerAttack && input.clip !== "ko" && input.clip !== "hitstun") {
    s = layerMocap(s, sampleMocap(fighterClip(input.fighter, input.layerAttack), attackClipTime(input.layerAttack, input.layerProgress ?? 0.5, input.layerHitFraction, input.fighter), false));
  }
  if (!blend) return s;
  const key = `${sc.clip}|${input.layerAttack ?? ""}`;
  if (key !== blend.key) {
    blend.from = blend.key ? (blend as { last?: MocapSample }).last ?? null : null;
    blend.key = key;
    blend.since = input.time;
  }
  const w = (input.time - blend.since) / MOCAP_CROSSFADE;
  const out = blend.from && w < 1 ? blendMocap(blend.from, s, Math.max(0, w)) : s;
  (blend as { last?: MocapSample }).last = out;
  return out;
}
