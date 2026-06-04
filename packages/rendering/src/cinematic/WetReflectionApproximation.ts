import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicWetReflectionApproximation {
  readonly id: string;
  readonly roughnessFloor: number;
  readonly reflectionStrength: number;
  readonly planarReflection: false;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createWetReflectionApproximation(options: Partial<Omit<CinematicWetReflectionApproximation, "id" | "planarReflection" | "rendererOwnedEvidence" | "diagnostics">> & { readonly id?: string } = {}): CinematicWetReflectionApproximation {
  return {
    id: options.id ?? "cinematic-wet-reflection",
    roughnessFloor: options.roughnessFloor ?? 0.16,
    reflectionStrength: options.reflectionStrength ?? 0.68,
    planarReflection: false,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `material:${options.id ?? "cinematic-wet-reflection"}`,
      feature: "material",
      label: "Wet reflection approximation",
      source: "renderer-material",
      diagnostics: ["Wet reflections use renderer PBR/IBL approximation; this is not a live planar reflection claim."]
    }),
    diagnostics: ["Wet reflection approximation is bounded to PBR roughness/specular response."]
  };
}
