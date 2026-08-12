import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  extractPlatformerPlayableSurfaceMapFromAsset,
  extractRacingTrackTopologyFromAsset
} from "./showcase-spec-game-geometry-extractor.js";
import { validateGameGameplayProof } from "./showcase-spec-gameplay-evidence.js";
import type { ShowcaseGameAssetPairEvidence, ShowcaseGameGeometryEvidence, ShowcaseSpec } from "./showcase-spec-types.js";

export interface EvidenceValidationContext {
  readonly artifactRoot?: string;
  readonly projectDir?: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

interface GameAssetPairEvidenceValidationInput {
  readonly label: string;
  readonly spec: ShowcaseSpec;
  readonly evidence: ShowcaseGameAssetPairEvidence | undefined;
  readonly expectedCategory: ShowcaseGameAssetPairEvidence["category"];
  readonly expectedAssets: readonly string[];
  readonly context: EvidenceValidationContext;
}

interface ScreenshotBindingValidationInput {
  readonly label: string;
  readonly spec: ShowcaseSpec;
  readonly evidence: ShowcaseGameAssetPairEvidence;
  readonly context: EvidenceValidationContext;
}

interface GeometryModelAlignmentValidationInput {
  readonly label: string;
  readonly value: unknown;
  readonly secondAxis: "y" | "z";
  readonly spec: ShowcaseSpec;
}

export function compileEvidenceBlockers(spec: ShowcaseSpec, context: EvidenceValidationContext = {}): readonly string[] {
  if (spec.publicStatus !== "release-ready candidate") return [];

  const blockers: string[] = [];
  blockers.push(...validateEvidenceFile("evidence:route-primary-screenshot", spec.evidence.routePrimaryScreenshot, context));
  blockers.push(...validateRoutePrimaryProbe(spec));
  blockers.push(...validateGameplayProof(spec));
  blockers.push(...validateReleaseAssetProbes(spec));
  blockers.push(...validateDeployEvidence(spec));
  blockers.push(...validateCategoryTemplateEvidence(spec, context));

  for (const capability of spec.capabilities) {
    if (capability.evidence) blockers.push(...validateEvidenceFile(`capability:${capability.name}:evidence`, capability.evidence, context));
  }

  return blockers;
}

function validateCategoryTemplateEvidence(spec: ShowcaseSpec, context: EvidenceValidationContext): readonly string[] {
  if (spec.category === "game-racing") {
    const evidencePath = spec.racing?.raceDesign.trackTopologyEvidence;
    const blockers: string[] = [];
    if (!evidencePath) {
      blockers.push("evidence:racing-track-topology:missing");
    } else {
      const parsed = readJsonFile(evidencePath, "evidence:racing-track-topology", context);
      blockers.push(...(parsed.ok ? validateRacingTrackTopologyEvidence(spec, parsed.value, context) : parsed.blockers));
    }
    blockers.push(...validateGameAssetPairEvidence({
      label: "racing-asset-pair",
      spec,
      evidence: spec.racing?.raceDesign.assetPairEvidence,
      expectedCategory: "racing",
      // A racing presentation may retain additional typed competitors beyond
      // the player/track pair.  Those vehicles are still release-primary scene
      // assets and therefore belong in the hash-bound geometry/composition
      // evidence instead of being rejected as unexplained extras.
      expectedAssets: spec.racing ? spec.primaryAssets.map((asset) => asset.id) : [],
      context
    }));
    return blockers;
  }
  if (spec.category === "game-platformer") {
    const evidencePath = spec.platformer?.levelDesign.playableSurfaceEvidence;
    const blockers: string[] = [];
    if (!evidencePath) {
      blockers.push("evidence:platformer-playable-surface:missing");
    } else {
      const parsed = readJsonFile(evidencePath, "evidence:platformer-playable-surface", context);
      blockers.push(...(parsed.ok ? validatePlatformerPlayableSurfaceEvidence(spec, parsed.value, context) : parsed.blockers));
    }
    blockers.push(...validateGameAssetPairEvidence({
      label: "platformer-asset-pair",
      spec,
      evidence: spec.platformer?.levelDesign.assetPairEvidence,
      expectedCategory: "platformer",
      expectedAssets: spec.platformer ? [spec.platformer.characterAsset, ...spec.platformer.worldAssets] : [],
      context
    }));
    return blockers;
  }
  return [];
}

function validateGameplayProof(spec: ShowcaseSpec): readonly string[] {
  if (!isGameSpec(spec)) return [];
  if (!spec.evidence.gameplayProof) return ["evidence:gameplay-proof:missing"];
  const parsed = readJsonFile(spec.evidence.gameplayProof, "evidence:gameplay-proof");
  if (!parsed.ok) return parsed.blockers;
  if (!isRecord(parsed.value)) return ["evidence:gameplay-proof:invalid-json"];
  return [
    ...(parsed.value.pass === true ? [] : ["evidence:gameplay-proof:not-passing"]),
    ...validateGameGameplayProof(spec, parsed.value)
  ];
}

function validateReleaseAssetProbes(spec: ShowcaseSpec): readonly string[] {
  if (!isGameSpec(spec)) return [];
  const blockers: string[] = [];
  const releaseAssetProbes = spec.evidence.releaseAssetProbes;
  for (const asset of spec.primaryAssets) {
    const probePath = releaseAssetProbes?.[asset.id];
    if (!probePath) {
      blockers.push(`evidence:release-asset-probe:missing:${asset.id}`);
      continue;
    }
    const parsed = readJsonFile(probePath, `evidence:release-asset-probe:${asset.id}`);
    if (!parsed.ok) {
      blockers.push(...parsed.blockers);
      continue;
    }
    blockers.push(...validateReleaseAssetProbe(asset.id, parsed.value));
  }
  return blockers;
}

function isGameSpec(spec: ShowcaseSpec): boolean {
  return spec.category === "game-platformer" || spec.category === "game-racing";
}

function validateReleaseAssetProbe(assetId: string, value: unknown): readonly string[] {
  if (!isRecord(value)) return [`evidence:release-asset-probe:invalid-json:${assetId}`];
  const evidence = value.evidence;
  if (!isRecord(evidence)) return [`evidence:release-asset-probe:missing-evidence:${assetId}`];
  const asset = evidence.asset;
  const blockers: string[] = [];
  if (!isRecord(asset) || asset.id !== assetId) blockers.push(`evidence:release-asset-probe:asset-mismatch:${assetId}`);
  if (evidence.pass !== true) blockers.push(`evidence:release-asset-probe:not-passing:${assetId}`);
  if (Array.isArray(evidence.failures) && evidence.failures.length > 0) blockers.push(`evidence:release-asset-probe:has-failures:${assetId}`);
  const renderedProbe = value.renderedProbe;
  if (!isRecord(renderedProbe)) {
    blockers.push(`evidence:release-asset-probe:missing-rendered-probe:${assetId}`);
  } else {
    if (typeof renderedProbe.sha256 !== "string" || !renderedProbe.sha256.startsWith("sha256-")) {
      blockers.push(`evidence:release-asset-probe:missing-sha256:${assetId}`);
    }
    if (!isRecord(renderedProbe.foregroundBounds)) blockers.push(`evidence:release-asset-probe:missing-foreground-bounds:${assetId}`);
  }
  return blockers;
}

function validateRoutePrimaryProbe(spec: ShowcaseSpec): readonly string[] {
  const parsed = readJsonFile(spec.evidence.routePrimaryProbe, "evidence:route-primary-probe");
  if (!parsed.ok) return parsed.blockers;
  if (!isRecord(parsed.value)) return ["evidence:route-primary-probe:invalid-json"];

  const blockers: string[] = [];
  if (parsed.value.pass !== true) blockers.push("evidence:route-primary-probe:not-passing");
  if (parsed.value.routePrimaryHeroAsset !== spec.layout.heroAsset) blockers.push("evidence:route-primary-probe:hero-mismatch");
  if (!routePrimaryAssetsInclude(parsed.value, spec.layout.heroAsset)) blockers.push("evidence:route-primary-probe:missing-hero-asset");
  if (!routePrimaryScreenshotMatches(parsed.value, spec.evidence.routePrimaryScreenshot)) {
    blockers.push("evidence:route-primary-probe:screenshot-mismatch");
  }
  return blockers;
}

function validateDeployEvidence(spec: ShowcaseSpec): readonly string[] {
  const blockers: string[] = [];
  if (!isReleaseDeployCommand(spec)) blockers.push("evidence:deploy-command:not-release-check-deploy");
  if (!spec.evidence.deployEvidence) return [...blockers, "evidence:deploy-artifact:missing"];

  const parsed = readJsonFile(spec.evidence.deployEvidence, "evidence:deploy-artifact");
  if (!parsed.ok) return [...blockers, ...parsed.blockers];
  return [...blockers, ...validateDeployReport(spec, parsed.value)];
}

function isReleaseDeployCommand(spec: ShowcaseSpec): boolean {
  const command = spec.evidence.deployCommand;
  return command.startsWith("pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy ")
    && command.includes(" --release")
    && command.includes(" --dist ")
    && command.includes(" --source ")
    && spec.primaryAssets.every((asset) => command.includes(` --asset ${asset.id}`));
}

function validateEvidenceFile(label: string, filePath: string, context: EvidenceValidationContext = {}): readonly string[] {
  if (!isSafeRelativePath(filePath)) return [`${label}:unsafe-path`];
  const existingPath = resolveEvidencePath(filePath, context);
  if (!existingPath) return [`${label}:missing-file`];
  if (statSync(existingPath).size <= 0) return [`${label}:empty-file`];
  return [];
}

function validateGameAssetPairEvidence(input: GameAssetPairEvidenceValidationInput): readonly string[] {
  const { label, spec, evidence, expectedCategory, expectedAssets, context } = input;
  if (!evidence) return [`evidence:${label}:missing`];
  const blockers: string[] = [];
  blockers.push(...validateAssetPairCompositionReport(input));
  if (evidence.category !== expectedCategory) {
    blockers.push(`evidence:${label}:category-mismatch:${evidence.category}`);
  }
  for (const assetId of expectedAssets) {
    if (!evidence.assets.includes(assetId)) blockers.push(`evidence:${label}:asset-missing:${assetId}`);
  }
  blockers.push(...validateEvidenceFile(`evidence:${label}:screenshot`, evidence.screenshotEvidence, context));
  if (evidence.verdict === "pass") blockers.push(...validateCurrentRoutePrimaryScreenshotBinding({ label, spec, evidence, context }));
  if (evidence.verdict !== "pass") blockers.push(`evidence:${label}:verdict-not-pass:${evidence.verdict}`);
  blockers.push(...validateGameAssetPairGeometryEvidence(input));
  if (!evidence.notes.trim()) blockers.push(`evidence:${label}:notes-missing`);
  for (const blocker of evidence.blockers) {
    blockers.push(`evidence:${label}:blocker:${blocker}`);
  }
  return blockers;
}

function validateAssetPairCompositionReport(input: GameAssetPairEvidenceValidationInput): readonly string[] {
  const { label, spec, evidence, expectedCategory, expectedAssets, context } = input;
  const reportPath = spec.evidence.assetPairCompositionReport;
  if (!reportPath) return [`evidence:${label}:composition-report-missing`];
  if (evidence?.compositionReport !== reportPath) return [`evidence:${label}:composition-report-mismatch`];
  const parsed = readJsonFile(reportPath, `evidence:${label}:composition-report`, context);
  if (!parsed.ok) return parsed.blockers;
  if (!isRecord(parsed.value)) return [`evidence:${label}:composition-report-invalid-json`];
  const report = parsed.value;
  const blockers: string[] = [];
  if (report.schema !== "aura3d-showcase-asset-pair-composition/1.0") blockers.push(`evidence:${label}:composition-report-schema`);
  if (report.routeId !== spec.routeId) blockers.push(`evidence:${label}:composition-report-route`);
  if (report.category !== expectedCategory) blockers.push(`evidence:${label}:composition-report-category`);
  if (report.verdict !== evidence.verdict || report.pass !== (evidence.verdict === "pass")) blockers.push(`evidence:${label}:composition-report-verdict`);
  if (!isRecord(report.screenshot) || report.screenshot.path !== spec.evidence.routePrimaryScreenshot || report.screenshot.sha256 !== evidence.screenshotSha256) {
    blockers.push(`evidence:${label}:composition-report-screenshot`);
  }
  const assets = Array.isArray(report.assets) ? report.assets : [];
  for (const assetId of expectedAssets) {
    const asset = assets.find((value) => isRecord(value) && value.id === assetId);
    if (!isRecord(asset)) blockers.push(`evidence:${label}:composition-report-asset-missing:${assetId}`);
    else if (!isSha256(asset.manifestHash) || asset.manifestHash !== asset.evidenceHash) blockers.push(`evidence:${label}:composition-report-asset-hash:${assetId}`);
  }
  const requiredChecks = ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"];
  const checks = Array.isArray(report.checks) ? report.checks : [];
  for (const id of requiredChecks) {
    const check = checks.find((value) => isRecord(value) && value.id === id);
    if (!isRecord(check)) blockers.push(`evidence:${label}:composition-report-check-missing:${id}`);
    else if (evidence.verdict === "pass" && check.verdict !== "pass") blockers.push(`evidence:${label}:composition-report-check-fail:${id}`);
  }
  return blockers;
}

function validateGameAssetPairGeometryEvidence(input: GameAssetPairEvidenceValidationInput): readonly string[] {
  const { label, spec, evidence, expectedCategory, expectedAssets, context } = input;
  const geometry = evidence?.geometryEvidence;
  if (!geometry) return [`evidence:${label}:geometry-evidence-missing`];

  const blockers: string[] = [];
  if (geometry.category !== expectedCategory) {
    blockers.push(`evidence:${label}:geometry-category-mismatch:${geometry.category}`);
  }
  const expectedKind = expectedGameGeometryKind(expectedCategory);
  if (geometry.kind !== expectedKind) {
    blockers.push(`evidence:${label}:geometry-kind-mismatch:${geometry.kind}`);
  }
  if (!isPublicGameGeometrySource(geometry.source)) {
    blockers.push(`evidence:${label}:geometry-source-not-public:${geometry.source}`);
  }

  const expectedReport = expectedGameGeometryReport(spec, expectedCategory);
  if (!expectedReport) {
    blockers.push(`evidence:${label}:geometry-report-reference-missing`);
  } else if (geometry.report !== expectedReport) {
    blockers.push(`evidence:${label}:geometry-report-mismatch`);
  }
  blockers.push(...validateEvidenceFile(`evidence:${label}:geometry-report`, geometry.report, context));

  if (geometry.screenshotEvidence !== spec.evidence.routePrimaryScreenshot) {
    blockers.push(`evidence:${label}:geometry-screenshot-not-current-route-primary`);
  }
  if (evidence && geometry.screenshotEvidence !== evidence.screenshotEvidence) {
    blockers.push(`evidence:${label}:geometry-screenshot-not-asset-pair-screenshot`);
  }
  if (!isSha256(geometry.routePrimaryScreenshotSha256)) {
    blockers.push(`evidence:${label}:geometry-screenshot-sha256-missing`);
  } else if (evidence?.screenshotSha256 && geometry.routePrimaryScreenshotSha256 !== evidence.screenshotSha256) {
    blockers.push(`evidence:${label}:geometry-screenshot-sha256-mismatch`);
  }

  blockers.push(...validateGameGeometryEvidenceAssets(label, geometry, expectedAssets));
  return blockers;
}

function validateGameGeometryEvidenceAssets(
  label: string,
  geometry: ShowcaseGameGeometryEvidence,
  expectedAssets: readonly string[]
): readonly string[] {
  const blockers: string[] = [];
  const actualAssetIds = geometry.assets.map((asset) => asset.id);
  const actualAssets = new Set(actualAssetIds);
  for (const assetId of expectedAssets) {
    if (!actualAssets.has(assetId)) blockers.push(`evidence:${label}:geometry-asset-missing:${assetId}`);
  }
  for (const assetId of actualAssetIds) {
    if (!expectedAssets.includes(assetId)) blockers.push(`evidence:${label}:geometry-asset-extra:${assetId}`);
  }
  for (const asset of geometry.assets) {
    if (!isSha256(asset.hash)) blockers.push(`evidence:${label}:geometry-asset-hash-invalid:${asset.id}`);
  }
  return blockers;
}

function expectedGameGeometryKind(category: ShowcaseGameAssetPairEvidence["category"]): ShowcaseGameGeometryEvidence["kind"] {
  return category === "racing" ? "racing-track-topology" : "platformer-playable-surface-map";
}

function expectedGameGeometryReport(spec: ShowcaseSpec, category: ShowcaseGameAssetPairEvidence["category"]): string | undefined {
  return category === "racing"
    ? spec.racing?.raceDesign.trackTopologyEvidence
    : spec.platformer?.levelDesign.playableSurfaceEvidence;
}

function validateCurrentRoutePrimaryScreenshotBinding(input: ScreenshotBindingValidationInput): readonly string[] {
  const { label, spec, evidence, context } = input;
  const blockers: string[] = [];
  if (evidence.screenshotEvidence !== spec.evidence.routePrimaryScreenshot) {
    blockers.push(`evidence:${label}:screenshot-not-current-route-primary`);
  }
  if (!evidence.routePrimaryProbe) {
    blockers.push(`evidence:${label}:route-primary-probe-missing`);
  } else if (evidence.routePrimaryProbe !== spec.evidence.routePrimaryProbe) {
    blockers.push(`evidence:${label}:route-primary-probe-mismatch`);
  }
  if (!isSha256(evidence.screenshotSha256)) {
    blockers.push(`evidence:${label}:screenshot-sha256-missing`);
  }

  const parsed = readJsonFile(spec.evidence.routePrimaryProbe, `evidence:${label}:route-primary-probe`, context);
  if (!parsed.ok) {
    blockers.push(...parsed.blockers);
    return blockers;
  }
  if (!isRecord(parsed.value)) {
    blockers.push(`evidence:${label}:route-primary-probe-invalid-json`);
    return blockers;
  }
  const retainedSha256 = routePrimaryScreenshotSha256(parsed.value, spec.evidence.routePrimaryScreenshot);
  if (!retainedSha256) {
    blockers.push(`evidence:${label}:route-primary-sha256-missing`);
  } else if (evidence.screenshotSha256 !== retainedSha256) {
    blockers.push(`evidence:${label}:screenshot-sha256-mismatch`);
  }
  if (isSha256(evidence.screenshotSha256)) {
    blockers.push(...validatePngFileSha256(`evidence:${label}:screenshot`, evidence.screenshotEvidence, evidence.screenshotSha256, context));
  }
  return blockers;
}

function isSafeRelativePath(filePath: string): boolean {
  return !isAbsolute(filePath) && !filePath.split(/[\\/]+/).includes("..");
}

function readJsonFile(
  filePath: string,
  label: string,
  context: EvidenceValidationContext = {}
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly blockers: readonly string[] } {
  const blockers = validateEvidenceFile(label, filePath, context);
  if (blockers.length > 0) return { ok: false, blockers };
  const existingPath = resolveEvidencePath(filePath, context);
  if (!existingPath) return { ok: false, blockers: [`${label}:missing-file`] };
  try {
    return { ok: true, value: JSON.parse(readFileSync(existingPath, "utf8")) };
  } catch (error) {
    if (error instanceof Error) return { ok: false, blockers: [`${label}:invalid-json`] };
    throw error;
  }
}

function resolveEvidencePath(filePath: string, context: EvidenceValidationContext): string | undefined {
  if (existsSync(filePath)) return filePath;
  if (context.artifactRoot) {
    const artifactPath = join(context.artifactRoot, filePath);
    if (existsSync(artifactPath)) return artifactPath;
  }
  return undefined;
}

function validateRacingTrackTopologyEvidence(spec: ShowcaseSpec, value: unknown, context: EvidenceValidationContext): readonly string[] {
  if (!isRecord(value)) return ["evidence:racing-track-topology:invalid-json"];
  const racing = spec.racing;
  if (!racing) return ["evidence:racing-track-topology:not-racing-spec"];
  const route = value.route;
  const points = isRecord(route) && Array.isArray(route.points) ? route.points : [];
  const checkpoints = isRecord(route) && Array.isArray(route.checkpoints) ? route.checkpoints : [];
  const topology = recordValue(value.topology);
  const meshExtraction = recordValue(value.meshExtraction);
  const roadCenterline = topology && Array.isArray(topology.roadCenterline) ? topology.roadCenterline : [];
  const topologyCheckpoints = topology && Array.isArray(topology.checkpoints) ? topology.checkpoints : [];
  const blockers: string[] = [];
  if (value.schema !== "aura3d-racing-track-topology/1.0") blockers.push("evidence:racing-track-topology:schema-mismatch");
  if (value.routeId !== spec.routeId) blockers.push("evidence:racing-track-topology:route-mismatch");
  if (value.vehicleAsset !== racing.vehicleAsset) blockers.push("evidence:racing-track-topology:vehicle-mismatch");
  if (value.trackAsset !== racing.trackAsset) blockers.push("evidence:racing-track-topology:track-mismatch");
  if (value.topologySource !== racing.raceDesign.visibleTrackTopology) blockers.push("evidence:racing-track-topology:source-mismatch");
  if (!isReleaseSafeRacingTopology(stringValue(value.topologySource))) {
    blockers.push(`evidence:racing-track-topology:topology-not-release-safe:${stringValue(value.topologySource)}`);
  }
  blockers.push(...validateRacingAssetBinding(spec, value));
  if (!topology) {
    blockers.push("evidence:racing-track-topology:missing-structured-topology");
  } else {
    if (topology.assetId !== racing.trackAsset) blockers.push("evidence:racing-track-topology:structured-topology-track-mismatch");
    if (!isPublicGameGeometrySource(topology.source)) {
      blockers.push(`evidence:racing-track-topology:structured-topology-source-not-overlay-validated:${stringValue(topology.source)}`);
    }
    if (stringValue(topology.source) !== "asset-mesh-extracted") {
      blockers.push(...validateCurrentRouteOverlayEvidence("evidence:racing-track-topology", topology.evidence, spec));
    }
    if (typeof topology.assetHash !== "string" || !topology.assetHash.startsWith("sha256-")) {
      blockers.push("evidence:racing-track-topology:structured-topology-asset-hash-missing");
    }
    if (typeof value.assetHash !== "string" || !value.assetHash.startsWith("sha256-")) {
      blockers.push("evidence:racing-track-topology:asset-hash-missing");
    } else if (topology.assetHash !== value.assetHash) {
      blockers.push("evidence:racing-track-topology:asset-hash-mismatch");
    }
    if (roadCenterline.length < 8) blockers.push(`evidence:racing-track-topology:structured-topology-too-few-points:${roadCenterline.length}`);
    if (topologyCheckpoints.length < racing.raceDesign.minCheckpoints) {
      blockers.push(`evidence:racing-track-topology:structured-topology-too-few-checkpoints:${topologyCheckpoints.length}`);
    }
    if (numberValue(topology.estimatedLapSeconds) < racing.raceDesign.minLapSeconds) {
      blockers.push(`evidence:racing-track-topology:structured-topology-lap-seconds-too-low:${numberValue(topology.estimatedLapSeconds)}`);
    }
    if (numberValue(topology.confidence) < 0.65) blockers.push(`evidence:racing-track-topology:confidence-too-low:${numberValue(topology.confidence)}`);
    blockers.push(...validateGeometryModelAlignment({
      label: "evidence:racing-track-topology:model-alignment",
      value: topology.modelAlignment,
      secondAxis: "z",
      spec
    }));
    blockers.push(...validateLiveRacingMeshExtraction(spec, topology, racing.raceDesign.minCheckpoints, context));
  }
  if (value.pass !== true) blockers.push("evidence:racing-track-topology:not-passing");
  if (points.length < 8) blockers.push(`evidence:racing-track-topology:too-few-points:${points.length}`);
  if (checkpoints.length < racing.raceDesign.minCheckpoints) {
    blockers.push(`evidence:racing-track-topology:too-few-checkpoints:${checkpoints.length}`);
  }
  if (numberValue(value.authoredLapSeconds) < racing.raceDesign.minLapSeconds) {
    blockers.push(`evidence:racing-track-topology:authored-lap-seconds-too-low:${numberValue(value.authoredLapSeconds)}`);
  }
  if (value.routeAlignedToTrackAsset !== true) blockers.push("evidence:racing-track-topology:route-not-aligned");
  if (value.carTrackScaleCompatible !== true) blockers.push("evidence:racing-track-topology:scale-incompatible");
  if (value.noDebugLocatorDisk !== true) blockers.push("evidence:racing-track-topology:debug-locator-disk-present");
  if (meshExtraction) {
    if (!isPassingGeometryExtractionStatus(meshExtraction.status)) blockers.push("evidence:racing-track-topology:mesh-extraction-not-passing");
    blockers.push(...stringArrayValue(meshExtraction.blockers).map((blocker) => `evidence:racing-track-topology:${blocker}`));
  }
  return blockers;
}

function validatePlatformerPlayableSurfaceEvidence(spec: ShowcaseSpec, value: unknown, context: EvidenceValidationContext): readonly string[] {
  if (!isRecord(value)) return ["evidence:platformer-playable-surface:invalid-json"];
  const platformer = spec.platformer;
  if (!platformer) return ["evidence:platformer-playable-surface:not-platformer-spec"];
  const surfaces = Array.isArray(value.surfaces) ? value.surfaces : [];
  const checkpoints = Array.isArray(value.checkpoints) ? value.checkpoints : [];
  const hazards = Array.isArray(value.hazards) ? value.hazards : [];
  const surfaceMap = recordValue(value.surfaceMap);
  const meshExtraction = recordValue(value.meshExtraction);
  const mapSurfaces = surfaceMap && Array.isArray(surfaceMap.surfaces) ? surfaceMap.surfaces : [];
  const playableMapSurfaceCount = countPublicPlayablePlatformerSurfaces(mapSurfaces);
  const blockers: string[] = [];
  if (value.schema !== "aura3d-platformer-playable-surfaces/1.0") blockers.push("evidence:platformer-playable-surface:schema-mismatch");
  if (value.routeId !== spec.routeId) blockers.push("evidence:platformer-playable-surface:route-mismatch");
  if (value.characterAsset !== platformer.characterAsset) blockers.push("evidence:platformer-playable-surface:character-mismatch");
  if (!sameStringSet(value.worldAssets, platformer.worldAssets)) blockers.push("evidence:platformer-playable-surface:world-assets-mismatch");
  if (value.surfaceSource !== platformer.levelDesign.playableSurfaceSource) {
    blockers.push("evidence:platformer-playable-surface:source-mismatch");
  }
  if (!isReleaseSafePlatformerSurfaceSource(stringValue(value.surfaceSource))) {
    blockers.push(`evidence:platformer-playable-surface:not-release-safe:${stringValue(value.surfaceSource)}`);
  }
  blockers.push(...validatePlatformerAssetBindings(spec, value));
  if (!surfaceMap) {
    blockers.push("evidence:platformer-playable-surface:missing-structured-surface-map");
  } else {
    if (!platformer.worldAssets.includes(stringValue(surfaceMap.assetId))) {
      blockers.push("evidence:platformer-playable-surface:structured-surface-map-world-mismatch");
    }
    if (!isPublicGameGeometrySource(surfaceMap.source)) {
      blockers.push(`evidence:platformer-playable-surface:structured-surface-map-source-not-overlay-validated:${stringValue(surfaceMap.source)}`);
    }
    if (stringValue(surfaceMap.source) !== "asset-mesh-extracted") {
      blockers.push(...validateCurrentRouteOverlayEvidence("evidence:platformer-playable-surface", surfaceMap.evidence, spec));
    }
    if (typeof surfaceMap.assetHash !== "string" || !surfaceMap.assetHash.startsWith("sha256-")) {
      blockers.push("evidence:platformer-playable-surface:structured-surface-map-asset-hash-missing");
    }
    if (typeof value.assetHash !== "string" || !value.assetHash.startsWith("sha256-")) {
      blockers.push("evidence:platformer-playable-surface:asset-hash-missing");
    } else if (surfaceMap.assetHash !== value.assetHash) {
      blockers.push("evidence:platformer-playable-surface:asset-hash-mismatch");
    }
    if (playableMapSurfaceCount < 5) {
      blockers.push(`evidence:platformer-playable-surface:structured-surface-map-too-few-playable-surfaces:${playableMapSurfaceCount}`);
    }
    if (numberValue(surfaceMap.estimatedCompletionSeconds) < platformer.levelDesign.minPlayableSeconds) {
      blockers.push(`evidence:platformer-playable-surface:structured-surface-map-seconds-too-low:${numberValue(surfaceMap.estimatedCompletionSeconds)}`);
    }
    if (numberValue(surfaceMap.characterScaleRatio) <= 0 || numberValue(surfaceMap.characterScaleRatio) > 1.25) {
      blockers.push(`evidence:platformer-playable-surface:character-scale-ratio-invalid:${numberValue(surfaceMap.characterScaleRatio)}`);
    }
    if (numberValue(surfaceMap.confidence) < 0.65) {
      blockers.push(`evidence:platformer-playable-surface:confidence-too-low:${numberValue(surfaceMap.confidence)}`);
    }
    blockers.push(...validateGeometryModelAlignment({
      label: "evidence:platformer-playable-surface:model-alignment",
      value: surfaceMap.modelAlignment,
      secondAxis: "y",
      spec
    }));
    blockers.push(...validateLivePlatformerMeshExtraction(spec, surfaceMap, context));
  }
  if (value.pass !== true) blockers.push("evidence:platformer-playable-surface:not-passing");
  if (surfaces.length < 4) blockers.push(`evidence:platformer-playable-surface:too-few-surfaces:${surfaces.length}`);
  if (checkpoints.length < platformer.levelDesign.minCheckpoints) {
    blockers.push(`evidence:platformer-playable-surface:too-few-checkpoints:${checkpoints.length}`);
  }
  if (platformer.levelDesign.requiresHazardRespawn && hazards.length === 0) {
    blockers.push("evidence:platformer-playable-surface:missing-hazards");
  }
  if (!isRecord(value.finish) || numberValue(value.finish.x) <= 0) blockers.push("evidence:platformer-playable-surface:missing-finish");
  if (numberValue(value.authoredPlayableSeconds) < platformer.levelDesign.minPlayableSeconds) {
    blockers.push(`evidence:platformer-playable-surface:authored-playable-seconds-too-low:${numberValue(value.authoredPlayableSeconds)}`);
  }
  if (value.styleCompatible !== true) blockers.push("evidence:platformer-playable-surface:style-incompatible");
  if (value.scaleCompatible !== true) blockers.push("evidence:platformer-playable-surface:scale-incompatible");
  if (value.primitivePrimaryWorldRejected !== true) blockers.push("evidence:platformer-playable-surface:primitive-primary-world-not-rejected");
  if (meshExtraction) {
    if (!isPassingGeometryExtractionStatus(meshExtraction.status)) blockers.push("evidence:platformer-playable-surface:mesh-extraction-not-passing");
    blockers.push(...stringArrayValue(meshExtraction.blockers).map((blocker) => `evidence:platformer-playable-surface:${blocker}`));
  }
  return blockers;
}

function validateLiveRacingMeshExtraction(
  spec: ShowcaseSpec,
  topology: Readonly<Record<string, unknown>>,
  minCheckpoints: number,
  context: EvidenceValidationContext
): readonly string[] {
  if (stringValue(topology.source) !== "asset-mesh-extracted") return [];
  const racing = spec.racing;
  if (!racing) return [];
  const extracted = extractRacingTrackTopologyFromAsset(racing.trackAsset, { projectDir: context.projectDir });
  if (!extracted.ok) {
    return [
      "evidence:racing-track-topology:mesh-extraction-not-passing",
      ...extracted.blockers.map((blocker) => `evidence:racing-track-topology:${blocker}`)
    ];
  }

  const blockers: string[] = [];
  if (extracted.value.assetHash !== stringValue(topology.assetHash)) {
    blockers.push("evidence:racing-track-topology:live-asset-hash-mismatch");
  }
  if (extracted.value.checkpoints.length < minCheckpoints) {
    blockers.push(`evidence:racing-track-topology:live-extraction-too-few-checkpoints:${extracted.value.checkpoints.length}`);
  }
  if (extracted.value.roadCenterline.length < 8) {
    blockers.push(`evidence:racing-track-topology:live-extraction-too-few-points:${extracted.value.roadCenterline.length}`);
  }
  return blockers;
}

function validateLivePlatformerMeshExtraction(
  spec: ShowcaseSpec,
  surfaceMap: Readonly<Record<string, unknown>>,
  context: EvidenceValidationContext
): readonly string[] {
  if (stringValue(surfaceMap.source) !== "asset-mesh-extracted") return [];
  const platformer = spec.platformer;
  if (!platformer) return [];
  const worldAsset = stringValue(surfaceMap.assetId);
  if (!platformer.worldAssets.includes(worldAsset)) return ["evidence:platformer-playable-surface:live-extraction-world-mismatch"];
  const extracted = extractPlatformerPlayableSurfaceMapFromAsset(worldAsset, {
    projectDir: context.projectDir,
    characterAssetId: platformer.characterAsset,
    characterScaleRatio: platformer.levelDesign.playableSurfaceMap?.characterScaleRatio ?? 0.42
  });
  if (!extracted.ok) {
    return [
      "evidence:platformer-playable-surface:mesh-extraction-not-passing",
      ...extracted.blockers.map((blocker) => `evidence:platformer-playable-surface:${blocker}`)
    ];
  }

  const blockers: string[] = [];
  if (extracted.value.assetHash !== stringValue(surfaceMap.assetHash)) {
    blockers.push("evidence:platformer-playable-surface:live-asset-hash-mismatch");
  }
  const playableSurfaceCount = countPublicPlayablePlatformerSurfaces(extracted.value.surfaces);
  if (playableSurfaceCount < 5) {
    blockers.push(`evidence:platformer-playable-surface:live-extraction-too-few-playable-surfaces:${playableSurfaceCount}`);
  }
  if (extracted.value.estimatedCompletionSeconds < platformer.levelDesign.minPlayableSeconds) {
    blockers.push(`evidence:platformer-playable-surface:live-extraction-seconds-too-low:${extracted.value.estimatedCompletionSeconds}`);
  }
  return blockers;
}

function validateRacingAssetBinding(spec: ShowcaseSpec, value: Readonly<Record<string, unknown>>): readonly string[] {
  const racing = spec.racing;
  if (!racing) return [];
  const assetBinding = recordValue(value.assetBinding);
  if (value.topologySource === "mesh-road-topology") return [];
  const blockers: string[] = [];
  if (!assetBinding) return ["evidence:racing-track-topology:missing-asset-binding"];
  if (assetBinding.kind !== "aura-game-asset-bound-racing-route") {
    blockers.push("evidence:racing-track-topology:asset-binding-kind-mismatch");
  }
  if (assetBinding.vehicleAsset !== racing.vehicleAsset) {
    blockers.push("evidence:racing-track-topology:asset-binding-vehicle-mismatch");
  }
  if (assetBinding.trackAsset !== racing.trackAsset) {
    blockers.push("evidence:racing-track-topology:asset-binding-track-mismatch");
  }
  if (typeof assetBinding.trackAssetHash !== "string" || !assetBinding.trackAssetHash.startsWith("sha256-")) {
    blockers.push("evidence:racing-track-topology:asset-binding-track-hash-missing");
  } else if (typeof value.assetHash === "string" && assetBinding.trackAssetHash !== value.assetHash) {
    blockers.push("evidence:racing-track-topology:asset-binding-track-hash-mismatch");
  }
  if (!isPublicGameGeometrySource(assetBinding.topologySource)) {
    blockers.push(`evidence:racing-track-topology:asset-binding-source-not-overlay-validated:${stringValue(assetBinding.topologySource)}`);
  }
  if (assetBinding.layoutContractVersion !== "1.0") {
    blockers.push("evidence:racing-track-topology:asset-binding-version-missing");
  }
  return blockers;
}

function validatePlatformerAssetBindings(spec: ShowcaseSpec, value: Readonly<Record<string, unknown>>): readonly string[] {
  const platformer = spec.platformer;
  if (!platformer) return [];
  if (value.surfaceSource === "asset-derived-playable-surfaces") return [];
  const assetBindings = Array.isArray(value.assetBindings) ? value.assetBindings : [];
  const blockers: string[] = [];
  if (assetBindings.length === 0) return ["evidence:platformer-playable-surface:missing-asset-bindings"];
  const boundWorlds = new Set<string>();
  for (const bindingValue of assetBindings) {
    const binding = recordValue(bindingValue);
    if (!binding) {
      blockers.push("evidence:platformer-playable-surface:asset-binding-invalid");
      continue;
    }
    if (binding.kind !== "aura-game-asset-bound-platformer-level") {
      blockers.push("evidence:platformer-playable-surface:asset-binding-kind-mismatch");
    }
    if (binding.characterAsset !== platformer.characterAsset) {
      blockers.push("evidence:platformer-playable-surface:asset-binding-character-mismatch");
    }
    if (binding.layoutContractVersion !== "1.0") {
      blockers.push("evidence:platformer-playable-surface:asset-binding-version-missing");
    }
    const worldAsset = typeof binding.worldAsset === "string" ? binding.worldAsset : undefined;
    if (worldAsset) boundWorlds.add(worldAsset);
    if (binding.worldAssetHash === undefined) {
      blockers.push(`evidence:platformer-playable-surface:asset-binding-world-hash-missing:${worldAsset ?? "unknown"}`);
    } else if (typeof binding.worldAssetHash !== "string" || !binding.worldAssetHash.startsWith("sha256-")) {
      blockers.push(`evidence:platformer-playable-surface:asset-binding-world-hash-invalid:${worldAsset ?? "unknown"}`);
    } else if (typeof value.assetHash === "string" && binding.worldAssetHash !== value.assetHash) {
      blockers.push(`evidence:platformer-playable-surface:asset-binding-world-hash-mismatch:${worldAsset ?? "unknown"}`);
    }
    if (!isPublicGameGeometrySource(binding.surfaceSource)) {
      blockers.push(`evidence:platformer-playable-surface:asset-binding-source-not-overlay-validated:${worldAsset ?? "unknown"}:${stringValue(binding.surfaceSource)}`);
    }
    const surfaceIds = Array.isArray(binding.surfaceIds) ? binding.surfaceIds.filter((surfaceId): surfaceId is string => typeof surfaceId === "string") : [];
    if (surfaceIds.length === 0) {
      blockers.push(`evidence:platformer-playable-surface:asset-binding-empty-surfaces:${worldAsset ?? "unknown"}`);
    }
  }
  for (const worldAsset of platformer.worldAssets) {
    if (!boundWorlds.has(worldAsset)) blockers.push(`evidence:platformer-playable-surface:asset-binding-world-missing:${worldAsset}`);
  }
  return blockers;
}

function isReleaseSafeRacingTopology(source: string): boolean {
  return source === "asset-bound-road-topology" || source === "mesh-road-topology";
}

function isReleaseSafePlatformerSurfaceSource(source: string): boolean {
  return source === "asset-bound-playable-surfaces" || source === "asset-derived-playable-surfaces";
}

function isPublicGameGeometrySource(source: unknown): boolean {
  const value = stringValue(source);
  return value === "asset-mesh-extracted" || value === "manifest-authored-overlay-validated" || value === "compiler-authored-overlay-validated";
}

function isPassingGeometryExtractionStatus(status: unknown): boolean {
  return status === "pass" || status === "overlay-validated";
}

function validateCurrentRouteOverlayEvidence(label: string, value: unknown, spec: ShowcaseSpec): readonly string[] {
  const evidence = recordValue(value);
  if (typeof evidence?.routeOverlay !== "string" || evidence.routeOverlay.length === 0) return [`${label}:missing-route-overlay-evidence`];
  return evidence.routeOverlay === spec.evidence.routePrimaryScreenshot ? [] : [`${label}:route-overlay-not-current-route-primary`];
}

function validateGeometryModelAlignment(input: GeometryModelAlignmentValidationInput): readonly string[] {
  const { label, value, secondAxis, spec } = input;
  const alignment = recordValue(value);
  if (!alignment) return [`${label}:missing`];
  const blockers: string[] = [];
  const modelBounds = recordValue(alignment.modelBounds);
  const modelMin = Array.isArray(modelBounds?.min) ? modelBounds.min : undefined;
  const modelMax = Array.isArray(modelBounds?.max) ? modelBounds.max : undefined;
  const modelPoint = Array.isArray(alignment.modelPoint) ? alignment.modelPoint : undefined;
  const gamePoint = recordValue(alignment.gamePoint);
  const alignmentSource = stringValue(alignment.source);
  const anchorPairs = Array.isArray(alignment.anchorPairs) ? alignment.anchorPairs : [];
  if (!isPublicGameGeometrySource(alignmentSource)) {
    blockers.push(`${label}:source-not-overlay-validated:${alignmentSource}`);
  }
  if (alignmentSource !== "asset-mesh-extracted") {
    blockers.push(...validateCurrentRouteOverlayEvidence(label, alignment.evidence, spec));
    if (!Array.isArray(alignment.anchorPairs)) {
      blockers.push(`${label}:anchor-pairs-missing`);
    } else if (anchorPairs.length < 2) {
      blockers.push(`${label}:too-few-anchor-pairs:${anchorPairs.length}`);
    }
  }
  if (!modelBounds) {
    blockers.push(`${label}:missing-model-bounds`);
  } else {
    blockers.push(...validateVec3(`${label}:model-bounds-min`, modelMin));
    blockers.push(...validateVec3(`${label}:model-bounds-max`, modelMax));
    if (modelMin && modelMax) {
      const dimensions = modelMin.map((min, index) => numberValue(modelMax[index]) - numberValue(min));
      if (dimensions.some((dimension) => dimension <= 0)) blockers.push(`${label}:invalid-model-bounds`);
    }
  }
  blockers.push(...validateVec3(`${label}:model-point`, modelPoint));
  if (modelMin && modelMax && modelPoint && blockers.length === 0) {
    for (let index = 0; index < 3; index += 1) {
      const point = numberValue(modelPoint[index]);
      if (point < numberValue(modelMin[index]) || point > numberValue(modelMax[index])) {
        blockers.push(`${label}:model-point-outside-bounds`);
        break;
      }
    }
  }
  if (!gamePoint) {
    blockers.push(`${label}:missing-game-point`);
  } else {
    if (!hasFiniteNumber(gamePoint.x)) blockers.push(`${label}:missing-game-point-x`);
    if (!hasFiniteNumber(gamePoint[secondAxis])) blockers.push(`${label}:missing-game-point-${secondAxis}`);
  }
  blockers.push(...validateGeometryAnchorPairs({
    label,
    values: anchorPairs,
    secondAxis,
    modelMin,
    modelMax
  }));
  const evidence = recordValue(alignment.evidence);
  if (!evidence || stringValue(evidence.notes) === "missing") blockers.push(`${label}:missing-notes`);
  return blockers;
}

function validateGeometryAnchorPairs(input: {
  readonly label: string;
  readonly values: readonly unknown[];
  readonly secondAxis: "y" | "z";
  readonly modelMin: readonly unknown[] | undefined;
  readonly modelMax: readonly unknown[] | undefined;
}): readonly string[] {
  const blockers: string[] = [];
  for (const [index, value] of input.values.entries()) {
    const anchor = recordValue(value);
    if (!anchor) {
      blockers.push(`${input.label}:anchor-pair-invalid:${index}`);
      continue;
    }
    if (typeof anchor.id !== "string" || anchor.id.trim().length === 0) {
      blockers.push(`${input.label}:anchor-pair-id-missing:${index}`);
    }
    const modelPoint = Array.isArray(anchor.modelPoint) ? anchor.modelPoint : undefined;
    blockers.push(...validateVec3(`${input.label}:anchor-pair-model-point:${index}`, modelPoint));
    if (input.modelMin && input.modelMax && modelPoint) {
      for (let coordinate = 0; coordinate < 3; coordinate += 1) {
        const point = numberValue(modelPoint[coordinate]);
        if (point < numberValue(input.modelMin[coordinate]) || point > numberValue(input.modelMax[coordinate])) {
          blockers.push(`${input.label}:anchor-pair-model-point-outside-bounds:${index}`);
          break;
        }
      }
    }
    const gamePoint = recordValue(anchor.gamePoint);
    if (!gamePoint) {
      blockers.push(`${input.label}:anchor-pair-game-point-missing:${index}`);
    } else {
      if (!hasFiniteNumber(gamePoint.x)) blockers.push(`${input.label}:anchor-pair-game-point-x-missing:${index}`);
      if (!hasFiniteNumber(gamePoint[input.secondAxis])) {
        blockers.push(`${input.label}:anchor-pair-game-point-${input.secondAxis}-missing:${index}`);
      }
    }
  }
  return blockers;
}

function validateVec3(label: string, value: readonly unknown[] | undefined): readonly string[] {
  if (!value || value.length !== 3) return [`${label}:invalid`];
  return value.every((item) => hasFiniteNumber(item)) ? [] : [`${label}:invalid`];
}

function hasFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function sameStringSet(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value)) return false;
  const actualSet = new Set(value.filter((item): item is string => typeof item === "string"));
  return actualSet.size === expected.length && expected.every((item) => actualSet.has(item));
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}

function countPublicPlayablePlatformerSurfaces(surfaces: readonly unknown[]): number {
  return surfaces.filter((surface) => {
    const record = recordValue(surface);
    return record?.kind === "ground" || record?.kind === "platform" || record?.kind === "moving";
  }).length;
}

function validateDeployReport(spec: ShowcaseSpec, value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.routes)) return ["evidence:deploy-artifact:invalid-launch-evidence"];

  const route = value.routes.find((candidate) => isRecord(candidate) && candidate.deployCheckCommand === spec.evidence.deployCommand);
  if (!isRecord(route)) return ["evidence:deploy-artifact:command-mismatch"];

  const blockers: string[] = [];
  if (route.deployCheckOk !== true) blockers.push("evidence:deploy-artifact:not-passing");
  if (Array.isArray(route.deployWarnings) && route.deployWarnings.length > 0) blockers.push("evidence:deploy-artifact:has-warnings");
  if (Array.isArray(route.deployFailures) && route.deployFailures.length > 0) blockers.push("evidence:deploy-artifact:has-failures");
  for (const asset of spec.primaryAssets) {
    if (!deployReportIncludesAsset(route, asset.id)) blockers.push(`evidence:deploy-artifact:missing-asset:${asset.id}`);
  }
  return blockers;
}

function deployReportIncludesAsset(route: Readonly<Record<string, unknown>>, assetId: string): boolean {
  const evidence = route.primaryAssetEvidence;
  return Array.isArray(evidence) && evidence.some((asset) => isRecord(asset) && asset.id === assetId);
}

function routePrimaryAssetsInclude(probe: Readonly<Record<string, unknown>>, assetId: string): boolean {
  const primaryAssets = probe.primaryAssets;
  return Array.isArray(primaryAssets) && primaryAssets.some((asset) => isRecord(asset) && asset.id === assetId);
}

function routePrimaryScreenshotMatches(probe: Readonly<Record<string, unknown>>, screenshotPath: string): boolean {
  return routePrimaryRenderedProbeForScreenshot(probe, screenshotPath) !== undefined;
}

function routePrimaryRenderedProbeForScreenshot(
  probe: Readonly<Record<string, unknown>>,
  screenshotPath: string
): Readonly<Record<string, unknown>> | undefined {
  const primaryAssets = probe.primaryAssets;
  if (!Array.isArray(primaryAssets)) return undefined;
  for (const asset of primaryAssets) {
    if (isRecord(asset) && isRecord(asset.renderedProbe) && asset.renderedProbe.screenshotPath === screenshotPath) {
      return asset.renderedProbe;
    }
  }
  return undefined;
}

function routePrimaryScreenshotSha256(probe: Readonly<Record<string, unknown>>, screenshotPath: string): string | undefined {
  const renderedProbe = routePrimaryRenderedProbeForScreenshot(probe, screenshotPath);
  const sha256 = renderedProbe?.sha256;
  return isSha256(sha256) ? sha256 : undefined;
}

function validatePngFileSha256(
  label: string,
  filePath: string,
  expectedSha256: string,
  context: EvidenceValidationContext
): readonly string[] {
  const existingPath = resolveEvidencePath(filePath, context);
  if (!existingPath) return [`${label}:missing-file`];
  const bytes = readFileSync(existingPath);
  const blockers: string[] = [];
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) blockers.push(`${label}:not-png`);
  const actualSha256 = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
  if (actualSha256 !== expectedSha256) blockers.push(`${label}:file-sha256-mismatch`);
  return blockers;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256-[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "missing";
}

function stringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
