#!/usr/bin/env node
// Bulk-ingest Objaverse (allenai/objaverse on HuggingFace) into the D1 catalog.
// ~800k objects across 160 metadata shards; ~88% are CC-BY/CC0 (redistributable)
// with direct HF GLB URLs, name/tags/description, and likes/views (quality).
// Static files = NO rate limit, so parallel agents over disjoint shard ranges
// scale linearly. Sliceable by SHARD_START..SHARD_END.
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID,
//      SHARD_START (default 0), SHARD_END (default 160)

import { gunzipSync } from "node:zlib";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const A = req("CLOUDFLARE_ACCOUNT_ID");
const T = req("CLOUDFLARE_API_TOKEN");
const DB = req("D1_DATABASE_ID");
const SHARD_START = Number(process.env.SHARD_START ?? 0);
const SHARD_END = Number(process.env.SHARD_END ?? 160);
const QUERY = `https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${DB}/query`;
const HF = "https://huggingface.co/datasets/allenai/objaverse/resolve/main";
const OP_CACHE = "/tmp/objaverse-op.json";

function req(n) { const v = process.env[n]; if (!v) throw new Error(`missing env ${n}`); return v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  let e; for (let i = 0; i < 6; i++) { try { return await fn(); } catch (err) { e = err; await sleep((i + 1) * 700); } } throw e;
}
async function d1(sql) {
  return withRetry(async () => {
    const r = await fetch(QUERY, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify({ sql }) });
    if (!r.ok) throw new Error(`D1 ${r.status}: ${(await r.text()).slice(0, 150)}`);
    return r.json();
  });
}
async function fetchGz(url) {
  return withRetry(async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8"));
  });
}

const sqlVal = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replace(/'/g, "''")}'`;

// All Objaverse (Sketchfab) CC license tiers. `redis` = commercially
// redistributable (the default auto-pull set); non-commercial tiers are still
// ingested + tagged, surfaced only when a user opts into non-commercial use.
const LICENSE = {
  cc0: { spdx: "CC0-1.0", redis: 1, attr: 0 },
  by: { spdx: "CC-BY-4.0", redis: 1, attr: 1 },
  "by-sa": { spdx: "CC-BY-SA-4.0", redis: 1, attr: 1 },
  "by-nd": { spdx: "CC-BY-ND-4.0", redis: 1, attr: 1 },
  "by-nc": { spdx: "CC-BY-NC-4.0", redis: 0, attr: 1 },
  "by-nc-sa": { spdx: "CC-BY-NC-SA-4.0", redis: 0, attr: 1 },
  "by-nc-nd": { spdx: "CC-BY-NC-ND-4.0", redis: 0, attr: 1 },
};

const COLS = [
  "id", "source", "title", "url", "access", "format", "license_spdx",
  "license_verified", "license_redistributable", "attribution_required",
  "triangles", "has_animations", "thumbnail_url", "source_page", "attribution",
  "tags", "updated_at", "description", "like_count", "view_count", "quality_score",
];

function tagsOf(meta) {
  const t = meta.tags;
  if (!Array.isArray(t)) return "";
  return t.map((x) => (typeof x === "string" ? x : x?.name ?? x?.slug ?? "")).filter(Boolean).join(" ").toLowerCase().slice(0, 500);
}

async function loadObjectPaths() {
  if (existsSync(OP_CACHE)) return JSON.parse(readFileSync(OP_CACHE, "utf8"));
  const r = await fetch(`${HF}/object-paths.json.gz`);
  const op = JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8"));
  try { writeFileSync(OP_CACHE, JSON.stringify(op)); } catch { /* cache best-effort */ }
  return op;
}

async function main() {
  const op = await loadObjectPaths();
  const updatedAt = new Date().toISOString();
  let total = 0;
  for (let s = SHARD_START; s < SHARD_END; s++) {
    const shard = `000-${String(s).padStart(3, "0")}`;
    let meta;
    try { meta = await fetchGz(`${HF}/metadata/${shard}.json.gz`); } catch { continue; }
    const rows = [];
    for (const [uid, m] of Object.entries(meta)) {
      const lic = LICENSE[m.license];
      if (!lic) continue;            // skip by-nc / by-sa / by-nd etc.
      const path = op[uid];
      if (!path) continue;
      const likes = m.likeCount ?? 0, views = m.viewCount ?? 0;
      rows.push([
        `objaverse:${uid}`, "objaverse", (m.name || uid).slice(0, 200),
        `${HF}/${path}`, "direct-download", "glb", lic.spdx, 1, lic.redis, lic.attr,
        Number.isFinite(m.faceCount) ? m.faceCount : null,
        Number.isFinite(m.animationCount) ? (m.animationCount > 0 ? 1 : 0) : null,
        m.thumbnails?.images?.[0]?.url ?? null,
        `https://sketchfab.com/3d-models/${uid}`,
        m.user?.displayName ?? m.user?.username ?? null,
        `${(m.name || "").toLowerCase()} ${tagsOf(m)}`.slice(0, 500), updatedAt,
        (m.description || "").slice(0, 500) || null, likes, views, likes * 3 + Math.log10(views + 1),
      ]);
    }
    if (rows.length === 0) continue;
    // Insert in batches of 40 (inline values, under D1's statement limit).
    for (let i = 0; i < rows.length; i += 40) {
      const vals = rows.slice(i, i + 40).map((r) => `(${r.map(sqlVal).join(",")})`).join(",");
      await d1(`INSERT OR REPLACE INTO assets (${COLS.join(",")}) VALUES ${vals}`);
    }
    total += rows.length;
    console.log(`shard ${shard}: +${rows.length} ingested (total ${total})`);
  }
  console.log(`DONE: ${total} Objaverse assets ingested from shards ${SHARD_START}-${SHARD_END}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
