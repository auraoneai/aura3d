/**
 * Deep keyword crawler -> D1. Crawls a slice of the keyword pool against
 * Sketchfab (CC0 + CC-BY, paged) and Poly Pizza, and writes results straight
 * into the D1 store with small batched requests (which work from anywhere,
 * unlike large uploads). Handles 429/socket errors with backoff so it keeps
 * going under rate limits.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID,
 *      SKETCHFAB_API_TOKEN, POLY_PIZZA_API_KEY,
 *      KEYWORD_START (default 0), KEYWORD_COUNT (default 50),
 *      TARGET (default 100000) — stop early once D1 reaches this.
 * Keywords read from /tmp/keywords.txt.
 */
import { readFileSync } from "node:fs";
import {
  createPolyPizzaAdapter,
  createSketchfabAdapter,
  type AuraCanonicalAsset,
} from "@aura3d/asset-index";

const ACCOUNT = req("CLOUDFLARE_ACCOUNT_ID");
const TOKEN = req("CLOUDFLARE_API_TOKEN");
const DB = req("D1_DATABASE_ID");
const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`;
const START = Number(process.env.KEYWORD_START ?? 0);
const COUNT = Number(process.env.KEYWORD_COUNT ?? 50);
const TARGET = Number(process.env.TARGET ?? 100000);

function req(n: string): string {
  const v = process.env[n];
  if (!v) throw new Error(`missing env ${n}`);
  return v;
}

const COLS = [
  "id", "source", "title", "url", "access", "format", "license_spdx",
  "license_verified", "license_redistributable", "attribution_required",
  "triangles", "has_animations", "thumbnail_url", "source_page", "attribution",
  "tags", "updated_at", "description", "like_count", "view_count", "quality_score",
];

/** Popularity-based quality score (likes dominate, views as a log tiebreak). */
function qualityScore(a: AuraCanonicalAsset): number {
  const likes = a.likeCount ?? 0;
  const views = a.viewCount ?? 0;
  return likes * 3 + Math.log10(views + 1);
}

function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function d1(sql: string): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(QUERY_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      if (!res.ok) throw new Error(`D1 ${res.status}: ${(await res.text()).slice(0, 150)}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep((i + 1) * 800);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry transient HTTP (Sketchfab 429/408, socket resets) with backoff. */
async function retryingFetchJson(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429 || res.status === 408 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep((i + 1) * 1200); // back off harder on rate limits
    }
  }
  throw lastErr;
}

async function upsert(assets: AuraCanonicalAsset[]): Promise<void> {
  if (assets.length === 0) return;
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < assets.length; i += 100) {
    const chunk = assets.slice(i, i + 100);
    const values = chunk.map((a) => {
      const lic = a.license ?? ({} as AuraCanonicalAsset["license"]);
      return `(${[
        a.id, a.source, a.title, a.url, a.access, a.format, lic.spdx,
        lic.verified ? 1 : 0, lic.redistributable ? 1 : 0, lic.attributionRequired ? 1 : 0,
        Number.isFinite(a.triangles) ? a.triangles : null,
        typeof a.hasAnimations === "boolean" ? (a.hasAnimations ? 1 : 0) : null,
        a.thumbnailUrl ?? null, a.sourcePage ?? null, a.attribution ?? null,
        Array.isArray(a.tags) ? a.tags.join(" ") : null, updatedAt,
        a.description ?? null,
        Number.isFinite(a.likeCount) ? a.likeCount : null,
        Number.isFinite(a.viewCount) ? a.viewCount : null,
        qualityScore(a),
      ].map(sqlVal).join(",")})`;
    }).join(",");
    await d1(`INSERT OR REPLACE INTO assets (${COLS.join(",")}) VALUES ${values}`);
    const fts = chunk
      .map((a) => `(${sqlVal(a.id)},${sqlVal(`${a.title} ${(a.tags ?? []).join(" ")}`)})`)
      .join(",");
    await d1(`INSERT INTO assets_fts (id, text) VALUES ${fts}`);
  }
}

async function count(): Promise<number> {
  const r = (await d1("SELECT COUNT(*) AS n FROM assets")) as { result?: { results?: { n: number }[] }[] };
  return r.result?.[0]?.results?.[0]?.n ?? 0;
}

async function main(): Promise<void> {
  const keywords = readFileSync("/tmp/keywords.txt", "utf8").split("\n").filter(Boolean);
  const slice = keywords.slice(START, START + COUNT);
  const ctx = { fetchJson: retryingFetchJson };
  const sk = createSketchfabAdapter({ token: process.env.SKETCHFAB_API_TOKEN, maxPages: 4, throttleMs: 300 });
  const pp = createPolyPizzaAdapter({ apiKey: process.env.POLY_PIZZA_API_KEY });

  let added = 0;
  for (const kw of slice) {
    const batch = new Map<string, AuraCanonicalAsset>();
    // Defer invocation so a query that rejects (e.g. exhausted 429 backoff)
    // only surfaces inside the try/catch below, never as an eager unhandled
    // rejection that would crash the whole crawl.
    // Run the three source queries CONCURRENTLY (2 Sketchfab licenses + Poly
    // Pizza — different endpoints), instead of one after another.
    const settled = await Promise.allSettled([
      sk.search({ text: kw, constraints: { license: ["CC0"] } }, ctx),
      sk.search({ text: kw, constraints: { license: ["CC-BY"] } }, ctx),
      pp.search({ text: kw }, ctx),
    ]);
    for (const s of settled) {
      if (s.status === "fulfilled") {
        for (const a of s.value) batch.set(a.id, a);
      }
    }
    await upsert([...batch.values()]);
    added += batch.size;
    const total = await count();
    console.log(`[kw ${kw}] +${batch.size} | D1 total ${total}`);
    if (total >= TARGET) {
      console.log(`TARGET ${TARGET} reached at ${total}`);
      return;
    }
  }
  console.log(`slice done: processed ${slice.length} keywords, ~${added} written, D1 total ${await count()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
