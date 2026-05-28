import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicDepthCompositionPlan {
  readonly mode: "depth-aware" | "camera-sorted";
  readonly depthTextureRequired: boolean;
  readonly fallback: "camera-sorted-transparent-cards";
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createCinematicDepthCompositionPlan(options: { readonly depthTextureAvailable?: boolean } = {}): CinematicDepthCompositionPlan {
  const depthTextureAvailable = options.depthTextureAvailable === true;
  return {
    mode: depthTextureAvailable ? "depth-aware" : "camera-sorted",
    depthTextureRequired: depthTextureAvailable,
    fallback: "camera-sorted-transparent-cards",
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "vfx:depth-composition",
      feature: "vfx",
      label: "Depth-aware VFX composition",
      source: "renderer-vfx",
      diagnostics: [depthTextureAvailable ? "VFX can sample renderer-owned depth." : "VFX falls back to camera-sorted renderer cards/particles."]
    }),
    diagnostics: [
      depthTextureAvailable
        ? "Depth texture is available for VFX composition."
        : "Depth texture is not declared; composition remains renderer-owned but uses camera-sorted approximations."
    ]
  };
}
