import {
  assertValidGLTFCorpusManifest,
  createGLTFCorpusReport,
  type AssetDiagnostic,
  type AssetImportSettings,
  type GLTFCorpusAssetReport,
  type GLTFCorpusManifest,
  type GLTFCorpusReport
} from "./AssetCorpus";
import type { BlenderExportValidationReport } from "./BlenderExportValidation";

export type AssetCompatibilityLoaderName = "galileo3d" | "threejs" | "babylonjs" | "blender-export";
export type AssetCompatibilityStatus = "pass" | "warn" | "expected-fail" | "not-run";

export interface AssetLoaderCompatibilityResult {
  readonly loader: AssetCompatibilityLoaderName;
  readonly status: AssetCompatibilityStatus;
  readonly diagnostics: readonly AssetDiagnostic[];
}

export interface AssetCompatibilityReportAsset {
  readonly id: string;
  readonly name: string;
  readonly format: string;
  readonly tags: readonly string[];
  readonly sourceUri: string;
  readonly sourceRevision: string;
  readonly sourceSha256: string;
  readonly importSettings: AssetImportSettings;
  readonly loaders: readonly AssetLoaderCompatibilityResult[];
}

export interface AssetCompatibilityReport {
  readonly schemaVersion: "asset-compatibility-report-v1";
  readonly generatedAt: string;
  readonly sourceManifest: GLTFCorpusReport["sourceManifest"];
  readonly fixtureStatus: {
    readonly blenderExportFixtures: "present" | "missing";
  };
  readonly blenderExportValidation?: BlenderExportValidationReport;
  readonly summary: {
    readonly assetCount: number;
    readonly galileo3d: Record<AssetCompatibilityStatus, number>;
    readonly threejs: Record<AssetCompatibilityStatus, number>;
    readonly babylonjs: Record<AssetCompatibilityStatus, number>;
    readonly blenderExport: Record<AssetCompatibilityStatus, number>;
  };
  readonly assets: readonly AssetCompatibilityReportAsset[];
}

export interface AssetCompatibilityReportOptions {
  readonly generatedAt?: string;
  readonly blenderExportFixturesPresent?: boolean;
  readonly blenderExportValidation?: BlenderExportValidationReport;
  readonly externalLoaderResults?: readonly ExternalAssetLoaderCompatibilityResult[];
  readonly blenderExportResults?: readonly BlenderExportCompatibilityResult[];
}

export interface ExternalAssetLoaderCompatibilityResult extends AssetLoaderCompatibilityResult {
  readonly assetId: string;
  readonly loader: "threejs" | "babylonjs";
}

export interface BlenderExportCompatibilityResult extends AssetLoaderCompatibilityResult {
  readonly assetId: string;
  readonly loader: "blender-export";
}

export function createAssetCompatibilityReport(
  manifest: GLTFCorpusManifest,
  options: AssetCompatibilityReportOptions = {}
): AssetCompatibilityReport {
  const validated = assertValidGLTFCorpusManifest(manifest);
  const corpusReport = createGLTFCorpusReport(validated, options.generatedAt ?? new Date().toISOString());
  const blenderExportFixturesPresent = options.blenderExportFixturesPresent ?? options.blenderExportValidation !== undefined;
  const externalResults = indexExternalLoaderResults(options.externalLoaderResults ?? []);
  const blenderExportResults = indexBlenderExportResults(options.blenderExportResults ?? []);
  const assets = corpusReport.assets.map((asset) => createCompatibilityAsset(asset, blenderExportFixturesPresent, externalResults, blenderExportResults));

  return {
    schemaVersion: "asset-compatibility-report-v1",
    generatedAt: corpusReport.generatedAt,
    sourceManifest: corpusReport.sourceManifest,
    fixtureStatus: {
      blenderExportFixtures: blenderExportFixturesPresent ? "present" : "missing"
    },
    ...(options.blenderExportValidation ? { blenderExportValidation: options.blenderExportValidation } : {}),
    summary: {
      assetCount: assets.length,
      galileo3d: summarize(assets, "galileo3d"),
      threejs: summarize(assets, "threejs"),
      babylonjs: summarize(assets, "babylonjs"),
      blenderExport: summarize(assets, "blender-export")
    },
    assets
  };
}

function createCompatibilityAsset(
  asset: GLTFCorpusAssetReport,
  blenderExportFixturesPresent: boolean,
  externalResults: ReadonlyMap<string, AssetLoaderCompatibilityResult>,
  blenderExportResults: ReadonlyMap<string, AssetLoaderCompatibilityResult>
): AssetCompatibilityReportAsset {
  return {
    id: asset.id,
    name: asset.name,
    format: asset.format,
    tags: asset.tags,
    sourceUri: asset.sourceUri,
    sourceRevision: asset.sourceRevision,
    sourceSha256: asset.sourceSha256,
    importSettings: asset.importSettings,
    loaders: [
      {
        loader: "galileo3d",
        status: asset.expectedStatus === "expected-fail" ? "expected-fail" : asset.expectedStatus,
        diagnostics: asset.diagnostics
      },
      externalResults.get(externalResultKey(asset.id, "threejs")) ?? externalLoaderScaffold("threejs", asset),
      externalResults.get(externalResultKey(asset.id, "babylonjs")) ?? externalLoaderScaffold("babylonjs", asset),
      blenderExportResults.get(asset.id) ?? blenderExportScaffold(asset, blenderExportFixturesPresent)
    ]
  };
}

function indexExternalLoaderResults(
  results: readonly ExternalAssetLoaderCompatibilityResult[]
): ReadonlyMap<string, AssetLoaderCompatibilityResult> {
  const indexed = new Map<string, AssetLoaderCompatibilityResult>();
  for (const result of results) {
    indexed.set(externalResultKey(result.assetId, result.loader), {
      loader: result.loader,
      status: result.status,
      diagnostics: result.diagnostics
    });
  }
  return indexed;
}

function indexBlenderExportResults(
  results: readonly BlenderExportCompatibilityResult[]
): ReadonlyMap<string, AssetLoaderCompatibilityResult> {
  const indexed = new Map<string, AssetLoaderCompatibilityResult>();
  for (const result of results) {
    indexed.set(result.assetId, {
      loader: result.loader,
      status: result.status,
      diagnostics: result.diagnostics
    });
  }
  return indexed;
}

function externalResultKey(assetId: string, loader: "threejs" | "babylonjs"): string {
  return `${assetId}:${loader}`;
}

function externalLoaderScaffold(loader: "threejs" | "babylonjs", asset: GLTFCorpusAssetReport): AssetLoaderCompatibilityResult {
  return {
    loader,
    status: "not-run",
    diagnostics: [
      diagnostic(
        `ASSET_${loader.toUpperCase()}_LOADER_NOT_RUN`,
        "External loader compatibility has not been executed in this bounded slice.",
        `Run ${asset.id} through a pinned ${loader} GLTFLoader version and record pass, warn, or expected-fail evidence before claiming ${loader} parity.`
      )
    ]
  };
}

function blenderExportScaffold(asset: GLTFCorpusAssetReport, fixturesPresent: boolean): AssetLoaderCompatibilityResult {
  if (fixturesPresent) {
    return {
      loader: "blender-export",
      status: "not-run",
      diagnostics: [
        diagnostic(
          "ASSET_BLENDER_EXPORT_VALIDATION_PENDING",
          "Blender export fixtures were detected, but no export validation runner is wired in this slice.",
          `Run ${asset.id} or the matching fixture through the Blender exporter validation command and record the exported glTF diagnostics.`
        )
      ]
    };
  }
  return {
    loader: "blender-export",
    status: "not-run",
    diagnostics: [
      diagnostic(
        "ASSET_BLENDER_EXPORT_FIXTURES_MISSING",
        "No Blender-export fixtures are present in the asset test corpus.",
        "Add checked-in exported glTF/GLB fixtures before marking Blender-export validation complete."
      )
    ]
  };
}

function summarize(
  assets: readonly AssetCompatibilityReportAsset[],
  loader: AssetCompatibilityLoaderName
): Record<AssetCompatibilityStatus, number> {
  const counts: Record<AssetCompatibilityStatus, number> = {
    pass: 0,
    warn: 0,
    "expected-fail": 0,
    "not-run": 0
  };
  for (const asset of assets) {
    const result = asset.loaders.find((entry) => entry.loader === loader);
    counts[result?.status ?? "not-run"] += 1;
  }
  return counts;
}

function diagnostic(code: string, message: string, nextAction: string): AssetDiagnostic {
  return {
    code,
    severity: "info",
    message,
    nextAction
  };
}
