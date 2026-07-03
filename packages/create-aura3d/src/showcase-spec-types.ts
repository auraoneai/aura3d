export type ShowcaseSpecClaimLabel = "createAuraApp" | "prototype" | "roadmap";
export type ShowcaseSpecFinalStatus = "release-ready candidate" | "prototype-blocked" | "internal-diagnostic" | "removed-from-public-showcase";
export type ShowcaseSpecReplacementRequiredRole =
  | "architecture"
  | "building"
  | "character"
  | "data-station"
  | "effect-core"
  | "environment"
  | "facility"
  | "industrial"
  | "level"
  | "platformer-world"
  | "stage"
  | "track"
  | "vehicle"
  | "world";

export interface ShowcaseSpecAssetPolicy {
  readonly allowReplacement: boolean;
  readonly replacementQuery?: string;
  readonly requiredRole?: ShowcaseSpecReplacementRequiredRole;
  readonly minQuality?: "candidate" | "release";
  readonly requireRenderedProbe?: boolean;
  readonly requireDeployPass?: boolean;
}

export interface ShowcaseSpecAsset {
  readonly id: string;
  readonly role: string;
  readonly typedRef: string;
  readonly quality: "release" | "candidate" | "prototype";
  readonly hasDurableProvenance: boolean;
  readonly hasRenderedProbe: boolean;
  readonly hasOrientationEvidence: boolean;
  readonly hasForegroundBounds: boolean;
  readonly assetPolicy?: ShowcaseSpecAssetPolicy;
}

export interface ShowcaseSpecCapability {
  readonly name: string;
  readonly status: "root-proven" | "partial" | "internal-only" | "roadmap" | "unsupported";
  readonly evidence?: string;
}

export type ShowcasePlatformerGameplayRequirement = "movement" | "jump" | "checkpoint" | "progression";
export type ShowcasePlatformerPlayableSurfaceSource =
  | "asset-bound-playable-surfaces"
  | "asset-derived-playable-surfaces"
  | "authored-route-rectangles";
export type ShowcaseGeometryEvidenceSource =
  | "asset-mesh-extracted"
  | "manifest-authored"
  | "manifest-authored-overlay-validated"
  | "compiler-authored"
  | "compiler-authored-overlay-validated";

export interface ShowcaseRacingTrackTopologyPoint {
  readonly x: number;
  readonly z: number;
  readonly width?: number;
}

export interface ShowcaseRacingTrackTopologyCheckpoint {
  readonly progress: number;
  readonly width: number;
}

export interface ShowcaseGeometryEvidenceRef {
  readonly sourceAsset: string;
  readonly renderedProbe?: string;
  readonly routeOverlay?: string;
  readonly notes: string;
}

export interface ShowcaseGeometryModelBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ShowcaseRacingTopologyModelAlignment {
  readonly source: ShowcaseGeometryEvidenceSource;
  readonly modelBounds: ShowcaseGeometryModelBounds;
  readonly modelPoint: readonly [number, number, number];
  readonly gamePoint: {
    readonly x: number;
    readonly z: number;
  };
  readonly anchorPairs?: readonly {
    readonly id: string;
    readonly modelPoint: readonly [number, number, number];
    readonly gamePoint: {
      readonly x: number;
      readonly z: number;
    };
  }[];
  readonly evidence: {
    readonly routeOverlay?: string;
    readonly notes: string;
  };
}

export interface ShowcasePlatformerSurfaceModelAlignment {
  readonly source: ShowcaseGeometryEvidenceSource;
  readonly modelBounds: ShowcaseGeometryModelBounds;
  readonly modelPoint: readonly [number, number, number];
  readonly gamePoint: {
    readonly x: number;
    readonly y: number;
  };
  readonly anchorPairs?: readonly {
    readonly id: string;
    readonly modelPoint: readonly [number, number, number];
    readonly gamePoint: {
      readonly x: number;
      readonly y: number;
    };
  }[];
  readonly evidence: {
    readonly routeOverlay?: string;
    readonly notes: string;
  };
}

export type ShowcaseGameAssetPairEvidenceCategory = "racing" | "platformer";

export type ShowcaseGameAssetPairEvidenceVerdict = "pass" | "fail";

export type ShowcaseGameGeometryEvidenceKind =
  | "racing-track-topology"
  | "platformer-playable-surface-map";

export interface ShowcaseGameGeometryEvidenceAsset {
  readonly id: string;
  readonly hash: string;
}

export interface ShowcaseGameGeometryEvidence {
  readonly category: ShowcaseGameAssetPairEvidenceCategory;
  readonly kind: ShowcaseGameGeometryEvidenceKind;
  readonly source: ShowcaseGeometryEvidenceSource;
  readonly report: string;
  readonly screenshotEvidence: string;
  readonly routePrimaryScreenshotSha256: string;
  readonly assets: readonly ShowcaseGameGeometryEvidenceAsset[];
}

export interface ShowcaseGameAssetPairEvidence {
  readonly category: ShowcaseGameAssetPairEvidenceCategory;
  readonly assets: readonly string[];
  readonly screenshotEvidence: string;
  readonly routePrimaryProbe?: string;
  readonly screenshotSha256?: string;
  readonly geometryEvidence?: ShowcaseGameGeometryEvidence;
  readonly verdict: ShowcaseGameAssetPairEvidenceVerdict;
  readonly notes: string;
  readonly blockers: readonly string[];
}

export interface ShowcaseRacingTrackTopology {
  readonly assetId: string;
  readonly assetHash: string;
  readonly source: ShowcaseGeometryEvidenceSource;
  readonly roadCenterline: readonly ShowcaseRacingTrackTopologyPoint[];
  readonly checkpoints: readonly ShowcaseRacingTrackTopologyCheckpoint[];
  readonly lapLengthMeters?: number;
  readonly estimatedLapSeconds: number;
  readonly confidence: number;
  readonly modelAlignment: ShowcaseRacingTopologyModelAlignment;
  readonly evidence: ShowcaseGeometryEvidenceRef;
}

export interface ShowcasePlatformerPlayableSurface {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "ground" | "platform" | "moving" | "hazard" | "checkpoint" | "finish";
}

export interface ShowcasePlatformerPlayableSurfaceMap {
  readonly assetId: string;
  readonly assetHash: string;
  readonly source: ShowcaseGeometryEvidenceSource;
  readonly surfaces: readonly ShowcasePlatformerPlayableSurface[];
  readonly levelLength: number;
  readonly estimatedCompletionSeconds: number;
  readonly characterScaleRatio: number;
  readonly confidence: number;
  readonly modelAlignment: ShowcasePlatformerSurfaceModelAlignment;
  readonly evidence: ShowcaseGeometryEvidenceRef;
}

export interface ShowcasePlatformerSpec {
  readonly characterAsset: string;
  readonly worldAssets: readonly string[];
  readonly cameraIntent: "side-scroller";
  readonly layoutConstraints: {
    readonly keepCharacterReadable: boolean;
    readonly uiAvoidsEvidenceArea: boolean;
  };
  readonly gameplayRequirements: readonly ShowcasePlatformerGameplayRequirement[];
  readonly levelDesign: {
    readonly minPlayableSeconds: number;
    readonly minCheckpoints: number;
    readonly requiresHazardRespawn: boolean;
    readonly requiresFinish: boolean;
    readonly authoredLevelFlow: boolean;
    readonly playableSurfaceSource: ShowcasePlatformerPlayableSurfaceSource;
    readonly playableSurfaceLayoutValidated: boolean;
    readonly playableSurfaceEvidence?: string;
    readonly playableSurfaceMap?: ShowcasePlatformerPlayableSurfaceMap;
    readonly assetPairEvidence?: ShowcaseGameAssetPairEvidence;
    readonly characterWorldScaleCompatible: boolean;
    readonly styleCompatible: boolean;
    readonly primitivePrimaryWorldRejected: boolean;
  };
  readonly releaseAssetRequirements: {
    readonly characterRole: "character";
    readonly worldRoles: readonly ("level" | "world" | "stage")[];
    readonly requiresOrientationEvidence: boolean;
    readonly requiresScaleNormalizationEvidence: boolean;
    readonly requiresRenderedProbe: boolean;
    readonly requiresDurableProvenance: boolean;
    readonly requiresSuitabilityReason: boolean;
  };
}

export type ShowcaseRacingGameplayRequirement = "throttle" | "steering" | "reset" | "checkpoint" | "lap" | "multi-lap";

export interface ShowcaseRacingSpec {
  readonly vehicleAsset: string;
  readonly trackAsset: string;
  readonly cameraIntent: "track-overview";
  readonly layoutConstraints: {
    readonly keepVehicleReadable: boolean;
    readonly keepTrackReadable: boolean;
    readonly uiAvoidsEvidenceArea: boolean;
  };
  readonly gameplayRequirements: readonly ShowcaseRacingGameplayRequirement[];
  readonly raceDesign: {
    readonly minCheckpoints: number;
    readonly minLaps: number;
    readonly minLapSeconds: number;
    readonly routeAlignedToTrackAsset: boolean;
    readonly visibleTrackTopology:
      | "asset-bound-road-topology"
      | "authored-route-over-visible-track"
      | "mesh-road-topology";
    readonly trackTopologyEvidence?: string;
    readonly trackTopology?: ShowcaseRacingTrackTopology;
    readonly assetPairEvidence?: ShowcaseGameAssetPairEvidence;
    readonly carTrackScaleCompatible: boolean;
    readonly noDebugLocatorDisk: boolean;
  };
  readonly releaseAssetRequirements: {
    readonly vehicleRole: "vehicle";
    readonly trackRole: "track";
    readonly requiresOrientationEvidence: boolean;
    readonly requiresScaleNormalizationEvidence: boolean;
    readonly requiresRenderedProbe: boolean;
    readonly requiresDurableProvenance: boolean;
    readonly requiresSuitabilityReason: boolean;
  };
}

export type ShowcaseCategoryPlanKind = "architecture-environment" | "industrial-digital-twin" | "particle-diagnostic" | "data-diagnostic";
export type ShowcaseCategoryCameraIntent = "architecture-hero" | "industrial-overview" | "diagnostic-core" | "data-observatory";
export type ShowcaseCategoryBackendClaim = "webgl-particle" | "native-webgpu" | "fallback";

export interface ShowcaseCategoryPlan {
  readonly kind: ShowcaseCategoryPlanKind;
  readonly primaryAsset: string;
  readonly cameraIntent: ShowcaseCategoryCameraIntent;
  readonly backendClaim?: ShowcaseCategoryBackendClaim;
  readonly layoutConstraints: {
    readonly keepHeroReadable: boolean;
    readonly uiAvoidsEvidenceArea: boolean;
  };
  readonly claims: {
    readonly allowed: readonly string[];
    readonly notAllowed: readonly string[];
  };
}

export interface ShowcaseSpec {
  readonly schema: "aura3d-showcase-spec/1.0";
  readonly routeId: string;
  readonly label: string;
  readonly category: string;
  readonly path: string;
  readonly globalName: string;
  readonly claimLabel: ShowcaseSpecClaimLabel;
  readonly publicStatus: ShowcaseSpecFinalStatus;
  readonly layout: {
    readonly heroAsset: string;
    readonly uiPlacement: "left-panel" | "right-panel" | "bottom-bar" | "none";
  };
  readonly platformer?: ShowcasePlatformerSpec;
  readonly racing?: ShowcaseRacingSpec;
  readonly categoryPlan?: ShowcaseCategoryPlan;
  readonly primaryAssets: readonly ShowcaseSpecAsset[];
  readonly evidence: {
    readonly routePrimaryProbe: string;
    readonly routePrimaryScreenshot: string;
    readonly deployCommand: string;
    readonly deployEvidence?: string;
    readonly deployPassed: boolean;
    readonly routePrimaryPassed: boolean;
    readonly gameplayProof?: string;
    readonly gameplayPassed?: boolean;
    readonly releaseAssetProbes?: Readonly<Record<string, string>>;
  };
  readonly capabilities: readonly ShowcaseSpecCapability[];
}

export interface CompileShowcaseSpecOptions {
  readonly outputDir: string;
  readonly projectDir?: string;
}

export interface CompileShowcaseSpecFileOptions extends CompileShowcaseSpecOptions {
  readonly specPath: string;
}

export interface CompileShowcaseSpecReport {
  readonly ok: boolean;
  readonly schema: "aura3d-showcase-spec-compile-report/1.0";
  readonly routeId: string;
  readonly finalStatus: ShowcaseSpecFinalStatus;
  readonly generatedFiles: readonly string[];
  readonly blockers: readonly string[];
  readonly evidenceChecklistPath: string;
  readonly routeGatePatchPath: string;
  readonly rejectedAssets: readonly ShowcaseSpecRejectedAsset[];
  readonly replacementCandidates: readonly ShowcaseSpecReplacementCandidate[];
  readonly selectedReplacement?: ShowcaseSpecSelectedReplacement;
}

export interface ShowcaseSpecRejectedAsset {
  readonly id: string;
  readonly reason:
    | "release-probe-blank"
    | "release-probe-failing"
    | "release-probe-missing"
    | "route-primary-clipped"
    | "route-primary-missing"
    | "route-primary-unreadable"
    | "game-asset-pair-failing";
  readonly evidence: string;
  readonly failures: readonly string[];
}

export interface ShowcaseSpecReplacementProvenance {
  readonly sourcePage?: string;
  readonly downloadUrl?: string;
  readonly license?: string;
  readonly licenseUrl?: string;
  readonly author?: string;
  readonly assetHash?: string;
}

export interface ShowcaseSpecReplacementCandidate {
  readonly id: string;
  readonly role: string;
  readonly typedRef: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly penalties: readonly string[];
  readonly provenance: ShowcaseSpecReplacementProvenance;
  readonly evidence?: string;
  readonly accepted: boolean;
  readonly selected: boolean;
}

export interface ShowcaseSpecSelectedReplacement {
  readonly replaces: string;
  readonly id: string;
  readonly role: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly provenance: ShowcaseSpecReplacementProvenance;
}
