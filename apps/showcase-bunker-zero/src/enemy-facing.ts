import { faceTowards, facingError, type ForwardAxis } from "@aura3d/engine/game";
import type { EnemyKind } from "./sim";

/**
 * Which local axis of each enemy GLB points out of its face. The Meshy models are the glTF default (+Z); the sim's `facing`
 * is a compass yaw where 0 looks down -Z, so the sim yaw cannot be handed to a node unchanged. Measured from the shipped files
 * by tests/unit/bunker-zero/enemy-facing.test.ts.
 */
export const ENEMY_FORWARD: Record<EnemyKind, ForwardAxis> = {
  guard: "+z",
  dog: "+z",
  gunner: "+z",
  boss: "+z"
};

/** Turn rate of the drawn enemy toward the sim heading, radians per second (a half turn takes about 0.25 s). */
export const ENEMY_TURN_RATE = 12.5;

/** The world direction the sim says the enemy looks along (the sim yaw is a compass angle: 0 looks down -Z). */
export function simHeading(facing: number): { x: number; z: number } {
  return { x: Math.sin(facing), z: -Math.cos(facing) };
}

/** Next node yaw for a drawn enemy: turns from `yaw` toward the sim heading with the model's own forward axis. */
export function nextEnemyYaw(yaw: number, kind: EnemyKind, simFacing: number, dt: number, forward: ForwardAxis = ENEMY_FORWARD[kind]): number {
  return faceTowards(yaw, { x: 0, z: 0 }, simHeading(simFacing), { forwardAxis: forward, turnRate: ENEMY_TURN_RATE, dt });
}

/** Angle in radians between where the drawn enemy looks and the direction (dx, dz) to the player. */
export function enemyFacingError(yaw: number, kind: EnemyKind, dx: number, dz: number, forward: ForwardAxis = ENEMY_FORWARD[kind]): number {
  return facingError(yaw, dx, dz, forward);
}
