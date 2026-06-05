#!/usr/bin/env node
// Backfill the FTS index for assets missing from it (e.g. the Objaverse bulk
// load wrote only to `assets`). Server-side INSERT...SELECT (no data transfer),
// batched by rowid range so it's sliceable across parallel agents.
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID,
//      ROWID_START (default 0), ROWID_END (default 1e12)

const A = req("CLOUDFLARE_ACCOUNT_ID");
const T = req("CLOUDFLARE_API_TOKEN");
const DB = req("D1_DATABASE_ID");
const START = Number(process.env.ROWID_START ?? 0);
const END = Number(process.env.ROWID_END ?? 1e12);
const QUERY = `https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${DB}/query`;

function req(n) { const v = process.env[n]; if (!v) throw new Error(`missing env ${n}`); return v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function d1(sql) {
  let e;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(QUERY, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify({ sql }) });
      if (!r.ok) throw new Error(`D1 ${r.status}: ${(await r.text()).slice(0, 150)}`);
      return r.json();
    } catch (err) { e = err; await sleep((i + 1) * 800); }
  }
  throw e;
}

const WINDOW = 10000; // rowid window per query

async function main() {
  let total = 0;
  // NO anti-join (joining to the FTS5 table on its UNINDEXED id is O(n) per row
  // and trips D1's CPU limit). Caller clears assets_fts first and runs disjoint
  // rowid ranges, so a plain windowed INSERT is correct and fast.
  for (let cursor = START; cursor < END; cursor += WINDOW) {
    const res = await d1(
      `INSERT INTO assets_fts (id, text) ` +
      `SELECT id, title || ' ' || COALESCE(tags, '') FROM assets ` +
      `WHERE rowid >= ${cursor} AND rowid < ${cursor + WINDOW}`,
    );
    const changes = res.result?.[0]?.meta?.changes ?? 0;
    total += changes;
    if (changes > 0) console.log(`fts +${changes} (total ${total}, rowid <${cursor + WINDOW})`);
  }
  console.log(`DONE: ${total} fts rows added in rowid range ${START}-${END}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
