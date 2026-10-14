// apps/showcase-aurora-lander/src/v2/scene/materials.ts — §6.9.12 palette.
// Direction primary: night-void blues/ice; accent #46e0a0 marks the aurora
// curtain core and pad ring; the reserved-objective #59d7ff marks the bounded
// landing estimate and objective beam only.
import { material } from "@aura3d/engine";

export const NIGHT_BG = "#0b1120";

export const PAD_RING = material.emissive({
  color: "#5eead4", emissive: "#2dd4bf", emissiveIntensity: 1.0, opacity: 0.9
});
export const PAD_APPROACH_LIGHT = material.emissive({
  color: "#a7f3d0", emissive: "#34d399", emissiveIntensity: 1.4, opacity: 0.9
});
export const LANDING_BEAM_HOT = material.emissive({
  color: "#99f6e4", emissive: "#99f6e4", emissiveIntensity: 2.6
});
export const LANDING_BEAM_MID = material.emissive({
  color: "#5eead4", emissive: "#5eead4", emissiveIntensity: 1.4
});
export const LANDING_BEAM_OUTER = material.emissive({
  color: "#134e4a", emissive: "#134e4a", emissiveIntensity: 0.55
});
export const PREDICTION_RING = material.emissive({
  color: "#fde68a", emissive: "#fbbf24", emissiveIntensity: 1.1, opacity: 0.82
});
export const PLUME = material.emissive({
  color: "#fde68a", emissive: "#f59e0b", emissiveIntensity: 2.0, opacity: 0.8
});
export const DUST = material.pbr({
  color: "#b8c4c2", roughness: 1, opacity: 0.4
});
export const DEBRIS = material.pbr({
  color: "#57606a", roughness: 0.8
});
export const SHOCKWAVE = material.emissive({
  color: "#fca5a5", emissive: "#ef4444", emissiveIntensity: 1.3, opacity: 0.7
});
export const SNOWFLAKE = material.emissive({
  color: "#e0f2fe", emissive: "#bae6fd", emissiveIntensity: 0.9, opacity: 0.44
});
export const GHOST = material.pbr({
  color: "#7dd3fc", roughness: 0.4, opacity: 0.32
});
export const EXTRACTION_HALO = material.emissive({
  color: "#fef3c7", emissive: "#fbbf24", emissiveIntensity: 1.2, opacity: 0.9
});
