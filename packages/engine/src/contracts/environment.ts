/**
 * C-09 — environment sources (engine side, CONTRACTS.md). Provider: PRD 02. Flag: A3D_QR_LIGHTING.
 */

import type { RegistryEntry, QrFlags } from "@aura3d/rendering/contracts";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraVec3, AuraColor, AuraSceneSnapshot } from "../agent-api/index";
import { createRegistry } from "@aura3d/rendering/contracts";

export type AuraEnvironmentSourceKind = "explicit" | "biome" | "look" | "time-of-day" | "scene-signal" | "neutral-room" | "legacy";
export interface AuraEnvironmentSourceResolution {
  readonly kind: AuraEnvironmentSourceKind;
  readonly probe: "neutral" | { readonly preset: "neutral" | "studio" | "outdoor" | "sunset" | "night" | "indoor" } | { readonly hdri: string; readonly reflection?: string } | { readonly capture: { readonly include: "sky-only" | "all"; readonly position?: AuraVec3; readonly resolution?: 64 | 128 | 256; readonly update?: "once" | "on-demand" | { readonly everyNFrames: number } } } | { readonly spaceBake: string };
  readonly intensity: number; readonly diffuseIntensity: number; readonly specularIntensity: number; readonly rotation: number;
  readonly background: false | { readonly visible: boolean; readonly blurriness: number; readonly intensity: number; readonly rotation: number };
  readonly ambient: { readonly color: AuraColor; readonly intensity: number } | null;   // ADDITIVE to IBL (never replaces it)
}
export interface AuraEnvironmentSource extends RegistryEntry {
  readonly id: string;               // "prd02.explicit", "prd10.biome", "prd13.look", "prd07.sky"
  readonly priority: number;         // higher wins; frozen order: explicit 400 > biome 300 > time-of-day 250 > look 200 > scene-signal 100 > neutral-room 0
  resolve(snapshot: AuraSceneSnapshot, tier: AuraQualityTier): AuraEnvironmentSourceResolution | undefined;
}

const environmentSources = createRegistry<AuraEnvironmentSource>("environmentSources");

export function registerEnvironmentSource(source: AuraEnvironmentSource): () => void {
  return environmentSources.register(source);
}

const LEGACY_RESOLUTION: AuraEnvironmentSourceResolution = {
  kind: "legacy",
  probe: "neutral",
  intensity: 1,
  diffuseIntensity: 1,
  specularIntensity: 1,
  rotation: 0,
  background: false,
  ambient: null
};

/**
 * PR 0a stub: queries the registered sources in (priority, registration) order
 * — same-priority ties resolve deterministically with a ENVIRONMENT_SOURCE_TIE
 * warning recorded — and falls back to today's legacy path (`kind: "legacy"`).
 * The PR 0b seam wires this into `createProductionRuntimeEnvironment`.
 */
export function resolveEnvironment(snapshot: AuraSceneSnapshot, tier: AuraQualityTier, flags: QrFlags): AuraEnvironmentSourceResolution {
  const active = environmentSources.active(flags);
  const sorted = [...active].sort((a, b) => b.priority - a.priority);
  const top = sorted.filter((s) => s.priority === (sorted[0]?.priority ?? 0));
  if (top.length > 1) {
    if (typeof console !== "undefined") console.warn(`ENVIRONMENT_SOURCE_TIE:${top.map((s) => s.id).join(",")}`);
  }
  for (const source of sorted) {
    const resolution = source.resolve(snapshot, tier);
    if (resolution !== undefined) return resolution;
  }
  return LEGACY_RESOLUTION;
}
