# Site claims audit (SR-3), 2026-10-25

Scope: `marketing/index.html`, `marketing/docs/*.html`, `marketing/public/llms*.txt`, `llms*.txt`, `README.md`, `docs/api/*`. Verdicts: `keep` (verified), `fixed` (changed in this pass), `removed` (taken out pending evidence), `owner: <lane>` (another lane edits that file; the finding stays here so it is not lost).

Counts below are reproduced by `marketing/scripts/check-site.mjs`, which now fails if the homepage packages or admitted-assets stat disagrees with its counted source, or if the retracted catalog-size figure reappears.

## Counted facts

| Fact | Value | Source |
|---|---|---|
| Public npm packages | 24 | 23 non-private `packages/*/package.json` plus the root `@aura3d/engine` |
| Admitted assets in the repo manifest | 652 (429 models, 223 audio) | `aura.assets.json` `assets[]` |
| Create templates | 20 | `packages/create-aura3d/templates` |
| Agent skills | 14 | `tools/agent-skills/check.ts` skills list |
| Declared license | `MIT` in all 24 package.json files | package.json `license` |
| `LICENSE` file in the repo | none; GitHub reports `license: null` on a public repo | `gh repo view` |
| Third-party runtime dependencies | engine 6; assets 3; physics-rapier 4; navigation-recast 1; cli 2 | package.json `dependencies` |
| Hosted asset index | search endpoint answered `error code: 1042` on 2026-10-25 | `curl` of the worker `/search` URL |

## Claims

| Claim | Where | Verdict | Note |
|---|---|---|---|
| "24 npm packages" | homepage stat, kicker, `docs/api.html` | keep | counted, now checked |
| "800K+ catalog assets", "800,000+ catalog models", "~850K catalog", "hosted federated index of 800,000+" | homepage stat, `docs/api.html`, `docs/api/assets.md`, `docs/api/game-runtime.md`, `llms-full.txt` x3, CLI index label, two template comments | removed pending audit | No counted source. The only 800k figure in the repo is a comment in `tools/asset-index-refresh/objaverse-load.mjs`. Replaced by the counted 652 admitted assets (labelled as the repo manifest) and neutral wording about a hosted index that is "searched when reachable". `docs/audit/asset-catalog-claim.md` (asset-catalog-audit) may verify a number later; if so, use it with its caveats |
| "652 manifest entries searchable through the CLI" (matrix row 31) | `docs/workflows/aura3d-vs-threejs-matrix.md` | owner: site-diff | 652 is the repo's own admitted-asset manifest, not a searchable catalog |
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

## Follow-ups for the owner

1. Add a `LICENSE` file (the repo is public with none; every package declares MIT). Until then the copy says "declared in package.json".
2. The hosted asset index search did not answer on 2026-10-25 (`error code: 1042`). Do not advertise search until it works and its size is counted.
