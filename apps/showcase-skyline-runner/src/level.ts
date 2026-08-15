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
// Gameplay framing, not the isolated asset-probe size. At 0.52 the mascot
// occupied nearly a fifth of the finished 16:10 frame and visually flattened
// the traversal world into a backdrop. The smaller hero still clears the route
// readability floor while letting the next platforms, shards, and relay gate
// read as the primary decision space.
export const SKYLINE_CHARACTER_HEIGHT = 0.44;
/** Width of the certified hero collider at the rendered target height. */
export const SKYLINE_CHARACTER_WIDTH = SKYLINE_CHARACTER_HEIGHT * 0.45;
import { gameGeometryContract } from "./generated/game-geometry";
import {
  SKYLINE_LEVEL_ACTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_STRIDE
} from "./level-layout";
export {
  SKYLINE_LEVEL_ACTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_STRIDE,
  SKYLINE_TERRAIN_PROFILES,
  skylineTerrainWarp
} from "./level-layout";

export const SKYLINE_AUTHORED_PLAYABLE_SECONDS = 95;
export const SKYLINE_MIN_PLAYABLE_SECONDS = 70;
export const SKYLINE_MAX_TARGET_PLAYABLE_SECONDS = 115;

const sectionId = (section: number, id: string) =>
  `district-${section + 1}-${SKYLINE_SECTION_LAYOUTS[section]?.name ?? "unknown"}--${id}`;
const sectionOffset = (section: number) => section * SKYLINE_SECTION_STRIDE;
const pointX = (section: number, x: number) => sectionOffset(section) + x;
export const SKYLINE_FIRST_MID_CHECKPOINT_ID = gameGeometryContract.level.checkpoints[0]?.id ?? "start";
export const SKYLINE_FIRST_MID_CHECKPOINT_X = gameGeometryContract.level.checkpoints[0]?.x
  ?? gameGeometryContract.level.start.x;

// The generated contract is now extracted from the single 923-unit Level 1 GLB.
// Repeating it here would create a 27-minute collision course and reproduce the exact
// architecture defect this rebuild removes. These arrays are the one hash-bound course.
const extendedPlatforms = [...gameGeometryContract.level.platforms];
const extendedCheckpoints = gameGeometryContract.level.checkpoints.map((checkpoint) => ({
  ...checkpoint,
  // The authored beacon is wider than its original 0.9-unit radial trigger.
  // At responsive jump height a valid route pass could sail over the center and
  // finish with 05/6 relays despite visibly crossing every gate. Keep the trigger
  // bounded to the beacon silhouette while accepting that legitimate arc.
  radius: Math.max(checkpoint.radius ?? 0, 1.25)
}));
const extendedHazards = [...gameGeometryContract.level.hazards];

function nearestPlatform(section: number, localX: number) {
  const target = pointX(section, localX);
  return [...extendedPlatforms].sort((a, b) =>
    Math.abs((a.x + a.width / 2) - target) - Math.abs((b.x + b.width / 2) - target)
  )[0]!;
}

/**
 * Four typed-actor sentry encounters placed on certified platforms. Their collision boxes
 * are route gameplay, while `main.ts` places a real typed animated robot at the same point.
 */
export const SKYLINE_SENTRY_ENCOUNTERS = [2, 4, 5, 8].map((section, index) => ({
  id: sectionId(section, `relay-sentry-${index + 1}`),
  section,
  x: nearestPlatform(section, index % 2 === 0 ? 7.11 : 11.43).x +
    nearestPlatform(section, index % 2 === 0 ? 7.11 : 11.43).width / 2 - 0.13,
  y: nearestPlatform(section, index % 2 === 0 ? 7.11 : 11.43).y +
    nearestPlatform(section, index % 2 === 0 ? 7.11 : 11.43).height,
  width: 0.26,
  // Keep the collision body below the robot's visual antenna/head silhouette.
  // A full-height 0.4 box punished the hero after visibly clearing the body.
  height: 0.3,
  axis: "x" as const,
  amplitude: 0.55,
  period: 2.4 + index * 0.35,
  phase: index * 0.18,
  stompable: true
}));

export const SKYLINE_MOVING_PLATFORMS = [3, 6, 7].map((section, index) => {
  const platform = nearestPlatform(section, 9.2);
  return {
    id: sectionId(section, `lift-span-${index + 1}`),
    x: platform.x + platform.width * 0.15,
    y: platform.y + platform.height + 0.42 + index * 0.08,
    width: 1.05,
    height: 0.16,
    axis: (index === 1 ? "y" : "x") as "x" | "y",
    amplitude: index === 1 ? 0.38 : 0.72,
    period: 3.2 + index * 0.4,
    phase: index * 0.22
  };
});

// Only collectibles inside the certified base finish belong to that section. The old generated
// fixture also carried two unreachable draft coins beyond the finish; repeating those would turn
// stale data into apparent content.
const extendedCollectibles = SKYLINE_SECTION_LAYOUTS.flatMap((_, section) =>
  [2.25, 7.11, 11.43].map((localX, index) => {
    const platform = nearestPlatform(section, localX);
    return {
      id: sectionId(section, `sky-shard-${index + 1}`),
      x: platform.x + platform.width / 2,
      y: platform.y + platform.height + 0.46,
      value: 50
    };
  })
);

export const skylinePlayableSurfaceMap = {
  ...gameGeometryContract.surfaceMap,
  surfaces: [...gameGeometryContract.surfaceMap.surfaces],
  levelLength: gameGeometryContract.surfaceMap.levelLength,
  estimatedCompletionSeconds: SKYLINE_AUTHORED_PLAYABLE_SECONDS,
  evidence: {
    ...gameGeometryContract.surfaceMap.evidence,
  notes:
      `${gameGeometryContract.surfaceMap.evidence.notes} The shipped route renders this exact single hash-bound ten-district GLB and consumes its extracted 110-surface course without repeating or suppressing foreground geometry. Typed sentry encounters and story shards are route-local gameplay aligned to those retained platforms.`
  }
};

export const skylineWorldAssetBindings = [{
  ...gameGeometryContract.worldAssetBindings[0],
  surfaceIds: [...gameGeometryContract.worldAssetBindings[0].surfaceIds]
}];

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
 * `characterHeight` is the same 0.44 the scene binding uses for the player, so the jump
 * reads correctly relative to the character rather than to an absolute world number.
 */
export const skylineMotion = solvePlatformerMotion(extendedPlatforms, {
  feel: "snappy",
  characterHeight: SKYLINE_CHARACTER_HEIGHT,
  // A fast, readable arc: enough clearance for the authored course without the
  // slow-motion hang time of the previous 2.4-character-height jump.
  jumpHeight: SKYLINE_CHARACTER_HEIGHT * 2.3,
  // Keep lateral control quick enough to respond immediately to a key press.
  runSpeedPerHeight: 4.5,
  gapMargin: 1.5,
  /*
   * The reported session "ends in 20-30 seconds": the 16.6-unit course crosses in about 14
   * seconds of pure traversal at the old speed. Sizing move speed from an intended
   * multi-minute session is how a level gets its duration on purpose. The solver still
   * prefers gap clearance, so this is a target rather than a guarantee.
   */
  // Direct traversal targets a compact play session; hazards and collection add
  // time without making ordinary movement feel artificially slow.
  targetSessionSeconds: 80,
  traversalFraction: 1
});

/** The route's asset-bound level, with motion derived rather than authored. */
export function createSkylineLevel() {
  return game.assetBoundPlatformerLevel({
    characterAsset: "showcaseKenneyOobiPlatformerHero",
    worldAssetBindings: skylineWorldAssetBindings,
    playableSurfaceMap: skylinePlayableSurfaceMap,
    authoredPlayableSeconds: SKYLINE_AUTHORED_PLAYABLE_SECONDS,
    minPlayableSeconds: SKYLINE_MIN_PLAYABLE_SECONDS,
    minCheckpoints: gameGeometryContract.level.checkpoints.length,
    level: {
      ...gameGeometryContract.level,
      id: "showcase-skyline-runner-five-act-level-one",
      finish: { ...gameGeometryContract.level.finish },
      platforms: extendedPlatforms,
      checkpoints: extendedCheckpoints,
      hazards: [...extendedHazards, ...SKYLINE_SENTRY_ENCOUNTERS],
      movingPlatforms: SKYLINE_MOVING_PLATFORMS,
      collectibles: extendedCollectibles,
      // Keep collision and presentation in one scale contract. Without this,
      // game.platformer falls back to its 0.45 x 1.0 default collider even
      // though the rendered hero is only 0.44 units tall.
      playerSize: [SKYLINE_CHARACTER_WIDTH, SKYLINE_CHARACTER_HEIGHT],
      gravity: skylineMotion.gravity,
      jumpVelocity: skylineMotion.jumpVelocity,
      moveSpeed: skylineMotion.moveSpeed,
      coyoteMs: skylineMotion.coyoteMs,
      jumpBufferMs: skylineMotion.jumpBufferMs,
      fallGravityMultiplier: skylineMotion.fallGravityMultiplier,
      jumpReleaseScale: 0.72,
      lives: 3
    }
  });
}
