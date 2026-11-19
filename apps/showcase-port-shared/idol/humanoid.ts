/**
 * Idol humanoid toolkit for the games.
 *
 * The bone mapping, driver and clip codec live in @aura3d/animation (packages/animation/src/smpl/humanoid.ts, shared with
 * `aura3d animation import`) and come in here through the public `@aura3d/engine/animation` export, so a game installed
 * from the packed candidate (the examples-source check) resolves them from the engine archive, never from workspace
 * package source. The small quaternion and pose helpers the games also use are not part of that public surface; they are
 * kept here with the same maths as the package module.
 */
import {
  HUMANOID_ROLES,
  createHumanoidDriver,
  parseGlbJson,
  readIdolSkeleton,
  type HumanoidDriver,
  type HumanoidDriverOptions,
  type HumanoidPoseInput,
  type HumanoidRole
} from "@aura3d/engine/animation";

export {
  HUMANOID_ROLES,
  createHumanoidDriver,
  createHumanoidSource,
  encodeHumanoidClip,
  mapHumanoid,
  parseGlbJson,
  readIdolSkeleton,
  sampleHumanoidClip,
  type HumanoidClip,
  type HumanoidDriver,
  type HumanoidDriverOptions,
  type HumanoidMap,
  type HumanoidPoseInput,
  type HumanoidRole,
  type HumanoidSource,
  type IdolBone,
  type IdolSkeleton
} from "@aura3d/engine/animation";

export type Vec3 = readonly [number, number, number];
/** Quaternion `[x, y, z, w]` (glTF / engine order). */
export type Quat = readonly [number, number, number, number];
/** The JSON chunk of a binary glTF, as `parseGlbJson` returns it. */
export type GltfJsonLike = ReturnType<typeof parseGlbJson>;
/** Structurally an engine `AnimationPose` (`handle.setAnimationPose(pose)`), as `driver.pose(...)` returns it. */
export type HumanoidAnimationPose = ReturnType<HumanoidDriver["pose"]>;

/* ------------------------------------------------------------------ */
/*  Quaternion helpers                                                 */
/* ------------------------------------------------------------------ */

const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function quatInv(q: Quat): Quat {
  const n = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] || 1;
  return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n];
}

export function quatNorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1, s = Math.sin(angle / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** The engine's `setRotation(x, y, z)` ("ZYX" = Rz·Ry·Rx: X applied first). */
export function eulerZYX(x: number, y: number, z: number): Quat {
  return quatMul(quatMul(quatAxisAngle([0, 0, 1], z), quatAxisAngle([0, 1, 0], y)), quatAxisAngle([1, 0, 0], x));
}

/** `q` raised to `t` (slerp from identity). */
export function quatPow(q: Quat, t: number): Quat {
  const w = Math.max(-1, Math.min(1, q[3] < 0 ? -q[3] : q[3]));
  const sign = q[3] < 0 ? -1 : 1;
  const half = Math.acos(w);
  const s = Math.sin(half);
  if (s < 1e-6) return QUAT_IDENTITY;
  return quatAxisAngle([q[0] * sign / s, q[1] * sign / s, q[2] * sign / s], 2 * half * t);
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Shortest-arc rotation turning unit direction `from` onto unit direction `to`. */
export function quatFromTo(from: Vec3, to: Vec3): Quat {
  const a = norm(from), b = norm(to);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 1 - 1e-9) return QUAT_IDENTITY;
  if (d < -1 + 1e-9) {
    const axis = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
    return quatAxisAngle(axis, Math.PI);
  }
  const c = cross(a, b);
  return quatNorm([c[0], c[1], c[2], 1 + d]);
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  if (d > 0.9995) return quatNorm([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/* ------------------------------------------------------------------ */
/*  Pose helpers                                                       */
/* ------------------------------------------------------------------ */

const MIRROR_ROLE = (r: HumanoidRole): HumanoidRole =>
  (r.startsWith("left") ? `right${r.slice(4)}` : r.startsWith("right") ? `left${r.slice(5)}` : r) as HumanoidRole;

/** Left-right mirror of a canonical pose (reflect across the body's sagittal plane, swap sides). */
export function mirrorHumanoidPose(p: HumanoidPoseInput): HumanoidPoseInput {
  const rotations: Partial<Record<HumanoidRole, Quat>> = {};
  for (const [r, q] of Object.entries(p.rotations) as [HumanoidRole, Quat][]) rotations[MIRROR_ROLE(r)] = [q[0], -q[1], -q[2], q[3]];
  const h = p.hipsOffset ?? [0, 0, 0];
  return { ...p, rotations, hipsOffset: [-h[0], h[1], h[2]] };
}

/** Blend two canonical poses (cross-fades): per-role slerp, hips lerp; `w` = weight of `b`. */
export function blendHumanoidPoses(a: HumanoidPoseInput, b: HumanoidPoseInput, w: number): HumanoidPoseInput {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const rotations: Partial<Record<HumanoidRole, Quat>> = {};
  for (const r of HUMANOID_ROLES) {
    const qa = a.rotations[r], qb = b.rotations[r];
    if (qa || qb) rotations[r] = quatSlerp(qa ?? QUAT_IDENTITY, qb ?? QUAT_IDENTITY, w);
  }
  const ha = a.hipsOffset ?? [0, 0, 0], hb = b.hipsOffset ?? [0, 0, 0];
  return { rotations, hipsOffset: [ha[0] + (hb[0] - ha[0]) * w, ha[1] + (hb[1] - ha[1]) * w, ha[2] + (hb[2] - ha[2]) * w], ...(b.handTargets ? { handTargets: b.handTargets } : {}) };
}

/** `base` with the listed roles taken from `top` (e.g. procedural dribbling arm over mocap legs). */
export function layerHumanoidPose(base: HumanoidPoseInput, top: HumanoidPoseInput, roles: readonly HumanoidRole[]): HumanoidPoseInput {
  const rotations = { ...base.rotations };
  for (const r of roles) if (top.rotations[r]) rotations[r] = top.rotations[r];
  return { ...base, rotations };
}

export const ARM_ROLES: readonly HumanoidRole[] = ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand", "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"];

/* ------------------------------------------------------------------ */
/*  Runtime loader                                                     */
/* ------------------------------------------------------------------ */

const driverCache = new Map<string, Promise<HumanoidDriver>>();

/** Fetch a rigged Idol GLB once (the browser cache serves the model node's own request) and build its driver. */
export function loadIdolHumanoid(url: string, opts: HumanoidDriverOptions = {}): Promise<HumanoidDriver> {
  const key = `${url}|${opts.facing ?? "+z"}`;
  let p = driverCache.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`loadIdolHumanoid: ${url} -> HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => createHumanoidDriver(readIdolSkeleton(parseGlbJson(buf)), opts));
    p.catch(() => driverCache.delete(key));
    driverCache.set(key, p);
  }
  return p;
}
