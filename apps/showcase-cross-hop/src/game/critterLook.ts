/**
 * Cross Hop critter and vehicle materials (GU47 WP-24 CH47-08). The 4.6 build painted every critter with one cream
 * material (`CRITTER_MAT`), which wiped the Meshy textures; the diorama look keeps each GLB's own maps and adds a
 * per-surface override: a soft rim on furry and feathered critters (the sheen stand-in: model overrides carry no
 * sheen field, see the lane report), clearcoat on the robot, astronaut and golden frogs and on the toy vehicles.
 */
import type { AuraModelMaterialOverride } from "@aura3d/engine";

export type CritterSurface = "fur" | "feather" | "skin" | "shell" | "lacquer" | "metal";

/** Surface per critter asset key (spectators, the player and the hawk). */
export const CRITTER_SURFACE: Readonly<Record<string, CritterSurface>> = {
  hop: "fur",
  chick: "feather",
  turtle: "shell",
  bun: "fur",
  axolotl: "skin",
  ducky: "feather",
  roboFrog: "lacquer",
  toastCat: "fur",
  mushroomKid: "skin",
  knightToad: "metal",
  astroFrog: "lacquer",
  goldenHop: "metal",
  hawk: "feather",
  rescuePod: "lacquer"
};

const RIM_FUR = { color: "#fff1df", power: 2.4, intensity: 0.55 } as const;
const RIM_FEATHER = { color: "#fff6e0", power: 2.8, intensity: 0.45 } as const;

/** Model material overrides for a critter key; [] keeps the GLB as authored. Never replaces textures. */
export function critterOverrides(assetKey: string): readonly AuraModelMaterialOverride[] {
  switch (CRITTER_SURFACE[assetKey]) {
    case "fur": return [{ rim: RIM_FUR, roughness: 0.85 }];
    case "feather": return [{ rim: RIM_FEATHER, roughness: 0.8 }];
    case "shell": return [{ clearcoat: 0.35, clearcoatRoughness: 0.4 }];
    case "lacquer": return [{ clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 }];
    case "metal": return [{ clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.3 }];
    case "skin": return [{ clearcoat: 0.25, clearcoatRoughness: 0.5 }];
    default: return [];
  }
}

/** Lacquered toy vehicles (CH47-07/08): glossy clearcoat over the authored paint. */
export const VEHICLE_OVERRIDES: readonly AuraModelMaterialOverride[] = [{ clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15 }];
