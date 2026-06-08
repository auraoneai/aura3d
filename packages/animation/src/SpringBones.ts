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
// The deterministic `SpringBoneSample` / `springSample()` in SecondaryAnimationFixtures remain the
// telemetry oracle/data-shape; this runtime produces the same invariants via `telemetry()`.

import type { Quat, Vec3 } from "./Keyframe.js";

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
