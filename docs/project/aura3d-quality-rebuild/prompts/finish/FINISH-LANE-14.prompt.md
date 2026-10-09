# Finish prompt — Lane 14: Eighteen-game rebuild program (18 × A3D_QR_ROUTE_<ID>)

Copy everything below the line into a fresh coding agent started in the repo root (`/Users/gurbakshchahal/platforms/aura3d`).

---

You are the **finishing agent for Lane 14** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`). Your
mission is to close **every** remaining Lane 14 task in `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`
§4.14 (ids `14-*`, which are refined below into the exact ids), action the lane's open issues, revert the lane's red flags, and
bring each of the 18 routes to the PRD-14 §21.1 standalone exit with evidence. Nothing is "done" until a **passing remote run
id** proves it. The owner believes the lane is finished. The 2026-10-08 audit (`/tmp/qrfinal/audit-14.json`, auditor +
skeptic) says **PARTIAL, ~25-30 %**.

## Status on main `afb475c2` (2026-10-08) — read before you plan

- All 24 `[QR-14]` PRs are **merged into main**: #63, #138, #160, #183, #203, #231, #238, #298, #304, #307, #311, #318, #320,
  #322-#327, #329, #331-#334. None is stranded, unmerged or based on a side branch, and no lane-14 PR is open. That
  delivered:
  - Phase 1: C-35 `packages/game/src/art/*`, scorecard and forms, gate scripts, `qr-prd14-games.yml`, `games.json` V2,
    18 `art/direction.ts`, baseline scorecards and 18 flag-off dispatchers in `apps/*/src/main.ts`.
  - Phase 2: 18 v2 shells in `apps/*/src/v2/boot.ts`.
- **Phase 3 (kits) and Phase 4 (content) have not started.** `apps/showcase-kits/` does not exist. Phases 5-6 wait on
  G-PANEL. 0/91 checklist items are ticked. None of S1-S12 is proven. The only `evidence/prd14/` file is the root
  `evidence/prd14/review-queue.json`.
- CI: `qr-prd14-games.yml` has **1 success in ~65 runs** (branch `qr/prd14-gate-tooling`, 2026-10-06). On every lane PR the
  `T1.x unit tests` job fails (`qr-prd14-games.yml:55` runs `tests/qr/prd14 tests/unit/contracts/impl`, giving 8/866
  failing). `Static gates` and `Capture changed games + runtime audit (macos-14)` are **always SKIPPED**, even on the one green
  run 37475221386. The cause is the empty route detection, not the unit failure (see CI-1). The S1-S9 evidence has never
  been produced.
- Flag-on reality:
  - GitLab pipeline 2926540757 (job 17030837764, "all flags", cancelled at 74 min) had **9/9 games crash or never draw**:
    - Aura Clash throws `TypeError: Cannot read properties of undefined (reading 'mode')` at all 3 viewports.
    - The other 8 hit `no-draw-timeout` and then `Target page, context or browser has been closed`.
    - The Turbo route 404s on `/apps/showcase-turbo-drift-circuit/src/styles.css`.
    - Pulse logs `EFFECT_ZERO_PIXELS`.
  - That run actually had **every engine flag off**. Its URL was `?a3d-qr=A3D_QR_ROUTE_<ID>,all`, and
    `packages/engine/src/contracts/flags.ts:55-58` (`applyList`) treats `all` only as the whole string.
  - Benchmark pipeline 2926601350 rendered 0/18 with lane flags on. That is a Track 0 engine failure (lanes 01/02/03/12/15),
    not lane-14 code. With flags `none`, main is pixel-identical to baseline (IC-0 pass).
- Flags: the 18 `A3D_QR_ROUTE_<ID>` flags have `DEFAULT_ON = false` in each `apps/*/src/main.ts`, for example
  `apps/showcase-bank-shot/src/main.ts:8`. The engine lane flags are all `dev`.

## Read first (rg -n '^#' + offset/limit reads; never whole-file reads of large files)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` sections:
   - §1.2-§1.4 (lane-14 rows)
   - §2.2 T0-29 (`:150`) and T0-30 (`:151`, lane 09 beacon)
   - §2.4 Games bisect (`:223-228`)
   - §2.5 all-flags gate (`:234-253`)
   - §3 Track P: P-05 (`:270`), P-22 (`:283`), P-55 (`:331`), P-61 (`:341`, #346 edits to `AuraClashArenaApp.ts`), P-64
   - §4.0 promotion (`:350-359`)
   - §4.14 (`:711-729`)
   - §5.3 blocking list (`:810`)
   - §7 verification
2. `docs/project/aura3d-quality-rebuild/PRD-14-eighteen-game-rebuild-program.md` sections:
   - §6.3 gate (`:277`), §6.9 per-game plans (`:392-919`), §7.2/7.2.1 `games.json` + budgets (`:1079-1153`)
   - §12A.2 owned files (`:1488`), §12A.3 flags (`:1504`)
   - §13-§14 phases + checklist (`:1552-1823`), §16.1 S1-S12 (`:1848-1866`), §17 budgets (`:1900`), §18-§20 (`:1938-1971`)
   - §21 completion (`:1973-1990`)
3. `docs/project/aura3d-quality-rebuild/_sections/{integration-findings,issues-triage,process-remediation}.md` (lane-14 rows).
4. `docs/project/aura3d-quality-rebuild/CI-ROUTING.md` (147 lines, the whole file), `CONTRACTS.md` §4.1 row 14, §5.3-§5.4
   (flag states, per-route opt-in), §6.5 (requests), Appendix B.
5. The original lane prompt `prompts/LANE-14-eighteen-game-rebuild-program.prompt.md`. Its ownership, contracts and rules
   still apply. Also `/tmp/qrfinal/audit-14.json` and `/tmp/qrfinal/gl/games/tools/quality-rebuild-capture/out/report.json`
   if they are present.

## Owned paths (single writer; PRD-14 §12A.2, longest prefix in `.github/QR_OWNERSHIP.json` wins)

You own:
- the 18 route trees `apps/<dir>/`: `src/main.ts`, `src/legacy/**`, `src/v2/**`, `src/gameplay/**`, `art/**`, route
  `index.html`/styles
- `apps/showcase-kits/` (new)
- `packages/game/src/art/` (C-35)
- `tools/quality-rebuild-capture/games.json` (the **data**; lane 12 owns `games.schema.json` and `capture-games.mjs`)
- `tools/quality-gate/src/scorecard.ts`
- the lane-14 gate scripts (`check-art-direction.mjs`, `check-route-health.mjs`)
- `tests/qr/prd14/**`, `tests/unit/contracts/impl/prd14-*`, `tests/unit/contracts/C-35-art.test.ts`
- `.github/workflows/qr-prd14-games.yml`
- `evidence/prd14/` (to be moved) and your PRD file.

These are **not yours**, so use a `qr-request`/`ccr` issue for them:
- `packages/engine/**` and `packages/rendering/**`, including `contracts/flags.ts` and `stubs/game.ts` (15, and 09 for the
  C-24 impl)
- `packages/game/src/index.ts` slot wiring (09)
- `capture-games.mjs`, `.gitlab-ci.yml`, `qr-gitlab-ci.yml` (12)
- `flags.state.ts`, `tools/bundle-size/`, `docs/architecture/root-export-dispositions.json` (15)
- `tests/unit/contracts/impl/prd{01,03,12,13}-*` (their lanes).

Lane 14 never edits engine files (PRD-14 §2.2).

## Remaining tasks (exact ids; do them in this order, parallelise independent ones via subagents)

PRD-16 §4.14 ids map as follows:
- 14-CI = CI-0, CI-1, P-05, P-22
- 14-GAMES0 = FLAG-1..FLAG-4 (T0-29)
- 14-S1..S9 = T1.10, T2.3, T2.6
- 14-LOC
- 14-P0FIX = T1.12
- 14-KITS = T3.x
- 14-CONTENT = T4.x
- 14-HANDOFF
- 14-REC = T1.15
- 14-PROMO = T5/T6

### P0 — make the lane gate honest and the v2 routes boot on the real runtime (target IC-1, 2026-10-15)

| ID | Task (file:line) | Done when (remote run id required) | P | Depends |
|---|---|---|---|---|
| CI-0 | `tests/qr/prd14/turbo-drift/car-visuals.test.ts:3-6` imports `flatVehicleSurface` from `@aura3d/engine`. The vitest alias (`tests/qr/prd14/vitest.config.ts:110`) resolves that to `packages/engine/src/public/index.ts`, and lane 15 pruned the export there (`docs/architecture/root-export-dispositions.json:13025` `to: deleted`). It still lives at `packages/engine/src/agent-api/VehicleChassis.ts:58`. Import from `../../../packages/engine/src/agent-api/VehicleChassis` (the pattern at `tests/unit/engine/vehicle-chassis.test.ts:9`) or from a published subpath that keeps it. Check `apps/showcase-turbo-drift-circuit/src/v2/race-setup.ts` for the same dependency. Fix `tests/unit/engine/route-cue-maps.test.ts` (missing `apps/showcase-*/src/*-audio`, T0-31 lane-14 row) too. | `vitest run tests/qr/prd14` 0 failures in the T1.x job; `CI / Type Check` has no lane-14 file in its error list | P0 | — |
| CI-1 | The T1.x job (`qr-prd14-games.yml:55`) also runs all of `tests/unit/contracts/impl`. Four other lanes' tests are red there: `prd01-render-targets` ("Missing cube texture face: px"), `prd03-post-cube-lut` (ENOENT `tests/qr/prd03/fixtures/luts/teal-orange-33.cube`), `prd12-registry` (`prd05-optimized-damaged-helmet` owner prd05≠prd12), `prd13-looks` (`LOOK_RULE_DUPLICATE:look/ambient-flattens`, `look/evidence-only-feel`). **Scope** the lane job to `tests/qr/prd14 tests/unit/contracts/impl/prd14-* tests/unit/contracts/C-35-art.test.ts`; the repo-wide contract suite stays required in `qr-contracts.yml` and `qr-required`. File `qr-request to:prdNN` for each of the four with the log line. **Real reason Static/Capture are skipped, verified on run 37565292284 (PR #183, branch `qr/prd14/showcase-bank-shot/v2-shell`, 18 files under `apps/showcase-bank-shot`):** the `routes` job logged `changed dirs: <none>`. `static`/`capture` need only `routes` (`:105`, `:124`) and are gated `if: needs.routes.outputs.dirs != ''` (`:106`, `:125`), so they skip even when the unit job is green (the success run 37475221386 skipped them too). Fix `:79`. Likely cause, unverified: `git fetch origin main --depth=1` (`:78`) re-shallows `origin/main` after the `fetch-depth: 0` checkout, so `"$BASE"...HEAD` finds no merge base and the error is lost in the pipe. Drop the shallow fetch, use `git diff --name-only "$BASE"...HEAD -- apps/` with `set -o pipefail`, and fail the job when the PR touches `apps/**` but resolves 0 dirs. Then add `needs: [unit, routes]` and an aggregator so a skip counts as a failure in `qr-required`. | One `qr-prd14-games.yml` run on a lane-14 PR has **all 4 jobs executed and green** | P0 | — |
| P-05 | `qr-prd14-games.yml:146,150` `continue-on-error: true` on capture + art-direction audit; `:162-166` tests only `steps.capture.outcome`; `:147` never passes `--strict`. Remove both `continue-on-error`; test both outcomes; pass `--strict`. | A deliberately broken art direction fails the job (negative run id), then green | P0 | CI-1 |
| P-22 | 22+ `test.skip(!existsSync(.../src/v2/boot.ts))` guards in `tests/qr/prd14/browser/*.spec.ts` (e.g. `showcase-bank-shot-v2.spec.ts:44`). Replace them with the shared `requireOrSkip()` (fails when `process.env.CI`), or delete them, since all 18 trees exist. Set `forbidOnly: !!process.env.CI` in the lane playwright config. | `rg -n "existsSync\(.*v2/boot" tests/qr/prd14` = 0; no skipped tests in the CI report | P0 | — |
| FLAG-1 | v2 shells resolve the **C-24 stub**. Every `apps/*/src/v2/boot.ts` passes `qualityRebuild: { flags: [ROUTE_FLAG] }` (bank-shot `:100`, aura-clash `:90`). `flagNameFor` (`packages/engine/src/contracts/flags.ts:37-48`) returns null for raw `A3D_QR_ROUTE_*` ids and for hyphenated `route-<id>`, so `A3D_QR_GAME` stays off. As a result `packages/game/src/index.ts:53` `C24_GAME_SLOT.get(flags)` returns `stubCreateGame` (`packages/engine/src/contracts/stubs/game.ts:113`): no `normalizeSceneSnapshot`, no HUD/touch/sound/juice, beacon frame counter 0. Per CONTRACTS §5.4 / PRD-14 §12A.3, list the engine short flags each route needs explicitly, in the same list in boot.ts and `games.json` `qrFlags`: at least `game`, plus `camera`/`lighting`/`post`/`materials`/`vfx`/`world`/`tiers`/`looks` per `art/direction.ts`. File the new issue **to:prd15**: `applyList` (`flags.ts:55-60`) honours `all` only as the whole string. Re-ping #72 (CCR-14-2, `route-<id>` short names). | Remote browser run with `?a3d-qr=route-<id>`: `window.__AURA3D_GAME__` comes from the real `installGameBeacon` and `flags.on('A3D_QR_GAME')` is true, for 18/18 | P0 | 09 (C-24 real impl + T0-30 #54) |
| FLAG-2 | `tools/quality-rebuild-capture/games.json`: `qrFlags: ['A3D_QR_ROUTE_<ID>']` forces v2 into **every** capture. `capture-games.mjs:97` unions it even for `--flags none`, and the dispatcher `routeFlagFromUrl` (`apps/showcase-bank-shot/src/main.ts:11-19`) accepts the raw id. But `readyExpr`/`evidenceGlobal` are legacy: aura-clash `__AURA_CLASH_ARENA_PROOF__` exists only in `src/legacy`, and blockfall `__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__` only in `legacy/main.ts`. Fix: `evidenceGlobal: "__AURA3D_GAME_EVIDENCE__"`, `readyExpr` on `__AURA3D_GAME__.state === 'playing'` (#308), plus `captureContractMigrated: true`. Add a flag-off legacy variant per game (legacy readyExpr), because S1 and IC-0 need it. File **to:prd12**: `capture-games.mjs:97` must not union route `qrFlags` into `--flags none` captures. | Every v2 capture reaches readiness `ready` (not `timeout`); the legacy variant with `none` still `ready` | P0 | 12 (harness union) |
| FLAG-3 | Aura Clash crash. `apps/aura-clash-showcase/src/v2/boot.ts:47-53` passes `scene: () => ({ nodes: [...] })`, a bare object. The stub (`stubs/game.ts:114-116`) forwards it unnormalized, and the engine reads undefined `.mode`. Build it with `scene().addMany(...)` as bank-shot does. Map the minified frame (`aura-engine-*.js:79:253782`) with a sourcemap build (T0-29: `capture-games.mjs --build-only`, `build.sourcemap:true`). | 0 page errors for aura-clash v2 at 3 viewports, remote | P0 | — |
| FLAG-4 | No-draw hangs in 9 games (blockfall, skyline, turbo, siege, aurora, neon, gravity, courier, pulse): firstDraw `?` at 1920×1080 and 26-37 s at 1280×720, then the page closes. After FLAG-1..3, re-run, then bisect per game with `none` + route flag only. Suspects: (a) scene modules awaiting many GLB/HDRI fetches before the first frame; (b) per-frame `onFrame` work in boot.ts; (c) `game.ready()` gating start. Fix the Turbo 404: the v2 index/boot references `/apps/showcase-turbo-drift-circuit/src/styles.css`, which is not in the build. Fix Pulse `EFFECT_ZERO_PIXELS` dust, or list it in `standIns[]`. Use one game × one viewport per run (PRD-16 §2.4 Games). | All 18 v2 routes firstDraw ≤ 10 s (≤ 15 s with `all`) and `ready` at 1920×1080, 1280×720, 390×844@3 on remote macOS; 9/9 games draw at 1280×720 with the full lane list (T0-29 exit) | P0 | Track 0 for the `all` arm |
| T2.2-post | 17 v2 boots run a no-op `void postPresets["<preset>"]` (all except neon-swarm), e.g. aura-clash `:173`, bank-shot `:448`, patrol-wing `:1018`. They then hard-code `appliedLook: { preset }` in evidence (aura-clash `:192`), so the evidence claims a look that was never applied. Apply the preset through the real C-05/C-07 surface (scene post / `app.setOutput`) and derive `appliedLook` from the C-31 runtime manifest. Check neon-swarm for the same literal. | `rg 'void postPresets' apps/*/src/v2` = 0; `appliedLook` comes from runtime and is deep-equal across scenarios (S6) | P0 | — |

### P1 — standalone S1-S12 for 18 routes, P0 legacy fixes, kits, content

| ID | Task (file:line) | Done when (remote run id required) | P | Depends |
|---|---|---|---|---|
| T1.10 | Dispatch specs exist for 4 games: `tests/qr/prd14/browser/{bank-shot,turbo-drift,aura-clash,orbital-defense}-dispatch.spec.ts`. Add the other 14: vault-breakers, rooftop-buckets, courier-rush, neon-swarm, pulse-tunnel, siege-golf, patrol-wing, aurora-lander, gravity-post, deep-recovery, skyline-runner, blockfall-reactor, mech-hangar, gallery-shift. Each spec checks S1 in both directions. Flag off must boot legacy with the same evidenceGlobal keys and 0 new console/page errors over 60 s. `?a3d-qr=route-<id>,<engine list>` must reach `__AURA3D_GAME__.state === 'playing'` with the **real** C-24 impl, not `?a3d-qr=<ROUTE_FLAG>` alone as `showcase-bank-shot-v2.spec.ts:52` does. Fix the 18 v2 specs' URLs the same way. | 18 dispatch specs green in the lane capture job | P1 | FLAG-1, FLAG-2 |
| T2.3 | Framing specs exist for 4 games (bank-shot, turbo, aura-clash, orbital `*-framing.spec.ts`). Add 14 more. Each asserts S7: `framing.subjectHeightFraction` in `03-mid` is inside the `art/direction.ts` range at 1920×1080 and 390×844. | 18 framing specs green | P1 | FLAG-4 |
| T2.6 (S1-S9) | Run `qr-prd14-games.yml` on macos-14 for **all 18** (`workflow_dispatch -f games=<all 18 dirs>`). It runs `capture-games.mjs --strict`, `art-direction-audit.spec.ts` and every `<id>-v2.spec.ts`. Then run the canonical GitLab capture (see routing). Commit the PRD-14 §20 evidence under `docs/project/aura3d-quality-rebuild/evidence/prd14/<game>/<run-id>/`: shots at 3 viewports in both flag states, plus `report.json` with rAF p50/p95/p99, draws, readbacks, errors, `requiredConditions`, `canvasBlankCheck`, `appliedLook` per URL, resolved `qrFlags`, `degradations`, `ciProvider`, `browserChannel` and SHA. Also commit the `check-art-direction.mjs` and `check-route-health.mjs` output. Thresholds are PRD-14 §16.1: S8 draws ≤ §7.2.1 Medium budget at `?aura3d-quality=medium` with 0 readbacks per frame; S9 p95 ≤ 50 ms at 1280×720. Game-logic CPU p95 ≤ 4 ms and route chunk ≤ 80 KB gz (§17). | S1-S9 PASS for 18/18 with run ids; a game that fails is listed FAIL with its reason, never omitted | P0 | CI-*, FLAG-*, T1.10, T2.3 |
| T1.12 | §14.1 P0 legacy fixes still missing on main, each landing with its named test:<br>- Courier Rush: `webglcontextlost`/`webglcontextrestored` handler in `apps/showcase-courier-rush/src` + `WEBGL_lose_context` browser test (#118).<br>- Bank Shot: evidence strip `legacy/main.ts:118`, `styles.css:105-106`.<br>- Gallery Shift: evidence strip `legacy/main.ts:347`, `styles.css:243`; `facingYaw` in legacy `syncCharacterVisuals` + `src/gameplay/facing.ts` + test.<br>- Patrol Wing: evidence strip `styles.css:136`.<br>- Siege Golf: debug sliders `legacy/main.ts:113-115`; `setScene(buildHoleScene)` at `:978`, `:1124` → handle updates (#108), with a p95 ≤ 50 ms test.<br>- Neon Swarm: `void cameraState` at `legacy/main.ts:1667-1671`, with a camera-pose test.<br>- Rooftop Buckets: per-frame `setMaterial` `legacy/main.ts:1177,1216,1227,1232`, with a count test.<br>- Gravity Post: per-frame `hud.innerHTML` `legacy/main.ts:2162`, with a string-compare/diff test.<br>- Pulse Tunnel: `100dvh`/900 px rule in `legacy/styles.css`, with a 390×844 canvas test.<br>- Mech Hangar: single fetch of `mechHeroDecimated`, with a one-request test.<br>- Orbital "Checksum"/"Systems" and Aurora "PROTOTYPE" sidebar: play-view debug-text scan in both flag states.<br>- Also: skyline `lives.test.ts`, deep p50/readbacks. | Every bullet has a fix and its test, green in the lane workflow | P1 | CI-1 |
| T1.13 | `games.json` fields requested by lanes 12/11. 0/18 entries have `scenarios[]`, `hudSelectors[]`, `keyboardHintSelectors[]` or `captureContractMigrated` (#46). Add strip/webm steps around `04-action` and `01-title` (#344), tiers `qrFlags` variants + a forced-Medium scenario (#103), and `evidenceGlobal: __AURA3D_GAME_EVIDENCE__` (#308, see FLAG-2). Move root `evidence/prd14/review-queue.json` → `docs/project/aura3d-quality-rebuild/evidence/prd14/` with `git mv` (§12A.2). | `tests/qr/prd14/unit/games-json.test.ts` asserts the new fields; the capture consumes them | P1 | 12 schema |
| T3.1-T3.4 | Phase 3 kits. Create `apps/showcase-kits/`:<br>- `package.json`: private, `three@0.185.1` **exact**.<br>- `lookdev/index.html` + `main.ts`: three r185 and Aura side by side, 8-frame turntable, PNG strip.<br>- `kit.schema.json`, plus `K1..K7,K9/kit.json` with `source`, `licence`, `sha256`, `triangles`, `textures`, `lookdev {runId, reviewer, verdict}`. Binaries go in LFS.<br>- `K8/cues.json` with licensed samples normalized to −16 LUFS. Run ffmpeg `ebur128` **remotely**.<br>- `tests/qr/prd14/unit/kits.test.ts`.<br>- A remote look-dev browser test: the damaged helmet renders non-blank in both panes.<br>- Admission per consumer through `aura3d assets add` (skill `aura3d-assets`).<br>Never put an unlicensed asset in a kit. A missing licence means a `standIns[]` entry, not an admission. | `kit.json` complete with a human `accept` verdict per file; `kits.test.ts` green (S10, S11 measurable) | P1 | 05 #68 for library hosting; staging is unblocked |
| T4.0-T4.x | Phase 4 per-game content per PRD-14 §6.9 + §14.4 for all 18: asset swaps from kits, C-15 materials, C-10 lighting, framing, `game.fx` VFX, C-25 cues, juice, HUD. Do it in wave order:<br>- Wave 1 (→ IC-4 2026-11-05): Bank Shot (16-ball atlas, table ≥ 20k tris, spot shadow 2048, felt sheen 0.6, juice), Turbo (road GLB, hero car ≥ 30k tris, CSM sun, `sound.engine` RPM test), Aura Clash (arenaScale 1.0, no material overrides, K6 walk), Orbital (K5 planet, K7 ships, framing tests).<br>- Wave 2 (→ IC-8): Vault, Rooftop, Courier, Neon, Pulse (conveyor test), Siege.<br>- Waves 3/4 (→ IC-12): Patrol, Aurora, Gravity, Deep, Skyline, Blockfall, Mech, Gallery.<br>Engine features not yet real use the §8 fallbacks and are recorded in `standIns[]` with an R-14-NN. Fix the failing `car-visuals.test.ts` first (CI-0). Use skills `aura3d-art-direction` and `aura3d-browser-game`. | Every §6.9 bullet for a game is done or listed in `standIns[]`; S1-S12 + §17 standalone budgets pass with `none` + route flag | P1 | T3.x, 01-04, 07 (fallbacks allowed) |
| S10-S12 | S10: every `art/direction.ts` asset role resolves to an admitted kit id with an `accept` verdict. S11: C-25 `proof().synthCues === 0` and `voicesPlayed` for every `audio[]` cue, asserted in each `<id>-v2.spec.ts`. v2 routes still use legacy synth adapters today (bank-shot `v2/boot.ts:16` `createBilliardsAudio` from legacy). S12: validator in CI; every `standIns[].request` maps to an **open** issue (#65-#88). | S10-S12 green in the lane workflow for 18/18 | P1 | T3.x; 09 #70 for engine cues (K8 fallback is lane-owned) |
| WEBKIT-FF | PRD-14 §18: add `tests/qr/prd14/playwright.webkit.config.ts` (WebKit S1/S2/S11) and a Firefox S1 60 s timeline job in `qr-prd14-games.yml` on macos-14. | Both jobs green for the changed routes | P2 | — |

### P2 — LOC, records, review queue, promotion

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 14-LOC | Phase 2 exit `boot.ts ≤ 400 LOC` fails for **14/18** (`wc -l` on afb475c2): patrol 1070, aurora 992, gallery 937, gravity 903, deep 784, blockfall 772, neon 741, skyline 637, mech 616, pulse 518, bank-shot 496, rooftop 470, courier 465, siege 465. Move gameplay, HUD and evidence wiring into `src/v2/scene/*`, `src/v2/evidence/*` and `src/gameplay/*` with no behaviour change. Prove it with a pixel-identical capture before/after on the same provider. | `wc -l apps/*/src/v2/boot.ts` ≤ 400 for 18/18 | P2 | T2.6 baseline |
| T1.15 | `rg 'F-14' docs/project/aura3d-quality-rebuild/CONTRACTS.md` returns nothing. Append F-14-01 (art-direction schema fields) and F-14-02 (route-flag pattern) to Appendix B as `proposed`, and promote them to `verified` only with a green main run id. CONTRACTS is lane-15 custody, so do it through a qr-request or with sign-off recorded in the PR body. | Both rows present | P2 | 15 |
| 14-REC | Tick PRD-14 §14 checkboxes (0/91) **only** with `run:<id>`/`capture:<id>` (P-55, checklist-lint by lane 12). Verify that every R-14-xx in §12A.6 is filed (#65-#88) and file the 2 new ones (FLAG-1, FLAG-2). File every markdown-only request with `gh issue create --label qr-request --label to:prdNN` (P-64). | Checklist-lint green for PRD-14 | P2 | 12-LINT |
| REVIEW-Q | `evidence/prd14/review-queue.json` queues bank-shot, turbo, aura-clash and orbital for the first **counted** G-PANEL round at phase `T2-v2-shell`. §13/§14.4 allow that only after the Phase 4 exit (S1-S12). Mark the entries `screening-only` or remove them. | Queue lists only games with Phase 4 exit evidence | P2 | — |
| T5.1-T5.4 | After each G-PANEL (IC-4, IC-8, IC-12): run `tools/quality-gate/src/scorecard.ts --round IC-<k>` for the queued games and commit `apps/<dir>/art/scorecards/IC-<k>-<sha>.json`. Open round-2 issues and file a pilot retrospective after IC-4. #47: verify that the scorecard consumes C-32 `GameJudgement` + `PanelRoundRecord`, then close it with evidence. | Each game `accepted` or `withdrawn` per §6.3 | P2 | 12 #75 |
| T6.1-T6.4 | Per accepted game, after two clean checkpoints: delete `src/legacy`, the dispatcher and `routeFlagFromUrl`; request G-REG goldens (12); delete 0-consumer assets via `aura3d assets`; list the game in showcase-index; move the route flag to `REMOVED_QR_FLAGS` (15). | §21.2 fleet criteria; two green fleet captures on main | P2 | 12, 15 |

## Issues to action / close (37 addressed to lane 14; PRD-16 §5)

Close an issue only with evidence: a commit plus a run id in the closing comment. Many inbound patch sets target
`legacy/main.ts`. For each one, decide whether to apply it to legacy or close it as **superseded by v2**, and link the v2 file
that replaces it.

- **P0 now:** #308 (Q-14-3, evidenceGlobal + `captureContractMigrated`, = FLAG-2); #46 (Q-14-1, `scenarios`/`hudSelectors`/
  `keyboardHintSelectors`; `qrFlags` already present, = T1.13); #219 (Q-14-1, per-route `A3D_QR_CAMERA` opt-in,
  camera-cast codemod, remove `loop.maxSubSteps`; overlaps FLAG-1).
- **games.json / harness:** #344 (strip/webm steps), #103 (tiers variants + forced-Medium scenario).
- **Per-route handoffs:** #140 (bank-shot lighting/camera/aim-line), #306 (turbo), #309 (courier), #281 (blockfall), #278
  (rooftop: apply the PRD-09 patch set), #265 (per-route `world.*`, Phase 4).
- **PRD-09 spec migrations to scenario capture + game evidence:** #282, #285, #288, #290, #291, #293, #295, #296, #299,
  #300, #302 (vault, mech, siege, gallery, patrol, deep, aurora, skyline, gravity, neon, pulse). `git am` of the
  all-routes-shadow set fails on aura-clash (09-MIG), so coordinate the rebase with lane 09.
- **PRD-11 codemods:** #107 (blockfall A/B probe + text3D scoreboard), #108 (siege setScene → T1.12), #109 (skyline
  pixelRatio clamp, safe-basic, unused assets), #110 (qualityProfile + DPR clamps × 4), #116 (neon Q-05-1 lamp), #117
  (bank-shot text3D digits → DOM), #118 (courier static hints + device-loss overlay → T1.12), #119 (turbo pixelRatio →
  `quality.lock()`), #120 (gravity per-frame dock-gate texture), #121 (review the batch-optout codemod report), #122 (rename
  `showcase-webgpu-particle-lab`, low).
- **PRD-08:** #220 (turbo composition-report strings + capture smoothing bypass), #221 (skyline-player-feel reads
  `diagnostics().camera.layers`).
- **Sign-off needed (comment the decision; do not just close):** #229 CCR-08-2 `AuraCameraSubject.rotation`, #230 CCR-08-3
  per-axis `AuraTraumaLayer` (also to:prd15), #38 CCR-12-1 `JudgeIdentity`/`PanelRoundRecord` co-sign. Also PRD-16 06-S13 /
  P-61: lane 06's #346 moved `installTestDriver` in `apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts` (your
  file). Accept it in the #346 thread, or open a revert PR.
- **Verify then close:** #47 (scorecard ↔ C-32). **Informational:** #188 (keep the deprecated
  `WaterReflectionRefractionCapture` importer list).
- **Outbound, still open; keep each current with a comment and re-ping where it blocks you:**
  - #65 R-14-04 (to:prd15), #66 R-14-05 (09), #67 R-14-06 (11), #68 R-14-07 kits (05), #69 R-14-08 (13), #70 R-14-09 cues
    (09), #71 CCR-14-1 (15).
  - #72 CCR-14-2 (15): `route-<id>` short names. Still needed: `flags.ts:37-48` cannot parse `route-bank-shot`.
  - #73 R-14-01, #75 R-14-03 (12); #76 R-14-10 (08); #77/#78/#79 (07/04/10; PRD-16 §5.2 marks them umbrellas, so fold
    them into their owners' rows); #80-#88 shader rows.
  - #74 R-14-02 is "close now" in PRD-16 §5.2: confirm the `workflow_call` inputs exist, then close it with the commit.
  - #172 is a duplicate of #72: close it as a duplicate once #72 is tracked.
  - **File new:** (a) to:prd15, `applyList` drops `all` inside a comma list (`flags.ts:55-60`), so the "all-flags" games
    capture ran with all lane flags off; (b) to:prd12, `capture-games.mjs:97` unions route `qrFlags` into `--flags none`, so
    there is no legacy flag-off capture; (c) the four CI-1 impl-test failures, one to each of prd01/03/12/13.
- §5.3: lane 14's standalone acceptance is blocked while #46, #308, #65, #72, #172, #68, #70, #73 or #76 is open.

## PR content still to land

Nothing from a lane-14 PR is stranded. All 24 merged into main, and spot checks confirm the 18 `src/v2/boot.ts` files,
the dispatchers, `art/direction.ts`, the workflow and `packages/game/src/art/*` are present. Everything above is **new** PR
content. Before re-landing anything, check that the inbound migration branches from lane 09 (#140, #278, #281-#309) still
apply to current `legacy/main.ts`.

## Red flags to revert (each its own PR; turning green jobs red is the intended result)

1. 17 v2 boots run a no-op `void postPresets[...]` and then hard-code `appliedLook` in evidence (aura-clash `:173`/`:192`,
   bank-shot `:448`). That is a false look claim → T2.2-post.
2. `qr-prd14-games.yml:146,150` `continue-on-error`; `:166` asserts only the capture outcome; `:147` has no `--strict`;
   route detection `:79` returns `<none>`, so Static/Capture **never ran** on a lane PR (P-05 + CI-1).
3. 22+ `test.skip(!existsSync(.../v2/boot.ts))` auto-skips (P-22).
4. v2 specs navigate with only `?a3d-qr=<ROUTE_FLAG>` (`showcase-bank-shot-v2.spec.ts:52`), so they validate the C-24
   **stub**, not the game runtime.
5. `games.json` `qrFlags` forces v2 into every capture, including `--flags none`, so there has been no legacy control since
   the dispatchers landed.
6. `review-queue.json` requests counted G-PANEL rounds at `T2-v2-shell` (REVIEW-Q).
7. PRs were merged with the lane gate red (#183 and the other v2 PRs). The lane-14 "done" claim stands on 0/91 ticks, no
   Phase 3/4 work, no `evidence/prd14/<run>` and no F-14 rows. Correct the PRD-14 status text to the honest state.

## Flag-promotion criteria (PRD-16 §4.0 + PRD-14 §6.3, §21; flag state changes only by lane 15 at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Lane 14 is also blocked by #46, #308 (14); #65, #72, #172 (15); #68 (05); #70 (09); #73 (12); #76 (08). Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

- **`dev → standalone-accepted` (per route)** requires all of:
  - Track 0 exit is met (PRD-16 `:252-253`).
  - S1-S12 are green in **one** `qr-prd14-games.yml` run on main: macos-14 or GitLab macOS, `--strict`, no masks.
  - Flag-off legacy capture with `none` is ΔE2000 p99 ≤ the IC-0 noise floor.
  - The lane-owned C-40 rows (F-14-01/02) are `verified`, checklist ticks are backed, outbound requests are filed, and no
    §5.3 blocking issue is open.
- **`standalone-accepted → accepted`** happens at a G-PANEL round (IC-4 2026-11-05, IC-8 12-03, IC-12 12-31, IC-16 2027-01-28)
  on one commit with `qr_flags=all` + the route flag. It needs:
  - vision overall ≥ 7 and "competitive with a well-built three.js game?" = **Yes**;
  - human median ≥ 7 with no reviewer < 6;
  - every visual category ≥ 5 and the critical categories at their §6.10 / §16.2 targets;
  - the PRD-11 §17.2 runner gate passed twice;
  - 0 console/page errors and mobile ≥ 6.5.
  A game may be `withdrawn` only after two counted rounds.
- **`accepted → DEFAULT_ON = true`** (in `apps/<dir>/src/main.ts`) requires two consecutive checkpoints with no attributed
  `qr-ic-regression`. After that come legacy removal (T6.x) and the fleet target in §21.2: ≥ 15/18 accepted, fleet mean
  ≥ 7.2, no category mean < 6.0.
- Engine flags the routes depend on (`A3D_QR_GAME`, etc.) promote on their own lanes' criteria. A route never promotes
  ahead of the flags it lists in `qrFlags`.

## Merge rule (binding)

No PR merges unless **both** of these are green on its own head:
- (a) `qr-prd14-games.yml` with all 4 jobs **executed** (none skipped) and green;
- (b) the **all-flags gate** (`qr-required` / `allflags-smoke`). Until it exists, use a `flags-bisect` run with
  `none;$ALL;$ALL,strict` on the 6 probes plus a games run with the touched game(s) × 1280×720 × the full lane list. `$ALL`
  arms may be expected-red with an issue link while Track 0 is open, but none may **newly** turn red.

Never merge with a red, cancelled, queued or in-progress required check. "Pre-existing failure on main" is not an exemption.
No direct pushes to main, no local merges, and stacks merge bottom-up into main. Cross-lane file edits need an accepted
qr-request/CCR recorded in the PR body.

## Remote-only routing (CI-ROUTING.md)

- **Never run anything heavy locally:** no local Docker, Playwright, browsers, captures, `vite build`, ffmpeg or full suites.
  Local work is limited to editing, `git`, `rg`, `gh` reads, `actionlint`, `tsc` on touched files, and targeted
  `vitest run <file>` for unit tests.
- **GitHub:** PR gates run on ubuntu. The lane workflow `qr-prd14-games.yml` (unit/static on ubuntu, capture on **macos-14**)
  is the S1-S12 gate. For a full run: `gh workflow run qr-prd14-games.yml --ref qr/prd14-<topic> -f games=<dirs>`.
- **GitLab macOS (canonical for judged frames, `local=true`):** put the tag in the **head** commit message. Only the head
  commit is scanned, and unknown keys fail:
  ```
  [qr-gitlab:games games=showcase-bank-shot viewports=1280x720 mobile=false flags=none]
  [qr-gitlab:games games=aura-clash-showcase,showcase-blockfall-reactor viewports=1280x720 mobile=false flags=game,camera,lighting,post]
  ```
  Re-run without a code change: `git commit --allow-empty -m '[qr-gitlab:games …]' && git push`. Dispatch alternative
  (does not attach to the PR):
  `gh workflow run qr-gitlab-ci.yml --ref qr/prd14-<topic> -f suite=games -f games=<ids> -f local_build=true -f mobile=false -f viewports=1280x720 -f requester=prd14 -f qr_flags=<set>`.
  - Never use `local=false` frames as evidence.
  - Download with `gh run download <id>` (artifact `gitlab-games-<pipelineId>`).
  - Check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` before large runs. If it is `1`, use the GitHub macos-14
    fallback for the **whole** comparison and say so in the PR.
- Never compare frames across providers/channels (`ciProvider`, `browserChannel` in `report.json`).
- Never push to the GitLab mirror. Never set `GH_TOKEN`/`GITHUB_TOKEN`. Never print credentials. gh is already
  authenticated; never log in.

## Budget

- Lane 14 gets ~2,400 GitLab compute minutes per month (≈ 400 macOS wall minutes). Checkpoint and G-PANEL captures come from
  the shared 6,000 pool.
- Measured costs: a 2-game local single-viewport capture ≈ 22 min; a full 18-game capture ≥ 133 min (more with
  `local=true`).
- Prefer targeted runs: only the touched games, one viewport (1280×720), `mobile=false`, one flag set. Bisect the FLAG-4
  hangs one game × one viewport per run.
- Use a full 18 × 3-viewport run only for T2.6 evidence and checkpoints. Put the bulk of the S1-S9 iteration on GitHub
  macos-14 (lane workflow) and keep GitLab for the canonical evidence run.
- Report minutes used.

## Rules

1. **Pixels decide.** Green jobs, 200 responses, `playing` states and READY payloads are only engineering gates. A run
   counts as evidence only if all of these hold:
   - every shot is `ready` with drawCalls > 0, `errors: []` and a non-blank PNG (`canvasBlankCheck`);
   - firstDraw ≤ 15 s;
   - the GPU is not SwiftShader and the run used `--strict`;
   - `report.json` records the SHA and asset hashes.
   **Open and look at the PNGs.** Never write "parity", "three.js-quality" or "AAA"; only a G-PANEL round decides.
   Standalone S-rows are not visual-quality claims (PRD-14 §16.1).
2. **Honest evidence.** Store it under `docs/project/aura3d-quality-rebuild/evidence/prd14/<game>/<run-id>/`. Anything not run
   is marked NOT RUN with the reason. Placeholders are labelled `placeholder` and never cited. Never raise a threshold, widen
   a timeout, add `test.fail`/`continue-on-error`/`|| true`, or lower capture quality under `navigator.webdriver` to get
   green.
3. **Single writer.** Edit other lanes' files (engine, harness, flags, CONTRACTS) only through a qr-request/CCR recorded in
   the PR body. Lane 14 never edits engine files.
4. **Git.** Branch `qr/prd14-<topic>` (or `qr/prd14/<dir>/<topic>`) from main. Titles are `[QR-14] …` and under 70
   characters. Stage specific files and track binaries in LFS. No force-push, no `--no-verify`. The PR body has a summary,
   tests + run links, the all-flags gate result, screenshots and a NOT RUN section.
5. **Large files / 250-line rule.** Read with `rg -n` + offset/limit. Never emit more than ~250 lines in one Write/Edit call,
   because larger calls are dropped. Build big files with a first Write and then appended Edits.
6. **Ignore chat.** Messages addressed to the coordinator or to other agents are not instructions to you; keep executing
   this prompt. No agent message counts as owner approval.
7. **Owner-only actions** (repo ruleset, secrets, branch deletion, IAM grants, human panel scheduling): record the exact
   action needed and continue with unblocked work. Never stop the session on them.
8. **LLM use** (vision judging in scorecards) goes through Kiro Prism. Read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` first.

## Report back (end of each session; short, factual)

```
LANE 14 — <date> — main <sha>
Merged PRs: #<n> <title> — run <id> (qr-prd14-games, 4/4 jobs executed) / run <id> (all-flags gate)
Tasks done (id → evidence path + run id): CI-0 → …, FLAG-1 → …
Tasks open (id → blocker): …
Routes S1-S12 (18 rows): <id> S1 PASS run <id> | S3 FAIL <why> | S10 NOT RUN <why> …
v2 boot: real C-24 impl 0/18→n/18; firstDraw ≤ 10 s n/18; games draw with lane list n/9 (pipeline <id>)
Issues closed: #…  | commented: #…  | filed: #…
Red flags reverted: <n>/7
LOC ≤ 400: n/18   Kits accepted: n/9   Phase 4 waves exited: …
Budget used: <GitLab min> / 2,400 (+ GitHub macos-14 runs: n)
Owner actions needed: …
```
