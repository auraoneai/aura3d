import {
  createDomOverlayEvidenceFlag,
  validateRendererOwnedCinematicEvidence,
  type CinematicEvidenceFeature,
  type CinematicRendererEvidenceFlag,
  type CinematicRendererEvidenceValidation
} from "@aura3d/rendering";

export interface AuraCinematicRenderEvidence {
  readonly schema: "aura3d.cinematic-render-evidence/1.0";
  readonly sceneId: string;
  readonly backend: string;
  readonly flags: readonly CinematicRendererEvidenceFlag[];
  readonly validation: CinematicRendererEvidenceValidation;
  readonly rendererOwnedFlagCount: number;
  readonly domOverlayFlagCount: number;
  readonly diagnostics: readonly string[];
}

export function createAuraCinematicRenderEvidence(input: {
  readonly sceneId: string;
  readonly backend: string;
  readonly flags: readonly CinematicRendererEvidenceFlag[];
  readonly requiredFeatures: readonly CinematicEvidenceFeature[];
}): AuraCinematicRenderEvidence {
  const validation = validateRendererOwnedCinematicEvidence(input.flags, input.requiredFeatures);
  return {
    schema: "aura3d.cinematic-render-evidence/1.0",
    sceneId: input.sceneId,
    backend: input.backend,
    flags: input.flags,
    validation,
    rendererOwnedFlagCount: input.flags.filter((flag) => flag.rendererOwned).length,
    domOverlayFlagCount: input.flags.filter((flag) => flag.domOverlay).length,
    diagnostics: validation.diagnostics
  };
}

export function createAuraCinematicDomOverlayFlag(input: Parameters<typeof createDomOverlayEvidenceFlag>[0]): CinematicRendererEvidenceFlag {
  return createDomOverlayEvidenceFlag(input);
}
