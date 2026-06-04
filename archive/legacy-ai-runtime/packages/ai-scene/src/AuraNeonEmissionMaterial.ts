import type { AuraColor, AuraMaterialPlan } from "./AuraSceneIR.js";

export interface AuraNeonEmissionMaterialOptions {
  readonly id?: string;
  readonly label?: string;
  readonly color?: AuraColor;
  readonly strength?: number;
}

export function createAuraNeonEmissionMaterial(options: AuraNeonEmissionMaterialOptions = {}): AuraMaterialPlan {
  const color = options.color ?? [0.05, 0.78, 1];
  return {
    id: options.id ?? "mat_neon_emissive",
    label: options.label ?? "Neon emissive practical",
    baseColor: [color[0], color[1], color[2], 1],
    metallic: 0,
    roughness: 0.22,
    emissive: color,
    emissiveStrength: options.strength ?? 4.8,
    source: "default"
  };
}
