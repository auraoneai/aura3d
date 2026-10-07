// apps/showcase-turbo-drift-circuit/src/v2/scene/world.ts — T2.2 world nodes.
// S-world keeps the certified world layout and hero GLBs: the authored V2
// circuit environment stays mounted as the rendered world until the K3
// spline-road + splat-terrain rebuild lands (stand-in, R-14-13). What changes
// here vs legacy: outfield plane uses the authored terrain material (no
// plastic/rubber procedural textures — §6.9.2 deletes them), a distant
// mountain-impostor ring closes the horizon, and backdrops never cast.
import {
  game, instances, model
} from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import {
  MOUNTAIN_MATERIAL, TERRAIN_MATERIAL
} from "./materials";

/**
 * Scene-fit constants shared by the binding and the mounts (derived in
 * legacy main.ts; SCENE_SIZE/TRACK_REFERENCE_Y are the certified values).
 */
export const SCENE_SIZE = 55.518;
export const TRACK_REFERENCE_Y = -0.12;
export const CAR_TARGET_MAX_DIMENSION = 0.96;
export const OPPONENT_TARGET_MAX_DIMENSION = 0.91;

/** Same pine suppression as the admitted visual pass (chase-frustum trunks). */
export const TURBO_ENVIRONMENT_HIDDEN_NODES = [
  "TDCE pine shadow",
  "TDCE pine sun",
  "TDCE tree bark"
] as const;

export interface TurboWorldOptions {
  readonly circuitEnvironmentTargetMaxDimension: number;
  readonly playerPosition: readonly [number, number, number];
  readonly playerRotation: readonly [number, number, number];
  readonly opponentPosition: readonly [number, number, number];
  readonly opponentRotation: readonly [number, number, number];
}

/**
 * Certified circuit environment + outfield + mountain ring + the two cars.
 * Runtime handles are resolved after mount via `app.nodes.get(name)`
 * (racing-player-car / racing-opponent-car), same as the bank-shot shell.
 */
export function turboDriftWorldNodes(o: TurboWorldOptions): readonly unknown[] {
  return [
    model(assets.turboCircuitEnvironmentV2, {
      name: "racing-bound-circuit-environment-v2",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: o.circuitEnvironmentTargetMaxDimension,
      castShadow: true,
      receiveShadow: true,
      hiddenNodeNames: [...TURBO_ENVIRONMENT_HIDDEN_NODES]
    }).runtime(game.runtimeNode("racing-bound-circuit-environment-v2", {
      tags: ["typed-world-asset", "s-world-kept", "k3-road-standin"]
    })),
    // Outfield floor to the horizon under the circuit shell.
    instances.box({
      name: "turbo outfield terrain",
      material: TERRAIN_MATERIAL,
      receiveShadow: true,
      transforms: [{ position: [0, 0, 0], scale: [1, 1, 1] }]
    }).position(0, TRACK_REFERENCE_Y - 0.14, 0).scale([SCENE_SIZE * 6, 0.1, SCENE_SIZE * 6]),
    // Distant mountain impostor ring just beyond the fog band (backdrop →
    // castShadow: false). 8 impostor slabs on a ~2.6× scene ring (no cone
    // primitive in the kit), heights varied for a ridge silhouette.
    instances.box({
      name: "turbo distant mountain ring",
      material: MOUNTAIN_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.35;
        const r = SCENE_SIZE * 2.6;
        const h = SCENE_SIZE * (0.22 + (i % 3) * 0.06);
        return {
          position: [Math.cos(a) * r, TRACK_REFERENCE_Y + h / 2 - 0.2, Math.sin(a) * r],
          scale: [h * 0.85, h, h * 0.28],
          rotation: [0, a * 0.7, 0]
        };
      })
    }),
    model(assets.showcaseCc0FormulaRaceCar, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: CAR_TARGET_MAX_DIMENSION,
      castShadow: true,
      receiveShadow: true
    }).position(...o.playerPosition).rotate(...o.playerRotation)
      .runtime(game.runtimeNode("racing-player-car", {
        tags: ["player", "vehicle", "typed-primary-asset"]
      })),
    model(assets.showcaseCcByFormulaOpponent, {
      name: "racing-opponent-car",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: OPPONENT_TARGET_MAX_DIMENSION,
      castShadow: true,
      receiveShadow: true
    }).position(...o.opponentPosition).rotate(...o.opponentRotation)
      .runtime(game.runtimeNode("racing-opponent-car", {
        tags: ["opponent", "vehicle", "typed-secondary-asset", "route-local-ai"]
      }))
  ];
}
