import type { AuraAssetLicense, AuraCanonicalAsset } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Map the catalog's SPDX string to a license. The `/search` endpoint already
 * filtered to redistributable when `commercial=true`, so CC-BY-SA/ND collapse to
 * the CC-BY family (attribution-required, redistributable) rather than UNVERIFIED.
 */
function catalogLicense(spdx: string): AuraAssetLicense {
  if (spdx.startsWith("CC0")) {
    return { spdx: "CC0-1.0", raw: spdx, verified: true, attributionRequired: false, redistributable: true };
  }
  if (spdx.startsWith("CC-BY")) {
    return { spdx: "CC-BY-4.0", raw: spdx, verified: true, attributionRequired: true, redistributable: true };
  }
  return normalizeLicense(spdx);
}

/**
 * Aura3D hosted-catalog adapter.
 *
 * Queries the hosted `/search` endpoint — hybrid keyword + semantic + quality
 * search over the full ~850k-asset D1 catalog the cron maintains. This is the
 * read path the resolver / CLI / prompt feature use: one request returns a
 * ranked, license-verified shortlist for an intent, instead of loading the whole
 * catalog or live-federating each upstream source.
 */

const DEFAULT_SEARCH_URL =
  "https://aura3d-asset-index-cron.newsroom.workers.dev/search";

interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly url: string;
  readonly license: string;
  readonly thumbnail?: string | null;
  readonly attribution?: string | null;
}

interface SearchResponse {
  readonly results?: readonly SearchResult[];
}

export interface AuraIndexAdapterOptions {
  /** Hosted `/search` endpoint URL. Defaults to the Aura3D catalog worker. */
  readonly searchUrl?: string;
  /** Max results to request. Default 20. */
  readonly limit?: number;
  /** Restrict to commercially-redistributable assets (default true). */
  readonly commercialOnly?: boolean;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export function createAuraIndexAdapter(
  options: AuraIndexAdapterOptions = {},
): SourceAdapter {
  const base = options.searchUrl ?? DEFAULT_SEARCH_URL;
  const limit = options.limit ?? 20;
  const commercialOnly = options.commercialOnly ?? true;

  return {
    id: "aura-index",
    label: "Aura3D hosted catalog (~850k)",
    async search(query: ResolveQuery, ctx: AdapterContext) {
      const text = query.text.trim();
      if (!text) return [];
      const url =
        `${base}?q=${encodeURIComponent(text)}&limit=${limit}` +
        `&commercial=${commercialOnly}`;
      const res = (await ctx.fetchJson(url)) as SearchResponse;
      const results = Array.isArray(res.results) ? res.results : [];
      return results
        .filter((r) => r && typeof r.id === "string" && r.url)
        .map<AuraCanonicalAsset>((r) => ({
          id: r.id,
          source: r.source ?? "aura-index",
          title: r.title ?? r.id,
          url: r.url,
          access: "direct-download",
          format: "glb",
          license: catalogLicense(r.license ?? ""),
          thumbnailUrl: r.thumbnail ?? undefined,
          tags: tokenize(r.title ?? ""),
          attribution: r.attribution ?? undefined,
        }));
    },
  };
}
