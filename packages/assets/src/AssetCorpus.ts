export type GLTFCorpusSchemaVersion = "gltf-corpus";
export type GLTFCorpusAssetFormat = "gltf" | "glb";
export type GLTFCorpusExpectedStatus = "pass" | "warn" | "expected-fail";
export type AssetDiagnosticSeverity = "info" | "warning" | "error";

export interface AssetDiagnostic {
  readonly code: string;
  readonly severity: AssetDiagnosticSeverity;
  readonly message: string;
  readonly nextAction: string;
  readonly assetId?: string;
}

export interface AssetImportSettings {
  readonly colorSpace: "asset" | "srgb" | "linear";
  readonly mipmaps: "generate" | "preserve" | "none";
  readonly compression: "auto" | "prefer-source" | "none";
  readonly scale: number;
  readonly normals: "preserve" | "generate-if-missing" | "require";
  readonly tangents: "preserve" | "generate-if-missing" | "require";
  readonly animationImport: "all" | "first-clip" | "none";
  readonly materialVariants: "import" | "ignore";
}

export interface GLTFCorpusSource {
  readonly repository: string;
  readonly revision: string;
  readonly path: string;
  readonly uri: string;
  readonly sha256: string;
}

export interface GLTFCorpusAsset {
  readonly id: string;
  readonly name: string;
  readonly source: GLTFCorpusSource;
  readonly format: GLTFCorpusAssetFormat;
  readonly tags: readonly string[];
  readonly license: string;
  readonly expectedStatus: GLTFCorpusExpectedStatus;
  readonly expectedDiagnostics?: readonly AssetDiagnostic[];
  readonly importSettings?: Partial<AssetImportSettings>;
}

export interface GLTFCorpusManifest {
  readonly schemaVersion: GLTFCorpusSchemaVersion;
  readonly generatedFrom: {
    readonly name: string;
    readonly repository: string;
    readonly revision: string;
  };
  readonly assets: readonly GLTFCorpusAsset[];
}

export interface GLTFCorpusAssetReport {
  readonly id: string;
  readonly name: string;
  readonly format: GLTFCorpusAssetFormat;
  readonly expectedStatus: GLTFCorpusExpectedStatus;
  readonly sourceUri: string;
  readonly sourceRevision: string;
  readonly sourceSha256: string;
  readonly tags: readonly string[];
  readonly importSettings: AssetImportSettings;
  readonly diagnostics: readonly AssetDiagnostic[];
}

export interface GLTFCorpusReport {
  readonly schemaVersion: "gltf-corpus-report";
  readonly generatedAt: string;
  readonly sourceManifest: {
    readonly schemaVersion: GLTFCorpusSchemaVersion;
    readonly sourceName: string;
    readonly sourceRepository: string;
    readonly sourceRevision: string;
    readonly assetCount: number;
  };
  readonly summary: {
    readonly pass: number;
    readonly warn: number;
    readonly expectedFail: number;
  };
  readonly assets: readonly GLTFCorpusAssetReport[];
}

export interface GLTFCorpusValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly AssetDiagnostic[];
  readonly manifest?: GLTFCorpusManifest;
}

export const DEFAULT_ASSET_IMPORT_SETTINGS: AssetImportSettings = {
  colorSpace: "asset",
  mipmaps: "generate",
  compression: "auto",
  scale: 1,
  normals: "generate-if-missing",
  tangents: "generate-if-missing",
  animationImport: "all",
  materialVariants: "import"
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeAssetImportSettings(settings: Partial<AssetImportSettings> = {}): AssetImportSettings {
  const normalized: AssetImportSettings = {
    ...DEFAULT_ASSET_IMPORT_SETTINGS,
    ...settings
  };

  validateChoice(normalized.colorSpace, ["asset", "srgb", "linear"], "colorSpace");
  validateChoice(normalized.mipmaps, ["generate", "preserve", "none"], "mipmaps");
  validateChoice(normalized.compression, ["auto", "prefer-source", "none"], "compression");
  validateChoice(normalized.normals, ["preserve", "generate-if-missing", "require"], "normals");
  validateChoice(normalized.tangents, ["preserve", "generate-if-missing", "require"], "tangents");
  validateChoice(normalized.animationImport, ["all", "first-clip", "none"], "animationImport");
  validateChoice(normalized.materialVariants, ["import", "ignore"], "materialVariants");
  if (!Number.isFinite(normalized.scale) || normalized.scale <= 0) {
    throw new Error("Asset import setting scale must be a positive finite number");
  }

  return normalized;
}

export function validateGLTFCorpusManifest(input: unknown): GLTFCorpusValidationResult {
  const diagnostics: AssetDiagnostic[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      diagnostics: [diagnostic("ASSET_CORPUS_MANIFEST_TYPE", "error", "glTF corpus manifest must be an object.", "Load a JSON object with schemaVersion and assets.")]
    };
  }

  if (input.schemaVersion !== "gltf-corpus") {
    diagnostics.push(diagnostic("ASSET_CORPUS_SCHEMA_VERSION", "error", "glTF corpus manifest schemaVersion must be gltf-corpus.", "Regenerate the corpus manifest with the legacy schema."));
  }

  const generatedFrom = isRecord(input.generatedFrom) ? input.generatedFrom : undefined;
  if (!generatedFrom) {
    diagnostics.push(diagnostic("ASSET_CORPUS_SOURCE_MISSING", "error", "glTF corpus manifest must identify the upstream source.", "Add generatedFrom with name, repository, and pinned revision."));
  } else {
    validateText(generatedFrom.name, "ASSET_CORPUS_SOURCE_NAME", "generatedFrom.name", diagnostics);
    validateRepository(generatedFrom.repository, "ASSET_CORPUS_SOURCE_REPOSITORY", "generatedFrom.repository", diagnostics);
    validateRevision(generatedFrom.revision, "ASSET_CORPUS_SOURCE_REVISION", "generatedFrom.revision", diagnostics);
  }

  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    diagnostics.push(diagnostic("ASSET_CORPUS_EMPTY", "error", "glTF corpus manifest must contain at least one asset.", "Add pinned external glTF or GLB assets to assets."));
    return { ok: false, diagnostics };
  }

  const seen = new Set<string>();
  for (const [index, value] of input.assets.entries()) {
    validateAssetEntry(value, index, seen, diagnostics);
  }

  return {
    ok: diagnostics.every((entry) => entry.severity !== "error"),
    diagnostics,
    manifest: diagnostics.some((entry) => entry.severity === "error") ? undefined : input as unknown as GLTFCorpusManifest
  };
}

export function assertValidGLTFCorpusManifest(input: unknown): GLTFCorpusManifest {
  const result = validateGLTFCorpusManifest(input);
  if (!result.ok || !result.manifest) {
    const details = result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join("; ");
    throw new Error(`Invalid glTF corpus manifest: ${details}`);
  }
  return result.manifest;
}

export function createGLTFCorpusReport(manifest: GLTFCorpusManifest, generatedAt = new Date().toISOString()): GLTFCorpusReport {
  const validated = assertValidGLTFCorpusManifest(manifest);
  const assets = validated.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    format: asset.format,
    expectedStatus: asset.expectedStatus,
    sourceUri: asset.source.uri,
    sourceRevision: asset.source.revision,
    sourceSha256: asset.source.sha256,
    tags: [...asset.tags].sort(),
    importSettings: normalizeAssetImportSettings(asset.importSettings),
    diagnostics: diagnosticsForAsset(asset)
  }));

  return {
    schemaVersion: "gltf-corpus-report",
    generatedAt,
    sourceManifest: {
      schemaVersion: validated.schemaVersion,
      sourceName: validated.generatedFrom.name,
      sourceRepository: validated.generatedFrom.repository,
      sourceRevision: validated.generatedFrom.revision,
      assetCount: validated.assets.length
    },
    summary: {
      pass: assets.filter((asset) => asset.expectedStatus === "pass").length,
      warn: assets.filter((asset) => asset.expectedStatus === "warn").length,
      expectedFail: assets.filter((asset) => asset.expectedStatus === "expected-fail").length
    },
    assets
  };
}

function diagnosticsForAsset(asset: GLTFCorpusAsset): readonly AssetDiagnostic[] {
  return (asset.expectedDiagnostics ?? []).map((entry) => ({
    ...entry,
    assetId: entry.assetId ?? asset.id
  }));
}

function validateAssetEntry(value: unknown, index: number, seen: Set<string>, diagnostics: AssetDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_ASSET_TYPE", "error", `Asset entry ${index} must be an object.`, "Replace the entry with an asset object."));
    return;
  }

  const assetId = typeof value.id === "string" ? value.id : undefined;
  if (!assetId || !ID_PATTERN.test(assetId)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_ASSET_ID", "error", `Asset entry ${index} id must be kebab-case ASCII.`, "Use a stable lowercase id such as box-textured.", assetId));
  } else if (seen.has(assetId)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_DUPLICATE_ID", "error", `Asset id ${assetId} is duplicated.`, "Keep corpus asset ids unique.", assetId));
  } else {
    seen.add(assetId);
  }

  validateText(value.name, "ASSET_CORPUS_ASSET_NAME", `asset ${assetId ?? index} name`, diagnostics, assetId);
  validateChoice(value.format, ["gltf", "glb"], "format", diagnostics, assetId);
  validateChoice(value.expectedStatus, ["pass", "warn", "expected-fail"], "expectedStatus", diagnostics, assetId);
  validateText(value.license, "ASSET_CORPUS_ASSET_LICENSE", `asset ${assetId ?? index} license`, diagnostics, assetId);
  validateTags(value.tags, assetId, diagnostics);
  validateSource(value.source, assetId, diagnostics);

  if (value.expectedStatus === "expected-fail" && (!Array.isArray(value.expectedDiagnostics) || value.expectedDiagnostics.length === 0)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_EXPECTED_FAIL_DIAGNOSTIC", "error", `Asset ${assetId ?? index} is expected-fail but has no expected diagnostics.`, "Add a typed diagnostic with nextAction for the expected failure.", assetId));
  }
  if (value.expectedDiagnostics !== undefined) {
    validateExpectedDiagnostics(value.expectedDiagnostics, assetId, diagnostics);
  }
  if (value.importSettings !== undefined) {
    try {
      normalizeAssetImportSettings(value.importSettings as Partial<AssetImportSettings>);
    } catch (error) {
      diagnostics.push(diagnostic("ASSET_CORPUS_IMPORT_SETTINGS", "error", error instanceof Error ? error.message : String(error), "Fix the asset importSettings object.", assetId));
    }
  }
}

function validateSource(value: unknown, assetId: string | undefined, diagnostics: AssetDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_SOURCE_TYPE", "error", `Asset ${assetId ?? "unknown"} source must be an object.`, "Add source repository, revision, path, uri, and sha256.", assetId));
    return;
  }

  validateRepository(value.repository, "ASSET_CORPUS_SOURCE_REPOSITORY", "source.repository", diagnostics, assetId);
  validateRevision(value.revision, "ASSET_CORPUS_SOURCE_REVISION", "source.revision", diagnostics, assetId);
  validateText(value.path, "ASSET_CORPUS_SOURCE_PATH", "source.path", diagnostics, assetId);
  validateText(value.uri, "ASSET_CORPUS_SOURCE_URI", "source.uri", diagnostics, assetId);
  if (typeof value.uri === "string" && /\/(?:main|master|latest)\//i.test(value.uri)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_SOURCE_UNPINNED_URI", "error", `Asset ${assetId ?? "unknown"} source URI is not pinned to a revision.`, "Use a URI that contains the exact repository commit hash.", assetId));
  }
  if (typeof value.sha256 !== "string" || !HASH_PATTERN.test(value.sha256)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_SOURCE_HASH", "error", `Asset ${assetId ?? "unknown"} source sha256 must be a lowercase 64-character hex digest.`, "Record the SHA-256 of the root glTF/GLB file.", assetId));
  }
}

function validateExpectedDiagnostics(value: unknown, assetId: string | undefined, diagnostics: AssetDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_DIAGNOSTICS_TYPE", "error", `Asset ${assetId ?? "unknown"} expectedDiagnostics must be an array.`, "Use an array of diagnostic objects.", assetId));
    return;
  }
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      diagnostics.push(diagnostic("ASSET_CORPUS_DIAGNOSTIC_TYPE", "error", `Diagnostic ${index} for asset ${assetId ?? "unknown"} must be an object.`, "Use diagnostic objects with code, severity, message, and nextAction.", assetId));
      continue;
    }
    validateText(entry.code, "ASSET_CORPUS_DIAGNOSTIC_CODE", "diagnostic.code", diagnostics, assetId);
    validateChoice(entry.severity, ["info", "warning", "error"], "diagnostic.severity", diagnostics, assetId);
    validateText(entry.message, "ASSET_CORPUS_DIAGNOSTIC_MESSAGE", "diagnostic.message", diagnostics, assetId);
    validateText(entry.nextAction, "ASSET_CORPUS_DIAGNOSTIC_NEXT_ACTION", "diagnostic.nextAction", diagnostics, assetId);
  }
}

function validateTags(value: unknown, assetId: string | undefined, diagnostics: AssetDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((tag) => typeof tag !== "string" || tag.trim().length === 0)) {
    diagnostics.push(diagnostic("ASSET_CORPUS_TAGS", "error", `Asset ${assetId ?? "unknown"} must have at least one non-empty tag.`, "Add tags describing coverage such as core, texture, animation, or extension.", assetId));
  }
}

function validateRepository(value: unknown, code: string, label: string, diagnostics: AssetDiagnostic[], assetId?: string): void {
  if (typeof value !== "string" || !/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(value)) {
    diagnostics.push(diagnostic(code, "error", `${label} must be a GitHub repository URL.`, "Use an https://github.com/owner/repo URL.", assetId));
  }
}

function validateRevision(value: unknown, code: string, label: string, diagnostics: AssetDiagnostic[], assetId?: string): void {
  if (typeof value !== "string" || !REVISION_PATTERN.test(value)) {
    diagnostics.push(diagnostic(code, "error", `${label} must be a 40-character commit SHA.`, "Pin the corpus source to an exact commit.", assetId));
  }
}

function validateText(value: unknown, code: string, label: string, diagnostics: AssetDiagnostic[], assetId?: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push(diagnostic(code, "error", `${label} must be a non-empty string.`, `Provide ${label}.`, assetId));
  }
}

function validateChoice(value: unknown, choices: readonly string[], label: string, diagnostics?: AssetDiagnostic[], assetId?: string): void {
  if (typeof value === "string" && choices.includes(value)) return;
  const message = `${label} must be one of: ${choices.join(", ")}`;
  if (diagnostics) {
    diagnostics.push(diagnostic("ASSET_CORPUS_ENUM", "error", message, `Use a supported ${label} value.`, assetId));
    return;
  }
  throw new Error(message);
}

function diagnostic(code: string, severity: AssetDiagnosticSeverity, message: string, nextAction: string, assetId?: string): AssetDiagnostic {
  return { code, severity, message, nextAction, ...(assetId ? { assetId } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
