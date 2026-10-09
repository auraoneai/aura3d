# Group prompt — G4 GAMES: lanes 08 (camera/game feel), 09 (shared game runtime), 14 (18-game rebuild)

Mission: you are the **lead orchestrator of group G4**. G4 finishes everything PRD-16 still lists for the game stack:
camera, controls and game feel (`A3D_QR_CAMERA`), the shared game runtime and route extraction (`A3D_QR_GAME`), and the
eighteen-game rebuild (18 × `A3D_QR_ROUTE_<ID>`). That covers the G4 Track 0 rows (T0-29, T0-30, the lane-08 half of
T0-32), the G4 Track P rows (P-05 with the 22 `existsSync(v2/boot.ts)` guards, P-22, P-25, P-38, P-53, P-54, P-55, P-61,
P-64), every §4.8 / §4.9 / §4.14 row and the issues those lanes own. You do not write the lane work yourself. You run one
subagent per lane in its own worktree, serialize merges inside the group, and own coordination between lanes 08, 09 and
14. G1, G2, G3 and G5 start at the same hour as you. Nothing below waits for them.

Paste everything below the line into a fresh coding agent started at the repo root (`/Users/gurbakshchahal/platforms/aura3d`).

---

You are the **G4 GAMES lead** for the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`, base `main` @
`afb475c2`, 2026-10-08). Plan of record: `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` (PRD-16).
Detailed per-lane task lists live in `docs/project/aura3d-quality-rebuild/prompts/finish/briefs/FINISH-LANE-{08,09,14}.prompt.md`.
Those briefs are binding for content. This prompt replaces only their coordination parts (agent names, claim rules,
budget split, report destination). A task is done only when a **passing remote run id** is cited next to it.

## 1. Starting state (PRD-16 §1, §4.8, §4.9, §4.14 and the three briefs)

- **Nothing is live.** All lane flags are `dev` (`packages/rendering/src/contracts/flags.state.ts:11-25`; camera `:18`,
  game `:19`). The 18 route flags have `DEFAULT_ON = false` in each `apps/*/src/main.ts` (e.g. `showcase-bank-shot/src/main.ts:8`).
  With flags `none`, main is pixel-identical to the 85aafcd0 baseline (IC-0 identity pass).
- **All-flags build does not render:** 0/18 benchmark scenes (GitLab 2926601350), **9/9 games crashed or never drew**
  (2926540757: aura-clash `TypeError ... reading 'mode'`, the other 8 `no-draw-timeout` then `Target page closed`;
  Turbo 404 on `styles.css`; Pulse `EFFECT_ZERO_PIXELS`). That games run actually had every engine flag off, because
  `flags.ts:55-58` `applyList` treats `all` only as the whole string. Strict mode: every scene throws `AuraMigrationError`.
- **Lane 08 (~40 %):** 7 PRs merged, all red. `qr-prd08-camera.yml` 0/34 green, never on main, ubuntu-only. 52/55
  frame-loop / fromspec-parity / codemod tests fail on main (53/194 lane-wide incl. camera-rigs-view R-5), because
  bf1789b0 re-pointed `@aura3d/engine` to `public/index.ts` (no `createFrameLoop`/`resolveCameraFrame`), and
  `.gitignore:325` hides the codemod fixtures. Proven S-rows 0/19. Checklist 100/101 ticked. Open issues owned: 1.
- **Lane 09 (~40 %; audit ~55 %):** 10 PRs merged, all red. `qr-prd09-game.yml` 0/106 green, no macos-14 browser job;
  run 37773104304: `unit` 6/156 fail, `all-routes-shadow` fails at `git am` on aura-clash. `qr-prd09-routes.yml` green only
  via `continue-on-error` at `:81,:86`. No §15 browser specs. 17/18 routes fail the ≤ 10 % evidence-LOC gate. Proven
  0/9. Checklist 95/96 ticked; PRD-09 still has diff3 markers. Open issues owned: 10.
- **Lane 14 (~25 %; audit 25-30 %):** 24 PRs merged. `qr-prd14-games.yml` 1/65 green; T1.x unit job red (8/866), Static
  and Capture jobs **always skipped** (`routes` logs `changed dirs: <none>`). Phase 3 kits and Phase 4 content not
  started; `apps/showcase-kits/` does not exist. `boot.ts ≤ 400 LOC` fails 13/18 per PRD-16 (14/18 by `wc -l` per the
  brief). 0/91 ticks, 0/12 S-rows, no `evidence/prd14/<run>`. Open issues owned: 37.
- **main is unprotected:** no ruleset, no required checks; 109/136 PRs since 10-05 merged with a failing check.

## 2. Scope

### 2.1 Lanes, flags, owned paths (`.github/QR_OWNERSHIP.json` rules + `lanePatterns`; longest prefix wins)

| Lane | Flag(s) | Owned paths (summary; verify with `node tools/qr-ownership/check.mjs`) |
|---|---|---|
| 08 | `A3D_QR_CAMERA` | `engine/src/agent-api/{camera,controls,feel,time,vehicle}/`, `CameraChoreographer.ts`, `FrameLoop.ts`, `GameCameraRigs.ts`, `GameFeel.ts`, `GameGenreKits.ts`, `GameRuntime.ts`, `GameSceneGeometryBindings.ts`, `PlatformerMotion.ts`, `VehicleChassis.ts`, `app/frameAlpha.ts`, `app/frameLoopDefaults.ts`, `nodes/camera.ts`; `packages/input/` (except `TouchLayouts.ts`); `physics/src/{Raycast,ScenePhysicsBridge}.ts`; `rendering/src/shaders/camera-fade.glsl.ts`; `scene/src/MathTypes.ts`; `benchmarks/quality-rebuild/motion/`; `tools/camera-cast-codemod/`; `tests/qr/prd08/`; 5 `tests/unit/engine/*` (fixed-step, rigs, feel, platformer, vehicle) |
| 09 | `A3D_QR_GAME` | `packages/game/` (except `src/art/`), `packages/audio/`, `engine/src/game/`, `GameAppRuntime.ts`, `app/createGameApp.ts`, `nodes/game/` (incl. `racingCamera.ts`), `input/src/TouchLayouts.ts`, `math/src/{Easing,Random}.ts`, `apps/common/`, `assets/packs/game-sfx-core/`, `eslint/qr/no-route-capture-flags.js`, `tools/showcase-library/`, `tools/quality-rebuild-capture/route-composition.mjs`, `tools/public-api-contract/`, `docs/.../migration/` |
| 14 | 18 × `A3D_QR_ROUTE_<ID>` | `apps/showcase-*`, `apps/aura-clash-showcase/`, `apps/world-war-x-showcase/`, `apps/showcase-kits/` (new), `packages/game/src/art/`, `tools/quality-rebuild-capture/games.json` (data only), `tools/quality-gate/src/scorecard.ts`, `tools/quality-gate/forms/`, `scripts/check-{art-direction,route-health}.mjs`, `docs/.../evidence/games-after/` |

Every lane also owns its `lanePatterns` paths (NN = 08, 09, 14): `packages/*/src/lanes/prdNN.ts`, `.github/workflows/qr-prdNN-*`,
`tests/qr/prdNN/`, `tests/unit/contracts/impl/prdNN-*`, `benchmarks/quality-rebuild/**/scenes/prdNN/`,
`docs/.../evidence/prdNN/` and `prd-NN/`, and its `PRD-NN-*` file. Not G4 (file a request): `createAuraApp.ts`,
`public/index.ts`, `agent-api/index.ts`, `contracts/flags.ts`, `stubs/game.ts`, `flags.state.ts`, `.gitignore`,
`CONTRACTS.md`, root `package.json`, `tools/bundle-size/` (G5 / lane 15); `capture-games.mjs`, `games.schema.json`,
`.gitlab-ci.yml`, `qr-gitlab-ci.yml`, the rest of `tools/quality-rebuild-capture/` and `tools/quality-gate/` (G5 / lane
12); `packages/create-aura3d/templates/**` (G3 / lane 13). Lane 14 never edits engine files (PRD-14 §2.2).

### 2.2 Rows you own (complete checklist; ids exactly as in PRD-16 and the briefs)

**Track 0 / do-first (merge-eligible before `qr-required` exists):**
- [ ] **T0-32** (lane-08 half) = 08-ALIAS: lane tests import `createFrameLoop`/`resolveCameraFrame` from `@aura3d/engine/lanes` (`lanes/prd08.ts`) or the leaf; frame-loop 8/8, fromspec-parity 40/40. Lane-15 half (re-export) is G5, only if C-22 wants it.
- [ ] **T0-30** (lane 09) = 09-BEACON (#54): `createGame.ts:220-227` reaches `playing` only after the first presented frame with drawCalls > 0; harness readiness in `capture-games.mjs` is G5's file (co-PR or C-33 request).
- [ ] **T0-29** (lane 14 game code) = 14-GAMES0 = FLAG-1, FLAG-2, FLAG-3, FLAG-4: 9/9 games draw at 1280×720 with `all` in < 15 s. Sourcemap build via `capture-games.mjs --build-only` + `build.sourcemap:true`; one game × one viewport per flag (§2.4 Games). The `capture-games.mjs` change and the per-flag games-loop runs are G5's half (lane 12/15); G4 writes the game code.
- [ ] **T0-31** (lane-14 side only): `tests/unit/engine/route-cue-maps.test.ts:21-28` fails on missing `apps/showcase-*/src/*-audio` modules. The test file resolves to owner 15, so **G5 writes the test repoint** (lane-15 CI-3, #161); G4 writes only any `apps/showcase-*` audio module that must be restored, and reviews G5's PR. G5 coordinates T0-31.

**Track P (merge-eligible before `qr-required`):**
- [ ] **P-05** (14): `qr-prd14-games.yml:146,150` `continue-on-error`, `:162-166` tests one outcome, `:147` no `--strict`; negative run id required.
- [ ] **P-22** (08/09/14 parts): delete or convert the **22 `test.skip(!existsSync(.../v2/boot.ts))` guards** in `tests/qr/prd14/browser/*.spec.ts` to G5's shared `requireOrSkip()`; prd09 `capture-divergence.spec.ts:114` vacuous skip; `forbidOnly: !!process.env.CI` + no-skipped-in-CI reporter in `tests/qr/prd{08,09,14}/playwright*.config.ts`.
- [ ] **P-25** (09) = 09-LAYOUT: `tests/browser/layout.spec.ts:29` desktop HUD ≤ 0.15, canvas ≥ 95 % (desktop) / ≥ 70 % (mobile), 1920×1080 + 390×844, banned tokens, `__AURA3D_GAME_TEST__` absent in prod.
- [ ] **P-38** (08 half): `git add -f tools/camera-cast-codemod/fixtures/style-{a,b}.ts`; request the `.gitignore` negation from G5 (lane-05 wasm half is G3).
- [ ] **P-52** (08 rows): F-08-2/F-08-5 → `proposed`, delete duplicate F-08 rows (`CONTRACTS.md:2868-2880`); G5 writes CONTRACTS, G4 sends the exact diff and fixes `evidence/prd08/facts.md:44/79` itself.
- [ ] **P-53** (09): PRD-09 diff3 markers `:1741`, `:1774` and duplicated Phase 2/3 blocks.
- [ ] **P-54** (08 + 09): PRD-08 untick I-7, C-14, P-6, Phase 5, S17; PRD-09 untick `:1701`, `:1721`, `:1738-1740`, `:1771-1773`, `:1792`, `:1795-1796`, `:1800`, `:1802`.
- [ ] **P-55** (14): PRD-14 0/91 ticks; tick only with `run:<id>`/`capture:<id>` once checklist-lint exists.
- [ ] **P-61** (G4 parts): #350 lane-09 edits to lane-13 templates, root `package.json`, `tools/finalize-dist/index.ts` (09-OWN); lane 14 accepts or reverts #346's `installTestDriver` move in `apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts`; lane 08 reviews #173/#269-#305 edits to `camera.ts`.
- [ ] **P-64** (08, 09, 14): file every markdown-only outbound request (`gh issue create --label qr-request --label to:prdNN`) and write the number back (e.g. `evidence/prd08/qr-requests.md`) within 48 h.
- [ ] Red-flag reverts named in the briefs: 09 routes `qr-prd09-routes.yml:81,86`; 14 T2.2-post (`void postPresets` + hard-coded `appliedLook`), 14 REVIEW-Q, the PRD-14 status text; 08 none in tests (keep it that way).

**Lane 08 — §4.8 (`A3D_QR_CAMERA`):**
- [ ] 08-ALIAS (= T0-32, above) · [ ] 08-FIX (S17 codemod 5/5, P-38; R-5 shoulder 1e-6 fixed in code) · [ ] 08-CI (S16: push/schedule/dispatch, widened paths, unit matrix `none`+`camera`, macos-14 `browser-gpu`, `motion-capture`, artifacts on `always()`, `workflow_call`)
- [ ] 08-LOOP (stop unconditional `app.onFrame`; `gameDirector.ts:153` time base) · [ ] 08-RIGCAST (rig-as-spec casts in `GameSceneGeometryBindings.ts:524-525,749-750` and 09-owned `nodes/game/racingCamera.ts:12-22`) · [ ] 08-POSE (`applyPose` reaches renderer; keep `mode`/`up`/`targetNode`)
- [ ] 08-REC (P-52, P-54, own PR first) · [ ] 08-SPEC (`camera-feel.spec.ts` S5/S6/S7/S8/S10/S14 + reduced motion; `camera-controller`, `platformer-accel`, `touch-device-prompts`, `feel-bus`, `feel-screenspace` unit files)
- [ ] 08-S1S3 (frame-pacing + interpolation, CSV) · [ ] 08-S5 (two fighters + bystander hit-stop) · [ ] 08-S9 (motion M1-M6, three r0.185.1 adapters, `prd08 motion-report`) · [ ] 08-S11/S12 (rail ≤ 5 %, drift spec) · [ ] 08-S15 (fade coverage; depends T0-02 from G1)
- [ ] 08-S18 (one `setListener` per presented frame) · [ ] 08-S19 (`tests/qr/prd08/bundle/` typical ≤ 15 KB, everything ≤ 24 KB, per-tier CPU/GPU/memory)
- [ ] 08-ISSUES (#76 framing on 8 rigs; CCRs #222/#223/#224/#226/#228/#229/#230 with G5; inbound needs from 09 and 03 tracked) · [ ] Phase evidence (`evidence/prd08/phase1..5.md`, IC-0 baseline, `devices.md`)
- [ ] 08-PROMO (S1-S19 in one run; `flags.state.ts:18` flipped by G5) · [ ] X-2 (delete `createGameCameraRig` aggregator after default-on) · [ ] I1-I12 (G-PANEL, `all,-camera`)

**Lane 09 — §4.9 (`A3D_QR_GAME`):**
- [ ] 09-CI (CI-unit: 6 failures of run 37773104304; CI-browser: macos-14 job, WebKit/Firefox, size-limit, triggers; `no-route-capture-flags.test.ts`) · [ ] 09-BEACON (= T0-30) · [ ] 09-REC (P-53, P-54) · [ ] Red-flag revert (routes)
- [ ] 09-SPECS (§15: `overlay-identity`, `fx-instances`, `audio-dsp`, `juice-pixels`, `hitstop`, `shell-flow`, `context-loss`, `touch`, `capture-parity`; `stepFrames` test hook) · [ ] T1 fixtures (`packages/game/fixtures/fighter`)
- [ ] 09-CONF (16.1-1 real C-24/C-25 stub+real suites, `impl/prd09-sound.test.ts`; P2 C-25 slot in `engine/src/lanes/prd09.ts`) · [ ] 09-LAYOUT (= P-25) · [ ] 09-P0 (T0.4 postPass, 18 non-null, `postpass.json`)
- [ ] 09-MIG (CI-shadow/Phase 5: regenerate 18 patch sets; 16.1-2 capture contract, UNKNOWN branches aura-clash 2/aurora 4/skyline 6, `--fail-on-any` = 0, `look-signature.json`; T5.8 18/18 ≤ 10 %; 16.1-5 synth cues → samples)
- [ ] 16.1-6 feel (juice-pixels, fx-instances, hitstop, overlay-identity on impact pilots) · [ ] Flag-on risk fixes 1-7 (brief section, each with a regression test) · [ ] Q-09-x inbound
- [ ] 09-HUMAN (16.1-7 loading ≥ 7, 16.1-5 sound ≥ 6, `review.md`) · [ ] 16.1-8 perf (`aura3d perf-report`, §17) · [ ] 16.1-9 / §20 evidence · [ ] §19 mobile (Device Farm via `auraone-production-operator` or recorded denial)
- [ ] 09-ISSUES (#111, #208, #209, #210, #211, #212, #213, #70, #66, #54, #228) · [ ] 09-OWN (P-61, #350 → #351) · [ ] 09-PROMO (`flags.state.ts:19` by G5) · [ ] Phase 6 removal (deprecated `game.*`) · [ ] §16.2 / §21 program (G-PANEL)

**Lane 14 — §4.14 (18 × `A3D_QR_ROUTE_<ID>`):**
- [ ] 14-CI = CI-0 (car-visuals import; route-cue-maps = review of G5's repoint, see T0-31 above), CI-1 (scope unit job; fix route detection `:79`; aggregator; 4 qr-requests), P-05, P-22 · [ ] 14-GAMES0 = FLAG-1..FLAG-4 (T0-29) · [ ] T2.2-post (real preset, runtime `appliedLook`)
- [ ] 14-S1..S9 = T1.10 (14 more dispatch specs + fixed v2 URLs), T2.3 (14 more framing specs), T2.6 (S1-S9 for 18/18 with `evidence/prd14/<game>/<run-id>/report.json`)
- [ ] 14-P0FIX = T1.12 (Courier context-loss #118, evidence strips, Gallery facing, Siege sliders + `setScene` #108, Neon camera, Rooftop `setMaterial`, Gravity `innerHTML`, Pulse `100dvh`, Mech single fetch, debug-text scans, skyline `lives.test.ts`, deep p50/readbacks)
- [ ] T1.13 (`games.json` `scenarios[]`/`hudSelectors[]`/`keyboardHintSelectors[]`/`captureContractMigrated`, #344 steps, #103 tiers, #308; `git mv` review-queue) · [ ] 14-KITS = T3.1-T3.4 (`apps/showcase-kits/`, K1-K9, look-dev, `kits.test.ts`)
- [ ] 14-CONTENT = T4.0-T4.x (wave 1 → IC-4, wave 2 → IC-8, waves 3/4 → IC-12) · [ ] S10-S12 · [ ] WEBKIT-FF (P2) · [ ] 14-LOC (18/18 `boot.ts` ≤ 400, pixel-identical before/after)
- [ ] 14-HANDOFF (#46/#308/#344/#103, #47, PRD-09 patch sets #278/#281-#302, PRD-11 #107-#110/#116-#122, PRD-08 #219-#221, PRD-10 #188/#265, #140/#306/#309)
- [ ] 14-REC = T1.15 (F-14-01/02 via G5) + P-55 + R-14-xx filing · [ ] REVIEW-Q · [ ] T5.1-T5.4 (scorecards per G-PANEL, #47) · [ ] 14-PROMO = T5/T6 (T6.1-T6.4 legacy removal per accepted game)

Rows G4 does **not** write: T0-01..T0-09, T0-15..T0-18, T0-24..T0-27 (G1); T0-33..T0-35 (G2); T0-20..T0-22, lane-05
T0-13 (G3); T0-10..T0-14, T0-19, T0-23, T0-28, T0-31 coordination, lane-15 T0-32 half, §2.3-§2.5, P-01 and the Track P
custody rows (G5). P-21, P-27..P-29 for prd06 game specs and P-36 (fighting-game template) are G3.

## 3. How to run (orchestration)

### 3.1 Hour 0 — lead setup (do these in parallel)

1. Open the group tracking issue **`Group G4 — finish`** (labels `qr-request`, `to:prd08`, `to:prd09`, `to:prd14`). Link
   the Track 0 and Track P tracking issues that G5 opens; comment there when a G4 T0/P row lands.
2. Create one worktree per lane from the repo root:
   ```bash
   git fetch origin
   git worktree add ../aura3d-finish-prd08 -b qr/prd08-finish origin/main
   git worktree add ../aura3d-finish-prd09 -b qr/prd09-finish origin/main
   git worktree add ../aura3d-finish-prd14 -b qr/prd14-finish origin/main
   ```
   One subagent per worktree; never share a worktree; never run two subagents on the same lane's files at once.
   PR branches are cut inside the lane's worktree as `qr/prdNN-<topic>` (lane 14 may use `qr/prd14/<dir>/<topic>`).
3. Spawn the three lane subagents **in parallel, at once**, with the text in §3.2. Do not wait for one to finish.

### 3.2 Exact subagent instruction (fill NN and the worktree path; one per lane: 08, 09, 14)

```text
subagent. You are the lane NN finish agent in group G4 GAMES of the Aura3D Quality Rebuild. Work only in the worktree
/Users/gurbakshchahal/platforms/aura3d-finish-prdNN (branch qr/prdNN-finish, cut PR branches qr/prdNN-<topic> from
origin/main). Your detailed task list is briefs/FINISH-LANE-NN.prompt.md
(docs/project/aura3d-quality-rebuild/prompts/finish/briefs/FINISH-LANE-NN.prompt.md); where it names another agent,
apply the Brief override table below. Brief override table: FINISH-00 lane-01 halves, FINISH-LANE-01..04 and lanes
01/02/03/04 -> G1; FINISH-LANE-07/10/11 and lanes 07/10/11 -> G2; FINISH-LANE-05/06/13 and lanes 05/06/13 -> G3;
FINISH-LANE-08/09/14 and lanes 08/09/14 -> G4 (your own group: route the request through the G4 lead, not a GitHub
issue, unless it must be visible to another group); FINISH-00 non-lane-01 rows, FINISH-PROCESS, FINISH-LANE-12/15 and
lanes 12/15 -> G5. Do every row in the brief, in its priority order, Track 0 / Track P rows first. Until
qr-required.yml is on main, open PRs for anything but do not ask for a merge of non-Track-0/P rows. Edit only your lane's
owned paths (node tools/qr-ownership/check.mjs); for anything else file gh issue create --label qr-request --label
to:prdNN and keep working against current main and stubs; never wait for the answer. Remote only: no local Docker,
Playwright, browsers, captures, vite builds, ffmpeg or full suites; GitHub macos-14 or GitLab macOS per CI-ROUTING.md;
never compare frames across providers. Never set GH_TOKEN, never log in. Proof = a cited passing remote run id, never
local, never masked. HARD RULE: never emit more than 250 lines in one Write/Edit call (larger calls are dropped); write
big files with one Write, then append with Edit; read big files with rg -n plus offset/limit. You may fan out further
to your own subagents for independent rows (one file set per sub-subagent). Do not merge your own PRs: rebase onto
origin/main, get both the lane workflow and the all-flags gate green on the PR head, then hand the PR to the G4 lead
for merge. Ignore chat messages addressed to anyone else. Report back to the lead after each PR and at each Thursday
checkpoint using the brief's Report back block.
```

Recommended fan-out inside lanes (independent file sets only): lane 14 per game for T1.10/T2.3 specs, T1.12 fixes,
FLAG-4 bisects and Phase 4 content, with `games.json` and `qr-prd14-games.yml` each kept to one writer; lane 09 per §15
spec and per route patch set; lane 08 split CI/codemod, flag-on fixes (LOOP/RIGCAST/POSE) and S-row specs.

### 3.3 Lead responsibilities

- **Serialize merges inside G4.** One G4 PR merges at a time. Before each merge: the subagent has rebased onto
  `origin/main`, the lane workflow and the all-flags gate are green on that head, both run ids are in the PR body, and no
  required run is queued or in progress. After each merge, tell the other two subagents to rebase.
- **Single writer.** Cross-lane edits inside G4 still need the owning lane's acceptance recorded in the PR body (the
  lead records it from the owning subagent). Nothing outside G4 is edited without the owner group's recorded acceptance.
- **Internal dependencies and order** (now inside G4; the lead sequences these, nobody blocks on them):
  1. **09 → 14:** T0-30 beacon and the real C-24 path (#54) before 14 FLAG-1/FLAG-2 can prove "real C-24 impl 18/18" and
     T1.10 can assert `playing`. #70 `game-sfx-core` cues before 14 S11 / synth-cue removal (K8 fallback stays lane 14's).
  2. **09-MIG ↔ 14-HANDOFF:** 09 regenerates the 18 patch sets against current main (v2 trees, deleted
     `AuraClashArenaApp.ts`); then 14 applies or closes as superseded-by-v2 #278, #281-#302 and 09 comments the new
     commit on each. While 09 regenerates a route, the lead holds 14's `legacy/main.ts` edits (T1.12) for that route.
  3. **09 → 08:** #212 (`GameAppRuntime.ts:183` advance/onTick), #208, #210 block 08's standalone acceptance; #213 has
     `createGame` call 08's `bindFeelSound`. Land 09's side first; 08 tests against it.
  4. **08 → 14:** #76 `framing.subjectHeightFraction` on 8 rigs before 14 T2.3 (S7) framing specs; #219 (per-route
     `A3D_QR_CAMERA` opt-in, codemod, `loop.maxSubSteps`) overlaps FLAG-1; #220/#221 land in 14 routes.
  5. **08-RIGCAST** edits 09-owned `nodes/game/racingCamera.ts`: the 09 subagent writes that hunk or accepts 08's in the PR.
  6. **14 FLAG-1..3 before FLAG-4** bisects; 08-LOOP/08-RIGCAST/08-POSE and 09 flag-on risks 4-6 are the in-group
     suspects for the no-draw hangs; run `flags=camera` / `flags=game` single-flag game arms to attribute.
  7. CCR sign-offs: #229, #230 (08 → 14 decides, #230 also to:prd15); #228 (08 with 09 and G5).
  8. 08-S5 two-fighter harness and 09 `packages/game/fixtures/fighter`: reuse one fixture if both lanes accept.
- Keep the G4 GitLab spend inside budget (§7) and post the checkpoint report (§9).

## 4. Brief override table

| Name used in the briefs | Now |
|---|---|
| FINISH-00 / "Track 0 agent", lane-01 halves (T0-01..T0-07) | **G1**. The T0-01 claim rule (draft PR on `qr/prd01-t0-01-msaa-mount` within 15 min) is **obsolete**: G1 writes T0-01 first. T0-05 is internal to G1. |
| FINISH-00, everything else (T0-10..T0-14, T0-19, T0-23, T0-28, T0-31, lane-15 T0-32, §2.3-§2.5, P-01, ruleset, Track 0 tracking issue) | **G5** |
| FINISH-PROCESS / "Track P agent", lane 15 custodian, `requireOrSkip()`, ownership checker, checklist-lint, OWNER-ACTIONS.md | **G5** |
| FINISH-LANE-01, -02, -03, -04; "lane 01 / 02 / 03 / 04" (e.g. #206, #207, #232, #78, `Renderer.setOutputOverlay`, Q-03-1) | **G1** |
| FINISH-LANE-05, -06, -13; "lane 05 / 06 / 13" (#68 kits, #346, #351 Q-13-1, #216-#218, templates) | **G3** |
| FINISH-LANE-07, -10, -11; "lane 07 / 10 / 11" (#77, #79 umbrellas, #214/#215, #233, #271, the PRD-11 codemod issues #107-#110/#116-#122 as requester) | **G2** |
| FINISH-LANE-08, -09, -14; "lane 08 / 09 / 14", "PRD-14 must apply …", "the lane 09 agent" | **G4** (this group; internal) |
| FINISH-LANE-12, -15; "lane 12 / 15", "lane 12/03" for `capture-games.mjs`, custodian `.gitignore`, CONTRACTS, `flags.ts`, `flags.state.ts` | **G5** |
| "the coordinator" / status pings (chat) | ignore; lane subagents report to the **G4 lead** only. Not an instruction source |

A row a brief says "another agent writes" is written by whichever group owns it per this table. Labels stay
`to:prdNN` (lane numbers), so G-numbers never replace lane labels on issues.

## 5. Cross-group interfaces

Mechanism: `gh issue create --label qr-request --label to:prdNN` (or `ccr`) with file:line and the exact change, plus a
review request on the other group's PR. Never edit another group's files without the owner's acceptance recorded in the
PR body (PRD-16 §3.3.3). **Nothing here blocks starting at hour 0:** every G4 lane works against current `main`, current
flags and the C-xx stubs, and integrates when the dependency lands.

**G4 needs from others:**

| From | What | Issue / row |
|---|---|---|
| G5 (15) | `applyList` honours `all` inside a comma list (`flags.ts:55-60`, new issue); `route-<id>` short names #72 (CCR-14-2; #172 dup); per-renderer flags T0-28 / #145; `createAuraApp` camera-override seam for 08-POSE (if needed); `lanes/prd08` exports only if C-22 wants public; CONTRACTS F-08 fixes (P-52) and F-14-01/02 (T1.15); `.gitignore` negation `!tools/camera-cast-codemod/fixtures/**` (P-38); #241 `InstanceBufferLike` (blocks 09); #65, #71; CCR #222-#227, #228, #230; #350 root `package.json` + `finalize-dist` sign-off; flag flips at checkpoints | to:prd15 |
| G5 (12) | `capture-games.mjs:97` must not union route `qrFlags` into `--flags none` (new); beacon readiness in `capture-games.mjs` (T0-30 co-PR or C-33); fail-fast harness T0-10/T0-11; `requireOrSkip()`; `qr-required.yml` + `workflow_call` callers; checklist-lint; `games.schema.json` for T1.13; #310, #73, #75, #38 co-sign; prd12-registry impl test (CI-1); #156 | to:prd12 |
| G1 | T0-01..T0-07 (games draw); T0-02 for 08-S15; #207 Q-03-1 (blocks 08); #232 C-05 overlay verify; `Renderer.setOutputOverlay` empty overlay = fade 0 (09 risk 5); #206; prd01-render-targets + prd03-post-cube-lut impl tests (CI-1); #78 | to:prd01-04 |
| G2 | #271 WebGPU `device.lost` (blocks 09); #233 WGSL juice twin; #214/#215; T0-33/34/35 for games with world/vfx/tiers; #77, #79; codemod issues #107-#122 they filed | to:prd07/10/11 |
| G3 | #68 kit library hosting (blocks 14, staging unblocked); #351 Q-13-1 templates ride `createGame`; fighting-game hitbox overlay (Q-13) for 09 CI-unit; #350 template-hunk sign-off; #216-#218; prd13-looks impl test (CI-1); T0-20 retarget worker (bundle build); #346 author for P-61 | to:prd05/06/13 |

**Others need from G4:** G2 lane 11 needs #111 (`GameAppRuntime.ts:145` passes `app.quality`) and #103 tier variants;
G5 lane 12 needs #46, #308, #344 `games.json` fields and the T0-30 beacon for readiness; G5 lane 15 needs F-14 rows,
CCR reviews (#228-#230) and T0-29 game attribution; G3 lane 06 needs lane 14's decision on #346; G3 lane 13 needs #351
answered and 09's `createGame` shape; every group needs T0-29 (9/9 games) for the Track 0 exit.

## 6. Gates (README "Gate" + PRD-16 §2.5, §3.3, §4.0, §7.1; binding)

1. **Merge only Track 0/P rows until `qr-required.yml` is on `main`** (target 2026-10-10). For G4 that is T0-29
   (FLAG-1..4), T0-30, T0-32, the lane-14 T0-31 audio modules, P-05, P-22, P-25, P-38, P-52, P-53, P-54, P-55, P-61, P-64, the
   red-flag reverts, and the brief-listed lane-08 set (T0-32, 08-FIX, 08-CI, 08-LOOP, 08-RIGCAST, 08-POSE, 08-REC).
2. **Every merge** needs, green on its own head and cited in the PR body: the lane workflow (`qr-prd08-camera.yml` unit
   `none`+`camera` and browser-gpu; `qr-prd09-game` plus `qr-prd09-routes` when routes/patches change; `qr-prd14-games.yml`
   with all 4 jobs **executed**) **and** `qr-required / qr-required` incl. `allflags-smoke` (`flags-bisect`, `$PROBES`,
   `none;$ALL;$ALL,strict`, `--strict`). Until `qr-required` exists: a `flags-bisect` run with those sets plus, for
   lane 14, a games run with the touched game(s) × 1280×720 × the full lane list. While Track 0 is open, `$ALL` arms may be
   **expected-red with an issue link**; a PR that turns a previously green arm red fails and is reverted. Also green:
   `CI / Type Check`, `Lint`, `Build`, `Test & Coverage`, `QR contracts unit+browser`, and the macos-14 flag-off sentinel
   check when `packages/engine/**` or `packages/rendering/**` is touched. Never merge red, cancelled, queued or in-progress.
   "Pre-existing failure on main" is no exemption. No direct pushes, no local merges, stacks merge bottom-up into main.
3. **No promotion until the Track 0 all-flags exit is green:** Round 5 18/18 base scenes in `none` and `$ALL` (drawCalls
   > 0, no blank, ready ≤ 30 s), every lane scene `ready`, **9/9 games draw with `all`**, `$ALL,strict` mounts every scene,
   `allflags-smoke` green on two consecutive main commits; `qr-required` required and the ruleset live (owner action).
   Then each lane's §4.0 criteria (one-run S-rows `--strict`, sentinel identity ΔE2000 p99 ≤ IC-0 noise, C-40 facts
   `verified`, checklist-lint green, requests filed, no open §5.3 blocker: #156 for all; 08: #207, #208, #210, #212; 09:
   #241, #271, #310; 14: #46, #308, #65, #72, #172, #68, #70, #73, #76). Routes never promote ahead of the engine flags in
   their `qrFlags`; premature asks are withdrawn (P-58).
4. **Only G5 / lane 15 changes `flags.state.ts`**, at a checkpoint, from `evidence/prdNN/checkpoints/IC-<k>.md`. G4 files
   the flip as `qr-request to:prd15` with the run id (`evidence/prd08/promotion.md` etc.). Route `DEFAULT_ON` in
   `apps/<dir>/src/main.ts` flips only after G-PANEL acceptance and two clean checkpoints; `REMOVED_QR_FLAGS` is G5's.
5. **Masks come out and stay out:** no `continue-on-error`, `|| true`, `test.fail`, self-skip, `exit 0` on empty globs,
   widened timeouts/tolerances, or lowered capture quality under `navigator.webdriver`. Turning a green job red is the
   intended result.
6. **Definition of proof:** a cited passing **remote** run id (GitHub macos-14 or GitLab macOS) with every arm `ready`,
   drawCalls > 0, `errors: []`, non-blank PNG, ready ≤ 30 s (bench) / firstDraw ≤ 15 s (games), not SwiftShader,
   `--strict`, SHA + asset hashes in `report.json`. Never local, never masked, never `local=false` frames. Evidence goes to
   `docs/project/aura3d-quality-rebuild/evidence/prdNN/<run-id>/` (lane 14: `evidence/prd14/<game>/<run-id>/`). Open the
   PNGs; only G-PANEL decides "quality" or "parity". Unrun items are reported NOT RUN with the reason.

## 7. Routing and budget (CI-ROUTING.md)

- **Remote only.** On the Mac: editing, git, `rg`, `gh`, `actionlint`, `tsc` on touched files, one targeted `vitest run
  <file>`. No local Docker, Playwright, browsers, captures, `vite build`, ffmpeg or full suites.
- **GitHub:** PR gates on ubuntu; browser-gpu, conformance and sentinel on `macos-14` (full Chromium, new headless; org
  cap 5 macOS jobs at once, so keep heavy capture off it). Lane runs: `gh workflow run qr-prd14-games.yml --ref
  qr/prd14-<topic> -f games=<dirs>`.
- **GitLab macOS (canonical for judged frames, `local=true`, `chromium-headless-shell`):** tag the **head** commit, e.g.
  `[qr-gitlab:games games=showcase-bank-shot viewports=1280x720 mobile=false flags=none]`, `[qr-gitlab:benchmark
  flags=camera]`; re-run with `git commit --allow-empty -m '[qr-gitlab:…]' && git push`. Or dispatch (does not attach
  to the PR): `gh workflow run qr-gitlab-ci.yml --ref qr/prdNN-<topic> -f suite=games -f games=<ids> -f local_build=true
  -f mobile=false -f viewports=1280x720 -f requester=prdNN -f qr_flags=<set>` or `-f suite=flags-bisect … -f
  bench_flag_sets='none;camera'`. Unknown tag keys fail. Never compare frames across providers (`ciProvider`,
  `browserChannel`). Never push to the GitLab mirror.
- **Budget:** 50,000 GitLab compute min/month shared by all 5 groups; macOS cost factor **6** (≈ 8,300 macOS wall
  min). G4's share is the three lane allocations, 3 × 2,400 = **7,200 compute min (≈ 1,200 macOS wall min)**;
  checkpoint/G-PANEL captures come from the shared 6,000 pool run by G5. Costs: 2-game single-viewport ≈ 22 min,
  18-game run ≈ 133 min (more with `local=true`), 18-scene benchmark ≈ 16 min. Run only touched games, one viewport,
  `mobile=false`, one flag set; bisect FLAG-4 one game × one viewport per run; full 18 × 3-viewport only for T2.6 and
  checkpoints; iterate S1-S9 on GitHub macos-14. Check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` before
  large runs; if `1`, use the GitHub `quality-rebuild-capture.yml` fallback for the whole comparison and say so.

## 8. Issues to action and close (G4 lanes; briefs + README week-1 list + PRD-16 §5)

- **Week 1 close:** #211 (09: verify 176 Hz cue gone, close). **Review only (another group closes):** #74 (14 confirms
  the `workflow_call` inputs in a comment; G5 lane 12 closes); #232 (09 verifies with overlay-identity and comments; G1
  closes); #172 → dup of #72 (G5 closes); #77/#78/#79 umbrellas (G2/G1 close). **Track 0 blocker:** #54 (T0-30).
- **Lane 08 inbound:** #76. **Outbound (track, close if satisfied):** #206; #207; #208-#213 (now internal, close with 09);
  #214, #215; #216-#218; #219-#221 (internal, 14 applies); #222-#227; CCRs #228, #229, #230.
- **Lane 09 inbound:** #54, #111, #208, #209, #210, #211, #212, #213, #228 (with G5), #70, #66. **Outbound:** #232,
  #233, #241, #271, #310, #351. **Q-14-1 handoffs to comment after 09-MIG:** #278, #281, #282, #285, #288, #290, #291,
  #293, #295, #296, #299, #300, #302.
- **Lane 14 (37 addressed):** P0 #308, #46, #219; harness #344, #103; per-route #140, #306, #309, #281, #278, #265;
  PRD-09 migrations #282, #285, #288, #290, #291, #293, #295, #296, #299, #300, #302; PRD-11 #107, #108, #109, #110, #116,
  #117, #118, #119, #120, #121, #122; PRD-08 #220, #221; sign-off #229, #230, #38 and #346 (P-61); verify-then-close #47;
  informational #188. **Outbound:** #65-#71, #72, #73, #75, #76 (internal), #77/#78/#79, #80-#88. **File new:** to:prd15
  `applyList`; to:prd12 `capture-games.mjs:97` union; the four CI-1 impl-test failures (prd01, prd03, prd12, prd13).
- Every "Y?" issue of lanes 08/09/14 is confirmed or closed in that lane's first Track-0-week PR. Close only with a
  commit plus a run id in the closing comment.

## 9. Checkpoint duties (Thursdays, PRD-16 §6.2)

| Checkpoint | Date | G4 deliverable |
|---|---|---|
| IC-0 re-record | 2026-10-10 | 08 records the flag-`none` lane-scene baseline; 14 legacy flag-off variant exists (FLAG-2) |
| **IC-1** | 2026-10-15 | T0-29/T0-30/T0-32 landed (9/9 games draw with `all` is part of Track 0 exit); G4 Track P rows merged; lane workflows real; P-64 filed |
| IC-2 / IC-3 | 10-22 / 10-29 | S-row runs; 14 T2.6 S1-S9 for 18; kits staged. G4 lanes are not in the IC-2 candidate list |
| **IC-4 G-PANEL 1** | 2026-11-05 | wave 1 (Bank Shot, Turbo Drift, Aura Clash, Orbital Defense) first counted review with Phase 4 exit evidence; 08 I1-I12 and 09 §16.2 first evaluable; T5.x scorecards |
| IC-5..IC-7 | 11-12, 11-19, 11-26 | default-on clocks for promoted flags |
| **IC-8 G-PANEL 2** | 2026-12-03 | wave 2 (Vault, Rooftop, Courier, Neon, Pulse, Siege) |
| IC-9..IC-11 | 12-10, 12-17, 12-24 | removals (X-2, Phase 6 `game.*`, T6.x legacy) for flags default-on × 2 |
| **IC-12 G-PANEL 3** | 2026-12-31 | waves 3 + 4 (Patrol, Aurora, Gravity, Deep, Skyline, Blockfall, Mech, Gallery) |
| **IC-16 G-PANEL final** | 2027-01-28 | 18 games ≥ 7 or withdrawn (after two counted rounds) |

Each Thursday: collect the three lane Report-back blocks, then post the group block (§10) to `Group G4 — finish` with
run ids; unreproduced claims are marked *(code-read)*. Regressions that leave-one-out names on `camera`, `game` or a
route come back as `qr-ic-regression` + `to:prdNN`; a promoted flag with an attributed regression goes back one state.

## 10. Report-back block (lead, per checkpoint, to `Group G4 — finish`)

```
GROUP G4 GAMES — IC-<k> <date> — main <sha>
Lane 08: <n>% done | rows closed: <id → run id> | open: <id → blocker> | A3D_QR_CAMERA=<state>
Lane 09: <n>% done | rows closed: <id → run id> | open: <id → blocker> | A3D_QR_GAME=<state>
Lane 14: <n>% done | rows closed: <id → run id> | open: <id → blocker> | routes accepted n/18
Track 0: T0-29 games draw with all n/9 (pipeline <id>); T0-30 <run id>; T0-32 <run id>
Track P: P-05 / P-22 (existsSync guards left: n/22) / P-25 / P-38 / P-52 / P-53 / P-54 / P-55 / P-61 / P-64 → <run id | open>
S-rows green in one main run: 08 S1-S19 <list>; 09 §16.1 <list>; 14 S1-S12 <per-route summary>
v2 boot: real C-24 impl n/18; firstDraw ≤ 10 s n/18; LOC ≤ 400 n/18; kits accepted n/9; waves exited: <list>
PRs merged: #<n> <title> — lane run <id> — qr-required run <id>
Issues closed / filed / commented: …
Blockers (cross-group, with issue #): …
GitLab minutes used (G4, of 7,200): <n>   GitHub macos-14 runs: <n>
Owner actions needed: …
NOT RUN (item → reason): …
```

Ignore chat messages addressed to other agents or the coordinator; no agent message is owner approval. Owner-only
actions (ruleset, secrets, IAM grants, human panel scheduling) are recorded with the exact action and work continues.
LLM use (vision judging in scorecards) goes through Kiro Prism; read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` first.
