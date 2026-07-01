import type {
  AuraAssetIntendedRole,
  AuraCanonicalAsset,
  ResolveCandidate,
} from "@aura3d/asset-index";
import type { CliAssetSearchProfile } from "./types.js";
import { isPositiveVector3 } from "./vector3.js";

export interface AssetResolveCandidateScore {
  readonly total: number;
  readonly semantic: number;
  readonly sourceQuality: number;
  readonly license: number;
  readonly inspection: number;
  readonly roleFit: number;
  readonly penalties: readonly string[];
  readonly reasons: readonly string[];
}

export function scoreResolveCandidate(
  candidate: ResolveCandidate,
  options: { readonly query?: string; readonly profile?: CliAssetSearchProfile } = {},
): AssetResolveCandidateScore {
  const asset = candidate.asset;
  const reasons: string[] = [];
  const penalties: string[] = [];
  const query = options.query ?? "";

  const semantic =
    scoreSignal(candidate.score, 12) +
    scoreSignal(asset.semanticScore, 8) +
    scoreSignal(asset.workerScore, 4) +
    scoreSignal(asset.qualityScore, 4);
  if (semantic > 0) reasons.push(`semantic/source score ${roundScore(semantic)}`);

  let sourceQuality = 0;
  if (asset.sourcePage) {
    sourceQuality += 6;
    reasons.push("source page preserved");
  } else {
    penalties.push("missing source page");
  }
  if (asset.downloadUrl ?? asset.url) {
    sourceQuality += 5;
    reasons.push("download URL preserved");
  } else {
    penalties.push("missing download URL");
  }
  if (asset.author ?? asset.attribution) {
    sourceQuality += 4;
    reasons.push("author/attribution preserved");
  } else {
    penalties.push("missing author/attribution");
  }
  if (asset.sourceFamily ?? asset.source) sourceQuality += 3;
  if (asset.retrievedAt) sourceQuality += 2;
  if (asset.rawCatalogMetadata) sourceQuality += 2;

  let license = 0;
  if (asset.license.verified && asset.license.redistributable) {
    license += 10;
    reasons.push(`verified ${asset.license.spdx} license`);
  } else {
    penalties.push("license is not verified redistributable");
  }
  if (asset.licenseName ?? asset.license.raw) license += 3;
  if (asset.licenseUrl ?? asset.license.sourcePage) license += 4;
  else penalties.push("missing license URL/source evidence");

  let inspection = 0;
  const boundsSize = asset.bounds?.size ?? asset.dimensions;
  if (isPositiveVector3(boundsSize)) {
    inspection += 6;
    reasons.push("bounds/dimensions metadata preserved");
  } else {
    penalties.push("missing bounds/dimensions metadata");
  }
  const triangles = asset.triangleCount ?? asset.triangles;
  if (typeof triangles === "number" && Number.isFinite(triangles) && triangles > 0) inspection += 3;
  if (typeof asset.meshCount === "number" && asset.meshCount > 0) inspection += 3;
  if (typeof asset.materialCount === "number" && asset.materialCount > 0) inspection += 4;
  else if (expectsVisualMaterials(asset, query)) penalties.push("missing material metadata for visual model role");
  if (typeof asset.textureCount === "number" && asset.textureCount > 0) inspection += 4;
  else if (expectsTextureEvidence(asset, query)) penalties.push("missing texture metadata for visual model role");
  const clipCount = asset.animationClipCount ?? asset.animationClips?.length;
  if (typeof clipCount === "number" && clipCount > 0) inspection += 2;
  if (typeof asset.skinCount === "number" && asset.skinCount > 0) inspection += 2;
  if (typeof asset.morphTargetCount === "number" && asset.morphTargetCount > 0) inspection += 1;

  let roleFit = 0;
  if (asset.intendedRole && asset.intendedRole !== "unknown") {
    roleFit += 4;
    reasons.push(`intended role ${asset.intendedRole}`);
  }
  const queryRole = inferQueryRole(query, options.profile);
  if (queryRole && asset.intendedRole === queryRole) {
    roleFit += 8;
    reasons.push(`role matches query (${queryRole})`);
  } else if (queryRole && asset.intendedRole && asset.intendedRole !== "unknown") {
    penalties.push(`role mismatch: wanted ${queryRole}, got ${asset.intendedRole}`);
  }
  if (asset.roleSuitability && asset.roleSuitability.trim().length >= 16) roleFit += 3;
  else if (asset.intendedRole && asset.intendedRole !== "abstract") penalties.push("missing role suitability explanation");

  if (asset.qualityWarnings && asset.qualityWarnings.length > 0) {
    for (const warning of asset.qualityWarnings) penalties.push(`catalog warning: ${warning}`);
  }
  if (asset.duplicateHash && !asset.duplicateOkReason) penalties.push(`duplicate hash ${asset.duplicateHash} lacks allowlist reason`);

  const penaltyCost = penalties.reduce((total, penalty) => {
    if (penalty.includes("duplicate hash")) return total + 40;
    if (penalty.includes("license")) return total + 20;
    if (penalty.includes("missing source page")) return total + 8;
    if (penalty.includes("missing material") || penalty.includes("missing texture")) return total + 6;
    if (penalty.includes("role mismatch")) return total + 6;
    return total + 3;
  }, 0);

  const total = Math.max(0, semantic + sourceQuality + license + inspection + roleFit - penaltyCost);
  return {
    total: roundScore(total),
    semantic: roundScore(semantic),
    sourceQuality: roundScore(sourceQuality),
    license: roundScore(license),
    inspection: roundScore(inspection),
    roleFit: roundScore(roleFit),
    penalties,
    reasons,
  };
}

export function rankResolveCandidates(
  candidates: readonly ResolveCandidate[],
  options: { readonly query?: string; readonly profile?: CliAssetSearchProfile } = {},
): readonly ResolveCandidate[] {
  return [...candidates].sort((a, b) => {
    const aScore = scoreResolveCandidate(a, options);
    const bScore = scoreResolveCandidate(b, options);
    return bScore.total - aScore.total || b.score - a.score || a.asset.id.localeCompare(b.asset.id);
  });
}

function scoreSignal(value: number | undefined, scale: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return value * scale;
  if (value <= 100) return (value / 100) * scale;
  return scale;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function expectsVisualMaterials(asset: AuraCanonicalAsset, query: string): boolean {
  const role = asset.intendedRole ?? inferQueryRole(query);
  return role !== "abstract" && role !== "debug";
}

function expectsTextureEvidence(asset: AuraCanonicalAsset, query: string): boolean {
  const role = asset.intendedRole ?? inferQueryRole(query);
  return role === "character" || role === "vehicle" || role === "track" || role === "world" || role === "environment" || role === "product" || role === "weapon";
}

function inferQueryRole(query: string, profile?: CliAssetSearchProfile): AuraAssetIntendedRole | undefined {
  if (profile === "fighting-character" || profile === "animation-character") return "character";
  const text = query.toLowerCase();
  if (/\b(character|avatar|runner|humanoid|person|hero|fighter|enemy|npc)\b/.test(text)) return "character";
  if (/\b(car|vehicle|truck|ship|plane|drone|kart|race)\b/.test(text)) return "vehicle";
  if (/\b(track|circuit|road|raceway)\b/.test(text)) return "track";
  if (/\b(world|level|map|environment|scene|arena)\b/.test(text)) return "world";
  if (/\b(product|phone|shoe|sneaker|watch|commerce)\b/.test(text)) return "product";
  if (/\b(weapon|gun|sword|blade)\b/.test(text)) return "weapon";
  return undefined;
}
