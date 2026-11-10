/**
 * Cross Hop critter and vehicle materials (GU47 WP-24 CH47-08 + WP-14 10/10 diorama pass).
 * Keeps each GLB's authored textures intact (`replaceTextures` unset) and layers tactile
 * fur/feather Fresnel rims, ceramic/metal clearcoats, `material.clearcoatPaint` toy-car gloss,
 * and an athletic crouched rest stance on humanoid frog rigs.
 */
import { material, type AuraModelMaterialOverride } from "@aura3d/engine";

export interface CritterNodeTransform {
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: number | readonly [number, number, number];
}

export type CritterSurface = "fur" | "feather" | "skin" | "shell" | "lacquer" | "metal";

/** Surface per critter asset key (spectators, the player and the hawk). */
export const CRITTER_SURFACE: Readonly<Record<string, CritterSurface>> = {
  hop: "skin",
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

const RIM_FUR = { color: "#fff3e2", power: 2.4, intensity: 0.52 } as const;
const RIM_FEATHER = { color: "#fff7e4", power: 2.7, intensity: 0.46 } as const;
const RIM_AMPHIBIAN = { color: "#e8fff3", power: 3.1, intensity: 0.34 } as const;

/** Model material overrides for a critter key; [] keeps the GLB as authored. Never replaces textures. */
export function critterOverrides(assetKey: string): readonly AuraModelMaterialOverride[] {
  switch (CRITTER_SURFACE[assetKey]) {
    case "fur":
      return [{ rim: RIM_FUR, roughness: 0.84, envMapIntensity: 0.72 }];
    case "feather":
      return [{ rim: RIM_FEATHER, roughness: 0.78, envMapIntensity: 0.78 }];
    case "shell":
      return [{ clearcoat: 0.58, clearcoatRoughness: 0.22, roughness: 0.42, envMapIntensity: 1.05 }];
    case "lacquer":
      return [{ clearcoat: 1, clearcoatRoughness: 0.06, roughness: 0.18, envMapIntensity: 1.32 }];
    case "metal":
      return [{ clearcoat: 0.78, clearcoatRoughness: 0.12, roughness: 0.22, envMapIntensity: 1.42 }];
    case "skin":
      return [{ rim: RIM_AMPHIBIAN, clearcoat: 0.42, clearcoatRoughness: 0.28, roughness: 0.48, envMapIntensity: 0.95 }];
    default:
      return [];
  }
}

const TOY_CLEARCOAT_PAINT = material.clearcoatPaint({
  color: "#ffffff",
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.035,
  envMapIntensity: 1.38
});

/** Lacquered toy vehicles (WP-14): `material.clearcoatPaint` gloss over each GLB's authored bodywork paint. */
export const VEHICLE_OVERRIDES: readonly AuraModelMaterialOverride[] = [{
  clearcoat: TOY_CLEARCOAT_PAINT.clearcoat ?? 1,
  clearcoatRoughness: TOY_CLEARCOAT_PAINT.clearcoatRoughness ?? 0.035,
  roughness: TOY_CLEARCOAT_PAINT.roughness ?? 0.12,
  envMapIntensity: TOY_CLEARCOAT_PAINT.envMapIntensity ?? 1.38
}];

/**
 * Athletic crouched amphibian rest transforms for humanoid-rigged frog critters (`hop`, `roboFrog`, `astroFrog`,
 * `knightToad`, `goldenHop`) so their default bind posture reads poised to spring rather than stiffly upright.
 */
const AMPHIBIAN_CROUCH: Readonly<Record<string, CritterNodeTransform>> = {
  Hips: { rotation: [0.16, 0, 0] },
  Spine: { rotation: [0.14, 0, 0] },
  LeftUpLeg: { rotation: [-0.36, 0, -0.06] },
  RightUpLeg: { rotation: [-0.36, 0, 0.06] },
  LeftLeg: { rotation: [0.44, 0, 0] },
  RightLeg: { rotation: [0.44, 0, 0] },
  LeftArm: { rotation: [0.22, 0, 0.12] },
  RightArm: { rotation: [0.22, 0, -0.12] }
};

const AMPHIBIAN_KEYS = new Set(["hop", "roboFrog", "astroFrog", "knightToad", "goldenHop"]);

export function critterNodeTransforms(assetKey: string): Readonly<Record<string, CritterNodeTransform>> | undefined {
  return AMPHIBIAN_KEYS.has(assetKey) ? AMPHIBIAN_CROUCH : undefined;
}
