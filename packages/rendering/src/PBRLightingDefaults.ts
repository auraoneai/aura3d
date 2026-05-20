import type { PBRProceduralEnvironmentMapOptions } from "./PBRMaterial";

export const DEFAULT_PBR_ENVIRONMENT_INTENSITY = 0.18;

export const DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP: PBRProceduralEnvironmentMapOptions = {
  skyColor: [0.45, 0.55, 0.72],
  horizonColor: [0.72, 0.68, 0.58],
  groundColor: [0.08, 0.08, 0.09],
  specularColor: [1, 1, 1],
  intensity: 0.28,
  specularIntensity: 0.65
};
