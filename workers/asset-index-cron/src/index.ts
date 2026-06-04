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
