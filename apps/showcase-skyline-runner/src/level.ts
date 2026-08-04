/**
 * The route's single level definition.
 *
 * `main.ts` and `level-proof.ts` both need the level, and both previously built it
 * themselves from `gameGeometryContract`. That duplication is why retuning the jump in
 * `main.ts` left the 60-second proof running the old, floaty tuning: two copies of the
 * same configuration, one of them stale. One module now owns it.
 */
import { game, solvePlatformerMotion } from "@aura3d/engine";

/**
 * Character height in world units, shared by the motion solver and the scene binding.
 *
 * Declared once so the jump and the player cannot disagree: a feel preset is scaled by this,
 * and `platformerSceneBinding` is given the same value.
 */
export const SKYLINE_CHARACTER_HEIGHT = 0.52;
import { gameGeometryContract } from "./generated/game-geometry";

/**
 * Motion for the course, from declared intent rather than from the level's tallest step.
 *
 * The route previously relied on `solvePlatformerMotion`'s geometry-derived apex:
 * `max(minApex, maxRise * apexHeadroom)`. On this course `maxRise` is 0.36, so the apex
 * came out at 0.684 with a 0.52-second airtime — the reported barely-there jump. The solver
 * was answering "can the character technically reach the next platform", not "is this a
 * jump worth pressing".
 *
 * Intent now leads. `feel: "responsive"` and the character's own height set the apex, and
 * the solver *validates* that against the level: if the declared jump could not clear the
 * tallest step it throws and names the offending geometry rather than quietly shrinking.
 *
 * `characterHeight` is the same 0.52 the scene binding uses for the player, so the jump
 * reads correctly relative to the character rather than to an absolute world number.
 */
export const skylineMotion = solvePlatformerMotion(gameGeometryContract.level.platforms ?? [], {
  feel: "responsive",
  characterHeight: SKYLINE_CHARACTER_HEIGHT,
  gapMargin: 1.5,
  /*
   * The reported session "ends in 20-30 seconds": the 16.6-unit course crosses in about 14
   * seconds of pure traversal at the old speed. Sizing move speed from an intended
   * multi-minute session is how a level gets its duration on purpose. The solver still
   * prefers gap clearance, so this is a target rather than a guarantee.
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
