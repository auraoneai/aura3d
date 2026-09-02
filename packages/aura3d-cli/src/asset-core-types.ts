import type {
  AuraCliAnimationInspection,
  AuraCliAssetBoundsInspection,
  AuraCliHumanoidInspection,
  AuraCliMaterialInspection,
  AuraCliMorphTargetInspection,
  AuraCliOrientationInspection,
  AuraCliSceneHierarchyInspection,
  AuraCliSkeletonInspection,
} from "./asset-inspection-types.js";

export type AuraCliAssetType = "model" | "texture" | "environment" | "audio" | "navigation";
export type AuraAssetQuality = "ungraded" | "blocked" | "prototype" | "candidate" | "release";
export type AuraCliAssetRole =
  | "character"
  | "vehicle"
  | "world"
  | "environment"
  | "track"
  | "product"
  | "weapon"
  | "prop"
  | "set-dressing"
  | "debug"
  | "abstract"
  | "unknown";
export type AuraCliRenderedProbeKind = "browser-screenshot" | "aura-probe-render" | "manual-inspection" | "unknown";
export type AuraCliGameAssetCertification =
  | "not-game-ready"
  | "candidate-needs-geometry"
  | "certified-racing-track"
  | "certified-racing-vehicle"
  | "certified-platformer-world"
  | "certified-platformer-character"
  | "certified-generated-game-world";

export interface AuraCliGameGeometryEvidence {
  readonly routePrimaryScreenshot?: string;
  readonly routePrimaryScreenshotSha256?: string;
  readonly geometryReport?: string;
  readonly manifestHash?: string;
  readonly visualReview?: "pass" | "fail";
  readonly assetPairPass?: boolean;
  readonly blockers?: readonly string[];
}

export interface AuraCliGameGeometryMetadata {
  readonly certification?: AuraCliGameAssetCertification;
  readonly evidence?: AuraCliGameGeometryEvidence;
  readonly racingTopology?: Readonly<Record<string, unknown>>;
  readonly playableSurfaceMap?: Readonly<Record<string, unknown>>;
}

export type AuraCliGameGeometryCategory = "racing" | "platformer";

export interface CertifyGameGeometryOptions {
  readonly projectDir?: string;
  readonly category: AuraCliGameGeometryCategory;
  readonly assetId?: string;
  readonly assetIds?: readonly string[];
}

export interface GameGeometryCertificationRow {
  readonly assetId: string;
  readonly category: AuraCliGameGeometryCategory;
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly blockers: readonly string[];
}

export interface GameGeometryCertificationResult {
  readonly ok: boolean;
  readonly mode: "certify" | "screen";
  readonly wroteManifest: boolean;
  readonly manifestPath: string;
  readonly typegenPath?: string;
  readonly rows: readonly GameGeometryCertificationRow[];
}

export interface BindGameRouteEvidenceOptions {
  readonly projectDir?: string;
  readonly category: AuraCliGameGeometryCategory;
  readonly routeId: string;
  readonly assetIds: readonly string[];
  readonly routePrimaryScreenshot: string;
  readonly geometryReport: string;
  readonly compositionReport: string;
  readonly visualReview: string;
}

export interface BindGameRouteEvidenceResult {
  readonly ok: boolean;
  readonly wroteManifest: boolean;
  readonly manifestPath: string;
  readonly typegenPath?: string;
  readonly routeId: string;
  readonly assetIds: readonly string[];
  readonly blockers: readonly string[];
}

export interface AuraCliRenderedProbeForegroundBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AuraCliRenderedProbe {
  readonly url: string;
  readonly kind: AuraCliRenderedProbeKind;
  readonly renderer?: string;
  readonly route?: string;
  readonly sha256?: string;
  readonly assetHash?: string;
  readonly nonBlankPixels?: number;
  readonly colorBuckets?: number;
  readonly width?: number;
  readonly height?: number;
  readonly checkedAt?: string;
  readonly foregroundBounds?: AuraCliRenderedProbeForegroundBounds;
}

export interface AuraCliResolveCandidateProvenance {
  readonly catalogId: string;
  readonly query: string;
  readonly source: string;
  readonly sourceFamily?: string;
  readonly retrievedAt?: string;
  readonly scoreTotal: number;
  readonly scoreBreakdown: {
    readonly semantic: number;
    readonly sourceQuality: number;
    readonly license: number;
    readonly inspection: number;
    readonly roleFit: number;
  };
  readonly reasons: readonly string[];
  readonly penalties: readonly string[];
  readonly sourcePage?: string;
  readonly downloadUrl?: string;
  readonly license?: string;
  readonly licenseName?: string;
  readonly licenseUrl?: string;
  readonly licenseRaw?: string;
  readonly author?: string;
  readonly attribution?: string;
  readonly semanticScore?: number;
  readonly workerScore?: number;
  readonly qualityScore?: number;
  readonly bounds?: readonly [number, number, number];
  readonly dimensions?: readonly [number, number, number];
  readonly triangleCount?: number;
  readonly meshCount?: number;
  readonly materialCount?: number;
  readonly textureCount?: number;
  readonly animationClipCount?: number;
  readonly animationClips?: readonly string[];
  readonly skinCount?: number;
  readonly morphTargetCount?: number;
  readonly intendedRole?: string;
  readonly roleSuitability?: string;
  readonly qualityWarnings?: readonly string[];
  readonly duplicateHash?: string;
  readonly duplicateOkReason?: string;
  readonly postDownloadInspection?: {
    readonly bounds?: readonly [number, number, number];
    readonly materialCount: number;
    readonly textureCount: number;
    readonly animationClipCount: number;
    readonly skinCount: number;
    readonly morphTargetCount: number;
    readonly warnings: readonly string[];
  };
  readonly rawCatalogMetadata?: Readonly<Record<string, unknown>>;
}

export interface AuraCliGeneratedAssetProvenance {
  readonly provider: "meshy" | string;
  readonly providerCli?: string;
  readonly taskId?: string;
  readonly parentTaskIds?: readonly string[];
  readonly operation?: string;
  readonly promptHash?: string;
  readonly model?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly createdAt?: string;
  readonly finishedAt?: string;
  readonly consumedCredits?: number;
  readonly localMetadata: string;
  readonly rightsEvidence: string;
}

export interface AuraCliAssetProvenance {
  readonly sourcePath: string;
  readonly sourcePage?: string;
  readonly downloadUrl?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly licenseName?: string;
  readonly licenseUrl?: string;
  readonly licenseRaw?: string;
  readonly author?: string;
  readonly sourceFamily?: string;
  readonly attribution?: string;
  readonly sha256?: string;
  readonly retrievedAt?: string;
  readonly resolveCandidate?: AuraCliResolveCandidateProvenance;
  readonly generation?: AuraCliGeneratedAssetProvenance;
  readonly evidence?: readonly string[];
  readonly checkedAt: string;
}

export interface AuraCliAssetManifest {
  readonly schema: "aura3d.assets/1.0";
  readonly assetBasePath: string;
  readonly outputDir: string;
  readonly typegen: string;
  readonly assets: readonly AuraCliAssetEntry[];
}

export interface AuraCliAssetEntry {
  readonly id: string;
  readonly type: AuraCliAssetType;
  readonly format: string;
  readonly source: string;
  readonly outputPath: string;
  readonly url: string;
  readonly hash: string;
  readonly sizeBytes: number;
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly materials: readonly string[];
  readonly materialMetadata?: readonly AuraCliMaterialInspection[];
  readonly animations: readonly string[];
  readonly animationMetadata?: AuraCliAnimationInspection;
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly skeleton?: AuraCliSkeletonInspection;
  readonly morphTargets?: AuraCliMorphTargetInspection;
  readonly hierarchy?: AuraCliSceneHierarchyInspection;
  readonly provenance?: AuraCliAssetProvenance;
  readonly textures: readonly string[];
  readonly dependencies?: readonly string[];
  readonly orientation?: AuraCliOrientationInspection;
  readonly nodeNames?: readonly string[];
  readonly thumbnailUrl?: string;
  readonly quality?: AuraAssetQuality;
  readonly role?: AuraCliAssetRole;
  readonly suitabilityReason?: string;
  readonly renderedProbe?: AuraCliRenderedProbe;
  readonly gameGeometry?: AuraCliGameGeometryMetadata;
  readonly warnings: readonly string[];
}

export interface AddAssetOptions {
  readonly projectDir?: string;
  readonly file: string;
  readonly name: string;
  readonly type?: AuraCliAssetType;
  readonly publicPath?: string;
  readonly outputDir?: string;
  readonly typegen?: string;
  readonly copy?: boolean;
  readonly sourcePage?: string;
  readonly downloadUrl?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly licenseName?: string;
  readonly licenseUrl?: string;
  readonly licenseRaw?: string;
  readonly author?: string;
  readonly sourceFamily?: string;
  readonly attribution?: string;
  readonly sha256?: string;
  readonly provenanceEvidence?: readonly string[];
  /** Replace prior detected/manifest evidence instead of preserving it on re-add. */
  readonly replaceProvenanceEvidence?: boolean;
  readonly resolveCandidate?: AuraCliResolveCandidateProvenance;
  readonly generation?: AuraCliGeneratedAssetProvenance;
  readonly quality?: AuraAssetQuality;
  readonly role?: AuraCliAssetRole;
  readonly suitabilityReason?: string;
  readonly renderedProbe?: AuraCliRenderedProbe;
  readonly orientation?: AuraCliOrientationInspection;
  readonly gameGeometry?: AuraCliGameGeometryMetadata;
  readonly retrievedAt?: string;
}

export interface ReadRenderedProbeMetadataOptions {
  readonly projectDir?: string;
  readonly file: string;
}

export interface AssetCliResult {
  readonly ok: boolean;
  readonly manifestPath: string;
  readonly manifest: AuraCliAssetManifest;
  readonly messages: readonly string[];
}

export interface AssetValidationResult extends AssetCliResult {
  readonly source?: AssetSourceValidationReport;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

export interface AssetValidationOptions {
  readonly projectDir?: string;
  readonly noPlaceholders?: boolean;
  readonly requireLicense?: boolean;
  readonly provenanceFile?: string;
  readonly assetIds?: readonly string[];
  readonly source?: boolean | string;
  readonly release?: boolean;
}

export interface CheckDeployOptions extends AssetValidationOptions {
  readonly distDir?: string;
}

export interface AssetSourceValidationReport {
  readonly enabled: boolean;
  readonly roots: readonly string[];
  readonly files: readonly string[];
  readonly typedAssetUsages: readonly AssetSourceTypedAssetUsage[];
  readonly filesByAsset: Readonly<Record<string, readonly string[]>>;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

export interface AssetSourceTypedAssetUsage {
  readonly assetId: string;
  readonly typedAsset: string;
  readonly file: string;
  readonly occurrences: number;
}
