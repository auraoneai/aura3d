import {
  createPolyPizzaAdapter,
  createSketchfabAdapter,
  defaultAdapters,
  defaultFetchJson,
  refreshIndex,
  type SourceAdapter,
} from "@aura3d/asset-index";
import { R2IndexStore } from "./store.js";

export interface Env {
  /** R2 bucket holding the catalog JSON (binding from wrangler.toml). */
  ASSET_INDEX: R2Bucket;
  /** Object key for the index JSON. Defaults to "asset-index.json". */
  INDEX_KEY?: string;
  /** Optional shared secret guarding the manual /__refresh trigger. */
  REFRESH_TOKEN?: string;
  /** Sketchfab Data API token (secret). Enables the Sketchfab keyword sweep. */
  SKETCHFAB_API_TOKEN?: string;
  /** Poly Pizza API key (secret). Enables the Poly Pizza keyword sweep. */
  POLY_PIZZA_API_KEY?: string;
  /** D1 catalog (the ~847k searchable store). */
  DB: D1Database;
  /** Workers AI — embeds the search query (bge-base, same model as asset vectors). */
  AI: { run(model: string, input: { text: string[] }): Promise<{ data: number[][] }> };
}

interface SearchRow {
  id: string;
  title: string;
  source: string;
  url: string;
  license_spdx: string;
  thumbnail_url: string | null;
  attribution: string | null;
  quality_score: number | null;
  vector: string | null;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/**
 * Hybrid search over the D1 catalog: FTS keyword prefilter (broad recall) ->
 * Workers AI query embedding -> cosine semantic rerank blended with quality.
 * This is the read path the Aura3D prompt feature / CLI resolver calls.
 */
async function searchCatalog(env: Env, q: string, opts: { limit: number; commercialOnly: boolean }): Promise<unknown> {
  const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (terms.length === 0) return { query: q, results: [] };
  const match = terms.join(" OR ");
  const licenseClause = opts.commercialOnly ? "AND a.license_redistributable = 1" : "";

  const { results } = await env.DB.prepare(
    `SELECT a.id, a.title, a.source, a.url, a.license_spdx, a.thumbnail_url, a.attribution, a.quality_score, e.vector
       FROM assets_fts f JOIN assets a ON a.id = f.id
       LEFT JOIN embeddings e ON e.id = a.id
      WHERE f.text MATCH ?1 AND a.access = 'direct-download' ${licenseClause}
      ORDER BY rank
      LIMIT 500`,
  ).bind(match).all<SearchRow>();
  const candidates = results ?? [];
  if (candidates.length === 0) return { query: q, results: [] };

  const qv = (await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [q] })).data[0];
  // Log-scale quality so a few super-popular assets don't crush curated-but-
  // unrated ones (e.g. ABO products) to zero; semantic stays the dominant signal.
  const maxQ = Math.max(1, ...candidates.map((c) => c.quality_score ?? 0));
  const logMaxQ = Math.log1p(maxQ);
  const ranked = candidates
    .map((c) => {
      let vec: number[] | null = null;
      try { vec = c.vector ? JSON.parse(c.vector) : null; } catch { vec = null; }
      const sem = vec && vec.length === qv.length ? cosine(qv, vec) : 0;
      const qual = Math.log1p(c.quality_score ?? 0) / logMaxQ;
      return {
        id: c.id, title: c.title, source: c.source, url: c.url,
        license: c.license_spdx, thumbnail: c.thumbnail_url, attribution: c.attribution,
        score: sem * 0.8 + qual * 0.2,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit);

  return { query: q, count: ranked.length, results: ranked };
}

interface RefreshRun {
  readonly updatedAt: string;
  readonly durationMs: number;
  readonly total: number;
  readonly perSource: Record<string, number>;
  readonly warnings: string[];
}

/**
 * Curated categories swept against keyword-search sources (Sketchfab, Poly
 * Pizza). Those APIs cannot be enumerated wholesale — an empty query returns
 * little or nothing — so the cron pre-warms the index with popular categories.
 * The full long tail stays reachable live via the resolver at query time.
 *
 * NOTE: kept small to fit the free Workers plan's 50-subrequests-per-invocation
 * cap (the enumerable mirror already spends ~20). On Workers Paid (1000
 * subrequests) this list can grow to hundreds of categories for a far larger
 * pre-indexed slice.
 */
const SWEEP_KEYWORDS = [
  "car", "chair", "table", "tree", "house", "robot", "character", "building",
  "weapon", "animal",
];

function indexKey(env: Env): string {
  return env.INDEX_KEY ?? "asset-index.json";
}

/** Keyword-search adapters enabled only when their secret is configured. */
function searchAdapters(env: Env): SourceAdapter[] {
  const adapters: SourceAdapter[] = [];
  if (env.SKETCHFAB_API_TOKEN) {
    adapters.push(createSketchfabAdapter({ token: env.SKETCHFAB_API_TOKEN }));
  }
  if (env.POLY_PIZZA_API_KEY) {
    adapters.push(createPolyPizzaAdapter({ apiKey: env.POLY_PIZZA_API_KEY }));
  }
  return adapters;
}

/**
 * One full refresh: mirror the enumerable CC0 sources, then sweep the curated
 * keyword set across any configured search-API sources, then persist once.
 * `new Date()` is the real wall clock here — correct in the Worker runtime (the
 * determinism rule only applied to workflow scripts).
 */
async function runRefresh(env: Env): Promise<RefreshRun> {
  const startedAt = Date.now();
  const updatedAt = new Date().toISOString();
  const ctx = { fetchJson: defaultFetchJson };
  const store = await R2IndexStore.load(env.ASSET_INDEX, indexKey(env));
  const warnings: string[] = [];
  const perSource: Record<string, number> = {};

  // 1) Enumerable CC0 sources (Khronos, OS3A, Poly Haven): full mirror.
  const enumerable = await refreshIndex(defaultAdapters(), store, ctx, {});
  Object.assign(perSource, enumerable.perSource);
  warnings.push(...enumerable.warnings);

  // 2) Keyword-search sources (Sketchfab, Poly Pizza): curated category sweep.
  const search = searchAdapters(env);
  for (const adapter of search) perSource[adapter.id] = 0;
  for (const keyword of SWEEP_KEYWORDS) {
    for (const adapter of search) {
      try {
        const assets = await adapter.search({ text: keyword }, ctx);
        store.upsertMany(adapter.id, assets);
        perSource[adapter.id] += assets.length;
      } catch (err) {
        warnings.push(`${adapter.id}[${keyword}]: ${(err as Error).message}`);
      }
    }
  }

  await store.save(updatedAt);
  return {
    updatedAt,
    durationMs: Date.now() - startedAt,
    total: store.all().length,
    perSource,
    warnings,
  };
}

export default {
  /** Cron entrypoint — runs nightly per the `crons` trigger in wrangler.toml. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runRefresh(env).then(
        (r) => console.log("asset-index refresh ok", JSON.stringify(r)),
        (err) => console.error("asset-index refresh failed", err),
      ),
    );
  },

  /** Read path + manual trigger + health. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (url.pathname === "/index.json" && request.method === "GET") {
      const object = await env.ASSET_INDEX.get(indexKey(env));
      if (!object) {
        return new Response(JSON.stringify({ error: "index not built yet" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(object.body, {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
      });
    }

    // Hybrid search over the full D1 catalog — the prompt feature's read path.
    if (url.pathname === "/search" && request.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim()) return Response.json({ error: "missing ?q=" }, { status: 400 });
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
      const commercialOnly = url.searchParams.get("commercial") !== "false";
      const out = await searchCatalog(env, q, { limit, commercialOnly });
      return new Response(JSON.stringify(out), {
        headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "public, max-age=60" },
      });
    }

    if (url.pathname === "/__refresh" && request.method === "POST") {
      if (env.REFRESH_TOKEN && request.headers.get("x-refresh-token") !== env.REFRESH_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      const run = await runRefresh(env);
      return Response.json(run);
    }

    return new Response("aura3d asset-index cron worker", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};
