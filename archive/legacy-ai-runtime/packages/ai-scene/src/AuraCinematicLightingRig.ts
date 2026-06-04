import type { AuraLightingPlan } from "./AuraSceneIR.js";

export type AuraCinematicLightingRigId =
  | "soft-key-fill-rim"
  | "moody-alley"
  | "studio-product"
  | "warm-sunrise"
  | "cool-moonlit";

export interface AuraCinematicLightingRigDefinition {
  readonly id: AuraCinematicLightingRigId;
  readonly plan: AuraLightingPlan;
  readonly toneMapping: {
    readonly exposure: number;
    readonly whitePoint: number;
  };
  readonly diagnostics: readonly string[];
}

export function createAuraCinematicLightingRig(id: AuraCinematicLightingRigId): AuraCinematicLightingRigDefinition {
  switch (id) {
    case "moody-alley":
      return rig(id, "Moody alley", "rain-soaked neon", 1.08, [0.08, 0.74, 1], [1, 0.16, 0.82], 1.18);
    case "studio-product":
      return rig(id, "Studio product", "controlled studio", 1.12, [1, 0.96, 0.88], [0.6, 0.74, 1], 1.05);
    case "warm-sunrise":
      return rig(id, "Warm sunrise", "warm sunrise", 1.2, [1, 0.58, 0.22], [0.78, 1, 0.36], 1.18);
    case "cool-moonlit":
      return rig(id, "Cool moonlit", "cool moonlit", 0.94, [0.42, 0.58, 1], [0.22, 0.92, 1], 0.96);
    case "soft-key-fill-rim":
    default:
      return rig("soft-key-fill-rim", "Soft key/fill/rim", "cinematic neutral", 1, [0.82, 0.9, 1], [0.55, 0.78, 1], 1);
  }
}

export function listAuraCinematicLightingRigs(): readonly AuraCinematicLightingRigDefinition[] {
  return [
    createAuraCinematicLightingRig("soft-key-fill-rim"),
    createAuraCinematicLightingRig("moody-alley"),
    createAuraCinematicLightingRig("studio-product"),
    createAuraCinematicLightingRig("warm-sunrise"),
    createAuraCinematicLightingRig("cool-moonlit")
  ];
}

function rig(
  id: AuraCinematicLightingRigId,
  label: string,
  mood: string,
  exposure: number,
  keyColor: readonly [number, number, number],
  rimColor: readonly [number, number, number],
  intensity: number
): AuraCinematicLightingRigDefinition {
  return {
    id,
    plan: {
      id: `lighting_${id}`,
      label,
      mood,
      exposure,
      keyLight: {
        direction: [-0.34, -0.78, -0.42],
        color: keyColor,
        intensity
      },
      fillLight: {
        direction: [0.45, -0.45, 0.12],
        color: [0.18, 0.22, 0.28],
        intensity: intensity * 0.32
      },
      rimLight: {
        direction: [0.48, -0.58, 0.64],
        color: rimColor,
        intensity: intensity * 0.82
      }
    },
    toneMapping: {
      exposure,
      whitePoint: 1
    },
    diagnostics: [`${label} lighting rig is deterministic and renderer-ready.`]
  };
}
