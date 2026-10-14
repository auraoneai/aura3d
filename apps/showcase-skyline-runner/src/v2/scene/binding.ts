// apps/showcase-skyline-runner/src/v2/scene/binding.ts — the shared platformer
// scene binding. World nodes, the follow2d rig, evidence and scenarios all read
// the same transform so scene-space and game-space can never drift.
import { game as engineGame } from "@aura3d/engine";
import {
  SKYLINE_CHARACTER_HEIGHT,
  SKYLINE_SECTION_COUNT,
  createSkylineLevel,
  skylinePlayableSurfaceMap
} from "../../gameplay/level";

export const WORLD_PLANE_DEPTH = -0.46;
export const GAMEPLAY_ACTOR_DEPTH = 0.42;
export const SKYLINE_RENDERED_CHARACTER_HEIGHT = SKYLINE_CHARACTER_HEIGHT * 1.22;

export const level = createSkylineLevel();
export const platforms = level.platforms ?? [];
export const checkpoints = level.checkpoints ?? [];
export const hazards = level.hazards ?? [];
export const collectibles = level.collectibles ?? [];

export const platformerScene = engineGame.platformerSceneBinding({
  surfaceMap: skylinePlayableSurfaceMap,
  level,
  worldAsset: "showcaseKenneyVerdantPlatformerWorld",
  targetSceneWidth: 6.4 * SKYLINE_SECTION_COUNT,
  worldModelTargetMaxDimension: 6.4 * SKYLINE_SECTION_COUNT,
  worldY: -0.72,
  worldZ: WORLD_PLANE_DEPTH,
  playerZ: GAMEPLAY_ACTOR_DEPTH,
  playerTargetHeight: SKYLINE_CHARACTER_HEIGHT,
  playerYOffset: 0
});
