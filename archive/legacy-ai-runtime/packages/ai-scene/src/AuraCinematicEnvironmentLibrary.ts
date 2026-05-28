import type { AuraSceneEnvironment } from "./AuraSceneIR.js";

export type AuraCinematicEnvironmentId =
  | "rainy-neon-alley"
  | "studio-product-stage"
  | "warm-sunrise-greenhouse"
  | "cool-moonlit-street";

export interface AuraCinematicEnvironmentDefinition {
  readonly id: AuraCinematicEnvironmentId;
  readonly environment: AuraSceneEnvironment;
  readonly assetRequirementIds: readonly string[];
  readonly diagnostics: readonly string[];
}

export function listAuraCinematicEnvironments(): readonly AuraCinematicEnvironmentDefinition[] {
  return [
    {
      id: "rainy-neon-alley",
      environment: {
        id: "env_rainy_neon_alley",
        label: "Rainy neon alley",
        kind: "city",
        timeOfDay: "night",
        moodTags: ["rain-soaked", "neon-lit", "cinematic"],
        backgroundColor: [0.02, 0.025, 0.035],
        ground: { enabled: true, sizeMeters: 8, materialId: "mat_wet_pavement" }
      },
      assetRequirementIds: ["rainy-neon-alley", "wet-pavement", "neon-practical-light"],
      diagnostics: ["North-star environment resolves to procedural renderer-owned alley content."]
    },
    {
      id: "studio-product-stage",
      environment: {
        id: "env_studio_product_stage",
        label: "Studio product stage",
        kind: "studio",
        timeOfDay: "stage",
        moodTags: ["controlled", "product", "softbox"],
        ground: { enabled: true, sizeMeters: 6, materialId: "mat_cinematic_set_concrete" }
      },
      assetRequirementIds: ["studio-stage", "softbox-practicals"],
      diagnostics: ["Studio environment is intended for product previs."]
    },
    {
      id: "warm-sunrise-greenhouse",
      environment: {
        id: "env_warm_sunrise_greenhouse",
        label: "Warm sunrise greenhouse",
        kind: "interior",
        timeOfDay: "dawn",
        moodTags: ["warm", "hopeful", "haze"],
        ground: { enabled: true, sizeMeters: 7, materialId: "mat_cinematic_set_concrete" }
      },
      assetRequirementIds: ["greenhouse-set", "sunrise-window-practical"],
      diagnostics: ["Warm sunrise environment is procedural until an authored greenhouse asset is available."]
    },
    {
      id: "cool-moonlit-street",
      environment: {
        id: "env_cool_moonlit_street",
        label: "Cool moonlit street",
        kind: "city",
        timeOfDay: "night",
        moodTags: ["cool", "moonlit", "quiet"],
        ground: { enabled: true, sizeMeters: 8, materialId: "mat_wet_pavement" }
      },
      assetRequirementIds: ["street-set", "moonlit-rim-practical"],
      diagnostics: ["Cool moonlit street keeps the same renderer-owned set contract."]
    }
  ];
}

export function resolveAuraCinematicEnvironment(id: AuraCinematicEnvironmentId): AuraCinematicEnvironmentDefinition {
  const environment = listAuraCinematicEnvironments().find((entry) => entry.id === id);
  if (!environment) throw new Error(`Unknown cinematic environment '${id}'.`);
  return environment;
}
