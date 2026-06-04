import type { AuraColor } from "./AuraSceneIR.js";

export type AuraVFXIntentKind = "rain" | "fog" | "dust" | "sparks" | "glow" | "water" | "fire" | "smoke";

export interface AuraVFXIntent {
  readonly id: string;
  readonly kind: AuraVFXIntentKind;
  readonly targetId?: string;
  readonly descriptors: readonly string[];
  readonly intensity: number;
  readonly density?: number;
  readonly color?: AuraColor;
  readonly rendererOwned: true;
}

export const AURA_SUPPORTED_CINEMATIC_VFX: readonly AuraVFXIntentKind[] = ["rain", "fog", "dust", "sparks", "glow", "water", "fire", "smoke"];
