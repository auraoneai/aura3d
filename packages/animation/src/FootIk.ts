// Runtime foot IK + foot-lock, built on the existing two-bone solver (`solveTwoBoneIk`) plus a
// ground query (a downward ray). This is "wire up what we already have" — no new solver. It removes
// foot sliding (foot-lock holds a planted foot in world space during stance and releases it on
// lift) and grounds characters on uneven terrain (each ankle is pulled to the ground height under
// it, the hip drops so the lower foot can reach).
//
// The animation package stays dependency-free of @aura3d/physics: callers inject a `GroundRaycaster`
// (the physics package's `groundHeightRaycaster` adapter satisfies this interface, or use the
// analytic `createHeightFieldGround` here). Pure and deterministic: given the same pose stream and
// ground, the solved feet and lock state are identical every run.

import { solveTwoBoneIk, type TwoBoneIkResult } from "./IK.js";
import type { Vec3 } from "./Keyframe.js";

/** Runtime foot-placement telemetry for one leg. */
export interface FootIkSample {
  readonly side: "left" | "right";
  readonly sourceFoot: Vec3;
  readonly plantedFoot: Vec3;
  readonly groundNormal: Vec3;
  readonly grounded: boolean;
  readonly verticalCorrection: number;
  readonly targetError: number;
}

/** Result of a downward ground query: where the ground is and its surface normal. */
export interface GroundSample {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
}

/** Minimal ground query the rig needs: cast a downward ray and report the first ground hit. */
export interface GroundRaycaster {
  raycastDown(origin: Vec3, maxDistance: number): GroundSample | undefined;
}

/**
 * Analytic ground query from a height function — deterministic and physics-free, ideal for tests
 * and procedural terrain. `heightAt` returns the ground height (and optional normal) at an (x, z).
 */
export function createHeightFieldGround(heightAt: (x: number, z: number) => { height: number; normal?: Vec3 }): GroundRaycaster {
  return {
    raycastDown(origin: Vec3, maxDistance: number): GroundSample | undefined {
      const { height, normal } = heightAt(origin[0], origin[2]);
      const distance = origin[1] - height;
      if (distance < 0 || distance > maxDistance) return undefined;
      return { point: [origin[0], height, origin[2]], normal: normal ?? [0, 1, 0], distance };
    }
  };
}

/**
 * Moving-platform ground adapter (E2): wraps any base `GroundRaycaster` (terrain heightfield,
 * physics raycaster, …) and adds the platform's current vertical offset under feet standing
 * on it. `platformHeightAt` returns the platform top height at (x, z), or `undefined` when no
 * platform is under the query point — in which case the base ground answer is used unchanged.
 * The platform offset is also reported so callers can carry a locked foot with the platform.
 */
export function createMovingPlatformGround(
  base: GroundRaycaster,
  platformHeightAt: (x: number, z: number) => number | undefined
): GroundRaycaster & { platformOffsetAt(x: number, z: number): number | undefined } {
  return {
    raycastDown(origin: Vec3, maxDistance: number): GroundSample | undefined {
      const platformHeight = platformHeightAt(origin[0], origin[2]);
      const baseHit = base.raycastDown(origin, maxDistance);
      if (platformHeight === undefined) return baseHit;
      const platformDistance = origin[1] - platformHeight;
      if (platformDistance < 0 || platformDistance > maxDistance) return baseHit;
      if (!baseHit || platformDistance <= baseHit.distance) {
        return { point: [origin[0], platformHeight, origin[2]], normal: [0, 1, 0], distance: platformDistance };
      }
      return baseHit;
    },
    platformOffsetAt(x: number, z: number): number | undefined {
      return platformHeightAt(x, z);
    }
  };
}

/** One leg: the hip (root), knee (mid), ankle (end), and an optional pole/knee hint. */
export interface FootLegInput {
  readonly side: "left" | "right";
  readonly hip: Vec3;
  readonly knee: Vec3;
  readonly ankle: Vec3;
  readonly pole?: Vec3;
  /** Measured joint-to-sole offset for this leg; overrides the rig fallback. */
  readonly ankleHeight?: number;
  /** Authored contact phase. False always releases; true still requires a ground hit. */
  readonly contact?: boolean;
  /** Stable support identity plus its displacement since the preceding solve, in world units. */
  readonly support?: { readonly id: string; readonly delta: Vec3 };
}

export interface FootIkRigOptions {
  readonly legs: readonly FootLegInput[];
  readonly raycaster: GroundRaycaster;
  /** Height the ankle joint sits above the ground contact point (default 0.035). */
  readonly ankleHeight?: number;
  /** How far above the ankle to start the downward ray (default 0.6). */
  readonly rayStartHeight?: number;
  /** Max ray distance (default 2). */
  readonly maxRayDistance?: number;
  /** Foot is in stance (locks) when its height above the ground target is ≤ this (default 0.02). */
  readonly plantThreshold?: number;
  /** Hip-drop factor applied to the deepest required correction (default 0.72, matches fixture). */
  readonly hipDropFactor?: number;
}

export interface SolvedLeg {
  readonly side: "left" | "right";
  readonly sample: FootIkSample;
  /** Solved joint chain (write these back onto the skeleton). */
  readonly hip: Vec3;
  readonly knee: Vec3;
  readonly ankle: Vec3;
  /** True while the foot is locked to a world position (stance). */
  readonly locked: boolean;
  readonly reached: boolean;
}

export interface FootIkSolveResult {
  readonly feet: readonly SolvedLeg[];
  /** Vertical hip offset (≤ 0) so the lower planted foot can reach the ground. */
  readonly hipOffset: number;
  readonly groundedFeet: number;
  readonly averageTargetError: number;
}

interface LegLockState {
  locked: boolean;
  lockedPosition: Vec3;
  /** Whether the lock sits on a moving platform (carried each solve). */
  onPlatform: boolean;
  supportId?: string;
}

/** Platform-top height under the foot when the ground query is a platform adapter. */
function readPlatformTop(raycaster: GroundRaycaster, foot: Vec3): number | undefined {
  const maybe = raycaster as Partial<{ platformOffsetAt(x: number, z: number): number | undefined }>;
  if (typeof maybe.platformOffsetAt !== "function") return undefined;
  return maybe.platformOffsetAt(foot[0], foot[2]);
}

export interface FootIkRig {
  /**
   * Solve foot placement for the current pose. Pass updated leg transforms (e.g. sampled from the
   * animation) via `pose.legs`, or omit to reuse the legs the rig was created with. Optionally
   * override the ground query for this frame.
   */
  solveFootPlacement(pose?: { legs?: readonly FootLegInput[] }, groundQuery?: GroundRaycaster): FootIkSolveResult;
  /** Whether a given side is currently foot-locked. */
  isLocked(side: "left" | "right"): boolean;
  /** Clear all foot-lock state (e.g. on teleport / respawn). */
  reset(): void;
}

/** Create a foot-IK rig. Foot-lock state persists across `solveFootPlacement` calls. */
export function createFootIkRig(options: FootIkRigOptions): FootIkRig {
  const ankleHeight = options.ankleHeight ?? 0.035;
  const rayStartHeight = options.rayStartHeight ?? 0.6;
  const maxRayDistance = options.maxRayDistance ?? 2;
  const plantThreshold = options.plantThreshold ?? 0.02;
  const hipDropFactor = options.hipDropFactor ?? 0.72;
  let legs = options.legs;
  const locks = new Map<"left" | "right", LegLockState>();

  function lockFor(side: "left" | "right"): LegLockState {
    let state = locks.get(side);
    if (!state) {
      state = { locked: false, lockedPosition: [0, 0, 0], onPlatform: false };
      locks.set(side, state);
    }
    return state;
  }

  return {
    solveFootPlacement(pose, groundQuery) {
      const raycaster = groundQuery ?? options.raycaster;
      if (pose?.legs) legs = pose.legs;
      const solved: SolvedLeg[] = [];
      let deepestCorrection = 0;
      for (const leg of legs) {
        const lock = lockFor(leg.side);
        const result = solveLeg(leg, lock, raycaster, { ankleHeight: leg.ankleHeight ?? ankleHeight, rayStartHeight, maxRayDistance, plantThreshold });
        solved.push(result);
        // Stance legs only: a swing foot hangs above its ground target by design, and its
        // "correction" would inflate the pelvis drop and bury the planted feet.
        if (result.sample.grounded) {
          deepestCorrection = Math.max(deepestCorrection, Math.max(0, result.sample.verticalCorrection));
        }
      }
      const hipOffset = round(-deepestCorrection * hipDropFactor);
      refineOverExtendedLegs(legs, solved, hipOffset);
      const groundedFeet = solved.filter((leg) => leg.sample.grounded).length;
      const averageTargetError = solved.length === 0
        ? 0
        : round(solved.reduce((sum, leg) => sum + leg.sample.targetError, 0) / solved.length);
      return { feet: solved, hipOffset, groundedFeet, averageTargetError };
    },
    isLocked(side) {
      return locks.get(side)?.locked ?? false;
    },
    reset() {
      locks.clear();
    }
  };
}

interface SolveParams {
  readonly ankleHeight: number;
  readonly rayStartHeight: number;
  readonly maxRayDistance: number;
  readonly plantThreshold: number;
}

function solveLeg(leg: FootLegInput, lock: LegLockState, raycaster: GroundRaycaster, params: SolveParams): SolvedLeg {
  const sourceAnkle = leg.ankle;
  const ground = raycaster.raycastDown(
    [sourceAnkle[0], sourceAnkle[1] + params.rayStartHeight, sourceAnkle[2]],
    params.rayStartHeight + params.maxRayDistance
  );

  if (!ground) {
    // No ground under the foot (airborne / off the edge): release the lock and pass the pose through.
    lock.locked = false;
    return {
      side: leg.side,
      sample: {
        side: leg.side,
        sourceFoot: sourceAnkle,
        plantedFoot: sourceAnkle,
        groundNormal: [0, 1, 0],
        grounded: false,
        verticalCorrection: 0,
        targetError: 0
      },
      hip: leg.hip,
      knee: leg.knee,
      ankle: sourceAnkle,
      locked: false,
      reached: true
    };
  }

  const groundTargetY = ground.point[1] + params.ankleHeight;
  const heightAboveGround = sourceAnkle[1] - groundTargetY;
  const inStance = leg.contact ?? (heightAboveGround <= params.plantThreshold);
  if (lock.locked && lock.supportId !== leg.support?.id) lock.locked = false;
  if (lock.locked && leg.support) {
    if (leg.support.delta.some(value => !Number.isFinite(value))) throw new Error("Foot support displacement must be finite.");
    lock.lockedPosition = [
      lock.lockedPosition[0] + leg.support.delta[0],
      lock.lockedPosition[1] + leg.support.delta[1],
      lock.lockedPosition[2] + leg.support.delta[2]
    ];
  }
  const platformTop = readPlatformTop(raycaster, sourceAnkle);
  // The winning surface is the platform exactly when its top matches the raycast hit.
  const overPlatform = platformTop !== undefined && platformTop >= ground.point[1] - 1e-6;

  let target: Vec3;
  if (inStance) {
    if (!lock.locked) {
      // Just entered stance: plant the foot at the ground point under it.
      lock.locked = true;
      lock.lockedPosition = [sourceAnkle[0], groundTargetY, sourceAnkle[2]];
      lock.onPlatform = overPlatform;
      lock.supportId = leg.support?.id;
    } else if (lock.onPlatform) {
      if (overPlatform && platformTop !== undefined) {
        // Carry a platform-locked foot with the platform top (E2 moving platforms).
        lock.lockedPosition = [lock.lockedPosition[0], platformTop + params.ankleHeight, lock.lockedPosition[2]];
      } else {
        // The platform left from under the foot: release so the foot is not dragged through air.
        lock.locked = false;
        lock.onPlatform = false;
      }
    }
    // Hold the locked world position so the foot does not slide while it should be stationary.
    target = lock.locked ? lock.lockedPosition : [sourceAnkle[0], groundTargetY, sourceAnkle[2]];
  } else {
    // Swing phase: release the lock; the foot follows above the ground under it.
    lock.locked = false;
    target = [sourceAnkle[0], Math.max(sourceAnkle[1], groundTargetY), sourceAnkle[2]];
  }

  // Blend IK in fully during stance, fade out across the swing so the leg returns to the clip pose.
  const weight = inStance ? 1 : clamp(1 - heightAboveGround / 0.25, 0, 1);
  const solved: TwoBoneIkResult = solveTwoBoneIk({
    root: leg.hip,
    mid: leg.knee,
    end: leg.ankle,
    // Blend the target before solving; interpolating solved knee/ankle positions
    // shortens the bones during swing blending.
    target: [sourceAnkle[0]+(target[0]-sourceAnkle[0])*weight, sourceAnkle[1]+(target[1]-sourceAnkle[1])*weight, sourceAnkle[2]+(target[2]-sourceAnkle[2])*weight],
    pole: leg.pole,
    weight: 1
  });

  const verticalCorrection = round(sourceAnkle[1] - target[1]);
  const targetError = round(solved.endDistanceToTarget);
  return {
    side: leg.side,
    sample: {
      side: leg.side,
      sourceFoot: roundVec(sourceAnkle),
      plantedFoot: roundVec(target),
      groundNormal: roundVec(ground.normal),
      grounded: inStance,
      verticalCorrection,
      targetError
    },
    hip: leg.hip,
    knee: roundVec(solved.mid),
    ankle: roundVec(solved.end),
    locked: lock.locked,
    reached: solved.reached
  };
}

/**
 * Second IK pass for legs the pelvis drop serves. Phase one solves from the animated hip
 * and reports its miss; the drop then lowers the pelvis, and re-solving from the dropped
 * hip lands the foot measurably closer this frame instead of chasing the ground over
 * several. Every leg is re-solved after a shared pelvis drop; leaving another knee
 * at its pre-drop position would change its upper segment length. The
 * whole leg translates rigidly (root, mid, end all shift by the drop) so the solver
 * derives the true bone lengths — dropping only the root would shorten the implied reach
 * by exactly the drop and gain nothing. `hip` stays pre-drop — the caller applies
 * `hipOffset` to the hip write-back — so only knee/ankle/reached/error refresh here.
 * Lock state is untouched: this is pure IK.
 */
function refineOverExtendedLegs(legs: readonly FootLegInput[], solved: SolvedLeg[], hipOffset: number): void {
  if (hipOffset >= 0) return;
  for (let index = 0; index < solved.length; index += 1) {
    const result = solved[index];
    const leg = legs[index];
    if (!result || !leg) continue;
    const drop = (value: Vec3): Vec3 => [value[0], value[1] + hipOffset, value[2]];
    const refined = solveTwoBoneIk({
      root: drop(leg.hip),
      mid: drop(leg.knee),
      end: drop(leg.ankle),
      target: result.locked ? result.sample.plantedFoot : result.ankle,
      pole: leg.pole,
      weight: 1
    });
    solved[index] = {
      ...result,
      knee: roundVec(refined.mid),
      ankle: roundVec(refined.end),
      reached: refined.reached,
      sample: { ...result.sample, targetError: round(refined.endDistanceToTarget) }
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Column-major affine mat4 × point (w divide for non-TRS safety). */
function mulMat4Point(m: Float32Array | readonly number[], p: Vec3): Vec3 {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]! || 1;
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w
  ];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function roundVec(value: Vec3): Vec3 {
  return [round(value[0]), round(value[1]), round(value[2])];
}

// ---------------------------------------------------------------------------
// T3.2 — pose-space foot-IK constraint (`FootIkConstraintSpec`, PRD-06 §7.1):
// consumes `solveTwoBoneIkRotations` directly on a PoseBuffer instead of the
// legacy position-space leg input. Pelvis offset is the MINIMUM of the
// per-foot ground deltas (each grounded foot's required vertical correction),
// clamped to `maxPelvisDrop` — replaces the legacy fixed `hipDropFactor`
// (0.72) on this path. Foot tilt aligns the foot bone's up axis to the ground
// normal, capped at `maxFootTiltDeg` (default 35°).
// ---------------------------------------------------------------------------

import { solveTwoBoneIkRotations, type TwoBoneIkConstraintSpec } from "./IK.js";
import type { PoseBuffer } from "./pose/PoseBuffer.js";
import type { SkeletonBinding } from "./pose/SkeletonBinding.js";

export interface FootIkConstraintSpec {
  /** One two-bone leg spec per leg (root/mid/tip name the thigh/knee/ankle joints). */
  readonly legs: readonly (TwoBoneIkConstraintSpec & {
    /** Ankle joint height above the sole contact point (default 0.035 m). */
    readonly ankleHeight?: number;
  })[];
  /** Scene-supplied ground query (C-26 interface). */
  readonly ground: GroundRaycaster;
  /** Optional pelvis bone — dropped by the deepest required correction. */
  readonly pelvis?: string;
  /** Maximum pelvis drop in metres (default 0.4). */
  readonly maxPelvisDrop?: number;
  /** Maximum sole-normal tilt toward the ground normal (default 35°). */
  readonly maxFootTiltDeg?: number;
  /** Feet already planted (within `plantThreshold`) keep their current pose when true. */
  readonly lockOnContact?: boolean;
  /** Foot is planted when its required vertical correction is ≤ this (default 0.02 m). */
  readonly plantThreshold?: number;
  /** Ray origin offset above the ankle and max ray distance (defaults 0.6 / 2). */
  readonly rayStartHeight?: number;
  readonly maxRayDistance?: number;
}

interface FootIkFrame {
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly scale: Vec3;
}

function fkFrame(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): FootIkFrame {
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const scl = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!] as const;
  const pos = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!] as const;
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0 || parent >= skeleton.boneCount || parent === joint) {
    return { position: pos, rotation: rot, scale: scl };
  }
  const pf = fkFrame(pose, skeleton, parent);
  const scaled: Vec3 = [pos[0] * pf.scale[0], pos[1] * pf.scale[1], pos[2] * pf.scale[2]];
  const rotated = rotateVec3(pf.rotation, scaled);
  return {
    position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
    rotation: multiplyQuat(pf.rotation, rot),
    scale: [pf.scale[0] * scl[0], pf.scale[1] * scl[1], pf.scale[2] * scl[2]]
  };
}

function rotateVec3(q: readonly [number, number, number, number], v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
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

function axisAngle(axis: Vec3, radians: number): readonly [number, number, number, number] {
  const half = radians / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function jointIndex(skeleton: SkeletonBinding, name: string): number {
  const indices = skeleton.jointIndicesByName.get(name);
  if (!indices || indices.length === 0) throw new Error(`FootIkConstraint: unknown bone "${name}".`);
  return indices[0]!;
}

/**
 * T3.2 — evaluate a foot-IK constraint on a pose: for each leg, raycast the
 * ground under the ankle, drop the pelvis by the deepest required correction
 * (min of per-foot deltas, clamped to `maxPelvisDrop`), solve each leg's
 * rotations toward `ground.point + normal * ankleHeight`, then tilt each foot
 * bone toward the ground normal capped at `maxFootTiltDeg`.
 *
 * Returns per-leg telemetry (grounded, correction applied, tilt degrees) for
 * the §17.3 foot-surface diagnostic.
 */
export function solveFootIkConstraint(
  pose: PoseBuffer,
  skeleton: SkeletonBinding,
  modelMatrix: Float32Array | readonly number[],
  spec: FootIkConstraintSpec
): readonly { readonly leg: number; readonly grounded: boolean; readonly verticalCorrection: number; readonly tiltDeg: number }[] {
  const ankleHeightDefault = 0.035;
  const rayStartHeight = spec.rayStartHeight ?? 0.6;
  const maxRayDistance = spec.maxRayDistance ?? 2;
  const plantThreshold = spec.plantThreshold ?? 0.02;
  const maxPelvisDrop = spec.maxPelvisDrop ?? 0.4;
  const maxFootTiltDeg = spec.maxFootTiltDeg ?? 35;

  // Pass 1 — per-foot ground deltas (world Y corrections needed to plant).
  interface LegPlan {
    readonly spec: TwoBoneIkConstraintSpec & { readonly ankleHeight?: number };
    readonly index: number;
    readonly ankleIndex: number;
    readonly target: Vec3;
    readonly normal: Vec3;
    readonly deltaY: number;
    readonly grounded: boolean;
  }
  const plans: LegPlan[] = [];
  for (const [index, leg] of spec.legs.entries()) {
    const ankleIndex = jointIndex(skeleton, leg.tip);
    const ankle = fkFrame(pose, skeleton, ankleIndex).position;
    // Model matrix is applied inside the solver; raycast in MODEL space via
    // world coords — the scene's GroundRaycaster is defined in world space and
    // T3.9 supplies an analytic caster in world units, so keep model space for
    // simple rigs (identity or translation-only model matrices).
    const hit = spec.ground.raycastDown(
      [ankle[0], ankle[1] + rayStartHeight, ankle[2]],
      rayStartHeight + maxRayDistance
    );
    if (!hit) continue;
    const ankleHeight = leg.ankleHeight ?? ankleHeightDefault;
    const target: Vec3 = [
      hit.point[0] + hit.normal[0] * 0,
      hit.point[1] + hit.normal[1] * ankleHeight,
      hit.point[2] + hit.normal[2] * 0
      // Sole offsets along X/Z by the normal's horizontal part are
      // intentionally ignored — the ankle sits directly over the contact.
    ];
    const deltaY = target[1] - ankle[1];
    const grounded = Math.abs(deltaY) <= plantThreshold;
    plans.push({ spec: leg, index, ankleIndex, target, normal: hit.normal, deltaY, grounded });
  }
  if (plans.length === 0) return [];

  // Pelvis drop = MINIMUM per-foot delta (deepest needed correction), clamped.
  // The correction is expressed in pose space; the pelvis node's local
  // translation lives in its parent frame, whose up axis need not be +Y and
  // whose units need not be pose units (e.g. cm under a scaled glTF root) —
  // map (0, drop, 0) through the parent frame's inverse rotation and scale.
  if (spec.pelvis) {
    const pelvisIndex = jointIndex(skeleton, spec.pelvis);
    const minDelta = Math.min(0, ...plans.map((plan) => plan.deltaY));
    const drop = Math.max(-maxPelvisDrop, minDelta);
    if (drop !== 0) {
      const parentIndex = skeleton.parentIndices[pelvisIndex] ?? -1;
      const parentFrame = parentIndex >= 0 && parentIndex < skeleton.boneCount ? fkFrame(pose, skeleton, parentIndex) : undefined;
      if (parentFrame !== undefined) {
        const invRot: readonly [number, number, number, number] = [-parentFrame.rotation[0], -parentFrame.rotation[1], -parentFrame.rotation[2], parentFrame.rotation[3]];
        const dir = rotateVec3(invRot, [0, drop, 0]);
        const sx = parentFrame.scale[0] || 1, sy = parentFrame.scale[1] || 1, sz = parentFrame.scale[2] || 1;
        pose.positions[pelvisIndex * 3] = pose.positions[pelvisIndex * 3]! + dir[0] / sx;
        pose.positions[pelvisIndex * 3 + 1] = pose.positions[pelvisIndex * 3 + 1]! + dir[1] / sy;
        pose.positions[pelvisIndex * 3 + 2] = pose.positions[pelvisIndex * 3 + 2]! + dir[2] / sz;
      } else {
        pose.positions[pelvisIndex * 3 + 1] = pose.positions[pelvisIndex * 3 + 1]! + drop;
      }
    }
  }

  // Pass 2 — solve legs + tilt feet.
  const results: { leg: number; grounded: boolean; verticalCorrection: number; tiltDeg: number }[] = [];
  for (const plan of plans) {
    if (spec.lockOnContact && plan.grounded) {
      results.push({ leg: plan.index, grounded: true, verticalCorrection: 0, tiltDeg: 0 });
      continue;
    }
    // `solveTwoBoneIkRotations` takes a WORLD-space target (it maps the target
    // back to model space via invertTRS(modelMatrix)); `plan.target` is model
    // space — lift it to world or the mount transform is applied twice and the
    // ankle aims past the real terrain.
    solveTwoBoneIkRotations(pose, skeleton, modelMatrix, plan.spec, mulMat4Point(modelMatrix, plan.target));

    // Foot tilt: rotate the tip bone so its local +Y (sole normal) matches the
    // ground normal, capped at maxFootTiltDeg — applied in the tip's parent frame.
    const frame = fkFrame(pose, skeleton, plan.ankleIndex);
    const up = rotateVec3(frame.rotation, [0, 1, 0]);
    const tiltQ = quatFromUnitVectors(up, plan.normal);
    const tiltAngle = Math.acos(Math.max(-1, Math.min(1, tiltQ[3]))) * 2 * (180 / Math.PI);
    const capped = Math.min(tiltAngle, maxFootTiltDeg);
    if (capped > 1e-4 && tiltAngle > 1e-4) {
      const axis = [
        up[1] * plan.normal[2] - up[2] * plan.normal[1],
        up[2] * plan.normal[0] - up[0] * plan.normal[2],
        up[0] * plan.normal[1] - up[1] * plan.normal[0]
      ] as Vec3;
      const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
      if (axisLen > 1e-6) {
        const nAxis: Vec3 = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
        const applied = axisAngle(nAxis, (capped * Math.PI) / 180);
        const newWorld = multiplyQuat(applied, frame.rotation);
        const parent = skeleton.parentIndices[plan.ankleIndex] ?? -1;
        const parentRot: readonly [number, number, number, number] = parent >= 0
          ? fkFrame(pose, skeleton, parent).rotation
          : [0, 0, 0, 1];
        const inv: readonly [number, number, number, number] = [-parentRot[0], -parentRot[1], -parentRot[2], parentRot[3]];
        const local = multiplyQuat(inv, newWorld);
        const l = Math.hypot(local[0], local[1], local[2], local[3]) || 1;
        pose.rotations[plan.ankleIndex * 4] = local[0] / l;
        pose.rotations[plan.ankleIndex * 4 + 1] = local[1] / l;
        pose.rotations[plan.ankleIndex * 4 + 2] = local[2] / l;
        pose.rotations[plan.ankleIndex * 4 + 3] = local[3] / l;
      }
    }
    results.push({ leg: plan.index, grounded: false, verticalCorrection: plan.deltaY, tiltDeg: Math.min(tiltAngle, maxFootTiltDeg) });
  }
  return results;
}
