# FixUpNew PRD — Aura3D Game Layer Repair

Status: **Completed**
Completed: 2026-07-20
Release: Aura3D 1.4.4

> **Completion record:** All workstreams and acceptance requirements in this PRD are complete for the named certified asset pairs. The authoritative final evidence is `docs/project/showcase-launch-evidence.json`: 10/10 public release candidates pass, two Labs diagnostics and two game-layer diagnostic harnesses remain non-public, and zero routes are prototype-blocked. Turbo Drift Circuit and Skyline Runner are bounded release-ready presentations. The compiler emits immutable game-geometry contracts; route evidence is hash-bound; automated six-check visual QA and downward-only manual review are enforced.
>
> Sections below preserve the implementation journal and its dated 8/8, blocked, and resume checkpoints as historical evidence. Their instructions and intermediate classifications are superseded by this completion record, `docs/project/aura3d-144-release-notes.md`, and the current launch-evidence/route-gate files. They must not be read as current release status.


Date: 2026-07-18
Scope: The remaining Aura3D library work required so racing and platformer game
examples are generated from certified game geometry, validated by
evidence-backed composition gates, and rebuilt through the spec compiler — not
hand-authored route overlays.
Supersedes: nothing. This PRD continues `Fixed-Needed-PRD.md`,
`finalfixesatlibrarylevel.md`, `AURA3D_KILL_OR_REPAIR_AUDIT.md`,
`aura3d-game-examples-stop-decision.md`, and
`docs/project/aura3d-game-layer-rebuild-plan.md`.
Source: full codebase review plus re-run of the current gates on 2026-07-18.

## 1. Decision Summary

The Aura3D library is not broken at the renderer, asset-pipeline, or evidence
gate level. The July game-presentation work created a real root-safe game
geometry layer (`game.assetBoundRacingRoute`, `game.assetBoundPlatformerLevel`,
`game.racingSceneBinding`, `game.platformerSceneBinding`,
`game.racingPresentationTrack` `game-circuit` mode,
`game.platformerPresentationSurfaces` `game-level` mode,
`game.certifyRacingGeometry`, `game.certifyPlatformerGeometry`,
`game.publicRacingPresentation`, `game.publicPlatformerPresentation`) and the
public showcase gate passes 8/8 release candidates.

What remains broken or incomplete is the game-category layer itself:

1. Platformer mesh extraction still fails for the active world asset.
2. The asset catalog has no release-certified replacement game assets, so the
   resolver reports `replacement:*:no-suitable-candidate`.
3. Asset-pair composition verdicts (car-to-road, character-to-platform) are
   retained manual fail/pass JSON, not an evidence-backed validator.
4. Turbo Drift Circuit and Skyline Runner are still `prototype-blocked`.
5. The two public game presentation routes hand-author geometry and screenshot
   hashes in route source instead of consuming compiler-emitted contracts.
6. Game visual review is still manual JSON with no automated fail path.

This PRD is the file-level plan to close those six gaps. It does not kill,
sunset, or replace Aura3D. It does not relax any existing gate. Every completed
task requires the proof format defined in §13.

## 2. Verified Current Baseline (2026-07-18)

All commands below were run on the current checkout and pass:

| Gate | Command | Result |
| --- | --- | --- |
| Aggregate showcase gate | `node tools/showcase-library/build-and-check.mjs` | `Showcase public release evidence passed for 8/8 release candidates; 2 internal diagnostics retained; 2 game-layer diagnostics retained; 1 index route handled separately.` |
| Game-layer unit contracts | `pnpm exec vitest run tests/unit/game-runtime/public-game-geometry.test.ts tests/unit/tools/showcase-game-release-gates.test.ts tests/unit/tools/showcase-route-gates.test.ts --reporter=dot` | 3 files, 24 tests passed |
| Gameplay proofs | retained `tests/reports/showcase-gameplay/*.json` | pass for both public presentation routes, both game-layer diagnostics, and Turbo/Skyline |
| Turbo compile report | `tests/reports/showcase-spec-compiler/turbo-drift-circuit/showcase-spec-compile-report.json` | blocked: route-primary not passing, racing asset-pair fail, `replacement:showcaseTsukubaCircuit:no-suitable-candidate` |
| Skyline compile report | `tests/reports/showcase-spec-compiler/skyline-runner/showcase-spec-compile-report.json` | blocked: route-primary not passing, mesh extraction fail (`platformer-playable-surface-columns-ambiguous:showcaseSideScrollerWorld`), platformer asset-pair fail, `replacement:showcaseSideScrollerWorld:no-suitable-candidate` |
| Catalog state | `aura.assets.json` | only 4 game assets are release-graded with probes and `gameGeometry` certification (`showcaseTexturedSportsCar`, `showcaseTsukubaCircuit`, `showcaseWalkAnimatedGirl`, `showcaseSideScrollerWorld`); ~30 racing/platformer candidates are ungraded, unprobed, uncertified |

Current public game routes (bounded, keep them honest):

- `apps/showcase-public-racing-presentation-proof` — public V1 proof;
  visible circuit is generated from a hand-authored
  `compiler-authored-overlay-validated` centerline; Tsukuba GLB is retained as
  hash-bound topology provenance.
- `apps/showcase-public-platformer-presentation-proof` — public V1 proof;
  visible level is generated from a hand-authored surface map; SideScroller
  world GLB is retained as hash-bound surface provenance.

Neither route claims production game-kit parity, physics, or automatic
GLB-to-game conversion. Keep those claims forbidden until this PRD is done.

## 3. Remaining Gap Inventory

| ID | Gap | Root location | Workstream |
| --- | --- | --- | --- |
| G1 | Platformer mesh extraction rejects stacked decorative columns as ambiguous | `packages/create-aura3d/src/showcase-spec-game-geometry-extractor.ts` | A (P0) |
| G2 | No release-certified replacement racing/platformer assets in the catalog | `aura.assets.json`, `packages/aura3d-cli/`, probe specs | B (P1) |
| G3 | Asset-pair composition verdicts are manual JSON, not a validator | new `showcase-spec-asset-pair-composition.ts`, gates | C (P2) |
| G4 | Turbo/Skyline remain `prototype-blocked` | `apps/showcase-turbo-drift-circuit/`, `apps/showcase-skyline-runner/`, compiler | D (P3) |
| G5 | Public game routes hand-author geometry and screenshot hashes | `apps/showcase-public-*-presentation-proof/src/main.ts`, compiler artifacts | E (P4) |
| G6 | Game visual QA has no automated fail path | `tools/showcase-library/`, `docs/project/showcase-visual-review.json` | F (P5) |
| G7 | Runtime depth (pacing, collision/contact, camera, content length) stays proof-grade | `packages/engine/src/agent-api/GameGenreKits.ts` | G (P6, bounded) |

Dependency order: A → B → C → D, with E parallel to D after C, F after C, G
last and bounded. Do not start D before C lands; a Turbo/Skyline rebuild
without an evidence-backed composition validator would re-create the manual
pass/fail loop this PRD exists to end.

## 4. Workstream A (P0): Platformer Mesh Extraction Repair

Goal: `extractPlatformerPlayableSurfaceMapFromAsset(...)` must either certify
`showcaseSideScrollerWorld` with mesh-derived playable surfaces or keep failing
with a precise, single, actionable blocker — and must correctly certify at
least one replacement world from the catalog (Workstream B feeds candidates).
The bar is not lowered; discrimination is improved.

Root cause: `hasAmbiguousStackedSurfaceColumn(...)`
(`showcase-spec-game-geometry-extractor.ts:726-739`) buckets mesh-derived
surfaces into x-columns of `PLATFORMER_AMBIGUOUS_COLUMN_STEP = 0.5` and fails
the whole map when any column has ≥ `PLATFORMER_AMBIGUOUS_COLUMN_MIN_SURFACES
= 3` surfaces spanning ≥ `PLATFORMER_AMBIGUOUS_COLUMN_MIN_Y_RANGE = 1.5`. The
active world asset contains decorative stacked columns/pillars that trip this
heuristic, so a legitimately playable level is rejected wholesale. The current
constants live at lines 157–161; quality blockers are assembled in
`platformerMeshSurfaceQualityBlockers(...)` at lines 701–717.

### A1. `packages/create-aura3d/src/showcase-spec-game-geometry-extractor.ts`

~~- [x] Add z-depth coherence discrimination using mesh-bound `modelCenterZ` families before ambiguity analysis. Proof: `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` mixed-depth fixture + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~
~~- [x] Filter surfaces narrower than the certified character footprint derived from `characterScaleRatio` and manifest character bounds. Proof: wide-character regression in `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~
~~- [x] Retain only an x-ordered traversable chain within horizontal-gap and upward-step limits, recording excluded components. Proof: traversable and mixed fixtures in `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~
~~- [x] Use playable/decorative semantic names only as soft family-ranking signals that cannot override geometry. Proof: misleading `wall-decor-*` valid-chain regression in `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~
~~- [x] Replace the blanket ambiguous-column failure with per-column `asset-extraction:platformer-column-unresolved:<assetId>:<columnKey>` verdicts, failing only when the retained chain misses the count or length floor. Proof: same-depth stacked-column regression in `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~
~~- [x] Keep `PLATFORMER_MIN_MESH_PLAYABLE_SURFACES = 5` and `PLATFORMER_MIN_LEVEL_LENGTH = 12` unchanged. Proof: constants and floor assertions in `packages/create-aura3d/src/showcase-spec-game-geometry-extractor.ts` / `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm typecheck:raw`.~~
~~- [x] Preserve racing extraction behavior for `showcaseTsukubaCircuit`. Proof: Tsukuba regression in `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` and unchanged racing suites + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~

### A2. `packages/create-aura3d/src/showcase-spec-game-geometry-probe.ts` (new)

~~- [x] Create a non-writing library probe for arbitrary typed racing/platformer asset IDs that returns structured `GeometryExtractionResult` evidence. Proof: `packages/create-aura3d/src/showcase-spec-game-geometry-probe.ts` and `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~

### A3. Tests — `tests/unit/create-aura3d/`

~~- [x] Add stacked-column failure, traversable-chain pass, and mixed decorative-stack exclusion extractor fixtures. Proof: `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~
~~- [x] Replace the old blanket-ambiguity regression with a real `showcaseSideScrollerWorld` mesh-extraction pass regression. Proof: `tests/unit/create-aura3d/showcase-platformer-spec.test.ts`, `tests/unit/create-aura3d/showcase-game-geometry-probe.test.ts`, and `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json` + Skyline compiler command `pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/src/cli.ts tests/reports/showcase-spec-compiler/skyline-runner --spec tests/fixtures/showcase-spec/skyline-runner.json`.~~
~~- [x] Re-run racing, evidence, and compiler regressions unchanged. Proof: `tests/unit/create-aura3d/showcase-racing-spec.test.ts`, `showcase-spec-evidence.test.ts`, and `showcase-spec-compiler.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` (58/58).~~

### A4. Acceptance

~~- [x] `pnpm exec vitest run tests/unit/create-aura3d --reporter=dot` passes. Proof: 11 files and 58 tests passed on 2026-07-18.~~
~~- [x] `pnpm typecheck:raw` passes. Proof: `tsc -p tsconfig.build.json --noEmit` exited 0 on 2026-07-18.~~
~~- [x] Regenerate the Skyline surface report with passing mesh extraction and mesh-bound anchors. Proof: the current `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json` is hash-bound to `showcaseKenneyVerdantPlatformerWorld`, records `asset-mesh-extracted`, 19 retained gameplay surfaces (11 mesh platforms plus finish/hazard/checkpoints), and level length 14.94; generated by the Skyline compiler fixture.~~
~~- [x] The conditional honest-failure documentation path is not required because a real replacement asset passes after discrimination. Proof: the current Skyline surface report has no extraction blockers and the aggregate release gate passes 10/10.~~

## 5. Workstream B (P1): Game Asset Catalog Certification

Goal: the catalog contains at least two release-certified racing tracks, two
release-certified platformer worlds, and one additional release-certified
platformer character, each with mesh-extracted game geometry where the mesh
allows it, a passing retained release probe, durable provenance, and
`gameGeometry` certification metadata. The resolver must then have real
candidates so `replacement:*:no-suitable-candidate` blockers clear.

Candidate pool (all currently `quality: null`, no probe, no `gameGeometry`,
verified in `aura.assets.json` on 2026-07-18):

| Category | Candidates |
| --- | --- |
| Racing tracks | `showcaseKartCircuitTrack`, `showcaseMarbleTrack`, `showcaseRaceGameEnvironment`, `showcaseBeachRaceMap`, `showcaseDesertRaceMap`, `showcaseIsometricRaceTrack`, `showcaseDetailedRaceCircuit`, `showcaseModularTrackRoads`, `showcaseMiniRaceTrack`, `showcaseSlotCarTrack`, `showcaseCleanRaceTrack`, `showcaseBetterLowPolyTrack`, `showcaseSouthGardaTrack`, `showcaseSouthGardaTrack2`, `showcaseMotocrossTrack`, `showcaseRaceRoadTracks`, `showcaseRacingTrack` |
| Platformer worlds | `showcaseCartoonPlatformWorld`, `showcasePlatformerBasicPack`, `showcaseReadablePlatformLevel`, `showcaseSideScrollerPlatformLevel`, `showcaseVrPlatformLevel`, `showcaseRooftopParkourWorld`, `showcaseFloatingIslandWorld`, `showcaseStylizedMiniFloatingIsland`, `showcasePlatformerWorldLevel` |
| Platformer characters | `showcasePlatformHero`, `showcasePlatformRunnerHero` |

### B1. `packages/aura3d-cli/src/cli.ts` + `packages/aura3d-cli/src/index.ts`

~~- [x] Add `assets certify-game-geometry --asset <id> --category racing|platformer` which runs the Workstream A probe, prints the verdict, and writes hash-bound `gameGeometry` only on pass. Proof: `packages/aura3d-cli/src/cli.ts`, `packages/aura3d-cli/src/index.ts`, and `tests/unit/aura3d-cli/assets.test.ts` + `pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot` (14 files, 178 tests).~~
~~- [x] The command refuses failed extraction and returns the complete blocker list without writing certification. Proof: failing extraction and non-writing assertions in `tests/unit/aura3d-cli/assets.test.ts` + `pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot` (178/178).~~
~~- [x] Add read-only `--assets <csv>` batch screening with per-asset pass/fail rows. Proof: `packages/aura3d-cli/src/cli.ts`, `certifyGameGeometry(...)`, and batch non-writing assertions in `tests/unit/aura3d-cli/assets.test.ts` + `pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot` (178/178).~~

### B2. `tests/browser/showcase-release-asset-probes.spec.ts`

~~- [x] Extend retained release probes for certified candidates and write PNG/JSON evidence for each. Proof: `tests/browser/showcase-release-asset-probe-config.ts` currently configures 21 assets, including all four Kenney replacements; `_summary.json` records 21 assets / 42 PNG+JSON artifacts and the full producer passes.~~

### B3. Manifest + generated types (CLI-owned outputs)

~~- [x] Upgrade each certified asset through CLI-owned metadata with release quality, intended role, suitability, retained probe, durable provenance, and hash-bound certification. Proof: the catalog retains the original five certified additions plus the selected Kenney track, vehicle, world, and character; each current route asset is release quality, hash-bound, probed, role-typed, and has durable CC0 provenance.~~
~~- [x] Regenerate typed asset output through CLI typegen. Proof: corresponding generated records in `src/aura-assets.ts` and CLI typegen assertions in `tests/unit/aura3d-cli/assets.test.ts` + `pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot` (178/178).~~

### B4. Resolver integration — `packages/create-aura3d/src/showcase-spec-replacement-candidates.ts` and `showcase-spec-replacement-game-geometry.ts`

~~- [x] Verify replacement ranking surfaces certified assets and previously empty replacement cases select durable candidates. Proof: resolver regressions enforce all hard requirements; the selected current pairs are `showcaseKenneyRaceCarRed` + `showcaseKenneyNeonRaceCircuit` and `showcaseKenneyOobiPlatformerHero` + `showcaseKenneyVerdantPlatformerWorld`, with passing retained compiler reports.~~
~~- [x] Preserve release-quality, retained-probe, provenance, geometry, and category-ranking hard requirements. Proof: accepted/rejected candidate assertions in `tests/unit/create-aura3d/showcase-racing-spec.test.ts` and `showcase-platformer-spec.test.ts` + focused Vitest (19/19).~~

### B5. Acceptance

~~- [x] CLI and asset-index unit suites pass. Proof: `pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot` (14 files, 178 tests passed).~~
~~- [x] Retained release-asset probe producer passes for every configured certified asset. Proof: `tests/reports/showcase-release-asset-probes/` + `pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line` (1 passed).~~
~~- [x] Manifest diff contains five newly certified hash-bound game assets with probes and `gameGeometry`; generated types are current. Proof: `aura.assets.json` / `src/aura-assets.ts` HEAD comparison reports count 5 and `hashBound: true` for all five + isolated release validation (`ok: true`, zero failures/warnings).~~
~~- [x] Turbo/Skyline compilers no longer emit `replacement:*:no-suitable-candidate` and retain accepted replacements. Proof: `tests/reports/showcase-spec-compiler/{turbo-drift-circuit,skyline-runner}/showcase-spec-compile-report.json` + both `pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/src/cli.ts <report-dir> --spec <fixture>` commands.~~
~~- [x] Public showcase classification remains green after current route-primary regeneration. Proof: `docs/project/showcase-launch-evidence.json`, the full route-primary producer, and `node tools/showcase-library/build-and-check.mjs` pass 10/10 release candidates.~~

## 6. Workstream C (P2): Asset-Pair Composition Validator

Goal: replace manual asset-pair verdicts with an evidence-backed validator
that proves — per route, per release check — that the vehicle is visibly bound
to the road surface, the character is visibly bound to the platform surface,
the camera frames the certified play space, and certified scale contracts hold
in the current retained screenshot. A pass must be reproducible from files on
disk; a fail must name the precise composition dimension that failed.

Current fail verdicts this validator must be able to reach honestly:
`asset-pair:car-route-not-visibly-bound-to-road-surface`,
`asset-pair:track-camera-composition-reads-as-proof-harness`,
`asset-pair:character-foot-contact-not-visibly-bound-to-platform-surface`,
`asset-pair:character-world-scale-and-art-direction-not-public-quality`.

### C1. `packages/create-aura3d/src/showcase-spec-asset-pair-composition.ts` (new)

~~- [x] Input contract: certified geometry report (topology/surface map), route-primary screenshot PNG metrics/hash, manifest hashes, and the retained scene-binding transform. Proof: `packages/create-aura3d/src/showcase-spec-asset-pair-composition.ts` (`validateShowcaseAssetPairCompositionFromDisk`) + `tests/unit/create-aura3d/showcase-asset-pair-composition.test.ts` + `pnpm exec vitest run tests/unit/create-aura3d/showcase-asset-pair-composition.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-racing-spec.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/tools/showcase-game-release-gates.test.ts --reporter=dot` (5 files, 30 tests passed on 2026-07-18).~~
~~- [x] Check 1 — binding overlap: validate the runtime-projected certified play-space band against subject bounds, current geometry/scene hashes, anchor fit, overlay path, and zero presentation offset with documented tolerances. Proof: `showcase-spec-asset-pair-composition.ts` (`binding-overlap`, `minBindingOverlapRatio`, `maxAverageBindingError`) + synthetic pass/car-off-road/stale-hash tests in `tests/unit/create-aura3d/showcase-asset-pair-composition.test.ts` + focused 30/30 Vitest command above.~~
~~- [x] Check 2 — contact: verify platformer foot/surface contact or racing road alignment in game space and compare the projected contact point to the rendered subject base within documented tolerances. Proof: `showcase-spec-asset-pair-composition.ts` (`compositionContact`, `contact`, `maxNormalizedOffset`, `maxScreenContactDistanceRatio`) + floating-character and car-off-road tests + focused 30/30 Vitest command above.~~
~~- [x] Check 3 — camera readability: require the projected certified play-space area to remain within the documented foreground band, unclipped, with a following camera. Proof: `showcase-spec-asset-pair-composition.ts` (`camera-readability`, `minPlaySpaceAreaRatio`, `maxPlaySpaceAreaRatio`) + clipped-camera regression + focused 30/30 Vitest command above.~~
~~- [x] Check 4 — scale contract: validate rendered subject/world framing and platformer `characterScaleRatio` delta against documented bounds. Proof: `showcase-spec-asset-pair-composition.ts` (`scale-contract`, `minSubjectWorldRatio`, `maxSubjectWorldRatio`, `maxPlatformerScaleDelta`) + synthetic composition suite + retained public proof reports listed below.~~
~~- [x] Check 5 — debug-guide absence: reject retained gameplay evidence that does not prove debug gates/surface guides absent. Proof: `showcase-spec-asset-pair-composition.ts` (`debug-guide-absence`) + retained Turbo/Skyline fail reports and public proof pass reports + focused 30/30 Vitest command above.~~
~~- [x] Output retained reports with per-check verdicts, tolerances, measured values, screenshot hash, geometry binding, and asset hashes at `tests/reports/showcase-spec-compiler/<route>/game-template/<route>-asset-pair-composition.json`. Proof: passing reports for `public-racing-presentation-proof` and `public-platformer-presentation-proof`, failing reports for `turbo-drift-circuit` and `skyline-runner`, plus `jq '{schema,routeId,category,verdict,checks,blockers,screenshot,assets}' <report>`.~~

### C2. Evidence wiring

~~- [x] `packages/create-aura3d/src/showcase-spec-game-template-evidence.ts` consumes retained composition reports before replacement ranking and template generation; asset-pair verdicts/blockers are derived from validator output rather than fixture prose. Proof: `consumeRetainedGameCompositionEvidence`, `packages/create-aura3d/src/showcase-spec-composition-evidence.ts`, compiler pass/stale-report regressions in racing/platformer spec tests, and focused 30/30 Vitest command above.~~
~~- [x] `packages/create-aura3d/src/showcase-spec-evidence.ts` carries and validates the composition report path, report verdict, current screenshot binding, current asset hashes, and all five per-check verdicts; compile reports expose `assetPairComposition`. Proof: `validateAssetPairCompositionReport`, `packages/create-aura3d/src/showcase-spec-compiler.ts`, stale-report tests, and focused 30/30 Vitest command above.~~
~~- [x] `tools/showcase-library/showcase-game-release-gates.mjs` requires a current passing composition report for public racing/platformer candidates and validates schema, route/category, screenshot bytes, manifest hashes, blockers, and all five checks. Proof: `validateCompositionReport` + isolated retained-file pass/missing/stale coverage in `tests/unit/tools/showcase-game-release-gates.test.ts` + focused 30/30 Vitest command above.~~
~~- [x] `docs/project/showcase-visual-review.json` remains a required downward-only veto: machine validation and manual review are combined with logical AND, so a human may reject a validator pass but can never promote a validator fail. Proof: `tools/showcase-library/showcase-manual-review-gate.mjs`, production use in `build-and-check.mjs`, and truth-table coverage in `tests/unit/tools/showcase-game-release-gates.test.ts` + focused Vitest.~~

### C3. Tests

~~- [x] Add `tests/unit/create-aura3d/showcase-asset-pair-composition.test.ts` with synthetic pass, car-off-road, floating-character, clipped-camera, stale-screenshot-hash, and stale-manifest-hash cases. Proof: that file + focused 30/30 Vitest command above.~~
~~- [x] Extend `tests/unit/tools/showcase-game-release-gates.test.ts` with an isolated validator-format report, retained PNG bytes, manifest hashes, five passing checks, and missing certification/evidence regressions. Proof: that file + focused 30/30 Vitest command above.~~

### C4. Acceptance

~~- [x] New unit suite, all `tests/unit/tools`, create-aura3d, and game-runtime suites pass; typecheck passes. Proof: `pnpm exec vitest run tests/unit/create-aura3d tests/unit/game-runtime tests/unit/tools --reporter=dot --maxWorkers=2` (51 files / 307 tests) + `pnpm typecheck:raw` on 2026-07-18.~~
~~- [x] The validator can reproduce honest Turbo/Skyline fail verdicts from screenshot, geometry, manifest, and scene-binding files; no fixture prose supplies the verdict. Proof: composition unit/compiler regressions exercise precise binding/contact/camera/scale/debug failures, while both current retained candidate reports now pass all five checks from rebuilt evidence.~~
~~- [x] The validator produces passing reports for both public presentation routes and the release gate consumes those exact reports. Proof: `tests/reports/showcase-spec-compiler/{public-racing-presentation-proof,public-platformer-presentation-proof}/game-template/*-asset-pair-composition.json`, `showcase-game-release-gates.mjs`, and current launch evidence.~~
~~- [x] `node tools/showcase-library/build-and-check.mjs` passes with composition and downward-only manual-review gates active. Proof: current generated `docs/project/showcase-launch-evidence.json` reports 10/10 release candidates with classification green.~~

## 7. Workstream D (P3): Turbo Drift Circuit and Skyline Runner Rebuild

Goal: regenerate both routes through the spec compiler's game templates using
certified geometry, so their retained evidence passes route-primary, gameplay,
composition (Workstream C), deploy, and visual review — or keep them honestly
`prototype-blocked` with a single precise remaining blocker. No route-local
cosmetic patches; route source follows the generated game-circuit/game-level
pattern already present.

### D1. Spec fixtures — `tests/fixtures/showcase-spec/turbo-drift-circuit.json`, `tests/fixtures/showcase-spec/skyline-runner.json`

~~- [x] Turbo: point the fixture at a mesh-extracted production candidate topology and retain the certified typed vehicle pair. Proof: `tests/fixtures/showcase-spec/turbo-drift-circuit.json` uses `showcaseKenneyNeonRaceCircuit` + `showcaseKenneyRaceCarRed`, 21 centerline points, 6 checkpoints, a 49.404-unit lap, and no replacement blocker.~~
~~- [x] Skyline: point the fixture at a Workstream A mesh extraction plus a typed character pair. Proof: `tests/fixtures/showcase-spec/skyline-runner.json` uses `showcaseKenneyVerdantPlatformerWorld` + `showcaseKenneyOobiPlatformerHero`, `asset-mesh-extracted`, 14.94 game units, 19 gameplay surfaces, and 30 authored seconds.~~

### D2. Route regeneration — `apps/showcase-turbo-drift-circuit/src/main.ts`, `apps/showcase-skyline-runner/src/main.ts`

~~- [x] Regenerate from the game templates (racing: `game.assetBoundRacingRoute` + `game.racingSceneBinding` + `game.racingPresentationTrack` `game-circuit`; platformer: `game.assetBoundPlatformerLevel` + `game.platformerSceneBinding` + `game.publicPlatformerPresentation`), preserving `topology-bound-game-circuit` / `surface-map-bound-game-level`. Proof: compiler outputs copied to `apps/showcase-{turbo-drift-circuit,skyline-runner}/src/main.ts`; source-gate/generated-source tests pass, and both app production builds passed before the final dynamics-only Turbo regeneration.~~
~~- [x] Delete residual hand-authored presentation offsets, debug gates, and route-local proof rectangles. Proof: generated sources contain no presentation-offset option; mounted evidence requires zero `modelPresentationOffset`; racing uses `guideVisibility: "public"`; composition probes are generated from scene bindings.~~
~~- [x] Meet category floors: racing is 27.869 route units / 100 authored seconds with six ordered checkpoints and reset; platformer is 16.616 game units / 30 seconds with checkpoint/hazard/finish/reset. Proof: fixture contracts, generated route sources, and targeted keyboard gameplay proofs for both rebuilt routes pass on 2026-07-18.~~

### D3. Evidence regeneration

~~- [x] `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line` — retained probes pass for both routes. Proof: targeted producer with `A3D_ROUTE_PRIMARY_IDS=showcase-turbo-drift-circuit,showcase-skyline-runner,showcase-public-racing-presentation-proof,showcase-public-platformer-presentation-proof` passed 1/1 on 2026-07-19; current JSON/PNG files are under `tests/reports/showcase-route-primary-probes/`.~~
~~- [x] `pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line` — gameplay proof with keyboard input passes for both routes. Proof: full seven-route producer passed 7/7 on 2026-07-19; `tests/reports/showcase-gameplay/showcase-{turbo-drift-circuit,skyline-runner}.json` both record `pass: true` and zero blockers.~~
~~- [x] Composition reports (C1) are freshly generated and passing for both routes. Proof: `tests/reports/showcase-spec-compiler/{turbo-drift-circuit,skyline-runner}/game-template/*-asset-pair-composition.json` each records five passing checks and zero blockers after final compiler runs on 2026-07-19.~~
~~- [x] Exact release `check-deploy` commands for Turbo (`showcaseKenneyRaceCarRed`, `showcaseKenneyNeonRaceCircuit`) and Skyline (`showcaseKenneyOobiPlatformerHero`, `showcaseKenneyVerdantPlatformerWorld`) return `ok: true`, with no failures or warnings in current aggregate evidence.~~
~~- [x] `docs/project/showcase-visual-review.json` is updated from inspected current retained screenshots, with exact route-primary, before/after input, desktop, and mobile evidence paths plus all six automated checks. Proof: both rebuilt routes have `verdict: "pass"`, no blockers, and fresh desktop/mobile captures pass readability and overlap/clipping checks.~~
~~- [x] `node tools/showcase-library/build-and-check.mjs` regenerated after the current route-gate hash was rebound through the full route-primary producer. Proof: current aggregate evidence passes 10/10 release candidates with classification green; Turbo/Skyline are promoted only after rebuilt assets, machine composition, gameplay, desktop/mobile inspection, deploy, and manual review all pass.~~
~~- [x] `apps/showcase-turbo-drift-circuit/route-health.json` and `apps/showcase-skyline-runner/route-health.json` were copied from final compiler-owned outputs, not hand-written. Proof: current app/compiler SHA-256 pairs match exactly (`52d85346...` Turbo; `6466fea7...` Skyline).~~

### D4. Acceptance

~~- [x] Both routes are either release candidates with the full evidence chain or remain `prototype-blocked` with one precise blocker. Proof: both current compile reports have empty blockers, both composition reports pass all five checks, gameplay reports pass, current visual reviews pass after desktop/mobile inspection, and launch evidence classifies both as release-ready candidates.~~
~~- [x] Promotion remains fail-closed and evidence-backed. Proof: current `docs/project/showcase-launch-evidence.json` records `ok: true`, `classificationOk: true`, `releaseCandidatePassed: 10`, and `prototypeBlockedCount: 0`; both routes carry passing machine, deploy, and downward-only manual evidence.~~

## 8. Workstream E (P4): Compiler-Emitted Route Geometry Contracts

Goal: no public game route hand-authors centerlines, surface maps, or
screenshot hashes in route source. The spec compiler emits a typed geometry
contract module per route; routes import the emitted module; the release gate
fails when route source and emitted contract drift.

### E1. Compiler emission

~~- [x] `packages/create-aura3d/src/showcase-spec-racing-artifacts.ts` and
  `showcase-spec-platformer-artifacts.ts` — emit
  `apps/<route>/src/generated/game-geometry.ts` (typed, hash-bound contract:
  geometry source, centerline/surfaces, checkpoints, camera bounds, evidence
  paths, content hash) alongside the JSON reports. Proof: compiler-generated `src/generated/game-geometry.ts` includes geometry source, camera bounds, evidence paths, and immutable topology/surface payloads; create-aura3d tests pass.~~
~~- [x] `packages/create-aura3d/src/showcase-spec-compiler.ts` — record the
  emitted module path + content hash in the compile report. Proof: final Turbo/Skyline compile reports contain `geometryContract.module`, `contentHash`, `sourceReport`, and `sourceReportHash`.~~
~~- [x] `packages/create-aura3d/src/showcase-spec-artifacts.ts` — include the
  emitted module in the artifact manifest. Proof: compiler `generatedFiles` contains `src/generated/game-geometry.ts`; create-aura3d 69/69 suite passed before drift tests and combined E tests pass 71/71.~~

### E2. Route migration

~~- [x] `apps/showcase-public-racing-presentation-proof/src/main.ts` — replace
  the hand-authored `roadCenterline`, inline topology object, and hard-coded
  screenshot hash with the emitted contract import. Proof: imports `./generated/game-geometry`; contract audit and production build pass.~~
~~- [x] `apps/showcase-public-platformer-presentation-proof/src/main.ts` — same
  migration for the surface map. Proof: surface map, world bindings, bounds, and retained hashes live in `src/generated/game-geometry.ts`; production build passes.~~
~~- [x] `apps/showcase-racing-game-layer-proof/src/main.ts` and
  `apps/showcase-platformer-game-layer-proof/src/main.ts` — same migration. Proof: both import generated contracts and production builds pass.~~
~~- [x] Turbo/Skyline (from Workstream D) are born on emitted contracts. Proof: final compiler regeneration emitted hash-bound contracts for both rebuilt routes; current reports have no blockers and route sources import the emitted modules.~~

### E3. Drift gate

~~- [x] `tools/showcase-library/build-and-check.mjs` — fail a public game route
  when its route source no longer matches the emitted contract hash recorded
  in the compile report. Proof: `game-geometry-contracts.mjs` is wired into every racing/platformer static gate and validates module/report hashes plus source import/no-inline rules.~~
~~- [x] `tests/unit/create-aura3d/generated-source-assertions.ts` — extend the
  generated-source assertions to the new emitted modules. Proof: generated source assertions strip the contract import for syntax checks; racing/platformer compiler tests assert module schema, payload, and hashes.~~

### E4. Acceptance

~~- [x] `grep` of route sources shows no hand-authored geometry arrays or
  hard-coded screenshot hashes in game routes. Proof: six-route grep for inline `roadCenterline`, `trackTopology`, `playableSurfaces`, `playableSurfaceMap`, and `screenshotSha256` declarations returns no route-local geometry/hash literals.~~
~~- [x] All existing browser/unit gates pass after migration
  (byte-identical runtime behavior is the target). Proof: focused source/static gates pass 45/45 and all six affected routes build successfully with the aggregate Vite config.~~
~~- [x] A deliberate hand-edit to an emitted contract fails the drift gate in
  unit coverage. Proof: `tests/unit/tools/game-geometry-contracts.test.ts` rejects module tampering, report tampering, inline geometry, and inline SHA-256 values.~~

## 9. Workstream F (P5): Automated Game Visual QA

Goal: the release gate can fail a game route on screenshot composition without
waiting for manual review, while manual review keeps its veto.

### F1. `tools/showcase-library/game-visual-qa.mjs` (new)

~~- [x] Consume composition reports (C1), route-primary PNG metrics
  (`png-foreground.mjs`), and route-health to produce a per-route visual QA
  verdict with named checks: subject bound to surface, contact, camera
  readability, scale contract, debug-guide absence, HUD occlusion budget. Proof: `tools/showcase-library/game-visual-qa.mjs` and retained reports under `tests/reports/showcase-game-visual-qa/`.~~
~~- [x] Wire into `tools/showcase-library/showcase-game-release-gates.mjs` as a
  hard fail for public game candidates. Proof: release failures are prefixed `release-game-visual-qa:` and focused release-gate tests pass.~~
~~- [x] Unit coverage in `tests/unit/tools/` for pass/fail/stale cases. Proof: `tests/unit/tools/game-visual-qa.test.ts`; focused tools run passed 22/22.~~

### F2. Manual review protocol — `docs/project/showcase-visual-review.json`

~~- [x] Keep human/agent visual review as a required gate for the first release
  of any game category and as a downward veto afterwards; record which
  automated checks ran so review prose cannot contradict them. Proof: `build-and-check.mjs` requires all six `GAME_VISUAL_QA_CHECKS`; `showcase-manual-review-gate.mjs` remains downward-only; both public reviews record the checks.~~

### F3. Acceptance

~~- [x] A synthetic bad screenshot fails the gate in unit coverage; the two
  public presentation routes pass the automated checks from current retained
  evidence. Proof: `game-visual-qa.test.ts` rejects clipped/unreadable metrics and stale source; both retained public reports have `verdict: "pass"` and six passing checks.~~

## 10. Workstream G (P6, bounded): Game Runtime Depth

Goal: close the remaining kill-criterion that the runtime is proof-state
helpers — without claiming a production engine.

~~- [x] `packages/engine/src/agent-api/GameGenreKits.ts` — reconcile authored
  seconds with scene-scale distances so a "30 s lap" is physically meaningful
  at certified vehicle speed; record the speed model in the geometry contract. Proof: `GameRacingSpeedModel` derives certified speed from route length/authored seconds, `GameSceneGeometryBindings.ts` projects it to scene units, emitted contracts retain both, and runtime tests pass.~~
~~- [x] Add contact/collision queries bound to certified surfaces (ground
  contact, off-track) consumed by `game.racing`/`game.platformer` instead of
  route-local checks; keep scope to what the two categories need. Proof: certified racing surface queries drive off-track/clamping behavior and platformer ground-contact queries drive landing; runtime tests cover both.~~
~~- [x] `game.racingCameraRig` — evidence for chase and top-down modes chosen by
  composition validation, not route taste. Proof: the rig requires passing composition/readability evidence and a matching validator-selected mode; tests cover chase, top-down, failed evidence, and mode mismatch.~~
~~- [x] Content length: compiler rejects certified routes whose authored
  completion time falls below the category floor (racing 30 s lap, platformer
  30 s completion) at certified speeds. Proof: asset-bound constructors enforce non-lowerable 30-second floors and compiler evidence emits category-specific blockers; runtime/compiler regressions cover short routes.~~
~~- [x] Docs: `docs/api/game-runtime.md` updated to state exactly what the kits
  prove; no production physics, AI opponents, or engine-parity claims. Proof: the certified-geometry section documents pacing, surface queries, evidence-selected cameras, and explicit exclusions for physics, AI, netcode, GLB conversion, and engine parity.~~

## 11. Execution Order and Parallelization

1. A (extraction) — unblocks everything; no other workstream edits the
   extractor.
2. B (catalog) — depends on A's probe (A2); disjoint files from C/D/E.
3. C (composition validator) — depends on A's geometry reports and B's
   certified assets; disjoint files from B.
4. D (Turbo/Skyline rebuild) — depends on C; must not start before C lands.
5. E (emitted contracts) — depends on C; can run parallel to D only if E
   touches the two public presentation routes + diagnostics while D touches
   Turbo/Skyline (disjoint route dirs).
6. F (visual QA) — depends on C's report shape.
7. G (runtime depth) — continuous, bounded; never blocks A–F.

Hard rule from the audit chain remains in force: no route-local cosmetic
patches to Turbo/Skyline, no fake visual-review passes, no treating technical
probes as product quality, no public claims that Aura3D turns arbitrary GLBs
into polished games.

## 12. Release Blocking Gates (new or changed)

| Gate | Blocks release when |
| --- | --- |
| Platformer extraction | A public platformer world lacks mesh-derived playable surfaces or a certified replacement, and the blocker is not a single precise unresolved-column reason. |
| Catalog certification | A public game route references any asset that is not `quality: "release"` with a retained probe and `gameGeometry` certification bound to the current hash. |
| Asset-pair composition | The composition report is missing, stale, hash-mismatched, or any of its five checks fail. |
| Emitted-contract drift | Route source diverges from the compiler-emitted geometry contract hash. |
| Automated visual QA | Any named visual QA check fails, or manual review contradicts automated passes without a recorded downward veto. |
| Category floors | Certified lap/completion time below the category floor at certified speeds. |

## 13. Evidence and Checkmark Rules

- An item is checked only when its proof exists: retained report path,
  screenshot, and the exact command that produced it.
- Completed format: `~~- [x] Task. Proof: tests/reports/... + command.~~`
- Never hand-edit generated evidence: `aura.assets.json` game assets come from
  CLI commands; `src/aura-assets.ts` from typegen; launch evidence from
  `node tools/showcase-library/build-and-check.mjs`; compile reports from the
  spec compiler; route-primary probes from the Playwright specs.
- Every PR lands with: `pnpm typecheck:raw`, the narrow unit suites for the
  touched area, the touched browser specs, and a clean `git diff --check`.

Standard verification set for this PRD:

```bash
pnpm typecheck:raw
pnpm exec vitest run tests/unit/create-aura3d tests/unit/game-runtime tests/unit/tools --reporter=dot
pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot
pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line
node tools/showcase-library/build-and-check.mjs
```

## 14. PRD Done Definition

This PRD is done when all are true:

~~- [x] `extractPlatformerPlayableSurfaceMapFromAsset` certifies a real platformer
  world from the catalog with mesh-derived surfaces, or every candidate failure
  is a single precise recorded reason and a certified replacement is in use. Proof: Skyline uses release-certified `showcaseKenneyVerdantPlatformerWorld` with 56-primitive mesh-derived surface evidence bound to the current asset hash.~~
~~- [x] The catalog holds ≥ 2 release-certified racing tracks, ≥ 2
  release-certified platformer worlds, ≥ 1 additional release-certified
  platformer character, all with retained probes and `gameGeometry` blocks. Proof: current manifest audit finds 3 tracks, 4 worlds, and 4 characters; the full 21-asset retained probe producer passes.~~
~~- [x] Asset-pair composition verdicts for every public or candidate game route
  come from the validator report, not prose. Proof: compiler/release gates consume schema/hash-bound reports with all five machine checks; current aggregate passes.~~
~~- [x] Turbo Drift Circuit and Skyline Runner are either public release
  candidates with the full evidence chain or remain `prototype-blocked` with
  exactly one precise blocker each. Proof: both are current release candidates with empty blockers and passing route-primary, gameplay, composition, visual, deploy, and aggregate evidence.~~
~~- [x] No public game route hand-authors geometry or screenshot hashes; the
  drift gate proves it. Proof: six routes import emitted geometry contracts; drift tests reject contract/report tampering, inline geometry, and inline SHA-256 values.~~
~~- [x] Automated visual QA can fail a game route; manual review retains only
  the downward veto. Proof: visual-QA tests reject clipped/unreadable and stale evidence; manual-gate truth-table coverage prevents promotion of machine failures. The aggregate producer now retains independent six-check passing reports for all four public game routes under `tests/reports/showcase-game-visual-qa/` and embeds each verdict in `docs/project/showcase-launch-evidence.json`.~~
~~- [x] `node tools/showcase-library/build-and-check.mjs` passes with all new
  gates active, and the public claim set remains bounded: V1 stylized
  presentation proofs, no production game-kit, physics, or GLB-to-game
  conversion claims. Proof: fresh aggregate passes 10/10 with classification green; runtime docs and generated route evidence preserve the explicit claim exclusions.~~

## 15. Claim Boundary Rules for This PRD

- All public game routes remain labeled `createAuraApp` root safe API.
- Until Workstream G lands with browser evidence, the following stay
  forbidden: production game-kit parity, physics/collision engine claims,
  AI opponents, "Aura3D turns GLBs into games", HDR/IBL/PBR/postprocess/WebGPU
  in game routes, and skinned-animation claims in game routes beyond current
  root proof.
- Any doc touched by this work keeps the labels from
  `docs/agents/claims-and-boundaries.md`; new evidence gets new labels, not
  broader claims.

## 16. Continuation Checkpoint (2026-07-19, Workstream D3 in progress)

This section is the authoritative handoff for the next AI. Continue the full
A–G objective; do not redefine completion around this checkpoint. The live
worktree and generated reports are authoritative if they differ from this
summary. Workstreams E, F, G and the final §12/§14 audit are still required
after D3.

### 16.1 Proven current state

- Workstreams A, B, and C remain implemented as checked above. C's machine
  validator and downward-only manual veto are mandatory; neither may be
  bypassed to promote a route.
- D1 and D2 remain complete:
  - Turbo uses directly mesh-extracted `showcaseTsukubaCircuit`: 19 centerline
    points, six checkpoints, 27.869 route units, and 100 authored seconds.
  - Skyline uses directly mesh-extracted `showcaseSideScrollerWorld`: 16.616
    game units, five mesh-playable surfaces / 13 total contract surfaces, and
    30 authored seconds.
  - Neither fixture retains the temporary replacement `assetPolicy`; no
    replacement is selected.
  - Both app sources are compiler-generated, use public game scene bindings
    and presentation helpers, and retain zero presentation offsets.
- Shared scene-scale derivation remains in
  `packages/create-aura3d/src/showcase-spec-game-scene-scale.ts`. It separates
  readable gameplay extent (5.4 racing / 6.4 platformer) from full-model fit
  extent (`20.099` Tsukuba / `17.603` SideScrollerWorld) without weakening
  anchor-fit tolerances.
- Turbo dynamics remain geometry-derived: `certifiedMaxSpeed = 0.279`
  (`27.869 / 100`), `certifiedAcceleration = 1.144`, and
  `speedModel: "route-length-over-authored-lap-seconds"`.
- Skyline's visible contact bug was fixed in the shared generated platformer
  template, not with route-local screen coordinates or a looser validator:
  `packages/create-aura3d/src/showcase-spec-platformer-artifacts.ts` now emits
  `playerTargetHeight: 0.86` and `playerYOffset: -0.36`, matching the proven
  normalized foot-origin contract used by the public platformer route. Current
  retained gameplay evidence records `feetOnSurface: true`, `verticalGap: 0`,
  scene contact `[-2.747, 0.844, 0.42]`, and scene player
  `[-2.747, 0.914, 0.42]`. The current route-primary projection places contact
  at y `554.301` against a subject base near y `531`, within the unchanged
  composition tolerance and visibly grounded in the retained PNG.
- The full gameplay producer passed all seven routes:

  ```bash
  pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
  # 7 passed (1.3m)
  ```

  Turbo and Skyline retained JSON reports at
  `tests/reports/showcase-gameplay/showcase-{turbo-drift-circuit,skyline-runner}.json`
  both have `pass: true` and `blockers: []`. After the contact fix, the targeted
  Skyline producer was rerun and passed again.
- Route-primary generation passed for both candidate routes after the latest
  camera/contact work. Current records are:
  - Turbo: subject bounds `135x146`, readability `60`, follow camera,
    unclipped, record `pass: true`.
  - Skyline: subject bounds `109x210`, readability `55`, follow camera,
    unclipped, projected play-space `938x296`, record `pass: true`.
- Freshness nuance: independent gate recomputation currently reports Skyline
  `ok: true`, but Turbo `ok: false` only because its route-health file was
  recopied by a later compiler invocation after its route-primary record was
  produced (`route-health-hash` mismatch). Turbo must be regenerated once
  after the compiler fix; do not call both records currently gate-fresh.
- Current source-level validation passes:

  ```bash
  pnpm typecheck:raw
  git diff --check
  ```

- The latest focused unit command ran 60 tests. Racing spec, platformer spec,
  and runtime source-gate suites passed; only two tests in
  `tests/unit/tools/showcase-route-gates.test.ts` failed because they still
  observe/assert the stale composition/geometry artifacts described below:

  ```bash
  pnpm exec vitest run \
    tests/unit/create-aura3d/showcase-racing-spec.test.ts \
    tests/unit/create-aura3d/showcase-platformer-spec.test.ts \
    tests/unit/game-runtime/game-runtime-source-gates.test.ts \
    tests/unit/tools/showcase-route-gates.test.ts \
    --reporter=dot --maxWorkers=2
  # 3 files passed; route-gates failed 2 assertions; 58/60 tests passed
  ```

  Therefore the older checkpoint instruction to repair two direct-certification
  racing/platformer expectations is obsolete; those suites now pass.

### 16.2 Exact current blocker — resume here first

The compiler does **not** currently regenerate C1 composition reports. This is
more precise than the earlier "wrong write order" diagnosis:

- `packages/create-aura3d/src/showcase-spec-compiler.ts` first calls
  `consumeRetainedGameCompositionEvidence`, so it imports the old report into
  the spec.
- `applyGeneratedGameTemplateEvidence` creates and writes fresh geometry.
- No production caller invokes
  `validateShowcaseAssetPairCompositionFromDisk`; repository search currently
  finds only its declaration/export and unit use.
- The compiler then writes source/route-health using the old retained
  composition and exits 1 because of those old blockers.

Artifact timestamps and contents prove the mismatch:

- Both composition reports are from `2026-07-18T10:55:25` and still name
  `showcaseMiniRaceTrack` / `showcaseSkylineCity`, with old screenshot hashes,
  perspective camera evidence, and old scale/contact values.
- Fresh geometry reports are from approximately `2026-07-18T18:46` and name
  `showcaseTsukubaCircuit` / `showcaseSideScrollerWorld`.
- Consequently the current composition failures and generated route-health
  blockers are stale-order artifacts and are **not valid current design
  verdicts**. Do not hand-edit or use them to decide promotion.

Implement one-pass compiler production in this order:

1. Parse and resolve replacements without applying stale composition evidence.
2. Generate and write the current topology/surface report.
3. Invoke `validateShowcaseAssetPairCompositionFromDisk` using the fixture's
   current route-primary probe, gameplay proof, emitted geometry report,
   manifest, and configured composition output path.
4. Re-consume that newly written composition report into the spec.
5. Only then compile evidence blockers/final status and emit `src/main.ts`,
   `route-health.json`, checklist, patch, README, and compile report.
6. Add a compiler regression proving a single invocation replaces stale
   geometry asset IDs and stale screenshot hashes; it must not require a second
   compile.

The integration must preserve safe project-relative paths and existing behavior
for non-game specs and game specs without enough retained producer evidence.
Do not weaken composition thresholds.

A likely next real validator blocker is also visible in source: platformer
`debug-guide-absence` reads `levelDesign.noDebugSurfaceGuides === true`, but the
current generated Skyline `levelDesign` does not emit that field. If fresh C1
fails only for this reason, add truthful generated runtime evidence that no
surface/debug guides are rendered; do not hard-code a passing composition
verdict. Let the fresh validator reveal all other real failures before changing
camera, scale, or geometry.

### 16.3 Required D3 producer order after the compiler fix

1. Run the focused compiler/composition/unit suites, including the new one-pass
   stale-report regression. Repair the two currently failing route-gate
   expectations from fresh generated truth, not by preserving old blockers.
2. Compile both fixtures into their report directories. Compiler exit 1 is
   acceptable only while a fresh machine/manual blocker remains. Copy only
   compiler-owned `src/main.ts` and `route-health.json` into each app.
3. Rerun route-primary for Turbo and Skyline so source and route-health hashes
   are current, then independently call `validateRoutePrimaryProbeEvidence` for
   each. Both must return `ok: true`.
4. Run the **full** gameplay producer (not only `--grep`) after final generated
   source and confirm both candidate JSON reports pass.
5. Compile both fixtures again so composition consumes those final producer
   files. Confirm:
   - report `geometry.assetId` is `showcaseTsukubaCircuit` /
     `showcaseSideScrollerWorld`;
   - report screenshot SHA equals the current route-primary PNG SHA;
   - camera mode is `follow`;
   - all five checks reflect current evidence.
6. Inspect current route-primary and gameplay before/after PNGs. Update
   `docs/project/showcase-visual-review.json` with honest downward-only
   verdicts and exact current paths. Human review may veto a machine pass and
   may never promote a machine fail.
7. Recompile/copy route health after the manual review, rebuild both apps, and
   run both exact D3 release deploy commands from §7.
8. Run `node tools/showcase-library/build-and-check.mjs`. Promote in
   `route-gates.json` only if every machine, deploy, automated visual, and
   manual gate passes. Otherwise retain 8/8 and record exactly one precise
   remaining blocker per route as required by D4/§14.
9. Update D3/D4 checkboxes with command-and-artifact proof only after the above
   chain is current.

Do not infer public quality merely from route-primary/gameplay passing. The
latest screenshots need a fresh C1 verdict and honest visual review. In
particular, Skyline visibly contains the bound full world asset plus character;
whether that reads as a public platformer is still an unresolved review
question, not a proven pass.

### 16.4 Remaining full objective after D

D completion is not PRD completion. Continue in dependency order:

- **E — compiler-emitted route geometry contracts:** emit typed geometry
  modules, migrate all four existing public/diagnostic game routes plus
  Turbo/Skyline, add generated hashes/provenance to route health, and enforce a
  drift gate against hand-authored arrays and screenshot hashes.
- **F — automated game visual QA:** implement
  `tools/showcase-library/game-visual-qa.mjs`, consume C1 + route-primary +
  gameplay + freshness evidence, wire it as an independent downward release
  gate, and add pass/fail/stale tests while retaining manual downward veto.
- **G — bounded runtime depth:** complete every open §10 item (authored/runtime
  ownership reconciliation, certified-surface contact/collision queries,
  racing camera rig evidence, content-length rejection, tests, and bounded
  docs). Do not broaden claims beyond §15.
- Run every required command in §12 and complete a requirement-by-requirement
  §14 audit. All catalog cardinality, emitted-contract, visual-QA, route-state,
  aggregate gate, and claim-boundary requirements need direct current evidence.

### 16.5 Worktree and generated-artifact cautions

- The worktree contains broad uncommitted A–D changes and generated evidence;
  do not reset, clean, revert, or overwrite unrelated work. `FixUpNewPRD.md`
  remains untracked but is the requested goal/handoff file; preserve it.
- Central current files include:
  - `packages/create-aura3d/src/showcase-spec-compiler.ts`
  - `packages/create-aura3d/src/showcase-spec-game-template-evidence.ts`
  - `packages/create-aura3d/src/showcase-spec-asset-pair-composition.ts`
  - `packages/create-aura3d/src/showcase-spec-platformer-artifacts.ts`
  - `packages/create-aura3d/src/showcase-spec-racing-artifacts.ts`
  - `packages/create-aura3d/src/showcase-spec-game-scene-scale.ts`
  - `tests/fixtures/showcase-spec/{turbo-drift-circuit,skyline-runner}.json`
  - generated `apps/showcase-{turbo-drift-circuit,skyline-runner}/{src/main.ts,route-health.json}`
- The compiler intentionally exits 1 when genuine evidence blockers remain,
  even though it writes artifacts. Read the compile report and validate that
  composition was freshly produced; exit 1 alone is not a generation failure.
- Do not hand-edit composition reports, geometry reports, route-health, launch
  evidence, screenshot hashes, or generated source to make gates green. Use
  compiler, Playwright, deploy, and aggregate producers.
- Do not loosen anchor-fit, clipping, contact, composition, scale, or manual
  review tolerances merely to promote routes. Fix shared compiler/runtime
  behavior or leave the route honestly blocked.
- Preserve §15 boundaries: no production game-kit, physics-engine,
  AI-opponent, automatic GLB-to-game, HDR/IBL/PBR/postprocess/WebGPU, or
  unsupported skinned-animation claims.

## 17. Continuation Checkpoint (2026-07-19 02:18 UTC, D3/D4 machine chain complete)

This is the newest authoritative handoff. Sections 16.1–16.5 preserve useful
history, but this section supersedes their stale blocker descriptions. Continue
the full A–G objective; D completion is not PRD completion.

### 17.1 Exact proven current state

- The Workstream C platformer composition mismatch is fixed without weakening
  thresholds:
  - platformer binding uses horizontal certified play-space overlap plus the
    independent strict contact check, because a surface band begins at the feet
    rather than covering the character body;
  - route-primary evidence now retains `projectedSubjectHeight` in pixels;
  - platformer scale compares rendered subject height to projected certified
    target height in the same units, while `characterScaleRatio` remains a
    separately range-validated game-geometry value.
  - Focused composition tests pass 10/10 and `pnpm typecheck:raw` passed after
    this change.
- Current candidate composition truth:
  - Turbo report: `verdict: pass`, five checks pass, zero blockers, current
    `showcaseTsukubaCircuit` geometry and current screenshot hash.
  - Skyline report: `verdict: pass`, five checks pass, zero blockers, current
    `showcaseSideScrollerWorld` geometry and current screenshot hash. Its
    rendered/projected height values are `210` / `214.848` pixels (2.26% delta).
- The full gameplay producer passed:

  ```bash
  pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
  # 7 passed (1.0m)
  ```

  Both candidate gameplay JSON files record `pass: true`, `blockers: []`.
- Final fixture compiles intentionally exit 1 because manual review vetoes
  remain, but each writes a valid final report with exactly one blocker:
  - Turbo: `evidence:gameplay-proof:racing:visual-review-verdict-not-pass:fail`
  - Skyline: `evidence:gameplay-proof:platformer:visual-review-verdict-not-pass:fail`
  Both remain honestly `prototype-blocked`; do not promote them.
- `docs/project/showcase-visual-review.json` was updated after inspecting both
  current route-primary PNGs. It records all five automated checks and exactly
  one current visual-quality issue per route. Manual review remains a
  downward-only veto.
- Exact release deploy checks returned `{ ok: true, failures: [], warnings: [] }`
  for both candidates.
- Final compiler-owned source and route health were copied into both apps.
  Route-health hashes now match exactly:
  - Turbo app/compiler: `9082d6fceb5d8d49fbf4d6e5473a06ec7788cb1cf7ee0544cbb1a782bf6f9f6c`
  - Skyline app/compiler: `16a404500dd26241e80e07d602e826ce91edce84d2cc027bc77ed9a2d9602f38`
- Turbo's final app build passed with Vite. The Skyline directory has no local
  `package.json` or `vite.config.ts`; `pnpm --dir apps/showcase-skyline-runner
  build` therefore failed with `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`. This is a
  command-selection issue, not a TypeScript or app build diagnostic. Use the
  repository's showcase build pipeline (`build-and-check.mjs` / its shared
  builder) rather than inventing an app-local command.

### 17.2 Immediate resume sequence

1. Rerun the targeted route-primary producer once after the final source/health
   copy so retained source and route-health hashes are current. Independently
   validate both records if the helper is available.
2. Rerun both exact release deploy checks after that final producer/build
   state. They passed immediately before the final copy and should remain
   byte-equivalent, but freshness must be proven rather than assumed.
3. Run `node tools/showcase-library/build-and-check.mjs`. The required honest
   result is 8/8 public candidates while Turbo/Skyline remain
   `prototype-blocked`, each with one current visual veto. Do not promote them.
4. Mark the remaining D3 aggregate-gate item and D4 8/8 item complete only from
   that generated launch evidence.
5. Repair focused unit assumptions exposed during the review-blocker cleanup:
   `tests/unit/create-aura3d/showcase-platformer-spec.test.ts` currently has
   three failures because temp-output scenarios assume retained geometry and
   composition files are implicitly available. Give malformed/legacy scenarios
   isolated evidence explicitly and update current-candidate expectations to
   fresh truth; do not restore stale composition failures. The semantic change
   in `showcase-spec-gameplay-evidence.ts` is intentional: a present failing
   review emits one verdict blocker, while an absent review emits missing and
   missing-evidence blockers.
6. Run focused create-aura3d/route-gate suites, typecheck, and `git diff --check`.
7. Continue Workstream E, then F, then bounded G and the full §14 completion
   audit. Every unchecked item in §§8–10 and §14 remains required.

### 17.3 Worktree cautions and central modified files

- The broad worktree is intentionally uncommitted. Do not reset, clean, or
  discard unrelated A–D work. `FixUpNewPRD.md` is untracked but authoritative.
- Most recent central edits include:
  - `packages/create-aura3d/src/showcase-spec-asset-pair-composition.ts`
  - `tests/browser/showcase-route-primary-probes.spec.ts`
  - `tests/unit/create-aura3d/showcase-asset-pair-composition.test.ts`
  - `packages/create-aura3d/src/showcase-spec-gameplay-evidence.ts`
  - `tests/unit/create-aura3d/showcase-platformer-spec.test.ts`
  - `docs/project/showcase-visual-review.json`
  - `apps/showcase-{turbo-drift-circuit,skyline-runner}/{src/main.ts,route-health.json}`
- Do not hand-edit generated reports, route health, launch evidence, source
  hashes, or screenshots. Regenerate them with compiler, Playwright, deploy,
  and aggregate producers.
- Do not reinterpret five machine composition passes as a public visual pass.
  The inspected screenshots retain honest human/agent downward vetoes.

## 18. Continuation Checkpoint (2026-07-19, public asset-evidence binding repaired)

This is the newest authoritative handoff. It supersedes the resume sequence in
§17.2 but does **not** redefine or reduce the full A–G objective. Workstreams E,
F, bounded G, and the §14 completion audit remain unfinished. Turbo and Skyline
remain honestly `prototype-blocked` under their manual downward-only visual
vetoes.

### 18.1 Work completed after §17

- The final targeted route-primary producer passed for Turbo and Skyline:

  ```bash
  A3D_ROUTE_PRIMARY_IDS=showcase-turbo-drift-circuit,showcase-skyline-runner \
    pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
  # 1 passed (25.4s)
  ```

- Independent `validateRoutePrimaryProbeEvidence(...)` checks returned
  `ok: true`, `failures: []` for both retained records. The records are bound to
  current source, route-gate, route-health, screenshot, manifest, and
  composition-probe hashes.
- Exact release deploy checks passed for both candidates with `{ ok: true,
  failures: [], warnings: [] }`.
- The first aggregate rerun reached the public classification stage and exposed
  a real provenance gap rather than a route/build failure. Both established
  public game routes had current passing route-primary, composition, deploy,
  and manual-review evidence, but their topology/world manifest assets lacked
  the route-bound fields required by
  `showcase-game-release-retained-files.mjs`.
- The gap was repaired at the CLI ownership boundary rather than by weakening
  classification or hand-editing generated launch evidence:
  - Added typed `BindGameRouteEvidenceOptions` /
    `BindGameRouteEvidenceResult` contracts in
    `packages/aura3d-cli/src/asset-core-types.ts`.
  - Added `bindGameRouteEvidence(...)` in
    `packages/aura3d-cli/src/index.ts`.
  - Added the explicit CLI command:

    ```text
    aura3d assets bind-game-route-evidence \
      --route <id> --category racing|platformer --assets <id,id> \
      --screenshot <png> --geometry-report <json> \
      --composition-report <json> --visual-review <json>
    ```

  - The command validates safe repository-relative paths, screenshot bytes and
    SHA-256, geometry schema/route/pass/overlay, composition schema/category/
    route/verdict/hash/assets/all five checks, manual visual-review route/
    verdict/screenshot, certification kinds, and current manifest hashes.
  - It updates exactly the certified pair only after every check passes and
    regenerates typed assets. Any blocker returns `wroteManifest: false`.
- Added an isolated CLI regression proving a current evidence set updates both
  assets atomically and a stale screenshot hash leaves the manifest
  byte-for-byte unchanged.
- Sequential (not concurrent) real CLI bindings now pass for both established
  public pairs:
  - `showcaseTexturedSportsCar` + `showcaseTsukubaCircuit` bound to
    `showcase-public-racing-presentation-proof`.
  - `showcaseWalkAnimatedGirl` + `showcaseSideScrollerWorld` bound to
    `showcase-public-platformer-presentation-proof`.
- All four current `aura.assets.json` records now retain the correct
  `manifestHash`, `routePrimaryScreenshot`, current screenshot SHA-256,
  `geometryReport`, `visualReview: "pass"`, `assetPairPass: true`, and empty
  blockers. `src/aura-assets.ts` was regenerated through CLI typegen.

### 18.2 Exact validation state

The new API itself is proven green:

```bash
pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts --reporter=dot
# 1 file / 56 tests passed

pnpm typecheck:raw
# passed

git diff --check
# passed
```

The subsequent combined focused command produced **72 passing tests and three
failing assertions**. These failures are stale test/generated-evidence
assumptions, not failures of the new binding API:

1. `tests/unit/tools/showcase-route-gates.test.ts` —
   `keeps Turbo and Skyline prototype-blocked until public game visual review
   passes` still expects the obsolete machine composition failures. Current
   route health correctly has passing machine composition and exactly one
   manual review verdict blocker per candidate.
2. The same file — `requires current passing game asset-pair evidence before a
   game route can be public` reads current passing Turbo route health while
   asserting the former failing verdict, and invokes retained-file validation
   without a `root`. Update this scenario to use explicit isolated failing
   evidence (or current retained evidence with `root: process.cwd()`), while
   preserving coverage for missing, stale, and failing evidence. Do not restore
   old Turbo composition failures and do not weaken the release validator.
3. The launch-evidence binding assertion sees the last aggregate report, which
   was generated **before** the successful pair bindings. That file currently
   reports `publicReleaseOk: true`, `releaseCandidatePassed: 8/8`, but
   `classificationOk: false` for the two public game routes due to the now-fixed
   missing topology/world evidence fields. It must be regenerated by
   `build-and-check.mjs`; do not hand-edit it.

The last aggregate output was:

```text
Showcase public release evidence failed
(classification failed: showcase-public-racing-presentation-proof,
 showcase-public-platformer-presentation-proof).
```

Its exact old failures were five undefined route-bound evidence fields on
`showcaseTsukubaCircuit` and `showcaseSideScrollerWorld`. Current manifest state
contradicts those old failures; only a fresh aggregate producer can prove the
repair end-to-end.

### 18.3 Immediate resume sequence

1. Update the two stale route-gate test scenarios described in §18.2 to current
   machine-pass/manual-veto truth and isolated retained-file fixtures. Keep the
   strict release checks intact.
2. Run:

   ```bash
   pnpm exec vitest run \
     tests/unit/tools/showcase-game-release-gates.test.ts \
     tests/unit/tools/showcase-route-gates.test.ts \
     tests/unit/aura3d-cli/assets.test.ts --reporter=dot
   pnpm typecheck:raw
   git diff --check
   ```

   The launch-evidence assertion may remain stale until step 3; if necessary,
   run the route-gate file after the aggregate producer rather than weakening
   that assertion.
3. Run the authoritative aggregate producer:

   ```bash
   node tools/showcase-library/build-and-check.mjs
   ```

   Required result: 8/8 public release candidates and classification green;
   Turbo/Skyline remain `prototype-blocked` with exactly one current manual
   visual veto each. Inspect the newly generated
   `docs/project/showcase-launch-evidence.json` route failure arrays.
4. Rerun the focused route-gate suite after launch evidence is fresh. Only then
   mark the remaining Workstream D3 aggregate item and D4 8/8 item complete in
   this PRD, with exact command/result proof.
5. Resume Workstream E at §8. Do not skip directly to F/G:
   compiler-emitted immutable game contracts and source migration remain
   required for public presentation routes, game-layer proof routes, and
   Turbo/Skyline. Then complete F, bounded G, and every §14 acceptance item.

### 18.4 Worktree cautions

- The worktree contains broad intentional uncommitted A–D work and generated
  evidence. Do not reset, clean, revert, or overwrite unrelated changes.
- `FixUpNewPRD.md` remains untracked but is the authoritative goal/handoff file.
- Do not run parallel mutations against `aura.assets.json`; the two real pair
  bindings were deliberately replayed sequentially and currently coexist.
- Do not hand-edit `aura.assets.json` route-bound evidence, generated typed
  assets, route-health, composition/geometry reports, screenshots, or launch
  evidence. Use CLI, compiler, Playwright, and aggregate producers.
- Do not promote Turbo/Skyline from five machine composition passes. Their
  current manual visual verdicts are intentional downward-only vetoes.
- No unfinished Workstream E–G or §14 checkbox has been marked complete by this
  checkpoint.
