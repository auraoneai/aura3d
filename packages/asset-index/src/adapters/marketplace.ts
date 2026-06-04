import type { AuraCanonicalAsset } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Marketplace deep-link adapter — CGTrader, TurboSquid, Free3D.
 *
 * DISCOVERY-ONLY. These marketplaces forbid programmatic auto-download, and a
 * "free" listing is NOT the same as a redistributable license. So this adapter
 * deliberately fetches and indexes NOTHING: it performs no network I/O at all.
 * Instead, `search` synthesizes one candidate per site whose `url` is that
 * site's free-GLB/glTF search-results page for the query text — a human deep
 * link a person can open, evaluate, and license themselves.
 *
 * Every candidate is `access: 'deep-link-only'` and carries an `UNVERIFIED`
 * license (`normalizeLicense(undefined)` -> not redistributable), so
 * `isAutoPullable` is always false and the resolver can never auto-pull one of
 * these. The federation layer should only surface these when no auto-pullable
 * candidate exists (see integration notes).
 *
 * Verified search-URL formats (June 2026):
 *   CGTrader:   https://www.cgtrader.com/3d-models/ext/glb?keywords=<csv>
 *               (free filter applied via `price_max=0`; `keywords` is the
 *                documented keyword param, comma-separated.)
 *   TurboSquid: https://www.turbosquid.com/Search/3D-Models/free/gltf/<slug>
 *               (path-based filters: `/free` price + `/gltf` format + keyword
 *                slug segment.)
 *   Free3D:     https://free3d.com/3d-models/<slug>
 *               (keyword slug appended to the models listing path.)
 */

interface MarketplaceSite {
  /** Stable per-site local id (used in the namespaced asset id). */
  readonly localId: string;
  /** Display name used in the candidate title. */
  readonly displayName: string;
  /** Build the free GLB/glTF search-results URL for the given query terms. */
  readonly buildUrl: (terms: readonly string[]) => string;
}

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // split camelCase identifiers
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Lowercase hyphen slug, e.g. "Battle Worn Helmet" -> "battle-worn-helmet". */
function slugify(terms: readonly string[]): string {
  return terms.join("-");
}

const SITES: readonly MarketplaceSite[] = [
  {
    localId: "cgtrader",
    displayName: "CGTrader",
    buildUrl: (terms) => {
      const keywords = encodeURIComponent(terms.join(","));
      return `https://www.cgtrader.com/3d-models/ext/glb?keywords=${keywords}&price_max=0`;
    },
  },
  {
    localId: "turbosquid",
    displayName: "TurboSquid",
    buildUrl: (terms) => {
      const slug = encodeURIComponent(slugify(terms));
      return `https://www.turbosquid.com/Search/3D-Models/free/gltf/${slug}`;
    },
  },
  {
    localId: "free3d",
    displayName: "Free3D",
    buildUrl: (terms) => {
      const slug = encodeURIComponent(slugify(terms));
      return `https://free3d.com/3d-models/${slug}`;
    },
  },
];

function toCandidate(
  site: MarketplaceSite,
  rawQuery: string,
  terms: readonly string[],
): AuraCanonicalAsset {
  const url = site.buildUrl(terms);
  return {
    id: `marketplace:${site.localId}`,
    source: "marketplace",
    title: `Search ${site.displayName} for '${rawQuery}' (free GLB filter)`,
    url,
    access: "deep-link-only",
    format: "glb",
    // UNVERIFIED: a "free" marketplace listing is not a verified redistributable
    // license. Never auto-pullable.
    license: normalizeLicense(undefined, url),
    tags: terms,
    sourcePage: url,
  };
}

export function createMarketplaceDeepLinkAdapter(): SourceAdapter {
  return {
    id: "marketplace",
    label: "Marketplace deep links (CGTrader, TurboSquid, Free3D)",
    async search(query: ResolveQuery, _ctx: AdapterContext) {
      const raw = query.text.trim();
      if (!raw) return [];
      const terms = tokenize(raw);
      if (terms.length === 0) return [];
      return SITES.map((site) => toCandidate(site, raw, terms));
    },
  };
}
