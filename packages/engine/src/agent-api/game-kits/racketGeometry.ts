import type { AuraRuntimeNodeHandle } from "../index";

export type RacketVec3 = readonly [number, number, number];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function directionToEulerXYZ(dx: number, dy: number, dz: number): [number, number, number] {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const rx = Math.asin(clamp(uz, -1, 1));
  const ry = 0;
  const rz = Math.atan2(-ux, uy);
  return [rx, ry, rz];
}

export function orientCylinderBetween(
  handle: AuraRuntimeNodeHandle | undefined,
  a: RacketVec3,
  b: RacketVec3,
  radiusX: number,
  radiusZ = radiusX
): void {
  if (!handle) return;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.max(0.001, Math.hypot(dx, dy, dz));
  const mid: [number, number, number] = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
  const rot = directionToEulerXYZ(dx, dy, dz);
  handle
    .setPosition(mid[0], mid[1], mid[2])
    .setRotation(rot[0], rot[1], rot[2])
    .setScale([radiusX, len, radiusZ])
    .setVisible(true);
}

export function solveArmElbow(
  shoulder: RacketVec3,
  hand: RacketVec3,
  sideSign: number,
  upperLen = 0.3,
  lowerLen = 0.285
): [number, number, number] {
  const sx = hand[0] - shoulder[0];
  const sy = hand[1] - shoulder[1];
  const sz = hand[2] - shoulder[2];
  const dist = Math.max(0.001, Math.hypot(sx, sy, sz));
  const wx = sx / dist;
  const wy = sy / dist;
  const wz = sz / dist;
  let bx = sideSign * 0.8;
  let by = -0.45;
  let bz = 0.9;
  const dot = bx * wx + by * wy + bz * wz;
  bx -= wx * dot;
  by -= wy * dot;
  bz -= wz * dot;
  const bLen = Math.hypot(bx, by, bz) || 1;
  bx /= bLen;
  by /= bLen;
  bz /= bLen;
  const along = (upperLen * upperLen - lowerLen * lowerLen + dist * dist) / (2 * dist);
  const bend = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));
  return [
    shoulder[0] + wx * along + bx * bend,
    shoulder[1] + wy * along + by * bend,
    shoulder[2] + wz * along + bz * bend
  ];
}

export function localToWorld(
  rootPos: RacketVec3,
  yaw: number,
  scale: RacketVec3,
  local: RacketVec3
): [number, number, number] {
  const sx = local[0] * scale[0];
  const sy = local[1] * scale[1];
  const sz = local[2] * scale[2];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    rootPos[0] + sx * c + sz * s,
    rootPos[1] + sy,
    rootPos[2] - sx * s + sz * c
  ];
}

export function localDirToWorld(yaw: number, dir: RacketVec3): [number, number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
}

