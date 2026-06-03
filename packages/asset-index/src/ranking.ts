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
  return score + covered * 2;
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
