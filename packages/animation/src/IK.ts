import { lerpVec3, type Vec3 } from "./Keyframe.js";

export interface TwoBoneIkInput {
  readonly root: Vec3;
  readonly mid: Vec3;
  readonly end: Vec3;
  readonly target: Vec3;
  readonly pole?: Vec3;
  readonly weight?: number;
  readonly allowStretch?: boolean;
}

export interface TwoBoneIkResult {
  readonly root: Vec3;
  readonly mid: Vec3;
  readonly end: Vec3;
  readonly reached: boolean;
  readonly stretched: boolean;
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly targetDistance: number;
  readonly endDistanceToTarget: number;
  readonly poleInfluence: number;
}

export function solveTwoBoneIk(input: TwoBoneIkInput): TwoBoneIkResult {
  const weight = clamp(input.weight ?? 1, 0, 1);
  const upperLength = distance(input.root, input.mid);
  const lowerLength = distance(input.mid, input.end);
  if (upperLength <= 1e-6 || lowerLength <= 1e-6) {
    throw new Error("Two-bone IK requires non-zero upper and lower segment lengths.");
  }
  const targetDelta = subtract(input.target, input.root);
  const targetDistance = length(targetDelta);
  if (targetDistance <= 1e-6) {
    throw new Error("Two-bone IK target must be distinct from the root.");
  }

  const maxReach = upperLength + lowerLength;
  const minReach = Math.abs(upperLength - lowerLength) + 1e-5;
  const solveDistance = input.allowStretch ? targetDistance : clamp(targetDistance, minReach, maxReach - 1e-5);
  const axis = normalize(targetDelta);
  const poleDirection = projectedPoleDirection(input.root, axis, input.pole ?? input.mid);
  const adjacent = clamp((upperLength * upperLength + solveDistance * solveDistance - lowerLength * lowerLength) / (2 * solveDistance), 0, upperLength);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - adjacent * adjacent));
  const solvedEnd = add(input.root, scale(axis, solveDistance));
  const solvedMid = add(add(input.root, scale(axis, adjacent)), scale(poleDirection, height));
  const mid = lerpVec3(input.mid, solvedMid, weight);
  const end = lerpVec3(input.end, solvedEnd, weight);
  const endDistanceToTarget = distance(end, input.target);
  return {
    root: input.root,
    mid,
    end,
    reached: endDistanceToTarget <= 1e-3,
    stretched: targetDistance > maxReach && input.allowStretch === true,
    upperLength,
    lowerLength,
    targetDistance,
    endDistanceToTarget,
    poleInfluence: Math.abs(dot(normalize(subtract(mid, input.root)), poleDirection))
  };
}

function projectedPoleDirection(root: Vec3, axis: Vec3, pole: Vec3): Vec3 {
  const poleDelta = subtract(pole, root);
  const projected = subtract(poleDelta, scale(axis, dot(poleDelta, axis)));
  const projectedLength = length(projected);
  if (projectedLength > 1e-6) return scale(projected, 1 / projectedLength);
  const fallback = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] as const : [1, 0, 0] as const;
  const fallbackProjected = subtract(fallback, scale(axis, dot(fallback, axis)));
  return normalize(fallbackProjected);
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function distance(left: Vec3, right: Vec3): number {
  return length(subtract(left, right));
}

function normalize(value: Vec3): Vec3 {
  const valueLength = length(value);
  if (valueLength <= 1e-6) return [0, 1, 0];
  return scale(value, 1 / valueLength);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
