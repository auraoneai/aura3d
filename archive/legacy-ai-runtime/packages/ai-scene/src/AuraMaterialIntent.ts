import type { AuraColor, AuraColorAlpha } from "./AuraSceneIR.js";

export type AuraMaterialTarget = "hero-subject" | "supporting-prop" | "ground" | "set" | "practical-light" | "vfx-card";

export interface AuraMaterialIntent {
  readonly id: string;
  readonly label: string;
  readonly target: AuraMaterialTarget;
  readonly descriptors: readonly string[];
  readonly baseColor: AuraColorAlpha;
  readonly metallic: number;
  readonly roughness: number;
  readonly wetness?: number;
  readonly clearcoat?: number;
  readonly emissive?: AuraColor;
  readonly emissiveStrength?: number;
  readonly requiresRendererMaterial: boolean;
}

export function isGroundMaterialIntent(intent: AuraMaterialIntent): boolean {
  return intent.target === "ground" || intent.descriptors.some((descriptor) => ["pavement", "asphalt", "floor", "stage"].includes(descriptor.toLowerCase()));
}
