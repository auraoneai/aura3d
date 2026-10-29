// Pip's Big Leap — time-trial medal derivation (pure, unit-tested).
//
// An "expert run" is the straight run along the course at full speed: spawn,
// every walkable platform in course order (side ledges included, because the
// required seeds sit on them), then the Sun-Gate. Waits are added where the
// course forces them: a quarter period per moving platform, half the off
// window per timed platform, swim pockets at swim speed, and three full
// Brambleback cycles (roll 1.7 s + wind-up 0.95 s + rest 1.8 s) in the boss
// world. Gold is that expert time plus 20%; silver is 1.5x gold and bronze
// 2x gold.

import type { WorldSpec } from "./types.js";

export interface Medals {
  readonly gold: number;
  readonly silver: number;
  readonly bronze: number;
}

const BOSS_CYCLE_SECONDS = 1.7 + 0.95 + 1.8;

export function expertSeconds(spec: WorldSpec, moveSpeed: number, swimMoveSpeed: number): number {
  const walkable = spec.platforms.filter((p) => !p.ghost);
  const points: { x: number; z: number }[] = [
    { x: spec.spawn[0], z: spec.spawn[2] },
    ...walkable.map((p) => ({ x: p.x, z: p.z })),
    { x: spec.gate.x, z: spec.gate.z }
  ];
  let path = 0;
  for (let i = 1; i < points.length; i += 1) path += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  let seconds = path / moveSpeed;
  for (const p of walkable) {
    if (p.mover) seconds += p.mover.period * 0.25;
    if (p.timed) seconds += p.timed.period * (1 - p.timed.onFrac) * 0.5;
  }
  for (const w of spec.waters) seconds += w.d * (1 / swimMoveSpeed - 1 / moveSpeed);
  if (spec.boss) seconds += 3 * BOSS_CYCLE_SECONDS;
  return seconds;
}

export function medalsFor(expert: number): Medals {
  const gold = Math.ceil(expert * 1.2);
  return { gold, silver: Math.round(gold * 1.5), bronze: Math.round(gold * 2) };
}
