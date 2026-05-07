import { Vector2 } from "./Vector2.js";
import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";

export function clamp(value: number, min = 0, max = 1): number {
  if (min > max) throw new RangeError("min must be <= max");
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) throw new RangeError("inverseLerp requires distinct endpoints");
  return (value - a) / (b - a);
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp(inverseLerp(edge0, edge1, value));
  return t * t * (3 - 2 * t);
}

export function lerpVector2(a: Vector2, b: Vector2, t: number): Vector2 {
  return a.lerp(b, t);
}

export function lerpVector3(a: Vector3, b: Vector3, t: number): Vector3 {
  return a.lerp(b, t);
}

export function lerpVector4(a: Vector4, b: Vector4, t: number): Vector4 {
  return a.lerp(b, t);
}
