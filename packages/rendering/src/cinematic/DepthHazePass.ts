import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicDepthHazePass {
  readonly name: "depth-haze";
  readonly color: readonly [number, number, number];
  readonly density: number;
  readonly startMeters: number;
  readonly endMeters: number;
  readonly requiresDepth: boolean;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
}

export function createCinematicDepthHazePass(options: Partial<Omit<CinematicDepthHazePass, "name" | "rendererOwnedEvidence">> = {}): CinematicDepthHazePass {
  return {
    name: "depth-haze",
    color: options.color ?? [0.22, 0.34, 0.52],
    density: options.density ?? 0.22,
    startMeters: options.startMeters ?? 2.5,
    endMeters: options.endMeters ?? 18,
    requiresDepth: options.requiresDepth ?? true,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "postprocess:depth-haze",
      feature: "postprocess",
      label: "Depth haze pass",
      source: "renderer-postprocess",
      sceneContent: false,
      diagnostics: ["Depth haze is renderer-owned atmospheric composition; DOM fog panels do not satisfy this evidence."]
    })
  };
}
