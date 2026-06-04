import type { AuraMaterialPlan } from "./AuraSceneIR.js";

export interface AuraWetSurfaceMaterialOptions {
  readonly id?: string;
  readonly label?: string;
  readonly clearcoat?: number;
  readonly roughness?: number;
}

export function createAuraWetSurfaceMaterial(options: AuraWetSurfaceMaterialOptions = {}): AuraMaterialPlan {
  return {
    id: options.id ?? "mat_wet_pavement",
    label: options.label ?? "Wet pavement",
    baseColor: [0.035, 0.04, 0.045, 1],
    metallic: 0,
    roughness: options.roughness ?? 0.18,
    clearcoat: options.clearcoat ?? 0.72,
    source: "default"
  };
}
