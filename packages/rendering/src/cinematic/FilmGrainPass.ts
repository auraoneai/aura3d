import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicFilmGrainPass {
  readonly name: "film-grain";
  readonly intensity: number;
  readonly animated: boolean;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
}

export function createCinematicFilmGrainPass(options: Partial<Omit<CinematicFilmGrainPass, "name" | "rendererOwnedEvidence">> = {}): CinematicFilmGrainPass {
  return {
    name: "film-grain",
    intensity: options.intensity ?? 0.025,
    animated: options.animated ?? true,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "postprocess:film-grain",
      feature: "postprocess",
      label: "Film grain pass",
      source: "renderer-postprocess",
      sceneContent: false,
      diagnostics: ["Film grain is bounded by default so screenshot gates are not satisfied by noise alone."]
    })
  };
}
