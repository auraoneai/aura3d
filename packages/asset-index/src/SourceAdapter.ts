import type { AuraAssetFormat, AuraCanonicalAsset } from "./CanonicalAsset.js";

/**
 * Injected JSON fetcher. Defaults to global `fetch` in production, but is
 * overridable so adapters can be tested deterministically with fixtures and no
 * network access.
 */
export type FetchJson = (url: string) => Promise<unknown>;

export interface AdapterContext {
  readonly fetchJson: FetchJson;
}

/** Constraints an agent/resolver can impose on candidate assets. */
export interface ResolveConstraints {
  /** Restrict to these license families (matched against normalized SPDX). */
  readonly license?: readonly ("CC0" | "CC-BY")[];
  readonly maxTriangles?: number;
  readonly animated?: boolean;
  readonly format?: AuraAssetFormat;
  /**
   * When true (the default for auto-pull flows), drop anything that is not
   * directly downloadable under a verified, redistributable license.
   */
  readonly redistributableOnly?: boolean;
}

export interface ResolveQuery {
  /** Natural-language intent, e.g. "battle-worn knight helmet". */
  readonly text: string;
  readonly constraints?: ResolveConstraints;
}

export interface AdapterRefreshResult {
  /** Opaque per-source watermark to pass back on the next refresh. */
  readonly watermark: string;
  readonly assets: readonly AuraCanonicalAsset[];
}

/**
 * One source of free GLB/glTF assets. A static-index source (Khronos, OS3A)
 * fetches and caches its whole catalog inside `search`; a large API source
 * (Sketchfab) translates the query into a server-side request. Either way the
 * adapter returns canonical records and the federation layer ranks/filters.
 */
export interface SourceAdapter {
  readonly id: string;
  readonly label: string;

  /** Return candidate canonical assets for a query (pre-ranking). */
  search(query: ResolveQuery, ctx: AdapterContext): Promise<readonly AuraCanonicalAsset[]>;

  /**
   * Optional incremental refresh used by the cron index. Given the last
   * watermark, return new/changed assets and the next watermark. Sources
   * without a usable change signal can omit this.
   */
  fetchSince?(
    watermark: string | null,
    ctx: AdapterContext,
  ): Promise<AdapterRefreshResult>;
}

/** Default `FetchJson` backed by the platform `fetch`. */
export const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`asset-index fetch failed ${res.status} for ${url}`);
  }
  return res.json();
};
