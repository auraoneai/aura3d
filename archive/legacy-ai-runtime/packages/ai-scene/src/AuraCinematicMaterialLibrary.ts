import { createAuraHeroPropMaterial } from "./AuraHeroPropMaterial.js";
import { createAuraNeonEmissionMaterial } from "./AuraNeonEmissionMaterial.js";
import type { AuraMaterialPlan } from "./AuraSceneIR.js";
import { createAuraWetSurfaceMaterial } from "./AuraWetSurfaceMaterial.js";

export type AuraCinematicMaterialPresetId =
  | "wet-pavement"
  | "neon-emissive"
  | "hero-prop-glow"
  | "rain-dark-metal"
  | "cinematic-set-concrete";

export interface AuraCinematicMaterialDefinition {
  readonly id: AuraCinematicMaterialPresetId;
  readonly material: AuraMaterialPlan;
  readonly semanticTags: readonly string[];
  readonly diagnostics: readonly string[];
}

export function listAuraCinematicMaterials(): readonly AuraCinematicMaterialDefinition[] {
  return [
    {
      id: "wet-pavement",
      material: createAuraWetSurfaceMaterial(),
      semanticTags: ["wet", "pavement", "rain", "ground", "reflective"],
      diagnostics: ["Wet pavement is a PBR material plan, not CSS shine."]
    },
    {
      id: "neon-emissive",
      material: createAuraNeonEmissionMaterial(),
      semanticTags: ["neon", "emissive", "practical", "light"],
      diagnostics: ["Neon has emissive material data and light intent."]
    },
    {
      id: "hero-prop-glow",
      material: createAuraHeroPropMaterial(),
      semanticTags: ["flower", "hero", "prop", "glow"],
      diagnostics: ["Hero prop glow is material intent for renderer-owned props."]
    },
    {
      id: "rain-dark-metal",
      material: {
        id: "mat_rain_dark_metal",
        label: "Rain dark metal",
        baseColor: [0.32, 0.34, 0.36, 1],
        metallic: 0.82,
        roughness: 0.24,
        clearcoat: 0.48,
        source: "default"
      },
      semanticTags: ["robot", "metal", "rain", "wet"],
      diagnostics: ["Wet robot/metal response is represented with PBR parameters."]
    },
    {
      id: "cinematic-set-concrete",
      material: {
        id: "mat_cinematic_set_concrete",
        label: "Cinematic set concrete",
        baseColor: [0.23, 0.24, 0.25, 1],
        metallic: 0,
        roughness: 0.62,
        source: "default"
      },
      semanticTags: ["alley", "wall", "concrete", "set"],
      diagnostics: ["Set surfaces use renderer material plans."]
    }
  ];
}

export function resolveAuraCinematicMaterial(id: AuraCinematicMaterialPresetId): AuraCinematicMaterialDefinition {
  const material = listAuraCinematicMaterials().find((entry) => entry.id === id);
  if (!material) throw new Error(`Unknown cinematic material '${id}'.`);
  return material;
}

export function selectAuraCinematicMaterial(tags: readonly string[]): AuraCinematicMaterialDefinition {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.some((tag) => tag.includes("neon") || tag.includes("emissive"))) return resolveAuraCinematicMaterial("neon-emissive");
  if (lower.some((tag) => tag.includes("flower") || tag.includes("hero") || tag.includes("glow"))) return resolveAuraCinematicMaterial("hero-prop-glow");
  if (lower.some((tag) => tag.includes("metal") || tag.includes("robot"))) return resolveAuraCinematicMaterial("rain-dark-metal");
  if (lower.some((tag) => tag.includes("wet") || tag.includes("pavement") || tag.includes("rain"))) return resolveAuraCinematicMaterial("wet-pavement");
  return resolveAuraCinematicMaterial("cinematic-set-concrete");
}
