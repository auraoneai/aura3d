/**
 * Any humanoid skeleton's sampled motion (BVH, FBX, glTF clips) -> canonical humanoid frames, with the same role mapping
 * and limb-alignment rules the Idol driver uses (./humanoid.ts). Format readers (the CLI's `animation import`) produce a
 * `SkeletalMotion`: a joint table with rest local TRS plus per-frame local rotations/translations. This module maps it
 * (names first for facing, geometry for roles), removes the clip's mean heading, grounds the hips, applies the
 * root-motion mode and loop cross-fade, and returns frames that ./bake.ts writes onto a target rig.
 *
 * Extensionless relative imports on purpose: tools that load these sources directly under `node` resolve them to .ts.
 */
import {
  createHumanoidSource,
  HUMANOID_ROLES,
  mapHumanoid,
  quatAxisAngle,
  quatMul,
  quatNorm,
  quatSlerp,
  rotateVec,
  type HumanoidDriverOptions,
  type HumanoidMap,
  type HumanoidPoseInput,
  type HumanoidRole,
  type IdolSkeleton,
  type Quat,
  type Vec3
} from "./humanoid";

export type HumanoidFacing = "+z" | "-z" | "+x" | "-x";
export type RootMotionMode = "in-place" | "keep" | "strip";

export interface SkeletalMotionFrame {
  /** LOCAL rotation per joint (same order as `skeleton.bones`). */
  readonly r: readonly Quat[];
  /** LOCAL translation per joint (rest translation where the clip does not animate it). */
  readonly t: readonly Vec3[];
}

export interface SkeletalMotion {
  readonly skeleton: IdolSkeleton;
  readonly fps: number;
  readonly frames: readonly SkeletalMotionFrame[];
}

export interface CanonicalMotionOptions {
  /** Trim [start, end] seconds before conversion. */
  readonly window?: readonly [number, number];
  readonly loop?: boolean;
  /** Seconds of the end cross-faded into the start for loops (default 0.2). */
  readonly loopBlend?: number;
  /** Remove the clip's mean heading so it faces +Z (default true). */
  readonly faceForward?: boolean;
  readonly rootMotion?: RootMotionMode;
  /** Model-space axis the source character faces; "auto" (default) detects it from bone names, then toes. */
  readonly facing?: HumanoidFacing | "auto";
  /** Role -> bone-name overrides for the source skeleton. */
  readonly roles?: HumanoidDriverOptions["roles"];
}

export interface CanonicalMotion {
  readonly fps: number;
  readonly frames: readonly HumanoidPoseInput[];
  readonly roles: readonly HumanoidRole[];
  readonly meta: Readonly<Record<string, number | string>>;
  readonly map: HumanoidMap;
  readonly facing: HumanoidFacing;
  readonly facingMethod: FacingDetection["method"];
}

export interface FacingDetection {
  readonly facing: HumanoidFacing;
  readonly method: "names" | "toes" | "default" | "explicit";
}

interface Xf { readonly t: Vec3; readonly r: Quat; readonly s: number }
const IDENTITY: Quat = [0, 0, 0, 1];
const ROOT_XF: Xf = { t: [0, 0, 0], r: IDENTITY, s: 1 };

function compose(parent: Xf, t: Vec3, r: Quat, s: number): Xf {
  const v = rotateVec(parent.r, t);
  return { t: [parent.t[0] + v[0] * parent.s, parent.t[1] + v[1] * parent.s, parent.t[2] + v[2] * parent.s], r: quatMul(parent.r, r), s: parent.s * s };
}

function parentFirstOrder(sk: IdolSkeleton): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number): void => {
    if (seen.has(i)) return;
    const p = sk.bones[i]!.parent;
    if (p >= 0) visit(p);
    seen.add(i);
    order.push(i);
  };
  sk.bones.forEach((_, i) => visit(i));
  return order;
}

/** World transform of every joint for local rotations/translations (rest where omitted). */
export function skeletonWorld(sk: IdolSkeleton, r?: readonly Quat[], t?: readonly Vec3[], order = parentFirstOrder(sk)): Xf[] {
  const out: Xf[] = new Array(sk.bones.length);
  for (const i of order) {
    const b = sk.bones[i]!;
    const parent = b.parent >= 0 ? out[b.parent]! : (sk.rootParents[i] ?? ROOT_XF);
    out[i] = compose(parent, t?.[i] ?? b.t, r?.[i] ?? b.r, b.s[0]);
  }
  return out;
}

const FACINGS: readonly { readonly facing: HumanoidFacing; readonly yaw: number }[] = [
  { facing: "+z", yaw: 0 }, { facing: "+x", yaw: Math.PI / 2 }, { facing: "-z", yaw: Math.PI }, { facing: "-x", yaw: -Math.PI / 2 }
];

function snapYaw(yaw: number): HumanoidFacing {
  let best = FACINGS[0]!, bestD = Infinity;
  for (const f of FACINGS) {
    const d = Math.abs(Math.atan2(Math.sin(yaw - f.yaw), Math.cos(yaw - f.yaw)));
    if (d < bestD) { bestD = d; best = f; }
  }
  return best.facing;
}

/** Side of a bone name: "left" for LeftArm / L_hip / thigh.L / lUpLeg-style tokens, "right" likewise, else null. */
export function boneSide(name: string): "left" | "right" | null {
  const tokens = name
    .replace(/^[^:|]*[:|]/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((x) => x.toLowerCase())
    .filter(Boolean);
  if (tokens.some((x) => x === "left" || x === "l" || x === "lft")) return "left";
  if (tokens.some((x) => x === "right" || x === "r" || x === "rt" || x === "rgt")) return "right";
  return null;
}

/**
 * Which model-space axis a humanoid skeleton faces in its rest pose: from sided bone names (left minus right is the
 * character's left), else from the feet (foot -> toe points forward), else +Z.
 */
export function detectHumanoidFacing(sk: IdolSkeleton): FacingDetection {
  const world = skeletonWorld(sk);
  const acc = { left: [0, 0, 0] as [number, number, number], right: [0, 0, 0] as [number, number, number] };
  const count = { left: 0, right: 0 };
  sk.bones.forEach((b, i) => {
    const side = boneSide(b.name);
    if (!side) return;
    const p = world[i]!.t;
    acc[side][0] += p[0]; acc[side][2] += p[2];
    count[side] += 1;
  });
  if (count.left >= 2 && count.right >= 2) {
    const lx = acc.left[0] / count.left - acc.right[0] / count.right;
    const lz = acc.left[2] / count.left - acc.right[2] / count.right;
    if (Math.hypot(lx, lz) > 1e-6) return { facing: snapYaw(Math.atan2(-lz, lx)), method: "names" };
  }
  try {
    const map = mapHumanoid(sk);
    let fx = 0, fz = 0, seg = 0;
    for (const role of ["leftFoot", "rightFoot"] as const) {
      const name = map.roles[role];
      const foot = sk.bones.findIndex((b) => b.name === name);
      const toe = foot >= 0 ? sk.bones.findIndex((b) => b.parent === foot) : -1;
      if (toe < 0) continue;
      const a = world[foot]!.t, c = world[toe]!.t;
      fx += c[0] - a[0]; fz += c[2] - a[2];
      seg += Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    }
    if (seg > 0 && Math.hypot(fx, fz) > 0.2 * seg) return { facing: snapYaw(Math.atan2(fx, fz)), method: "toes" };
  } catch {
    // unmappable skeleton: the caller's mapping step reports it
  }
  return { facing: "+z", method: "default" };
}

/** Per-frame cross-fade of a loop's last `blend` seconds into its start (same rule as the HY-Motion converter). */
export function crossfadeLoop(frames: readonly HumanoidPoseInput[], fps: number, blend = 0.2): HumanoidPoseInput[] {
  const n = frames.length;
  const k = Math.max(1, Math.min(Math.floor(n / 3), Math.round(blend * fps)));
  if (n < 4) return [...frames];
  const out: HumanoidPoseInput[] = [];
  for (let j = 0; j < n - k; j++) {
    if (j < k) {
      const a = frames[n - k + j]!, b = frames[j]!, w = j / k;
      const rotations: Partial<Record<HumanoidRole, Quat>> = {};
      for (const r of HUMANOID_ROLES) { const qa = a.rotations[r], qb = b.rotations[r]; if (qa && qb) rotations[r] = quatSlerp(qa, qb, w); }
      const ha = a.hipsOffset ?? [0, 0, 0], hb = b.hipsOffset ?? [0, 0, 0];
      out.push({ rotations, hipsOffset: [hb[0], ha[1] + (hb[1] - ha[1]) * w, hb[2]] });
    } else out.push(frames[j]!);
  }
  return out;
}

/** Resample canonical frames to another rate (per-role slerp, hips lerp). Duration is preserved to the last frame. */
export function resampleCanonicalFrames(frames: readonly HumanoidPoseInput[], fromFps: number, toFps: number): HumanoidPoseInput[] {
  if (frames.length < 2 || Math.abs(fromFps - toFps) < 1e-9) return [...frames];
  const duration = (frames.length - 1) / fromFps;
  const n = Math.max(2, Math.round(duration * toFps) + 1);
  const out: HumanoidPoseInput[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.min(frames.length - 1, (i / toFps) * fromFps);
    const f0 = Math.floor(x), f1 = Math.min(frames.length - 1, f0 + 1), u = x - f0;
    const a = frames[f0]!, b = frames[f1]!;
    const rotations: Partial<Record<HumanoidRole, Quat>> = {};
    for (const r of HUMANOID_ROLES) {
      const qa = a.rotations[r], qb = b.rotations[r];
      if (qa || qb) rotations[r] = quatSlerp(qa ?? IDENTITY, qb ?? IDENTITY, u);
    }
    const ha = a.hipsOffset ?? [0, 0, 0], hb = b.hipsOffset ?? [0, 0, 0];
    out.push({ rotations, hipsOffset: [ha[0] + (hb[0] - ha[0]) * u, ha[1] + (hb[1] - ha[1]) * u, ha[2] + (hb[2] - ha[2]) * u] });
  }
  return out;
}

/** A sampled skeletal clip as canonical humanoid frames (see the module comment). */
export function skeletalMotionToFrames(motion: SkeletalMotion, opts: CanonicalMotionOptions = {}): CanonicalMotion {
  const sk = motion.skeleton;
  const fps = motion.fps;
  if (!(fps > 0)) throw new Error("skeletalMotionToFrames: fps must be positive");
  const total = motion.frames.length;
  if (total < 2) throw new Error("skeletalMotionToFrames: the clip needs at least 2 frames");
  const [w0, w1] = opts.window ?? [0, (total - 1) / fps];
  const f0 = Math.max(0, Math.round(w0 * fps)), f1 = Math.min(total - 1, Math.round(w1 * fps));
  if (f1 - f0 < 1) throw new Error(`skeletalMotionToFrames: window [${w0}, ${w1}] s selects fewer than 2 frames of a ${((total - 1) / fps).toFixed(2)} s clip`);
  const detected: FacingDetection = opts.facing && opts.facing !== "auto" ? { facing: opts.facing, method: "explicit" } : detectHumanoidFacing(sk);
  const driverOpts: HumanoidDriverOptions = { facing: detected.facing, ...(opts.roles ? { roles: opts.roles } : {}) };
  const source = createHumanoidSource(sk, driverOpts);
  const map = source.map;
  const hipsIdx = sk.bones.findIndex((b) => b.name === map.roles.hips);
  const hipH = map.hipHeight || 1;
  const order = parentFirstOrder(sk);
  const F = quatAxisAngle([0, 1, 0], FACINGS.find((f) => f.facing === detected.facing)!.yaw);
  const Finv: Quat = [-F[0], -F[1], -F[2], F[3]];

  const worlds: Xf[][] = [];
  let ground = Infinity;
  for (let f = f0; f <= f1; f++) {
    const fr = motion.frames[f]!;
    const w = skeletonWorld(sk, fr.r, fr.t, order);
    worlds.push(w);
    for (const x of w) ground = Math.min(ground, x.t[1]);
  }
  const canon: HumanoidPoseInput[] = worlds.map((w) => source.toCanonical(w.map((x) => x.r), w[hipsIdx]!.t));
  // Mean heading of the canonical hips (the root role: its local rotation is its global one).
  const yawOf = (p: HumanoidPoseInput) => { const fw = rotateVec(p.rotations.hips ?? IDENTITY, [0, 0, 1]); return Math.atan2(fw[0], fw[2]); };
  let sx = 0, sz = 0;
  for (const p of canon) { const y = yawOf(p); sx += Math.sin(y); sz += Math.cos(y); }
  const meanYaw = opts.faceForward === false ? 0 : Math.atan2(sx, sz);
  const unYaw = quatAxisAngle([0, 1, 0], -meanYaw);
  const rootMotion = opts.rootMotion ?? "in-place";
  const start = rotateVec(Finv, worlds[0]![hipsIdx]!.t);
  const frames: HumanoidPoseInput[] = canon.map((p, k) => {
    const rotations = { ...p.rotations, hips: quatNorm(quatMul(unYaw, p.rotations.hips ?? IDENTITY)) };
    const hipsWorld = worlds[k]![hipsIdx]!.t;
    const bob = (hipsWorld[1] - ground - hipH) / hipH;
    if (rootMotion === "strip") return { rotations, hipsOffset: [0, 0, 0] };
    if (rootMotion === "keep") {
      const c = rotateVec(Finv, hipsWorld);
      const d = rotateVec(unYaw, [c[0] - start[0], 0, c[2] - start[2]]);
      return { rotations, hipsOffset: [d[0] / hipH, bob, d[2] / hipH] };
    }
    return { rotations, hipsOffset: [0, bob, 0] };
  });
  const out = opts.loop ? crossfadeLoop(frames, fps, opts.loopBlend ?? 0.2) : frames;

  const meta: Record<string, number | string> = { sourceHipHeight: +hipH.toFixed(4), loop: opts.loop ? 1 : 0 };
  const dur = (f1 - f0) / fps;
  const a = rotateVec(Finv, worlds[0]![hipsIdx]!.t), b = rotateVec(Finv, worlds[worlds.length - 1]![hipsIdx]!.t);
  if (dur > 0) meta.groundSpeedHip = +(Math.hypot(b[0] - a[0], b[2] - a[2]) / dur / hipH).toFixed(4);
  const d = rotateVec(unYaw, [b[0] - a[0], 0, b[2] - a[2]]);
  meta.travelX = +(d[0] / hipH).toFixed(3);
  meta.travelZ = +(d[2] / hipH).toFixed(3);
  const roles = HUMANOID_ROLES.filter((r) => map.roles[r] !== undefined);
  return { fps, frames: out, roles, meta, map, facing: detected.facing, facingMethod: detected.method };
}
