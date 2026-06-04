import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicBloomPass {
  readonly name: "bloom";
  readonly threshold: number;
  readonly intensity: number;
  readonly radius: number;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
}

export function createCinematicBloomPass(options: Partial<Omit<CinematicBloomPass, "name" | "rendererOwnedEvidence">> = {}): CinematicBloomPass {
  return {
    name: "bloom",
    threshold: options.threshold ?? 0.72,
    intensity: options.intensity ?? 0.28,
    radius: options.radius ?? 1.35,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "postprocess:bloom",
      feature: "postprocess",
      label: "Bloom/glow pass",
      source: "renderer-postprocess",
      sceneContent: false,
      diagnostics: ["Bloom is a renderer postprocess pass over emissive scene content."]
    })
  };
}
