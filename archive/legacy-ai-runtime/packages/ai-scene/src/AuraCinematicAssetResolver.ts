import { isMajorCinematicAssetIntent, type AuraAssetFallbackStrategy, type AuraAssetIntent } from "./AuraAssetIntent.js";
import { scoreCinematicAsset, sortAssetsBySemanticScore, type AuraAssetScoreBreakdown } from "./AuraAssetScoring.js";
import { createDomCssSubstituteRejectedDiagnostic, createUnresolvedAssetDiagnostic, type AuraAssetSubstitutionDiagnostic } from "./AuraAssetSubstitution.js";
import { AURA_CINEMATIC_ASSET_MANIFEST, type AuraCinematicAssetManifest, type AuraCinematicAssetManifestEntry, type AuraCinematicAssetProvenance } from "./AuraCinematicAssetManifest.js";
import { buildRainyNeonAlleySet } from "./AuraProceduralAlleyBuilder.js";
import { buildProceduralNatureSet } from "./AuraProceduralNatureBuilder.js";
import { buildProceduralStudioSet } from "./AuraProceduralStudioBuilder.js";
import type { AuraProceduralSetBuild } from "./AuraProceduralSetBuilder.js";

export interface AuraCinematicResolvedAsset {
  readonly intentId: string;
  readonly assetId: string;
  readonly label: string;
  readonly uri: string;
  readonly category: AuraAssetIntent["category"];
  readonly strategy: "manifest-asset" | "procedural-set" | "procedural-mesh" | "renderer-material";
  readonly score: AuraAssetScoreBreakdown;
  readonly provenance: AuraCinematicAssetProvenance;
  readonly storyBlocking?: AuraCinematicAssetManifestEntry["storyBlocking"];
  readonly lightMetadata?: AuraCinematicAssetManifestEntry["lightMetadata"];
}

export interface AuraCinematicUnresolvedAsset {
  readonly intentId: string;
  readonly label: string;
  readonly required: boolean;
  readonly attemptedFallbacks: readonly AuraAssetFallbackStrategy[];
}

export interface AuraCinematicAssetResolutionReport {
  readonly networkUsed: false;
  readonly resolved: readonly AuraCinematicResolvedAsset[];
  readonly proceduralSets: readonly AuraProceduralSetBuild[];
  readonly unresolved: readonly AuraCinematicUnresolvedAsset[];
  readonly diagnostics: readonly AuraAssetSubstitutionDiagnostic[];
}

export interface AuraCinematicAssetResolver {
  readonly manifest: AuraCinematicAssetManifest;
  resolve(intents: readonly AuraAssetIntent[]): AuraCinematicAssetResolutionReport;
  resolveOne(intent: AuraAssetIntent): AuraCinematicAssetResolutionReport;
}

export interface AuraCinematicAssetResolverOptions {
  readonly manifest?: AuraCinematicAssetManifest;
  readonly minimumScore?: number;
}

export function createCinematicAssetResolver(options: AuraCinematicAssetResolverOptions = {}): AuraCinematicAssetResolver {
  const manifest = options.manifest ?? AURA_CINEMATIC_ASSET_MANIFEST;
  const minimumScore = options.minimumScore ?? 28;
  return {
    manifest,
    resolve(intents) {
      const reports = intents.map((intent) => resolveIntent(intent, manifest, minimumScore));
      return {
        networkUsed: false,
        resolved: reports.flatMap((report) => report.resolved),
        proceduralSets: dedupeProceduralSets(reports.flatMap((report) => report.proceduralSets)),
        unresolved: reports.flatMap((report) => report.unresolved),
        diagnostics: reports.flatMap((report) => report.diagnostics)
      };
    },
    resolveOne(intent) {
      return resolveIntent(intent, manifest, minimumScore);
    }
  };
}

function resolveIntent(intent: AuraAssetIntent, manifest: AuraCinematicAssetManifest, minimumScore: number): AuraCinematicAssetResolutionReport {
  const diagnostics: AuraAssetSubstitutionDiagnostic[] = [];
  for (const entry of manifest.entries) {
    const score = scoreCinematicAsset(intent, entry);
    if (score.rejected) diagnostics.push(createDomCssSubstituteRejectedDiagnostic(intent, entry));
  }

  const ranked = sortAssetsBySemanticScore(intent, manifest.entries);
  const best = ranked.find((candidate) => candidate.score.total >= minimumScore);
  if (best) {
    return {
      networkUsed: false,
      resolved: [toResolvedAsset(intent, best.entry, best.score)],
      proceduralSets: best.entry.kind === "procedural-set" ? [buildProceduralSetForEntry(best.entry)] : [],
      unresolved: [],
      diagnostics: [
        ...diagnostics,
        {
          code: "AURA_CINEMATIC_ASSET_RESOLVED",
          severity: "info",
          path: `assetRequirements[${intent.id}]`,
          message: `Resolved '${intent.label}' to '${best.entry.id}' with semantic score ${best.score.total.toFixed(2)}.`,
          fixSuggestion: "Keep provenance metadata with the exported scene bundle."
        }
      ]
    };
  }

  const proceduralReport = resolveProceduralFallback(intent, diagnostics);
  if (proceduralReport) return proceduralReport;

  return {
    networkUsed: false,
    resolved: [],
    proceduralSets: [],
    unresolved: [{ intentId: intent.id, label: intent.label, required: intent.required, attemptedFallbacks: intent.fallbackPriority }],
    diagnostics: [...diagnostics, createUnresolvedAssetDiagnostic(intent)]
  };
}

function toResolvedAsset(intent: AuraAssetIntent, entry: AuraCinematicAssetManifestEntry, score: AuraAssetScoreBreakdown): AuraCinematicResolvedAsset {
  return {
    intentId: intent.id,
    assetId: entry.id,
    label: entry.label,
    uri: entry.uri,
    category: entry.category,
    strategy: entry.kind === "procedural-set" ? "procedural-set" : entry.kind === "procedural-mesh" ? "procedural-mesh" : entry.kind === "material" ? "renderer-material" : "manifest-asset",
    score,
    provenance: entry.provenance,
    storyBlocking: entry.storyBlocking,
    lightMetadata: entry.lightMetadata
  };
}

function resolveProceduralFallback(intent: AuraAssetIntent, diagnostics: readonly AuraAssetSubstitutionDiagnostic[]): AuraCinematicAssetResolutionReport | undefined {
  if (!intent.fallbackPriority.includes("procedural-set") && !intent.fallbackPriority.includes("procedural-mesh")) return undefined;
  if (intent.category === "urban-environment" && hasTag(intent, "rainy-neon-alley")) {
    const set = buildRainyNeonAlleySet();
    return {
      networkUsed: false,
      resolved: [],
      proceduralSets: [set],
      unresolved: [],
      diagnostics: [
        ...diagnostics,
        {
          code: "AURA_CINEMATIC_PROCEDURAL_SET_RESOLVED",
          severity: "info",
          path: `assetRequirements[${intent.id}]`,
          message: "Resolved rainy neon alley with renderer-owned procedural set geometry.",
          fixSuggestion: "Use this fallback until a curated GLB alley with matching provenance is available."
        }
      ]
    };
  }
  if (intent.category === "studio-environment") {
    const set = buildProceduralStudioSet();
    return { networkUsed: false, resolved: [], proceduralSets: [set], unresolved: [], diagnostics: [...diagnostics, { code: "AURA_CINEMATIC_PROCEDURAL_SET_RESOLVED", severity: "info", path: `assetRequirements[${intent.id}]`, message: "Resolved studio environment with renderer-owned procedural set geometry.", fixSuggestion: "Replace with a curated studio GLB when needed." }] };
  }
  if (intent.category === "nature-environment") {
    const set = buildProceduralNatureSet();
    return { networkUsed: false, resolved: [], proceduralSets: [set], unresolved: [], diagnostics: [...diagnostics, { code: "AURA_CINEMATIC_PROCEDURAL_SET_RESOLVED", severity: "info", path: `assetRequirements[${intent.id}]`, message: "Resolved nature environment with renderer-owned procedural set geometry.", fixSuggestion: "Replace with curated botanical assets when needed." }] };
  }
  if (isMajorCinematicAssetIntent(intent) && intent.disallowedSubstitutes.includes("dom-css-only")) return undefined;
  return undefined;
}

function buildProceduralSetForEntry(entry: AuraCinematicAssetManifestEntry): AuraProceduralSetBuild {
  if (entry.category === "urban-environment") return buildRainyNeonAlleySet(entry.id);
  if (entry.category === "nature-environment") return buildProceduralNatureSet(entry.id);
  return buildProceduralStudioSet(entry.id);
}

function dedupeProceduralSets(sets: readonly AuraProceduralSetBuild[]): readonly AuraProceduralSetBuild[] {
  const byId = new Map<string, AuraProceduralSetBuild>();
  for (const set of sets) byId.set(set.id, set);
  return [...byId.values()];
}

function hasTag(intent: AuraAssetIntent, tag: string): boolean {
  const needle = tag.toLowerCase();
  return intent.semanticTags.some((entry) => entry.toLowerCase() === needle);
}
