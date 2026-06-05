#!/usr/bin/env node
// Hybrid semantic + quality search over the D1 catalog:
//   1. FTS keyword prefilter (broad recall, OR-joined terms)
//   2. embed the query via Workers AI
//   3. cosine-rerank candidates by meaning, blended with quality_score
// This is the read path the resolver/prompt feature uses to pick GOOD assets.
//
// Usage: node search.mjs "rustic wooden chair"
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID

const A = req("CLOUDFLARE_ACCOUNT_ID");
const T = req("CLOUDFLARE_API_TOKEN");
const DB = req("D1_DATABASE_ID");
const QUERY = `https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${DB}/query`;
const AI = `https://api.cloudflare.com/client/v4/accounts/${A}/ai/run/@cf/baai/bge-base-en-v1.5`;
const q = process.argv.slice(2).join(" ") || "rustic wooden chair";

function req(n) { const v = process.env[n]; if (!v) throw new Error(`missing env ${n}`); return v; }

async function d1(sql, params) {
  const r = await fetch(QUERY, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify({ sql, params }) });
  if (!r.ok) throw new Error(`D1 ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return (await r.json()).result?.[0]?.results ?? [];
}
async function embed(text) {
  const r = await fetch(AI, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify({ text: [text] }) });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  return (await r.json()).result.data[0];
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function main() {
  const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const match = terms.join(" OR ");
  // 1. broad keyword recall, auto-pullable only
  const candidates = await d1(
    `SELECT a.id, a.title, a.source, a.quality_score, e.vector
       FROM assets_fts f JOIN assets a ON a.id = f.id
       LEFT JOIN embeddings e ON e.id = a.id
      WHERE f.text MATCH ? AND a.access = 'direct-download' AND a.license_redistributable = 1
      LIMIT 400`,
    [match],
  );
  // 2. embed query, 3. cosine rerank blended with quality
  const qv = await embed(q);
  const maxQ = Math.max(1, ...candidates.map((c) => c.quality_score || 0));
  const ranked = candidates.map((c) => {
    const vec = c.vector ? JSON.parse(c.vector) : null;
    const sem = vec ? cosine(qv, vec) : 0;
    const qual = (c.quality_score || 0) / maxQ; // 0..1
    return { ...c, sem, score: sem * 0.8 + qual * 0.2 };
  }).sort((a, b) => b.score - a.score);

  console.log(`query: "${q}" — ${candidates.length} keyword candidates, reranked by meaning+quality\n`);
  for (const r of ranked.slice(0, 8)) {
    console.log(`  ${r.score.toFixed(3)}  sem=${r.sem.toFixed(2)} q=${(r.quality_score || 0).toFixed(0).padStart(5)}  ${r.source}  ${r.title.slice(0, 45)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
