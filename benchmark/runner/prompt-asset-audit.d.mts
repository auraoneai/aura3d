export interface PromptAssetAuditRecord {
  readonly kind?: "source-reference" | "public-file";
  readonly path: string;
  readonly normalized: string;
  readonly file: string;
  readonly reason?: string;
  readonly sha256?: string;
}

export interface PromptAssetTypedAuraEvidence {
  readonly library: string | null;
  readonly canonicalPromptAssetHash: string | null;
  readonly hasAuraAssetsModule: boolean;
  readonly auraAssetsUsesDefineAuraAssets: boolean;
  readonly auraAssetsContainsManifestHash: boolean;
  readonly auraAssetsContainsManifestUrl: boolean;
  readonly hasAuraAssetManifest: boolean;
  readonly manifestSchema: string | null;
  readonly manifestTypegen: string | null;
  readonly manifestAssetBasePath: string | null;
  readonly manifestOutputDir: string | null;
  readonly manifestHasSneakerEntry: boolean;
  readonly manifestSneakerUrl: string | null;
  readonly manifestSneakerHash: string | null;
  readonly manifestSneakerOutputPath: string | null;
  readonly manifestSneakerSource: string | null;
  readonly manifestSourceHash: string | null;
  readonly manifestOutputHash: string | null;
  readonly manifestMatchesCanonicalAsset: boolean;
  readonly hasSneakerEntry: boolean;
  readonly sneakerUrl: string | null;
  readonly normalizedSneakerUrl: string | null;
  readonly sneakerUrlIsAllowedPromptAsset: boolean;
  readonly importsGeneratedAssets: boolean;
  readonly usesTypedSneakerAsset: boolean;
  readonly usesStringAssetId: boolean;
  readonly usesUnsafeModelUrl: boolean;
}

export interface PromptAssetAuditResult {
  readonly prompt: string;
  readonly skipped: boolean;
  readonly reason?: string;
  readonly invented: readonly PromptAssetAuditRecord[];
  readonly inventedUnique: readonly string[];
  readonly inventedAssetPaths: number;
  readonly allowed: readonly PromptAssetAuditRecord[];
  readonly typedAuraEvidence: PromptAssetTypedAuraEvidence | null;
  readonly failures: readonly string[];
}

export function auditPromptAssetPaths(options: {
  readonly promptFile?: string;
  readonly promptDir?: string;
  readonly sourceDir?: string;
  readonly repoRoot?: string;
  readonly library?: string;
  readonly metadata?: {
    readonly library?: string;
  };
}): PromptAssetAuditResult;
