import type { AuraAssetRef } from "./index.js";
import {
  createGameAssetReadinessManifest,
  createGameAssetValidationIssue,
  gameAssetValidationContractVersion,
  validateGameAssetReadiness,
  type GameAssetReadinessManifest,
  type GameAssetValidationIssue,
  type GameAssetValidationPolicy,
  type GameAssetValidationReport,
  type GameAssetValidationStatus
} from "./GameAssetValidation.js";
import {
  collectCharacterAssemblyAssets,
  validateCharacterAssemblyPlan,
  type CharacterAssemblyPlan,
  type CharacterAssemblyValidationPolicy,
  type CharacterAssemblyValidationReport
} from "./CharacterAssembly.js";

export interface AssetEvidenceRouteUsage {
  readonly route: string;
  readonly assets: readonly AuraAssetRef<"model">[];
  readonly purpose?: string | undefined;
}

export interface AssetEvidenceScreenshot {
  readonly id: string;
  readonly route?: string | undefined;
  readonly path?: string | undefined;
  readonly hash?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly nonBlank?: boolean | undefined;
  readonly reviewed?: boolean | undefined;
}

export interface AssetEvidenceAssetSummary<TAsset extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly asset: TAsset;
  readonly assetId: TAsset["id"];
  readonly status: GameAssetValidationStatus;
  readonly manifest?: GameAssetReadinessManifest<TAsset> | undefined;
  readonly validation?: GameAssetValidationReport<TAsset> | undefined;
  readonly routes: readonly string[];
  readonly hasProvenance: boolean;
  readonly hasThumbnail: boolean;
  readonly hasBounds: boolean;
  readonly animationClips: number;
  readonly issues: readonly GameAssetValidationIssue[];
}

export interface AssetEvidenceReport {
  readonly kind: "aura-asset-evidence-report";
  readonly contractId: string;
  readonly generatedAt?: string | undefined;
  readonly assets: readonly AssetEvidenceAssetSummary[];
  readonly validations: readonly GameAssetValidationReport[];
  readonly assemblies: readonly CharacterAssemblyValidationReport[];
  readonly routeUsage: readonly AssetEvidenceRouteUsage[];
  readonly screenshots: readonly AssetEvidenceScreenshot[];
  readonly summary: {
    readonly status: GameAssetValidationStatus;
    readonly typedAssets: number;
    readonly readyAssets: number;
    readonly failingAssets: number;
    readonly missingManifests: number;
    readonly approvedProvenance: number;
    readonly thumbnails: number;
    readonly boundedAssets: number;
    readonly characterAssemblies: number;
    readonly readyAssemblies: number;
    readonly screenshotEvidence: number;
    readonly reviewedScreenshots: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly issues: readonly GameAssetValidationIssue[];
  readonly publishReady: boolean;
}

export interface CollectAssetEvidenceInput {
  readonly assets?: readonly AuraAssetRef<"model">[] | undefined;
  readonly manifests?: readonly GameAssetReadinessManifest[] | undefined;
  readonly validations?: readonly GameAssetValidationReport[] | undefined;
  readonly validationPolicy?: GameAssetValidationPolicy | undefined;
  readonly assemblies?: readonly CharacterAssemblyPlan[] | undefined;
  readonly assemblyReports?: readonly CharacterAssemblyValidationReport[] | undefined;
  readonly assemblyPolicy?: CharacterAssemblyValidationPolicy | undefined;
  readonly routeUsage?: readonly AssetEvidenceRouteUsage[] | undefined;
  readonly screenshots?: readonly AssetEvidenceScreenshot[] | undefined;
  readonly requireReviewedScreenshot?: boolean | undefined;
  readonly generatedAt?: string | undefined;
}

export function defineAssetEvidenceReport<const TReport extends AssetEvidenceReport>(report: TReport): TReport {
  return report;
}

export function collectAssetEvidence(input: CollectAssetEvidenceInput): AssetEvidenceReport {
  const manifests = [...(input.manifests ?? [])];
  const validations = [
    ...(input.validations ?? []),
    ...manifests
      .filter((manifest) => !(input.validations ?? []).some((report) => report.asset.id === manifest.asset.id))
      .map((manifest) => validateGameAssetReadiness(manifest, input.validationPolicy))
  ];
  const assemblyReports = [
    ...(input.assemblyReports ?? []),
    ...(input.assemblies ?? []).map((plan) => validateCharacterAssemblyPlan(plan, input.assemblyPolicy))
  ];
  const assets = uniqueAssets([
    ...(input.assets ?? []),
    ...manifests.map((manifest) => manifest.asset),
    ...validations.map((validation) => validation.asset),
    ...assemblyReports.flatMap((report) => collectCharacterAssemblyAssets(report.plan)),
    ...(input.routeUsage ?? []).flatMap((usage) => usage.assets)
  ]);

  for (const asset of assets) {
    if (!manifests.some((manifest) => manifest.asset.id === asset.id)) {
      manifests.push(createGameAssetReadinessManifest(asset));
    }
  }

  const completedValidations = [
    ...validations,
    ...manifests
      .filter((manifest) => !validations.some((validation) => validation.asset.id === manifest.asset.id))
      .map((manifest) => validateGameAssetReadiness(manifest, input.validationPolicy))
  ];
  const issues: GameAssetValidationIssue[] = [
    ...completedValidations.flatMap((validation) => validation.issues),
    ...assemblyReports.flatMap((report) => report.issues)
  ];

  const routeUsage = input.routeUsage ?? [];
  const screenshots = input.screenshots ?? [];
  if (input.requireReviewedScreenshot && !screenshots.some((screenshot) => screenshot.reviewed && screenshot.hash)) {
    issues.push(
      createGameAssetValidationIssue(
        "error",
        "screenshot.reviewed-missing",
        "At least one reviewed screenshot with a hash is required for asset publish evidence."
      )
    );
  }

  const assetSummaries = assets.map((asset): AssetEvidenceAssetSummary => {
    const manifest = manifests.find((candidate) => candidate.asset.id === asset.id);
    const validation = completedValidations.find((candidate) => candidate.asset.id === asset.id);
    const assetIssues = validation?.issues ?? [
      createGameAssetValidationIssue("warning", "asset.validation-missing", `No validation report exists for asset "${asset.id}".`, {
        assetId: asset.id
      })
    ];
    const routes = routeUsage.filter((usage) => usage.assets.some((routeAsset) => routeAsset.id === asset.id)).map((usage) => usage.route);
    return {
      asset,
      assetId: asset.id,
      status: validation?.summary.status ?? "missing",
      manifest,
      validation,
      routes,
      hasProvenance: Boolean(manifest?.provenance),
      hasThumbnail: Boolean(manifest?.thumbnail?.url || manifest?.thumbnail?.path),
      hasBounds: Boolean(manifest?.bounds),
      animationClips: manifest?.animations?.length ?? 0,
      issues: assetIssues
    };
  });

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const readyAssets = assetSummaries.filter((asset) => asset.status === "pass" || asset.status === "warn").length;
  const readyAssemblies = assemblyReports.filter((report) => report.ready).length;
  const report: AssetEvidenceReport = {
    kind: "aura-asset-evidence-report",
    contractId: gameAssetValidationContractVersion,
    generatedAt: input.generatedAt,
    assets: assetSummaries,
    validations: completedValidations,
    assemblies: assemblyReports,
    routeUsage,
    screenshots,
    summary: {
      status: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
      typedAssets: assets.length,
      readyAssets,
      failingAssets: assetSummaries.filter((asset) => asset.status === "fail").length,
      missingManifests: assetSummaries.filter((asset) => !asset.manifest).length,
      approvedProvenance: manifests.filter((manifest) => manifest.provenance?.approvalStatus === "approved").length,
      thumbnails: manifests.filter((manifest) => manifest.thumbnail?.url || manifest.thumbnail?.path).length,
      boundedAssets: manifests.filter((manifest) => Boolean(manifest.bounds)).length,
      characterAssemblies: assemblyReports.length,
      readyAssemblies,
      screenshotEvidence: screenshots.filter((screenshot) => Boolean(screenshot.hash || screenshot.path)).length,
      reviewedScreenshots: screenshots.filter((screenshot) => screenshot.reviewed).length,
      errors,
      warnings
    },
    issues,
    publishReady: false
  };
  return {
    ...report,
    publishReady: evaluateAssetEvidencePublishReadiness(report).ready
  };
}

export function evaluateAssetEvidencePublishReadiness(report: AssetEvidenceReport): {
  readonly ready: boolean;
  readonly issues: readonly GameAssetValidationIssue[];
} {
  const issues: GameAssetValidationIssue[] = [...report.issues];
  if (report.assets.length === 0) {
    issues.push(createGameAssetValidationIssue("error", "assets.empty", "No typed model assets were included in evidence."));
  }
  for (const asset of report.assets) {
    if (asset.status === "fail" || asset.status === "missing") {
      issues.push(
        createGameAssetValidationIssue(
          "error",
          "asset.not-ready",
          `Asset "${asset.assetId}" is not ready; status is "${asset.status}".`,
          { assetId: asset.assetId }
        )
      );
    }
    if (!asset.hasProvenance) {
      issues.push(
        createGameAssetValidationIssue("error", "asset.provenance-missing", `Asset "${asset.assetId}" has no provenance.`, {
          assetId: asset.assetId
        })
      );
    }
    if (!asset.hasThumbnail) {
      issues.push(
        createGameAssetValidationIssue("warning", "asset.thumbnail-missing", `Asset "${asset.assetId}" has no thumbnail.`, {
          assetId: asset.assetId
        })
      );
    }
    if (!asset.hasBounds) {
      issues.push(
        createGameAssetValidationIssue("error", "asset.bounds-missing", `Asset "${asset.assetId}" has no bounds.`, {
          assetId: asset.assetId
        })
      );
    }
  }
  for (const assembly of report.assemblies) {
    if (!assembly.ready) {
      issues.push(
        createGameAssetValidationIssue(
          "error",
          "assembly.not-ready",
          `Character assembly "${assembly.summary.exportName}" is not ready.`
        )
      );
    }
  }
  return {
    ready: !issues.some((issue) => issue.severity === "error"),
    issues
  };
}

export const createAssetEvidenceReport = collectAssetEvidence;
export const collectGameAssetEvidence = collectAssetEvidence;

function uniqueAssets(assets: readonly AuraAssetRef<"model">[]): readonly AuraAssetRef<"model">[] {
  const byId = new Map<string, AuraAssetRef<"model">>();
  for (const asset of assets) {
    if (!byId.has(asset.id)) byId.set(asset.id, asset);
  }
  return [...byId.values()];
}

export const assetEvidence = {
  defineReport: defineAssetEvidenceReport,
  collect: collectAssetEvidence,
  collectGame: collectGameAssetEvidence,
  createReport: createAssetEvidenceReport,
  evaluatePublishReadiness: evaluateAssetEvidencePublishReadiness
} as const;
