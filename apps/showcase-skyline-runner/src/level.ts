/**
 * The route's single level definition.
 *
 * `main.ts` and `level-proof.ts` both need the level, and both previously built it
 * themselves from `gameGeometryContract`. That duplication is why retuning the jump in
 * `main.ts` left the 60-second proof running the old, floaty tuning: two copies of the
 * same configuration, one of them stale. One module now owns it.
 */
import { game, solvePlatformerMotion } from "@aura3d/engine";
import { gameGeometryContract } from "./generated/game-geometry";

/**
 * Motion derived from the level's own platform geometry.
 *
 * The contract ships `jumpVelocity: 7.4` and inherits the kit default `gravity: -22`,
 * giving a 1.245-unit apex and 0.673s of airtime against platforms that step up by at
 * most 0.36 units. Every jump rose roughly 3.5x higher than the tallest step it needed to
 * clear, which is the reported floating, the late landings, and the platforms reading as
 * unrelated strips rather than a connected route.
 *
 * `solvePlatformerMotion` sizes the apex to the tallest step plus headroom, derives
 * gravity and jump velocity from that apex and a chosen rise time, and sets move speed so
 * a full jump clears the widest gap and the course takes the intended session length.
 * Nothing here is hand-tuned: change the level geometry and the motion follows.
 */
export const skylineMotion = solvePlatformerMotion(gameGeometryContract.level.platforms ?? [], {
  // The one genuine feel parameter: a rise time in the snappy-but-not-twitchy band.
  riseSeconds: 0.26,
  apexHeadroom: 1.9,
  gapMargin: 1.5,
  /*
   * The reported session "ends in 20-30 seconds": the 16.6-unit course at the shipped
   * 1.15 units/second crosses in 14 seconds of pure traversal. Sizing move speed from an
   * intended multi-minute session is how a level gets its duration on purpose. The solver
   * still prefers gap clearance, so this is a target rather than a guarantee.
   */
  targetSessionSeconds: 180,
  traversalFraction: 0.4
});

/** The route's asset-bound level, with motion derived rather than authored. */
export function createSkylineLevel() {
  return game.assetBoundPlatformerLevel({
    characterAsset: "showcaseKenneyOobiPlatformerHero",
    worldAssetBindings: gameGeometryContract.worldAssetBindings,
    playableSurfaceMap: gameGeometryContract.surfaceMap,
    authoredPlayableSeconds: gameGeometryContract.authoredSeconds,
    minPlayableSeconds: 30,
    minCheckpoints: 6,
    level: {
      ...gameGeometryContract.level,
      gravity: skylineMotion.gravity,
      jumpVelocity: skylineMotion.jumpVelocity,
      moveSpeed: skylineMotion.moveSpeed,
      coyoteMs: skylineMotion.coyoteMs,
      jumpBufferMs: skylineMotion.jumpBufferMs
    }
  });
}
