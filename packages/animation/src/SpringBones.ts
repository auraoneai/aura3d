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
  const restOffsets: Vec3[] = options.bones.map((bone, i) =>
    i === 0 ? [0, 0, 0] : sub(bone, options.bones[i - 1]!)
  );
  const restLengths: number[] = restOffsets.map((o) => len(o));

  const positions: Vec3[] = options.bones.map((b) => [...b] as Vec3);
  const velocities: Vec3[] = options.bones.map(() => [0, 0, 0] as Vec3);
  let contacts = 0;

  function rotatedRestOffset(i: number, rotation: Quat | undefined): Vec3 {
    return rotation ? rotateVec3(restOffsets[i]!, rotation) : restOffsets[i]!;
  }

  function step(dt: number, root: SpringRootTransform): void {
    contacts = 0;
    // Root particle is kinematic.
    positions[0] = [...root.position] as Vec3;
    velocities[0] = [0, 0, 0];
    for (let i = 1; i < positions.length; i += 1) {
      const parent = positions[i - 1]!;
      const rest = add(parent, rotatedRestOffset(i, root.rotation));
      const p = positions[i]!;
      const v = velocities[i]!;
      // a = stiffness*(rest - p) + gravity - damping*v  (semi-implicit: update v, then p)
      const ax = stiffness * (rest[0] - p[0]) + gravity[0] - damping * v[0];
      const ay = stiffness * (rest[1] - p[1]) + gravity[1] - damping * v[1];
      const az = stiffness * (rest[2] - p[2]) + gravity[2] - damping * v[2];
      const nv: [number, number, number] = [v[0] + ax * dt, v[1] + ay * dt, v[2] + az * dt];
      let np: Vec3 = [p[0] + nv[0] * dt, p[1] + nv[1] * dt, p[2] + nv[2] * dt];

      // Distance constraint: keep the bone length to the parent.
      np = enforceLength(parent, np, restLengths[i]!);

      // Collider push-out.
      for (const collider of colliders) {
        const resolved = pushOut(np, collider);
        if (resolved) {
          np = resolved.position;
          // Remove the inward velocity component so it doesn't tunnel back in.
          const dot = nv[0] * resolved.normal[0] + nv[1] * resolved.normal[1] + nv[2] * resolved.normal[2];
          if (dot < 0) {
            nv[0] -= dot * resolved.normal[0];
            nv[1] -= dot * resolved.normal[1];
            nv[2] -= dot * resolved.normal[2];
          }
          contacts += 1;
        }
      }

      // Recompute velocity from the constrained position so energy bookkeeping stays consistent.
      velocities[i] = [(np[0] - p[0]) / dt, (np[1] - p[1]) / dt, (np[2] - p[2]) / dt];
      if (relativeDamping > 0) {
        const pv = velocities[i - 1]!;
        const keep = Math.exp(-relativeDamping * dt);
        const v = velocities[i]!;
        velocities[i] = [
          pv[0] + (v[0] - pv[0]) * keep,
          pv[1] + (v[1] - pv[1]) * keep,
          pv[2] + (v[2] - pv[2]) * keep
        ];
      }
      positions[i] = np;
    }
  }

  return {
    integrate(dt, rootTransform) {
      if (!Number.isFinite(dt) || dt <= 0) throw new Error("Spring chain dt must be finite and positive.");
      const sub = dt / substeps;
      for (let s = 0; s < substeps; s += 1) step(sub, rootTransform);
    },
    positions() {
      return positions.map((p) => [...p] as Vec3);
    },
    telemetry() {
      const tip = positions[positions.length - 1]!;
      const root = positions[0]!;
      let ke = 0;
      for (const v of velocities) ke += 0.5 * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      return {
        name,
        boneCount: positions.length,
        stiffness,
        damping,
        rootPosition: [...root] as Vec3,
        tipPosition: [...tip] as Vec3,
        maxDisplacement: dist(root, tip),
        collisionContacts: contacts,
        kineticEnergy: ke
      };
    },
    reset(rootTransform) {
      const rootPos = rootTransform?.position ?? options.bones[0]!;
      const rotation = rootTransform?.rotation;
      positions[0] = [...rootPos] as Vec3;
      velocities[0] = [0, 0, 0];
      for (let i = 1; i < positions.length; i += 1) {
        positions[i] = add(positions[i - 1]!, rotatedRestOffset(i, rotation));
        velocities[i] = [0, 0, 0];
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
    const root = springFkFrame(pose, skeleton, indices[0]!);
    chain.reset({ position: root.position, rotation: root.rotation });
    initialized = true;
  }

  function step(pose: PoseBuffer, dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error("SpringBones: step dt must be finite and non-negative.");
    }
    if (!initialized) initialize(pose);
    accumulator = Math.min(accumulator + dt, 0.25);
    const substeps = Math.min(Math.floor(accumulator / h), maxSubsteps);
    if (substeps > 0) {
      const root = springFkFrame(pose, skeleton, indices[0]!);
      for (let k = 0; k < substeps; k += 1) {
        chain.integrate(h, { position: root.position, rotation: root.rotation });
      }
      accumulator -= substeps * h;
    }
    const sim = chain.positions();
    // Aim bones[1..n-2]: each simulated bone that has a simulated child. The
    // chain root stays purely kinematic — writing its rotation would feed the
    // aim back into the next frame's root frame and the rest target would
    // chase itself; the tip has no child to aim at.
    for (let i = 1; i + 1 < indices.length; i += 1) {
      const joint = indices[i]!;
      const segment = sub(sim[i + 1]!, sim[i]!);
      if (len(segment) <= 1e-9) continue;
      const simDir = normalizeVec3(segment);
      const parent = skeleton.parentIndices[joint] ?? -1;
      const parentRot = parent >= 0 && parent < skeleton.boneCount
        ? springFkFrame(pose, skeleton, parent).rotation
        : ([0, 0, 0, 1] as const);
      const localRot = [
        pose.rotations[joint * 4]!,
        pose.rotations[joint * 4 + 1]!,
        pose.rotations[joint * 4 + 2]!,
        pose.rotations[joint * 4 + 3]!
      ] as const;
      const worldRot = multiplyQuat(parentRot, localRot);
      const currentDir = normalizeVec3(rotateVec3(childDirLocal[i]!, worldRot));
      const aim = quatFromUnitVectors(currentDir, simDir);
      const newLocal = multiplyQuat(conjugateQuat(parentRot), multiplyQuat(aim, worldRot));
      pose.rotations[joint * 4] = newLocal[0];
      pose.rotations[joint * 4 + 1] = newLocal[1];
      pose.rotations[joint * 4 + 2] = newLocal[2];
      pose.rotations[joint * 4 + 3] = newLocal[3];
    }
  }

  return { initialize, step };
}
