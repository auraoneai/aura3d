import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";
import {
  hasAuraIndexDownloadUrl,
  toAuraCanonicalAsset,
  type AuraIndexSearchResponse,
} from "./aura-index-result.js";

const DEFAULT_SEARCH_URL =
  "https://aura3d-asset-index-cron.newsroom.workers.dev/search";

export interface AuraIndexAdapterOptions {
  readonly searchUrl?: string;
  readonly limit?: number;
  readonly commercialOnly?: boolean;
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
      const res = (await ctx.fetchJson(url)) as AuraIndexSearchResponse;
      const results = Array.isArray(res.results) ? res.results : [];
      return results
        .filter(hasAuraIndexDownloadUrl)
        .map(toAuraCanonicalAsset)
        .filter((asset) => asset !== undefined);
    },
  };
}
