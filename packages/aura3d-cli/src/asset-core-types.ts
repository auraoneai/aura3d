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
import type {
  AssetBudgetMeasurement,
  AuraCliAdmissionRecord,
  AuraCliDerivedAsset,
  AuraCliLookDevRecord,
} from "./contracts/assetManifest.js";

export type AuraCliAssetType = "model" | "texture" | "environment" | "audio" | "navigation";
export type AuraAssetQuality = "ungraded" | "blocked" | "prototype" | "candidate" | "release";
// PRD-05 §7.2 — the C-17 union plus the legacy 1.0 roles. Roles outside the
// C-17 set ("product", "weapon", "track", "environment", "unknown",
// "debug", "abstract") stay valid for 1.0 entries and map to profiles in
// `admission/profiles.ts`.
export type AuraCliAssetRole =
  | "hero"
  | "character"
  | "vehicle"
  | "enemy"
  | "world"
  | "environment"
  | "track"
  | "product"
  | "weapon"
  | "prop"
  | "set-dressing"
  | "backdrop"
  | "proxy"
  | "hdri"
  | "texture-set"
  | "vfx-atlas"
  | "audio"
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
  // Reader accepts 1.0 and 1.1; the writer emits 1.1 once `A3D_QR_ASSETS` is
  // on (C-17 stub rule), otherwise preserves the schema it was handed.
  readonly schema: "aura3d.assets/1.0" | "aura3d.assets/1.1";
  readonly assetBasePath: string;
  readonly outputDir: string;
  readonly typegen: string;
  readonly assets: readonly AuraCliAssetEntry[];
}

/** §7.2 — measurement detail carried by `AuraCliDerivedAssetDetail.measurements`. */
export interface AssetBudgetMeasurementDetail extends AssetBudgetMeasurement {
  readonly vertices?: number;
  readonly primitives?: number;
  readonly materials?: number;
  readonly textureCount?: number;
  readonly fileBytes?: number;
  readonly maxTextureDimension?: number;
}

/** §7.2 — lane-05 extension of the C-17 `AuraCliDerivedAsset`. */
export interface AuraCliDerivedAssetDetail extends AuraCliDerivedAsset {
  readonly sourceHash: string;
  readonly outputPath: string;
  readonly extensionsUsed: readonly string[];
  readonly requiredDecoders: readonly ("meshopt" | "draco" | "ktx2")[];
  readonly lods: readonly { readonly level: number; readonly triangles: number; readonly screenCoverage: number }[];
  readonly measurements: { readonly before: AssetBudgetMeasurementDetail; readonly after: AssetBudgetMeasurementDetail };
  readonly optimize?: "not-needed";
}

/** §7.0 — C-17 admission record plus `derivedHash`/`quality`. */
export interface AuraCliAdmissionRecordDetail extends AuraCliAdmissionRecord {
  readonly derivedHash?: string;
  readonly quality?: AuraAssetQuality;
}

/** §7.0 — look-dev review; `judge` matches the C-32 `JudgeIdentity` shape. */
export interface AuraCliLookDevReview {
  readonly reviewer: string;
  readonly verdict: "accept" | "reject";
  readonly notes: string;
  readonly at: string;
  readonly judge?: { readonly kind: "human" | "vision-model"; readonly id: string; readonly model?: string };
  readonly score?: number;
  readonly axes?: Readonly<Record<string, number>>;
}

/** §7.0 — C-17 look-dev record plus `derivedHash`, `stageVersion`, `contactSheet`, `metrics`. */
export interface AuraCliLookDevRecordDetail extends Omit<AuraCliLookDevRecord, "reviews"> {
  readonly reviews: readonly AuraCliLookDevReview[];
  readonly derivedHash?: string;
  readonly stageVersion?: string;
  readonly contactSheet?: string;
  readonly metrics?: Readonly<Record<string, unknown>>;
}

/** §7.2 — audio-side metadata written by `assets add --type audio` (R-09-1). */
export interface AuraCliAudioMetadata {
  readonly loudnessLufs?: number;
  readonly truePeakDb?: number;
  readonly author?: string;
  readonly sourceUrl?: string;
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
  // ---- schema 1.1 fields (PRD-05 §7.2 / C-17) ----
  readonly derived?: AuraCliDerivedAssetDetail;
  readonly admission?: AuraCliAdmissionRecordDetail;
  readonly lookDev?: AuraCliLookDevRecordDetail;
  readonly artDirection?: string;
  /** Byte-identical source dedup: this entry aliases another manifest id. */
  readonly aliasOf?: string;
  /** G2 camera override (§6.4). */
  readonly gameplayCamera?: { readonly distance: number; readonly fovDegrees: number };
  /** C-17 clip objects for lane 06 (Q-05-1). */
  readonly animationClips?: readonly { readonly name: string; readonly duration: number; readonly channelCount: number }[];
  readonly audio?: AuraCliAudioMetadata;
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
  /** `assets/art-direction/<id>.json` id (G10, §6.4). */
  readonly artDirection?: string;
  /** R-09-1: written into `entry.audio` for `--type audio` adds. */
  readonly audio?: AuraCliAudioMetadata;
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
