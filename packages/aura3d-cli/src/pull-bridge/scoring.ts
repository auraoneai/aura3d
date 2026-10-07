import type {
  AuraAssetIntendedRole,
  AuraCanonicalAsset,
  ResolveCandidate,
} from "@aura3d/asset-index";
import type { CliAssetSearchProfile } from "./types.js";
import { isPositiveVector3 } from "./vector3.js";
import { profileForRole, type AdmissionProfile } from "../admission/profiles.js";

/**
 * PRD-05 §6.6 ranking rewrite.
 *
 * Licence and provenance are FILTERS, not score: a failure lands in
 * `exclusions` and the candidate drops out of the ranked pull pool entirely
 * (search keeps the row under rejectedCandidates so a human still sees why).
 * Score terms, in order of weight:
 *
 *   semantic        — source-side relevance (unchanged)
 *   sourceQuality   — durable provenance evidence (page, URL, author, family)
 *   fit             — G1 triangle-band fit + G3 PBR pre-check + G2 estimate
 *   approval        — §6.6 library membership, approved look-dev record (G9),
 *                     art-direction match with the route (G10)
 *   roleFit         — intended-role agreement with the query
 */

export interface AssetResolveCandidateScore {
  readonly total: number;
  readonly semantic: number;
  readonly sourceQuality: number;
  readonly fit: number;
  readonly approval: number;
  readonly roleFit: number;
  /** Non-empty = excluded from the ranked pool regardless of score. */
  readonly exclusions: readonly string[];
  readonly penalties: readonly string[];
  readonly reasons: readonly string[];
}

export interface ResolveScoreOptions {
  readonly query?: string;
  readonly profile?: CliAssetSearchProfile;
  /** Route's `assets/art-direction/<id>.json` id for the G10 match term. */
  readonly artDirection?: string;
}

/** Texture-bearing roles where missing texture evidence excludes the candidate (§6.6). */
const TEXTURE_REQUIRED_ROLES = new Set<AuraAssetIntendedRole>([
  "character", "vehicle", "track", "world", "environment", "product", "weapon",
]);

/** Licence + provenance hard filters (§6.6). Exported for search's exclusion listing. */
export function candidateExclusions(
  candidate: ResolveCandidate,
  options: ResolveScoreOptions = {},
): readonly string[] {
  const asset = candidate.asset;
  const exclusions: string[] = [];
  const query = options.query ?? "";

  if (!asset.license.verified || !asset.license.redistributable) {
    exclusions.push(`license ${asset.license.spdx} is not verified redistributable (filter, not score)`);
  } else if (asset.license.attributionRequired && !(asset.author ?? asset.attribution)) {
    exclusions.push("attribution-bearing license but no author/attribution recorded");
  }
  // Provenance filter: excluded only when there is NO traceable origin —
  // no source page, no fetchable URL. A fetchable URL alone still leaves a
  // (weaker) provenance chain the penalty path already prices.
  const anyUrl = asset.downloadUrl ?? asset.url;
  if (!asset.sourcePage && (anyUrl === undefined || !/^https?:\/\//i.test(anyUrl))) {
    exclusions.push("no source page or fetchable URL — provenance cannot be traced");
  }

  const role = asset.intendedRole ?? inferQueryRole(query, options.profile);
  if (role !== undefined && TEXTURE_REQUIRED_ROLES.has(role) && isModelFormat(asset.format)) {
    // Exclusion fires only on positive "no textures" evidence: a catalog row
    // that never inspected textures keeps unknown-evidence candidates.
    if (asset.textureCount === 0 || asset.materialCount === 0) {
      exclusions.push(`texture-required role "${role}" has no texture/material evidence (replaces the old -6 penalty)`);
    }
  }
  return exclusions;
}

function isModelFormat(format: string): boolean {
  return format === "glb" || format === "gltf";
}

export function scoreResolveCandidate(
  candidate: ResolveCandidate,
  options: ResolveScoreOptions = {},
): AssetResolveCandidateScore {
  const asset = candidate.asset;
  const reasons: string[] = [];
  const penalties: string[] = [];
  const exclusions = [...candidateExclusions(candidate, options)];
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
  // Licence no longer scores here: it is an admission filter (exclusions above).

  // --- fit: G1 band + G3 pre-check + G2 estimate -----------------------------
  let fit = 0;
  const role = asset.intendedRole ?? inferQueryRole(query, options.profile);
  const boundsSize = asset.bounds?.size ?? asset.dimensions;
  const profile = role !== undefined ? profileForRole(role, isPositiveVector3(boundsSize) ? boundsSize : undefined) : undefined;

  const triangles = asset.triangleCount ?? asset.triangles;
  if (typeof triangles === "number" && Number.isFinite(triangles) && triangles > 0) {
    fit += g1BandFit(triangles, profile, reasons, penalties);
  } else {
    penalties.push("missing triangle metadata for G1 fit");
  }

  // G3 pre-check: PBR completeness evidence in the catalog record.
  if (isModelFormat(asset.format)) {
    if (typeof asset.materialCount === "number" && asset.materialCount > 0) {
      fit += 4;
    } else if (expectsVisualMaterials(asset, query)) {
      penalties.push("missing material metadata for visual model role");
    }
    if (typeof asset.textureCount === "number" && asset.textureCount > 0) fit += 4;
    const clipCount = asset.animationClipCount ?? asset.animationClips?.length;
    if (typeof clipCount === "number" && clipCount > 0) fit += 2;
    if (typeof asset.skinCount === "number" && asset.skinCount > 0) fit += 2;
    if (typeof asset.morphTargetCount === "number" && asset.morphTargetCount > 0) fit += 1;
  }

  // G2 estimate at the profile's default camera: file-size-per-area as a crude
  // texel-density stand-in until measured texel density exists on the record.
  if (profile?.gameplayCamera !== undefined && isPositiveVector3(boundsSize)) {
    const area = boundsSize![0]! * boundsSize![1]! + boundsSize![1]! * boundsSize![2]! + boundsSize![0]! * boundsSize![2]!;
    if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes > 0 && area > 0) {
      const bytesPerSqm = asset.fileSizeBytes / area;
      if (profile.fileBytesHigh !== undefined && asset.fileSizeBytes <= profile.fileBytesHigh) fit += 4;
      if (bytesPerSqm >= 200_000) {
        fit += 4;
        reasons.push(`G2 estimate ${Math.round(bytesPerSqm / 1000)}kB/m² texture budget headroom`);
      } else {
        penalties.push("G2 estimate below texture-budget headroom at default camera");
      }
    }
  }
  if (isPositiveVector3(boundsSize)) {
    fit += 3;
    reasons.push("bounds/dimensions metadata preserved");
  } else {
    penalties.push("missing bounds/dimensions metadata");
  }

  // --- approval: library membership + look-dev + art direction --------------
  let approval = 0;
  if (asset.library) {
    approval += 10;
    reasons.push(`§6.6 library member (${asset.library.kitId})`);
  }
  if (asset.lookDevApproved) {
    approval += 8;
    reasons.push("approved look-dev record (G9)");
  }
  if (options.artDirection) {
    if (asset.artDirection === options.artDirection) {
      approval += 6;
      reasons.push(`art-direction match (${options.artDirection})`);
    } else if (asset.artDirection) {
      penalties.push(`art-direction mismatch: wanted ${options.artDirection}, entry has ${asset.artDirection}`);
    }
  }

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
    if (penalty.includes("missing source page")) return total + 8;
    if (penalty.includes("missing material") || penalty.includes("texture")) return total + 6;
    if (penalty.includes("role mismatch")) return total + 6;
    if (penalty.includes("art-direction mismatch")) return total + 6;
    return total + 3;
  }, 0);

  const total = exclusions.length > 0
    ? 0
    : Math.max(0, semantic + sourceQuality + fit + approval + roleFit - penaltyCost);
  return {
    total: roundScore(total),
    semantic: roundScore(semantic),
    sourceQuality: roundScore(sourceQuality),
    fit: roundScore(fit),
    approval: roundScore(approval),
    roleFit: roundScore(roleFit),
    exclusions,
    penalties,
    reasons,
  };
}

function g1BandFit(
  triangles: number,
  profile: AdmissionProfile | undefined,
  reasons: string[],
  penalties: string[],
): number {
  if (!profile) return 3; // role without a geometry profile: no band to fit
  const floor = profile.trianglesFloor ?? 0;
  const ceiling = profile.trianglesCeiling ?? Number.POSITIVE_INFINITY;
  if (triangles >= floor && triangles <= ceiling) {
    reasons.push(`G1 triangle band fit (${triangles} in [${floor}, ${ceiling}])`);
    return 10;
  }
  if (triangles >= floor * 0.5 && triangles <= ceiling * 1.5) {
    return 4;
  }
  penalties.push(`G1 band miss (${triangles} outside [${floor}, ${ceiling}])`);
  return 0;
}

export interface PartitionedCandidates {
  readonly ranked: readonly ResolveCandidate[];
  readonly excluded: readonly { readonly candidate: ResolveCandidate; readonly exclusions: readonly string[] }[];
}

/** Split the pool into ranked candidates and excluded candidates (fail-closed filters). */
export function partitionResolveCandidates(
  candidates: readonly ResolveCandidate[],
  options: ResolveScoreOptions = {},
): PartitionedCandidates {
  const ranked: ResolveCandidate[] = [];
  const excluded: PartitionedCandidates["excluded"][number][] = [];
  for (const candidate of candidates) {
    const exclusions = candidateExclusions(candidate, options);
    if (exclusions.length > 0) excluded.push({ candidate, exclusions });
    else ranked.push(candidate);
  }
  ranked.sort((a, b) => {
    const aScore = scoreResolveCandidate(a, options);
    const bScore = scoreResolveCandidate(b, options);
    return bScore.total - aScore.total || b.score - a.score || a.asset.id.localeCompare(b.asset.id);
  });
  return { ranked, excluded };
}

export function rankResolveCandidates(
  candidates: readonly ResolveCandidate[],
  options: ResolveScoreOptions = {},
): readonly ResolveCandidate[] {
  return partitionResolveCandidates(candidates, options).ranked;
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

/**
 * Infer the intended catalog role from a free-text query (and, when set, the
 * caller's explicit profile).
 *
 * Exported so the resolve-constraint and rank seams can apply the same
 * character/vehicle reading instead of letting those queries fall through to
 * the unfiltered `general` path while scoring alone knows the role.
 */
export function inferQueryRole(query: string, profile?: CliAssetSearchProfile): AuraAssetIntendedRole | undefined {
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
