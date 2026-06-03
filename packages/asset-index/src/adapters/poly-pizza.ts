import type { AuraCanonicalAsset } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Poly Pizza adapter — https://poly.pizza (public keyword-search API).
 *
 * Verified live against the API (https://api.poly.pizza/v1.1):
 *   GET /search/{keyword}   (auth header `x-auth-token`)
 *     -> { total: number, results: Model[] }
 *   Model (PascalCase keys, verified against the live response):
 *     { ID, Title, Description, Attribution, Thumbnail, Download (.glb url),
 *       "Tri Count", Creator: { Username, DPURL }, Category, Tags: string[],
 *       Licence ("CC0" | "CC-BY 3.0" | "CC-BY 4.0" | ...), Animated }
 *
 * `Licence` is authoritative, so we trust it through `normalizeLicense` (spaces
 * are normalized to hyphens so "CC-BY 3.0" -> CC-BY-3.0). `Download` is a
 * directly-fetchable .glb, so access is `direct-download`.
 *
 * This is a keyword-search source, not an enumerable catalog: an empty query
 * returns nothing. It belongs on the live query path (and a curated keyword
 * sweep), not a blind full mirror.
 *
 * The API requires a key (defaults to `process.env.POLY_PIZZA_API_KEY`); when
 * absent the adapter degrades gracefully and `search` returns [].
 */

const API_BASE = "https://api.poly.pizza/v1.1";
const PAGE_BASE = "https://poly.pizza/m";

interface PolyPizzaCreator {
  readonly Username?: string;
  readonly DPURL?: string;
}

interface PolyPizzaModel {
  readonly ID: string;
  readonly Title?: string;
  readonly Description?: string;
  readonly Attribution?: string;
  readonly Thumbnail?: string;
  readonly Download?: string;
  readonly "Tri Count"?: number;
  readonly Creator?: PolyPizzaCreator;
  readonly Category?: string;
  readonly Tags?: readonly string[];
  readonly Licence?: string;
  readonly Animated?: boolean;
}

interface PolyPizzaSearchResult {
  readonly total?: number;
  readonly results?: readonly PolyPizzaModel[];
}

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function toCanonical(model: PolyPizzaModel): AuraCanonicalAsset | null {
  if (!model.Download) {
    // Only index results that expose a directly-downloadable .glb file.
    return null;
  }
  const title = model.Title ?? model.ID;
  const sourcePage = `${PAGE_BASE}/${model.ID}`;
  const tags = Array.from(
    new Set([
      ...tokenize(title),
      ...(model.Tags ?? []).flatMap(tokenize),
      ...tokenize(model.Category ?? ""),
    ]),
  );
  const tri = model["Tri Count"];
  const triangles =
    typeof tri === "number" && Number.isFinite(tri) ? tri : undefined;
  const description = model.Description?.trim();
  return {
    id: `poly-pizza:${model.ID}`,
    source: "poly-pizza",
    title,
    description: description ? description : undefined,
    url: model.Download,
    access: "direct-download",
    format: "glb",
    // "CC-BY 3.0" -> "CC-BY-3.0" so it resolves in the license table.
    license: normalizeLicense((model.Licence ?? "").replace(/\s+/g, "-"), sourcePage),
    thumbnailUrl: model.Thumbnail,
    triangles,
    hasAnimations: model.Animated,
    tags,
    sourcePage,
    attribution: model.Creator?.Username ?? model.Attribution,
  };
}

/**
 * Header-aware JSON fetch for the Poly Pizza API. The shared `defaultFetchJson`
 * cannot carry the `x-auth-token` header, so the adapter authenticates here.
 */
async function fetchSearch(
  keyword: string,
  apiKey: string,
): Promise<PolyPizzaSearchResult> {
  const url = `${API_BASE}/search/${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-auth-token": apiKey },
  });
  if (!res.ok) {
    throw new Error(`poly-pizza fetch failed ${res.status} for ${url}`);
  }
  return (await res.json()) as PolyPizzaSearchResult;
}

export interface PolyPizzaAdapterOptions {
  /** API key. Defaults to `process.env.POLY_PIZZA_API_KEY`. */
  readonly apiKey?: string;
  /**
   * Override the network call for deterministic tests. Receives the search
   * keyword and the resolved API key, returns the raw `{ total, results }` body.
   */
  readonly fetchSearch?: (
    keyword: string,
    apiKey: string,
  ) => Promise<PolyPizzaSearchResult>;
}

export function createPolyPizzaAdapter(
  options: PolyPizzaAdapterOptions = {},
): SourceAdapter {
  const apiKey = options.apiKey ?? process.env.POLY_PIZZA_API_KEY;
  const doFetch = options.fetchSearch ?? fetchSearch;

  return {
    id: "poly-pizza",
    label: "Poly Pizza (Creative Commons)",
    async search(query: ResolveQuery, _ctx: AdapterContext) {
      // No key -> degrade gracefully rather than throw, so the federation layer
      // simply sees this source contribute nothing.
      if (!apiKey) return [];
      const keyword = query.text.trim();
      if (!keyword) return [];
      const body = await doFetch(keyword, apiKey);
      const results = Array.isArray(body?.results) ? body.results : [];
      const assets: AuraCanonicalAsset[] = [];
      for (const model of results) {
        if (model && typeof model.ID === "string") {
          const canonical = toCanonical(model);
          if (canonical) assets.push(canonical);
        }
      }
      return assets;
    },
  };
}
