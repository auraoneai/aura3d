/**
 * C-31 — diagnostics sections (CONTRACTS.md). Provider: PRD 15 (custodian). Flag: none.
 * AuraDiagnostics (index.ts:10377) gains optional members for every key below in PR 0a.
 */

import type { RegistryEntry } from "@aura3d/rendering/contracts";
import { createRegistry } from "@aura3d/rendering/contracts";
import type { AuraApp } from "../agent-api/index";
import type { AuraPostPresetId } from "./post";

export interface AppliedLookReport { readonly exposure: number; readonly toneMapping: "aces-filmic" | "agx" | "neutral" | "reinhard" | "none"; readonly environment: { readonly specularIntensity: number; readonly diffuseIntensity: number; readonly background: "color" | "hdri" | "sky" }; readonly shadows: ShadowReport | null; readonly fallbackLightsActive: boolean; readonly renderPath: "production" | "safe-basic" | "lean" | "compat-preset"; readonly pixelRatio: number; }
export interface ShadowReport { readonly mapRendered: boolean; readonly mapSampled: boolean; readonly mapSize: number | null; readonly strength: number | null; readonly casterName: string | null; }
export interface DiagnosticsSection<T = unknown> extends RegistryEntry { readonly id: string; readonly key: AuraDiagnosticsSectionKey; collect(app: AuraApp): T; }
export type AuraDiagnosticsSectionKey =
  | "output" | "resolution" | "programs" | "frameAllocations"            // PRD 01
  | "lighting" | "shadows"                                               // PRD 02
  | "post" | "exposure"                                                  // PRD 03
  | "materials"                                                          // PRD 04
  | "assets"                                                             // PRD 05
  | "animation"                                                          // PRD 06
  | "effects" | "atmosphere"                                             // PRD 07
  | "camera" | "loop"                                                    // PRD 08
  | "game"                                                               // PRD 09
  | "world"                                                              // PRD 10
  | "frame" | "renderer.batching" | "quality"                            // PRD 11
  | "appliedLook" | "frameTiming"                                        // PRD 12 (assembled from others)
  | "look"                                                               // PRD 13
  | "degradations" | "compiledFeatures" | "qrFlags";                     // PRD 15

const diagnosticsSections = createRegistry<DiagnosticsSection>("diagnosticsSections");

export function registerDiagnosticsSection<T>(section: DiagnosticsSection<T>): () => void {
  return diagnosticsSections.register(section as DiagnosticsSection<unknown>);
}

/** Section keys, in declaration order — used by the C-31 stub and the ownership check. */
export const DIAGNOSTICS_SECTION_KEYS: readonly AuraDiagnosticsSectionKey[] = [
  "output", "resolution", "programs", "frameAllocations",
  "lighting", "shadows",
  "post", "exposure",
  "materials",
  "assets",
  "animation",
  "effects", "atmosphere",
  "camera", "loop",
  "game",
  "world",
  "frame", "renderer.batching", "quality",
  "appliedLook", "frameTiming",
  "look",
  "degradations", "compiledFeatures", "qrFlags"
];

export function diagnosticsSectionsAll(): readonly DiagnosticsSection<unknown>[] {
  return diagnosticsSections.all();
}
