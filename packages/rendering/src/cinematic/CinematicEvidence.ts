export type CinematicEvidenceFeature =
  | "material"
  | "lighting"
  | "vfx"
  | "postprocess"
  | "camera"
  | "timeline"
  | "blocking"
  | "asset"
  | "environment";

export type CinematicEvidenceSource =
  | "renderer-scene"
  | "renderer-material"
  | "renderer-light"
  | "renderer-vfx"
  | "renderer-postprocess"
  | "renderer-camera"
  | "renderer-timeline"
  | "dom-overlay"
  | "css-overlay";

export interface CinematicRendererEvidenceFlag {
  readonly id: string;
  readonly feature: CinematicEvidenceFeature;
  readonly label: string;
  readonly source: CinematicEvidenceSource;
  readonly rendererOwned: boolean;
  readonly sceneContent: boolean;
  readonly domOverlay: boolean;
  readonly satisfiesPublicCinematicGate: boolean;
  readonly diagnostics: readonly string[];
}

export interface CinematicDomOverlayRejection {
  readonly ok: false;
  readonly code: "AURA_CINEMATIC_DOM_OVERLAY_EVIDENCE_REJECTED";
  readonly missingRendererOwnedFeatures: readonly CinematicEvidenceFeature[];
  readonly overlayOnlyFeatures: readonly CinematicEvidenceFeature[];
  readonly diagnostics: readonly string[];
}

export interface CinematicRendererEvidenceAccepted {
  readonly ok: true;
  readonly rendererOwnedFeatures: readonly CinematicEvidenceFeature[];
  readonly diagnostics: readonly string[];
}

export type CinematicRendererEvidenceValidation = CinematicRendererEvidenceAccepted | CinematicDomOverlayRejection;

export function createRendererOwnedEvidenceFlag(input: {
  readonly id: string;
  readonly feature: CinematicEvidenceFeature;
  readonly label: string;
  readonly source?: Exclude<CinematicEvidenceSource, "dom-overlay" | "css-overlay">;
  readonly sceneContent?: boolean;
  readonly diagnostics?: readonly string[];
}): CinematicRendererEvidenceFlag {
  return {
    id: input.id,
    feature: input.feature,
    label: input.label,
    source: input.source ?? "renderer-scene",
    rendererOwned: true,
    sceneContent: input.sceneContent ?? true,
    domOverlay: false,
    satisfiesPublicCinematicGate: true,
    diagnostics: input.diagnostics ?? []
  };
}

export function createDomOverlayEvidenceFlag(input: {
  readonly id: string;
  readonly feature: CinematicEvidenceFeature;
  readonly label: string;
  readonly source?: "dom-overlay" | "css-overlay";
  readonly diagnostics?: readonly string[];
}): CinematicRendererEvidenceFlag {
  return {
    id: input.id,
    feature: input.feature,
    label: input.label,
    source: input.source ?? "dom-overlay",
    rendererOwned: false,
    sceneContent: false,
    domOverlay: true,
    satisfiesPublicCinematicGate: false,
    diagnostics: input.diagnostics ?? ["DOM/CSS overlays are diagnostic UI only and do not satisfy public cinematic scene evidence."]
  };
}

export function validateRendererOwnedCinematicEvidence(
  flags: readonly CinematicRendererEvidenceFlag[],
  requiredFeatures: readonly CinematicEvidenceFeature[]
): CinematicRendererEvidenceValidation {
  const rendererOwnedFeatures = unique(flags.filter((flag) => flag.rendererOwned && flag.satisfiesPublicCinematicGate).map((flag) => flag.feature));
  const overlayOnlyFeatures = requiredFeatures.filter((feature) => {
    const featureFlags = flags.filter((flag) => flag.feature === feature);
    return featureFlags.length > 0 && featureFlags.every((flag) => flag.domOverlay || !flag.rendererOwned);
  });
  const missingRendererOwnedFeatures = requiredFeatures.filter((feature) => !rendererOwnedFeatures.includes(feature));
  if (missingRendererOwnedFeatures.length > 0 || overlayOnlyFeatures.length > 0) {
    return {
      ok: false,
      code: "AURA_CINEMATIC_DOM_OVERLAY_EVIDENCE_REJECTED",
      missingRendererOwnedFeatures,
      overlayOnlyFeatures,
      diagnostics: [
        "Required cinematic proof must come from renderer-owned scene, material, lighting, VFX, postprocess, camera, timeline, or blocking data.",
        ...overlayOnlyFeatures.map((feature) => `${feature} was represented only by DOM/CSS overlay evidence.`)
      ]
    };
  }
  return {
    ok: true,
    rendererOwnedFeatures,
    diagnostics: ["All required cinematic evidence features are renderer-owned."]
  };
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
