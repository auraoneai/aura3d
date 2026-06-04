#!/usr/bin/env node
// Load the current R2 JSON index into the D1 store (the migration to the
// scalable backend). Batches INSERT OR REPLACE via the D1 REST API. Small
// requests, so it works from anywhere (unlike a single multi-MB upload).
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID,
//      INDEX_URL (default the worker /index.json)

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DB = process.env.D1_DATABASE_ID;
const INDEX_URL = process.env.INDEX_URL ?? "https://aura3d-asset-index-cron.newsroom.workers.dev/index.json";
if (!ACCOUNT || !TOKEN || !DB) throw new Error("missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / D1_DATABASE_ID");

const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`;
const COLS = [
  "id", "source", "title", "url", "access", "format", "license_spdx",
  "license_verified", "license_redistributable", "attribution_required",
  "triangles", "has_animations", "thumbnail_url", "source_page", "attribution",
  "tags", "updated_at",
];

async function d1(sql, params) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(QUERY_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ sql, params }),
      });
      if (!res.ok) throw new Error(`D1 ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 700));
    }
  }
  throw lastErr;
}

// D1 caps bound params at 100/query, so we inline escaped values instead (limit
// is statement size, ~100KB, not param count).
function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function rowSql(a, updatedAt) {
  const lic = a.license ?? {};
  const vals = [
    a.id, a.source, a.title, a.url, a.access, a.format, lic.spdx ?? "UNVERIFIED",
    lic.verified ? 1 : 0, lic.redistributable ? 1 : 0, lic.attributionRequired ? 1 : 0,
    Number.isFinite(a.triangles) ? a.triangles : null,
    typeof a.hasAnimations === "boolean" ? (a.hasAnimations ? 1 : 0) : null,
    a.thumbnailUrl ?? null, a.sourcePage ?? null, a.attribution ?? null,
    Array.isArray(a.tags) ? a.tags.join(" ") : null, updatedAt,
  ];
  return `(${vals.map(sqlVal).join(",")})`;
}

async function main() {
  const updatedAt = new Date().toISOString();
  const file = await (await fetch(INDEX_URL)).json();
  const assets = (file.assets ?? []).filter((a) => a && typeof a.id === "string");
  console.log(`loading ${assets.length} assets into D1...`);
  await d1("DELETE FROM assets_fts"); // FTS has no PK; clear before reload

  const BATCH = 100; // rows/req, inline values (~85KB statement)
  let done = 0;
  for (let i = 0; i < assets.length; i += BATCH) {
    const chunk = assets.slice(i, i + BATCH);
    const values = chunk.map((a) => rowSql(a, updatedAt)).join(",");
    await d1(`INSERT OR REPLACE INTO assets (${COLS.join(",")}) VALUES ${values}`);
    const fts = chunk
      .map((a) => `(${sqlVal(a.id)},${sqlVal(`${a.title} ${(a.tags ?? []).join(" ")}`)})`)
      .join(",");
    await d1(`INSERT INTO assets_fts (id, text) VALUES ${fts}`);
    done += chunk.length;
    if (done % 1000 === 0 || done === assets.length) console.log(`  ${done}/${assets.length}`);
  }

  const count = await d1("SELECT COUNT(*) AS n FROM assets", []);
  const pull = await d1(
    "SELECT COUNT(*) AS n FROM assets WHERE access='direct-download' AND license_verified=1 AND license_redistributable=1", []);
  console.log(`D1 loaded: ${count.result?.[0]?.results?.[0]?.n} rows, ${pull.result?.[0]?.results?.[0]?.n} auto-pullable`);
}

main().catch((e) => { console.error(e); process.exit(1); });
