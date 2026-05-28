import type { AuraVec3 } from "./AuraSceneIR.js";

export type AuraCinematicAssetCategory =
  | "character-robot"
  | "vehicle"
  | "prop"
  | "product"
  | "urban-environment"
  | "nature-environment"
  | "studio-environment"
  | "architectural-interior"
  | "emissive-neon-panel"
  | "ground-stage-surface"
  | "hdr-environment";

export type AuraAssetFallbackStrategy = "local-asset" | "procedural-set" | "procedural-mesh" | "diagnostic-only";

export interface AuraStoryBlockingIntent {
  readonly position: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: AuraVec3;
  readonly lookAtId?: string;
  readonly notes?: string;
}

export interface AuraAssetIntent {
  readonly id: string;
  readonly label: string;
  readonly category: AuraCinematicAssetCategory;
  readonly role: "hero" | "supporting" | "environment" | "ground" | "practical-light" | "lighting";
  readonly semanticTags: readonly string[];
  readonly moodTags: readonly string[];
  readonly materialDescriptors: readonly string[];
  readonly required: boolean;
  readonly fallbackPriority: readonly AuraAssetFallbackStrategy[];
  readonly scaleMeters?: readonly [number, number, number];
  readonly blocking?: AuraStoryBlockingIntent;
  readonly disallowedSubstitutes: readonly ("dom-css-only" | "flat-overlay" | "text-label" | "placeholder-primitive")[];
}

export function isMajorCinematicAssetIntent(intent: AuraAssetIntent): boolean {
  return intent.role === "hero" || intent.role === "environment" || intent.role === "practical-light";
}
