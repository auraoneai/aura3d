# Site claims audit (SR-3), 2026-10-25

Scope: `marketing/index.html`, `marketing/docs/*.html`, `marketing/public/llms*.txt`, `llms*.txt`, `README.md`, `docs/api/*`. Verdicts: `keep` (verified), `fixed` (changed in this pass), `removed` (taken out pending evidence), `owner: <lane>` (another lane edits that file; the finding stays here so it is not lost).

Counts below are reproduced by `marketing/scripts/check-site.mjs`, which now fails if the homepage packages stat disagrees with its count, if the template count is hand-typed (it is a `{{TEMPLATE_COUNT}}` build-time token, like `{{PACKAGE_COUNT}}` and `{{GAME_COUNT}}`), or if a retracted catalog claim returns (800K/850K, 652 as a catalog, or a hosted-index promise).

## Counted facts

| Fact | Value | Source |
|---|---|---|
| Public npm packages | 24 | 23 non-private `packages/*/package.json` plus the root `@aura3d/engine` |
| Repo root manifest `aura.assets.json` | 652 entries (429 models, 223 audio): our own demos, games and ports; not a shipped catalog or a product feature, so it is not shown on the site | `aura.assets.json`, `docs/audit/asset-catalog-claim.md` |
| Create templates | 20 | `packages/create-aura3d/templates` |
| Agent skills | 14 | `tools/agent-skills/check.ts` skills list |
| Declared license | `MIT` in all 24 package.json files | package.json `license` |
| `LICENSE` file in the repo | none; GitHub reports `license: null` on a public repo | `gh repo view` |
| Third-party runtime dependencies | engine 6; assets 3; physics-rapier 4; navigation-recast 1; cli 2 | package.json `dependencies` |
| Hosted asset index | database holds 855,001 records (row count only) but the Worker is gone from the account (`wrangler`: code 10007) and the endpoint returns 404 / error 1042: unreachable today | `docs/audit/asset-catalog-claim.md` |

## Claims

| Claim | Where | Verdict | Note |
|---|---|---|---|
| "24 npm packages" | homepage stat, kicker, `docs/api.html` | keep | counted, now checked |
| "800K+ catalog assets", "800,000+ catalog models", "~850K catalog", "hosted federated index of 800,000+" | homepage stat, `docs/api.html`, `docs/api/assets.md`, `docs/api/game-runtime.md`, `llms-full.txt` x3, CLI index label, two template comments | removed (verified by `docs/audit/asset-catalog-claim.md`) | The number is a real row count (855,001) of a licence-tagged search index over public sources, not a curated catalog, and nobody can reach it today. The homepage stat is replaced by a verified capability line (hash, source and licence recorded per asset); the docs say the CLI searches licence-tagged open public sources and a starter pack. The hosted index is not promised until it is redeployed and its filters ship |
| "652 manifest entries searchable through the CLI" (matrix row 31), "652 admitted assets in the repo manifest" (homepage stat, earlier in this pass) | matrix, homepage | owner: site-diff (matrix); removed (homepage) | 652 is our own demo manifest, not a catalog or a feature. `check-site.mjs` now fails if 652 appears next to "catalog" or "assets" in public copy |
| "4 playable games", "Fifteen games", "See all 15 games", "15 studio-grade playable games" | homepage, `apps/showcase-index` | owner: site-games | count comes from the game inventory |
| "MIT licensed only", "MIT licensed", "MIT licensed · no runtime fees" | homepage stat and footers (14 pages) | fixed | now "MIT (declared in package.json)". There is no `LICENSE` file and GitHub shows no license: the owner must add one before "open-source" or "MIT licensed" can be stated without that qualifier |
| "open-source", "MIT open-source TypeScript 3D engine" | comparison page title and meta | owner: site-diff | pending the `LICENSE` decision |
| "zero-dependency" | `docs/index.html` (2 places), comparison page | fixed in `docs/index.html`; owner: site-diff for the comparison page | false: the engine package has 6 runtime dependencies (glTF-Transform, loaders.gl, ktx-parse, meshoptimizer) and rapier, draco, recast are third-party |
| "unified WebGPU compute + WebGL2 runtime" | `docs/index.html` hero, comparison page | fixed in `docs/index.html`; owner: site-diff | WebGL2 is the default; WebGPU is not the default backend |
| "replaces ~120 lines of manual Three.js", "18 lines vs ~120" | `docs/index.html`, homepage comparison, comparison page | fixed in `docs/index.html`; owner: site-diff | the benchmark's three.js cube scene is 15 lines (Aura3D 18); the PBR viewer is 49 vs 24. Honest statement used: less scene code in four of five benchmark scenes, more files and more bytes |
| "Stop wiring 14 fragile npm packages" | comparison page | owner: site-diff | no source for 14 |
| "Ship a real 3D app in 18 lines" | homepage hero | fixed | "Ship a typed 3D scene in 18 lines": 18 lines is the benchmark cube scene |
| "The practical default for agent-written browser 3D" | homepage lede | fixed | superlative removed; check-deploy named as the check |
| "Every route is checked for load, assets, console errors"; "zero console errors on the routes you ship"; "each route boots with no failed requests"; "every asset path has a hash" | homepage | fixed | reworded to what `check-deploy` reports or checks |
| "Start with 18 lines. Ship a real 3D app." | homepage CTA | fixed | |
| Aura Slam: "Championship tennis with a full World Tour", "32-player World Tour" | homepage game card | fixed | false for the native game: tournament and online are "Coming soon" (`examples/aura-slam/ui/menuMachine.ts`). Now names Quick Match and Smash Lab and says tournament and online are not in this version |
| Apex Overdrive: "11 typed vehicle GLBs ... barrel rolls, dogfights" | homepage game card | fixed | 10 vehicle GLBs in `apps/showcase-roadster-rush/src/assets/meshy`; dogfights and barrel rolls not verified |
| Thermal Drift: "7 playable drones with twin cannons and three thermal circuits" | homepage game card | fixed | 7 drones and 3 circuits verified in code; "twin cannons" not found (laser cannons and homing missiles are) |
| Grid Dispatch: "Drive San Francisco as a robotaxi or a supercar" | homepage game card | fixed | vehicles were replaced by original generic models; city name not verified |
| "Six stadiums", "2-bone IK athletes" (Aura Slam) | homepage game card | keep | six venues in the G3 render check |
| "Studio-grade playable 3D browser games" | `apps/showcase-index` | owner: site-games | superlative without a rubric |
| Game page and card claims for the renamed games | per-game pages | owner: site-games | counts, names and card text come from the inventory |
| "24-package skill set" | matrix row 38 and docs | owner: site-diff | there are 14 skills |
| Comparison table: "Physical PBR, procedural sky, IBL, AgX/ACES built in" | homepage | owner: site-diff | needs per-row evidence |
| "Comparison locked to Three.js 0.185.1", "Fifteen outcomes", "Frozen r185 workload set" | comparison page | owner: site-diff | the measured set is five scenes plus a cube baseline (RESULTS.md) |
| Version stamps "4.1.3" | many pages | keep until the 4.2.0 bump | `check-version.mjs` enforces; the release agent replaces them |
| "Four templates cover product pages, cinematic scenes, mini-games, and agent setup" | homepage templates section | fixed | `packages/create-aura3d/templates` has 20 template folders. Now the `{{TEMPLATE_COUNT}}` build-time token (marketing/vite.config.ts); `check-site.mjs` fails on a hand-typed template count |
| "... with 50 apps, games, and focused examples" | homepage what-is-new block | removed | no counted source for 50 (the `apps/` folder mixes games, tools and retired apps). Replaced by "{{PACKAGE_COUNT}} coordinated packages ... and {{GAME_COUNT}} playable games", both counted at build time; `check-site.mjs` fails on a hand-typed "N apps" or "N examples" |
| Social cards (`og-1200x630.png`, `twitter-1200x630.png`): "v4.0.1 · 4 playable games", "Ship a real 3D app", "MIT licensed · zero dependencies · WebGL2 + WebGPU", legacy Aura Slam frame with a "Modes & Tour" bar | `store-assets/brand/social/` | fixed | generator (`marketing/scripts/generate-og.mjs`) no longer prints the version, says "typed 3D scene", lists verifiable features (typed assets, check-deploy gate, WebGL2 runtime), reads the game count from the inventory, and uses the native Aura Slam frame. Re-rendered on the remote runner (`tests/browser/sro-og.spec.ts`, `tools/shots/decode-png.mjs`) |
| `tools/marketing-truth` required "agent-written browser 3D", "50 apps, games, and focused examples" and a hand-typed package count | `tools/marketing-truth/index.ts` | fixed | the hero keeps "agent-written browser 3D" (truthful); the check now expects the `{{GAME_COUNT}}` and `{{PACKAGE_COUNT}}` tokens |

## Follow-ups for the owner

1. Add a `LICENSE` file (the repo is public with none; every package declares MIT). Until then the copy says "declared in package.json".
2. The hosted asset index is offline (Worker missing from the account). Redeploying `workers/asset-index-cron` exposes a public endpoint, so it needs the owner. Do not advertise hosted search until it works and the three index defects in `docs/audit/asset-catalog-claim.md` are fixed.
