// Fresh authored level data for the rebuilt Skyline Runner. Rects are plain
// typed data consumed by `game.platformer` — no generated game-geometry and
// no world-GLB surface binding. Motion (gravity/jump/run) is derived in
// main.ts from these rects via the shared `solvePlatformerMotion` solver.
import type { solvePlatformerMotion } from "@aura3d/engine";

export type SkylineMotion = ReturnType<typeof solvePlatformerMotion>;

/** Player height in world units; the hero rig is scaled to this. */
export const SKYLINE_PLAYER_HEIGHT = 0.9;
export const SKYLINE_PLAYER_SIZE: readonly [number, number] = [0.55, SKYLINE_PLAYER_HEIGHT];

export const SKYLINE_START = { x: 0, y: 0.4 } as const;
export const SKYLINE_FINISH = { x: 23, y: 1.3 } as const;

// Gaps are 0.9 and rises 0.4 — comfortably inside the solved jump reach
// (~1.9 at equal height) so a late jump still lands.
export const SKYLINE_PLATFORMS = [
  { id: "launch", x: -1, y: 0, width: 5.5, height: 0.4 },
  { id: "step", x: 5.4, y: 0.45, width: 3.4, height: 0.35 },
  { id: "mid", x: 9.7, y: 0.85, width: 3.8, height: 0.35 },
  { id: "high", x: 14.4, y: 1.25, width: 3.2, height: 0.35 },
  { id: "finish-run", x: 18.5, y: 0.9, width: 5.4, height: 0.4 }
] as const;

// Bonus mover above the mid platform: optional coin route, not required for
// traversal, so its phase can never gate completion.
export const SKYLINE_MOVING_PLATFORMS = [
  { id: "bonus-lift", x: 10, y: 2.75, width: 1.6, height: 0.22, axis: "x" as const, amplitude: 0.8, period: 3.2 }
] as const;

export const SKYLINE_COLLECTIBLES = [
  { id: "coin-01", x: 1.5, y: 1.3, value: 50, radius: 0.6 },
  { id: "coin-02", x: 6.9, y: 1.7, value: 50, radius: 0.6 },
  { id: "coin-03", x: 11.6, y: 2.1, value: 75, radius: 0.6 },
  { id: "coin-04", x: 15.9, y: 2.5, value: 75, radius: 0.6 },
  { id: "coin-05", x: 21, y: 2.2, value: 100, radius: 0.6 },
  { id: "coin-bonus", x: 10.8, y: 3.65, value: 150, radius: 0.6 }
] as const;

// Missed-jump hazard in the second gap: punishes a fall without ever
// intersecting a platform rect.
export const SKYLINE_HAZARDS = [
  { id: "gap-spikes", x: 8.95, y: -0.6, width: 0.7, height: 0.3 }
] as const;

export const SKYLINE_CHECKPOINTS = [
  { id: "mid", x: 10.4, y: 1.45, radius: 0.8 }
] as const;

export const SKYLINE_LOWER_BOUND = -3;

/** Assemble the kit level from the authored data + a solved motion profile. */
export function buildSkylineLevel(motion: SkylineMotion) {
  return {
    id: "skyline-runner",
    start: SKYLINE_START,
    finish: SKYLINE_FINISH,
    platforms: SKYLINE_PLATFORMS,
    movingPlatforms: SKYLINE_MOVING_PLATFORMS,
    collectibles: SKYLINE_COLLECTIBLES,
    hazards: SKYLINE_HAZARDS,
    checkpoints: SKYLINE_CHECKPOINTS,
    lowerBound: SKYLINE_LOWER_BOUND,
    playerSize: SKYLINE_PLAYER_SIZE,
    lives: 3,
    gravity: motion.gravity,
    jumpVelocity: motion.jumpVelocity,
    moveSpeed: motion.moveSpeed,
    coyoteMs: motion.coyoteMs,
    jumpBufferMs: motion.jumpBufferMs,
    fallGravityMultiplier: motion.fallGravityMultiplier,
    dashSpeed: motion.moveSpeed * 1.8
  };
}
