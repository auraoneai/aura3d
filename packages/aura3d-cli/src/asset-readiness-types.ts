import type {
  AuraCliAssetEntry,
  AuraCliAssetType,
  AuraCliAssetProvenance,
} from "./asset-core-types.js";

export type AuraAssetReadinessProfile = "game" | "animation";
export type AuraGameAssetReadinessProfile = "fighting-character";
export type AuraAssetReadinessStatus = "passed" | "failed";

export interface AssetReadinessOptions {
  readonly projectDir?: string;
  readonly output?: string;
  readonly gameProfile?: AuraGameAssetReadinessProfile;
  readonly episode?: boolean;
  readonly noPlaceholders?: boolean;
  readonly requireLicense?: boolean;
  readonly provenanceFile?: string;
  readonly assetIds?: readonly string[];
}

export interface AssetReadinessReport {
  readonly schema: "aura3d.asset-readiness/1.0";
  readonly profile: AuraAssetReadinessProfile;
  readonly gameProfile?: AuraGameAssetReadinessProfile;
  readonly ok: boolean;
  readonly status: AuraAssetReadinessStatus;
  readonly validator: AssetReadinessValidatorEvidence;
  readonly checkedAt: string;
  readonly manifestPath: string;
  readonly artifacts: AssetReadinessArtifacts;
  readonly contracts: readonly AssetReadinessValidationContract[];
  readonly animationEpisode?: AnimationEpisodeReadinessReport;
  readonly summary: {
    readonly totalAssets: number;
    readonly modelAssets: number;
    readonly animatedModels: number;
    readonly textureAssets: number;
    readonly audioAssets: number;
    readonly environmentAssets: number;
    readonly animationClips: number;
    readonly humanoidModels: number;
    readonly animationCharacters?: number;
    readonly animationSets?: number;
    readonly animationProps?: number;
    readonly episodeReadyCharacters?: number;
    readonly mouthReadyCharacters?: number;
    readonly animationReadyCharacters?: number;
    readonly profileTargetAssets?: number;
    readonly profileReadyAssets?: number;
    readonly profileSkippedAssets?: number;
  };
  readonly assets: readonly AssetReadinessAssetReport[];
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

export type AnimationEpisodeAssetRole =
  | "character"
  | "set"
  | "prop"
  | "environment"
  | "audio"
  | "texture"
  | "unknown";

export type AnimationEpisodeMouthReadinessMode =
  | "blendshape-lip-sync"
  | "primitive-mouth-card"
  | "amplitude-only"
  | "missing-mouth-motion";

export interface AnimationEpisodeAssetReadiness {
  readonly id: string;
  readonly role: AnimationEpisodeAssetRole;
  readonly episodeReady: boolean;
  readonly distinctHash?: string;
  readonly licenseVerified: boolean;
  readonly provenanceReady: boolean;
  readonly placeholderFree: boolean;
  readonly animationReady: boolean;
  readonly mouthReady: boolean;
  readonly mouthMode?: AnimationEpisodeMouthReadinessMode;
  readonly setReady?: boolean;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

export interface AnimationEpisodeReadinessReport {
  readonly enabled: boolean;
  readonly ok: boolean;
  readonly mode: "episode-ready";
  readonly requirements: {
    readonly minDistinctCharacters: number;
    readonly minSets: number;
    readonly requireLicense: boolean;
    readonly noPlaceholders: boolean;
    readonly requireAnimation: boolean;
    readonly requireMouthMotion: boolean;
    readonly requireSetScale: boolean;
  };
  readonly selectedCharacters: readonly string[];
  readonly selectedSets: readonly string[];
  readonly selectedProps: readonly string[];
  readonly selectedAudio: readonly string[];
  readonly readiness: readonly AnimationEpisodeAssetReadiness[];
  readonly assetProvenanceArtifact: string;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

export interface AssetReadinessValidatorEvidence {
  readonly id: "aura-clash-game-assets" | "aura-voice-animation-assets";
  readonly command: "assets validate-game" | "assets validate-animation";
  readonly label: string;
}

export interface AssetReadinessValidationContract {
  readonly id: string;
  readonly label: string;
  readonly profile: AuraAssetReadinessProfile;
  readonly sourceFamily?: "Quaternius" | "AuraVoice" | "custom";
  readonly intendedUse?: "fighter" | "animation-character" | "set" | "prop";
  readonly sourceOnly: boolean;
  readonly requiredChecks: readonly string[];
  readonly requiredAnimationClips?: readonly string[];
  readonly evidenceBoundary: string;
}

export interface AssetReadinessArtifacts {
  readonly manifestPath: string;
  readonly typedAssetsPath: string;
  readonly outputDir: string;
  readonly assetBasePath: string;
  readonly evidencePath?: string;
  readonly assetFiles: readonly AssetReadinessAssetArtifacts[];
}

export interface AssetReadinessAssetArtifacts {
  readonly id: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly publicUrl: string;
  readonly thumbnailPath?: string;
  readonly thumbnailUrl?: string;
  readonly dependencyPaths: readonly string[];
}

export interface AssetReadinessAnimationMetadata {
  readonly clipCount: number;
  readonly clips: readonly AssetReadinessAnimationClipMetadata[];
}

export interface AssetReadinessAnimationClipMetadata {
  readonly index: number;
  readonly name: string;
}

export interface AssetReadinessAssetReport {
  readonly id: string;
  readonly type: AuraCliAssetType;
  readonly format: string;
  readonly source: string;
  readonly outputPath: string;
  readonly url: string;
  readonly hash: string;
  readonly sizeBytes: number;
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: AuraCliAssetEntry["boundsMetadata"];
  readonly animations: readonly string[];
  readonly animation: AssetReadinessAnimationMetadata;
  readonly animationMetadata?: AuraCliAssetEntry["animationMetadata"];
  readonly humanoid?: AuraCliAssetEntry["humanoid"];
  readonly skeleton?: AuraCliAssetEntry["skeleton"];
  readonly morphTargets?: AuraCliAssetEntry["morphTargets"];
  readonly provenance?: AuraCliAssetProvenance;
  readonly placeholderFree: boolean;
  readonly licenseVerified: boolean;
  readonly materials: readonly string[];
  readonly materialMetadata?: AuraCliAssetEntry["materialMetadata"];
  readonly textures: readonly string[];
  readonly orientation?: AuraCliAssetEntry["orientation"];
  readonly nodeNames?: readonly string[];
  readonly artifactPaths: AssetReadinessAssetArtifacts;
  readonly gameReady: boolean;
  readonly animationReady: boolean;
  readonly profileTarget?: boolean;
  readonly profileReady?: boolean;
  readonly profileSkippedReason?: string;
  readonly warnings: readonly string[];
}
