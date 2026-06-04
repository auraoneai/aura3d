import type { AuraColor, AuraMaterialPlan } from "./AuraSceneIR.js";

export interface AuraHeroPropMaterialOptions {
  readonly id?: string;
  readonly label?: string;
  readonly color?: AuraColor;
  readonly emissiveStrength?: number;
}

export function createAuraHeroPropMaterial(options: AuraHeroPropMaterialOptions = {}): AuraMaterialPlan {
  const color = options.color ?? [0.42, 0.95, 1];
  return {
    id: options.id ?? "mat_hero_prop_glow",
    label: options.label ?? "Hero prop glow",
    baseColor: [color[0], color[1], color[2], 1],
    metallic: 0,
    roughness: 0.28,
    clearcoat: 0.25,
    emissive: color,
    emissiveStrength: options.emissiveStrength ?? 2.6,
    source: "default"
  };
}
