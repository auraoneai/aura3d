import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { admitAssetForRole } from "./asset-role-admission.js";
import {
  DEFAULT_AURA_ASSET_MANIFEST,
  DEFAULT_AURA_ASSET_OUTPUT_DIR,
  DEFAULT_AURA_ASSET_PUBLIC_PATH,
  DEFAULT_AURA_ASSET_TYPEGEN
} from "./asset-constants.js";
import {
  shouldScanSource,
  validateAssetSource
} from "./asset-source-validation.js";
import {
  listAssets,
  readAssetManifest,
  writeAssetManifest,
  writeTypedAssets
} from "./asset-manifest.js";
import type {
  AddAssetOptions,
  AssetCliResult,
  AssetSourceTypedAssetUsage,
  AssetSourceValidationReport,
  AssetValidationOptions,
  AssetValidationResult,
  AuraAssetQuality,
  AuraCliAssetEntry,
  AuraCliAssetManifest,
  AuraCliAssetProvenance,
  AuraCliAssetRole,
  AuraCliAssetType,
  AuraCliRenderedProbe,
  AuraCliRenderedProbeForegroundBounds,
  AuraCliRenderedProbeKind,
  AuraCliResolveCandidateProvenance,
  BindGameRouteEvidenceOptions,
  BindGameRouteEvidenceResult,
  CertifyGameGeometryOptions,
  CheckDeployOptions,
  GameGeometryCertificationResult,
  ReadRenderedProbeMetadataOptions
} from "./asset-core-types.js";
import type {
  AssetInspectionReport,
  AuraCliAnimationClipInspection,
  AuraCliAnimationInspection,
  AuraCliAssetBoundsInspection,
  AuraCliHumanoidConfidence,
  AuraCliHumanoidInspection,
  AuraCliHumanoidStatus,
  AuraCliMaterialInspection,
  AuraCliMorphTargetInspection,
  AuraCliMorphTargetMeshInspection,
  AuraCliOrientationInspection,
  AuraCliSceneHierarchyInspection,
  AuraCliSkeletonInspection,
  AuraCliSkeletonSkinInspection,
  InspectAssetOptions
} from "./asset-inspection-types.js";
import type {
  AnimationEpisodeAssetReadiness,
  AnimationEpisodeAssetRole,
  AnimationEpisodeMouthReadinessMode,
  AnimationEpisodeReadinessReport,
  AssetReadinessAnimationMetadata,
  AssetReadinessAssetArtifacts,
  AssetReadinessAssetReport,
  AssetReadinessArtifacts,
  AssetReadinessOptions,
  AssetReadinessReport,
  AssetReadinessValidationContract,
  AssetReadinessValidatorEvidence,
  AuraAssetReadinessProfile,
  AuraAssetReadinessStatus,
  AuraGameAssetReadinessProfile
} from "./asset-readiness-types.js";
import type {
  CharacterAssemblyPartInput,
  CharacterAssemblyPlanOptions,
  CharacterAssemblyPlanResult,
  CharacterAssemblyResolvedPart
} from "./character-assembly-types.js";

export {
  animationCliAssetProfiles,
  getAnimationAssetProfileDefinition
} from "./animation-asset-profiles.js";
export { validateAnimationAssets, parseAnimationClipMap, DEFAULT_ANIMATION_ACTIONS } from "./animation-asset-validator.js";
export type { AnimationAssetValidationOptions, AnimationAssetValidationReport } from "./animation-asset-validator.js";
export type {
  AuraCliAnimationAssetProfile,
  AuraCliAnimationAssetProfileDefinition
} from "./animation-asset-profiles.js";
export { formatScreeningReport, screenAssetCandidates } from "./asset-screening-pipeline.js";
export { createRetainedRenderProbe, createScreeningEffects, hashStagedFile, inspectGlbGeometry } from "./asset-screening-effects.js";
export type { ScreeningEffectsOptions } from "./asset-screening-effects.js";
export type {
  ScreeningCandidate,
  ScreeningCandidateOutcome,
  ScreeningEffects,
  ScreeningOptions,
  ScreeningPullResult,
  ScreeningRenderCost,
  ScreeningReport,
  ScreeningStage
} from "./asset-screening-pipeline.js";
export {
  admissionRequirementForIntent,
  licensesForPolicy,
  licenseSatisfiesPolicy,
  searchQueriesForIntent,
  validateAssetIntent,
  MIN_INTENT_HERO_AZIMUTHS
} from "./asset-intent.js";
export type {
  AssetCameraExpectation,
  AssetGeometryBudget,
  AssetIntent,
  FallbackPolicy,
  LicensePolicy,
  NormalizationPolicy,
  OrientationRequirement,
  RequiredVisibleFeature
} from "./asset-intent.js";
export {
  admitAssetForRole,
  rankAssetCandidatesForRole,
  HERO_MIN_RENDERED_AZIMUTHS,
  HERO_MIN_TRIANGLES,
  MIN_VEHICLE_WHEEL_CORNERS
} from "./asset-role-admission.js";
export type {
  AssetAdmissionCheck,
  AssetAdmissionInput,
  AssetAdmissionReport,
  AssetAdmissionRole,
  AssetAdmissionVerdict,
  AssetGeometryFacts,
  AssetProvenanceFacts,
  AssetRenderedFacts,
  AssetRoleRequirement
} from "./asset-role-admission.js";
export {
  DEFAULT_AURA_ASSET_MANIFEST,
  DEFAULT_AURA_ASSET_OUTPUT_DIR,
  DEFAULT_AURA_ASSET_PUBLIC_PATH,
  DEFAULT_AURA_ASSET_TYPEGEN
} from "./asset-constants.js";
export {
  listAssets,
  readAssetManifest,
  writeAssetManifest,
  writeTypedAssets
} from "./asset-manifest.js";
export type {
  AddAssetOptions,
  AssetCliResult,
  AssetSourceTypedAssetUsage,
  AssetSourceValidationReport,
  AssetValidationOptions,
  AssetValidationResult,
  AuraAssetQuality,
  AuraCliAssetEntry,
  AuraCliAssetManifest,
  AuraCliAssetProvenance,
  AuraCliAssetRole,
  AuraCliAssetType,
  AuraCliRenderedProbe,
  AuraCliRenderedProbeForegroundBounds,
  AuraCliRenderedProbeKind,
  AuraCliResolveCandidateProvenance,
  BindGameRouteEvidenceOptions,
  BindGameRouteEvidenceResult,
  CertifyGameGeometryOptions,
  CheckDeployOptions,
  GameGeometryCertificationResult,
  ReadRenderedProbeMetadataOptions
} from "./asset-core-types.js";
export type {
  AssetInspectionReport,
  AuraCliAnimationClipInspection,
  AuraCliAnimationInspection,
  AuraCliAssetBoundsInspection,
  AuraCliHumanoidConfidence,
  AuraCliHumanoidInspection,
  AuraCliHumanoidStatus,
  AuraCliMaterialInspection,
  AuraCliMorphTargetInspection,
  AuraCliMorphTargetMeshInspection,
  AuraCliOrientationInspection,
  AuraCliSceneHierarchyInspection,
  AuraCliSkeletonInspection,
  AuraCliSkeletonSkinInspection,
  InspectAssetOptions
} from "./asset-inspection-types.js";
export type {
  AnimationEpisodeAssetReadiness,
  AnimationEpisodeAssetRole,
  AnimationEpisodeMouthReadinessMode,
  AnimationEpisodeReadinessReport,
  AssetReadinessAnimationClipMetadata,
  AssetReadinessAnimationMetadata,
  AssetReadinessAssetArtifacts,
  AssetReadinessAssetReport,
  AssetReadinessArtifacts,
  AssetReadinessOptions,
  AssetReadinessReport,
  AssetReadinessValidationContract,
  AssetReadinessValidatorEvidence,
  AuraAssetReadinessProfile,
  AuraAssetReadinessStatus,
  AuraGameAssetReadinessProfile
} from "./asset-readiness-types.js";
export type {
  CharacterAssemblyPartInput,
  CharacterAssemblyPlanOptions,
  CharacterAssemblyPlanResult,
  CharacterAssemblyResolvedPart
} from "./character-assembly-types.js";

export function readRenderedProbeMetadata(options: ReadRenderedProbeMetadataOptions): AuraCliRenderedProbe {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const metadataPath = resolve(projectDir, options.file);
  if (!existsSync(metadataPath)) {
    throw new Error(`Aura3D rendered probe metadata failed: "${options.file}" does not exist.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch (error) {
    throw new Error(`Aura3D rendered probe metadata failed: "${options.file}" is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }

  const root = objectValue(parsed);
  const record = objectValue(root?.renderedProbe) ?? root;
  const failures: string[] = [];
  if (!record) {
    failures.push("metadata must be an object or contain a renderedProbe object");
  }

  const url = stringValue(record?.url);
  const kind = stringValue(record?.kind);
  const renderer = stringValue(record?.renderer);
  const route = stringValue(record?.route);
  const sha = stringValue(record?.sha256);
  const assetHash = stringValue(record?.assetHash);
  const checkedAt = stringValue(record?.checkedAt);
  const width = readPositiveInteger(record, "width", failures);
  const height = readPositiveInteger(record, "height", failures);
  const nonBlankPixels = readPositiveInteger(record, "nonBlankPixels", failures);
  const colorBuckets = readPositiveInteger(record, "colorBuckets", failures);
  const foregroundBounds = readOptionalForegroundBounds(record, failures);

  if (!url) failures.push("missing url");
  if (!kind) {
    failures.push("missing kind");
  } else if (kind !== "browser-screenshot" && kind !== "aura-probe-render") {
    failures.push(`kind "${kind}" is not browser-screenshot or aura-probe-render`);
  }
  if (!renderer) {
    failures.push("missing renderer");
  } else if (!/createAuraApp|@aura3d\/engine/i.test(renderer)) {
    failures.push(`renderer "${renderer}" is not root @aura3d/engine/createAuraApp proof`);
  }
  if (!route) failures.push("missing route");
  if (!sha) {
    failures.push("missing image sha256");
  } else if (!/^sha256-[a-f0-9]{64}$/i.test(sha)) {
    failures.push("image sha256 must be sha256-<64 hex>");
  }
  if (!assetHash) {
    failures.push("missing assetHash");
  } else if (!/^sha256-[a-f0-9]{64}$/i.test(assetHash)) {
    failures.push("assetHash must be sha256-<64 hex>");
  }
  if (!checkedAt) {
    failures.push("missing checkedAt");
  } else if (Number.isNaN(Date.parse(checkedAt))) {
    failures.push("checkedAt must be a valid timestamp");
  }

  if (failures.length > 0) {
    throw new Error(`Aura3D rendered probe metadata failed: ${failures.join("; ")}.`);
  }

  return {
    url: url!,
    kind: kind as "browser-screenshot" | "aura-probe-render",
    renderer,
    route,
    sha256: sha,
    assetHash,
    width,
    height,
    nonBlankPixels,
    colorBuckets,
    checkedAt,
    ...(foregroundBounds ? { foregroundBounds } : {})
  };
}

export function addAsset(options: AddAssetOptions): AssetCliResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const sourcePath = resolve(projectDir, options.file);
  if (!existsSync(sourcePath)) {
    throw new Error(`Aura3D assets add failed: "${options.file}" does not exist. Suggested fix: pass a real local GLB/glTF/texture path.`);
  }
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const current = readAssetManifest(projectDir);
  // Re-adding (e.g. resolve overwriting) must not silently drop hand-authored
  // provenance the new add does not re-supply (license/attribution/author/etc.).
  const existing = current.assets.find((asset) => asset.id === options.name);
  const outputDir = normalizeRelativePath(options.outputDir ?? current.outputDir ?? DEFAULT_AURA_ASSET_OUTPUT_DIR);
  const publicPath = normalizePublicPath(options.publicPath ?? current.assetBasePath ?? DEFAULT_AURA_ASSET_PUBLIC_PATH);
  const typegen = normalizeRelativePath(options.typegen ?? current.typegen ?? DEFAULT_AURA_ASSET_TYPEGEN);
  const hash = hashFile(sourcePath);
  const format = extname(sourcePath).slice(1).toLowerCase();
  const type = options.type ?? inferAssetType(format);
  const inspection = inspectAssetFile(sourcePath, format);
  const outputFileName = `${options.name}.${hash.slice(0, 8)}.${format}`;
  const outputPath = join(outputDir, outputFileName);
  if (options.copy !== false) {
    mkdirSync(resolve(projectDir, outputDir), { recursive: true });
    copyFileSync(sourcePath, resolve(projectDir, outputPath));
    copyAssetDependencies(projectDir, sourcePath, outputDir, inspection.dependencies);
  }
  const thumbnailUrl = writeThumbnail(projectDir, outputDir, publicPath, options.name, inspection.bounds);
  const entry: AuraCliAssetEntry = {
    id: options.name,
    type,
    format,
    /*
     * Record a source path that still exists after the command finishes.
     *
     * `assets resolve` downloads into `mkdtempSync(...)` and hands that path to `addAsset`, so a naive
     * `relative(projectDir, sourcePath)` stored something like
     * `../aura3d-resolve-PAzWRU/carStaged.glb` -- a directory that is deleted moments later. That
     * makes the manifest reference unresolvable provenance, and because the temp segment is random it
     * also makes typegen output differ between two byte-identical resolves, which defeats content-hash
     * comparison of generated artifacts.
     *
     * When the source lives outside the project, the durable record is the staged output the pipeline
     * just wrote inside the project. In-project sources keep their real relative path.
     */
    source: normalizeRelativePath(
      relative(projectDir, sourcePath).startsWith("..") ? outputPath : relative(projectDir, sourcePath)
    ),
    outputPath: normalizeRelativePath(outputPath),
    url: `${publicPath}${outputFileName}`,
    hash: `sha256-${hash}`,
    sizeBytes: statSync(sourcePath).size,
    bounds: inspection.bounds,
    boundsMetadata: inspection.boundsMetadata,
    materials: inspection.materials,
    materialMetadata: inspection.materialMetadata,
    animations: inspection.animations,
    animationMetadata: inspection.animation,
    humanoid: inspection.humanoid,
    skeleton: inspection.skeleton,
    morphTargets: inspection.morphTargets,
    hierarchy: inspection.hierarchy,
    provenance: createAssetProvenance(projectDir, sourcePath, options, mergeDetectedProvenance(existing?.provenance, inspection.provenance), outputPath),
    textures: inspection.textures,
    dependencies: inspection.dependencies,
    orientation: options.orientation ?? (
      existing?.orientation?.source === "manifest-override" && existing.orientation.assetHash === `sha256-${hash}`
        ? existing.orientation
        : inspection.orientation
    ),
    nodeNames: inspection.nodeNames,
    thumbnailUrl,
    quality: options.quality ?? existing?.quality ?? "ungraded",
    role: options.role ?? existing?.role ?? "unknown",
    ...(options.suitabilityReason ?? existing?.suitabilityReason ? { suitabilityReason: options.suitabilityReason ?? existing?.suitabilityReason } : {}),
    ...(options.renderedProbe ?? existing?.renderedProbe ? { renderedProbe: options.renderedProbe ?? existing?.renderedProbe } : {}),
    ...(options.gameGeometry ?? existing?.gameGeometry ? { gameGeometry: options.gameGeometry ?? existing?.gameGeometry } : {}),
    warnings: createAssetWarnings(sourcePath, inspection)
  };
  if (options.orientation) {
    if (options.orientation.source !== "manifest-override") {
      throw new Error("Aura3D assets add failed: --orientation-json must contain a manifest-override orientation.");
    }
    const orientationFailures = createManifestOrientationOverrideWarnings(entry);
    if (orientationFailures.length > 0) {
      throw new Error(`Aura3D assets add failed: invalid orientation override: ${orientationFailures.join("; ")}`);
    }
  }
  const manifest = sortManifest({
    schema: "aura3d.assets/1.0",
    assetBasePath: publicPath,
    outputDir,
    typegen,
    assets: [
      ...current.assets.filter((asset) => asset.id !== entry.id),
      entry
    ]
  });
  writeAssetManifest(projectDir, manifest);
  writeTypedAssets(projectDir, manifest);
  return {
    ok: true,
    manifestPath,
    manifest,
    messages: [
      `Added ${entry.id} -> ${entry.url}`,
      `Wrote ${DEFAULT_AURA_ASSET_MANIFEST}`,
      `Wrote ${manifest.typegen}`
    ]
  };
}

export function bindGameRouteEvidence(options: BindGameRouteEvidenceOptions): BindGameRouteEvidenceResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const assetIds = [...new Set(options.assetIds.map((id) => id.trim()).filter(Boolean))];
  const blockers: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.routeId)) blockers.push(`game-route-evidence:unsafe-route-id:${options.routeId}`);
  if (assetIds.length !== 2) blockers.push(`game-route-evidence:asset-pair-required:${assetIds.length}`);

  const assets = assetIds.map((id) => manifest.assets.find((asset) => asset.id === id));
  for (let index = 0; index < assetIds.length; index += 1) {
    if (!assets[index]) blockers.push(`game-route-evidence:asset-missing:${assetIds[index]}`);
  }

  const screenshotBytes = readProjectEvidenceBytes(projectDir, options.routePrimaryScreenshot, "screenshot", blockers);
  const screenshotSha256 = screenshotBytes
    ? `sha256-${createHash("sha256").update(screenshotBytes).digest("hex")}`
    : undefined;
  const geometry = readProjectEvidenceJson(projectDir, options.geometryReport, "geometry-report", blockers);
  const composition = readProjectEvidenceJson(projectDir, options.compositionReport, "composition-report", blockers);
  const reviewFile = readProjectEvidenceJson(projectDir, options.visualReview, "visual-review", blockers);
  const geometryRecord = asRecord(geometry);
  const compositionRecord = asRecord(composition);
  const reviewRecord = asRecord(reviewFile);

  if (geometryRecord) {
    if (geometryRecord.routeId !== options.routeId) blockers.push(`game-route-evidence:geometry-route:${String(geometryRecord.routeId)}`);
    if (geometryRecord.pass !== true) blockers.push(`game-route-evidence:geometry-not-passing:${String(geometryRecord.pass)}`);
  }
  const geometryValue = asRecord(options.category === "racing" ? geometryRecord?.topology : geometryRecord?.surfaceMap);
  const expectedGeometrySchema = options.category === "racing"
    ? "aura3d-racing-track-topology/1.0"
    : "aura3d-platformer-playable-surfaces/1.0";
  if (geometryRecord && geometryRecord.schema !== expectedGeometrySchema) blockers.push(`game-route-evidence:geometry-schema:${String(geometryRecord.schema)}`);
  const primaryGeometryAssetId = typeof geometryValue?.assetId === "string" ? geometryValue.assetId : undefined;
  if (!primaryGeometryAssetId || !assetIds.includes(primaryGeometryAssetId)) {
    blockers.push(`game-route-evidence:geometry-primary-asset:${String(primaryGeometryAssetId)}`);
  }
  if (geometryValue) {
    const overlay = asRecord(geometryValue.evidence)?.routeOverlay;
    if (overlay !== options.routePrimaryScreenshot) blockers.push(`game-route-evidence:geometry-screenshot:${String(overlay)}`);
  }

  if (compositionRecord) {
    if (compositionRecord.schema !== "aura3d-showcase-asset-pair-composition/1.0") blockers.push(`game-route-evidence:composition-schema:${String(compositionRecord.schema)}`);
    if (compositionRecord.routeId !== options.routeId) blockers.push(`game-route-evidence:composition-route:${String(compositionRecord.routeId)}`);
    if (compositionRecord.category !== options.category) blockers.push(`game-route-evidence:composition-category:${String(compositionRecord.category)}`);
    if (compositionRecord.pass !== true || compositionRecord.verdict !== "pass") blockers.push(`game-route-evidence:composition-not-passing:${String(compositionRecord.verdict)}`);
    const screenshot = asRecord(compositionRecord.screenshot);
    if (screenshot?.path !== options.routePrimaryScreenshot) blockers.push(`game-route-evidence:composition-screenshot:${String(screenshot?.path)}`);
    if (screenshotSha256 && screenshot?.sha256 !== screenshotSha256) blockers.push("game-route-evidence:composition-screenshot-hash-stale");
    const reportGeometry = asRecord(compositionRecord.geometry);
    if (reportGeometry?.report !== options.geometryReport) blockers.push(`game-route-evidence:composition-geometry-report:${String(reportGeometry?.report)}`);
    const compositionAssets = Array.isArray(compositionRecord.assets) ? compositionRecord.assets.map(asRecord).filter(Boolean) : [];
    for (const asset of assets) {
      if (!asset) continue;
      const evidenceAsset = compositionAssets.find((candidate) => candidate?.id === asset.id);
      if (!evidenceAsset) blockers.push(`game-route-evidence:composition-asset-missing:${asset.id}`);
      else if (evidenceAsset.manifestHash !== asset.hash || evidenceAsset.evidenceHash !== asset.hash) blockers.push(`game-route-evidence:composition-asset-hash-stale:${asset.id}`);
    }
    const requiredChecks = ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"];
    const checks = Array.isArray(compositionRecord.checks) ? compositionRecord.checks.map(asRecord).filter(Boolean) : [];
    for (const id of requiredChecks) {
      if (checks.find((check) => check?.id === id)?.verdict !== "pass") blockers.push(`game-route-evidence:composition-check:${id}`);
    }
  }

  const routes = Array.isArray(reviewRecord?.routes) ? reviewRecord.routes.map(asRecord).filter(Boolean) : [];
  const review = routes.find((candidate) => candidate?.id === options.routeId);
  if (!review) blockers.push(`game-route-evidence:visual-review-route-missing:${options.routeId}`);
  else {
    if (review.verdict !== "pass") blockers.push(`game-route-evidence:visual-review-verdict:${String(review.verdict)}`);
    const screenshots = Array.isArray(review.screenshotEvidence) ? review.screenshotEvidence : [];
    if (!screenshots.includes(options.routePrimaryScreenshot)) blockers.push("game-route-evidence:visual-review-screenshot-missing");
  }

  for (const asset of assets) {
    if (!asset) continue;
    const expected = asset.id === primaryGeometryAssetId
      ? (options.category === "racing" ? "certified-racing-track" : "certified-platformer-world")
      : (options.category === "racing" ? "certified-racing-vehicle" : "certified-platformer-character");
    if (asset.gameGeometry?.certification !== expected && asset.gameGeometry?.certification !== "certified-generated-game-world") {
      blockers.push(`game-route-evidence:asset-certification:${asset.id}:${String(asset.gameGeometry?.certification)}`);
    }
    if (asset.gameGeometry?.evidence?.manifestHash !== asset.hash) blockers.push(`game-route-evidence:asset-manifest-hash-stale:${asset.id}`);
  }

  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  if (blockers.length > 0 || !screenshotSha256) {
    return { ok: false, wroteManifest: false, manifestPath, routeId: options.routeId, assetIds, blockers };
  }
  const next = sortManifest({
    ...manifest,
    assets: manifest.assets.map((asset) => assetIds.includes(asset.id)
      ? {
        ...asset,
        gameGeometry: {
          ...asset.gameGeometry,
          evidence: {
            manifestHash: asset.hash,
            routePrimaryScreenshot: options.routePrimaryScreenshot,
            routePrimaryScreenshotSha256: screenshotSha256,
            geometryReport: options.geometryReport,
            visualReview: "pass" as const,
            assetPairPass: true,
            blockers: []
          }
        }
      }
      : asset)
  });
  writeAssetManifest(projectDir, next);
  const typegenPath = writeTypedAssets(projectDir, next);
  return { ok: true, wroteManifest: true, manifestPath, typegenPath, routeId: options.routeId, assetIds, blockers: [] };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readProjectEvidenceBytes(projectDir: string, path: string, label: string, blockers: string[]): Buffer | undefined {
  if (!path || path.includes("\\0") || path.startsWith("/") || path.startsWith("\\")) {
    blockers.push(`game-route-evidence:${label}-unsafe-path:${path}`);
    return undefined;
  }
  const absolute = resolve(projectDir, path);
  const rel = relative(projectDir, absolute);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    blockers.push(`game-route-evidence:${label}-unsafe-path:${path}`);
    return undefined;
  }
  if (!existsSync(absolute)) {
    blockers.push(`game-route-evidence:${label}-missing:${path}`);
    return undefined;
  }
  return readFileSync(absolute);
}

function readProjectEvidenceJson(projectDir: string, path: string, label: string, blockers: string[]): unknown {
  const bytes = readProjectEvidenceBytes(projectDir, path, label, blockers);
  if (!bytes) return undefined;
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { blockers.push(`game-route-evidence:${label}-invalid-json:${path}`); return undefined; }
}

export async function certifyGameGeometry(options: CertifyGameGeometryOptions): Promise<GameGeometryCertificationResult> {
  const { probeShowcaseGameGeometry } = await import("create-aura3d");
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const batchIds = options.assetIds?.map((id) => id.trim()).filter(Boolean);
  const mode = batchIds ? "screen" as const : "certify" as const;
  const assetIds = batchIds ?? (options.assetId ? [options.assetId.trim()] : []);
  if (assetIds.length === 0) {
    throw new Error("Game geometry certification requires --asset <id> or read-only --assets <csv> screening.");
  }
  if (mode === "certify" && assetIds.length !== 1) {
    throw new Error("Game geometry certification writes exactly one asset at a time; use --assets for read-only screening.");
  }

  const evaluated = assetIds.map((assetId) => {
    const asset = manifest.assets.find((entry) => entry.id === assetId);
    if (!asset) {
      return {
        row: {
          assetId,
          category: options.category,
          pass: false,
          reasons: [],
          blockers: [`asset-extraction:asset-not-found:${assetId}`]
        },
        gameGeometry: undefined
      };
    }

    const visualCertification = options.category === "racing" && asset.role === "vehicle"
      ? { role: "vehicle" as const, certification: "certified-racing-vehicle" as const, label: "racing-vehicle" as const }
      : options.category === "platformer" && asset.role === "character"
        ? { role: "character" as const, certification: "certified-platformer-character" as const, label: "platformer-character" as const }
        : undefined;
    if (visualCertification) {
      const blockers = retainedGameSubjectCertificationBlockers(projectDir, manifest, asset, visualCertification.role, visualCertification.label);
      const probe = asset.renderedProbe;
      return {
        row: {
          assetId,
          category: options.category,
          pass: blockers.length === 0,
          reasons: blockers.length === 0 && probe
            ? [
              `hash-bound retained ${visualCertification.role} probe:${probe.url}`,
              `foreground:${probe.foregroundBounds?.width ?? 0}x${probe.foregroundBounds?.height ?? 0}`
            ]
            : [],
          blockers
        },
        gameGeometry: blockers.length === 0 && probe
          ? {
            certification: visualCertification.certification,
            evidence: {
              manifestHash: asset.hash,
              routePrimaryScreenshot: probe.url,
              routePrimaryScreenshotSha256: probe.sha256,
              visualReview: "pass" as const,
              blockers: []
            }
          }
          : undefined
      };
    }

    const probe = probeShowcaseGameGeometry(assetId, options.category, { projectDir });
    const gameGeometry = probe.extraction.ok
      ? {
        certification: options.category === "racing" ? "certified-racing-track" as const : "certified-platformer-world" as const,
        evidence: {
          manifestHash: asset.hash,
          blockers: []
        },
        ...(options.category === "racing"
          ? { racingTopology: probe.extraction.value as unknown as Readonly<Record<string, unknown>> }
          : { playableSurfaceMap: probe.extraction.value as unknown as Readonly<Record<string, unknown>> })
      }
      : undefined;
    return {
      row: {
        assetId,
        category: options.category,
        pass: probe.extraction.ok,
        reasons: probe.extraction.reasons,
        blockers: probe.extraction.ok ? [] : probe.extraction.blockers
      },
      gameGeometry
    };
  });
  const rows = evaluated.map(({ row }) => row);

  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  if (mode === "screen" || !rows[0]?.pass) {
    return {
      ok: rows.every((row) => row.pass),
      mode,
      wroteManifest: false,
      manifestPath,
      rows
    };
  }

  const assetId = rows[0]?.assetId;
  const gameGeometry = evaluated[0]?.gameGeometry;
  if (!assetId || !gameGeometry) {
    return { ok: false, mode, wroteManifest: false, manifestPath, rows };
  }
  const next = sortManifest({
    ...manifest,
    assets: manifest.assets.map((entry) => entry.id === assetId ? { ...entry, gameGeometry } : entry)
  });
  writeAssetManifest(projectDir, next);
  const typegenPath = writeTypedAssets(projectDir, next);
  return {
    ok: true,
    mode,
    wroteManifest: true,
    manifestPath,
    typegenPath,
    rows
  };
}

function retainedGameSubjectCertificationBlockers(
  projectDir: string,
  manifest: AuraCliAssetManifest,
  asset: AuraCliAssetEntry,
  role: "vehicle" | "character",
  label: "racing-vehicle" | "platformer-character"
): readonly string[] {
  const blockers: string[] = [];
  if (asset.role !== role) {
    blockers.push(`asset-certification:${label}-role-required:${asset.id}`);
    return blockers;
  }
  if (asset.quality !== "release") {
    blockers.push(`asset-certification:${label}-release-quality-required:${asset.id}`);
  }
  const probe = asset.renderedProbe;
  if (!probe) {
    blockers.push(`asset-certification:${label}-probe-missing:${asset.id}`);
    return blockers;
  }
  if (probe.assetHash !== asset.hash) {
    blockers.push(`asset-certification:${label}-probe-asset-hash-stale:${asset.id}`);
  }
  const probePath = resolvePublicArtifactPath(projectDir, manifest, probe.url);
  if (!probePath || !existsSync(probePath)) {
    blockers.push(`asset-certification:${label}-probe-artifact-missing:${asset.id}`);
    return blockers;
  }
  const probeBytes = readFileSync(probePath);
  const actualSha256 = `sha256-${createHash("sha256").update(probeBytes).digest("hex")}`;
  if (probe.sha256 !== actualSha256) {
    blockers.push(`asset-certification:${label}-probe-image-hash-stale:${asset.id}`);
  }
  const probeMetrics = decodeRenderedProbePng(probeBytes);
  if (!probeMetrics.ok) {
    blockers.push(`asset-certification:${label}-probe-not-png:${asset.id}`);
    return blockers;
  }
  if (probe.width !== probeMetrics.width || probe.height !== probeMetrics.height) {
    blockers.push(`asset-certification:${label}-probe-dimensions-stale:${asset.id}`);
  }
  if (probe.nonBlankPixels !== probeMetrics.nonBlankPixels || probe.colorBuckets !== probeMetrics.colorBuckets) {
    blockers.push(`asset-certification:${label}-probe-pixels-stale:${asset.id}`);
  }
  if (createRoleAwareRenderedProbeWarnings(asset, role).length > 0) {
    blockers.push(`asset-certification:${label}-probe-readability-failed:${asset.id}`);
  }
  blockers.push(...roleAdmissionCertificationBlockers(asset, role, label));
  return blockers;
}

/**
 * Additional certification blockers from role-aware asset admission.
 *
 * ## Why this is wired in here
 *
 * Every check above measures the *probe artifact*: its hash, dimensions, pixel counts and readability.
 * None measures the *model*. A 792-triangle body shell with no wheels modelled passes all of them,
 * because it is a large, well-lit, correctly-framed subject that produces a perfectly valid probe PNG.
 * That is exactly how three unusable hero vehicles were certified in succession.
 *
 * `admitAssetForRole` is the single place that answers "is this model fit for this role?". Calling it
 * here means certification and the standalone auditor cannot disagree about the same asset.
 *
 * ## Why it only *adds* blockers
 *
 * Admission is a strictly additional gate: it never clears an existing blocker. A vehicle that fails
 * probe-hash freshness must still fail, whatever its geometry says.
 *
 * ## Why `unproven` is not a blocker here
 *
 * Manifest geometry metadata does not record wheel-corner counts or silhouette relationships, so
 * admission legitimately reports those as `unproven` rather than failing. Treating `unproven` as a
 * blocker would fail every currently-certified asset for missing metadata rather than for being unfit --
 * a gate that fires on everything is a gate nobody can act on. Hard `blockers` are enforced; the
 * `unproven` set is surfaced by `assets audit-geometry` and the screening pipeline, which do have
 * rendered evidence to supply.
 */
function roleAdmissionCertificationBlockers(
  asset: AuraCliAssetEntry,
  role: "vehicle" | "character",
  label: "racing-vehicle" | "platformer-character"
): readonly string[] {
  const bounds = asset.bounds;
  if (!bounds || bounds.length < 3) return [];
  const admission = admitAssetForRole({
    assetId: asset.id,
    requirement: {
      role: role === "vehicle" ? "hero-vehicle" : "playable-character",
      // A release-quality hero must be textured; both roles are hero subjects.
      requireTextured: true,
      requireProvenance: true
    },
    geometry: {
      partCount: Math.max(1, asset.nodeNames?.length ?? 1),
      /*
       * The manifest does not record a triangle count, so no triangle floor or budget is asserted here.
       *
       * Passing `0` would make every asset fail a hero triangle floor for *missing metadata* rather than
       * for being unfit, so the requirement above deliberately omits `minTriangles`/`maxTriangles` and
       * this value is only a placeholder for the part/material/texture checks that the manifest can
       * actually support. Triangle-budget enforcement belongs to the screening pipeline, which inspects
       * the pulled file directly.
       */
      triangles: 0,
      bounds: [Number(bounds[0]), Number(bounds[1]), Number(bounds[2])],
      materialCount: asset.materials?.length ?? 0,
      textureCount: asset.textures?.length ?? 0,
      ...(asset.boundsMetadata?.min?.[1] !== undefined ? { minY: Number(asset.boundsMetadata.min[1]) } : {})
    },
    provenance: {
      ...(asset.provenance?.license ? { license: asset.provenance.license } : {}),
      ...(asset.provenance?.author ? { author: asset.provenance.author } : {})
    }
  });
  return admission.blockers.map((blocker: string) => `asset-certification:${label}-admission:${asset.id}:${blocker}`);
}

export function scanAssets(options: { readonly projectDir?: string; readonly directory: string }): AssetCliResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const directory = resolve(projectDir, options.directory);
  if (!existsSync(directory)) throw new Error(`Aura3D assets scan failed: "${options.directory}" does not exist.`);
  let result: AssetCliResult | undefined;
  for (const file of readdirSync(directory)) {
    const path = join(directory, file);
    if (!statSync(path).isFile()) continue;
    const format = extname(path).slice(1).toLowerCase();
    if (!["glb", "gltf", "png", "jpg", "jpeg", "webp", "ktx2", "hdr", "exr", "mp3", "wav", "ogg"].includes(format)) continue;
    const name = sanitizeAssetId(file.replace(/\.[^.]+$/, ""));
    result = addAsset({ projectDir, file: relative(projectDir, path), name });
  }
  return result ?? {
    ok: true,
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    manifest: readAssetManifest(projectDir),
    messages: ["No supported assets found."]
  };
}

export function inspectAsset(options: InspectAssetOptions): AssetInspectionReport {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const sourcePath = resolve(projectDir, options.file);
  if (!existsSync(sourcePath)) {
    throw new Error(`Aura3D assets inspect failed: "${options.file}" does not exist.`);
  }
  const format = extname(sourcePath).slice(1).toLowerCase();
  const inspection = inspectAssetFile(sourcePath, format);
  const warnings = createAssetWarnings(sourcePath, inspection);
  return {
    ok: warnings.length === 0,
    schema: "aura3d.asset-inspection/1.0",
    file: normalizeRelativePath(relative(projectDir, sourcePath)),
    format,
    sizeBytes: statSync(sourcePath).size,
    bounds: inspection.bounds,
    boundsMetadata: inspection.boundsMetadata,
    materials: inspection.materials,
    materialMetadata: inspection.materialMetadata,
    animations: inspection.animations,
    ...(options.animation ? { animation: inspection.animation } : {}),
    ...(options.humanoid ? { humanoid: inspection.humanoid } : {}),
    ...(options.skeleton ? { skeleton: inspection.skeleton } : {}),
    ...(options.morphs ? { morphTargets: inspection.morphTargets } : {}),
    ...(options.license ? { provenance: createAssetProvenance(projectDir, sourcePath, {}, inspection.provenance) } : {}),
    textures: inspection.textures,
    orientation: inspection.orientation,
    nodeNames: inspection.nodeNames,
    dependencies: inspection.dependencies,
    warnings,
    messages: warnings.length === 0 ? ["Asset inspection completed."] : warnings
  };
}

export function validateAssets(options: AssetValidationOptions = {}): AssetValidationResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const manifestMissing = !existsSync(manifestPath);
  const sourceManifest = readAssetManifest(projectDir);
  const manifest = filterAssetManifest(sourceManifest, options.assetIds);
  const externalProvenance = readExternalProvenance(projectDir, options.provenanceFile);
  const release = options.release === true;
  const noPlaceholders = options.noPlaceholders === true || release;
  const requireLicense = options.requireLicense === true || release;
  const failures: string[] = manifestMissing
    ? [`Missing ${DEFAULT_AURA_ASSET_MANIFEST}. Suggested fix: run aura3d assets add ./asset.glb --name product or aura3d assets scan ./assets.`]
    : [];
  const missingAssetIds = findMissingAssetIds(sourceManifest, options.assetIds);
  for (const id of missingAssetIds) failures.push(`Requested asset "${id}" was not found in ${DEFAULT_AURA_ASSET_MANIFEST}.`);
  if (options.provenanceFile && !existsSync(resolve(projectDir, options.provenanceFile))) {
    failures.push(`Missing asset provenance evidence file: ${options.provenanceFile}`);
  }
  const warnings: string[] = [];
  warnings.push(...createDuplicateHashWarnings(manifest, externalProvenance));
  for (const asset of manifest.assets) {
    const outputPath = resolve(projectDir, asset.outputPath);
    if (!existsSync(outputPath)) {
      failures.push(`Missing asset output for "${asset.id}": ${asset.outputPath}`);
      continue;
    }
    const actualHash = `sha256-${hashFile(outputPath)}`;
    if (actualHash !== asset.hash) failures.push(`Hash mismatch for "${asset.id}": expected ${asset.hash}, found ${actualHash}`);
    const provenance = resolveAssetProvenance(asset, externalProvenance);
    if (noPlaceholders && isPlaceholderAsset(asset, provenance)) {
      failures.push(`Placeholder asset is not allowed in strict release validation: "${asset.id}". Replace it with a real typed asset and provenance.`);
    }
    if (requireLicense && !hasUsableLicenseEvidence(provenance)) {
      failures.push(`Missing license/provenance evidence for "${asset.id}". Add it with assets add --license ... --source-url ... or pass --provenance <evidence.json>.`);
    }
    if (release) warnings.push(...createDurableReleaseProvenanceWarnings(asset, provenance));
    warnings.push(...createDerivedMetadataDriftWarnings(outputPath, asset));
    if (release) warnings.push(...createReleaseStructuredQualityWarnings(asset));
    if (release) warnings.push(...createReleaseAssetQualityWarnings(asset));
    if (release) warnings.push(...createReleaseRenderedProbeWarnings(projectDir, manifest, asset));
    if (release) warnings.push(...createManifestOrientationOverrideWarnings(asset));
    if (release) warnings.push(...createRoleAwareReleaseQualityWarnings(projectDir, manifest, asset));
    if (release) warnings.push(...createReleaseThumbnailWarnings(projectDir, manifest, asset));
    const tempProvenance = createTempProvenanceWarning(asset, provenance);
    if (tempProvenance) warnings.push(tempProvenance);
    const storedWarnings = release ? releaseStoredAssetWarnings(asset) : asset.warnings ?? [];
    warnings.push(...storedWarnings.map((warning) => `${asset.id}: ${warning}`));
    if (asset.format === "gltf") {
      for (const dependency of asset.dependencies ?? asset.textures) {
        if (dependency.startsWith("data:")) continue;
        const sourceDependencyPath = resolve(dirname(resolve(projectDir, asset.source)), dependency);
        const outputDependencyPath = resolve(dirname(resolve(projectDir, asset.outputPath)), dependency);
        if (!existsSync(sourceDependencyPath) && !existsSync(outputDependencyPath)) {
          failures.push(`Missing referenced asset dependency for "${asset.id}": ${dependency}`);
        }
      }
    }
  }
  const typegenPath = resolve(projectDir, manifest.typegen);
  if (!existsSync(typegenPath)) failures.push(`Missing typed asset module: ${manifest.typegen}. Run assets typegen.`);
  const source = shouldScanSource(options) ? validateAssetSource(projectDir, options.source, sourceManifest) : undefined;
  if (source) {
    failures.push(...source.failures);
    warnings.push(...source.warnings);
  }
  if (release) {
    for (const warning of warnings) {
      failures.push(`Release validation warning is blocking: ${warning}`);
    }
  }
  return {
    ok: failures.length === 0,
    manifestPath,
    manifest,
    ...(source ? { source } : {}),
    failures,
    warnings,
    messages: failures.length === 0 ? [release ? "Asset manifest is release-valid." : "Asset manifest is valid."] : failures
  };
}

export function createAssetThumbnails(options: { readonly projectDir?: string } = {}): AssetCliResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const assets = manifest.assets.map((asset) => ({
    ...asset,
    thumbnailUrl: writeThumbnail(projectDir, manifest.outputDir, manifest.assetBasePath, asset.id, asset.bounds)
  }));
  const next = sortManifest({ ...manifest, assets });
  writeAssetManifest(projectDir, next);
  writeTypedAssets(projectDir, next);
  return {
    ok: true,
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    manifest: next,
    messages: [`Generated ${next.assets.length} thumbnails.`]
  };
}

export function doctor(options: { readonly projectDir?: string } = {}): AssetValidationResult {
  const validation = validateAssets(options);
  const packagePath = resolve(options.projectDir ?? process.cwd(), "package.json");
  const failures = [...validation.failures];
  if (!existsSync(packagePath)) failures.push("Missing package.json.");
  return {
    ...validation,
    ok: failures.length === 0,
    failures,
    messages: failures.length === 0 ? ["Aura3D project doctor passed."] : failures
  };
}

export function checkDeploy(options: CheckDeployOptions = {}): AssetValidationResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const sourceManifest = readAssetManifest(projectDir);
  const manifest = filterAssetManifest(sourceManifest, options.assetIds);
  const distDir = normalizeRelativePath(options.distDir ?? "dist");
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const asset of manifest.assets) {
    const distPath = resolve(projectDir, distDir, asset.url.replace(/^\//, ""));
    const publicPath = resolve(projectDir, asset.outputPath);
    if (!existsSync(distPath) && !existsSync(publicPath)) {
      failures.push(`Deploy check missing hashed asset for "${asset.id}": expected ${asset.url} in ${distDir} or ${asset.outputPath}`);
    }
    if (!/[a-f0-9]{8}\.[^.]+$/i.test(asset.url)) warnings.push(`${asset.id}: URL is not fingerprinted: ${asset.url}`);
  }
  const validation = validateAssets({
    projectDir,
    noPlaceholders: options.noPlaceholders,
    requireLicense: options.requireLicense,
    provenanceFile: options.provenanceFile,
    assetIds: options.assetIds,
    source: options.source,
    release: options.release
  });
  failures.push(...validation.failures);
  warnings.push(...validation.warnings);
  return {
    ok: failures.length === 0,
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    manifest,
    ...(validation.source ? { source: validation.source } : {}),
    failures,
    warnings,
    messages: failures.length === 0
      ? [options.release ? "Deploy check passed with release asset gates." : "Deploy check passed."]
      : failures
  };
}

export function validateGameAssets(options: AssetReadinessOptions = {}): AssetReadinessReport {
  return validateAssetReadiness("game", options);
}

export function validateAnimationStudioAssets(options: AssetReadinessOptions = {}): AssetReadinessReport {
  return validateAssetReadiness("animation", options);
}

export function createCharacterAssemblyPlan(options: CharacterAssemblyPlanOptions): CharacterAssemblyPlanResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const failures: string[] = [];
  const warnings: string[] = [];
  const output = normalizeRelativePath(options.output ?? `src/aura-character-${sanitizeAssetId(options.name)}.assembly.json`);
  const bodyAsset = manifest.assets.find((asset) => asset.id === options.body);
  if (!bodyAsset) {
    failures.push(`Missing body asset "${options.body}". Add it first with aura3d assets add ./body.glb --name ${options.body}.`);
  } else if (bodyAsset.type !== "model") {
    failures.push(`Body asset "${options.body}" must be a model asset, found ${bodyAsset.type}.`);
  } else if (bodyAsset.humanoid && !bodyAsset.humanoid.humanoid) {
    warnings.push(`Body asset "${options.body}" has humanoid status "${bodyAsset.humanoid.status}"; character assembly can still compose parts, but acting and retargeting may be limited.`);
  }
  const resolvePart = (part: CharacterAssemblyPartInput): CharacterAssemblyResolvedPart | undefined => {
    const asset = manifest.assets.find((entry) => entry.id === part.asset);
    if (!asset) {
      failures.push(`Missing ${part.slot} part asset "${part.asset}".`);
      return undefined;
    }
    if (asset.type !== "model") warnings.push(`${part.slot}: "${part.asset}" is ${asset.type}; character assembly expects model parts for rig/attachment safety.`);
    return {
      slot: part.slot,
      asset: part.asset,
      url: asset.url,
      type: asset.type,
      format: asset.format,
      animations: asset.animations,
      humanoid: asset.humanoid,
      attachTo: part.attachTo ?? defaultAttachPoint(part.slot)
    };
  };
  const parts = (options.parts ?? []).map(resolvePart).filter((part): part is CharacterAssemblyResolvedPart => Boolean(part));
  const body: CharacterAssemblyResolvedPart = bodyAsset
    ? {
        slot: "body",
        asset: bodyAsset.id,
        url: bodyAsset.url,
        type: bodyAsset.type,
        format: bodyAsset.format,
        animations: bodyAsset.animations,
        humanoid: bodyAsset.humanoid,
        attachTo: "root"
      }
    : {
        slot: "body",
        asset: options.body,
        url: "",
        type: "model",
        format: "missing",
        animations: [],
        attachTo: "root"
      };
  const plan = {
    schema: "aura3d.character-assembly/1.0",
    name: options.name,
    output,
    scale: options.scale ?? 1,
    body,
    parts,
    rules: {
      normalizeScale: true,
      facePositiveZ: true,
      preserveTypedAssetReferences: true,
      requireNamedAttachments: true
    }
  };
  mkdirSync(dirname(resolve(projectDir, output)), { recursive: true });
  writeFileSync(resolve(projectDir, output), `${JSON.stringify(plan, null, 2)}\n`);
  return {
    ok: failures.length === 0,
    schema: "aura3d.character-assembly/1.0",
    name: options.name,
    output,
    body,
    parts,
    validation: { failures, warnings },
    messages: failures.length === 0
      ? [`Wrote ${output}. Import typed assets from src/aura-assets.ts and compose with model(assets.${options.body}).`]
      : failures
  };
}

export function initAgentFiles(options: { readonly projectDir?: string; readonly agent: "claude" | "cursor" | "copilot" | "generic" | "all" }): readonly string[] {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const targets = options.agent === "all" ? ["generic", "claude", "cursor", "copilot"] as const : [options.agent] as const;
  const written: string[] = [];
  for (const target of targets) {
    if (target === "generic") written.push(writeAgentFile(projectDir, "AGENTS.md", genericAgentText()));
    if (target === "claude") written.push(writeAgentFile(projectDir, ".claude/CLAUDE.md", genericAgentText("Claude")));
    if (target === "cursor") written.push(writeAgentFile(projectDir, ".cursor/rules/aura3d.mdc", genericAgentText("Cursor")));
    if (target === "copilot") written.push(writeAgentFile(projectDir, ".github/copilot-instructions.md", genericAgentText("GitHub Copilot")));
  }
  return written;
}

function validateAssetReadiness(profile: AuraAssetReadinessProfile, options: AssetReadinessOptions): AssetReadinessReport {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const gameProfile = profile === "game" ? options.gameProfile : undefined;
  const sourceManifest = readAssetManifest(projectDir);
  const manifest = filterAssetManifest(sourceManifest, options.assetIds);
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const evidencePath = options.output ? resolve(projectDir, options.output) : undefined;
  const modelAssets = manifest.assets.filter((asset) => asset.type === "model");
  const explicitAssetFilter = normalizeAssetIdFilter(options.assetIds).length > 0;
  const profileTargetAssets = gameProfile === "fighting-character"
    ? explicitAssetFilter
      ? manifest.assets
      : modelAssets.filter((asset) => isFightingCharacterProfileTarget(asset))
    : [];
  const profileTargetAssetIds = new Set(profileTargetAssets.map((asset) => asset.id));
  const profileValidationAssetIds = profileTargetAssets.map((asset) => asset.id);
  const validation = gameProfile === "fighting-character" && profileValidationAssetIds.length === 0
    ? createEmptyReadinessValidation(projectDir, manifest)
    : validateAssets({
        projectDir,
        noPlaceholders: options.noPlaceholders,
        requireLicense: options.requireLicense,
        provenanceFile: options.provenanceFile,
        assetIds: gameProfile === "fighting-character" ? profileValidationAssetIds : options.assetIds
      });
  const externalProvenance = readExternalProvenance(projectDir, options.provenanceFile);
  const failures = [...validation.failures];
  const warnings = [...validation.warnings];
  const animatedModels = modelAssets.filter((asset) => asset.animations.length > 0);
  const animationClips = manifest.assets.reduce((total, asset) => total + asset.animations.length, 0);
  const humanoidModels = modelAssets.filter((asset) => asset.humanoid?.humanoid).length;
  const artifacts = createReadinessArtifacts(projectDir, manifest, evidencePath);
  const assets = manifest.assets.map((asset) => {
    const provenance = resolveAssetProvenance(asset, externalProvenance);
    const placeholderFree = !isPlaceholderAsset(asset, provenance);
    const licenseVerified = hasUsableLicenseEvidence(provenance);
    const assetWarnings = [...asset.warnings];
    const readinessIssues = createAssetReadinessIssues(profile, asset);
    const profileTarget = gameProfile === "fighting-character" && profileTargetAssetIds.has(asset.id);
    const profileIssues = profileTarget
      ? createFightingCharacterReadinessIssues(asset, provenance, licenseVerified)
      : { failures: [] as string[], warnings: [] as string[] };
    const profileSkippedReason = gameProfile === "fighting-character" && !profileTarget
      ? "Skipped by fighting-character profile because this model is not marked or inferred as a fighter candidate. Use --asset <id> to force validation."
      : undefined;
    if (asset.type === "model" && !asset.bounds) assetWarnings.push("Missing bounds; camera framing, collision proxies, and thumbnail composition will be weaker.");
    if (asset.type === "model" && asset.materials.length === 0) assetWarnings.push("No material names detected; authored visual diagnostics will be limited.");
    if (asset.type === "model" && asset.sizeBytes > 50 * 1024 * 1024) assetWarnings.push("Large model over 50MB; consider mesh/texture optimization before browser deployment.");
    if (asset.type === "model" && asset.animations.length > 0 && asset.humanoid?.status === "unknown") assetWarnings.push("Animated model has unknown humanoid status; inspect with --humanoid before using it as an acted character.");
    assetWarnings.push(...readinessIssues.warnings);
    assetWarnings.push(...profileIssues.warnings);
    pushUnique(failures, [...readinessIssues.failures, ...profileIssues.failures]);
    pushUnique(warnings, [...readinessIssues.warnings, ...profileIssues.warnings]);
    const gameReady = asset.type === "model" && Boolean(asset.bounds) && asset.materials.length > 0 && asset.sizeBytes <= 50 * 1024 * 1024 && readinessIssues.failures.length === 0 && profileIssues.failures.length === 0;
    const profileReady = profileTarget && gameReady;
    const animationReady = asset.type === "model"
      ? Boolean(asset.bounds) && (asset.animations.length > 0 || /prop|set|stage|background|environment/i.test(asset.id))
      : asset.type === "audio" || asset.type === "texture";
    const artifactPaths = artifacts.assetFiles.find((entry) => entry.id === asset.id) ?? createReadinessAssetArtifacts(projectDir, manifest, asset);
    return {
      id: asset.id,
      type: asset.type,
      format: asset.format,
      source: asset.source,
      outputPath: asset.outputPath,
      url: asset.url,
      hash: asset.hash,
      sizeBytes: asset.sizeBytes,
      bounds: asset.bounds,
      boundsMetadata: asset.boundsMetadata,
      animations: asset.animations,
      animation: createReadinessAnimationMetadata(asset.animations),
      animationMetadata: asset.animationMetadata,
      humanoid: asset.humanoid,
      skeleton: asset.skeleton,
      morphTargets: asset.morphTargets,
      provenance,
      placeholderFree,
      licenseVerified,
      materials: asset.materials,
      materialMetadata: asset.materialMetadata,
      textures: asset.textures,
      orientation: asset.orientation,
      nodeNames: asset.nodeNames,
      artifactPaths,
      gameReady,
      animationReady,
      ...(gameProfile === "fighting-character" ? { profileTarget, profileReady, ...(profileSkippedReason ? { profileSkippedReason } : {}) } : {}),
      warnings: assetWarnings
    };
  });
  if (profile === "game") {
    if (modelAssets.length === 0) failures.push("Game readiness requires at least one typed model asset. Add a GLB/GLTF with aura3d assets add ./fighter.glb --name fighter.");
    if (animatedModels.length === 0) warnings.push("No animated model clips detected. Static scenes can ship, but playable character showcases should include idle/walk/attack/hurt clips.");
    if (animatedModels.length > 0 && humanoidModels === 0) warnings.push("No humanoid model metadata detected. Character-heavy game routes should confirm humanoid status with assets inspect --humanoid and typed asset metadata.");
    for (const asset of assets) {
      if (asset.type !== "model") continue;
      if (!asset.gameReady) warnings.push(`${asset.id}: not game-ready yet; expected bounds, named materials, and browser-sized payload.`);
    }
    if (gameProfile === "fighting-character") {
      const targetModelAssets = profileTargetAssets.filter((asset) => asset.type === "model");
      const targetAnimatedModels = targetModelAssets.filter((asset) => asset.animations.length > 0);
      const targetHumanoidModels = targetModelAssets.filter((asset) => asset.humanoid?.humanoid).length;
      const profileReadyAssets = assets.filter((asset) => asset.profileReady).length;
      const distinctTargetHashes = new Set(profileTargetAssets.map((asset) => asset.hash)).size;
      const minImplicitTargets = 2;
      if (profileTargetAssets.length < 1) {
        failures.push("fighting-character profile found no fighter candidate assets. Add typed fighter assets or pass --asset <id> to validate a specific candidate.");
      }
      if (!explicitAssetFilter && profileTargetAssets.length < minImplicitTargets) {
        failures.push(`fighting-character profile requires at least ${minImplicitTargets} distinct typed fighter assets for a game manifest; found ${profileTargetAssets.length}${profileTargetAssets.length ? `: ${profileTargetAssets.map((asset) => asset.id).join(", ")}` : ""}.`);
      }
      if (profileTargetAssets.length > 1 && distinctTargetHashes < profileTargetAssets.length) {
        failures.push("fighting-character profile requires distinct fighter asset files/hashes; same-model tinting is not valid flagship evidence.");
      }
      if (targetAnimatedModels.length < targetModelAssets.length) failures.push("fighting-character profile requires every targeted fighter model asset to include embedded animation clips.");
      if (targetHumanoidModels < targetModelAssets.length) failures.push("fighting-character profile requires every targeted fighter model asset to include humanoid/skeleton metadata.");
      if (!explicitAssetFilter && profileReadyAssets < minImplicitTargets) {
        failures.push(`fighting-character profile found only ${profileReadyAssets} release-ready fighter asset${profileReadyAssets === 1 ? "" : "s"}; a flagship game manifest requires at least ${minImplicitTargets}.`);
      }
    }
  } else {
    if (modelAssets.length === 0) failures.push("Animation readiness requires at least one typed model/set/prop GLB or GLTF.");
    if (animatedModels.length === 0) warnings.push("No animated character clips detected. Prompt-to-episode output can use transform animation, but character acting needs skeletal or pose clips.");
    if (animatedModels.length > 0 && humanoidModels === 0) warnings.push("No humanoid model metadata detected. Acting-heavy animation routes should confirm character rigs with assets inspect --humanoid.");
    const audioAssets = manifest.assets.filter((asset) => asset.type === "audio");
    if (audioAssets.length === 0) warnings.push("No audio assets detected. AuraVoice bridge can still reference external narration manifests, but local episode proof is stronger with audio registered.");
  }
  const animationEpisode = profile === "animation"
    ? createAnimationEpisodeReadinessReport(manifest, assets, options)
    : undefined;
  if (animationEpisode && options.episode) {
    pushUnique(failures, animationEpisode.failures);
    pushUnique(warnings, animationEpisode.warnings);
  }
  const ok = failures.length === 0;
  const baseMessage = ok
    ? `${profile === "game" ? "Game" : "Animation"} asset readiness report completed.`
    : failures;
  const messages = [
    ...(Array.isArray(baseMessage) ? baseMessage : [baseMessage]),
    ...(evidencePath ? [`Wrote asset readiness evidence: ${normalizeRelativePath(relative(projectDir, evidencePath))}`] : [])
  ];
  const report: AssetReadinessReport = {
    schema: "aura3d.asset-readiness/1.0",
    profile,
    ...(gameProfile ? { gameProfile } : {}),
    ok,
    status: ok ? "passed" : "failed",
    validator: createReadinessValidatorEvidence(profile),
    checkedAt: new Date().toISOString(),
    manifestPath,
    artifacts,
    contracts: createReadinessValidationContracts(profile),
    ...(animationEpisode ? { animationEpisode } : {}),
    summary: {
      totalAssets: manifest.assets.length,
      modelAssets: modelAssets.length,
      animatedModels: animatedModels.length,
      textureAssets: manifest.assets.filter((asset) => asset.type === "texture").length,
      audioAssets: manifest.assets.filter((asset) => asset.type === "audio").length,
      environmentAssets: manifest.assets.filter((asset) => asset.type === "environment").length,
      animationClips,
      humanoidModels,
      ...(animationEpisode
        ? {
            animationCharacters: animationEpisode.selectedCharacters.length,
            animationSets: animationEpisode.selectedSets.length,
            animationProps: animationEpisode.selectedProps.length,
            episodeReadyCharacters: animationEpisode.readiness.filter((entry) => entry.role === "character" && entry.episodeReady).length,
            mouthReadyCharacters: animationEpisode.readiness.filter((entry) => entry.role === "character" && entry.mouthReady).length,
            animationReadyCharacters: animationEpisode.readiness.filter((entry) => entry.role === "character" && entry.animationReady).length
          }
        : {}),
      ...(gameProfile === "fighting-character"
        ? {
            profileTargetAssets: profileTargetAssets.length,
            profileReadyAssets: assets.filter((asset) => asset.profileReady).length,
            profileSkippedAssets: manifest.assets.length - profileTargetAssets.length
          }
        : {})
    },
    assets,
    failures,
    warnings,
    messages
  };
  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function filterAssetManifest(manifest: AuraCliAssetManifest, assetIds?: readonly string[]): AuraCliAssetManifest {
  if (assetIds === undefined) return manifest;
  const normalized = normalizeAssetIdFilter(assetIds);
  const allowed = new Set(normalized);
  return {
    ...manifest,
    assets: manifest.assets.filter((asset) => allowed.has(asset.id))
  };
}

function findMissingAssetIds(manifest: AuraCliAssetManifest, assetIds?: readonly string[]): readonly string[] {
  if (assetIds === undefined) return [];
  const normalized = normalizeAssetIdFilter(assetIds);
  if (normalized.length === 0) return [];
  const existing = new Set(manifest.assets.map((asset) => asset.id));
  return normalized.filter((id) => !existing.has(id));
}

function normalizeAssetIdFilter(assetIds?: readonly string[]): readonly string[] {
  return [...new Set((assetIds ?? []).map((id) => id.trim()).filter(Boolean))];
}

function createEmptyReadinessValidation(projectDir: string, manifest: AuraCliAssetManifest): AssetValidationResult {
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const manifestMissing = !existsSync(manifestPath);
  return {
    ok: !manifestMissing,
    manifestPath,
    manifest,
    failures: manifestMissing
      ? [`Missing ${DEFAULT_AURA_ASSET_MANIFEST}. Suggested fix: run aura3d assets add ./fighter.glb --name fighter.`]
      : [],
    warnings: [],
    messages: manifestMissing ? [`Missing ${DEFAULT_AURA_ASSET_MANIFEST}.`] : ["No fighting-character profile targets were selected."]
  };
}

function createReadinessValidatorEvidence(profile: AuraAssetReadinessProfile): AssetReadinessValidatorEvidence {
  return profile === "game"
    ? {
        id: "aura-clash-game-assets",
        command: "assets validate-game",
        label: "AuraClash game asset validator"
      }
    : {
        id: "aura-voice-animation-assets",
        command: "assets validate-animation",
        label: "AuraVoice animation asset validator"
      };
}

function createReadinessValidationContracts(profile: AuraAssetReadinessProfile): readonly AssetReadinessValidationContract[] {
  if (profile === "game") {
    return [
      {
        id: "quaternius-game-ready-fighter-validation-contract",
        label: "Quaternius-derived game-ready fighter validation contract",
        profile: "game",
        sourceFamily: "Quaternius",
        intendedUse: "fighter",
        sourceOnly: true,
        requiredChecks: [
          "typed Aura model asset entry generated by assets add",
          "Quaternius provenance or source-family metadata",
          "GLB/GLTF model with browser-sized payload",
          "bounds with grounded pivot and fighter-scale dimensions",
          "forward-facing +z or z orientation before runtime mirroring",
          "humanoid skeleton metadata suitable for retarget diagnostics",
          "readable visible materials and texture budget",
          "thumbnail or first-frame artifact path",
          "non-empty named fighting animation clips",
          "no floating hair-only assembly without a body/head anchor"
        ],
        requiredAnimationClips: ["idle", "walk", "lightPunch"],
        evidenceBoundary:
          "This CLI contract is source-only. It does not prove a Quaternius fighter passed validation until assets validate-game output and retained runtime/browser evidence are archived."
      }
    ];
  }

  return [
    {
      id: "auravoice-animation-character-asset-validation-contract",
      label: "AuraVoice animation asset validation contract",
      profile: "animation",
      sourceFamily: "AuraVoice",
      intendedUse: "animation-character",
      sourceOnly: true,
      requiredChecks: [
        "typed Aura model, texture, audio, or environment asset entry",
        "bounds for model/set composition",
        "animation or transform-ready character metadata",
        "audio or external AuraVoice manifest references for stronger episode proof"
      ],
      evidenceBoundary:
        "This CLI contract is source-only. It does not prove animation route readiness until validate-animation output, rendered frames, timing proof, and AuraVoice evidence are archived."
    }
  ];
}

function createReadinessArtifacts(projectDir: string, manifest: AuraCliAssetManifest, evidencePath?: string): AssetReadinessArtifacts {
  const artifacts: {
    evidencePath?: string;
    manifestPath: string;
    typedAssetsPath: string;
    outputDir: string;
    assetBasePath: string;
    assetFiles: readonly AssetReadinessAssetArtifacts[];
  } = {
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    typedAssetsPath: resolve(projectDir, manifest.typegen),
    outputDir: resolve(projectDir, manifest.outputDir),
    assetBasePath: manifest.assetBasePath,
    assetFiles: manifest.assets.map((asset) => createReadinessAssetArtifacts(projectDir, manifest, asset))
  };
  if (evidencePath) artifacts.evidencePath = evidencePath;
  return artifacts;
}

function createReadinessAssetArtifacts(projectDir: string, manifest: AuraCliAssetManifest, asset: AuraCliAssetEntry): AssetReadinessAssetArtifacts {
  const artifact: {
    id: string;
    sourcePath: string;
    outputPath: string;
    publicUrl: string;
    thumbnailPath?: string;
    thumbnailUrl?: string;
    dependencyPaths: readonly string[];
  } = {
    id: asset.id,
    sourcePath: resolve(projectDir, asset.source),
    outputPath: resolve(projectDir, asset.outputPath),
    publicUrl: asset.url,
    dependencyPaths: (asset.dependencies ?? []).map((dependency) => resolve(dirname(resolve(projectDir, asset.outputPath)), dependency))
  };
  if (asset.thumbnailUrl) {
    artifact.thumbnailUrl = asset.thumbnailUrl;
    const thumbnailPath = resolvePublicArtifactPath(projectDir, manifest, asset.thumbnailUrl);
    if (thumbnailPath) artifact.thumbnailPath = thumbnailPath;
  }
  return artifact;
}

function createReadinessAnimationMetadata(animations: readonly string[]): AssetReadinessAnimationMetadata {
  return {
    clipCount: animations.length,
    clips: animations.map((name, index) => ({ index, name }))
  };
}

function createAnimationEpisodeReadinessReport(
  manifest: AuraCliAssetManifest,
  assets: readonly AssetReadinessAssetReport[],
  options: AssetReadinessOptions
): AnimationEpisodeReadinessReport {
  const readiness = assets.map(createAnimationEpisodeAssetReadiness);
  const characters = readiness.filter((entry) => entry.role === "character");
  const sets = readiness.filter((entry) => entry.role === "set");
  const props = readiness.filter((entry) => entry.role === "prop");
  const audio = readiness.filter((entry) => entry.role === "audio");
  const failures: string[] = [];
  const warnings: string[] = [];
  const distinctCharacterHashes = new Set(characters.map((entry) => entry.distinctHash).filter(Boolean));
  const readyCharacters = characters.filter((entry) => entry.episodeReady);
  const readySets = sets.filter((entry) => entry.episodeReady);

  if (characters.length < 2) {
    failures.push(`animation episode validation requires at least 2 typed animation character assets; found ${characters.length}${characters.length ? `: ${characters.map((entry) => entry.id).join(", ")}` : ""}.`);
  }
  if (characters.length >= 2 && distinctCharacterHashes.size < characters.length) {
    failures.push("animation episode validation requires distinct character files/hashes; duplicated character assets cannot prove a two-character episode cast.");
  }
  if (readyCharacters.length < 2) {
    failures.push(`animation episode validation found only ${readyCharacters.length} episode-ready character asset${readyCharacters.length === 1 ? "" : "s"}; required 2 with license, provenance, animation, and mouth readiness.`);
  }
  if (sets.length < 1) {
    failures.push("animation episode validation requires at least 1 typed animation set/location asset.");
  }
  if (readySets.length < 1) {
    failures.push("animation episode validation requires at least 1 episode-ready set with license, provenance, bounds, readable materials, and walkable scale.");
  }

  for (const entry of readiness) {
    pushUnique(failures, entry.failures);
    pushUnique(warnings, entry.warnings);
  }

  if (audio.length === 0) {
    warnings.push("animation episode validation found no typed audio assets; publish-ready dialogue/audio proof will need registered dialogue, music, or SFX stems.");
  }

  const evidenceDirectory = options.output ? dirname(normalizeRelativePath(options.output)) : "artifacts/aura3d";

  return {
    enabled: Boolean(options.episode),
    ok: failures.length === 0,
    mode: "episode-ready",
    requirements: {
      minDistinctCharacters: 2,
      minSets: 1,
      requireLicense: true,
      noPlaceholders: true,
      requireAnimation: true,
      requireMouthMotion: true,
      requireSetScale: true
    },
    selectedCharacters: characters.map((entry) => entry.id),
    selectedSets: sets.map((entry) => entry.id),
    selectedProps: props.map((entry) => entry.id),
    selectedAudio: audio.map((entry) => entry.id),
    readiness,
    assetProvenanceArtifact: normalizeRelativePath(join(evidenceDirectory, "asset-provenance.json")),
    failures,
    warnings
  };
}

function createAnimationEpisodeAssetReadiness(asset: AssetReadinessAssetReport): AnimationEpisodeAssetReadiness {
  const role = inferAnimationEpisodeAssetRole(asset);
  const failures: string[] = [];
  const warnings: string[] = [];
  const provenanceReady = Boolean(asset.provenance?.sourceUrl || asset.provenance?.sourceFamily || asset.provenance?.sourcePath);
  const animationReady = role === "character" ? isAnimationCharacterAnimationReady(asset) : asset.animations.length > 0;
  const mouthMode = role === "character" ? inferAnimationMouthMode(asset) : undefined;
  const mouthReady = role === "character" ? mouthMode !== "missing-mouth-motion" : false;
  const setReady = role === "set" ? isAnimationSetReady(asset) : undefined;

  if (role === "character") {
    if (asset.type !== "model") failures.push(`${asset.id}: animation character must be a typed model asset, found ${asset.type}.`);
    if (!asset.licenseVerified) failures.push(`${asset.id}: animation character requires verified redistributable license evidence.`);
    if (!provenanceReady) failures.push(`${asset.id}: animation character requires source provenance for episode packaging.`);
    if (!asset.placeholderFree) failures.push(`${asset.id}: animation character is placeholder-tagged and cannot satisfy episode-ready validation.`);
    if (!asset.boundsMetadata && !asset.bounds) failures.push(`${asset.id}: animation character requires bounds metadata for framing and motion analysis.`);
    if (!animationReady) failures.push(`${asset.id}: animation character requires embedded animation clips or explicit segmented-rig metadata.`);
    if (!mouthReady) failures.push(`${asset.id}: animation character requires blendshape, mouth-card, viseme, talk, face, or primitive mouth fallback metadata.`);
    if (asset.materials.length === 0) failures.push(`${asset.id}: animation character requires at least one readable material.`);
    if (asset.sizeBytes > 45 * 1024 * 1024) failures.push(`${asset.id}: animation character payload is ${asset.sizeBytes} bytes; expected <= 47185920 for browser episode playback.`);
    if (mouthMode === "amplitude-only") warnings.push(`${asset.id}: mouth readiness is amplitude-only; add blendshape or mouth-card metadata for stronger lip-sync proof.`);
  } else if (role === "set") {
    if (asset.type !== "model") failures.push(`${asset.id}: animation set must be a typed model asset, found ${asset.type}.`);
    if (!asset.licenseVerified) failures.push(`${asset.id}: animation set requires verified redistributable license evidence.`);
    if (!provenanceReady) failures.push(`${asset.id}: animation set requires source provenance for episode packaging.`);
    if (!asset.placeholderFree) failures.push(`${asset.id}: animation set is placeholder-tagged and cannot satisfy episode-ready validation.`);
    if (!setReady) failures.push(`${asset.id}: animation set requires bounds, readable materials, and at least 1.5m walkable/framing scale.`);
    if (asset.sizeBytes > 90 * 1024 * 1024) failures.push(`${asset.id}: animation set payload is ${asset.sizeBytes} bytes; expected <= 94371840 for browser episode playback.`);
  } else if (role === "prop" || role === "environment") {
    if (!asset.licenseVerified) warnings.push(`${asset.id}: optional animation ${role} lacks verified license evidence; publish packages should include provenance for every visible asset.`);
    if (!provenanceReady) warnings.push(`${asset.id}: optional animation ${role} lacks source provenance.`);
  }

  return {
    id: asset.id,
    role,
    episodeReady: role === "character"
      ? failures.length === 0 && animationReady && mouthReady
      : role === "set"
        ? failures.length === 0 && Boolean(setReady)
        : failures.length === 0,
    distinctHash: role === "character" ? asset.hash : undefined,
    licenseVerified: asset.licenseVerified,
    provenanceReady,
    placeholderFree: asset.placeholderFree,
    animationReady,
    mouthReady,
    ...(mouthMode ? { mouthMode } : {}),
    ...(typeof setReady === "boolean" ? { setReady } : {}),
    warnings,
    failures
  };
}

function inferAnimationEpisodeAssetRole(asset: AssetReadinessAssetReport): AnimationEpisodeAssetRole {
  if (asset.type === "audio") return "audio";
  if (asset.type === "texture") return "texture";
  const text = animationAssetText(asset);
  if (asset.type === "environment" || /\b(environment|skybox|backdrop|background|world|terrain|horizon)\b/i.test(text)) return "environment";
  if (/\b(set|stage|room|garden|park|school|street|house|classroom|moon garden|walkable|floor|location)\b/i.test(text)) return "set";
  if (/\b(character|humanoid|kid|child|hero|sidekick|villain|narrator|avatar|actor|miko|luma|robot|mascot|npc)\b/i.test(text)) return "character";
  if (asset.humanoid?.humanoid || (asset.skeleton?.jointCount ?? 0) >= 6) return "character";
  if (asset.animations.length > 0 && asset.boundsMetadata && asset.boundsMetadata.size[1] >= 0.45 && asset.boundsMetadata.size[1] <= 4.5) return "character";
  if (asset.boundsMetadata && Math.max(...asset.boundsMetadata.size) >= 1.5 && asset.animations.length === 0) return "set";
  if (asset.type === "model") return "prop";
  return "unknown";
}

function isAnimationCharacterAnimationReady(asset: AssetReadinessAssetReport): boolean {
  if (asset.animations.length > 0) return true;
  return /\b(segmented rig|segmented-rig|puppet rig|body parts|armature|skinned|skeleton)\b/i.test(animationAssetText(asset));
}

function inferAnimationMouthMode(asset: AssetReadinessAssetReport): AnimationEpisodeMouthReadinessMode {
  const morphNames = asset.morphTargets?.targetNames ?? [];
  if (morphNames.some((name) => /\b(aa|oh|ee|mouth|lip|jaw|viseme|smile|frown|blink|expression)\b/i.test(name))) {
    return "blendshape-lip-sync";
  }
  const text = animationAssetText(asset);
  if (/\b(primitive mouth|mouth card|mouth-card|mouth sprite|face card|viseme card|2d mouth)\b/i.test(text)) {
    return "primitive-mouth-card";
  }
  if (/\b(mouth|lip sync|lipsync|viseme|jaw|talk|speak|facial|face|expression|blendshape|blend shape|morph)\b/i.test(text)) {
    return asset.morphTargets && asset.morphTargets.targetCount > 0 ? "blendshape-lip-sync" : "amplitude-only";
  }
  return "missing-mouth-motion";
}

function isAnimationSetReady(asset: AssetReadinessAssetReport): boolean {
  const size = asset.boundsMetadata?.size ?? asset.bounds;
  if (!size) return false;
  const largest = Math.max(...size);
  return largest >= 1.5 && asset.materials.length > 0;
}

function animationAssetText(asset: AssetReadinessAssetReport): string {
  return [
    asset.id,
    asset.source,
    asset.url,
    asset.outputPath,
    asset.provenance?.sourceUrl ?? "",
    asset.provenance?.sourceFamily ?? "",
    asset.provenance?.author ?? "",
    asset.provenance?.attribution ?? "",
    ...(asset.provenance?.evidence ?? []),
    ...(asset.nodeNames ?? []),
    ...asset.materials,
    ...asset.animations,
  ].join(" ").toLowerCase();
}

function createAssetReadinessIssues(
  profile: AuraAssetReadinessProfile,
  asset: AuraCliAssetEntry
): { readonly failures: readonly string[]; readonly warnings: readonly string[] } {
  if (asset.type !== "model") return { failures: [], warnings: [] };
  const failures: string[] = [];
  const warnings: string[] = [];
  const prefix = `${asset.id}:`;
  const characterLike = isCharacterLikeAsset(asset);

  if (profile === "game" && characterLike) {
    const missing = missingRequiredGameClips(asset.animations);
    if (missing.length > 0) {
      failures.push(`${prefix} missing required game animation clip${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
    }
  }

  const emptyClips = (asset.animationMetadata?.clips ?? []).filter((clip) => clip.channelCount === 0 || clip.samplerCount === 0);
  for (const clip of emptyClips) {
    failures.push(`${prefix} animation clip "${clip.name}" is empty; expected at least one channel and sampler.`);
  }

  const bounds = asset.boundsMetadata;
  if (bounds && bounds.maxDimension > 50) {
    failures.push(`${prefix} oversized bounds detected; largest dimension is ${bounds.maxDimension}m, expected at most 50m for browser game assets.`);
  } else if (bounds && characterLike && bounds.maxDimension > 4) {
    warnings.push(`${prefix} character-sized model is unusually large (${bounds.maxDimension}m); confirm scale before using it in gameplay.`);
  }
  if (bounds && characterLike && !bounds.grounded) {
    warnings.push(`${prefix} bounds are not grounded at the pivot; min.y is ${bounds.min[1]}m.`);
  }

  const orientation = asset.orientation;
  if (profile === "game" && characterLike && orientation?.forwardAxis && !["+z", "z"].includes(orientation.forwardAxis.toLowerCase())) {
    failures.push(`${prefix} wrong facing direction "${orientation.forwardAxis}"; fighting-game characters are expected to face +z before runtime mirroring.`);
  }

  const invisibleMaterials = (asset.materialMetadata ?? []).filter((material) => !material.visible || !material.readable);
  for (const material of invisibleMaterials) {
    failures.push(`${prefix} invisible or unreadable material "${material.name}" detected${material.reasons.length ? ` (${material.reasons.join("; ")})` : ""}.`);
  }

  if (profile === "game" && hasFloatingHairRisk(asset)) {
    failures.push(`${prefix} floating hair risk detected; hair-only geometry must be assembled onto a body/head with assets assemble-character before game validation.`);
  }

  return { failures, warnings };
}

function createFightingCharacterReadinessIssues(
  asset: AuraCliAssetEntry,
  provenance: AuraCliAssetProvenance | undefined,
  licenseVerified: boolean
): { readonly failures: readonly string[]; readonly warnings: readonly string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const prefix = `${asset.id}:`;

  if (asset.type !== "model") {
    failures.push(`${prefix} fighting-character profile requires a model asset, found ${asset.type}.`);
    return { failures, warnings };
  }

  if (asset.format !== "glb" && asset.format !== "gltf") {
    failures.push(`${prefix} fighting-character profile requires GLB/GLTF model input, found ${asset.format}.`);
  }

  if (!licenseVerified) {
    failures.push(`${prefix} fighting-character profile requires verified redistributable license/provenance evidence.`);
  }

  if (!provenance?.sourceUrl && !provenance?.sourceFamily) {
    failures.push(`${prefix} fighting-character profile requires catalog/source provenance for release evidence.`);
  }

  if (asset.animations.length === 0) {
    failures.push(`${prefix} fighting-character profile requires embedded animation clips.`);
  }

  const missing = missingRequiredGameClips(asset.animations);
  if (missing.length > 0) {
    failures.push(`${prefix} fighting-character profile missing required animation clip${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }

  const skeletonJointCount = asset.skeleton?.jointCount ?? 0;
  if (!asset.humanoid?.humanoid && skeletonJointCount < 6) {
    failures.push(`${prefix} fighting-character profile requires humanoid metadata or at least 6 skeleton joints; found ${skeletonJointCount}.`);
  }

  const metadataRisk = findFightingCharacterMetadataRisk(asset);
  if (metadataRisk) {
    failures.push(`${prefix} fighting-character profile rejects ${metadataRisk.kind} metadata "${metadataRisk.term}"; use complete, original, license-safe humanoid fighter assets.`);
  }

  if (!asset.boundsMetadata) {
    failures.push(`${prefix} fighting-character profile requires bounds metadata for scale, ground, and lane checks.`);
  } else {
    const bounds = asset.boundsMetadata;
    const height = bounds.size[1];
    if (bounds.maxDimension > 4.5) {
      failures.push(`${prefix} fighting-character profile bounds too large (${bounds.maxDimension}m max); expected character-scale <= 4.5m.`);
    }
    if (height < 0.75) {
      failures.push(`${prefix} fighting-character profile height ${height}m is too small for a readable humanoid fighter.`);
    }
    if (!bounds.grounded) {
      warnings.push(`${prefix} fighting-character profile bounds are not grounded at pivot; min.y is ${bounds.min[1]}m.`);
    }
  }

  if (asset.materials.length === 0) {
    failures.push(`${prefix} fighting-character profile requires at least one readable material.`);
  }

  if (asset.sizeBytes > 50 * 1024 * 1024) {
    failures.push(`${prefix} fighting-character profile payload is ${asset.sizeBytes} bytes; expected <= 52428800 for browser gameplay.`);
  }

  return { failures, warnings };
}

function isCharacterLikeAsset(asset: AuraCliAssetEntry): boolean {
  if (asset.humanoid?.humanoid) return true;
  return /fighter|player|opponent|enemy|hero|character|avatar|humanoid|npc|body|mara/i.test(asset.id);
}

function isFightingCharacterProfileTarget(asset: AuraCliAssetEntry): boolean {
  if (asset.type !== "model") return false;
  if (/arena|stage|set|environment|skyline|platform|prop|portal|background|floor|city|ring|banner/i.test(asset.id)) return false;
  return isCharacterLikeAsset(asset);
}

function findFightingCharacterMetadataRisk(asset: AuraCliAssetEntry): { readonly kind: "non-character" | "IP-risk"; readonly term: string } | undefined {
  const text = [
    asset.id,
    asset.source,
    asset.provenance?.sourceUrl ?? "",
    asset.provenance?.sourceFamily ?? "",
    asset.provenance?.author ?? "",
    ...(asset.nodeNames ?? []),
    ...asset.materials,
  ].join(" ").toLowerCase();

  const ipRiskTerms = [
    "fan art",
    "fanart",
    "copyright",
    "copyrighted",
    "ripped",
    "pokemon",
    "mario",
    "sonic",
    "naruto",
    "dragon ball",
    "fortnite",
    "marvel",
    "dc comics",
    "star wars",
    "disney",
  ];
  const ipRisk = ipRiskTerms.find((term) => text.includes(term));
  if (ipRisk) return { kind: "IP-risk", term: ipRisk };

  const nonCharacterTerms = [
    "aircraft",
    "airplane",
    "vehicle",
    "building",
    "architecture",
    "environment",
    "terrain",
    "prop",
    "furniture",
    "sculpt",
    "sculpture",
    "statue",
    "bust",
    "figurine",
    "miniature",
    "photogrammetry",
    "pedestal",
    "spider",
    "animal",
    "quadruped",
    "creature",
    "insect",
    "dragon",
    "dinosaur",
    "horse",
    "dog",
    "cat",
    "bird",
    "fish",
  ];
  const nonCharacter = nonCharacterTerms.find((term) => text.includes(term));
  if (nonCharacter) return { kind: "non-character", term: nonCharacter };

  return undefined;
}

function missingRequiredGameClips(animations: readonly string[]): readonly string[] {
  const normalized = animations.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const hasNamed = (patterns: readonly RegExp[]) => normalized.some((name) => patterns.some((pattern) => pattern.test(name)));
  const missing: string[] = [];
  if (!hasNamed([/idle/, /stand/])) missing.push("idle");
  if (!hasNamed([/walk/, /locomotion/, /move/])) missing.push("walk");
  if (!hasNamed([/lightpunch/, /lightattack/, /light/, /jab/, /punch/, /attack/, /melee/, /hook/, /sword/, /slash/, /strike/])) missing.push("lightPunch");
  return missing;
}

function hasFloatingHairRisk(asset: AuraCliAssetEntry): boolean {
  const names = [asset.id, ...(asset.nodeNames ?? [])].join(" ").toLowerCase();
  if (!names.includes("hair")) return false;
  const hasBodyAnchor = /body|torso|spine|chest|head|neck|skull|face|hips|pelvis/.test(names);
  return !hasBodyAnchor;
}

function pushUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function createDuplicateHashWarnings(
  manifest: AuraCliAssetManifest,
  externalProvenance: ReadonlyMap<string, AuraCliAssetProvenance>
): readonly string[] {
  const byHash = new Map<string, AuraCliAssetEntry[]>();
  for (const asset of manifest.assets) {
    const existing = byHash.get(asset.hash) ?? [];
    existing.push(asset);
    byHash.set(asset.hash, existing);
  }
  const warnings: string[] = [];
  for (const [hash, assets] of byHash) {
    if (assets.length < 2) continue;
    const unexplained = assets.filter((asset) => !hasDuplicateHashAllowlist(resolveAssetProvenance(asset, externalProvenance)));
    if (unexplained.length > 0) {
      warnings.push(`duplicate asset hash ${hash} used by ${assets.map((asset) => `"${asset.id}"`).join(", ")} without duplicate-ok provenance evidence.`);
    }
  }
  return warnings;
}

function hasDuplicateHashAllowlist(provenance: AuraCliAssetProvenance | undefined): boolean {
  const text = [
    provenance?.sourceFamily,
    provenance?.sourcePath,
    provenance?.sourcePage,
    provenance?.downloadUrl,
    provenance?.sourceUrl,
    provenance?.license,
    provenance?.licenseName,
    provenance?.licenseUrl,
    provenance?.licenseRaw,
    provenance?.author,
    provenance?.attribution,
    ...(provenance?.evidence ?? [])
  ].filter(Boolean).join(" ");
  return /\b(?:duplicate-ok|intentional-duplicate|duplicate allowed|shared source allowed)\b/i.test(text);
}

function createTempProvenanceWarning(asset: AuraCliAssetEntry, provenance: AuraCliAssetProvenance | undefined): string | undefined {
  if (!provenance) return undefined;
  if (hasLocalOnlyProvenanceMarker(provenance)) return undefined;
  const values = [asset.source, provenance.sourcePath, provenance.sourcePage, provenance.downloadUrl, provenance.sourceUrl].filter((value): value is string => Boolean(value));
  if (!values.some(isTempProvenancePath)) return undefined;
  return `${asset.id}: temp-path provenance is not durable (${values.find(isTempProvenancePath)}). Re-add with durable source/license evidence or mark local-only explicitly.`;
}

function isTempProvenancePath(value: string): boolean {
  return /(?:^|[/\\])(?:var[/\\]folders|tmp|temp|private[/\\]var[/\\]folders)(?:[/\\]|$)/i.test(value) ||
    /(?:^|[/\\])T[/\\]aura3d-resolve-|aura3d-resolve-/i.test(value);
}

function hasLocalOnlyProvenanceMarker(provenance: AuraCliAssetProvenance): boolean {
  const text = [
    provenance.sourceFamily,
    provenance.license,
    provenance.attribution,
    ...(provenance.evidence ?? [])
  ].filter(Boolean).join(" ");
  return /\blocal-only\b/i.test(text);
}

function resolvePublicArtifactPath(projectDir: string, manifest: AuraCliAssetManifest, url: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return undefined;
  if (url.startsWith(manifest.assetBasePath)) {
    return resolve(projectDir, manifest.outputDir, url.slice(manifest.assetBasePath.length));
  }
  return resolve(projectDir, url.replace(/^\//, "public/"));
}

function defaultAttachPoint(slot: string): string {
  const normalized = slot.toLowerCase();
  if (normalized.includes("hair") || normalized.includes("hat") || normalized.includes("face")) return "head";
  if (normalized.includes("hand") || normalized.includes("weapon") || normalized.includes("prop")) return "rightHand";
  if (normalized.includes("shoe") || normalized.includes("boot")) return "feet";
  if (normalized.includes("cape") || normalized.includes("back")) return "spine";
  return "root";
}

interface AssetInspection {
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly materials: readonly string[];
  readonly materialMetadata: readonly AuraCliMaterialInspection[];
  readonly animations: readonly string[];
  readonly animation: AuraCliAnimationInspection;
  readonly humanoid: AuraCliHumanoidInspection;
  readonly skeleton: AuraCliSkeletonInspection;
  readonly morphTargets: AuraCliMorphTargetInspection;
  readonly hierarchy: AuraCliSceneHierarchyInspection;
  readonly provenance?: Partial<AuraCliAssetProvenance>;
  readonly textures: readonly string[];
  readonly orientation: AuraCliOrientationInspection;
  readonly nodeNames: readonly string[];
  readonly dependencies: readonly string[];
}

function inspectAssetFile(path: string, format: string): AssetInspection {
  if (format === "gltf") return inspectGltf(JSON.parse(readFileSync(path, "utf8")) as GltfJson, dirname(path));
  if (format === "glb") return inspectGlb(readFileSync(path), dirname(path));
  return {
    materials: [],
    materialMetadata: [],
    animations: [],
    animation: emptyAnimationInspection(),
    humanoid: unknownHumanoidInspection("Humanoid detection is only available for GLB/glTF model assets."),
    skeleton: emptySkeletonInspection("Skeleton detection is only available for GLB/glTF model assets."),
    morphTargets: emptyMorphTargetInspection("Morph target detection is only available for GLB/glTF model assets."),
    hierarchy: emptyHierarchyInspection("Scene hierarchy inspection is only available for GLB/glTF model assets."),
    textures: [],
    orientation: unknownOrientationInspection(),
    nodeNames: [],
    dependencies: [],
    bounds: undefined
  };
}

interface GltfJson {
  readonly asset?: { readonly extras?: unknown };
  readonly accessors?: readonly { readonly min?: readonly number[]; readonly max?: readonly number[] }[];
  readonly materials?: readonly {
    readonly name?: string;
    readonly alphaMode?: string;
    readonly alphaCutoff?: number;
    readonly pbrMetallicRoughness?: { readonly baseColorFactor?: readonly number[] };
    readonly extras?: unknown;
  }[];
  readonly animations?: readonly {
    readonly name?: string;
    readonly channels?: readonly {
      readonly sampler?: number;
      readonly target?: {
        readonly node?: number;
        readonly path?: string;
      };
    }[];
    readonly samplers?: readonly unknown[];
  }[];
  readonly images?: readonly { readonly uri?: string; readonly name?: string }[];
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly scene?: number;
  readonly scenes?: readonly { readonly name?: string; readonly nodes?: readonly number[] }[];
  readonly nodes?: readonly {
    readonly name?: string;
    readonly mesh?: number;
    readonly skin?: number;
    readonly children?: readonly number[];
    readonly extras?: unknown;
    readonly matrix?: readonly number[];
    readonly translation?: readonly number[];
    readonly rotation?: readonly number[];
    readonly scale?: readonly number[];
  }[];
  readonly skins?: readonly { readonly name?: string; readonly joints?: readonly number[]; readonly skeleton?: number }[];
  readonly meshes?: readonly {
    readonly name?: string;
    readonly weights?: readonly number[];
    readonly extras?: unknown;
    readonly primitives?: readonly {
      readonly targets?: readonly unknown[];
      readonly extras?: unknown;
      readonly attributes?: Readonly<Record<string, number>>;
    }[];
  }[];
}

function inspectGlb(buffer: Buffer, baseDir?: string): AssetInspection {
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb).");
  const length = buffer.readUInt32LE(8);
  if (length > buffer.length) throw new Error("Invalid GLB length. Suggested fix: run assets validate on the original export.");
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString("utf8", 16, 20);
  if (chunkType !== "JSON") throw new Error("Invalid GLB JSON chunk. Suggested fix: re-export the GLB.");
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + chunkLength).trim()) as GltfJson;
  return inspectGltf(json, baseDir);
}

function inspectGltf(json: GltfJson, baseDir?: string): AssetInspection {
  const dependencies = [
    ...(json.images ?? []).map((image) => image.uri).filter(isExternalUri),
    ...(json.buffers ?? []).map((buffer) => buffer.uri).filter(isExternalUri)
  ];
  if (baseDir) {
    const missing = dependencies.filter((dependency) => !existsSync(resolve(baseDir, dependency)));
    if (missing.length > 0) {
      throw new Error(`Aura3D assets add failed: referenced asset file missing: ${missing.join(", ")}. Suggested fix: keep external .bin and texture files beside the .gltf or export as .glb.`);
    }
  }
  const boundsMetadata = extractBoundsDetails(json);
  return {
    bounds: boundsMetadata?.size,
    boundsMetadata,
    materials: (json.materials ?? []).map((material, index) => material.name ?? `material-${index}`),
    materialMetadata: inspectGltfMaterials(json),
    animations: (json.animations ?? []).map((animation, index) => animation.name ?? `clip-${index}`),
    animation: inspectGltfAnimations(json),
    humanoid: inspectGltfHumanoid(json),
    skeleton: inspectGltfSkeleton(json),
    morphTargets: inspectGltfMorphTargets(json),
    hierarchy: inspectGltfHierarchy(json),
    provenance: inspectGltfProvenance(json),
    textures: (json.images ?? []).map((image, index) => image.uri ?? image.name ?? `image-${index}`),
    orientation: inspectGltfOrientation(json),
    nodeNames: (json.nodes ?? []).map((node, index) => node.name ?? `node-${index}`),
    dependencies
  };
}

function emptyAnimationInspection(): AuraCliAnimationInspection {
  return {
    clipCount: 0,
    clips: [],
    messages: ["No embedded animation clips detected."]
  };
}

function inspectGltfAnimations(json: GltfJson): AuraCliAnimationInspection {
  const clips = (json.animations ?? []).map((animation, index): AuraCliAnimationClipInspection => {
    const channels = animation.channels ?? [];
    const targetPaths = uniqueStrings(channels.map((channel) => channel.target?.path).filter(isString));
    const targetNodes = uniqueStrings(channels.map((channel) => {
      const nodeIndex = channel.target?.node;
      return typeof nodeIndex === "number" ? json.nodes?.[nodeIndex]?.name ?? `node-${nodeIndex}` : undefined;
    }).filter(isString));
    return {
      index,
      name: animation.name ?? `clip-${index}`,
      channelCount: channels.length,
      samplerCount: animation.samplers?.length ?? 0,
      targetPaths,
      targetNodes
    };
  });
  return {
    clipCount: clips.length,
    clips,
    messages: clips.length === 0
      ? ["No embedded animation clips detected."]
      : [`Detected ${clips.length} embedded animation clip${clips.length === 1 ? "" : "s"}.`]
  };
}

function inspectGltfHumanoid(json: GltfJson): AuraCliHumanoidInspection {
  const skinCount = json.skins?.length ?? 0;
  const jointIndexes = uniqueNumbers((json.skins ?? []).flatMap((skin) => skin.joints ?? []));
  const jointNames = uniqueStrings(jointIndexes.map((index) => json.nodes?.[index]?.name ?? `joint-${index}`));
  const nodeNames = uniqueStrings((json.nodes ?? []).map((node, index) => node.name ?? `node-${index}`));
  const candidates = jointNames.length > 0 ? jointNames : nodeNames;
  const requiredBones = ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;
  const matchedBones = requiredBones.filter((bone) => candidates.some((name) => matchesHumanoidBone(name, bone)));
  const missingBones = requiredBones.filter((bone) => !matchedBones.includes(bone));
  const hasSkin = jointIndexes.length > 0;
  const hasTorso = matchedBones.includes("hips") && matchedBones.includes("spine") && matchedBones.includes("head");
  const hasArms = matchedBones.includes("leftArm") && matchedBones.includes("rightArm");
  const hasLegs = matchedBones.includes("leftLeg") && matchedBones.includes("rightLeg");
  const humanoid = (hasSkin && hasTorso && hasArms && hasLegs) || (!hasSkin && hasTorso && matchedBones.length >= 5);
  const status: AuraCliHumanoidStatus = humanoid
    ? "humanoid"
    : hasSkin || matchedBones.length > 0
      ? "unknown"
      : "non-humanoid";
  const confidence: AuraCliHumanoidConfidence = humanoid && hasSkin
    ? "high"
    : humanoid || (hasSkin && matchedBones.length >= 5)
      ? "medium"
      : "low";
  return {
    humanoid,
    status,
    confidence,
    skinCount,
    jointCount: jointIndexes.length,
    matchedBones,
    missingBones,
    messages: humanoid
      ? [`Humanoid signals detected from ${hasSkin ? "skinned joints" : "node names"}.`]
      : status === "unknown"
        ? [`Humanoid status is unknown; missing bone groups: ${missingBones.join(", ")}.`]
        : ["No humanoid skeleton signals detected."]
  };
}

function inspectGltfSkeleton(json: GltfJson): AuraCliSkeletonInspection {
  const skins = (json.skins ?? []).map((skin, index): AuraCliSkeletonSkinInspection => {
    const joints = (skin.joints ?? []).map((jointIndex) => json.nodes?.[jointIndex]?.name ?? `joint-${jointIndex}`);
    const skeletonIndex = skin.skeleton;
    return {
      index,
      name: skin.name ?? `skin-${index}`,
      jointCount: joints.length,
      joints,
      ...(typeof skeletonIndex === "number" ? { skeleton: json.nodes?.[skeletonIndex]?.name ?? `node-${skeletonIndex}` } : {})
    };
  });
  const jointCount = uniqueStrings(skins.flatMap((skin) => skin.joints)).length;
  return {
    skinCount: skins.length,
    jointCount,
    skins,
    messages: skins.length === 0
      ? ["No skin/skeleton metadata detected."]
      : [`Detected ${skins.length} skin${skins.length === 1 ? "" : "s"} with ${jointCount} unique joint${jointCount === 1 ? "" : "s"}.`]
  };
}

function emptySkeletonInspection(message: string): AuraCliSkeletonInspection {
  return {
    skinCount: 0,
    jointCount: 0,
    skins: [],
    messages: [message]
  };
}

function inspectGltfMorphTargets(json: GltfJson): AuraCliMorphTargetInspection {
  const meshes = (json.meshes ?? []).map((mesh, index): AuraCliMorphTargetMeshInspection | undefined => {
    const meshExtras = objectValue(mesh.extras);
    const namedTargets = stringArrayValue(meshExtras?.targetNames ?? meshExtras?.morphTargetNames);
    const targetCount = Math.max(
      namedTargets.length,
      mesh.weights?.length ?? 0,
      ...(mesh.primitives ?? []).map((primitive) => primitive.targets?.length ?? 0)
    );
    if (targetCount === 0) return undefined;
    const targetNames = targetCount > 0
      ? Array.from({ length: targetCount }, (_, targetIndex) => namedTargets[targetIndex] ?? `target-${targetIndex}`)
      : [];
    return {
      index,
      name: mesh.name ?? `mesh-${index}`,
      targetNames
    };
  }).filter((mesh): mesh is AuraCliMorphTargetMeshInspection => Boolean(mesh));
  const targetNames = uniqueStrings(meshes.flatMap((mesh) => mesh.targetNames));
  return {
    targetCount: targetNames.length,
    targetNames,
    meshes,
    messages: targetNames.length === 0
      ? ["No morph target metadata detected."]
      : [`Detected ${targetNames.length} morph target${targetNames.length === 1 ? "" : "s"}.`]
  };
}

function emptyMorphTargetInspection(message: string): AuraCliMorphTargetInspection {
  return {
    targetCount: 0,
    targetNames: [],
    meshes: [],
    messages: [message]
  };
}

function emptyHierarchyInspection(message: string): AuraCliSceneHierarchyInspection {
  return {
    nodeCount: 0,
    meshCount: 0,
    materialCount: 0,
    textureCount: 0,
    animationClipCount: 0,
    skinCount: 0,
    morphTargetCount: 0,
    rootNodeNames: [],
    maxDepth: 0,
    messages: [message]
  };
}

function inspectGltfHierarchy(json: GltfJson): AuraCliSceneHierarchyInspection {
  const nodes = json.nodes ?? [];
  const childIndexes = new Set<number>();
  for (const node of nodes) {
    for (const child of node.children ?? []) {
      if (child >= 0 && child < nodes.length) childIndexes.add(child);
    }
  }
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes?.filter((nodeIndex) => nodeIndex >= 0 && nodeIndex < nodes.length);
  const rootIndexes = sceneRoots && sceneRoots.length > 0
    ? sceneRoots
    : nodes.map((_, index) => index).filter((index) => !childIndexes.has(index));
  const rootNodeNames = rootIndexes.map((nodeIndex) => nodes[nodeIndex]?.name ?? `node-${nodeIndex}`);
  return {
    nodeCount: nodes.length,
    meshCount: json.meshes?.length ?? 0,
    materialCount: json.materials?.length ?? 0,
    textureCount: json.images?.length ?? 0,
    animationClipCount: json.animations?.length ?? 0,
    skinCount: json.skins?.length ?? 0,
    morphTargetCount: inspectGltfMorphTargets(json).targetCount,
    rootNodeNames,
    maxDepth: rootIndexes.reduce((depth, nodeIndex) => Math.max(depth, measureGltfNodeDepth(nodes, nodeIndex, new Set<number>())), 0),
    messages: nodes.length === 0
      ? ["No glTF scene nodes detected."]
      : [`Detected ${nodes.length} node${nodes.length === 1 ? "" : "s"} across ${rootIndexes.length} root${rootIndexes.length === 1 ? "" : "s"}.`]
  };
}

function measureGltfNodeDepth(nodes: NonNullable<GltfJson["nodes"]>, nodeIndex: number, visited: Set<number>): number {
  if (visited.has(nodeIndex)) return 0;
  visited.add(nodeIndex);
  const children = nodes[nodeIndex]?.children ?? [];
  if (children.length === 0) return 1;
  return 1 + children.reduce((depth, childIndex) => {
    if (childIndex < 0 || childIndex >= nodes.length) return depth;
    return Math.max(depth, measureGltfNodeDepth(nodes, childIndex, new Set(visited)));
  }, 0);
}

function inspectGltfProvenance(json: GltfJson): Partial<AuraCliAssetProvenance> | undefined {
  const assetExtras = objectValue(json.asset?.extras);
  const auraExtras = objectValue(assetExtras?.aura3d) ?? assetExtras;
  const provenance = objectValue(auraExtras?.provenance ?? auraExtras?.license ?? auraExtras?.source);
  const sourcePage = stringValue(provenance?.sourcePage ?? provenance?.page ?? auraExtras?.sourcePage);
  const downloadUrl = stringValue(provenance?.downloadUrl ?? provenance?.download ?? auraExtras?.downloadUrl);
  const sourceUrl = stringValue(provenance?.sourceUrl ?? provenance?.url ?? auraExtras?.sourceUrl);
  const license = stringValue(provenance?.license ?? provenance?.spdx ?? auraExtras?.license);
  const licenseName = stringValue(provenance?.licenseName ?? provenance?.licenseTitle ?? auraExtras?.licenseName);
  const licenseUrl = stringValue(provenance?.licenseUrl ?? provenance?.licensePage ?? auraExtras?.licenseUrl);
  const licenseRaw = stringValue(provenance?.licenseRaw ?? provenance?.rawLicense ?? auraExtras?.licenseRaw);
  const author = stringValue(provenance?.author ?? provenance?.creator ?? auraExtras?.author);
  const sourceFamily = stringValue(provenance?.sourceFamily ?? provenance?.source ?? auraExtras?.sourceFamily);
  const attribution = stringValue(provenance?.attribution ?? auraExtras?.attribution);
  const evidence = stringArrayValue(provenance?.evidence ?? auraExtras?.evidence);
  if (!sourcePage && !downloadUrl && !sourceUrl && !license && !licenseName && !licenseUrl && !licenseRaw && !author && !sourceFamily && !attribution && evidence.length === 0) return undefined;
  return {
    ...(sourcePage ? { sourcePage } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(license ? { license } : {}),
    ...(licenseName ? { licenseName } : {}),
    ...(licenseUrl ? { licenseUrl } : {}),
    ...(licenseRaw ? { licenseRaw } : {}),
    ...(author ? { author } : {}),
    ...(sourceFamily ? { sourceFamily } : {}),
    ...(attribution ? { attribution } : {}),
    ...(evidence.length > 0 ? { evidence } : {})
  };
}

function unknownHumanoidInspection(message: string): AuraCliHumanoidInspection {
  return {
    humanoid: false,
    status: "unknown",
    confidence: "low",
    skinCount: 0,
    jointCount: 0,
    matchedBones: [],
    missingBones: ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"],
    messages: [message]
  };
}

function matchesHumanoidBone(name: string, bone: "hips" | "spine" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg"): boolean {
  const raw = name.toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, "");
  const left = compact.includes("left") || /(^|[^a-z0-9])l([^a-z0-9]|$)/.test(raw) || /[^a-z0-9]l$/.test(raw);
  const right = compact.includes("right") || /(^|[^a-z0-9])r([^a-z0-9]|$)/.test(raw) || /[^a-z0-9]r$/.test(raw);
  const arm = compact.includes("arm") || compact.includes("forearm") || compact.includes("shoulder") || compact.includes("hand");
  const leg = compact.includes("leg") || compact.includes("thigh") || compact.includes("foot") || compact.includes("toe");
  if (bone === "hips") return compact.includes("hip") || compact.includes("pelvis");
  if (bone === "spine") return compact.includes("spine") || compact.includes("chest") || compact.includes("torso");
  if (bone === "head") return compact.includes("head") || compact.includes("neck");
  if (bone === "leftArm") return left && arm;
  if (bone === "rightArm") return right && arm;
  if (bone === "leftLeg") return left && leg;
  return right && leg;
}

function isExternalUri(uri: string | undefined): uri is string {
  return typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:");
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values)];
}

type Mat4Tuple = readonly number[];

function positionAccessors(json: GltfJson): readonly NonNullable<GltfJson["accessors"]>[number][] {
  const accessors = json.accessors ?? [];
  const indices = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const position = primitive.attributes?.POSITION;
      if (typeof position === "number") indices.add(position);
    }
  }
  // No mesh table: fall back to every accessor rather than reporting nothing.
  if (indices.size === 0) return accessors.filter((accessor) => accessor.min && accessor.max);
  return [...indices].map((index) => accessors[index]).filter((accessor): accessor is NonNullable<typeof accessor> => Boolean(accessor));
}

function extractGltfSceneBounds(json: GltfJson): { readonly min: [number, number, number]; readonly max: [number, number, number] } | undefined {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  if (nodes.length === 0 || meshes.length === 0) return undefined;

  let min: [number, number, number] | undefined;
  let max: [number, number, number] | undefined;

  const visit = (nodeIndex: number, parentMatrix: Mat4Tuple, seen: ReadonlySet<number>): void => {
    if (seen.has(nodeIndex)) return;
    const node = nodes[nodeIndex];
    if (!node) return;
    const worldMatrix = multiplyGltfMat4(parentMatrix, localGltfNodeMatrix(node));
    if (typeof node.mesh === "number") {
      for (const primitive of meshes[node.mesh]?.primitives ?? []) {
        const positionIndex = primitive.attributes?.POSITION;
        if (typeof positionIndex !== "number") continue;
        const accessor = accessors[positionIndex];
        if (!accessor?.min || !accessor?.max || accessor.min.length < 3 || accessor.max.length < 3) continue;
        // Transform all eight corners: transforming only min/max is wrong under
        // rotation, because the transformed min is not necessarily the new minimum.
        for (const corner of boxCorners(accessor.min, accessor.max)) {
          const world = transformGltfPoint(worldMatrix, corner);
          min = min ? [Math.min(min[0], world[0]), Math.min(min[1], world[1]), Math.min(min[2], world[2])] : [...world];
          max = max ? [Math.max(max[0], world[0]), Math.max(max[1], world[1]), Math.max(max[2], world[2])] : [...world];
        }
      }
    }
    const nextSeen = new Set(seen);
    nextSeen.add(nodeIndex);
    for (const child of node.children ?? []) visit(child, worldMatrix, nextSeen);
  };

  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes;
  const roots = sceneRoots && sceneRoots.length > 0 ? sceneRoots : gltfImplicitRootNodes(nodes);
  for (const root of roots) visit(root, identityGltfMat4(), new Set());

  return min && max ? { min, max } : undefined;
}

function gltfImplicitRootNodes(nodes: NonNullable<GltfJson["nodes"]>): readonly number[] {
  const children = new Set<number>();
  for (const node of nodes) {
    for (const child of node.children ?? []) children.add(child);
  }
  const roots = nodes.map((_node, index) => index).filter((index) => !children.has(index));
  return roots.length > 0 ? roots : nodes.map((_node, index) => index);
}

function boxCorners(min: readonly number[], max: readonly number[]): readonly (readonly [number, number, number])[] {
  const xs = [min[0] ?? 0, max[0] ?? 0];
  const ys = [min[1] ?? 0, max[1] ?? 0];
  const zs = [min[2] ?? 0, max[2] ?? 0];
  const corners: (readonly [number, number, number])[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) corners.push([x, y, z]);
  return corners;
}

function identityGltfMat4(): Mat4Tuple {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Column-major, matching the glTF spec. */
function localGltfNodeMatrix(node: NonNullable<GltfJson["nodes"]>[number]): Mat4Tuple {
  if (node.matrix && node.matrix.length === 16) return node.matrix;
  const translation = node.translation ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  const rotationMatrix = gltfQuaternionMatrix(rotation);
  const scaled = rotationMatrix.map((value, index) => {
    const column = Math.floor(index / 4);
    return column < 3 ? value * (scale[column] ?? 1) : value;
  });
  return [
    scaled[0] ?? 1, scaled[1] ?? 0, scaled[2] ?? 0, 0,
    scaled[4] ?? 0, scaled[5] ?? 1, scaled[6] ?? 0, 0,
    scaled[8] ?? 0, scaled[9] ?? 0, scaled[10] ?? 1, 0,
    translation[0] ?? 0, translation[1] ?? 0, translation[2] ?? 0, 1
  ];
}

function gltfQuaternionMatrix(quaternion: readonly number[]): Mat4Tuple {
  const length = Math.hypot(quaternion[0] ?? 0, quaternion[1] ?? 0, quaternion[2] ?? 0, quaternion[3] ?? 1) || 1;
  const x = (quaternion[0] ?? 0) / length;
  const y = (quaternion[1] ?? 0) / length;
  const z = (quaternion[2] ?? 0) / length;
  const w = (quaternion[3] ?? 1) / length;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1
  ];
}

function multiplyGltfMat4(left: Mat4Tuple, right: Mat4Tuple): Mat4Tuple {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        (left[row] ?? 0) * (right[column * 4] ?? 0)
        + (left[4 + row] ?? 0) * (right[column * 4 + 1] ?? 0)
        + (left[8 + row] ?? 0) * (right[column * 4 + 2] ?? 0)
        + (left[12 + row] ?? 0) * (right[column * 4 + 3] ?? 0);
    }
  }
  return out;
}

function transformGltfPoint(matrix: Mat4Tuple, point: readonly [number, number, number]): [number, number, number] {
  return [
    (matrix[0] ?? 0) * point[0] + (matrix[4] ?? 0) * point[1] + (matrix[8] ?? 0) * point[2] + (matrix[12] ?? 0),
    (matrix[1] ?? 0) * point[0] + (matrix[5] ?? 0) * point[1] + (matrix[9] ?? 0) * point[2] + (matrix[13] ?? 0),
    (matrix[2] ?? 0) * point[0] + (matrix[6] ?? 0) * point[1] + (matrix[10] ?? 0) * point[2] + (matrix[14] ?? 0)
  ];
}

/**
 * Scene-space bounds of a glTF asset.
 *
 * This walks the scene graph and transforms each mesh primitive's POSITION accessor
 * bounds into scene space before unioning them.
 *
 * The previous implementation unioned the raw `min`/`max` of *every* accessor in
 * mesh-local space. That was wrong twice over: it mixed in non-POSITION accessors
 * (normals, tangents, UVs, joint weights) whose ranges are unrelated to geometry
 * extent, and it ignored node transforms entirely. For a GLB whose meshes carry
 * non-identity node transforms the result did not describe the asset at all — for the
 * `robotcand` fixture it reported an extent of [30.3, 24.1, 15.3] against a real
 * scene-space extent of [15.9, 25.1, 10.0], a non-uniform ~1.9x/0.96x/1.5x error.
 *
 * Consumers rely on these bounds for framing and sizing (`camera.frameAsset`,
 * `targetHeight`/`targetLength`/`targetMaxDimension`), so a wrong value silently
 * mis-sizes or clips models.
 */
function extractBoundsDetails(json: GltfJson): AuraCliAssetBoundsInspection | undefined {
  const sceneBounds = extractGltfSceneBounds(json);
  let min = sceneBounds?.min;
  let max = sceneBounds?.max;
  if (!min || !max) {
    // Fall back to POSITION accessors in mesh-local space. Still better than mixing
    // in unrelated accessors, and it keeps assets without a usable scene graph working.
    for (const accessor of positionAccessors(json)) {
      if (!accessor.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) continue;
      min = min ? [Math.min(min[0], accessor.min[0]), Math.min(min[1], accessor.min[1]), Math.min(min[2], accessor.min[2])] : [accessor.min[0], accessor.min[1], accessor.min[2]];
      max = max ? [Math.max(max[0], accessor.max[0]), Math.max(max[1], accessor.max[1]), Math.max(max[2], accessor.max[2])] : [accessor.max[0], accessor.max[1], accessor.max[2]];
    }
  }
  if (!min || !max) return undefined;
  const size = [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])] as const;
  const center = [round((min[0] + max[0]) / 2), round((min[1] + max[1]) / 2), round((min[2] + max[2]) / 2)] as const;
  const roundedMin = [round(min[0]), round(min[1]), round(min[2])] as const;
  const roundedMax = [round(max[0]), round(max[1]), round(max[2])] as const;
  return {
    min: roundedMin,
    max: roundedMax,
    size,
    center,
    maxDimension: Math.max(...size),
    grounded: Math.abs(roundedMin[1]) <= 0.08
  };
}

function inspectGltfMaterials(json: GltfJson): readonly AuraCliMaterialInspection[] {
  return (json.materials ?? []).map((material, index) => {
    const name = material.name ?? `material-${index}`;
    const extras = objectValue(material.extras);
    const explicitVisible = booleanValue(extras?.visible);
    const explicitReadable = booleanValue(extras?.readable);
    const opacity = round(numberValue(material.pbrMetallicRoughness?.baseColorFactor?.[3]) ?? 1);
    const alphaMode = material.alphaMode;
    const alphaCutoff = numberValue(material.alphaCutoff);
    const reasons: string[] = [];
    if (opacity <= 0) reasons.push("baseColorFactor alpha is 0");
    if (alphaMode === "MASK" && (alphaCutoff ?? 0.5) >= 1) reasons.push("alpha mask cutoff hides fully transparent surfaces");
    if (explicitVisible === false) reasons.push("material extras mark visible=false");
    if (explicitReadable === false) reasons.push("material extras mark readable=false");
    const visible = explicitVisible ?? (opacity > 0 && !(alphaMode === "MASK" && (alphaCutoff ?? 0.5) >= 1));
    const readable = explicitReadable ?? visible;
    return {
      name,
      visible,
      readable,
      opacity,
      ...(alphaMode ? { alphaMode } : {}),
      reasons
    };
  });
}

function inspectGltfOrientation(json: GltfJson): AuraCliOrientationInspection {
  const assetExtras = objectValue(json.asset?.extras);
  const auraExtras = objectValue(assetExtras?.aura3d) ?? assetExtras;
  const orientation = objectValue(auraExtras?.orientation) ?? auraExtras;
  const forwardAxis = stringValue(orientation?.forwardAxis ?? orientation?.forward ?? orientation?.facing);
  const upAxis = stringValue(orientation?.upAxis ?? orientation?.up);
  if (!forwardAxis && !upAxis) return unknownOrientationInspection();
  return {
    source: "gltf-extras",
    ...(forwardAxis ? { forwardAxis } : {}),
    ...(upAxis ? { upAxis } : {}),
    messages: [`Orientation metadata detected${forwardAxis ? ` with forwardAxis=${forwardAxis}` : ""}${upAxis ? ` and upAxis=${upAxis}` : ""}.`]
  };
}

function unknownOrientationInspection(): AuraCliOrientationInspection {
  return {
    source: "unknown",
    messages: ["No orientation metadata detected; facing direction cannot be proven."]
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => stringValue(entry)).filter((entry): entry is string => Boolean(entry));
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readPositiveInteger(record: Record<string, unknown> | undefined, field: string, failures: string[]): number {
  const value = record?.[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    failures.push(`missing or invalid ${field}`);
    return 0;
  }
  return value;
}

function readNonNegativeInteger(record: Record<string, unknown> | undefined, field: string, failures: string[], prefix: string): number {
  const value = record?.[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
    failures.push(`missing or invalid ${prefix}.${field}`);
    return 0;
  }
  return value;
}

function readPositiveIntegerWithPrefix(record: Record<string, unknown> | undefined, field: string, failures: string[], prefix: string): number {
  const value = record?.[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    failures.push(`missing or invalid ${prefix}.${field}`);
    return 0;
  }
  return value;
}

function readOptionalForegroundBounds(record: Record<string, unknown> | undefined, failures: string[]): AuraCliRenderedProbeForegroundBounds | undefined {
  if (!record || !("foregroundBounds" in record)) return undefined;
  const foregroundBounds = objectValue(record.foregroundBounds);
  if (!foregroundBounds) {
    failures.push("foregroundBounds must be an object when present");
    return undefined;
  }
  const x = readNonNegativeInteger(foregroundBounds, "x", failures, "foregroundBounds");
  const y = readNonNegativeInteger(foregroundBounds, "y", failures, "foregroundBounds");
  const width = readPositiveIntegerWithPrefix(foregroundBounds, "width", failures, "foregroundBounds");
  const height = readPositiveIntegerWithPrefix(foregroundBounds, "height", failures, "foregroundBounds");
  if (failures.some((failure) => failure.includes("foregroundBounds"))) return undefined;
  return { x, y, width, height };
}

function createAssetWarnings(path: string, inspection: AssetInspection): readonly string[] {
  const warnings: string[] = [];
  const size = statSync(path).size;
  if (size > 25 * 1024 * 1024) warnings.push("asset exceeds 25 MB; consider compression before deployment");
  if (!inspection.bounds) warnings.push("bounds could not be extracted");
  if (inspection.textures.length === 0 && ["glb", "gltf"].includes(extname(path).slice(1).toLowerCase())) warnings.push("no texture references detected");
  if (inspection.orientation.source === "unknown" && ["glb", "gltf"].includes(extname(path).slice(1).toLowerCase())) warnings.push("orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis");
  if (inspection.materialMetadata.some((material) => !material.visible || !material.readable)) warnings.push("one or more materials are invisible or unreadable");
  return warnings;
}

function createAssetProvenance(
  projectDir: string,
  sourcePath: string,
  options: Pick<AddAssetOptions, "sourcePage" | "downloadUrl" | "sourceUrl" | "license" | "licenseName" | "licenseUrl" | "licenseRaw" | "author" | "sourceFamily" | "attribution" | "sha256" | "provenanceEvidence" | "retrievedAt" | "resolveCandidate">,
  detected?: Partial<AuraCliAssetProvenance>,
  /**
   * Durable in-project path the asset was staged to.
   *
   * Used instead of `sourcePath` when the source is outside the project. `assets resolve` downloads
   * into a `mkdtempSync` directory that is removed once the command returns, so recording that path
   * produced provenance pointing at a directory that no longer exists -- and because the temp segment
   * is random, two byte-identical resolves generated different typed output, defeating content-hash
   * comparison of generated artifacts.
   */
  durableOutputPath?: string
): AuraCliAssetProvenance {
  const evidence = [...new Set([...(options.provenanceEvidence ?? []), ...(detected?.evidence ?? [])].map((entry) => entry.trim()).filter(Boolean))];
  return {
    sourcePath: normalizeRelativePath(
      relative(projectDir, sourcePath).startsWith("..") && durableOutputPath
        ? durableOutputPath
        : relative(projectDir, sourcePath)
    ),
    ...(options.sourcePage ?? detected?.sourcePage ? { sourcePage: options.sourcePage ?? detected?.sourcePage } : {}),
    ...(options.downloadUrl ?? detected?.downloadUrl ? { downloadUrl: options.downloadUrl ?? detected?.downloadUrl } : {}),
    ...(options.sourceUrl ?? detected?.sourceUrl ? { sourceUrl: options.sourceUrl ?? detected?.sourceUrl } : {}),
    ...(options.license ?? detected?.license ? { license: options.license ?? detected?.license } : {}),
    ...(options.licenseName ?? detected?.licenseName ? { licenseName: options.licenseName ?? detected?.licenseName } : {}),
    ...(options.licenseUrl ?? detected?.licenseUrl ? { licenseUrl: options.licenseUrl ?? detected?.licenseUrl } : {}),
    ...(options.licenseRaw ?? detected?.licenseRaw ? { licenseRaw: options.licenseRaw ?? detected?.licenseRaw } : {}),
    ...(options.author ?? detected?.author ? { author: options.author ?? detected?.author } : {}),
    ...(options.sourceFamily ?? detected?.sourceFamily ? { sourceFamily: options.sourceFamily ?? detected?.sourceFamily } : {}),
    ...(options.attribution ?? detected?.attribution ? { attribution: options.attribution ?? detected?.attribution } : {}),
    ...(options.sha256 ?? detected?.sha256 ? { sha256: options.sha256 ?? detected?.sha256 } : {}),
    ...(options.retrievedAt ?? detected?.retrievedAt ? { retrievedAt: options.retrievedAt ?? detected?.retrievedAt } : {}),
    ...(options.resolveCandidate ?? detected?.resolveCandidate ? { resolveCandidate: options.resolveCandidate ?? detected?.resolveCandidate } : {}),
    ...(evidence.length > 0 ? { evidence } : {}),
    /*
     * Honour the injectable `retrievedAt` so a deterministic resolve produces deterministic output.
     *
     * This was `new Date().toISOString()` unconditionally, which meant two byte-identical resolves of
     * the same candidate differed by a millisecond in generated typed output. `retrievedAt` already
     * exists precisely so a caller can pin the retrieval instant; using the wall clock here defeated it
     * and made generated artifacts non-comparable by content hash. Falls back to the wall clock when no
     * retrieval instant was supplied.
     */
    checkedAt: options.retrievedAt ?? detected?.retrievedAt ?? new Date().toISOString()
  };
}

/**
 * Merge a freshly inspected asset's auto-detected provenance over the entry that
 * already exists in the manifest, so a re-add/re-resolve preserves hand-authored
 * fields (license, license URL/name/raw, attribution, author, source page,
 * download URL, sourceUrl, sourceFamily, evidence, sha256) that the new pass did
 * not re-detect. Freshly detected values win over the prior entry; explicit
 * `addAsset` options still win over both (applied in {@link
 * createAssetProvenance}). (#26)
 */
function mergeDetectedProvenance(
  existing: AuraCliAssetProvenance | undefined,
  detected: Partial<AuraCliAssetProvenance> | undefined
): Partial<AuraCliAssetProvenance> | undefined {
  if (!existing) return detected;
  const evidence = [...(detected?.evidence ?? []), ...(existing.evidence ?? [])];
  // Licence identity fields merge as one group, not independently.
  //
  // Detected values come from the asset's own embedded metadata and are authoritative.
  // A GLB commonly embeds `license` without `licenseName`, so merging field-by-field
  // let a stale hand-recorded `licenseName` survive next to a corrected `license` and
  // produced self-contradictory licence metadata — for example `license:
  // "CC-BY-SA-4.0"` alongside `licenseName: "CC-BY-4.0"`, which understates a
  // share-alike obligation. When detection supplies a licence identity at all, the
  // whole group is taken from detection and any field it does not supply is derived or
  // dropped rather than inherited from the stale record.
  const detectedLicenseIdentity = nonEmpty(detected?.license) || nonEmpty(detected?.licenseName);
  const licenseFields = detectedLicenseIdentity
    ? {
      license: detected?.license,
      licenseName: detected?.licenseName ?? licenseNameFromLicense(detected?.license),
      licenseUrl: detected?.licenseUrl ?? licenseUrlFromLicense(detected?.license) ?? existing.licenseUrl,
      licenseRaw: detected?.licenseRaw ?? existing.licenseRaw
    }
    : {
      license: existing.license,
      licenseName: existing.licenseName,
      licenseUrl: existing.licenseUrl,
      licenseRaw: existing.licenseRaw
    };
  // Attribution belongs with the author it credits, for the same reason.
  const detectedAuthorIdentity = nonEmpty(detected?.author) || nonEmpty(detected?.attribution);
  const authorFields = detectedAuthorIdentity
    ? {
      author: detected?.author,
      attribution: detected?.attribution ?? attributionFromAuthor(detected?.author)
    }
    : { author: existing.author, attribution: existing.attribution };
  return {
    sourcePage: detected?.sourcePage ?? existing.sourcePage,
    downloadUrl: detected?.downloadUrl ?? existing.downloadUrl,
    sourceUrl: detected?.sourceUrl ?? existing.sourceUrl,
    ...licenseFields,
    ...authorFields,
    sourceFamily: detected?.sourceFamily ?? existing.sourceFamily,
    sha256: detected?.sha256 ?? existing.sha256,
    retrievedAt: detected?.retrievedAt ?? existing.retrievedAt,
    resolveCandidate: detected?.resolveCandidate ?? existing.resolveCandidate,
    ...(evidence.length > 0 ? { evidence: [...new Set(evidence)] } : {})
  };
}

/** Extracts the SPDX-style identifier from a `"NAME (url)"` licence string. */
function licenseNameFromLicense(license: string | undefined): string | undefined {
  const trimmed = license?.trim();
  if (!trimmed) return undefined;
  const match = /^([^(]+)/.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
}

/** Extracts the licence URL from a `"NAME (url)"` licence string. */
function licenseUrlFromLicense(license: string | undefined): string | undefined {
  const trimmed = license?.trim();
  if (!trimmed) return undefined;
  const match = /\((https?:\/\/[^)]+)\)/.exec(trimmed);
  return match ? match[1] : undefined;
}

/** Extracts the display name from an `"Author (profile url)"` string. */
function attributionFromAuthor(author: string | undefined): string | undefined {
  const trimmed = author?.trim();
  if (!trimmed) return undefined;
  const match = /^([^(]+)/.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
}

function readExternalProvenance(projectDir: string, provenanceFile?: string): ReadonlyMap<string, AuraCliAssetProvenance> {
  if (!provenanceFile) return new Map();
  const path = resolve(projectDir, provenanceFile);
  if (!existsSync(path)) return new Map();
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const root = objectValue(parsed);
  if (!root) return new Map();
  const checkedAt = stringValue(root.updatedAt ?? root.verifiedAt ?? root.checkedAt) ?? new Date().toISOString();
  const records = [
    ...arrayObjectValue(root.launchGlbs),
    ...arrayObjectValue(root.assets),
    ...arrayObjectValue(root.assetEvidence)
  ];
  const byId = new Map<string, AuraCliAssetProvenance>();
  for (const record of records) {
    const typedAsset = stringValue(record.typedAsset);
    const id = stringValue(record.assetKey ?? record.id) ?? typedAsset?.replace(/^assets\./, "");
    if (!id) continue;
    const nestedProvenance = objectValue(record.provenance);
    const sourcePath = stringValue(record.sourcePath ?? record.source ?? nestedProvenance?.builderOutput) ?? id;
    const license = stringValue(record.license ?? record.licenseNote ?? nestedProvenance?.license);
    const licenseName = stringValue(record.licenseName ?? record.licenseTitle ?? nestedProvenance?.licenseName);
    const licenseUrl = stringValue(record.licenseUrl ?? record.licensePage ?? record.termsUrl ?? nestedProvenance?.licenseUrl);
    const licenseRaw = stringValue(record.licenseRaw ?? record.rawLicense ?? nestedProvenance?.licenseRaw);
    const sourcePage = stringValue(record.sourcePage ?? record.officialPage ?? nestedProvenance?.sourcePage);
    const downloadUrl = stringValue(record.downloadUrl ?? record.publicUrl ?? nestedProvenance?.downloadUrl);
    const sourceUrl = stringValue(record.sourceUrl ?? record.publicUrl ?? record.officialPage ?? nestedProvenance?.sourceUrl);
    const sourceFamily = stringValue(record.sourceFamily ?? nestedProvenance?.sourceFamily ?? nestedProvenance?.sourcePack);
    const author = stringValue(record.author ?? nestedProvenance?.author);
    const attribution = stringValue(record.attribution ?? record.credit ?? nestedProvenance?.attribution);
    const sha256 = stringValue(record.sha256 ?? nestedProvenance?.sha256);
    const retrievedAt = stringValue(record.retrievedAt ?? nestedProvenance?.retrievedAt);
    const evidence = [
      ...stringArrayValue(record.evidence),
      ...stringArrayValue(record.intendedRouteUsage),
      ...stringArrayValue(nestedProvenance?.evidence)
    ];
    byId.set(id, {
      sourcePath,
      ...(sourcePage ? { sourcePage } : {}),
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(license ? { license } : {}),
      ...(licenseName ? { licenseName } : {}),
      ...(licenseUrl ? { licenseUrl } : {}),
      ...(licenseRaw ? { licenseRaw } : {}),
      ...(author ? { author } : {}),
      ...(sourceFamily ? { sourceFamily } : {}),
      ...(attribution ? { attribution } : {}),
      ...(sha256 ? { sha256 } : {}),
      ...(retrievedAt ? { retrievedAt } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
      checkedAt
    });
  }
  return byId;
}

function arrayObjectValue(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => objectValue(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function resolveAssetProvenance(asset: AuraCliAssetEntry, externalProvenance: ReadonlyMap<string, AuraCliAssetProvenance>): AuraCliAssetProvenance | undefined {
  return asset.provenance ?? externalProvenance.get(asset.id);
}

function hasUsableLicenseEvidence(provenance: AuraCliAssetProvenance | undefined): boolean {
  const license = provenance?.license?.trim();
  if (!license) return false;
  return !/(unverified|unknown|candidate|needs[-\s]?confirmation|pending|placeholder)/i.test(license);
}

function createDurableReleaseProvenanceWarnings(asset: AuraCliAssetEntry, provenance: AuraCliAssetProvenance | undefined): readonly string[] {
  if (!provenance) return [`${asset.id}: durable provenance is missing; add source page, download URL, license URL/name, author, and acquisition timestamp.`];
  if (hasLocalOnlyProvenanceMarker(provenance)) return [];
  const warnings: string[] = [];
  if (!nonEmpty(provenance.sourcePage)) warnings.push(`${asset.id}: durable provenance missing sourcePage.`);
  if (!nonEmpty(provenance.downloadUrl)) warnings.push(`${asset.id}: durable provenance missing downloadUrl.`);
  if (!nonEmpty(provenance.licenseName) && !nonEmpty(provenance.license)) warnings.push(`${asset.id}: durable provenance missing licenseName.`);
  if (!nonEmpty(provenance.licenseUrl)) warnings.push(`${asset.id}: durable provenance missing licenseUrl.`);
  if (!nonEmpty(provenance.author) && !nonEmpty(provenance.attribution)) warnings.push(`${asset.id}: durable provenance missing author or attribution.`);
  if (!nonEmpty(provenance.retrievedAt)) warnings.push(`${asset.id}: durable provenance missing acquisition timestamp (retrievedAt).`);
  return warnings;
}

/**
 * Re-derive geometry metadata from the asset file and report drift.
 *
 * `assets validate` already proves the *file* is unchanged via its content hash, but nothing
 * proved that the metadata *derived* from that file still matches it. Those are different
 * claims: metadata written by an older inspector, or hand-edited, survives a green hash check
 * forever. A repo-wide audit found 79 assets whose manifest `bounds` disagreed with their own
 * GLB and 62 with no `hierarchy` block at all, many with Y and Z transposed because a Z-up
 * source was never normalized.
 *
 * That is not cosmetic. `bounds`/`boundsMetadata.grounded` feed grounding and auto-fit
 * decisions, and a transposed height is exactly the class of error behind defect 45, where a
 * vehicle was floating above its track because a height was read from the wrong axis.
 *
 * Reported as warnings rather than failures because release validation already promotes
 * warnings to blocking failures for release candidates, while non-release callers keep working.
 */
function createDerivedMetadataDriftWarnings(outputPath: string, asset: AuraCliAssetEntry): readonly string[] {
  if (asset.type !== "model") return [];
  if (asset.format !== "glb" && asset.format !== "gltf") return [];
  if (!existsSync(outputPath)) return [];
  let inspection: AssetInspection;
  try {
    inspection = inspectAssetFile(outputPath, asset.format);
  } catch {
    // A file we cannot inspect is already reported by the hash and dependency checks.
    return [];
  }
  const warnings: string[] = [];
  const actualSize = inspection.boundsMetadata?.size ?? inspection.bounds;
  const storedSize = asset.boundsMetadata?.size ?? asset.bounds;
  if (actualSize && storedSize) {
    const drifted = actualSize.some((value, index) => Math.abs(value - (storedSize[index] ?? 0)) > 0.01);
    if (drifted) {
      warnings.push(
        `${asset.id}: manifest bounds [${storedSize.map((value) => value.toFixed(3)).join(", ")}] do not match the asset file [${actualSize.map((value) => value.toFixed(3)).join(", ")}]. Re-add the asset through the CLI to refresh derived metadata.`
      );
    }
  } else if (actualSize && !storedSize) {
    warnings.push(`${asset.id}: manifest is missing bounds metadata that the asset file provides.`);
  }
  const actualGrounded = inspection.boundsMetadata?.grounded;
  const storedGrounded = asset.boundsMetadata?.grounded;
  if (typeof actualGrounded === "boolean" && typeof storedGrounded === "boolean" && actualGrounded !== storedGrounded) {
    warnings.push(`${asset.id}: manifest records grounded=${storedGrounded} but the asset file is grounded=${actualGrounded}.`);
  }
  if (inspection.hierarchy && !asset.hierarchy) {
    warnings.push(`${asset.id}: manifest is missing the scene hierarchy inspection that the asset file provides.`);
  } else if (inspection.hierarchy && asset.hierarchy) {
    for (const key of ["nodeCount", "meshCount", "materialCount", "textureCount", "animationClipCount", "skinCount"] as const) {
      if (inspection.hierarchy[key] !== asset.hierarchy[key]) {
        warnings.push(`${asset.id}: manifest hierarchy.${key}=${String(asset.hierarchy[key])} but the asset file reports ${String(inspection.hierarchy[key])}.`);
      }
    }
  }
  return warnings;
}

function createReleaseStructuredQualityWarnings(asset: AuraCliAssetEntry): readonly string[] {
  if (asset.type !== "model") return [];
  const warnings: string[] = [];
  const quality = asset.quality ?? "ungraded";
  const role = asset.role ?? "unknown";
  if (quality === "ungraded") {
    warnings.push(`${asset.id}: release primary model quality grade missing or ungraded.`);
  } else if (quality !== "release") {
    warnings.push(`${asset.id}: release primary model quality grade "${quality}" is not release-safe.`);
  }
  if (role === "unknown") {
    warnings.push(`${asset.id}: release primary model missing intended role.`);
  }
  if (!nonEmpty(asset.suitabilityReason)) {
    warnings.push(`${asset.id}: release primary model missing suitability reason.`);
  }
  return warnings;
}

function createReleaseAssetQualityWarnings(asset: AuraCliAssetEntry): readonly string[] {
  if (asset.type !== "model") return [];
  const warnings: string[] = [];
  const size = asset.boundsMetadata?.size ?? asset.bounds;
  if (!size) {
    warnings.push(`${asset.id}: release primary model quality missing bounds metadata.`);
  } else {
    const maxDimension = Math.max(...size);
    const minNonZeroDimension = Math.min(...size.filter((value) => value > 0));
    if (maxDimension < 0.25) warnings.push(`${asset.id}: release primary model is too small to be a readable subject (max bounds ${maxDimension.toFixed(3)}).`);
    if (maxDimension > 250 && !hasHashBoundNormalizationEvidence(asset)) {
      warnings.push(`${asset.id}: release primary model has excessive scale mismatch (max bounds ${maxDimension.toFixed(3)}).`);
    }
    if (Number.isFinite(minNonZeroDimension) && maxDimension / minNonZeroDimension > 250) {
      warnings.push(`${asset.id}: release primary model has extreme aspect/scale mismatch.`);
    }
  }
  if (asset.materials.length === 0) warnings.push(`${asset.id}: release primary model has no material metadata.`);
  if (asset.materialMetadata?.some((material) => !material.visible || !material.readable)) {
    warnings.push(`${asset.id}: release primary model has invisible or unreadable material metadata.`);
  }
  if (["glb", "gltf"].includes(asset.format) && asset.textures.length === 0 && !hasHashBoundFlatColorMaterialEvidence(asset)) {
    warnings.push(`${asset.id}: release primary model has no texture references; use only with explicit material/readability evidence.`);
  }
  return warnings;
}

function createReleaseRenderedProbeWarnings(projectDir: string, manifest: AuraCliAssetManifest, asset: AuraCliAssetEntry): readonly string[] {
  if (asset.type !== "model") return [];
  const renderedProbe = asset.renderedProbe;
  if (!renderedProbe?.url) return [`${asset.id}: release primary model missing renderedProbe evidence.`];
  const allowedKinds: readonly AuraCliRenderedProbeKind[] = ["browser-screenshot", "aura-probe-render"];
  const warnings: string[] = [];
  if (!allowedKinds.includes(renderedProbe.kind)) {
    warnings.push(`${asset.id}: release primary model renderedProbe kind "${renderedProbe.kind}" is not pixel-render proof.`);
  }
  if (!nonEmpty(renderedProbe.renderer)) {
    warnings.push(`${asset.id}: release primary model renderedProbe missing renderer metadata.`);
  } else if (!/createAuraApp|@aura3d\/engine/i.test(renderedProbe.renderer ?? "")) {
    warnings.push(`${asset.id}: release primary model renderedProbe renderer "${renderedProbe.renderer}" is not root Aura3D render proof.`);
  }
  if (!nonEmpty(renderedProbe.route)) warnings.push(`${asset.id}: release primary model renderedProbe missing route metadata.`);
  if (!nonEmpty(renderedProbe.checkedAt)) {
    warnings.push(`${asset.id}: release primary model renderedProbe missing checkedAt timestamp.`);
  } else if (Number.isNaN(Date.parse(renderedProbe.checkedAt ?? ""))) {
    warnings.push(`${asset.id}: release primary model renderedProbe checkedAt timestamp is invalid.`);
  }
  if (!nonEmpty(renderedProbe.sha256)) warnings.push(`${asset.id}: release primary model renderedProbe missing image sha256.`);
  if (!nonEmpty(renderedProbe.assetHash)) warnings.push(`${asset.id}: release primary model renderedProbe missing asset hash binding.`);
  if (typeof renderedProbe.width !== "number" || typeof renderedProbe.height !== "number") {
    warnings.push(`${asset.id}: release primary model renderedProbe missing declared dimensions.`);
  }
  if (typeof renderedProbe.nonBlankPixels !== "number") {
    warnings.push(`${asset.id}: release primary model renderedProbe missing nonblank pixel count.`);
  }
  if (typeof renderedProbe.colorBuckets !== "number") {
    warnings.push(`${asset.id}: release primary model renderedProbe missing color bucket count.`);
  }
  const probePath = resolvePublicArtifactPath(projectDir, manifest, renderedProbe.url);
  if (!probePath || !existsSync(probePath)) {
    warnings.push(`${asset.id}: release primary model renderedProbe artifact is missing on disk (${renderedProbe.url}).`);
    return warnings;
  }
  const probeBytes = readFileSync(probePath);
  const size = probeBytes.byteLength;
  if (size < 200) warnings.push(`${asset.id}: release primary model renderedProbe artifact is too small (${size} bytes).`);
  const actualSha256 = `sha256-${createHash("sha256").update(probeBytes).digest("hex")}`;
  if (renderedProbe.sha256 && renderedProbe.sha256 !== actualSha256) {
    warnings.push(`${asset.id}: release primary model renderedProbe image sha256 mismatch.`);
  }
  if (renderedProbe.assetHash && renderedProbe.assetHash !== asset.hash) {
    warnings.push(`${asset.id}: release primary model renderedProbe asset hash binding is stale.`);
  }
  const probeMetrics = decodeRenderedProbePng(probeBytes);
  if (!probeMetrics.ok) {
    warnings.push(`${asset.id}: release primary model renderedProbe artifact is not PNG screenshot proof (${probeMetrics.reason}).`);
    return warnings;
  }
  if (probeMetrics.width < 320 || probeMetrics.height < 180) {
    warnings.push(`${asset.id}: release primary model renderedProbe dimensions are too small (${probeMetrics.width}x${probeMetrics.height}).`);
  }
  if (typeof renderedProbe.width === "number" && renderedProbe.width !== probeMetrics.width) {
    warnings.push(`${asset.id}: release primary model renderedProbe declared width ${renderedProbe.width} does not match PNG width ${probeMetrics.width}.`);
  }
  if (typeof renderedProbe.height === "number" && renderedProbe.height !== probeMetrics.height) {
    warnings.push(`${asset.id}: release primary model renderedProbe declared height ${renderedProbe.height} does not match PNG height ${probeMetrics.height}.`);
  }
  const minNonBlankPixels = Math.min(5000, Math.max(500, Math.floor(probeMetrics.width * probeMetrics.height * 0.005)));
  if (probeMetrics.nonBlankPixels < minNonBlankPixels) {
    warnings.push(`${asset.id}: release primary model renderedProbe appears blank (${probeMetrics.nonBlankPixels} nonblank pixels).`);
  }
  if (probeMetrics.colorBuckets < 3) {
    warnings.push(`${asset.id}: release primary model renderedProbe lacks visible color variation (${probeMetrics.colorBuckets} color buckets).`);
  }
  if (typeof renderedProbe.nonBlankPixels === "number" && renderedProbe.nonBlankPixels !== probeMetrics.nonBlankPixels) {
    warnings.push(`${asset.id}: release primary model renderedProbe nonblank pixel count is stale.`);
  }
  if (typeof renderedProbe.colorBuckets === "number" && renderedProbe.colorBuckets !== probeMetrics.colorBuckets) {
    warnings.push(`${asset.id}: release primary model renderedProbe color bucket count is stale.`);
  }
  warnings.push(...createRenderedProbeForegroundWarnings(asset.id, renderedProbe.foregroundBounds, probeMetrics));
  return warnings;
}

function createManifestOrientationOverrideWarnings(asset: AuraCliAssetEntry): readonly string[] {
  const orientation = asset.orientation;
  if (asset.type !== "model" || orientation?.source !== "manifest-override") return [];

  const warnings: string[] = [];
  if (!nonEmpty(orientation.assetHash)) {
    warnings.push(`${asset.id}: manifest orientation override missing asset hash binding.`);
  } else if (orientation.assetHash !== asset.hash) {
    warnings.push(`${asset.id}: manifest orientation override asset hash binding is stale.`);
  }
  if (!nonEmpty(orientation.generatedBy)) {
    warnings.push(`${asset.id}: manifest orientation override missing generatedBy provenance.`);
  }
  if (!nonEmpty(orientation.checkedAt)) {
    warnings.push(`${asset.id}: manifest orientation override missing checkedAt timestamp.`);
  } else if (Number.isNaN(Date.parse(orientation.checkedAt ?? ""))) {
    warnings.push(`${asset.id}: manifest orientation override checkedAt timestamp is invalid.`);
  }
  if (!nonEmpty(orientation.route)) {
    warnings.push(`${asset.id}: manifest orientation override missing route evidence.`);
  }

  const probe = orientation.renderedProbe;
  if (!probe) {
    warnings.push(`${asset.id}: manifest orientation override missing renderedProbe binding.`);
  } else {
    if (!nonEmpty(probe.url)) warnings.push(`${asset.id}: manifest orientation override renderedProbe missing url.`);
    if (!nonEmpty(probe.sha256)) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe missing sha256.`);
    } else if (asset.renderedProbe?.sha256 && probe.sha256 !== asset.renderedProbe.sha256) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe sha256 does not match release renderedProbe.`);
    }
    if (!nonEmpty(probe.assetHash)) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe missing asset hash binding.`);
    } else if (probe.assetHash !== asset.hash) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe asset hash binding is stale.`);
    }
    if (!nonEmpty(probe.checkedAt)) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe missing checkedAt timestamp.`);
    } else if (Number.isNaN(Date.parse(probe.checkedAt ?? ""))) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe checkedAt timestamp is invalid.`);
    }
    if (!nonEmpty(probe.route)) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe missing route evidence.`);
    } else if (asset.renderedProbe?.route && probe.route !== asset.renderedProbe.route) {
      warnings.push(`${asset.id}: manifest orientation override renderedProbe route does not match release renderedProbe.`);
    }
  }

  const role = asset.role ?? "unknown";
  const hasAxisEvidence = nonEmpty(orientation.forwardAxis) && nonEmpty(orientation.upAxis);
  if (requiresForwardOrientation(role) && !hasAxisEvidence) {
    warnings.push(`${asset.id}: manifest orientation override for ${role} must include forwardAxis and upAxis.`);
  }
  if (!requiresForwardOrientation(role) && !hasAxisEvidence && !nonEmpty(orientation.view)) {
    warnings.push(`${asset.id}: manifest orientation override must include a role-specific view or forward/up axes.`);
  }
  return warnings;
}

function hasValidManifestOrientationOverride(asset: AuraCliAssetEntry): boolean {
  return createManifestOrientationOverrideWarnings(asset).length === 0 &&
    asset.orientation?.source === "manifest-override";
}

function releaseStoredAssetWarnings(asset: AuraCliAssetEntry): readonly string[] {
  let warnings = asset.warnings ?? [];
  if (hasValidManifestOrientationOverride(asset)) {
    warnings = warnings.filter((warning) => !/orientation metadata missing; facing direction cannot be validated/i.test(warning));
  }
  if (hasHashBoundFlatColorMaterialEvidence(asset)) {
    warnings = warnings.filter((warning) => !/^no texture references detected$/i.test(warning.trim()));
  }
  return warnings;
}

function hasHashBoundFlatColorMaterialEvidence(asset: AuraCliAssetEntry): boolean {
  if (asset.materials.length === 0) return false;
  const materialMetadata = asset.materialMetadata ?? [];
  if (materialMetadata.length < asset.materials.length) return false;
  if (materialMetadata.some((material) =>
    !nonEmpty(material.name) || material.visible !== true || material.readable !== true ||
    typeof material.opacity !== "number" || material.opacity <= 0
  )) return false;
  const probe = asset.renderedProbe;
  return nonEmpty(probe?.url) &&
    nonEmpty(probe?.sha256) &&
    nonEmpty(probe?.assetHash) &&
    probe?.assetHash === asset.hash &&
    ["browser-screenshot", "aura-probe-render"].includes(String(probe?.kind));
}

function createRenderedProbeForegroundWarnings(
  assetId: string,
  foregroundBounds: AuraCliRenderedProbeForegroundBounds | undefined,
  probeMetrics: { readonly width: number; readonly height: number }
): readonly string[] {
  if (!foregroundBounds) return [];
  const warnings: string[] = [];
  const x = Number(foregroundBounds.x);
  const y = Number(foregroundBounds.y);
  const width = Number(foregroundBounds.width);
  const height = Number(foregroundBounds.height);
  if (!Number.isFinite(x) || x < 0 || Math.floor(x) !== x) {
    warnings.push(`${assetId}: release primary model renderedProbe foregroundBounds.x is invalid.`);
  }
  if (!Number.isFinite(y) || y < 0 || Math.floor(y) !== y) {
    warnings.push(`${assetId}: release primary model renderedProbe foregroundBounds.y is invalid.`);
  }
  if (!Number.isFinite(width) || width <= 0 || Math.floor(width) !== width) {
    warnings.push(`${assetId}: release primary model renderedProbe foregroundBounds.width is invalid.`);
  }
  if (!Number.isFinite(height) || height <= 0 || Math.floor(height) !== height) {
    warnings.push(`${assetId}: release primary model renderedProbe foregroundBounds.height is invalid.`);
  }
  if (warnings.length > 0) return warnings;
  if (x + width > probeMetrics.width || y + height > probeMetrics.height) {
    warnings.push(`${assetId}: release primary model renderedProbe foregroundBounds exceed PNG dimensions.`);
  }
  return warnings;
}

function createRoleAwareReleaseQualityWarnings(projectDir: string, manifest: AuraCliAssetManifest, asset: AuraCliAssetEntry): readonly string[] {
  void projectDir;
  void manifest;
  if (asset.type !== "model" || asset.quality !== "release") return [];
  const role = asset.role ?? "unknown";
  const warnings: string[] = [];
  const suitabilityReason = asset.suitabilityReason?.trim() ?? "";
  const size = asset.boundsMetadata?.size ?? asset.bounds;
  const dimensions = createRoleAwareDimensions(size);
  const hasMaterialEvidence = asset.materials.length > 0 && !(asset.materialMetadata?.every((material) => !material.visible || !material.readable) ?? false);
  const hasTextureEvidence = asset.textures.length > 0 || (asset.hierarchy?.textureCount ?? 0) > 0;

  if (role === "unknown") {
    warnings.push(`${asset.id}: role-aware release validation requires a declared asset role.`);
    return warnings;
  }

  if (!dimensions) {
    warnings.push(`${asset.id}: role-aware release ${role} validation requires valid bounds/inspection dimensions.`);
  } else {
    const maxDimension = Math.max(...dimensions);
    const minDimension = Math.min(...dimensions);
    if (minDimension <= 0) warnings.push(`${asset.id}: role-aware release ${role} validation found zero or invalid bounds dimensions.`);
    if (isTinyForReleaseRole(role, dimensions)) {
      warnings.push(`${asset.id}: role-aware release ${role} validation found bounds too tiny for readable ${role} use.`);
    }
    if (isHugeForReleaseRole(role, dimensions) && !hasHashBoundNormalizationEvidence(asset)) {
      warnings.push(`${asset.id}: role-aware release ${role} validation found huge bounds without explicit normalization evidence.`);
    }
    if ((role === "track" || role === "world" || role === "environment") &&
      !hasMeaningfulWorldExtent(dimensions) &&
      !hasCurrentMeshExtractedGameplayExtent(asset, role)) {
      warnings.push(`${asset.id}: role-aware release ${role} validation needs a gameplay-scale footprint/extent.`);
    }
  }

  if (!hasRoleAwareSuitabilityReason(role, suitabilityReason)) {
    warnings.push(`${asset.id}: role-aware release ${role} validation needs a specific suitabilityReason explaining role readiness.`);
  }
  if (requiresMaterialEvidence(role) && !hasMaterialEvidence) {
    warnings.push(`${asset.id}: role-aware release ${role} validation requires readable material evidence.`);
  }
  if (requiresTextureEvidence(role, suitabilityReason) && !hasTextureEvidence) {
    warnings.push(`${asset.id}: role-aware release ${role} validation requires texture evidence or explicit stylized-material rationale.`);
  }
  if (requiresForwardOrientation(role) && !hasForwardOrientationEvidence(asset, suitabilityReason)) {
    warnings.push(`${asset.id}: role-aware release ${role} validation requires orientation/forward-axis evidence.`);
  }
  warnings.push(...createRoleAwareRenderedProbeWarnings(asset, role));

  if (role === "character") {
    if (claimsAnimatedOrSkinned(suitabilityReason) && asset.animations.length === 0 && (asset.skeleton?.jointCount ?? 0) === 0) {
      warnings.push(`${asset.id}: role-aware release character validation cannot claim animated/skinned readiness without animation or skeleton evidence.`);
    }
  }
  if (role === "debug" || role === "abstract" || role === "set-dressing") {
    if (!/\b(non[-\s]?primary|diagnostic|debug|abstract|set[-\s]?dressing|background|decorative)\b/i.test(suitabilityReason)) {
      warnings.push(`${asset.id}: release ${role} assets cannot satisfy primary asset gates without an explicit non-primary rationale.`);
    }
  }

  return warnings;
}

function createRoleAwareDimensions(size: readonly [number, number, number] | undefined): readonly [number, number, number] | undefined {
  if (!size || size.length !== 3) return undefined;
  if (!size.every((value) => Number.isFinite(value))) return undefined;
  return size;
}

function isTinyForReleaseRole(role: AuraCliAssetRole, size: readonly [number, number, number]): boolean {
  const maxDimension = Math.max(...size);
  if (role === "track" || role === "world" || role === "environment") {
    const footprint = Math.max(size[0], size[2]);
    return footprint < 5;
  }
  if (role === "vehicle") return maxDimension < 0.75;
  if (role === "character") return maxDimension < 0.9;
  if (role === "product" || role === "weapon") return maxDimension < 0.1;
  return maxDimension < 0.25;
}

function isHugeForReleaseRole(role: AuraCliAssetRole, size: readonly [number, number, number]): boolean {
  const maxDimension = Math.max(...size);
  if (role === "track" || role === "world" || role === "environment") return maxDimension > 1000;
  if (role === "vehicle") return maxDimension > 25;
  if (role === "character") return maxDimension > 20;
  if (role === "product" || role === "weapon") return maxDimension > 50;
  return maxDimension > 250;
}

function hasMeaningfulWorldExtent(size: readonly [number, number, number]): boolean {
  const horizontalArea = Math.abs(size[0] * size[2]);
  return Math.max(size[0], size[2]) >= 10 && horizontalArea >= 100;
}

function hasCurrentMeshExtractedGameplayExtent(asset: AuraCliAssetEntry, role: AuraCliAssetRole): boolean {
  const geometry = asset.gameGeometry;
  if (!geometry || geometry.evidence?.manifestHash !== asset.hash || (geometry.evidence.blockers?.length ?? 0) > 0) return false;
  if (role === "track" && geometry.certification === "certified-racing-track") {
    const topology = geometry.racingTopology;
    return topology?.source === "asset-mesh-extracted" &&
      topology.assetHash === asset.hash &&
      typeof topology.lapLengthMeters === "number" &&
      topology.lapLengthMeters >= 10;
  }
  if ((role === "world" || role === "environment") && geometry.certification === "certified-platformer-world") {
    const surfaceMap = geometry.playableSurfaceMap;
    return surfaceMap?.source === "asset-mesh-extracted" &&
      surfaceMap.assetHash === asset.hash &&
      typeof surfaceMap.levelLength === "number" &&
      surfaceMap.levelLength >= 10;
  }
  return false;
}

function hasHashBoundNormalizationEvidence(asset: AuraCliAssetEntry): boolean {
  const probe = asset.renderedProbe;
  const foregroundBounds = probe?.foregroundBounds;
  if (!foregroundBounds) return false;
  return hasExplicitNormalizationEvidence(asset.suitabilityReason ?? "") &&
    probe?.assetHash === asset.hash &&
    typeof foregroundBounds.width === "number" &&
    typeof foregroundBounds.height === "number";
}

function hasExplicitNormalizationEvidence(suitabilityReason: string): boolean {
  if (/\b(?:not|no|without|missing|lacks?|unproven|unverified|unsupported)\s+(?:explicit\s+)?(?:(?:route|render|asset|camera|bounds|unit|world|character|vehicle|track|model)[-\s]?)?(?:normaliz(?:ed|ation)|normalis(?:ed|ation)|rescal(?:ed|ing)|camera[-\s]?fit|bounds[-\s]?approved|unit[-\s]?scale)\b/i.test(suitabilityReason)) {
    return false;
  }
  const explicitPatterns: readonly RegExp[] = [
    /\b(?:normalized|normalised)\s+(?:camera[-\s]?fit|route|render|asset|bounds|scale|placement|model|world|character|vehicle|track)\b/i,
    /\b(?:route|render|asset|camera|bounds)[-\s]?(?:normalized|normalised)\b/i,
    /\bcamera[-\s]?fit\s+(?:placement|scale|evidence|normalization|normalisation|proof|route|render|bounds)\b/i,
    /\bbounds[-\s]?approved\s+(?:placement|scale|evidence|normalization|normalisation|proof|route|render|bounds)\b/i,
    /\b(?:rescaled|rescaling)\s+(?:for|to|against|with)\s+(?:route|camera|render|asset|bounds|gameplay|world|scene|placement)\b/i,
    /\bunit[-\s]?scale\s+(?:normalization|normalisation|evidence|proof|approved)\b/i
  ];
  return explicitPatterns.some((pattern) => pattern.test(suitabilityReason));
}

function hasRoleAwareSuitabilityReason(role: AuraCliAssetRole, suitabilityReason: string): boolean {
  if (suitabilityReason.length < 48) return false;
  if (/\b(good|nice|usable|asset loaded|looks ok|works|test fixture)\b/i.test(suitabilityReason) && suitabilityReason.length < 96) return false;
  if (role === "track" || role === "world" || role === "environment") {
    return /\b(track|world|environment|gameplay|footprint|path|route|scene|scale|extent|normaliz|traversable)\b/i.test(suitabilityReason);
  }
  if (role === "vehicle") {
    return /\b(vehicle|car|footprint|wheel|track|forward|orientation|racing|drivable)\b/i.test(suitabilityReason);
  }
  if (role === "character") {
    return /\b(character|rig|humanoid|height|readable|orientation|animation|avatar|player)\b/i.test(suitabilityReason);
  }
  if (role === "product") {
    return /\b(product|commerce|configurator|viewer|material|texture|readable|dimension)\b/i.test(suitabilityReason);
  }
  if (role === "weapon") {
    return /\b(weapon|prop|held|orientation|readable|material|scale)\b/i.test(suitabilityReason);
  }
  return /\b(prop|set[-\s]?dressing|debug|abstract|decorative|supporting|non[-\s]?primary|readable)\b/i.test(suitabilityReason);
}

function requiresMaterialEvidence(role: AuraCliAssetRole): boolean {
  return role !== "debug" && role !== "abstract";
}

function requiresTextureEvidence(role: AuraCliAssetRole, suitabilityReason: string): boolean {
  if (role === "debug" || role === "abstract") return false;
  if (/\b(stylized|stylised|flat[-\s]?color|flat[-\s]?colour|untextured|procedural material|clay render|solid material)\b/i.test(suitabilityReason)) {
    return false;
  }
  return role === "character" || role === "vehicle" || role === "product" || role === "track" || role === "world" || role === "environment" || role === "weapon";
}

function requiresForwardOrientation(role: AuraCliAssetRole): boolean {
  return role === "character" || role === "vehicle" || role === "weapon";
}

function hasForwardOrientationEvidence(asset: AuraCliAssetEntry, suitabilityReason: string): boolean {
  void suitabilityReason;
  if (asset.orientation?.source === "gltf-extras" && asset.orientation.forwardAxis && asset.orientation.upAxis) return true;
  if (hasValidManifestOrientationOverride(asset) && asset.orientation?.forwardAxis && asset.orientation?.upAxis) return true;
  return false;
}

function createRoleAwareRenderedProbeWarnings(asset: AuraCliAssetEntry, role: AuraCliAssetRole): readonly string[] {
  const probe = asset.renderedProbe;
  if (!probe?.url) return [`${asset.id}: role-aware release ${role} validation requires retained renderedProbe evidence.`];
  const warnings: string[] = [];
  if (!probe.foregroundBounds) {
    warnings.push(`${asset.id}: role-aware release ${role} validation requires renderedProbe foregroundBounds for readability proof.`);
    return warnings;
  }
  if (typeof probe.width !== "number" || typeof probe.height !== "number" || probe.width <= 0 || probe.height <= 0) {
    warnings.push(`${asset.id}: role-aware release ${role} validation requires renderedProbe dimensions before foreground readability can be checked.`);
    return warnings;
  }
  const foregroundWarnings = createRenderedProbeForegroundWarnings(asset.id, probe.foregroundBounds, { width: probe.width, height: probe.height });
  warnings.push(...foregroundWarnings);
  if (foregroundWarnings.length > 0) return warnings;
  const rule = readabilityRuleForRole(role);
  const foreground = probe.foregroundBounds;
  const widthRatio = foreground.width / probe.width;
  const heightRatio = foreground.height / probe.height;
  const areaRatio = (foreground.width * foreground.height) / (probe.width * probe.height);
  if (
    foreground.width < rule.minWidthPx ||
    foreground.height < rule.minHeightPx ||
    widthRatio < rule.minWidthRatio ||
    heightRatio < rule.minHeightRatio ||
    areaRatio < rule.minAreaRatio
  ) {
    warnings.push(`${asset.id}: role-aware release ${role} renderedProbe foreground is too small/readability-poor (${foreground.width}x${foreground.height} in ${probe.width}x${probe.height}).`);
  }
  return warnings;
}

function readabilityRuleForRole(role: AuraCliAssetRole): {
  readonly minWidthPx: number;
  readonly minHeightPx: number;
  readonly minWidthRatio: number;
  readonly minHeightRatio: number;
  readonly minAreaRatio: number;
} {
  if (role === "character") return { minWidthPx: 32, minHeightPx: 120, minWidthRatio: 0.04, minHeightRatio: 0.25, minAreaRatio: 0.015 };
  if (role === "vehicle") return { minWidthPx: 120, minHeightPx: 50, minWidthRatio: 0.18, minHeightRatio: 0.1, minAreaRatio: 0.025 };
  if (role === "track" || role === "world" || role === "environment") return { minWidthPx: 224, minHeightPx: 120, minWidthRatio: 0.35, minHeightRatio: 0.25, minAreaRatio: 0.12 };
  if (role === "product" || role === "weapon") return { minWidthPx: 96, minHeightPx: 96, minWidthRatio: 0.12, minHeightRatio: 0.16, minAreaRatio: 0.02 };
  return { minWidthPx: 64, minHeightPx: 64, minWidthRatio: 0.1, minHeightRatio: 0.1, minAreaRatio: 0.01 };
}

function claimsAnimatedOrSkinned(suitabilityReason: string): boolean {
  return /\b(animated|animation|rigged|skinned|skeleton|humanoid)\b/i.test(suitabilityReason);
}

function decodeRenderedProbePng(bytes: Buffer): { readonly ok: true; readonly width: number; readonly height: number; readonly nonBlankPixels: number; readonly colorBuckets: number } | { readonly ok: false; readonly reason: string } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.byteLength < signature.byteLength + 12 || !bytes.subarray(0, signature.byteLength).equals(signature)) {
    return { ok: false, reason: "missing PNG signature" };
  }
  let offset = signature.byteLength;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compression = 0;
  let filterMethod = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  try {
    while (offset + 12 <= bytes.byteLength) {
      const length = bytes.readUInt32BE(offset);
      offset += 4;
      const type = bytes.subarray(offset, offset + 4).toString("ascii");
      offset += 4;
      if (offset + length + 4 > bytes.byteLength) return { ok: false, reason: `truncated ${type} chunk` };
      const data = bytes.subarray(offset, offset + length);
      offset += length + 4;
      if (type === "IHDR") {
        if (length !== 13) return { ok: false, reason: "invalid IHDR length" };
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8] ?? 0;
        colorType = data[9] ?? 0;
        compression = data[10] ?? 0;
        filterMethod = data[11] ?? 0;
        interlace = data[12] ?? 0;
      } else if (type === "IDAT") {
        idatChunks.push(Buffer.from(data));
      } else if (type === "IEND") {
        break;
      }
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid PNG chunks" };
  }
  if (width <= 0 || height <= 0) return { ok: false, reason: "missing IHDR dimensions" };
  if (bitDepth !== 8) return { ok: false, reason: `unsupported bit depth ${bitDepth}` };
  if (compression !== 0 || filterMethod !== 0 || interlace !== 0) return { ok: false, reason: "unsupported PNG encoding" };
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (bytesPerPixel === 0) return { ok: false, reason: `unsupported color type ${colorType}` };
  if (idatChunks.length === 0) return { ok: false, reason: "missing IDAT data" };
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid compressed IDAT data" };
  }
  const rowLength = width * bytesPerPixel;
  const expectedLength = (rowLength + 1) * height;
  if (inflated.byteLength < expectedLength) return { ok: false, reason: "truncated decompressed pixel data" };
  let previous = new Uint8Array(rowLength);
  let nonBlankPixels = 0;
  const buckets = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1);
    const filter = inflated[rowOffset] ?? 0;
    if (filter < 0 || filter > 4) return { ok: false, reason: `unsupported PNG filter ${filter}` };
    const row = new Uint8Array(rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[rowOffset + 1 + x] ?? 0;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;
      row[x] = (raw + pngFilterPredictor(filter, left, up, upLeft)) & 0xff;
    }
    for (let pixel = 0; pixel < width; pixel += 1) {
      const pixelOffset = pixel * bytesPerPixel;
      const red = row[pixelOffset] ?? 0;
      const green = colorType === 0 ? red : row[pixelOffset + 1] ?? 0;
      const blue = colorType === 0 ? red : row[pixelOffset + 2] ?? 0;
      const alpha = colorType === 6 ? row[pixelOffset + 3] ?? 255 : 255;
      if (alpha > 8 && (red > 8 || green > 8 || blue > 8)) {
        nonBlankPixels += 1;
        buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
      }
    }
    previous = row;
  }
  return { ok: true, width, height, nonBlankPixels, colorBuckets: buckets.size };
}

function pngFilterPredictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paethPredictor(left, up, upLeft);
  throw new Error(`unsupported PNG filter ${filter}`);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function createReleaseThumbnailWarnings(projectDir: string, manifest: AuraCliAssetManifest, asset: AuraCliAssetEntry): readonly string[] {
  if (asset.type !== "model") return [];
  if (!asset.thumbnailUrl) return [`${asset.id}: release primary model missing thumbnail/probe artifact.`];
  const thumbnailPath = resolvePublicArtifactPath(projectDir, manifest, asset.thumbnailUrl);
  if (!thumbnailPath || !existsSync(thumbnailPath)) {
    return [`${asset.id}: release primary model thumbnail/probe artifact is missing on disk (${asset.thumbnailUrl}).`];
  }
  const size = statSync(thumbnailPath).size;
  if (size < 200) return [`${asset.id}: release primary model thumbnail/probe artifact is too small (${size} bytes).`];
  return [];
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isPlaceholderAsset(asset: AuraCliAssetEntry, provenance?: AuraCliAssetProvenance): boolean {
  const value = [
    asset.id,
    asset.source,
    asset.outputPath,
    asset.url,
    provenance?.sourcePath,
    provenance?.sourceUrl
  ].filter(Boolean).join(" ");
  return /(^|[-_./\s])(placeholder|dummy|mock|to[-_]?do|replace-me|sample-placeholder)([-_./\s]|$)/i.test(value);
}

function copyAssetDependencies(projectDir: string, sourcePath: string, outputDir: string, dependencies: readonly string[]): void {
  const sourceDir = dirname(sourcePath);
  for (const dependency of dependencies) {
    if (dependency.startsWith("data:")) continue;
    const sourceDependencyPath = resolve(sourceDir, dependency);
    const outputDependencyPath = resolve(projectDir, outputDir, dependency);
    mkdirSync(dirname(outputDependencyPath), { recursive: true });
    copyFileSync(sourceDependencyPath, outputDependencyPath);
  }
}

function writeThumbnail(projectDir: string, outputDir: string, publicPath: string, id: string, bounds?: readonly [number, number, number]): string {
  const fileName = `${id}.thumb.svg`;
  const outputPath = resolve(projectDir, outputDir, fileName);
  mkdirSync(dirname(outputPath), { recursive: true });
  const label = `${id}${bounds ? ` ${bounds.join("x")}` : ""}`;
  writeFileSync(outputPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#101720"/><path d="M80 126 160 46l80 80-80 28z" fill="#77a7ff"/><text x="160" y="160" text-anchor="middle" font-family="Arial" font-size="18" fill="#f4f7fb">${escapeXml(label)}</text></svg>`);
  return `${publicPath}${fileName}`;
}

function inferAssetType(format: string): AuraCliAssetType {
  if (["glb", "gltf"].includes(format)) return "model";
  if (["png", "jpg", "jpeg", "webp", "ktx2"].includes(format)) return "texture";
  if (["hdr", "exr"].includes(format)) return "environment";
  if (["mp3", "wav", "ogg"].includes(format)) return "audio";
  throw new Error(`Unsupported Aura3D asset format: ${format || "unknown"}. Suggested fix: use glb, gltf, png, jpg, webp, ktx2, hdr, exr, mp3, wav, or ogg.`);
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sortManifest(manifest: AuraCliAssetManifest): AuraCliAssetManifest {
  return {
    ...manifest,
    assets: [...manifest.assets].sort((a, b) => a.id.localeCompare(b.id))
  };
}

function normalizePublicPath(path: string): string {
  const withStart = path.startsWith("/") || path.startsWith("http") ? path : `/${path}`;
  return withStart.endsWith("/") ? withStart : `${withStart}/`;
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function sanitizeAssetId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+(.)/g, (_, char: string) => char.toUpperCase()).replace(/^[^a-zA-Z_]+/, "") || "asset";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function writeAgentFile(projectDir: string, path: string, contents: string): string {
  const output = resolve(projectDir, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
  return output;
}

function genericAgentText(agent = "AI coding agent"): string {
  return `# Aura3D Instructions For ${agent}

Read ./llms.txt first, then ./docs/agents/README.md.

Use @aura3d/engine public imports only:
- createAuraApp
- scene
- model
- camera
- lights
- material
- effects
- timeline
- interactions
- defineAuraAssets

Do not invent asset paths or asset ids. Read ./src/aura-assets.ts after running:

npx @aura3d/cli@latest assets add ./assets/model.glb --name model

Use model(assets.model), not model("model").
Run npm run build and the template route-health/screenshot tests before claiming the scene is done.
`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
