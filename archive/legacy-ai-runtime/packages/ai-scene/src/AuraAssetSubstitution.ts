import type { AuraAssetFallbackStrategy, AuraAssetIntent } from "./AuraAssetIntent.js";
import type { AuraCinematicAssetManifestEntry } from "./AuraCinematicAssetManifest.js";

export type AuraAssetSubstitutionSeverity = "info" | "warning" | "error";

export interface AuraAssetSubstitutionDiagnostic {
  readonly code: string;
  readonly severity: AuraAssetSubstitutionSeverity;
  readonly path: string;
  readonly message: string;
  readonly fixSuggestion: string;
}

export interface AuraAssetSubstitution {
  readonly intentId: string;
  readonly strategy: AuraAssetFallbackStrategy;
  readonly accepted: boolean;
  readonly replacementAssetId?: string;
  readonly diagnostics: readonly AuraAssetSubstitutionDiagnostic[];
}

export function createDomCssSubstituteRejectedDiagnostic(intent: AuraAssetIntent, entry: AuraCinematicAssetManifestEntry): AuraAssetSubstitutionDiagnostic {
  return {
    code: "AURA_CINEMATIC_DOM_CSS_SUBSTITUTE_REJECTED",
    severity: intent.required ? "error" : "warning",
    path: `assetRequirements[${intent.id}]`,
    message: `Rejected '${entry.id}' because DOM/CSS-only substitutes cannot satisfy '${intent.label}'.`,
    fixSuggestion: "Use renderer-owned GLB, procedural geometry, renderer material, particle system, or light geometry instead."
  };
}

export function createUnresolvedAssetDiagnostic(intent: AuraAssetIntent): AuraAssetSubstitutionDiagnostic {
  return {
    code: "AURA_CINEMATIC_ASSET_UNRESOLVED",
    severity: intent.required ? "error" : "warning",
    path: `assetRequirements[${intent.id}]`,
    message: `No renderer-owned cinematic asset resolved for '${intent.label}'.`,
    fixSuggestion: "Add a matching manifest entry or enable an allowed procedural fallback."
  };
}
