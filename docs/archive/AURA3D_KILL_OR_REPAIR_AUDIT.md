# Aura3D Kill-Or-Repair Architecture Audit

## Executive Verdict

Do not kill Aura3D outright. Kill the current claim that Aura3D can generate public-quality racing and platformer examples from arbitrary typed GLBs. The renderer, typed asset pipeline, deploy validation, route-primary probes, and gameplay-state gates are real enough to support product, inspection, architecture, city-control, and diagnostic demos when the claims are bounded. The broken layer is the game-category generation stack: asset ranking, game-geometry certification, scene compiler, route template, camera, and visual-quality evidence for racing/platformer categories.

Turbo Drift and Skyline Runner should not be treated as public examples in their current form. They prove that typed assets render and route-local state changes. They do not prove that Aura3D can generate a credible game.

## One Paragraph Truth

Aura3D is not fundamentally broken as a browser 3D SDK and asset pipeline, but it is not yet a production game-example generator. The retained evidence shows typed GLBs render, deploy metadata validates, and route-local gameplay helpers can change state. The same evidence also shows Turbo and Skyline still fail public game quality because the visible game geometry is not a convincing authored race or platformer. The current system can accept manifest-authored, overlay-validated topology and surface maps, but it still cannot reliably extract, score, select, compose, and present game-ready geometry from assets at a product-quality bar. Arbitrary GLBs cannot become real games automatically without curated game metadata, category-specific templates, and stricter visual/gameplay review.

## What The Screenshots Prove

The screenshots prove that the renderer can draw the selected GLBs. They do not prove public-quality game generation.

Turbo Drift retained screenshot:

- Evidence file: `tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png`
- Route-primary JSON says `pass: true`, no route-primary failures, mounted evidence present, renderer diagnostics present, and primary assets `showcaseTexturedSportsCar` plus `showcaseTsukubaCircuit` are present.
- The image still reads as a proof board: a tiny race circuit on a large dark field, tiny cars, stray terrain/arc geometry, weak car-to-track presentation, and no production racing camera language.
- The gameplay report says racing input, checkpoint/lap progression, reset, route alignment, and authored lap seconds pass, but `visualReviewPass` is `false`.

Skyline Runner retained screenshot:

- Evidence file: `tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png`
- Route-primary JSON says `pass: false` with `primary-foreground-clipped`.
- Mounted evidence is present, the typed runner and world assets are present, and gameplay proof passes movement/jump/checkpoint/hazard/finish state checks.
- The image still reads as a proof harness: character/world pairing is not public-quality, camera/framing is weak, visible play space feels mismatched, and the character-to-surface relationship is not visually convincing.
- The gameplay report says platformer mechanics pass but `visualReviewPass` is `false`.

The important finding is that technical gates and product-quality gates have diverged. That divergence is correct. It means Aura3D can now tell the truth, but it still cannot generate good public games.

## Turbo Root Cause

Turbo is not blocked by raw rendering, deploy metadata, or keyboard input. Its retained route-primary evidence passes and its gameplay proof passes. The current blocker is category/product quality:

- Compile report status: `prototype-blocked`.
- Compile report blockers:
  - `evidence:gameplay-proof:racing:visual-review-missing`
  - `evidence:gameplay-proof:racing:visual-review-verdict-not-pass:fail`
  - `evidence:racing-asset-pair:verdict-not-pass:fail`
  - `evidence:racing-asset-pair:blocker:asset-pair:car-route-not-visibly-bound-to-road-surface`
  - `evidence:racing-asset-pair:blocker:asset-pair:track-camera-composition-reads-as-proof-harness`
- Current topology evidence passes structurally, but its topology source is `manifest-authored-overlay-validated`, not mesh-derived extraction.
- `tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json` reports `asset-bound-road-topology-proven`, route length `8.742`, authored lap seconds `36`, 17 points, and 6 checkpoints.

That means the repository now has a retained, hash-bound topology object. It does not mean the racing template is product-quality. The visual failure is coming from the scene compiler and racing template: camera, asset pairing, scale, track presentation, route/road art direction, and gameplay framing still look like a generated proof harness.

## Skyline Root Cause

Skyline is not blocked by raw rendering, deploy metadata, or simple input/state proof. Its gameplay proof passes. It is blocked by route-primary clipping and public platformer quality:

- Compile report status: `prototype-blocked`.
- Compile report blockers:
  - `evidence:route-primary-probe:not-passing`
  - `evidence:gameplay-proof:platformer:visual-review-missing`
  - `evidence:gameplay-proof:platformer:visual-review-verdict-not-pass:fail`
  - `evidence:platformer-asset-pair:verdict-not-pass:fail`
  - `evidence:platformer-asset-pair:blocker:asset-pair:character-foot-contact-not-visibly-bound-to-platform-surface`
  - `evidence:platformer-asset-pair:blocker:asset-pair:character-world-scale-and-art-direction-not-public-quality`
- Current playable-surface evidence passes structurally, but its surface source is `manifest-authored-overlay-validated`, not mesh-derived extraction.
- `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json` reports `asset-bound-playable-surfaces-proven`, `levelLength: 37.2`, `estimatedCompletionSeconds: 36`, `characterScaleRatio: 0.42`, and confidence `0.72`.

That means the repo can carry a hash-bound surface map. It does not mean it can generate a coherent public platformer. The visual failure is the scene compiler and category template: character/world pairing, scale, camera, collision-to-visual binding, level flow, and art direction are not good enough.

## Root Architecture Gaps

### Renderer

The renderer can draw typed GLBs through the root `createAuraApp` path. Turbo and Skyline both render assets and produce screenshots. This is not primarily a renderer failure.

The renderer is still claim-limited. The project rules correctly forbid claims of production renderer parity, HDR, IBL, postprocess, full PBR, WebGPU, skinned animation, and production game kits unless root-only browser evidence proves those exact claims. Turbo and Skyline do not need advanced renderer claims to be fixed; they need game-template and asset-geometry fixes.

### Asset ingestion

The asset pipeline is good at provenance, hashes, typed IDs, release probes, orientation, bounds, deploy checks, and durable metadata. It is weak at semantic game geometry.

For games, a valid GLB is not enough. A racing asset needs road topology, road width, start pose, checkpoints, camera suitability, and car/track scale compatibility. A platformer world needs playable surfaces, contact points, hazards, checkpoints, finish areas, camera bounds, and character/world scale. The current pipeline can carry topology/surface metadata once authored, but it does not reliably derive those semantics from the mesh.

### Asset resolver/ranking

The resolver/ranking path currently scores role, quality, provenance, release probes, and keyword-like game tokens. In `packages/create-aura3d/src/showcase-spec-replacement-candidates.ts`, `gameAssetBonus` and `gameAssetPenalties` reward terms like `car`, `track`, `platform`, `side`, `scroller`, `level`, and `world`. That helps find plausible assets. It does not prove playable topology, collision geometry, style compatibility, camera suitability, or visual composition.

So yes: the CLI/resolver can pick the wrong asset for a game even if the asset is deploy-valid.

### Game runtime

The game runtime is closer to proof-state helpers than a production game engine. `packages/engine/src/agent-api/GameGenreKits.ts` defines `GameRacingRoute` as points, width, and checkpoints, and `GamePlatformerPlayableSurfaceMap` as authored surfaces. `createGameRacingKit` consumes route points and produces speed, heading, off-track state, checkpoints, laps, reset, and camera state. That is useful. It is not a complete game engine.

The runtime lacks production-level mesh-derived collision, physics integration, robust camera systems, level streaming, authored challenge pacing, enemy/AI behavior, animation blending proof, and category-grade presentation.

### Scene compiler

The scene compiler is the largest broken layer for Turbo and Skyline. It can generate route artifacts, reports, topology/surface evidence, route source, and status. It can also auto-fill generated game-template evidence through `packages/create-aura3d/src/showcase-spec-game-template-evidence.ts`.

But the compiler still accepts and propagates category templates that pass structural checks while producing screenshots that look like proof harnesses. It does not yet design a compelling race or platformer scene. It does not have a strong enough "public game scene" model for camera, subject scale, asset pairing, challenge pacing, and visual presentation.

### Evidence gates

The evidence gates have improved. They now correctly keep Turbo and Skyline from public visual approval. `packages/create-aura3d/src/showcase-spec-gameplay-evidence.ts` requires visual review evidence for racing and platformer proofs, and `docs/project/showcase-visual-review.json` currently fails both routes.

The remaining gap is that several proof values are still document/metadata assertions rather than independent visual/gameplay quality analysis. For example, visual review is JSON-backed and screenshot-linked, but not an automated semantic image-quality judge. The gates can say "this route is not public quality"; they cannot yet make the route good.

## Renderer Verdict

Renderer verdict: keep it, but do not overclaim it.

The renderer can produce good scenes when the asset, camera, and presentation are right. The accepted product/configurator, material-inspector, smart-city, architecture, and digital-twin style routes show that the basic root rendering path is not the blocker. Turbo and Skyline fail because the game generation layer is poor, not because WebGL cannot render cars or characters.

Renderer limitations still matter for marketing claims. Aura3D should not claim HDR, IBL, WebGPU, full PBR parity, postprocess, animation parity, or production renderer quality unless root browser evidence proves those claims.

## Asset Pipeline Verdict

Asset pipeline verdict: functional for deployable 3D assets, incomplete for game-ready assets.

The pipeline validates typed assets well enough to prevent many fake-green states. It tracks hashes, probes, provenance, release quality, orientation, and deploy validation. It does not yet certify "this asset is suitable for a racing game" or "this world has playable platformer surfaces" in a way that replaces manual art direction.

For games, asset ingestion must add a certification tier:

- racing track topology;
- platformer playable surfaces;
- scale and camera compatibility;
- character/world or car/track style compatibility;
- retained overlay evidence;
- pass/fail reason that blocks public examples before route code is generated.

## Resolver / Asset Ranking Verdict

Resolver/ranking verdict: useful catalog filter, not category intelligence.

The current resolver can find plausible assets and reject candidates with missing provenance/probe/role quality. It cannot reliably select game assets because it does not score geometry semantics. For Turbo and Skyline, the assets are not simply "bad GLBs." They are insufficiently certified and insufficiently composed.

Exact missing scoring dimensions:

- road/path topology for racing;
- road width and closed-loop suitability;
- car-to-track scale compatibility;
- camera readability of track and vehicle;
- platformer surface count and contact quality;
- character-to-world scale and style compatibility;
- level length and authored flow;
- screenshot-level composition quality.

## Game Runtime Verdict

Game runtime verdict: proof-capable, not production-game capable.

The runtime can prove input changes, reset, checkpoints, laps, movement, jump, hazards, and finish progression. That is valuable for deterministic examples and route tests. It is not enough to support a public claim that Aura3D generates real racing/platformer games.

The game runtime still needs:

- proper genre templates with category-specific camera and pacing;
- collision/contact systems tied to visible geometry;
- track and surface extraction or curated authoring;
- game-state-to-scene binding that remains visually convincing;
- longer meaningful loops and challenge progression;
- production examples that are authored like games, not tests.

## Scene Compiler Verdict

Scene compiler verdict: rewrite the game category compiler before keeping game examples public.

The compiler currently proves "route generated from spec" and "evidence exists." It does not prove "this generated game is good." The screenshots demonstrate that a route can have typed assets, deploy validation, hash-bound topology/surfaces, and gameplay proof while still looking unacceptable.

Exact code that needs rewrite or major extension if Aura3D continues game examples:

- `packages/create-aura3d/src/showcase-spec-compiler.ts`
- `packages/create-aura3d/src/showcase-spec-game-template-evidence.ts`
- `packages/create-aura3d/src/showcase-spec-racing-artifacts.ts`
- `packages/create-aura3d/src/showcase-spec-platformer-artifacts.ts`
- `packages/create-aura3d/src/showcase-spec-replacement-candidates.ts`
- `packages/engine/src/agent-api/GameGenreKits.ts`
- `packages/engine/src/agent-api/GameSceneGeometryBindings.ts`
- `packages/asset-index/src/*`
- `packages/aura3d-cli/src/*`
- `tests/browser/showcase-gameplay-proof.spec.ts`
- `tools/showcase-library/build-and-check.mjs`
- `tests/fixtures/showcase-spec/turbo-drift-circuit.json`
- `tests/fixtures/showcase-spec/skyline-runner.json`

The route files should be generated outputs of that work, not the main place where quality is patched.

## Evidence Gate Verdict

Evidence gate verdict: the gates now catch false public game quality, but they do not yet enforce enough before generation.

Commands run for this audit:

- `pnpm exec vitest run tests/unit/create-aura3d/showcase-racing-spec.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-spec-compiler.test.ts --reporter=dot` passed: 4 files, 20 tests.
- `pnpm exec vitest run tests/unit/game-runtime/game-runtime-source-gates.test.ts --reporter=dot` passed: 1 file, 22 tests.
- `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot` passed: 1 file, 13 tests.
- `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line` passed: 1 test.
- `pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line` passed: 3 tests.
- `pnpm typecheck:raw` passed.
- `node tools/showcase-library/build-and-check.mjs || true` reported: `Showcase public release evidence passed for 6/6 release candidates; 2 internal diagnostics retained; 1 index route handled separately.`

That build/check result is honest only because Turbo and Skyline are not counted as public release candidates. It should not be read as evidence that Aura3D has public-quality racing/platformer examples.

## Public Example Verdict

Public example verdict: keep non-game examples that pass visual review; freeze Turbo and Skyline as prototypes until rebuilt.

Current game-specific status:

| Route | Technical gates | Visual review | Public example verdict |
| --- | --- | --- | --- |
| `showcase-turbo-drift-circuit` | Route-primary pass, deploy/release pass, gameplay pass | Fail | Not a public racing example |
| `showcase-skyline-runner` | Deploy/release pass, gameplay pass, route-primary fail | Fail | Not a public platformer example |

Should Aura3D keep racing/platformer examples? Yes, only if they are rebuilt as curated game-template outputs with certified geometry and visual-quality evidence. No, if the plan is to keep iterating route-local camera, scale, speed, and HUD tweaks.

## Salvage Plan If We Continue

### Phase 1

Stop the false loop.

- Keep Turbo and Skyline out of public examples.
- Stop route-local cosmetic patches as the main workstream.
- Stop treating route-primary pass, deploy pass, or input proof as public game quality.
- Lock visual review failures as release blockers for game examples.
- Rename current game routes as prototypes unless and until category rebuilds pass.

### Phase 2

Build game asset certification.

- Add mesh-derived or curated, hash-bound racing topology certification for track assets.
- Add mesh-derived or curated, hash-bound playable-surface certification for platformer worlds.
- Add asset-pair scoring for car/track and character/world scale, style, camera, topology, and composition.
- Store retained overlay evidence that proves game geometry aligns with visible asset geometry.
- Reject "valid GLB" assets that cannot support the category.

### Phase 3

Rewrite the category templates.

- Racing template: track topology to scene transform, road-following race route, chase/top-down camera chosen by evidence, car scale validation, 30+ second meaningful lap, checkpoint/final state, reset/retry, readable vehicle and track.
- Platformer template: playable-surface map to scene transform, grounded character contact, authored 30+ second level, checkpoint/hazard/finish loop, camera follow, style-compatible world/character pair, no primitive-primary world.
- Make route source generated from these templates, not hand-patched.

### Phase 4

Upgrade public-quality evidence.

- Keep route-primary, deploy, and gameplay proof.
- Add game-specific visual QA that checks car-to-road visibility, character-to-platform contact, camera readability, scale, and category composition.
- Require retained before/after screenshots and overlay evidence.
- Require human visual review for first release of a new game category.
- Only then mark a racing or platformer example public.

## Kill Criteria

Kill the public game-example effort if any of these remain true:

- Aura3D cannot certify game geometry from assets or curated hash-bound metadata.
- The resolver cannot reject assets that lack road topology or playable surfaces.
- The compiler continues to generate route-local points/rectangles that are not visibly bound to assets.
- The runtime remains proof-state helpers without category-grade camera, collision/contact, progression, and level pacing.
- Visual review remains manual JSON without real screenshot scrutiny.
- The team keeps spending cycles on route camera/HUD/scale tweaks instead of rewriting the category compiler.

Kill this claim immediately: "Aura3D can turn arbitrary GLBs into polished racing/platformer games." Current evidence disproves it.

## Keep Criteria

Keep Aura3D if the product claim is bounded:

- Aura3D as a TypeScript/browser 3D SDK with typed assets: keep.
- Aura3D as a CLI asset pipeline with provenance/deploy checks: keep.
- Aura3D as a showcase generator for product, inspection, architecture, city, and bounded ops demos: keep, subject to visual review.
- Aura3D as a future game-template generator: keep only as roadmap/prototype until the category compiler is rewritten.

Keep racing/platformer examples only when all are true:

- Certified topology/surfaces exist and are bound to asset hashes.
- Asset pairs are scored for category fit.
- Generated route code uses the certified geometry.
- Gameplay proof validates state and visible geometry alignment.
- Current screenshots pass visual review as public-quality games.

## Final Recommendation

Do not kill the whole library. Kill the current public game claim and stop cosmetic route iteration.

The direct answers are:

1. Aura3D is not fundamentally broken; the game-example generation layer is broken.
2. The renderer can produce good scenes; Turbo/Skyline failures are not primarily renderer limitations.
3. Asset ingestion works for deployable GLBs, but it does not yet extract enough semantic geometry for games.
4. The CLI/resolver can pick wrong game assets because it lacks category intelligence beyond role/provenance/probe/token scoring.
5. Turbo and Skyline are using a mix of insufficient game asset certification, weak category templates, and poor scene composition. It is both asset-pairing and template quality.
6. The game runtime is proof-state helpers plus useful genre primitives, not a production game engine.
7. Arbitrary GLBs cannot become games automatically. Curated, hash-bound topology/surface/collision/camera metadata is required.
8. Aura3D should keep racing/platformer examples only as prototypes until the category compiler is rebuilt.
9. The exact code to rewrite is the asset ranking, CLI/asset certification, spec compiler, game-template evidence/artifact generation, genre runtime bindings, gameplay proof, and release gates listed under `## Scene Compiler Verdict`.
10. Stop immediately: route-local cosmetic patches to Turbo/Skyline, fake visual-review passes, treating technical probes as product quality, random asset swaps, primitive proof loops, and public claims that Aura3D already has production-quality racing/platformer generation.

The robust repair path is not "fix Turbo" or "fix Skyline." It is: build game asset certification, then rebuild the racing and platformer category compilers, then regenerate Turbo and Skyline from those compilers, then pass visual review with current retained screenshots.
