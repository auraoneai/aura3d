# Audit: the "800K+ catalog assets" claim

Date: 2026-10-25. Method: read the code, queried the real database (read-only), ran the published CLI 4.1.3 from a clean directory, ran the same prompts through the hosted-index code against the real data, downloaded and screened 90 real GLBs. Nothing here is real-GPU or visual-quality evidence; "usable" below means the structural web budget in `docs/agents/asset-workflow.md` (at most 10 MB, at most 50,000 vertices, textured) and `assets validate`.

## Verdict

- **The number is real as a row count, and wrong as a product claim.** The hosted database holds **855,001 records**. It is a licence-tagged search index over public sources, not a curated catalog, and as of today **nobody can reach it**: the Cloudflare Worker that serves it (`aura3d-asset-index-cron`) does not exist on the account, so every published CLI prints `warning: aura-index: asset-index fetch failed 404` and returns only the built-in starter pack.
- **The 652 "catalog" in our own docs is something else**: it is the monorepo's root `aura.assets.json` (our demos, games and ports: 429 models, 223 audio files, 1.36 GB, 85 entries with no licence recorded, 88 Meshy private-terms assets, 44 `production` and 39 `approved` quality). It is not shipped and not searchable by users. Stop citing it as a feature.
- **Recommendation: drop "800K+" from the site now.** Replace it with a claim we can prove today (copy below). Re-introduce the index number only after the Worker is redeployed and the three index defects below are fixed.
- **Recommendation: do not make the engine decide at runtime.** Production assets need a sha256, a same-origin URL and provenance, so resolution must happen at build time in the CLI. Put a resolution ladder in `aura3d assets resolve` (plan: `docs/workflows/asset-resolution-plan.md`).

## Evidence

### 1. Where "800,000+" comes from
`docs/api/assets.md` (now corrected), `packages/asset-index/src/adapters/aura-index.ts` ("hosted catalog (~850k)"), `tools/asset-index-refresh/objaverse-load.mjs` ("~800k objects"). The ingest loads Objaverse metadata into Cloudflare D1.

### 2. The database (read-only queries through `wrangler d1 execute aura3d-asset-index --remote`)

| Measure | Value |
|---|---|
| Records | 855,001 |
| By source | Objaverse 798,759 (93.4%), Sketchfab 40,978, ABO 7,953, Poly Pizza 5,716, OS3A 991, Poly Haven 436, Khronos 118, Kenney mirror 50 |
| CC0 | 9,467 (1.1%) |
| CC-BY 4.0 / 3.0 | 750,335 / 4,043 (88.3% together; **attribution required in a shipped game**) |
| CC-BY-SA | 15,399 (flagged redistributable by the loader; share-alike duties) |
| Non-commercial (NC, NC-SA) | 75,049 (8.8%; never usable in a shipped game) |
| Unverified licence | 708 |
| Shippable licence (CC0, CC-BY 3/4) with direct download | 763,409 |
| of those, at most 50,000 triangles | 484,355 (63%) |
| of those, more than 100,000 triangles | 213,209 (28%) |
| of those, animated | 40,640 (5.3%); web-sized and animated 28,810 |
| CC0 and at most 50,000 triangles | 2,548 |

Licence risks: the loader marks CC-BY-SA as redistributable and the CLI default is `commercial=true`, so SA records can surface in searches; CC-BY-ND would also be flagged redistributable (none in the current table), yet ND forbids the modified GLBs that `assets optimize` and remeshing produce.

### 3. The hosted endpoint is down
`https://aura3d-asset-index-cron.newsroom.workers.dev/search` and `/health` return HTTP 404 (Cloudflare error 1042). `wrangler deployments list --name aura3d-asset-index-cron` answers "This Worker does not exist on your account" (code 10007). The account's workers.dev subdomain is `newsroom`, so redeploying `workers/asset-index-cron` restores the exact URL every published CLI already uses. The R2 index and D1 data are intact. No removal note exists in the repo.

### 4. Published CLI 4.1.3, 20 realistic prompts (clean install, no logins)
Every run printed the 404 warning. Only 6 of 20 prompts returned anything (the built-in starter pack): clear matches 3 (oak tree, human character with rig, sci-fi crate), a weak match 1 (chair returned a stool), wrong matches 2 ("sports car" returned a delivery vehicle, "street lamp" returned a delivery car). Fourteen returned nothing.

### 5. The same prompts with the open-source fallbacks wired in (this change, 4.2.0)
`buildSearchAdapters` returned only the library, starter pack and hosted index whenever the hosted adapter existed, so a dead index meant no Poly Haven, ambientCG, Khronos, OS3A or jsDelivr mirror. After wiring them in, a mesh-only filter (texture sets and HDRIs hidden unless the query asks for them), and a ranking fix (popular, unmatched assets scored above zero for every query: "Garbage Truck" appeared for "sword"): 13 of 20 prompts return a clearly relevant first result, 3 partial, 2 wrong (tennis racket, wooden bridge), 2 honestly empty (golf club, campfire).

### 6. The hosted index code against the real data (`wrangler dev --remote`, local only, not exposed)
All 20 prompts return relevant top results by title, mostly in 0.2 to 1.1 s (one 60 s cold start). So the feature is strong as search. Where it falls down is what comes after the hit:

| Of the top 2 hits for each of 20 prompts (40 files) | Count |
|---|---|
| Web-ready (at most 10 MB, at most 50k vertices, textured) | 17 (42.5%) |
| Too heavy (over 10 MB or 50k vertices) | 9 |
| Over 60 MB | 2 |
| Not downloadable (HTTP 401: Sketchfab rows labelled `direct-download`) | 5 |
| Untextured | 7 |

Only 11 of 20 prompts had at least one web-ready hit in the top two. The worker's search result carries no triangle count, file size, animation flag or format, though the database has them, so a client cannot filter before downloading.

### 7. Random screening of 50 real Objaverse GLBs (25 random, 25 most-liked; 48 downloaded, 2 over 60 MB)
`assets inspect` returns `ok: false` for all 48, only because outside assets lack Aura3D orientation metadata; that flag is not a quality signal. By structural limits: 23 over 50,000 vertices, 17 over 10 MB, 13 untextured, 6 animated. **18 of 48 (37.5%) are web-sized and textured; all 18 passed `assets add` and `assets validate --require-license --no-placeholders` with only the orientation warning.** Objaverse metadata over 15,000 records: median 21.7k faces, 30% over 100k, 37% with no tags.

### 8. Curated library in the repo
`aura.library.json`: 11 kits, 95 entries, all CC0, all `candidate` quality, 254 MB under `assets/library/`. It is per-project (read from the project root) and is not in the npm packages.

## Draft site copy (for the site-claims lane; not applied here)

Remove: "800K+ catalog assets", "a ~850K catalog", "652-entry catalog".

Use today (true now): "Find, generate and admit 3D assets from the CLI: search licence-tagged public sources, generate with Meshy from a text prompt, and every asset ships with a sha256, a source and a licence record that `check-deploy` verifies."

Use after the hosted index is redeployed and filters ship: "Search an index of about 855,000 public, licence-tagged 3D models, filtered to CC0 and CC-BY and screened against web budgets before they enter your project. Need something that does not exist? Generate it."

## Defects found (fixed in this change unless marked)

1. Dead hosted Worker (fix: redeploy `workers/asset-index-cron`; **not done**, needs the owner's go-ahead because it exposes a public endpoint on the VeerOne account).
2. Fallback sources never ran when the index adapter existed (fixed; also a latent `"polyhaven"` vs `"poly-haven"` id mismatch).
3. Texture sets and HDRIs surfaced for model queries (fixed).
4. Unmatched popular assets ranked for every query (fixed).
5. Open defects: the worker result omits triangles, size, animation and format; Sketchfab rows are labelled `direct-download` but need a token (5 of 5 sampled hits returned 401); CC-BY-SA and any ND rows count as redistributable; `resolve` throws "refused" with no next step.
6. Stale tests (not touched): `poly-haven-adapter.test.ts` fails on the unmodified branch because the adapter also fetches `?t=hdris`, and one `runResolve` role-admission test fails on the unmodified branch.
