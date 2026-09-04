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
        const result = solveLeg(leg, lock, raycaster, { ankleHeight, rayStartHeight, maxRayDistance, plantThreshold });
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
  const inStance = heightAboveGround <= params.plantThreshold;
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
    target,
    pole: leg.pole,
    weight
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
 * several. Only legs that needed the drop (positive vertical correction) refine; the rest
 * keep phase-one targets and let their knees absorb the pelvis motion by bending. The
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
    if (!result || !leg || result.sample.verticalCorrection <= 0) continue;
    const drop = (value: Vec3): Vec3 => [value[0], value[1] + hipOffset, value[2]];
    const refined = solveTwoBoneIk({
      root: drop(leg.hip),
      mid: drop(leg.knee),
      end: drop(leg.ankle),
      target: result.sample.plantedFoot,
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

function round(value: number): number {
  return Number(value.toFixed(4));
}

function roundVec(value: Vec3): Vec3 {
  return [round(value[0]), round(value[1]), round(value[2])];
}
