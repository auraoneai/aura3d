# Asset resolution ladder: `aura3d assets resolve "<need>"` decides the source

Status: v1, 2026-10-25. Agent-handoff PRD. Evidence: `docs/audit/asset-catalog-claim.md`. Implementable in about a week by parallel lanes.

## 1. Decision

Resolution happens at **build time, in the CLI**, never in the engine at runtime. A production Aura3D asset needs a same-origin URL, a sha256 and provenance (`docs/agents/asset-workflow.md`, the production bridge draws nothing otherwise), so the engine must not fetch from an index or call a generator while a game runs. What the owner asked for ("let the engine decide: existing asset, Meshy, or build from scratch like three.js") is delivered as one command that walks a ladder, spends nothing without showing the cost first, and records why it chose each source.

three.js has no ladder: you bring a model or write geometry. Aura3D's advantage is that the choice, the licence check, the screening and the provenance are one auditable step.

## 2. The ladder (stop at the first rung that passes the role's budget)

| Rung | Source | Cost | Licence handling | Screening |
|---|---|---|---|---|
| 0 | Project assets already in `aura.assets.json` | free | recorded | already admitted |
| 1 | Curated library (`aura.library.json`, kits) | free | CC0 | admitted, `candidate` or better |
| 2 | Open sources: starter pack, Khronos, Poly Haven, jsDelivr CC0 mirror (Kenney, Quaternius), OS3A | free | CC0 first | structural screen |
| 3 | Hosted index (about 855,000 records) | free | CC0 and CC-BY only for shipping (CC-BY adds an attribution record); CC-BY-SA and NC excluded by default | structural screen with size and triangle filters server side |
| 4 | Meshy generation from a text prompt, through Kiro Prism, ledger caps | credits (preview 20 + refine 10 = 30; remesh 5; rig 5; animate 3; retexture 10) | generated terms recorded | optimise, then the same screen |
| 5 | Procedural: kit prefabs and primitives | free | none | only for roles that allow it (ground, ring, beam, collider, simple props) |

Role rules (from the budgets already in `docs/agents/asset-workflow.md`): hero or vehicle at most 40k triangles, character at most 30k and rigged, prop at most 6k, background piece at most 15k, textures at most 2048 px, at most about 10 MB new assets per game. A named real-world subject (character, vehicle, weapon, creature, landmark) may not fall to rung 5.

Measured reasons for the order (audit sections 4 to 7): library and open sources are free and CC0; the index has the most variety but only about 42% of top hits pass the web budget, 5 of 40 were not downloadable, and 88% of it needs attribution; generation is the only rung that can produce a stylised, game-ready, rigged result on demand.

## 3. The command

```
aura3d assets resolve "<need>" --name <key> [--role hero|vehicle|character|prop|background|ground]
    [--budget credits=60,maxMB=10,maxTris=40000] [--license cc0|cc-by|any-shippable]
    [--sources library,open,index,meshy,procedural] [--dry-run] [--yes] [--explain]
```

Behaviour:
1. Classify the need (role) from the query and `--role`. Build the plan: the ordered rungs allowed for that role.
2. Run rungs 0 to 3 concurrently (search is free). Screen the top N candidates structurally **before downloading when possible** (needs the server fields in WP-2) and after download otherwise.
3. If a candidate passes: admit it (`assets add` with provenance and sha256), print the decision report, done.
4. If none passes and rung 4 is allowed: print the exact Meshy plan (prompt, ops, estimated credits against `--budget`, global and per-game ledger remaining) and stop with exit 2 unless `--yes` (non-interactive agents pass `--yes`; the ledger still enforces caps). Generate through the ledger helper, optimise to the role budget, admit.
5. If rung 4 is denied or fails and the role allows it, suggest or emit the procedural fallback (`prefabs.*` or `primitives.*` code with a TODO marker for later replacement); otherwise exit 3 with the reasons.
6. Always write `artifacts/aura3d/resolve-<name>.json` and print a short table: rung, source, id, licence, triangles, MB, verdict, reason. `--explain` prints why each rejected candidate was rejected.

Safety rules baked in: no CC-BY-NC or ND; CC-BY and CC-BY-SA records get an attribution entry that `check-deploy` verifies; no image-to-3D from third-party frames; never print credentials; no login commands; generation always goes through the ledger.

## 4. Current behaviour and gaps (from the code)

- `runResolve` (`packages/aura3d-cli/src/pull-bridge.ts`) ranks federated candidates, filters to auto-pullable, tries them in turn with pre-download blocking (`createPreDownloadCandidateBlockingWarnings`) and post-download inspection plus role admission (`admitAssetForRole`), falling through on failure. That is rungs 0 to 3 minus size awareness.
- It throws `Aura3D resolve refused: ...` when nothing is pullable: there is no next step, no Meshy option, no procedural option.
- Search used to run only the library, starter pack and hosted index; fixed in this change so open sources also run, textures are hidden for model queries and unmatched popular assets no longer rank.
- Gaps: (a) hosted Worker not deployed; (b) its results omit triangles, size, animation, format; (c) Sketchfab rows need a token but are labelled downloadable; (d) CC-BY-SA and ND counted as redistributable; (e) no cost-aware generation step; (f) no procedural fallback hint; (g) multi-word ranking: "wooden bridge" returned a carved elephant, "tennis racket" an air-conditioning unit.

## 5. Work packages (disjoint ownership)

**WP-1 Redeploy the hosted index (infra; owner approval needed).** `workers/asset-index-cron`: `wrangler deploy` on the VeerOne account restores `aura3d-asset-index-cron.newsroom.workers.dev` (subdomain verified as `newsroom`). Before deploying: add a per-IP rate limit and a response cache (`Cache-Control`, Cloudflare cache API) so a public endpoint cannot run up D1 reads; set `commercial=true` to exclude NC; cron secrets (`SKETCHFAB_API_TOKEN`, `POLY_PIZZA_API_KEY`) via `wrangler secret put` only if the nightly refresh is wanted. Verify with the 20-prompt script and `/health`. Rollback: `wrangler delete`.

**WP-2 Index data and API (owner: `workers/asset-index-cron/src/index.ts`, `store.ts`, `schema.sql`).** Return `triangles`, `sizeBytes` (backfill from a HEAD sweep or Objaverse metadata), `hasAnimations`, `format`, `licenseRedistributable`, `attributionRequired`, `access`; accept `maxTris`, `maxMB`, `animated`, `license` filters; fix `access` for Sketchfab rows to `token-required`; stop flagging CC-BY-SA and ND as redistributable for shipping (add `--allow-sa` opt-in); exclude `UNVERIFIED` licence. Tests with fixtures in `tests/unit/asset-index/`.

**WP-3 Ranking (owner: `packages/asset-index/src/ranking.ts`, `federate.ts`).** Require every noun in a multi-word query to match title, tags or description, or fall back to partial matches clearly marked; weight the last noun as the head noun; keep the semantic path. Add a 20-prompt relevance fixture test. (A first fix is in this change: no signals without a keyword or semantic match.)

**WP-4 Resolve ladder (owner: `packages/aura3d-cli/src/pull-bridge.ts`, `commands/assets/resolve*.ts`, new `pull-bridge/ladder.ts`).** Implement section 3: plan builder, structural pre-screen from server fields, decision report JSON and table, `--dry-run`, `--yes`, `--budget`, `--sources`, `--explain`, exit codes (0 admitted, 2 needs confirmation, 3 nothing passes). Tests: ladder order, budget refusal, NC exclusion, fall-through, report content.

**WP-5 Meshy step inside resolve (owner: `packages/aura3d-cli/src/meshy/`, `commands/meshyLedger.ts`).** Plan and price a generation from the need (text prompt only; reject prompts that name a real brand or character), reserve and settle through the ledger, run optimise to the role budget, isolated admission (`import-meshy --into --prefix`), attach provenance. Reuse `aura3d meshy ledger` and `assets optimize`. Dry-run by default; spend needs `--yes`.

**WP-6 Procedural rung (owner: `packages/engine/src/agent-api/` kit helpers, `packages/aura3d-cli/src/pull-bridge/procedural.ts`).** For roles that allow it, emit a `prefabs.*` or `primitives.*` snippet (and a `// replace with assets.<key>` marker) so a scene runs now and the typed asset can replace it later.

**WP-7 Docs and site copy (owner: `docs/agents/asset-workflow.md`, `docs/api/assets.md`, skills `aura3d-assets`, `meshy-cli`).** Document the ladder, the command, the honest catalog facts and the attribution rules; the site copy comes from `docs/audit/asset-catalog-claim.md`.

**WP-8 Verification harness (owner: `tools/asset-eval/`).** The 20-prompt script, the top-hit downloader and the screening aggregation used in the audit, as a repeatable tool with a stored report under `evidence/asset-resolution/`.

## 6. Verification checklist

- [ ] `curl https://aura3d-asset-index-cron.newsroom.workers.dev/health` returns 200; the published CLI search no longer warns.
- [ ] `/search` returns `triangles`, `sizeBytes`, `hasAnimations`, `format`, licence flags; filters work; Sketchfab rows are marked `token-required`.
- [ ] 20-prompt relevance: at least 18 of 20 clearly relevant first hits (today 13 with open sources only, 20 of 20 by title on the index), and at least 14 of 20 prompts with a web-ready hit in the top 2 (today 11).
- [ ] No NC, ND or unverified licence in any default result; SA only with the opt-in flag; CC-BY admission always creates an attribution record and `check-deploy` fails without it.
- [ ] `aura3d assets resolve "sword" --name sword --role prop --dry-run` prints a plan with rung, source, cost and licence and exits 0 without spending.
- [ ] A need with no candidate (for example a stylised original creature) reaches the Meshy plan, shows credits against the budget, exits 2 without `--yes`, and with `--yes` generates, optimises, admits and records the ledger entry.
- [ ] A ground, ring or beam need resolves to a procedural snippet.
- [ ] `assets validate --require-license --no-placeholders` and `check-deploy` pass on a project built only from resolve output.
- [ ] Unit tests for each WP; `public-example-boundary` still green; no credentials in logs.
