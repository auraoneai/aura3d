export interface PromptSourceAuditLocation {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

export interface UnavailablePublicImport extends PromptSourceAuditLocation {
  readonly symbol: string;
  readonly importedAs: string;
  readonly specifier: "@aura3d/engine";
}

export interface NonPublicSubpathImport extends PromptSourceAuditLocation {
  readonly specifier: string;
}

export interface UnsafeAssetReference extends PromptSourceAuditLocation {
  readonly kind: "unsafeModelUrl" | "stringModelAssetId" | "remoteModelUrl" | "hardCodedModelUrl";
  readonly value?: string;
}

export interface PromptSourceAudit {
  readonly schema: "a3d-prompt-source-audit";
  readonly generatedAt: string;
  readonly prompt: string;
  readonly sourceDir: string;
  readonly pass: boolean;
  readonly files: readonly string[];
  readonly unavailablePublicImports: readonly UnavailablePublicImport[];
  readonly nonPublicSubpathImports: readonly NonPublicSubpathImport[];
  readonly unsafeAssetReferences: readonly UnsafeAssetReference[];
  readonly failures: readonly string[];
}

export interface AuditPromptSourceOptions {
  readonly repoRoot?: string;
  readonly promptDir?: string;
  readonly sourceDir?: string;
  readonly promptFile?: string;
  readonly publicRootExports?: readonly string[];
  readonly writeReport?: boolean;
  readonly library?: string;
  readonly metadata?: {
    readonly library?: string;
  };
}

export function auditPromptSource(options: AuditPromptSourceOptions): PromptSourceAudit;
export function readPublicRootExports(repoRoot?: string): readonly string[];
