#!/usr/bin/env node
// Ingest Amazon Berkeley Objects (ABO) — ~7,953 product 3D models, CC-BY-4.0,
// hosted on public S3 with direct GLB URLs. Joins 3dmodels.csv (id->path) with
// the listings shards (item_id->product name/type/color) for real titles.
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID

import { gunzipSync } from "node:zlib";

const A = req("CLOUDFLARE_ACCOUNT_ID");
const T = req("CLOUDFLARE_API_TOKEN");
const DB = req("D1_DATABASE_ID");
const QUERY = `https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${DB}/query`;
const S3 = "https://amazon-berkeley-objects.s3.amazonaws.com";

function req(n) { const v = process.env[n]; if (!v) throw new Error(`missing env ${n}`); return v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function d1(sql) {
  let e;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(QUERY, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify({ sql }) });
      if (!r.ok) throw new Error(`D1 ${r.status}: ${(await r.text()).slice(0, 150)}`);
      return r.json();
    } catch (err) { e = err; await sleep((i + 1) * 700); }
  }
  throw e;
}
async function fetchGz(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8");
}
const sqlVal = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replace(/'/g, "''")}'`;

const COLS = [
  "id", "source", "title", "url", "access", "format", "license_spdx",
  "license_verified", "license_redistributable", "attribution_required",
  "triangles", "has_animations", "thumbnail_url", "source_page", "attribution",
  "tags", "updated_at", "description", "like_count", "view_count", "quality_score",
];

function enValue(arr) {
  if (!Array.isArray(arr)) return null;
  const en = arr.find((x) => (x.language_tag || "").startsWith("en"));
  return (en || arr[0])?.value ?? null;
}

async function main() {
  const updatedAt = new Date().toISOString();
  // 1. id -> { path, faces }
  const csv = (await fetchGz(`${S3}/3dmodels/metadata/3dmodels.csv.gz`)).trim().split("\n");
  const header = csv[0].split(",");
  const iPath = header.indexOf("path"), iFaces = header.indexOf("faces");
  const models = new Map();
  for (let i = 1; i < csv.length; i++) {
    const c = csv[i].split(",");
    models.set(c[0], { path: c[iPath], faces: Number(c[iFaces]) || null });
  }
  console.log(`ABO models: ${models.size}`);

  // 2. item_id -> { name, type, color }  (16 listings shards: 0-9, a-f)
  const info = new Map();
  const shards = [..."0123456789abcdef"].map((h) => `listings_${h}`);
  for (const s of shards) {
    let text;
    try { text = await fetchGz(`${S3}/listings/metadata/${s}.json.gz`); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      if (!d.item_id || info.has(d.item_id)) continue;
      info.set(d.item_id, {
        name: enValue(d.item_name),
        type: Array.isArray(d.product_type) ? (d.product_type[0]?.value ?? "") : "",
        color: enValue(d.color),
        brand: enValue(d.brand),
      });
    }
    console.log(`  loaded ${s} (info ${info.size})`);
  }

  // 3. join -> rows
  const rows = [];
  for (const [id, m] of models) {
    const meta = info.get(id) ?? {};
    const title = (meta.name || meta.type || id).slice(0, 200);
    const tags = `${meta.type ?? ""} ${meta.color ?? ""} ${meta.brand ?? ""}`.toLowerCase().trim().slice(0, 300);
    rows.push([
      `abo:${id}`, "abo", title,
      `${S3}/3dmodels/original/${m.path}`, "direct-download", "glb", "CC-BY-4.0", 1, 1, 1,
      m.faces, 0, null, `https://www.amazon.com/dp/${id}`, "Amazon Berkeley Objects",
      tags, updatedAt, meta.name ? meta.name.slice(0, 500) : null, null, null,
      10, // curated product grade -> ranks/embeds with the quality set
    ]);
  }

  for (let i = 0; i < rows.length; i += 40) {
    const vals = rows.slice(i, i + 40).map((r) => `(${r.map(sqlVal).join(",")})`).join(",");
    await d1(`INSERT OR REPLACE INTO assets (${COLS.join(",")}) VALUES ${vals}`);
    if ((i / 40) % 20 === 0) console.log(`  inserted ${i}/${rows.length}`);
  }
  console.log(`DONE: ${rows.length} ABO assets ingested`);
}
main().catch((e) => { console.error(e); process.exit(1); });
