import type { PBRProceduralEnvironmentMapOptions } from "./PBRMaterial";

/**
 * Public API (re-exported from the package index): the value must not
 * change — flag-off CPU goldens and direct-API brightness pin it. E3 step 5
 * resolves the stale-default problem at the ForwardPass bind layer instead
 * (see applyEnvironmentLightingUniforms): under A3D_QR_COMPILER ∧
 * A3D_QR_LIGHTING a no-environment draw binds `u_environmentIntensity = 0`,
 * so this constructor default never survives into a conjunction draw.
 */
export const DEFAULT_PBR_ENVIRONMENT_INTENSITY = 0.18;

export const DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP: PBRProceduralEnvironmentMapOptions = {
  skyColor: [0.45, 0.55, 0.72],
  horizonColor: [0.72, 0.68, 0.58],
  groundColor: [0.08, 0.08, 0.09],
  specularColor: [1, 1, 1],
  intensity: 0.28,
  specularIntensity: 0.65
};
