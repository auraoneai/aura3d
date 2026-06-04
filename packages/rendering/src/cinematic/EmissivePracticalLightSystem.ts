import type { CinematicRuntimeLight } from "./CinematicLightingRig";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicEmissivePractical {
  readonly id: string;
  readonly sourceObjectId: string;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly radiusMeters: number;
}

export interface CinematicEmissivePracticalLightSystem {
  readonly id: string;
  readonly practicals: readonly CinematicEmissivePractical[];
  readonly lights: readonly CinematicRuntimeLight[];
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createEmissivePracticalLightSystem(
  practicals: readonly CinematicEmissivePractical[],
  id = "cinematic-emissive-practicals"
): CinematicEmissivePracticalLightSystem {
  return {
    id,
    practicals,
    lights: practicals.map((practical) => ({
      id: `light:${practical.id}`,
      role: "practical",
      type: "point",
      color: practical.color,
      intensity: practical.intensity,
      position: [0, 1, 0],
      castsShadow: false
    })),
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `lighting:${id}`,
      feature: "lighting",
      label: "Emissive practical light system",
      source: "renderer-light",
      diagnostics: ["Neon/glowing props produce renderer light metadata and do not rely on DOM glow."]
    }),
    diagnostics: [`Compiled ${practicals.length} emissive practical lights.`]
  };
}
