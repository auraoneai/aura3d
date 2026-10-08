// Spring bones: secondary dynamics for hair, cloth flaps, tails, and accessories. A chain of
// particles hangs off a kinematic root (driven by the character's animation). Each particle is
// pulled toward its rest pose by a spring, pulled down by gravity, damped, kept at its bone length
// by a distance constraint, and pushed out of optional sphere/capsule colliders. The result
// composes on top of any clip for free — it just reacts to how the root moves.
//
// Integration is semi-implicit (symplectic) Euler with a fixed timestep (subdivided into substeps
// for stiffness stability), so it is deterministic: the same root-motion stream and the same `dt`
// always produce the same chain. Pure: no `Date.now()` / `Math.random()`, no engine/render import.
//
// `telemetry()` reports the runtime itself; no separate fixture oracle can claim readiness.

import type { Quat, Vec3 } from "./Keyframe.js";
import type { PoseBuffer } from "./pose/PoseBuffer.js";
import type { SkeletonBinding } from "./pose/SkeletonBinding.js";

export interface SpringCollider {
  readonly kind: "sphere" | "capsule";
  readonly center: Vec3;
  /** Capsule second endpoint (ignored for spheres). */
  readonly tail?: Vec3;
  readonly radius: number;
}

export interface SpringChainOptions {
  /** Rest-pose world positions of the chain, root first (index 0 is the kinematic root). */
  readonly bones: readonly Vec3[];
  /** Spring stiffness pulling each particle to its rest pose (default 40). */
  readonly stiffness?: number;
  /** Velocity damping (default 4). Higher = settles faster. */
  readonly damping?: number;
  /** Gravity acceleration (default [0,-9.81,0]). */
  readonly gravity?: Vec3;
  /** Optional colliders the chain is pushed out of. */
  readonly colliders?: readonly SpringCollider[];
  /** Integration substeps per `integrate` call (default 2) for stiffness stability. */
  readonly substeps?: number;
  /**
   * Velocity damping toward the parent particle, per second (default 0 — the
   * legacy absolute-damping-only behaviour). The per-particle spring target
   * moves with its simulated parent, which can pump energy into swing modes
   * that absolute `damping` alone never dissipates (a persistent limit cycle);
   * damping the parent-relative velocity drains exactly those modes while
   * leaving rigid follow-through untouched. ~8 visibly settles a hair preset.
   */
  readonly relativeDamping?: number;
  /** Optional chain label (telemetry). */
  readonly name?: string;
}

/** Root transform driving the chain each frame. */
export interface SpringRootTransform {
  readonly position: Vec3;
  /** Optional rotation so the rest offsets follow the character's facing. */
  readonly rotation?: Quat;
}

export interface SpringChainTelemetry {
  readonly name: string;
  readonly boneCount: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly rootPosition: Vec3;
  readonly tipPosition: Vec3;
  /** Distance from root to tip (how far the chain swings out). */
  readonly maxDisplacement: number;
  /** Number of particles currently resolved against a collider this step. */
  readonly collisionContacts: number;
  /** Total kinetic energy (Σ½|v|²); used to verify damping decay. */
  readonly kineticEnergy: number;
}

export interface SpringChain {
  /** Advance the chain by `dt` seconds with the root at `rootTransform`. Deterministic. */
  integrate(dt: number, rootTransform: SpringRootTransform): void;
  /** Current solved world positions (index 0 is the root). */
  positions(): readonly Vec3[];
  /**
   * §13 flat snapshot — writes the solved positions into `out` (3 floats per
   * particle, same order as `positions()`); the per-frame bound path uses it
   * instead of `positions()` so a step allocates nothing.
   */
  positionsFlat(out: Float32Array): Float32Array;
  /** Telemetry for tests/gates and matching the fixture oracle's invariants. */
  telemetry(): SpringChainTelemetry;
  /** Reset the chain to its rest pose at a root transform (zero velocity). */
  reset(rootTransform?: SpringRootTransform): void;
}

/**
 * Create a spring-bone chain. Bind it to a bone subtree (see {@link tagSpringChain}) and call
 * {@link SpringChain.integrate} each frame; write {@link SpringChain.positions} back onto the bones.
 */
export function createSpringChain(options: SpringChainOptions): SpringChain {
  if (options.bones.length < 2) {
    throw new Error("Spring chain requires at least a root and one child bone.");
  }
  const stiffness = options.stiffness ?? 40;
  const damping = options.damping ?? 4;
  const gravity = options.gravity ?? [0, -9.81, 0];
  const colliders = options.colliders ?? [];
  const substeps = Math.max(1, Math.floor(options.substeps ?? 2));
  const relativeDamping = Math.max(0, options.relativeDamping ?? 0);
  const name = options.name ?? "spring-chain";

  // Rest offset of each particle relative to its parent, in the root's initial frame.
  const restOffsets = new Float32Array(options.bones.length * 3);
  for (let i = 0; i < options.bones.length; i += 1) {
    const bone = options.bones[i]!;
    restOffsets[i * 3] = i === 0 ? 0 : bone[0] - options.bones[i - 1]![0];
    restOffsets[i * 3 + 1] = i === 0 ? 0 : bone[1] - options.bones[i - 1]![1];
    restOffsets[i * 3 + 2] = i === 0 ? 0 : bone[2] - options.bones[i - 1]![2];
  }
  const restLengths = new Float32Array(options.bones.length);
  for (let i = 0; i < options.bones.length; i += 1) {
    restLengths[i] = Math.hypot(restOffsets[i * 3]!, restOffsets[i * 3 + 1]!, restOffsets[i * 3 + 2]!);
  }

  // §13 — flat particle state so `step` performs scalar math with no per-call
  // allocation (the Vec3-of-arrays version measured ~5× over the spring
  // micro-budget).
  const count = options.bones.length;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const bone = options.bones[i]!;
    positions[i * 3] = bone[0];
    positions[i * 3 + 1] = bone[1];
    positions[i * 3 + 2] = bone[2];
  }
  let contacts = 0;

  function step(dt: number, root: SpringRootTransform): void {
    contacts = 0;
    const q = root.rotation;
    // Root particle is kinematic.
    positions[0] = root.position[0];
    positions[1] = root.position[1];
    positions[2] = root.position[2];
    velocities[0] = 0;
    velocities[1] = 0;
    velocities[2] = 0;
    for (let i = 1; i < count; i += 1) {
      const pi = (i - 1) * 3;
      const ci = i * 3;
      // Rest target = parent position + rest offset rotated into the root frame.
      let ox = restOffsets[ci]!, oy = restOffsets[ci + 1]!, oz = restOffsets[ci + 2]!;
      if (q !== undefined) {
        const ix = q[3] * ox + q[1] * oz - q[2] * oy;
        const iy = q[3] * oy + q[2] * ox - q[0] * oz;
        const iz = q[3] * oz + q[0] * oy - q[1] * ox;
        const iw = -q[0] * ox - q[1] * oy - q[2] * oz;
        ox = ix * q[3] + iw * -q[0] + iy * -q[2] - iz * -q[1];
        oy = iy * q[3] + iw * -q[1] + iz * -q[0] - ix * -q[2];
        oz = iz * q[3] + iw * -q[2] + ix * -q[1] - iy * -q[0];
      }
      const rx = positions[pi]! + ox;
      const ry = positions[pi + 1]! + oy;
      const rz = positions[pi + 2]! + oz;
      const px = positions[ci]!, py = positions[ci + 1]!, pz = positions[ci + 2]!;
      const vx = velocities[ci]!, vy = velocities[ci + 1]!, vz = velocities[ci + 2]!;
      // a = stiffness*(rest - p) + gravity - damping*v  (semi-implicit: update v, then p)
      const ax = stiffness * (rx - px) + gravity[0] - damping * vx;
      const ay = stiffness * (ry - py) + gravity[1] - damping * vy;
      const az = stiffness * (rz - pz) + gravity[2] - damping * vz;
      let nvx = vx + ax * dt;
      let nvy = vy + ay * dt;
      let nvz = vz + az * dt;
      let npx = px + nvx * dt;
      let npy = py + nvy * dt;
      let npz = pz + nvz * dt;

      // Distance constraint: keep the bone length to the parent.
      {
        const dx = npx - positions[pi]!, dy = npy - positions[pi + 1]!, dz = npz - positions[pi + 2]!;
        const l = Math.hypot(dx, dy, dz);
        if (l <= 1e-8) {
          npx = positions[pi]!;
          npy = positions[pi + 1]! + restLengths[i]!;
          npz = positions[pi + 2]!;
        } else {
          const s = restLengths[i]! / l;
          npx = positions[pi]! + dx * s;
          npy = positions[pi + 1]! + dy * s;
          npz = positions[pi + 2]! + dz * s;
        }
      }

      // Collider push-out (scalar form of pushOut/closestPointOnSegment).
      for (const collider of colliders) {
        let cx = collider.center[0], cy = collider.center[1], cz = collider.center[2];
        if (collider.kind === "capsule" && collider.tail) {
          const abx = collider.tail[0] - cx, aby = collider.tail[1] - cy, abz = collider.tail[2] - cz;
          const t = clamp(((npx - cx) * abx + (npy - cy) * aby + (npz - cz) * abz) / Math.max(1e-8, abx * abx + aby * aby + abz * abz), 0, 1);
          cx += abx * t;
          cy += aby * t;
          cz += abz * t;
        }
        const dx = npx - cx, dy = npy - cy, dz = npz - cz;
        const l = Math.hypot(dx, dy, dz);
        if (l >= collider.radius) continue;
        const inx = l <= 1e-8 ? 0 : dx / l;
        const iny = l <= 1e-8 ? 1 : dy / l;
        const inz = l <= 1e-8 ? 0 : dz / l;
        npx = cx + inx * collider.radius;
        npy = cy + iny * collider.radius;
        npz = cz + inz * collider.radius;
        // Remove the inward velocity component so it doesn't tunnel back in.
        const d = nvx * inx + nvy * iny + nvz * inz;
        if (d < 0) {
          nvx -= d * inx;
          nvy -= d * iny;
          nvz -= d * inz;
        }
        contacts += 1;
      }

      // Recompute velocity from the constrained position so energy bookkeeping stays consistent.
      let evx = (npx - px) / dt;
      let evy = (npy - py) / dt;
      let evz = (npz - pz) / dt;
      if (relativeDamping > 0) {
        const keep = Math.exp(-relativeDamping * dt);
        const pvx = velocities[pi]!, pvy = velocities[pi + 1]!, pvz = velocities[pi + 2]!;
        evx = pvx + (evx - pvx) * keep;
        evy = pvy + (evy - pvy) * keep;
        evz = pvz + (evz - pvz) * keep;
      }
      velocities[ci] = evx;
      velocities[ci + 1] = evy;
      velocities[ci + 2] = evz;
      positions[ci] = npx;
      positions[ci + 1] = npy;
      positions[ci + 2] = npz;
    }
  }

  return {
    integrate(dt, rootTransform) {
      if (!Number.isFinite(dt) || dt <= 0) throw new Error("Spring chain dt must be finite and positive.");
      const sub = dt / substeps;
      for (let s = 0; s < substeps; s += 1) step(sub, rootTransform);
    },
    positions() {
      const out: Vec3[] = new Array(count);
      for (let i = 0; i < count; i += 1) {
        out[i] = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
      }
      return out;
    },
    positionsFlat(out: Float32Array) {
      out.set(positions.subarray(0, count * 3));
      return out;
    },
    telemetry() {
      const ti = (count - 1) * 3;
      let ke = 0;
      for (let i = 0; i < count * 3; i += 1) ke += 0.5 * velocities[i]! * velocities[i]!;
      return {
        name,
        boneCount: count,
        stiffness,
        damping,
        rootPosition: [positions[0]!, positions[1]!, positions[2]!] as Vec3,
        tipPosition: [positions[ti]!, positions[ti + 1]!, positions[ti + 2]!] as Vec3,
        maxDisplacement: Math.hypot(positions[ti]! - positions[0]!, positions[ti + 1]! - positions[1]!, positions[ti + 2]! - positions[2]!),
        collisionContacts: contacts,
        kineticEnergy: ke
      };
    },
    reset(rootTransform) {
      const rootPos = rootTransform?.position ?? options.bones[0]!;
      const q = rootTransform?.rotation;
      positions[0] = rootPos[0];
      positions[1] = rootPos[1];
      positions[2] = rootPos[2];
      velocities.fill(0);
      for (let i = 1; i < count; i += 1) {
        const pi = (i - 1) * 3;
        const ci = i * 3;
        let ox = restOffsets[ci]!, oy = restOffsets[ci + 1]!, oz = restOffsets[ci + 2]!;
        if (q !== undefined) {
          const ix = q[3] * ox + q[1] * oz - q[2] * oy;
          const iy = q[3] * oy + q[2] * ox - q[0] * oz;
          const iz = q[3] * oz + q[0] * oy - q[1] * ox;
          const iw = -q[0] * ox - q[1] * oy - q[2] * oz;
          ox = ix * q[3] + iw * -q[0] + iy * -q[2] - iz * -q[1];
          oy = iy * q[3] + iw * -q[1] + iz * -q[0] - ix * -q[2];
          oz = iz * q[3] + iw * -q[2] + ix * -q[1] - iy * -q[0];
        }
        positions[ci] = positions[pi]! + ox;
        positions[ci + 1] = positions[pi + 1]! + oy;
        positions[ci + 2] = positions[pi + 2]! + oz;
      }
    }
  };
}

function enforceLength(anchor: Vec3, point: Vec3, length: number): Vec3 {
  const d = sub(point, anchor);
  const l = len(d);
  if (l <= 1e-8) return [anchor[0], anchor[1] + length, anchor[2]];
  const s = length / l;
  return [anchor[0] + d[0] * s, anchor[1] + d[1] * s, anchor[2] + d[2] * s];
}

function pushOut(point: Vec3, collider: SpringCollider): { position: Vec3; normal: Vec3 } | undefined {
  const closest = collider.kind === "capsule" && collider.tail
    ? closestPointOnSegment(point, collider.center, collider.tail)
    : collider.center;
  const d = sub(point, closest);
  const l = len(d);
  if (l >= collider.radius) return undefined;
  const normal: Vec3 = l <= 1e-8 ? [0, 1, 0] : [d[0] / l, d[1] / l, d[2] / l];
  return {
    position: [closest[0] + normal[0] * collider.radius, closest[1] + normal[1] * collider.radius, closest[2] + normal[2] * collider.radius],
    normal
  };
}

function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(1e-8, dot(ab, ab)), 0, 1);
  return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function dist(a: Vec3, b: Vec3): number {
  return len(sub(a, b));
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Tuned spring-bone preset library (E2). Stiffness/damping pairs below were chosen for
 * visibly different secondary-motion reads at 60 Hz with the default 2 substeps:
 * hair swings freely, coats lag heavily, antennae wobble fast, tails sway slow.
 */
export interface SpringBonePreset {
  readonly name: "hair" | "coat" | "antenna" | "tail";
  /** Spring stiffness pulling each particle to its rest pose. */
  readonly stiffness: number;
  /** Velocity damping. Higher = settles faster. */
  readonly damping: number;
  /** Gravity scale applied to the default [0,-9.81,0] (antennae mostly ignore gravity). */
  readonly gravityScale: number;
  /** Integration substeps per `integrate` call for stiffness stability. */
  readonly substeps: number;
}

export const SPRING_BONE_PRESETS: Record<SpringBonePreset["name"], SpringBonePreset> = {
  hair: { name: "hair", stiffness: 28, damping: 2.6, gravityScale: 1, substeps: 2 },
  coat: { name: "coat", stiffness: 55, damping: 6.5, gravityScale: 1, substeps: 2 },
  antenna: { name: "antenna", stiffness: 90, damping: 3.2, gravityScale: 0.15, substeps: 3 },
  tail: { name: "tail", stiffness: 18, damping: 2.2, gravityScale: 0.6, substeps: 2 }
};

/**
 * Create a spring-bone chain from a named preset. `bones`/`colliders`/`name` still come from
 * the caller (they describe the rig); the preset supplies the dynamics tuning. Per-field
 * overrides win over the preset.
 */
export function createSpringChainFromPreset(
  preset: SpringBonePreset["name"],
  options: Omit<SpringChainOptions, "stiffness" | "damping" | "substeps" | "gravity"> & {
    readonly stiffness?: number;
    readonly damping?: number;
    readonly substeps?: number;
    readonly gravityScale?: number;
  }
): SpringChain {
  const table = SPRING_BONE_PRESETS[preset];
  if (!table) throw new Error(`Unknown spring-bone preset "${preset}".`);
  const gravityScale = options.gravityScale ?? table.gravityScale;
  return createSpringChain({
    ...options,
    stiffness: options.stiffness ?? table.stiffness,
    damping: options.damping ?? table.damping,
    substeps: options.substeps ?? table.substeps,
    gravity: [0, -9.81 * gravityScale, 0]
  });
}

function rotateVec3(v: Vec3, q: Quat): Vec3 {
  // v' = q * v * q⁻¹ (unit quaternion).
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x
  ];
}

/* ------------------------------------------------- skeleton binding (T4.1) */

/**
 * Options for {@link bindSpringChainToSkeleton}.
 */
export interface SpringBindOptions {
  /**
   * Fixed-step accumulator rate in Hz (default 60). `step(dt)` integrates the
   * chain in whole `1/substepHz` increments; the remainder is carried into the
   * next call so the solver never sees a variable timestep.
   */
  readonly substepHz?: number;
  /**
   * Maximum substeps consumed per `step` call (default 8). Excess accumulated
   * time is dropped rather than integrated — a long hitched frame produces a
   * one-frame catch-up instead of a spiral of expensive substeps.
   */
  readonly maxSubsteps?: number;
}

export interface BoundSpringChain {
  /**
   * Re-seed the chain at the pose's current bone world positions (kinematic
   * root frame, rest offsets, zero velocity). Called lazily by the first
   * `step`; call explicitly to re-bind after a teleport or pose reset.
   */
  initialize(pose: PoseBuffer): void;
  /**
   * Accumulate `dt`, integrate the chain in fixed `1/substepHz` increments at
   * the kinematic root frame, then write local rotations into
   * `pose.rotations` aiming each chain bone at its simulated child. Bones keep
   * their FK positions; the tip bone (no simulated child) keeps its animated
   * rotation.
   */
  step(pose: PoseBuffer, dt: number): void;
}

interface SpringBoneFrame {
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly scale: Vec3;
}

function springFkFrame(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): SpringBoneFrame {
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const scl = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!] as const;
  const pos = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!] as const;
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0 || parent >= skeleton.boneCount || parent === joint) {
    return { position: pos, rotation: rot, scale: scl };
  }
  const pf = springFkFrame(pose, skeleton, parent);
  const scaled: Vec3 = [pos[0] * pf.scale[0], pos[1] * pf.scale[1], pos[2] * pf.scale[2]];
  const rotated = rotateVec3(scaled, pf.rotation);
  return {
    position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
    rotation: multiplyQuat(pf.rotation, rot),
    scale: [pf.scale[0] * scl[0], pf.scale[1] * scl[1], pf.scale[2] * scl[2]]
  };
}

function multiplyQuat(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): readonly [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz
  ] as const;
}

function conjugateQuat(q: readonly [number, number, number, number]): readonly [number, number, number, number] {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatFromUnitVectors(from: Vec3, to: Vec3): readonly [number, number, number, number] {
  const d = Math.max(-1, Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]));
  if (d > 1 - 1e-9) return [0, 0, 0, 1];
  if (d < -1 + 1e-9) {
    const axis: Vec3 = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const c: Vec3 = [
      from[1] * axis[2] - from[2] * axis[1],
      from[2] * axis[0] - from[0] * axis[2],
      from[0] * axis[1] - from[1] * axis[0]
    ];
    const l = Math.hypot(c[0], c[1], c[2]) || 1;
    return [c[0] / l, c[1] / l, c[2] / l, 0];
  }
  const c: Vec3 = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0]
  ];
  const w = Math.sqrt((1 + d) / 2);
  const s = 1 / (2 * w);
  return [c[0] * s, c[1] * s, c[2] * s, w];
}

function normalizeVec3(v: Vec3): Vec3 {
  const l = len(v);
  return l <= 1e-9 ? [0, 1, 0] : [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * T4.1 (PRD-06 §7.1) — bind a {@link SpringChain} to a skeleton bone chain.
 * `boneNames` lists the chain root first (the kinematic anchor, driven by
 * animation) followed by the simulated bones. Unknown names throw — a
 * misspelled chain is louder than a silently dead spring.
 *
 * Per `step`, the kinematic root frame is read from the pose, the fixed-step
 * accumulator integrates at `substepHz`, and each bone with a simulated child
 * gets a local rotation aiming its rest child-direction at the simulated
 * segment direction. Positions stay FK-driven: the sim only bends the chain.
 */
export function bindSpringChainToSkeleton(
  chain: SpringChain,
  skeleton: SkeletonBinding,
  boneNames: readonly string[],
  options?: SpringBindOptions
): BoundSpringChain {
  if (boneNames.length < 2) {
    throw new Error("SpringBones: a bound chain needs a root plus at least one simulated bone.");
  }
  const indices = boneNames.map((name) => {
    const slots = skeleton.jointIndicesByName.get(name);
    if (slots === undefined || slots.length === 0) {
      throw new Error(`SpringBones: unknown bone "${name}".`);
    }
    return slots[0]!;
  });
  const substepHz = Math.max(1, options?.substepHz ?? 60);
  const maxSubsteps = Math.max(1, Math.floor(options?.maxSubsteps ?? 8));
  const h = 1 / substepHz;
  let accumulator = 0;
  let initialized = false;

  // §13 — flat FK-frame scratch: `springFkFrame` re-walked the ancestor chain
  // and allocated per call (~allocs × depth × bones per step, ~5× over the
  // spring micro-budget). Now frames resolve once per step into flat arrays,
  // memoized by generation mark, and the aim write is pure scalar math.
  const fPos = new Float32Array(skeleton.boneCount * 3);
  const fRot = new Float32Array(skeleton.boneCount * 4);
  const fScl = new Float32Array(skeleton.boneCount * 3);
  const fMark = new Uint32Array(skeleton.boneCount);
  const simPos = new Float32Array(indices.length * 3);
  const rootPosArr: [number, number, number] = [0, 0, 0];
  const rootRotArr: [number, number, number, number] = [0, 0, 0, 1];
  let fGen = 0;

  /** World-frame of `joint` in `pose`, computed once per generation into the flat scratch. */
  function frameOf(pose: PoseBuffer, joint: number): void {
    if (fMark[joint] === fGen) return;
    const lp = joint * 3;
    const lr = joint * 4;
    const lpx = pose.positions[lp]!, lpy = pose.positions[lp + 1]!, lpz = pose.positions[lp + 2]!;
    const lrx = pose.rotations[lr]!, lry = pose.rotations[lr + 1]!, lrz = pose.rotations[lr + 2]!, lrw = pose.rotations[lr + 3]!;
    const lsx = pose.scales[lp]!, lsy = pose.scales[lp + 1]!, lsz = pose.scales[lp + 2]!;
    const parent = skeleton.parentIndices[joint] ?? -1;
    if (parent < 0 || parent >= skeleton.boneCount || parent === joint) {
      fPos[lp] = lpx; fPos[lp + 1] = lpy; fPos[lp + 2] = lpz;
      fRot[lr] = lrx; fRot[lr + 1] = lry; fRot[lr + 2] = lrz; fRot[lr + 3] = lrw;
      fScl[lp] = lsx; fScl[lp + 1] = lsy; fScl[lp + 2] = lsz;
      fMark[joint] = fGen;
      return;
    }
    frameOf(pose, parent);
    const pp = parent * 3;
    const pr = parent * 4;
    const qx = fRot[pr]!, qy = fRot[pr + 1]!, qz = fRot[pr + 2]!, qw = fRot[pr + 3]!;
    // pos = parentPos + rotate(parentRot, localPos * parentScale)
    const sx = lpx * fScl[pp]!, sy = lpy * fScl[pp + 1]!, sz = lpz * fScl[pp + 2]!;
    const ix = qw * sx + qy * sz - qz * sy;
    const iy = qw * sy + qz * sx - qx * sz;
    const iz = qw * sz + qx * sy - qy * sx;
    const iw = -qx * sx - qy * sy - qz * sz;
    fPos[lp] = fPos[pp]! + (ix * qw + iw * -qx + iy * -qz - iz * -qy);
    fPos[lp + 1] = fPos[pp + 1]! + (iy * qw + iw * -qy + iz * -qx - ix * -qz);
    fPos[lp + 2] = fPos[pp + 2]! + (iz * qw + iw * -qz + ix * -qy - iy * -qx);
    // rot = parentRot * localRot
    fRot[lr] = qx * lrw + qw * lrx + qy * lrz - qz * lry;
    fRot[lr + 1] = qy * lrw + qw * lry + qz * lrx - qx * lrz;
    fRot[lr + 2] = qz * lrw + qw * lrz + qx * lry - qy * lrx;
    fRot[lr + 3] = qw * lrw - qx * lrx - qy * lry - qz * lrz;
    fScl[lp] = fScl[pp]! * lsx;
    fScl[lp + 1] = fScl[pp + 1]! * lsy;
    fScl[lp + 2] = fScl[pp + 2]! * lsz;
    fMark[joint] = fGen;
  }

  // Rest child-direction per bone expressed in its own frame. Derived from the
  // bind-time (rest) pose so the aim write preserves the authored chain shape
  // and only bends it toward the simulated segment.
  const restFrames = indices.map((joint) => springFkFrame(skeleton.restPose, skeleton, joint));
  const childDirLocal: Vec3[] = indices.map((joint, i) => {
    if (i + 1 >= indices.length) return [0, 0, 0];
    const restDir = normalizeVec3([
      restFrames[i + 1]!.position[0] - restFrames[i]!.position[0],
      restFrames[i + 1]!.position[1] - restFrames[i]!.position[1],
      restFrames[i + 1]!.position[2] - restFrames[i]!.position[2]
    ]);
    return normalizeVec3(rotateVec3(restDir, conjugateQuat(restFrames[i]!.rotation)));
  });

  function initialize(pose: PoseBuffer): void {
    fGen += 1;
    frameOf(pose, indices[0]!);
    const ri = indices[0]!;
    rootPosArr[0] = fPos[ri * 3]!; rootPosArr[1] = fPos[ri * 3 + 1]!; rootPosArr[2] = fPos[ri * 3 + 2]!;
    rootRotArr[0] = fRot[ri * 4]!; rootRotArr[1] = fRot[ri * 4 + 1]!; rootRotArr[2] = fRot[ri * 4 + 2]!; rootRotArr[3] = fRot[ri * 4 + 3]!;
    chain.reset({ position: rootPosArr, rotation: rootRotArr });
    initialized = true;
  }

  function step(pose: PoseBuffer, dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error("SpringBones: step dt must be finite and non-negative.");
    }
    if (!initialized) initialize(pose);
    fGen += 1;
    accumulator = Math.min(accumulator + dt, 0.25);
    const substeps = Math.min(Math.floor(accumulator / h), maxSubsteps);
    if (substeps > 0) {
      const ri = indices[0]!;
      frameOf(pose, ri);
      rootPosArr[0] = fPos[ri * 3]!; rootPosArr[1] = fPos[ri * 3 + 1]!; rootPosArr[2] = fPos[ri * 3 + 2]!;
      rootRotArr[0] = fRot[ri * 4]!; rootRotArr[1] = fRot[ri * 4 + 1]!; rootRotArr[2] = fRot[ri * 4 + 2]!; rootRotArr[3] = fRot[ri * 4 + 3]!;
      for (let k = 0; k < substeps; k += 1) {
        chain.integrate(h, { position: rootPosArr, rotation: rootRotArr });
      }
      accumulator -= substeps * h;
    }
    chain.positionsFlat(simPos);
    // Aim bones[1..n-2]: each simulated bone that has a simulated child. The
    // chain root stays purely kinematic — writing its rotation would feed the
    // aim back into the next frame's root frame and the rest target would
    // chase itself; the tip has no child to aim at.
    for (let i = 1; i + 1 < indices.length; i += 1) {
      const joint = indices[i]!;
      const si = i * 3;
      const sdx = simPos[si + 3]! - simPos[si]!;
      const sdy = simPos[si + 4]! - simPos[si + 1]!;
      const sdz = simPos[si + 5]! - simPos[si + 2]!;
      const sl = Math.hypot(sdx, sdy, sdz);
      if (sl <= 1e-9) continue;
      const ndx = sdx / sl, ndy = sdy / sl, ndz = sdz / sl;
      const parent = skeleton.parentIndices[joint] ?? -1;
      let prx = 0, pry = 0, prz = 0, prw = 1;
      if (parent >= 0 && parent < skeleton.boneCount) {
        frameOf(pose, parent);
        const pr = parent * 4;
        prx = fRot[pr]!; pry = fRot[pr + 1]!; prz = fRot[pr + 2]!; prw = fRot[pr + 3]!;
      }
      const jr = joint * 4;
      const lrx = pose.rotations[jr]!, lry = pose.rotations[jr + 1]!, lrz = pose.rotations[jr + 2]!, lrw = pose.rotations[jr + 3]!;
      // worldRot = parentRot * localRot
      const wx = prx * lrw + prw * lrx + pry * lrz - prz * lry;
      const wy = pry * lrw + prw * lry + prz * lrx - prx * lrz;
      const wz = prz * lrw + prw * lrz + prx * lry - pry * lrx;
      const ww = prw * lrw - prx * lrx - pry * lry - prz * lrz;
      // currentDir = normalize(rotate(childDirLocal[i], worldRot))
      const cv = childDirLocal[i]!;
      const cix = ww * cv[0] + wy * cv[2] - wz * cv[1];
      const ciy = ww * cv[1] + wz * cv[0] - wx * cv[2];
      const ciz = ww * cv[2] + wx * cv[1] - wy * cv[0];
      const ciw = -wx * cv[0] - wy * cv[1] - wz * cv[2];
      let cdx = cix * ww + ciw * -wx + ciy * -wz - ciz * -wy;
      let cdy = ciy * ww + ciw * -wy + ciz * -wx - cix * -wz;
      let cdz = ciz * ww + ciw * -wz + cix * -wy - ciy * -wx;
      const cl = Math.hypot(cdx, cdy, cdz);
      if (cl <= 1e-9) { cdx = 0; cdy = 1; cdz = 0; } else { cdx /= cl; cdy /= cl; cdz /= cl; }
      // aim = quatFromUnitVectors(currentDir, simDir)
      let ax = 0, ay = 0, az = 0, aw = 1;
      const d = Math.max(-1, Math.min(1, cdx * ndx + cdy * ndy + cdz * ndz));
      if (d > 1 - 1e-9) {
        // aim stays identity
      } else if (d < -1 + 1e-9) {
        const ux = Math.abs(cdx) < 0.9 ? 1 : 0;
        const uy = Math.abs(cdx) < 0.9 ? 0 : 1;
        let cxx = cdy * 0 - cdz * uy;
        let cyy = cdz * ux - cdx * 0;
        let czz = cdx * uy - cdy * ux;
        const ul = Math.hypot(cxx, cyy, czz) || 1;
        ax = cxx / ul; ay = cyy / ul; az = czz / ul; aw = 0;
      } else {
        const cx = cdy * ndz - cdz * ndy;
        const cy = cdz * ndx - cdx * ndz;
        const cz = cdx * ndy - cdy * ndx;
        const hw = Math.sqrt((1 + d) / 2);
        const s = 1 / (2 * hw);
        ax = cx * s; ay = cy * s; az = cz * s; aw = hw;
      }
      // newLocal = conjugate(parentRot) * (aim * worldRot)
      const m1x = ax * ww + aw * wx + ay * wz - az * wy;
      const m1y = ay * ww + aw * wy + az * wx - ax * wz;
      const m1z = az * ww + aw * wz + ax * wy - ay * wx;
      const m1w = aw * ww - ax * wx - ay * wy - az * wz;
      pose.rotations[jr] = -prx * m1w + prw * m1x - pry * m1z + prz * m1y;
      pose.rotations[jr + 1] = -pry * m1w + prw * m1y - prz * m1x + prx * m1z;
      pose.rotations[jr + 2] = -prz * m1w + prw * m1z - prx * m1y + pry * m1x;
      pose.rotations[jr + 3] = prw * m1w + prx * m1x + pry * m1y + prz * m1z;
    }
  }

  return { initialize, step };
}
