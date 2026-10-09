# Finish prompt: Lane 05, Asset Pipeline + Technical-Art Toolchain (A3D_QR_ASSETS, _DECODERS, _LOD, _LOOKDEV)

Paste everything below the line into a fresh coding agent started at the root of `https://github.com/auraoneai/aura3d`.

---

You are the **finish agent for Lane 05** of the Aura3D Quality Rebuild. The lane is about **50 % done, not finished**. Your mission is to finish **every** remaining lane-05 task in `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` §4.5, plus the Track 0 rows the lane owns (T0-13 for the prd05 adapter, T0-21 and T0-22, in §2.2). Each task needs a **passing remote run** that you cite. Until then it is not done, whatever any checkbox, PR description or ledger says.

## Situation (main `afb475c2`, 2026-10-08)

- **PR content.** All six `[QR-05]` PRs were squash-merged into `main` and their content is there: #62 (`ec688eef`), #347 (`f29b1da4`), #358 (`76c932cf`), #360 (`f7ab6880`), #365 (`7758a271`) and #366 (`45316e60`, which also carries the hidden Phase 6/7 commit `25c4eb69`). None was closed unmerged or merged into another base. **The one piece of PR content that never landed is the decoder `.wasm` files.** `.gitignore:273 '*.wasm'` dropped them, so `git ls-files public/aura-decoders packages/assets/vendor` lists only `.js` files. `packages/assets/vendor/{basis,draco}/README.md` cite sha256 values for files that do not exist.
- **Flags.** `packages/rendering/src/contracts/flags.state.ts:15` has `A3D_QR_ASSETS` at `dev`.
- **CI status:**
  - `qr-prd05-assets-browser.yml` (macos-14) has **never passed**; the last run is 37774324412. Every run, three specs time out at 180 s waiting for `__QR_READY__`: `assets-compressed-glb.spec.ts:63`, `assets-decoder-failure.spec.ts:35` and `assets-lod-transition.spec.ts:51`.
  - `qr-prd05-gates.yml` is green (37774324506).
  - `asset-optimize.yml` is green but runs the dry run only (37626535026). It does not run the determinism test.
  - `asset-lookdev.yml` has **0 runs**.
  - `qr-contracts.yml` is red (37779363728). The lane-05 error is `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts(48,39)` TS2339 `licenseName`.
- **All-flags capture (GitLab pipeline 2926601350).** 0/18 benchmark scenes rendered, and the prd05 lane scenes threw `TypeError: g.color is not a function`. That error comes from your adapter, `benchmarks/quality-rebuild/aura3d/scenes/prd05/common.ts:74`, which calls `environments.color()`. That function has never existed. Under `A3D_QR_STRICT`, `common.ts:145-147` (`renderer.mode`) throws `AuraMigrationError`.
- **Flags none.** With flags none, main is pixel-identical to baseline (IC-0 pass). That must stay true.

## Read first (use `rg -n '^#'` plus offset/limit reads; never whole-file reads)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`: §2.2 rows T0-13, T0-21 and T0-22 (lines ~134, ~142, ~143); §2.5 all-flags gate (~234); §3 Track P rows that touch lane 05, namely P-38, P-54, P-56, P-57, P-61 and P-64 (~257-345); §4.0 common rules and flag promotion (~350); **§4.5 Lane 05 (~499-525)**; §5.3; §6.2 checkpoints.
2. `docs/project/aura3d-quality-rebuild/PRD-05-asset-pipeline-technical-art-toolchain.md`: §12 contracts and Q-requests (~1038), §14 checklist (~1333), §15 tests (~1437), §16 acceptance (~1488), §17 budgets (~1605) and §18-§21.
3. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` §4 ownership, §5 flags (§5.3 promotion), §6 merge protocol and Appendix B (F-05 rows).
4. `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, which decides where every run goes. Also read `_sections/integration-findings.md`, `_sections/issues-triage.md` and `_sections/process-remediation.md`.
5. `docs/project/aura3d-quality-rebuild/evidence/prd05/q-issues.md`, the unfiled outbound requests.
6. The source files cited in each task below, before you change them.

## Ownership

You own:
- `packages/assets/` by default (decoders, `KTX2*`, `GLTFLoader.ts`, `loaders/`, `vendor/`)
- `rendering/src/webgl2/TextureFormats.ts`, `performance/LOD.ts` and `rendering/src/lanes/prd05.ts`
- `engine/src/lanes/prd05.ts`, `agent-api/AssetDecoders.ts` and `LodSelector.ts`
- `packages/aura3d-cli/` by default, `packages/asset-index/`, `assets/` by default, `aura.assets.json` and `aura.library.json` (P-61 registers it to 05)
- `tools/asset-optimize/` and `apps/{asset-lookdev,loader-ktx2}/`
- `public/{aura-assets,aura-decoders}/`, `tests/qr/prd05/**`, `benchmarks/quality-rebuild/**/prd05/**`, and the `qr-prd05-*` / `asset-*` workflows

For any other file, open a `qr-request` (labels `qr-request` + `to:prdNN`) naming the file, the exact change and the contract it serves, and keep working against the stub. The `.gitignore` edit for T0-21 is a single-line negation the lane needs. If `QR_OWNERSHIP.json` assigns `.gitignore` to lane 15, put the edit in your PR and record lane 15's acceptance in the PR body (§3.3 rule 3).

## Remaining tasks (exact ids from PRD-16 §4.5; do them in this order)

### P0, which blocks everything else (Track 0 window 2026-10-09 → IC-1 2026-10-15)

**05-S3S4 = T0-21: commit the decoder wasm and fail closed instead of hanging.**
- `.gitignore`: right after line 273, add `!public/aura-decoders/**/*.wasm` and `!packages/assets/vendor/**/*.wasm`.
- Commit the wasm files:
  - `basis_transcoder.wasm` (sha256 `6cf17dc8…`, from `node_modules/three/examples/jsm/libs/basis/`) into `packages/assets/vendor/basis/` and `public/aura-decoders/basis/`.
  - `draco_decoder.wasm` (sha256 `a680d927…`) into `vendor/draco/` and `public/aura-decoders/draco/`.
  - Alternatively, copy the tracked `fixtures/asset-corpus/decoders/{basis_transcoder.wasm,draco_decoder_gltf.wasm}`.
  - Either way, verify each sha256 against the vendor README and fix the README if it is wrong.
- Fail closed instead of hanging. Each of these must end in `AssetDecoderUnavailable`:
  - `packages/assets/src/KTX2BasisTextureTranscoder.ts:104-111` (`loadBasisModuleBrowser`): add `moduleConfig.onAbort = reject` and a 30 s timeout.
  - `KTX2TranscodeWorker.ts:13-27, :148-153` and the `WORKER_SOURCE` init: add `worker.onerror` / `onmessageerror` handlers that reject pending jobs and `initPromise`, and post `{type:'error'}` when BASIS aborts.
  - `AssetDecoderRegistry.ts:121-129` (`loadDraco`) and `:251-264` (`loadUmdGlobal`): add an abort reject and a timeout.
- Add a unit test: a 404 wasm, and a wasm URL answered with `index.html` 200 (the SPA case), each reject with `AssetDecoderUnavailable` inside the timeout.
- Done when `qr-prd05-assets-browser.yml` is green on macos-14 with:
  - `assets-compressed-glb`: ΔE2000 ≤ 2.0 masked, all resource origins within the test origin, sRGB internal format;
  - `assets-decoder-failure` and `assets-lod-transition`;
  - the artifact `prd05-assets-compressed-glb.json` uploaded.

**05-ADAPT = T0-22 + T0-13: fix the prd05 bench adapter** (`benchmarks/quality-rebuild/aura3d/scenes/prd05/common.ts`).
- `:71-74`: replace `environments.color({color})` with `scene(spec.id).background(spec.background.color)`, the same pattern as `prd07/common.ts:99`.
- `:145-147`: pass `renderer:{ qualityProfile:"production" }` only, with no `mode` and no `fallback`. Check that `resolveRendererQualityProfile("production").rendererMode === "production"` (`rendererOptions.ts:118`).
- `:32`: derived GLB URLs built from `repoPath` are not served (`benchmarks/quality-rebuild/vite.config.ts:55-73`, `publicDir:false`). Register the prd05 derived assets in the copy plugin and use `/qr-assets/<basename>`. `vite.config.ts` belongs to lane 12, so file a request if you cannot reach it through an extension point.
- `:155-161`: stop the 90 s fall-through. Break the wait on `diagnostics().errors.length > 0` or a mount failure, and throw `NoDrawError` on deadline with 0 draws so the page publishes `__QR_ERROR__` within about 1 s.
- `:174-178`: log "decoded via C-16 registry" only when a registry was actually attached and every asset is `ready`.
- Remove the `as never` casts. Get `aura3d/scenes/**` into `benchmarks/quality-rebuild/tsconfig.typecheck.json`; that file is lane 12's, so add it via a request if it is not yours.
- Done when a remote GitLab capture of `prd05-optimized-{damaged-helmet,pbr-product,skinned,outdoor,game-scene}` and `prd05-asset-lod-transition`, with flag sets `none`, `assets` and `all` (and `all,strict` once T0-13 lands in all adapters), gives drawCalls > 0, no TypeError and READY in under 30 s.

**05-REQ = P-64 + P-54: file every outbound request and correct the ticks.**
- Run `gh issue create --label qr-request --label to:prdNN` (or `--label ccr`) for every section of `evidence/prd05/q-issues.md`:
  - Q-02-1, Q-02-2 (both); Q-04-1, Q-04-2, Q-04-3; Q-11-1, Q-11-2; Q-12-1;
  - Q-13-1, Q-13-2, Q-13-3; Q-14-1..Q-14-4; Q-15-1..Q-15-9; CCR-05-1 (label `ccr`).
- Also file these against the core owners. Each is a **core rendering defect**; link it to the Track 0 row that fixes it:
  - Q-05-7 → `to:prd01` (GLSL `layout(std140, binding=0)` in `#version 300 es`, with no `uniformBlockBinding`; T0-02);
  - Q-05-8 → `to:prd01` (`hookSplice` emits `requires` after the chunk; T0-05b);
  - Q-05-10 → `to:prd01` (`rendererProgramCache` passes no flags; T0-05a);
  - Q-05-9 → `to:prd04`.
- Write each issue number next to its section in `q-issues.md`, and replace ":3 prepared but NOT filed".
- Untick or annotate PRD-05 §14 items that have no evidence until they are proven:
  - `:1348` Day-0 issues;
  - `:1354` Draco wasm copy and `:1355` Basis wasm vendoring;
  - the Phase 1 Vite/tsup and create-aura3d build-copy item;
  - `:1366` the assets-compressed-glb browser exit;
  - the Phase 3 assets-lod-transition browser exit;
  - `:1382` the dry-run path.
- gh is already authenticated through the provider store. Do not log in, and do not set `GH_TOKEN`.
- Done when every `q-issues.md` section has an issue number and every unbacked tick is unticked or annotated `pending run:<id>`.

### P1

**05-S2: fix the lane-05 typecheck error.** Widen the credits type in `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts:44-48` to `{ license?: string; licenseName?: string }`, or assert the field the credits writer actually emits. Do not scope the typecheck away. `tests/browser/production-runtime-production-scene-tools.ts:151` is another lane's file, imported by the prd05 harness; if it is not fixed, file a request against T0-31. Re-run `qr-contracts.yml` with flags `none`, `all` and `A3D_QR_ASSETS` alone. Done when qr-contracts is green, including C-16/C-17 stub and real conformance and the flag-off sentinel.

**05-S6: §16.1 (a)-(c) evidence.** On GitLab macOS (`local=true`), capture each `prd05-optimized-*` scene against its source base scene (02, 03, 08, 09, 15, 18), in both Aura and three. Pass thresholds:
- masked SSIM opt vs src ≥ 0.97 (≥ 0.95 for scene 09);
- silhouette IoU ≥ 0.98 for scenes 08 and 15;
- two C-32 `judgeWithPrism` vision runs, with a score drop ≤ 0.25.

Commit `<scene>-side-by-side.jpg` and `report.json` under `docs/project/aura3d-quality-rebuild/evidence/prd05/assets/`. Depends on 05-ADAPT.

**05-S7: LOD transition.** After 05-S3S4, the spec `tests/qr/prd05/browser/assets-lod-transition.spec.ts` must be green. Capture the `prd05-asset-lod-transition` frame strip in both Aura and three (three with the MSFT_lod plugin; the scene already uses `quaternius-sports-car.0dbac342.glb`). Judge:
- (d) ≤ 1 visible pop, by vision ×2 plus a named human;
- (e) ≥ 60 % triangle reduction at 80 m;
- (f) ≥ 2 level changes per copy.

Commit the strip, the render-item log and the judgments.

**05-BROWSERS.**
- `tests/qr/prd05/playwright.config.ts` is Chromium-only. Add `webkit` and `firefox` projects for the decode-correctness specs.
- Add a `windows-latest` non-visual job for BC format selection with a capability mock.
- Add a guard that fails the run when the renderer string contains SwiftShader.
- Add `assets-tier-texture-cap.spec.ts`: with `maxTextureSize` 1024, a 2048 KTX2 texture uploads at 1024.

Done when all three engines and the windows job are green in one workflow run.

**05-S5: budget report and determinism.** Regenerate `optimize-dry-run.json` at `docs/project/aura3d-quality-rebuild/evidence/prd05/assets/`. Today it sits at the repo root with 213 rows (P-57); delete the root copy. It must cover all 226 models: before/after bytes, triangles and GPU bytes per tier, plus the aggregate for the 120 game ids. Add `tests/unit/asset-optimize/determinism.test.ts` as a step in `asset-optimize.yml` (identical sha256 across two runs), and record a green run.

**05-S8: look-dev with the broken control.** Run:

`gh workflow run asset-lookdev.yml -f assets=damagedHelmet,antiqueCamera,soldier,mechHeroDecimated,patrolAircraftMeshy,courierTrafficSedan,showcaseHeadphones,bankShotTable,skylineArcticRunnerHero,siegeGolfBall`

Then run `tools/asset-optimize/review-vision.ts` twice per asset (Prism C-32). Expected results:
- the 3 good assets score G9 ≥ 6.5;
- the 4 known-bad assets (bankShotTable, skylineArcticRunnerHero, siegeGolfBall, raw mechHeroDecimated) score < 6.5;
- a named human records agree/disagree on the 3 probes, with ≤ 1 disagreement.

The renderer string must not be SwiftShader. Never use `A3D_LOOKDEV_ALLOW_SWIFTSHADER=1`, which is how #365 was verified; §15 forbids it. Commit `lookdev/<id>/<hash8>/{contact,debug,gameplay}.jpg`, `metrics.json` and `review.json`, then tick the 10 Phase 4 items with links. Depends on 05-S3S4.

**05-S9: library and HDRI admission; Meshy decisions.**
- `aura.library.json` has 60 entries, all `candidate` with `lookDevApproved=false`. For each §6.6 kit minimum, run optimize → look-dev workflow → vision review → `assets admit --quality release`.
- Admit 6 HDRIs at 2k, plus 4k `studio-soft` and `outdoor-midday`, as environment entries.
- `meshy-promotion.json` has 12 entries, all `hold-prestage`. Run the remote Blender remesh/bake worker (`tools/asset-optimize/blender/*.py`, remote only) and record promote, or reject with the G-failures, for each.
- Flip F-05-01..09 in CONTRACTS Appendix B from `proposed` to `published`, each with a run id.
- Fix the S1 record. "0 failing release assets" was reached by demoting every release asset, not by fixing any. State that honestly in the evidence.
- Depends on 05-S8.

**05-S10: fixtures, the 80 MB budget and the codemod.**
- Create `tests/qr/prd05/fixtures/{route-bundle,routes,template-starter}/`. None of them exist today. `.gitignore:325 'fixtures/'` may hide them; add a negation (P-38).
- `template-starters.test.ts` must prove that product-viewer and racing-starter pass G1-G11.
- Move the root `aura.assets.json` to schema 1.1 with populated derived entries (today it is 1.0 with 0 derived).
- Measure the derived total for the 120 ids and commit it; it must be ≤ 80 MB.
- Re-run the codemod `--report` over all 18 games. Today's `codemod-report.json` covers 9 of 27 files and is invalid JSON, because stdout "EXIT 0" was appended. Mark the old file `placeholder` (P-56) and write valid JSON.

**05-PKG: F-05-04 packaging.** Add a Vite plugin or a check-deploy step that copies `packages/assets/vendor/{basis,draco,meshopt}` to `<base>/aura-decoders/` in app builds. File Q-13-1 for create-aura3d template vendoring. This matters because `KTX2BasisTextureTranscoder.ts:52` has defaulted `transcoderUrl` to `/aura-decoders/basis/` for **every** KTX2 decode since #347, whatever the flag. Done when a built app and a scaffolded template both serve `/aura-decoders/basis/basis_transcoder.{js,wasm}` with a 200 and the correct MIME type (`application/wasm`). Depends on lane 13 (Q-13-1).

**05-WIRE: decoder registry on the default `model()` path.**
- `TypedGLBActor.ts:261` forwards decoders only when the caller passes them, and `compileScene.ts:178-187` and `renderer.ts:58` never pass them.
- `attachAppAssetDecoders` (`engine/src/lanes/prd05.ts:26`) has no caller.
- File Q-04-1: forward `options.decoders` and `maxTextureSize`.
- File Q-15-1: the model compile awaits `prepareModelDecoders` and calls `degrade('capability-degraded')` on failure.
- Wire the lane-owned side, then un-skip `assets-compressed-typed-glb.spec.ts`.
- Done when the typed-GLB spec is green. Depends on Q-04-1 and Q-15-1.

**05-C16: a consumer for the C-16 slot.** `resolveCompressedTextureFormatSlot().provide(...)` at `rendering/src/lanes/prd05.ts:25` has no `.get(flags)` caller. File a request with the texture-upload owner (01/06) so the upload site calls `slot.get(rendererQrFlags())(format, colorSpace, gl)` under the flag. Add a test asserting `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR` on ANGLE Metal. S3's "device-reported sRGB internal format" assertion depends on this.

**05-ISSUES: deliver inbound requests.** Close each with a commit link and a run id:

| Issue | Request | From |
|---|---|---|
| #51 | 2k CC0 HDRIs under `fixtures/environment-corpus/hdri` with C-17 provenance. The 8 staged library HDRIs need release status plus a path or alias. Blocks lane 12. | lane 12 |
| #52 | Ground texture set (ref-03) and street kit (ref-04). Blocks lane 12. | lane 12 |
| #68 | Host K1–K7/K9 in `assets/library/kits`, admitted at release, with the path mapping confirmed. Blocks lane 14. | lane 14 |
| #126 | Street lamp ≤ 5k triangles to replace `neonStreetLampProp`. #116 depends on it. | lane 11 |
| #165 | `assets add --type audio` and `validate --release` adopt the C-25 sfx provenance fields. | lane 09 |
| #242 | `genericAgentText` loads `skills/agent-files/AGENTS.md` (`packages/aura3d-cli/src/index.ts`, ~:3781). | lane 13 |
| #243 | `aura3d doctor --look` forwards to `cliCommandFor('look lint')` (C-39). | lane 13 |

### P2

**05-S11: bundle-budget test.** Add `tests/qr/prd05/bundle-budget` and wire it into `qr-prd05-assets-browser.yml`. It builds a lane fixture app and asserts:
- engine initial-bundle growth ≤ 3 KB gz;
- meshopt lazy chunk ≤ 20 KB gz;
- draco absent from the initial bundle;
- wasm loaded lazily.

**05-TIERS: tier measurements.** `tier-measurements.json` was taken on production with flags off, a stub tier controller and no device names, so mark it `placeholder`. Re-run `tools/asset-optimize/measure-tiers.mjs` remotely on the 6 pilot games with `qrFlags=assets` and `all`. Record GPU/device strings, texture VRAM, triangles, draw calls, ready bytes and long tasks. Add the manual iPhone and Android rows from §19, and file one issue for each exceeded budget. Depends on lane 11 #53.

**Phase 7 / §16.4 I1-I8.** At IC-4 (2026-11-05), add a round to `pilot-review.json`, which has 0 rounds today. Use the lane-14 captures and per-game deltas, with a named human sign-off. File Q-14-3 and Q-14-4, and file `qr-ic-regression` issues by leave-one-out (`all,-assets`).

**05-PROMO.** Either register `A3D_QR_ASSETS_LOOKDEV` (`rendering/src/shaders/debug-view.glsl.ts:183`, `apps/asset-lookdev/src/aura-adapter.ts:52`) in the CONTRACTS §5 flag table, or remove it. Then request promotion (see below).

## Red flags to revert or correct (each is its own small PR or a line in a lane PR)

1. PRD-05 §14 ticks with no backing evidence: `:1348`, `:1354`, `:1355`, `:1366`, `:1382`, the Phase 1 build-copy item, and the Phase 3 LOD browser exit. Untick each until a run proves it (P-54).
2. The wasm READMEs cite sha256 values for files that are not committed. Fix this with T0-21.
3. `prd05/common.ts:174-178` makes a false capability claim, and `:155-161` turns a no-draw into READY. Fix both in 05-ADAPT.
4. PRs #347, #360, #365 and #366 merged with the lane browser job and the unit, arch-gates, bundle-size and pack-check jobs red, labelled "main baseline". From now on, **no merge with any red or cancelled check** (§3.3).
5. #365's look-dev verification used SwiftShader. Re-run it under 05-S8.
6. `codemod-report.json` and `tier-measurements.json` are placeholders. Mark them so and stop citing them (P-56).
7. The root `evidence/prd05/assets/optimize-dry-run.json` is at the wrong path. Move it (P-57).
8. "S1 no failing release assets" was reached by demoting everything. State that in the record.
9. Cross-lane edits without recorded sign-off (P-61): lane 01 `lod-dither.glsl.ts`, `contracts/renderItem.ts`; lane 04 `GLTFRenderResources.ts`; lane 15 `aura.library.json`. Get each owner's acceptance recorded in the PR thread, or revert.
10. `A3D_QR_ASSETS_LOOKDEV` sits outside the §5 flag table. Register or remove it (05-PROMO).
11. Thresholds are intact (ΔE2000 ≤ 2.0, 1 cm contact bound). **Do not loosen any threshold or timeout, and do not add `test.fail`, skip or `continue-on-error` to make anything green.**

## Flag promotion criteria: `A3D_QR_ASSETS` from `dev` to `standalone-accepted`

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

Only lane 15 changes the state, at a checkpoint (realistically IC-2 on 2026-10-22 at the earliest). Ask for promotion only when **all** of these hold:
- Track 0 exit is met (PRD-16 §2.5).
- Every lane-05 S-row (S1-S11) is green in **one** run of the lane workflows on main: macos-14 or GitLab macOS, `--strict`, none of the §3 masks.
- The sentinel identity check passes with `qr_flags=none` (ΔE2000 p99 ≤ the IC-0 noise floor on `benchmarks/quality-rebuild/sentinels.json`).
- F-05-01..09 are `verified` with run ids.
- checklist-lint is green, so every PRD-05 `[x]` carries `run:<id>` or `capture:<id>`.
- Every outbound request is filed.
- The open issues that block other lanes are closed: #51 and #52 (lane 12), #68 (lane 14).

The later steps, `integrated-accepted` (G-PANEL with `all` and `all,-assets`) and `default-on`, follow §4.0.

## Merge rule (binding)

Every merge requires a **green lane workflow on the PR head** **and** the §2.5 **all-flags gate** (`qr-required / allflags-smoke`: 6 probes × `none;$ALL;$ALL,strict`, drawCalls > 0, non-blank frames, `errors == []`, ready ≤ 30 s). While Track 0 is open, the `$ALL` arms may be expected-red with an issue link, but your PR must not turn any arm red that was green before.

Also:
- No merge while a lane run is queued or in progress.
- "Pre-existing failure on main" is not an exemption.
- No direct pushes to `main`.
- Until `qr-required` exists (target 2026-10-10), merge only Track 0 and Track P work.
- Each Track 0 PR shows the bisection set it unblocks.

## Remote-only routing (CI-ROUTING.md)

- Locally you may only edit, use git, run `tsc` on the packages you touched, and run targeted unit tests. **No local Docker, no local Playwright or browsers, no local captures, no full suites, no local Blender.**
- **GitHub (ubuntu):** `qr-contracts.yml`, `ci.yml`, `test.yml`, `qr-prd05-gates.yml`, `asset-optimize.yml`.
- **GitHub (macos-14):** `qr-prd05-assets-browser.yml`, browser conformance, and the sentinel when you touch `packages/rendering/**` or `packages/engine/**`. Dispatch look-dev with `gh workflow run asset-lookdev.yml …`.
- **GitLab macOS via the bridge:** all lane scenes, captures, S6/S7 strips and tier runs, with `local=true`. Put the tag in the **head** commit, for example:
  - `[qr-gitlab:benchmark]`
  - `[qr-gitlab:games games=showcase-bank-shot,showcase-turbo-drift-circuit viewports=1920x1080 mobile=false]`
  - re-run without a code change: `git commit --allow-empty -m '[qr-gitlab:benchmark]'`
  - dispatch: `gh workflow run qr-gitlab-ci.yml --ref qr/prd05-<topic> -f suite=flags-bisect -f bench_scenes=<prd05 ids> -f bench_engines=aura3d -f bench_flag_sets='none;assets;<ALL>;<ALL>,strict' -f requester=prd05`. Use this once lane 12 lands §2.3; until then use `suite=benchmark`.
  - Never use `local=false` as evidence.
- Download results with `gh run download <id>` (artifact `gitlab-<suite>-<pipelineId>`). Never compare frames across providers; check `ciProvider` and `browserChannel`.
- Never push to or open MRs on the GitLab mirror. Never print credentials.

## Budget

Your lane's budget is about **2,400 GitLab compute minutes per month** (about 400 macOS wall-clock minutes). Reference costs: the 18-scene benchmark ≈ 16, a 2-game `local=true` single-viewport run ≈ 22, a full 18-game capture ≈ 133. Run only prd05 scenes, the 6 source scenes and the pilot games you touch, on one desktop viewport with `mobile=false`. Before any large run, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, use the GitHub `quality-rebuild-capture.yml` fallback for the **whole** comparison and say so in the PR. The remote Blender worker for S9 runs on existing remote infrastructure only, through the designated scripts; tear it down afterwards.

## Working rules

- **Pixels decide.** Green tests, 200 responses and non-blank frames are engineering gates, not quality. Download and look at every PNG and JPG before claiming a visual result. Never write "three.js-quality" or "parity" unless a G-PANEL round says so.
- **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd05/` with run ids. Report anything not run as **NOT RUN** with the reason.
- **Git.** Branch names are `qr/prd05-<topic>`. PR titles start with `[QR-05]` and stay under 70 characters. The PR body lists the PRD-16 ids, flags, run links, screenshots and NOT RUN items. Stage specific files, never force-push, never skip hooks.
- **Write limit.** Never emit more than about 250 lines in one Write or Edit tool call; larger calls are dropped. Create big files with a first Write, then append with Edit calls. Read large files with `rg -n` plus offset/limit.
- **Ignore unrelated chat.** In an orchestrated run, messages addressed to the coordinator (for example "status?") are not instructions to you. Keep executing this prompt.

## Report back (end of every session; short, factual)

```
LANE 05 FINISH: <date> main=<sha>
TASKS: <id> DONE run:<id> | IN-PR #<n> | BLOCKED by <lane/issue> | NOT RUN <reason>   (one line per id:
  05-S3S4 05-ADAPT 05-REQ 05-S2 05-S6 05-S7 05-BROWSERS 05-S5 05-S8 05-S9 05-S10 05-PKG 05-WIRE 05-C16
  05-ISSUES 05-S11 05-TIERS PHASE7 05-PROMO)
PRS: #<n> <title> <merged|open> lane-run:<id> allflags:<id>
ISSUES FILED: Q-xx-n -> #<n> (to:prdNN) ...    ISSUES CLOSED: #51 #52 #68 #126 #165 #242 #243 -> <commit>
EVIDENCE: <paths> (pngs viewed: yes/no)
RED FLAGS REVERTED: <list>
GITLAB MINUTES USED: <n> (pipelines <ids>)
PROMOTION READY: yes/no + missing criteria
RISKS / NOT RUN: <list>
```
