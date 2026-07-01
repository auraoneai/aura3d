import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createEvidenceChecklist,
  createReadme,
  createRouteGatePatch,
  createRouteHealth,
  createRouteSource
} from "./showcase-spec-artifacts.js";
import { compileCategoryPlanBlockers } from "./showcase-spec-category-plan.js";
import { compileEvidenceBlockers, type EvidenceValidationContext } from "./showcase-spec-evidence.js";
import { applyGeneratedGameTemplateEvidence } from "./showcase-spec-game-template-evidence.js";
import { parseShowcaseSpec } from "./showcase-spec-parser.js";
import { resolveShowcaseSpecReplacements } from "./showcase-spec-replacement.js";
import type {
  CompileShowcaseSpecFileOptions,
  CompileShowcaseSpecOptions,
  CompileShowcaseSpecReport,
  ShowcasePlatformerGameplayRequirement,
  ShowcaseRacingGameplayRequirement,
  ShowcaseSpec,
  ShowcaseSpecFinalStatus
} from "./showcase-spec-types.js";

export type {
  CompileShowcaseSpecFileOptions,
  CompileShowcaseSpecOptions,
  CompileShowcaseSpecReport,
  ShowcaseCategoryBackendClaim,
  ShowcaseCategoryCameraIntent,
  ShowcaseCategoryPlan,
  ShowcaseCategoryPlanKind,
  ShowcaseSpec,
  ShowcaseSpecAsset,
  ShowcaseSpecAssetPolicy,
  ShowcaseSpecCapability,
  ShowcaseSpecClaimLabel,
  ShowcaseSpecFinalStatus,
  ShowcaseSpecRejectedAsset,
  ShowcaseSpecReplacementCandidate,
  ShowcaseSpecReplacementRequiredRole,
  ShowcaseSpecSelectedReplacement,
  ShowcasePlatformerGameplayRequirement,
  ShowcasePlatformerSpec,
  ShowcaseRacingGameplayRequirement,
  ShowcaseRacingSpec
} from "./showcase-spec-types.js";

export function compileShowcaseSpecFile(options: CompileShowcaseSpecFileOptions): CompileShowcaseSpecReport {
  const rawSpec: unknown = JSON.parse(readFileSync(resolve(options.specPath), "utf8"));
  return compileShowcaseSpec(rawSpec, options);
}

export function compileShowcaseSpec(input: unknown, options: CompileShowcaseSpecOptions): CompileShowcaseSpecReport {
  const parsedSpec = parseShowcaseSpec(input);
  const replacement = resolveShowcaseSpecReplacements(parsedSpec, { projectDir: options.projectDir });
  const outputDir = resolve(options.outputDir);
  mkdirSync(join(outputDir, "src"), { recursive: true });
  const templateEvidence = applyGeneratedGameTemplateEvidence(replacement.spec, { projectDir: options.projectDir });
  const spec = templateEvidence.spec;
  writeArtifacts(outputDir, templateEvidence.artifacts);
  const blockers = [
    ...replacement.blockers,
    ...compileBlockers(spec, { artifactRoot: outputDir, projectDir: options.projectDir })
  ];
  const finalStatus = chooseFinalStatus(spec, blockers);

  const generatedFiles = writeArtifacts(outputDir, {
    ...templateEvidence.artifacts,
    "src/main.ts": createRouteSource(spec),
    "README.md": createReadme(spec, finalStatus, blockers),
    "route-health.json": createRouteHealth(spec, finalStatus, blockers),
    "route-gate.patch.json": createRouteGatePatch(spec, finalStatus),
    "showcase-evidence-checklist.json": createEvidenceChecklist(spec, finalStatus, blockers)
  });

  const report: CompileShowcaseSpecReport = {
    ok: blockers.length === 0 && finalStatus === "release-ready candidate",
    schema: "aura3d-showcase-spec-compile-report/1.0",
    routeId: spec.routeId,
    finalStatus,
    generatedFiles: [...generatedFiles, "showcase-spec-compile-report.json"].sort(),
    blockers,
    evidenceChecklistPath: join(outputDir, "showcase-evidence-checklist.json"),
    routeGatePatchPath: join(outputDir, "route-gate.patch.json"),
    rejectedAssets: replacement.rejectedAssets,
    replacementCandidates: replacement.replacementCandidates,
    ...(replacement.selectedReplacement ? { selectedReplacement: replacement.selectedReplacement } : {})
  };
  writeArtifact(outputDir, "showcase-spec-compile-report.json", report);
  return report;
}

function compileBlockers(spec: ShowcaseSpec, evidenceContext: EvidenceValidationContext): readonly string[] {
  if (spec.publicStatus !== "release-ready candidate") return compileCategoryPlanBlockers(spec);

  const blockers: string[] = [];
  for (const asset of spec.primaryAssets) {
    if (asset.quality !== "release") blockers.push(`asset:${asset.id}:quality-not-release`);
    if (!asset.hasDurableProvenance) blockers.push(`asset:${asset.id}:missing-durable-provenance`);
    if (!asset.hasRenderedProbe) blockers.push(`asset:${asset.id}:missing-rendered-probe`);
    if (!asset.hasOrientationEvidence) blockers.push(`asset:${asset.id}:missing-orientation-evidence`);
    if (!asset.hasForegroundBounds) blockers.push(`asset:${asset.id}:missing-foreground-bounds`);
  }
  if (!spec.evidence.deployPassed) blockers.push("evidence:deploy-not-passed");
  if (!spec.evidence.routePrimaryPassed) blockers.push("evidence:route-primary-not-passed");
  if (spec.category.includes("game") && spec.evidence.gameplayPassed !== true) blockers.push("evidence:gameplay-not-passed");
  blockers.push(...compilePlatformerBlockers(spec));
  blockers.push(...compileRacingBlockers(spec));
  blockers.push(...compileCategoryPlanBlockers(spec));
  blockers.push(...compileEvidenceBlockers(spec, evidenceContext));
  blockers.push(...compileClaimBlockers(spec));
  return blockers;
}

function compileClaimBlockers(spec: ShowcaseSpec): readonly string[] {
  const blockers: string[] = [];
  if (spec.claimLabel !== "createAuraApp") blockers.push(`claim-label:${spec.claimLabel}:not-release-safe`);
  if (spec.capabilities.length === 0) blockers.push("capability:missing-bounded-claim-evidence");
  for (const capability of spec.capabilities) {
    if (capability.status === "unsupported") blockers.push(`capability:${capability.name}:unsupported`);
    if (!capability.evidence) blockers.push(`capability:${capability.name}:missing-evidence`);
    if (capability.status !== "root-proven") blockers.push(`capability:${capability.name}:not-release-safe:${capability.status}`);
  }
  return blockers;
}

function compilePlatformerBlockers(spec: ShowcaseSpec): readonly string[] {
  if (spec.category !== "game-platformer" || !spec.platformer) return [];
  const blockers: string[] = [];
  const characterAsset = spec.primaryAssets.find((asset) => asset.id === spec.platformer?.characterAsset);
  if (!characterAsset) {
    blockers.push(`platformer:character-missing:${spec.platformer.characterAsset}`);
  } else if (characterAsset.role !== spec.platformer.releaseAssetRequirements.characterRole) {
    blockers.push(`platformer:character-role-mismatch:${characterAsset.id}:${characterAsset.role}`);
  }
  for (const assetId of spec.platformer.worldAssets) {
    const asset = spec.primaryAssets.find((candidate) => candidate.id === assetId);
    if (!asset) blockers.push(`platformer:world-asset-missing:${assetId}`);
    else if (!isPlatformerWorldRole(asset.role) || !spec.platformer.releaseAssetRequirements.worldRoles.includes(asset.role)) {
      blockers.push(`platformer:world-role-mismatch:${asset.id}:${asset.role}`);
    }
  }
  if (!spec.platformer.layoutConstraints.keepCharacterReadable) blockers.push("platformer:layout:character-readability-not-required");
  if (!spec.platformer.layoutConstraints.uiAvoidsEvidenceArea) blockers.push("platformer:layout:ui-can-occlude-evidence");
  if (!spec.platformer.gameplayRequirements.includes("movement")) blockers.push("platformer:gameplay:missing-movement-requirement");
  if (!spec.platformer.gameplayRequirements.includes("jump")) blockers.push("platformer:gameplay:missing-jump-requirement");
  if (!hasProgressionRequirement(spec.platformer.gameplayRequirements)) blockers.push("platformer:gameplay:missing-progression-or-checkpoint-requirement");
  if (spec.platformer.levelDesign.minPlayableSeconds < 30) {
    blockers.push(`platformer:design:min-playable-seconds-too-low:${spec.platformer.levelDesign.minPlayableSeconds}`);
  }
  if (spec.platformer.levelDesign.minCheckpoints < 3) {
    blockers.push(`platformer:design:min-checkpoints-too-low:${spec.platformer.levelDesign.minCheckpoints}`);
  }
  if (!spec.platformer.levelDesign.requiresHazardRespawn) blockers.push("platformer:design:hazard-respawn-not-required");
  if (!spec.platformer.levelDesign.requiresFinish) blockers.push("platformer:design:finish-not-required");
  if (!spec.platformer.levelDesign.authoredLevelFlow) blockers.push("platformer:design:authored-level-flow-missing");
  if (!isReleaseSafePlatformerSurfaceSource(spec.platformer.levelDesign.playableSurfaceSource)) {
    blockers.push(`platformer:design:missing-release-safe-playable-surfaces:${spec.platformer.levelDesign.playableSurfaceSource}`);
  }
  if (!spec.platformer.levelDesign.playableSurfaceLayoutValidated) blockers.push("platformer:design:playable-surface-layout-not-validated");
  if (!spec.platformer.levelDesign.playableSurfaceEvidence) blockers.push("platformer:design:missing-playable-surface-evidence");
  if (!spec.platformer.levelDesign.characterWorldScaleCompatible) blockers.push("platformer:asset-fit:character-world-scale-incompatible");
  if (!spec.platformer.levelDesign.styleCompatible) blockers.push("platformer:asset-fit:style-incompatible");
  if (!spec.platformer.levelDesign.primitivePrimaryWorldRejected) blockers.push("platformer:visual:primitive-primary-world-not-rejected");
  return blockers;
}

function hasProgressionRequirement(requirements: readonly ShowcasePlatformerGameplayRequirement[]): boolean {
  return requirements.includes("checkpoint") || requirements.includes("progression");
}

function compileRacingBlockers(spec: ShowcaseSpec): readonly string[] {
  if (spec.category !== "game-racing" || !spec.racing) return [];
  const blockers: string[] = [];
  const vehicleAsset = spec.primaryAssets.find((asset) => asset.id === spec.racing?.vehicleAsset);
  const trackAsset = spec.primaryAssets.find((asset) => asset.id === spec.racing?.trackAsset);
  if (!vehicleAsset) {
    blockers.push(`racing:vehicle-missing:${spec.racing.vehicleAsset}`);
  } else if (vehicleAsset.role !== spec.racing.releaseAssetRequirements.vehicleRole) {
    blockers.push(`racing:vehicle-role-mismatch:${vehicleAsset.id}:${vehicleAsset.role}`);
  }
  if (!trackAsset) {
    blockers.push(`racing:track-missing:${spec.racing.trackAsset}`);
  } else if (trackAsset.role !== spec.racing.releaseAssetRequirements.trackRole) {
    blockers.push(`racing:track-role-mismatch:${trackAsset.id}:${trackAsset.role}`);
  }
  if (!spec.racing.layoutConstraints.keepVehicleReadable) blockers.push("racing:layout:vehicle-readability-not-required");
  if (!spec.racing.layoutConstraints.keepTrackReadable) blockers.push("racing:layout:track-readability-not-required");
  if (!spec.racing.layoutConstraints.uiAvoidsEvidenceArea) blockers.push("racing:layout:ui-can-occlude-evidence");
  if (!spec.racing.gameplayRequirements.includes("throttle")) blockers.push("racing:gameplay:missing-throttle-requirement");
  if (!spec.racing.gameplayRequirements.includes("steering")) blockers.push("racing:gameplay:missing-steering-requirement");
  if (!spec.racing.gameplayRequirements.includes("reset")) blockers.push("racing:gameplay:missing-reset-requirement");
  if (!hasRacingProgressionRequirement(spec.racing.gameplayRequirements)) blockers.push("racing:gameplay:missing-checkpoint-or-lap-requirement");
  if (!spec.racing.gameplayRequirements.includes("multi-lap")) blockers.push("racing:gameplay:missing-multi-lap-requirement");
  if (spec.racing.raceDesign.minCheckpoints < 4) blockers.push(`racing:design:min-checkpoints-too-low:${spec.racing.raceDesign.minCheckpoints}`);
  if (spec.racing.raceDesign.minLaps < 2) blockers.push(`racing:design:min-laps-too-low:${spec.racing.raceDesign.minLaps}`);
  if (spec.racing.raceDesign.minLapSeconds < 30) blockers.push(`racing:design:min-lap-seconds-too-low:${spec.racing.raceDesign.minLapSeconds}`);
  if (!spec.racing.raceDesign.routeAlignedToTrackAsset) blockers.push("racing:design:route-not-aligned-to-track-asset");
  if (!isReleaseSafeRacingTopology(spec.racing.raceDesign.visibleTrackTopology)) {
    blockers.push(`racing:design:missing-release-safe-track-topology:${spec.racing.raceDesign.visibleTrackTopology}`);
  }
  if (!spec.racing.raceDesign.trackTopologyEvidence) blockers.push("racing:design:missing-track-topology-evidence");
  if (!spec.racing.raceDesign.carTrackScaleCompatible) blockers.push("racing:asset-fit:car-track-scale-incompatible");
  if (!spec.racing.raceDesign.noDebugLocatorDisk) blockers.push("racing:visual:debug-locator-disk-not-rejected");
  return blockers;
}

function hasRacingProgressionRequirement(requirements: readonly ShowcaseRacingGameplayRequirement[]): boolean {
  return requirements.includes("checkpoint") || requirements.includes("lap");
}

function isReleaseSafePlatformerSurfaceSource(source: string): boolean {
  return source === "asset-bound-playable-surfaces" || source === "asset-derived-playable-surfaces";
}

function isReleaseSafeRacingTopology(source: string): boolean {
  return source === "asset-bound-road-topology" || source === "mesh-road-topology";
}

function isPlatformerWorldRole(role: string): role is "level" | "world" | "stage" {
  return role === "level" || role === "world" || role === "stage";
}

function chooseFinalStatus(spec: ShowcaseSpec, blockers: readonly string[]): ShowcaseSpecFinalStatus {
  if (blockers.length === 0) return spec.publicStatus;
  if (spec.publicStatus === "internal-diagnostic" || spec.publicStatus === "removed-from-public-showcase") return spec.publicStatus;
  return "prototype-blocked";
}

function writeArtifacts(outputDir: string, artifacts: Readonly<Record<string, unknown | string>>): readonly string[] {
  const generatedFiles: string[] = [];
  for (const [relativePath, artifact] of Object.entries(artifacts)) {
    writeArtifact(outputDir, relativePath, artifact);
    generatedFiles.push(relativePath);
  }
  return generatedFiles;
}

function writeArtifact(outputDir: string, relativePath: string, artifact: unknown | string): void {
  const path = join(outputDir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const text = typeof artifact === "string" ? artifact : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(path, text);
}
