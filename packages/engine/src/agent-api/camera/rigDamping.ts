/**
 * Shared scalar/tuple helpers for the camera-rig family (S19): extracted so a
 * rig can be pulled without the `GameCameraRigs` facade.
 */
import type { GameVec3 } from "../GameRuntime.js";

export function assertFinite(value: number, api: string, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${api} ${field} must be finite (received ${String(value)}).`);
  }
}

export function assertVec3(value: GameVec3, api: string, field: string): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`${api} ${field} must be a finite [x, y, z] tuple.`);
  }
}

export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

export function lerpTuple(a: GameVec3, b: GameVec3, alpha: number): GameVec3 {
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha
  ];
}
