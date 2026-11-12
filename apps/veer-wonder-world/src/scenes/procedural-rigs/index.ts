// Exhaustive 66-asset procedural rig barrel (`65` ModelKeys + `"bubble"`).
// Zero external `.glb` dependencies, zero network fetches, zero clocks, zero unsafe casts.

import type { AuraColor, AuraNodeBuilder, AuraSceneNode } from "@aura3d/engine";
import type { Vec3 } from "../motion.js";
import type { StageAssetKey } from "../stand-ins.js";
import { CAST_RIGS } from "./cast-rigs.js";
import { COMPANION_ANIMAL_RIGS } from "./companion-animal-rigs.js";
import { MUSIC_FURNITURE_NATURE_RIGS } from "./music-furniture-nature-rigs.js";
import { PLAY_FOOD_LETTER_RIGS } from "./play-food-letter-rigs.js";
import {
  buildProceduralActor,
  craftMaterial,
  type BuildProceduralActorOptions,
  type BuiltProceduralActor,
  type CraftFamily,
  type MountedRigPiece,
  type ProceduralAssetRig,
  type ProceduralLobeSpec,
  type ProceduralSubPartRig
} from "./rig-kit.js";
import { VEHICLE_ARCHITECTURE_RIGS } from "./vehicle-architecture-rigs.js";

export {
  buildProceduralActor,
  craftMaterial,
  type BuildProceduralActorOptions,
  type BuiltProceduralActor,
  type CraftFamily,
  type MountedRigPiece,
  type ProceduralAssetRig,
  type ProceduralLobeSpec,
  type ProceduralSubPartRig
};

/**
 * Exhaustive compile-time-verified map of all 66 `StageAssetKey` procedural rigs.
 */
export const PROCEDURAL_RIGS: Readonly<Record<StageAssetKey, ProceduralAssetRig>> = {
  ...CAST_RIGS,
  ...COMPANION_ANIMAL_RIGS,
  ...VEHICLE_ARCHITECTURE_RIGS,
  ...MUSIC_FURNITURE_NATURE_RIGS,
  ...PLAY_FOOD_LETTER_RIGS
};

export function getProceduralRig(key: StageAssetKey): ProceduralAssetRig {
  return PROCEDURAL_RIGS[key];
}

export function mountProceduralAsset(opts: BuildProceduralActorOptions): BuiltProceduralActor {
  return buildProceduralActor(PROCEDURAL_RIGS[opts.key], opts);
}

export function mountStaticDressingAsset(
  key: StageAssetKey,
  heightM: number,
  name: string,
  pos: Vec3,
  rotY = 0,
  tint?: AuraColor,
  castShadow = true
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const built = buildProceduralActor(PROCEDURAL_RIGS[key], {
    id: name,
    key,
    heightM,
    ...(tint !== undefined ? { tint } : {}),
    ...(castShadow ? {} : { castShadowOverride: false }),
    interactive: false
  });
  return built.nodes.map((node) => node.position(pos).rotate(0, rotY, 0));
}
