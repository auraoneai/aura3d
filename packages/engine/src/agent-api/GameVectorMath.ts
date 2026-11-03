import type { GameVec3 } from "./GameRuntimeCore.js";

/** Copy an authored vector, or return its fallback when none was supplied. */
export function vec3(value: GameVec3 | undefined, fallback: GameVec3): GameVec3 {
  return value ? [value[0], value[1], value[2]] : fallback;
}

export function addVec3(a: GameVec3, b: GameVec3): GameVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
