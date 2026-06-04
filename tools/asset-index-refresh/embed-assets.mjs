#!/usr/bin/env node
// Generate semantic embeddings for assets via Cloudflare Workers AI
// (@cf/baai/bge-base-en-v1.5, 768-dim) and store them in the D1 `embeddings`
// table. Idempotent (skips already-embedded), sliceable by rowid range, so many
// agents can run disjoint slices in parallel.
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID,
//      ROWID_START (default 0), ROWID_END (default 1e12)

const A = req("CLOUDFLARE_ACCOUNT_ID");
const T = req("CLOUDFLARE_API_TOKEN");
const DB = req("D1_DATABASE_ID");
const START = Number(process.env.ROWID_START ?? 0);
const END = Number(process.env.ROWID_END ?? 1e12);
const QUERY = `https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${DB}/query`;
const AI = `https://api.cloudflare.com/client/v4/accounts/${A}/ai/run/@cf/baai/bge-base-en-v1.5`;

function req(n) { const v = process.env[n]; if (!v) throw new Error(`missing env ${n}`); return v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  let e;
  for (let i = 0; i < 10; i++) {
    try { return await fn(); } catch (err) {
      e = err;
      // Exponential backoff with jitter; longer waits on 429 throttling.
      const is429 = String(err && err.message).includes(" 429");
      const base = is429 ? 1500 : 800;
      await sleep(base * (i + 1) + Math.floor(Math.random() * 400));
    }
  }
  throw e;
}

// Global limiter so all D1 calls (across concurrent sub-batches) stay under
// Cloudflare's per-database request-rate ceiling that triggers HTTP 429.
let d1Chain = Promise.resolve();
function d1Throttled(fn) {
  const run = d1Chain.then(fn, fn);
  // keep the chain alive regardless of success/failure, with a tiny gap
  d1Chain = run.then(() => sleep(120), () => sleep(120));
  return run;
}

async function d1(sql) {
  return d1Throttled(() => withRetry(async () => {
    const r = await fetch(QUERY, {
      method: "POST",
      headers: { authorization: `Bearer ${T}`, "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    if (!r.ok) throw new Error(`D1 ${r.status}: ${(await r.text()).slice(0, 150)}`);
    return r.json();
  }));
}

async function embed(texts) {
  return withRetry(async () => {
    const r = await fetch(AI, {
      method: "POST",
      headers: { authorization: `Bearer ${T}`, "content-type": "application/json" },
      body: JSON.stringify({ text: texts }),
    });
    if (!r.ok) throw new Error(`AI ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const j = await r.json();
    return j.result?.data ?? [];
  });
}

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  let total = 0;
  for (;;) {
    // Fetch a page of not-yet-embedded assets in this rowid range.
    const res = await d1(
      `SELECT a.rowid AS rid, a.id, a.title, a.tags, a.description FROM assets a ` +
      `LEFT JOIN embeddings e ON e.id = a.id ` +
      // re-embed rows with no vector OR a too-short (corrupt/empty) vector
      `WHERE (e.id IS NULL OR length(e.vector) < 200) AND a.rowid >= ${START} AND a.rowid < ${END} ` +
      `AND a.quality_score > ${Number(process.env.QUALITY_MIN ?? 0)} LIMIT 200`,
    );
    const rows = res.result?.[0]?.results ?? [];
    if (rows.length === 0) break;

    // Embed in sub-batches; Workers AI takes an array of texts.
    // Round to 6 decimals (plenty for cosine) to fit D1's ~100KB/statement limit.
    const enc = (v) => JSON.stringify((v ?? []).map((x) => Math.round(x * 1e6) / 1e6));
    // Process the page's 50-row sub-batches CONCURRENTLY (each = 1 AI call +
    // parallel D1 writes), instead of one at a time.
    const subs = [];
    for (let i = 0; i < rows.length; i += 50) subs.push(rows.slice(i, i + 50));
    const counts = await Promise.all(subs.map(async (sub) => {
      const texts = sub.map((r) => `${r.title ?? ""} ${r.tags ?? ""} ${r.description ?? ""}`.slice(0, 1500));
      const vecs = await embed(texts);
      const writes = [];
      for (let j = 0; j < sub.length; j += 6) {
        const part = sub.slice(j, j + 6);
        const values = part.map((r, k) => `(${sqlStr(r.id)},${sqlStr(enc(vecs[j + k]))})`).join(",");
        writes.push(d1(`INSERT OR REPLACE INTO embeddings (id, vector) VALUES ${values}`));
      }
      await Promise.all(writes);
      return sub.length;
    }));
    total += counts.reduce((a, b) => a + b, 0);
    console.log(`embedded ${total} (rowid ${START}-${END})`);
  }
  console.log(`DONE: ${total} embedded in rowid range ${START}-${END}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
