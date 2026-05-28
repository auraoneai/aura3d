import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicVignettePass {
  readonly name: "vignette";
  readonly intensity: number;
  readonly radius: number;
  readonly softness: number;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
}

export function createCinematicVignettePass(options: Partial<Omit<CinematicVignettePass, "name" | "rendererOwnedEvidence">> = {}): CinematicVignettePass {
  return {
    name: "vignette",
    intensity: options.intensity ?? 0.18,
    radius: options.radius ?? 0.78,
    softness: options.softness ?? 0.48,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "postprocess:vignette",
      feature: "postprocess",
      label: "Vignette pass",
      source: "renderer-postprocess",
      sceneContent: false
    })
  };
}
