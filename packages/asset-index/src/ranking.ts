import type { AuraCanonicalAsset } from "./CanonicalAsset.js";
import type { ResolveConstraints } from "./SourceAdapter.js";

/**
 * Lightweight, dependency-free relevance scoring for v1.
 *
 * Scores an asset against the query terms by weighted field hits:
 *   title match  > tag match  > description match.
 *
 * This is deliberately a keyword baseline. The intended upgrade is vector
 * embeddings (semantic match on `title`+`tags`+`description`); the federation
 * layer calls `scoreAsset` through a single seam so that swap is local.
 */

function queryTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function scoreSignal(value: number | undefined, scale: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return value * scale;
  if (value <= 100) return (value / 100) * scale;
  return scale;
}

/**
 * Rank bonus for a pre-screened mirror hero candidate.
 *
 * Calibrated against the keyword scale above (title +5, tag +3, description
 * +1, coverage +2/term): 12 points outweighs a one-term near-match lead but
 * not a multi-term exact-title sweep, so curation boosts proven picks without
 * making screening an unoverridable trump.
 */
export const SCREENED_HERO_RANK_BONUS = 12;

export function scoreAsset(asset: AuraCanonicalAsset, text: string): number {
  const terms = queryTerms(text);
  if (terms.length === 0) return 0;

  const title = asset.title.toLowerCase();
  const description = (asset.description ?? "").toLowerCase();
  const tagSet = new Set(asset.tags);

  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 5;
    if (tagSet.has(term)) score += 3;
    if (description.includes(term)) score += 1;
  }
  // Reward breadth of coverage so an asset hitting many query terms ranks above
  // one that hits a single term repeatedly.
  const covered = terms.filter(
    (t) => title.includes(t) || tagSet.has(t) || description.includes(t),
  ).length;
  const catalogSignals =
    scoreSignal(asset.semanticScore, 20) +
    scoreSignal(asset.workerScore, 12) +
    scoreSignal(asset.qualityScore, 8);
  // Pre-screened heroes outrank unscreened keyword matches: a one-time
  // `screen:assets` pass curates mirror `heroCandidates`, the jsDelivr adapter
  // carries that verdict in `rawCatalogMetadata`, and this bonus applies it at
  // rank time -- no key, no browser, no new services. The bonus is deliberately
  // smaller than a full exact-title sweep so an unscreened exact match can
  // still win on strong catalog signals; the proof is that a shortlisted hero
  // outranks an unscreened *near* match.
  const screenedHero =
    (asset.rawCatalogMetadata as Record<string, unknown> | undefined)?.["heroCandidate"] === true ||
    (asset.rawCatalogMetadata as Record<string, unknown> | undefined)?.["screenedHero"] === true;
  return score + covered * 2 + catalogSignals + (screenedHero ? SCREENED_HERO_RANK_BONUS : 0);
}

/** True when an asset satisfies every supplied constraint. */
export function matchesConstraints(
  asset: AuraCanonicalAsset,
  constraints: ResolveConstraints | undefined,
): boolean {
  if (!constraints) return true;

  if (constraints.redistributableOnly) {
    if (asset.access !== "direct-download" || !asset.license.verified || !asset.license.redistributable) {
      return false;
    }
  }
  if (constraints.format && asset.format !== constraints.format) {
    return false;
  }
  if (constraints.license && constraints.license.length > 0) {
    const family = asset.license.spdx.startsWith("CC0")
      ? "CC0"
      : asset.license.spdx.startsWith("CC-BY")
        ? "CC-BY"
        : null;
    if (!family || !constraints.license.includes(family)) return false;
  }
  if (
    typeof constraints.maxTriangles === "number" &&
    typeof asset.triangles === "number" &&
    asset.triangles > constraints.maxTriangles
  ) {
    return false;
  }
  if (
    typeof constraints.animated === "boolean" &&
    typeof asset.hasAnimations === "boolean" &&
    asset.hasAnimations !== constraints.animated
  ) {
    return false;
  }
  return true;
}
