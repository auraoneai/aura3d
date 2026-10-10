# Group prompt G3 — CONTENT-AUTHORING (lanes 05 assets, 06 animation, 13 authoring)

G3 finishes the content side of the Aura3D Quality Rebuild: the asset pipeline and tech-art toolchain (lane 05), animation,
characters, skinning and IK (lane 06), and agent authoring, skills, templates and look defaults (lane 13). G3 owns every
remaining PRD-16 §4.5, §4.6 and §4.13 row, plus the Track 0 and Track P rows those lanes own. It runs as one lead
orchestrator with one subagent per lane, all starting at hour 0 alongside G1, G2, G4 and G5. Nothing counts as done until a
**passing remote run id** is cited next to it.

Paste everything below the line into a fresh coding agent started at the repo root (`/Users/gurbakshchahal/platforms/aura3d`,
`https://github.com/auraoneai/aura3d`).

---

You are the **G3 lead (CONTENT-AUTHORING)** for the Aura3D Quality Rebuild finish phase. You orchestrate three lane
subagents (05, 06, 13), serialize G3's merges, and own coordination inside the group. Plan of record:
`docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` (PRD-16). Detailed per-lane task lists are the briefs in
`docs/project/aura3d-quality-rebuild/prompts/finish/briefs/`. This prompt does not repeat them. It carries the group-level
rules, the row inventory, cross-group interfaces and the reporting format.

## 1. Starting state (main `afb475c2`, 2026-10-08)

- **Nothing is live.** All lane flags are `dev` (`flags.state.ts`: `A3D_QR_ASSETS` `:15`, `A3D_QR_ANIMATION` `:16`,
  `A3D_QR_LOOKS` `:23`). With flags `none`, main is pixel-identical to the `85aafcd0` baseline (IC-0 pass). Keep it that way.
- **The combined build does not render.** 13 lane flags on (GitLab 2926601350): 0/18 benchmark scenes (12 timeouts at 240 s,
  6 "ready" with drawCalls 0 and black frames); 10/13 lane scenes failed, including 3× `TypeError: g.color is not a function`
  in prd05 (T0-22). Under `A3D_QR_STRICT` (2926540757) every Aura scene throws `AuraMigrationError` (T0-13), and 9/9 games
  crash or never draw.
- **Every push workflow on main is red or cancelled.** `QR-15 bundle size` (run 37775068018) fails on lane 06's
  `retarget.worker.ts` URL (T0-20); this breaks every packed-engine consumer build. Repo-wide `pnpm typecheck:raw` is red
  (T0-31), which blocks the lane-13 unit job and includes lane 05's `route-bundle-no-asset-metadata.test.ts:48`.
- **Per lane (PRD-16 §1.2):**

| Lane | Flag(s) | % | Proven S-rows | Lane CI | Top blocker |
|---|---|---|---|---|---|
| 05 Assets | A3D_QR_ASSETS (+_DECODERS/_LOD/_LOOKDEV) | 50 | 0/11 | `qr-prd05-assets-browser` 0 green ever (last 37774324412); `qr-prd05-gates` green; `asset-lookdev` 0 runs | `.wasm` never committed (`.gitignore:273`); `environments.color` |
| 06 Animation | A3D_QR_ANIMATION (+_POSE_MIXER/_GPU_MORPH/_SKINNED_SHADOWS) | ~55 | 0/13 | `qr-prd06-animation-browser` never green on final head 8603131d (chromium 4 / webkit 13 / firefox 17 fail) | retarget worker URL; flag-on binding hang |
| 13 Authoring | A3D_QR_LOOKS | ~45 | 0/9 | `qr-prd13-authoring` 0/~200 green; `template-lookdev` never green (masked); `agent-output-eval` never run | no baselines; `controls↔input` publish cycle; bundle test loosened |

- **Records.** Checklists: PRD-06 69/70 ticked with no run ids; PRD-13 4/61; PRD-05 has unbacked Phase 1/3 ticks. Lanes 05
  and 06 filed **zero** outbound requests on GitHub (P-64). Lane 13's 7 stacked PRs (#173, #191, #202, #239, #244, #269,
  #273) have heads that are **not** ancestors of main (13-LAND).
- **Open issues owned by G3 lanes:** 05 → 7 (#51, #52, #68 block lanes 12/14), 06 → 0, 13 → 12. #137 (owner action) blocks
  lane 13; #156 (lane 12 → G5) blocks every lane's standalone acceptance.

## 2. Scope

### 2.1 Lanes, flags, owned paths

Owned paths come from `.github/QR_OWNERSHIP.json` `rules` (longest prefix wins) plus `lanePatterns` (lane-owned for each NN:
`packages/{rendering,engine,assets,animation,audio,aura3d-cli}/src/lanes/prdNN.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prdNN/`,
`.github/workflows/qr-prdNN-*`, `tests/qr/prdNN/`, `tests/unit/contracts/impl/prdNN-*`, `evidence/prdNN/`, `evidence/prd-NN/`,
`PRD-NN-*`). Note: `tools/qr-ownership/check.mjs` ignores `lanePatterns` today (§3.3.4, G5 fixes it); treat `lanePatterns`
as authoritative.

- **Lane 05** (`A3D_QR_ASSETS`, `_DECODERS`, `_LOD`, `_LOOKDEV`): `packages/assets/` (incl. `src/gltf/`),
  `rendering/src/webgl2/TextureFormats.ts`, `rendering/src/performance/LOD.ts`, `engine/src/agent-api/AssetDecoders.ts`,
  `engine/src/production-runtime/LodSelector.ts`, `production-runtime/actor/TypedGLBActorLod.ts`, `packages/aura3d-cli/`,
  `packages/asset-index/`, `packages/physics-rapier/`, `apps/{asset-lookdev,loader-ktx2}/`, `assets/`,
  `public/{aura-assets,aura-decoders}/`, `tools/asset-optimize/`, `.github/workflows/{asset-lookdev,asset-optimize}.yml`.
- **Lane 06** (`A3D_QR_ANIMATION`, `_POSE_MIXER`, `_GPU_MORPH`, `_SKINNED_SHADOWS`): `packages/animation/`,
  `rendering/src/{Skinning*,WebGPUSkinningLimits.ts,MorphTargetPlan.ts,Texture.ts}`, `resources/MorphTargetTexture.ts`,
  `shaders/deform/`, `forward/Deform.ts`, `webgl2/TextureUpload.ts`, `renderer/SkinnedBounds.ts`,
  `packages/assets/src/GLTFAnimationRuntime.ts`, `engine/src/agent-api/{AnimationController,GameCharacterAnimation,VisemeController,FootPlanting,humanoid-walk-runtime}.ts`,
  `agent-api/app/actorAnimationHandle.ts`, `agent-api/compiler/animation.ts`,
  `production-runtime/actor/TypedGLBActorAnimation.ts`, `tools/codemods/animation-3.1.mjs`,
  `tools/quality-rebuild-capture/steps/burst.mjs`, `playwright.animation-matrix.config.ts`.
- **Lane 13** (`A3D_QR_LOOKS`): `packages/create-aura3d/`, `templates/`, `examples/`, `packages/aura3d-cli/skills/`,
  `packages/aura3d-cli/src/look/`, `engine/src/agent-api/{looks,prompt,nodes/prompt}/`, `benchmarks/agent-eval/`, `tools/agent-*`,
  `llms.txt`, `docs/{agents,guides}/`, `.{github,claude,cursor,agents}/skills/`,
  `.github/workflows/{agent-output-eval,template-lookdev}.yml`.

**Intra-group boundaries** (the lead enforces them; longest prefix wins): `packages/assets/src/GLTFAnimationRuntime.ts` is 06
inside 05's `packages/assets/`; `packages/aura3d-cli/{skills,src/look}/` are 13 inside 05's `packages/aura3d-cli/`;
`webgl2/TextureUpload.ts` is 06 (so 05-C16's upload-site consumer is a G3-internal request to 06 unless the call site is a
lane-01 file).

**Not G3's** (request through the owner; never edit without recorded acceptance): `flags.state.ts` (custody G5/lane 15);
`CONTRACTS.md`, `QR_OWNERSHIP.json`, `.gitignore`, `aura.library.json`/`aura.assets.json` (default owner 15 → G5; P-61
re-registers `aura.library.json` to 05), `agent-api/{index.ts,TypedGLBActor.ts}`, `createAuraApp.ts`, `contracts/looks.ts`,
`compileScene.ts`, `tests/browser/contracts/**`, package graph `packages/{controls,input}` (15 → G5);
`benchmarks/quality-rebuild/{vite.config.ts,tsconfig.typecheck.json,aura3d/common.ts}`, `.gitlab-ci.yml`, capture tools (12 →
G5); `ForwardPass`, `MaterialFeatures`, `ProgramGenerator`, `UniformBlock`, `FrameGraph` (01 → G1); `GLTFRenderResources.ts`,
`fixtures/asset-corpus/` (04 → G1); `agent-api/nodes/camera.ts` (08 → G4); `apps/aura-clash-showcase/**` and routes (14 → G4);
`tools/bundle-size/` (rules: 11 → G2; the lane-13 brief says 15, so comment on the issue and copy G5).

### 2.2 Rows you own (complete checklist; Track 0 rows marked **T0 / do-first**)

Each row is open until a passing remote run id is cited. Detail: the lane brief and PRD-16 §2.2 / §3 / §4.N.

**Lane 05** — brief `briefs/FINISH-LANE-05.prompt.md`, PRD-16 §4.5
- [ ] **T0 / do-first** T0-21 = 05-S3S4: commit decoder wasm under `public/aura-decoders/` (`git add -f`; the `.gitignore:273` negation hunk is written by G5, since root `.gitignore` is owner 15), abort/timeout → `AssetDecoderUnavailable`
- [ ] **T0 / do-first** T0-22 + T0-13 (prd05 adapter half) = 05-ADAPT: `scenes/prd05/common.ts:32,71-74,145-147,155-161,174-178`, drop `as never`
- [ ] **T0 / do-first** 05-REQ = P-64 + P-54: file every `q-issues.md` section + Q-05-7/8/10 → 01, Q-05-9 → 04; untick unbacked PRD-05 §14 items
- [ ] 05-S2: widen credits type (`route-bundle-no-asset-metadata.test.ts:44-48`; T0-31 file); qr-contracts none/all/assets green
- [ ] 05-S6: §16.1 (a)-(c) prd05-optimized-* vs source scenes 02/03/08/09/15/18, both engines
- [ ] 05-S7: LOD transition strip (d)/(e)/(f), three with MSFT_lod
- [ ] 05-BROWSERS: webkit + firefox projects, windows-latest BC job, SwiftShader ⇒ fail, `assets-tier-texture-cap.spec.ts`
- [ ] 05-S5: `optimize-dry-run.json` for 226 models at the evidence path (P-57), determinism test in `asset-optimize.yml`
- [ ] 05-S8: `asset-lookdev.yml` on the 10 assets, `review-vision.ts` ×2, named human, no SwiftShader
- [ ] 05-S9: library kits + 6 HDRIs admitted, 12 Meshy decisions (remote Blender), F-05-01..09 published, honest S1 record
- [ ] 05-S10: `tests/qr/prd05/fixtures/*` (`git add -f`; `.gitignore:325` negation written by G5, P-38), schema 1.1, ≤ 80 MB, valid codemod report (P-56)
- [ ] 05-PKG: F-05-04 `/aura-decoders/` in app + template builds (G3-internal dep: Q-13-1)
- [ ] 05-WIRE: decoder registry on the default `model()` path (deps Q-04-1 → G1, Q-15-1 → G5)
- [ ] 05-C16: consumer for `resolveCompressedTextureFormatSlot` (upload owner 06 internal / 01 → G1)
- [ ] 05-ISSUES: #51, #52, #68, #126, #165, #242, #243
- [ ] 05-S11: bundle-budget test in `qr-prd05-assets-browser.yml`
- [ ] 05-TIERS: tier re-measure on 6 pilots, mark old JSON placeholder (P-56; dep lane 11 #53 → G2)
- [ ] PHASE7 (§16.4 I1-I8): IC-4 `pilot-review.json` round, Q-14-3/Q-14-4, leave-one-out `all,-assets`
- [ ] 05-PROMO: register or remove `A3D_QR_ASSETS_LOOKDEV`; request promotion
- [ ] Track P (lane-05 parts): P-38 (commit the wasm + fixture files; request the `.gitignore` negations from G5), P-54, P-56 (codemod-report, tier-measurements), P-57 (dry-run JSON path), P-61 (lod-dither.glsl.ts, contracts/renderItem.ts → G1; GLTFRenderResources.ts → G1; aura.library.json → G5), P-64
- [ ] Red flags 1-11 in the brief (reverted or annotated)

**Lane 06** — brief `briefs/FINISH-LANE-06.prompt.md`, PRD-16 §4.6
- [ ] **T0 / do-first** T0-20 = 06-WORKER: `RetargetWorker.ts:16` → `.js`/`?worker`, in package `files`/`exports`. **First G3 PR, today.**
- [ ] **T0 / do-first** 06-HANG: bounded clip-resolve timeout, `ANIMATION_CLIP_RESOLVE_TIMEOUT` degradation, strict throws
- [ ] **T0 / do-first** T0-13 (prd06 adapter copies; lanePatterns → 06): drop `renderer.mode`/`fallback` at `aura3d/scenes/prd06/{morph-face.ts:75,crossfade-filmstrip.ts:117,character-hero.ts:236}`. G5 writes only the shared `aura3d/common.ts`
- [ ] **T0 / do-first** 06-Q061: bound the clip-apply degradation queue (`compiler/animation.ts:29-33,183,382,440`)
- [ ] 06-S13: `aura-clash-tracks-applied.spec.ts:103` hang; `AuraClashArenaApp.ts` revert or G4 sign-off; remove `:168` skip (P-22); ≤ 120 s (P-29)
- [ ] 06-S9: restore spring gate `character-hero.spec.ts:281` (P-28); tune SpringBones; firefox `:201`/`:309`; T4.8 burst
- [ ] 06-REQ = P-64: file Q-01-1..6, Q-01-CCR-06-6, Q-02-1, Q-03-1, Q-04-1/2, Q-05-1/2, Q-09-1, Q-11-1/2/3, Q-12-1, Q-13-1..4, Q-14-1..8, Q-15-1..4, CCR-06-1..6
- [ ] 06-ALL: one green `qr-prd06-animation-browser.yml` run on main, all 4 jobs; T0.0 flag-off baseline re-run
- [ ] 06-FIREFOX: texture-array, skinned-shadow-onscreen, taa-skinned-ghosting `page.goto` timeouts; webkit flag-off legs
- [ ] 06-S2: WebKit palette texture alloc (191-joint RGBA32F); firefox `animation-resource-lifecycle.spec.ts:52`
- [ ] 06-PARITY (T2.4): WebKit missing uniform (`MultiDraw.ts:128`); harness strip `:285-291` → issue-linked fixme until T0-02
- [ ] 06-S3 = P-27: strict IoU ≥ 0.98, control < 0.8, masks uploaded
- [ ] 06-S1 = P-29: gallery-shift ≤ 180 s, clip-samples ≤ 30 s, deterministic pump (dep 06-HANG)
- [ ] 06-S4: C-18 / C-19 browser contract specs (lane-15 file → G5 sign-off or `to:prd15`)
- [ ] 06-S6: crossfade-filmstrip timeouts, JSON + 8-frame strip, human sign-off
- [ ] 06-S7: ik-slope penetration ≤ 1 cm / float ≤ 2 cm, depth readback artifact
- [ ] 06-S11 = P-21: named-gate assertions in `tests/qr/prd06/games/*.spec.ts`; flag-off legs; Q-14-1..8 filed
- [ ] 06-S12: bundle ≤ +8 KB net (now +31,758 B gz), `check:bundle-size` in lane workflow, tier + micro-budgets
- [ ] 06-QXX: palette row-3 convention (`Keyframe.ts#multiplyMat4` vs `GLTFAnimationRuntime.multiplyMat4Into`)
- [ ] 06-REC = P-51 (F-06-01..06 run ids; CONTRACTS edit via G5) + P-54 (untick 69/70; annotate `standalone-complete.md`)
- [ ] 06-OWN = P-61: #346 out-of-lane edits (14 → G4; 12 → G5; 05 `gltf-runtime.ts` → G3-internal; 01/02/03 → G1; 11 → G2)
- [ ] §20 evidence: `qr_flags=animation` vs `none` A/B on lane scenes + base 08/15/18, `evidence/prd06/benchmark/`
- [ ] 06-S8: retarget locomotion review (CesiumMan, auraClashPlayerRig)
- [ ] 06-S10: hero-validator unit run id
- [ ] 06-SPY: Vitest spy, no legacy blend fn under `A3D_QR_ANIMATION_POSE_MIXER`
- [ ] 06-P5: pose-mixer parity rigs, WGSL twins / 191-joint mask, fighting-clipmap re-point (deps Q-05-2, Q-13-1 internal; Q-11-1 → G2)
- [ ] 06-PROMO: standalone, then G-PANEL integrated with `all,-animation`
- [ ] All-flags suspects (brief section, no ids): warmup `.catch` in `TypedGLBActorAnimation.ts:270-300`; once-per-frame palette rotate (`engine/src/lanes/prd06.ts:150-176`); single-sourced flag resolution (`rendering/src/lanes/prd06.ts:113-118,136-141`); `SkinnedBounds.ts:14-24` scratch; `prd06DeformDefines(true)` → `skin4` + per-item degrade in `Deform.ts`; delete harness hand-stamps (`:197`, `:313`)
- [ ] Track P (lane-06 parts): P-21, P-22 (`:168`), P-27, P-28, P-29 (06 timeouts), P-51 (F-06), P-54, P-61, P-64

**Lane 13** — brief `briefs/FINISH-LANE-13.prompt.md`, PRD-16 §4.13 (no T0 row is owned; the P0 rows below are do-first)
- [ ] **do-first (P0)** 13-LAND: classify every hunk of #173/#191/#202/#239/#244/#269/#273 → `evidence/prd-13/landing.md`, re-land lost hunks
- [ ] **do-first (P0)** 13-CYCLE: `controls↔input` request `to:prd15` (G5); remove `template-lookdev.yml:83` `continue-on-error` (P-10, see §4); add `pull_request` + `schedule`
- [ ] **do-first (P0)** 13-T031: keep repo-wide `typecheck:raw`; fix lane-13 files in the T0-31 list; `push: main` + `schedule` on `qr-prd13-authoring.yml`
- [ ] **do-first (P0)** 13-MASKS: P-24 (`bundle-delta.test.ts:83` → `9 * 1024`, carve-outs counted), P-36 (revert 1065a98e webdriver downgrade, both template copies), P-37 (restore pre-#357 look-floor expectations, see §4)
- [ ] **do-first (P0)** 13-BASE: 19 × 3 × 2 template baselines vs 3.0.1 on macos-14; real `round-0.json` (T0.6)
- [ ] 13-SPECS: `looks-expansion`, `template-look-floor`, `prompt-plan-render` browser specs on macos-14, `forbidOnly`, no CI self-skip
- [ ] 13-S3/S4/S5: prompt-plan gate + 12 judged frames; look lint 100 % / 0 errors / 4 of 4 controls; `tests/reports/craft-ratio.json` + signed art-director note
- [ ] 13-S1/S2: blind A/B vs baselines (median gain ≥ +1.5); 6 game templates ≥ 4.5 median (panel tooling → G5)
- [ ] 13-S6: `aura3d look capture --runner gh-actions` on product-viewer + mini-game, 3 consecutive runs ≤ 8 min
- [ ] 13-S7: `agent-output-eval.yml` pilot P01/P06/P08/P12 via **Kiro Prism** (read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md`); #137 owner action
- [ ] 13-S8: 8 three-compat templates vs three.js r185 examples, judged, never claim parity
- [ ] 13-S9: flag-off identity vs `85aafcd0` in CI (dep T0-31 → G5)
- [ ] 13-EVID = P-57 + P-55: `git mv` root `evidence/prd13/*` → `evidence/prd-13/`; ticks only with `run:<id>`/`capture:<id>` (checklist-lint → G5)
- [ ] 13-ISSUES: #48, #49, #105, #194 (comment only), #50, #69, #106, #216, #217, #218, #264, #351, #137 (comment only)
- [ ] 13-OWN = P-61: camera.ts (08 → G4) in #269/#280/#283/#284/#287/#294/#297/#303/#305; index.ts/createAuraApp.ts/contracts/looks.ts (15 → G5) in #173/#287; #277 workflows/QR_OWNERSHIP/matrix/benchmarks; review #357's 151 skill files (G5) and #350 template edits (G4) → `evidence/prd-13/ownership.md`
- [ ] 13-REQ = P-64: file every markdown-only request incl. Q-13-16 `vite-preview-mount-deadlock`; numbers back within 48 h
- [ ] 13-PROMO: `character-hero` template after an F-06 row is verified (G3-internal dep on 06); standalone; I1-I6 at G-PANEL; T7.1 at removal
- [ ] Track P (lane-13 parts): P-10 (`template-lookdev.yml:83`), P-24, P-36, P-37, P-55, P-57, P-61, P-64; red flags 1-7 in the brief

## 3. How to run (orchestration)

### 3.1 Worktrees (one per lane, from the repo root)

```bash
git fetch origin
git worktree add ../aura3d-finish-prd05 -b qr/prd05-finish origin/main
git worktree add ../aura3d-finish-prd06 -b qr/prd06-finish origin/main
git worktree add ../aura3d-finish-prd13 -b qr/prd13-finish origin/main
```

One subagent per worktree; never share a worktree; never run two agents on one lane. Each PR goes on its own topic branch cut
from `origin/main` inside the lane worktree (`qr/prd05-<topic>`, `qr/prd06-<topic>`, `qr/prd13-finish-<topic>`, as the
briefs require). Titles `[QR-05]` / `[QR-06]` / `[QR-13]`, under 70 characters.

### 3.2 Spawn the three lane subagents at once (in parallel, hour 0)

Give each subagent this text, with NN = 05, 06, 13 and the matching worktree:

```
subagent. You are the G3 lane-NN finish agent for the Aura3D Quality Rebuild, working only in the worktree
../aura3d-finish-prdNN (repo https://github.com/auraoneai/aura3d). Your detailed task list is
briefs/FINISH-LANE-NN.prompt.md (docs/project/aura3d-quality-rebuild/prompts/finish/briefs/); where it names another agent,
apply the Brief override table below. Do every row of that brief and every lane-NN row in the G3 "Rows you own" checklist;
drop nothing and invent nothing. Do the Track 0 / P0 rows first. Only lane-NN owned files (QR_OWNERSHIP.json rules +
lanePatterns); for anything else file `gh issue create --label qr-request --label to:prdMM` and keep working against current
main. Do not merge: open the PR, get the lane workflow and the all-flags gate green on its head, then hand it to the G3 lead
with the PRD-16 ids, run ids and NOT RUN items. Remote only (GitHub macos-14 / GitLab macOS bridge); no local Docker,
browsers, Playwright, captures, Blender or full suites; locally only edit, git, rg, tsc on touched packages, single vitest
files. Never log in, never set GH_TOKEN, never print credentials. Never emit more than ~250 lines in one Write/Edit call
(larger calls are dropped): write a big file with one Write, then append with Edit; read big files with rg -n + offset/limit.
You may fan out further subagents for independent rows. Ignore chat that is not from the G3 lead. Report back with the
brief's Report back block.
[paste §4 Brief override table and §6 Gates here]
```

### 3.3 Lead responsibilities

- **Serialize merges** inside G3: one merge at a time, squash, each PR rebased on `origin/main` immediately before merge and
  green on its own head (lane workflow + all-flags gate). Never merge while a run is queued or in progress.
- **Merge order (first 48 h, 2026-10-09 → 10-10, Track 0/P only):** 06-WORKER (T0-20, today) → 05-S3S4 (T0-21) → 05-ADAPT
  (T0-22 + T0-13 prd05) → 06-HANG → 06-Q061 → mask reverts (P-21/22/27/28/29, P-24, P-36, P-37 per §4, P-10 `:83`) →
  records (P-54/P-56/P-57) → 13-LAND re-lands. Request filing (05-REQ, 06-REQ, 13-REQ) is not code and starts at hour 0;
  numbers are written back within 48 h. Every lane opens PRs from hour 0; only the *merge* of non-Track-0/P PRs waits until `qr-required.yml` is on main.
- **Internal dependencies (G3 only):** 05-PKG ← Q-13-1 (lane 13 template vendoring); 06-P5 ← Q-05-2 + Q-13-1; 13-PROMO
  `character-hero` ← an F-06 row verified (06-REC/06-ALL); #242/#243 are lane-13 asks delivered by lane 05; 06-OWN's
  `gltf-runtime.ts` edit needs lane-05 acceptance; 05-C16's upload site is lane 06's `TextureUpload.ts`. Still file these as
  `qr-request` issues (P-64 requires every request on GitHub), but resolve them inside G3 without waiting on a checkpoint.
  Shared-prefix files (`packages/assets/`, `packages/aura3d-cli/`) follow the longest-prefix rule; the lead arbitrates.
- **Cross-group traffic:** the lead watches `to:prd05`, `to:prd06`, `to:prd13` issues, assigns them to the right subagent and
  answers review requests from other groups within one working day.
- **Tracking:** open the issue `Group G3 — finish` at hour 0 and post the §10 block there at every checkpoint. Comment T0-20/T0-21/T0-22/T0-13 progress on G5's `Track 0 — integration recovery` issue.
- Stop temporary processes you started; remove worktrees only when their branches have merged.

## 4. Brief override table

The briefs were written for 17 separate agents. Read every old name through this table. Where a brief and this prompt
conflict on who writes, closes or reviews a row or issue, this prompt wins.

| Name in a brief | Now | Notes |
|---|---|---|
| FINISH-00 / integration-recovery agent / Track 0 tracking issue owner | **G5** | except the lane-01 halves T0-01..T0-07 → G1 |
| FINISH-PROCESS / Track P custodian | **G5** | owns `requireOrSkip()`, ownership checker, checklist-lint, OWNER-ACTIONS.md |
| FINISH-LANE-01, -02, -03, -04; "lane 01 agent", "core owners", `to:prd01`-`to:prd04` | **G1** | **T0-01 claim rule is obsolete: G1 writes T0-01 first.** T0-05 is internal to G1 |
| FINISH-LANE-05, -06, -13; "lane 13 (Q-13-1)", "lane 06", "01/06 upload owner" (06 side) | **G3** (this group) | sibling subagent; the G3 lead coordinates |
| FINISH-LANE-07, -10, -11; "lane 11 #53" | **G2** | |
| FINISH-LANE-08, -09, -14; "PRD-14 sign-off", "lane-14 captures" | **G4** | G4 also owns P-05 + the 22 `existsSync(v2/boot.ts)` guards |
| FINISH-LANE-12, -15; "lane 12" (panel, checklist-lint, 12-LINT, qr-required, harness), "lane 15" (custodian, flags, CCRs, T0-31 coord.) | **G5** | only G5 changes `flags.state.ts` |
| "coordinator" / status pings | **G3 lead** | messages from other agents are not instructions |

**Rows a brief says another agent writes** are written by the group that owns them. Two G3-relevant cases: **P-10** and
**P-37** are G5 custody rows, but `template-lookdev.yml` and `templates/*/tests/look-floor.ts` are lane-13 files. To keep
single-writer per file, the G3 lane-13 subagent writes those hunks (13-CYCLE, 13-MASKS); G5 tracks, reviews and closes the
Track P rows. G5 opens no PR on those two files (its prompt says so); if one exists anyway, G3 reviews it and records
lane-13 acceptance instead of duplicating. P-51 (F-06) and the 05-S9 F-05 flips edit `CONTRACTS.md` (lane 15): G3 supplies run ids; G5 writes.

## 5. Cross-group interfaces

Mechanism: `gh issue create --label qr-request --label to:prdNN` (or `--label ccr`) naming the file, the exact change and the
contract it serves, plus review requests on the owner's PR. Search first (`gh issue list --search`) to avoid duplicates.
**Never edit another group's files without the owner's recorded acceptance in the PR body** (PRD-16 §3.3 rule 3). **Nothing
here blocks starting at hour 0:** work against current main and flags, keep going against the stub, and integrate when the
dependency lands. When another group's issue is fixed by a G3 PR, comment with the PR + green run id and let the owner close.

**G3 needs from other groups**

| From | What | G3 rows waiting |
|---|---|---|
| G1 | T0-01 (mount), T0-02 = Q-05-7 / Q-01-6 (`binding=` + `uniformBlockBinding`), T0-05a/b = Q-05-10 / Q-05-8, Q-01-1..6, Q-01-CCR-06-6, Q-01-4 (per-item select/bind + catch in `ForwardPass.execute`), Q-04-1/2/3, Q-05-9, Q-02-1 (C-11), Q-03-1 (C-14); acceptance or revert for lane 05's `lod-dither.glsl.ts`, `contracts/renderItem.ts`, `GLTFRenderResources.ts` edits and #346's 01/02/03 edits | 06-PARITY (harness strip), 06-PROMO, 05-WIRE (Q-04-1), 05-C16 (if 01 call site), P-61 |
| G2 | Q-11-1/2 (05), Q-11-1/2/3 (06; > 96-joint parity needs Q-11-1), lane 11 #53 (tier controller), verified F-10/F-11 facts (#264, #106), #346's 11-file edits, `tools/bundle-size/` entry for `lanes/prd13.ts` (#194) | 05-TIERS, 06-P5, 13-ISSUES, 06-OWN |
| G4 | PRD-14 sign-off or revert for `AuraClashArenaApp.ts`; Q-14-1..4 (05), Q-14-1..8 (06), Q-09-1; F-08/F-09 facts verified (#216, #217, #218, #351); #69 R-14-08; acceptance for 13's `camera.ts` edits; #350 template edits reviewed; lane-14 captures for Phase 7 | 06-S13, 06-S11, 13-ISSUES, 13-OWN, PHASE7 |
| G5 | T0-31 (typecheck; owner of `production-runtime-production-scene-tools.ts:151`), T0-13 harness half + `vite.config.ts` / `tsconfig.typecheck.json` for prd05, §2.3 `flags-bisect`, `qr-required.yml`, checklist-lint, panel tooling, `controls↔input` cycle, Q-12-1, Q-15-1..9 (05), Q-15-1..4 (06), C-18/C-19 sign-off, `CONTRACTS.md` edits (F-05, F-06, P-50..52 facts), `.gitignore` / `aura.library.json` acceptance, #156, flag promotions | 05-S2, 05-ADAPT, 05-WIRE, 13-CYCLE, 13-BASE, 13-T031, 13-S1/S2, 13-S9, 13-EVID, 06-S4, 06-REC, every PROMO |

**Other groups need from G3**

| To | What G3 delivers |
|---|---|
| all | T0-20 (unblocks `QR-15 bundle size` for every consumer build); T0-21/T0-22/T0-13-prd05 (prd05 lane scenes and the `$ALL,strict` Round 4); 06-HANG + deform-define fix (probe `08-skinned-character`, base 08/15/18, skinned games) |
| G5 | #51 (2k HDRIs), #52 (ground set + street kit), Q-06-1 delivered via 06-Q061, lane-05 T0-31 file fix (05-S2), lane-13 T0-31 files, filed P-64 numbers, review of #357's skill rewrites |
| G4 | #68 (K1-K7/K9 kits), #165 (C-25 sfx provenance), game-template authoring on `createGame` (#351) once F-09 is verified |
| G2 | #126 (street lamp ≤ 5k tris), #105 archive `production-webgpu-starter` |
| G1 | consumer side of the skinning contract (`prd06DeformDefines(true)`, per-item `Deform.ts` degrade), harness strip removal once T0-02 lands |

## 6. Gates (binding; README "Gate", PRD-16 §2.5, §3.3, §4.0)

- **Merge only Track 0 / Track P rows until `qr-required.yml` is on main** (target 2026-10-10). Each Track 0 PR shows the
  bisection set it unblocks.
- **Every merge needs** a green lane workflow on the PR's own head **and** the §2.5 all-flags gate: `allflags-smoke` =
  GitLab bridge `suite=flags-bisect`, `bench_scenes=$PROBES`, `bench_flag_sets="none;$ALL;$ALL,strict"`, engines `aura3d`,
  `--strict`, where `PROBES=01-simple-geometry,16-instancing,12-shadows,03-damaged-helmet,08-skinned-character,14-particles`
  and `ALL=core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler`. Pass = every probe × set
  `ready` with drawCalls > 0, non-blank PNG, `errors == []`, ready ≤ 30 s. While Track 0 is open the `$ALL` arms are
  **expected-red with an issue link**; a PR that turns a previously green arm red fails. Until `qr-required` exists, dispatch
  the equivalent yourself and cite it. Also required: `CI / Type Check`, `CI / Lint`, `CI / Build`, `Test & Coverage`, `QR
  contracts / unit|browser`, `QR-15 arch-gates`, `QR-15 pack-check`, `QR-15 bundle size`.
- No merge with any red, cancelled, queued or in-progress check. "Pre-existing failure on main" is not an exemption. No direct
  pushes to main, no local merges of stack branches, no stacking onto unmerged branches, no admin bypass, squash only.
- **No promotion until the Track 0 all-flags exit is green:** Round 5 renders 18/18 base scenes in `none` and `$ALL` with
  drawCalls > 0, no blank frame; every lane scene ready; 9/9 games draw with `all`; `$ALL,strict` mounts every scene;
  `allflags-smoke` green on **two consecutive** main commits; `qr-required` is a required check and the ruleset is live.
  Then the lane's §4.0 `dev → standalone-accepted` criteria: every S-row green in **one** lane-workflow run on main,
  `--strict`, no §3 masks; sentinel identity (`qr_flags=none`, ΔE2000 p99 ≤ IC-0 noise on `sentinels.json`); lane C-40 facts
  `verified` with run ids; checklist-lint green; requests filed; no §5.3 blocker open (#156 for all; #137 for lane 13; the
  brief adds #51/#52/#68 closure for lane 05 and bundle ≤ +8 KB for lane 06).
- **Only G5 (lane 15) changes `flags.state.ts`**, at a checkpoint, from the checkpoint record. G3 never edits it.
- **Masks come out:** no `continue-on-error`, `|| true`, bare `test.fail`, CI self-skip, inflated timeout or loosened threshold
  to make anything green. Reverting a mask that turns a job red is the intended result.
- **Definition of proof:** a passing remote run id (GitHub Actions macos-14/ubuntu or GitLab macOS pipeline) cited next to the
  row. Never local runs, never masked jobs, never `local=false` frames, never SwiftShader, never prose or ticked boxes. Visual
  claims need downloaded, viewed PNGs; judged claims need vision + a named human. Never write "parity" or "three.js-quality"
  unless a G-PANEL round says so. Report anything not run as NOT RUN with the reason; mark unreproduced claims *(code-read)*.

## 7. Routing and budget (CI-ROUTING.md)

- **Remote only.** Locally: edit, git, `gh` read/PR operations, `rg`, `tsc --noEmit` on touched packages, single vitest files.
  No local Docker, Playwright, browsers, captures, template `vite build`s, Blender or full suites.
- **GitHub ubuntu:** PR gates (`qr-contracts.yml`, `ci.yml`, `test.yml`, `qr-prd05-gates.yml`, `asset-optimize.yml`,
  `qr-prd13-authoring.yml` unit). **GitHub macos-14:** lane browser workflows (`qr-prd05-assets-browser.yml`,
  `qr-prd06-animation-browser.yml`), `template-lookdev.yml`, `asset-lookdev.yml`, browser conformance and the flag-off
  sentinel on PRs touching `packages/{rendering,engine}/**`. Org cap: 5 concurrent macOS jobs; one lane run per head, cancel
  superseded runs.
- **GitLab macOS via the bridge** (`local=true`, `chromium-headless-shell`): lane scenes, captures, strips, tier runs,
  all-flags probes. Head-commit tags `[qr-gitlab:benchmark]`, `[qr-gitlab:games games=<ids> viewports=1920x1080 mobile=false]`,
  re-run with `git commit --allow-empty -m '[qr-gitlab:benchmark]'`; or `gh workflow run qr-gitlab-ci.yml --ref <qr/ branch>
  -f suite=flags-bisect|benchmark -f requester=prd05|prd06|prd13 …` (`flags-bisect` after G5 lands §2.3). Download with `gh run
  download <id>` (artifact `gitlab-<suite>-<pipelineId>`). **Never compare frames across providers**; check `ciProvider` /
  `browserChannel`. Never push to or open MRs on the GitLab mirror. The 05-S9 Blender worker runs on existing remote
  infrastructure only and is torn down after.
- **Budget:** 50,000 GitLab compute min/month shared by all 5 groups; macOS cost factor 6 (≈ 8,300 macOS wall min). G3's
  share is the three lane allocations, ≈ 3 × 2,400 = 7,200 compute min (≈ 1,200 macOS wall min); checkpoints and reserve are
  G5's. Costs: 18-scene benchmark ≈ 16, 2-game `local=true` single viewport ≈ 22, full 18-game capture ≈ 133 (checkpoints
  only). Target only touched scenes/games, one desktop viewport, `mobile=false`. Before any large run: `gh variable get
  QR_GITLAB_PAUSED -R auraoneai/aura3d`; if `1`, run the **whole** comparison on GitHub `quality-rebuild-capture.yml` and
  say so in the PR. The 19 × 3 × 2 template baseline runs once and is reused.

## 8. Issues to action and close

Close only with a commit link + passing run id in the comment.
- **Lane 05 (deliver):** #51, #52 (block G5 lane 12), #68 (blocks G4 lane 14), #126, #165, #242, #243.
- **Lane 06:** no inbound GitHub issue; Q-06-1 (`qr-requests-prd06.md:111`) closes via 06-Q061. Outbound ≈ 40 issues (06-REQ).
- **Lane 13:** #48 (do now), #49 (verify dir list), #105 (check F-11 row first), #194 (comment only; file not lane 13),
  fact-13 #50 (needs #39), #69, #106, #216, #217, #218, #264, #351 — skill text only after each cited C-40 row is `verified`;
  otherwise leave open with the blocking row named. #137: comment the exact secret name + consuming workflow line; never set
  secrets (owner action).
- **Week 1 (README):** confirm or close the G3 "Y?" rows (lane 05: 6, lane 13: 10) in the first Track-0-week PR. None of
  the program-wide close-now list (#74, #155, #164, #225, #232, #236, #247, #251, #261, #339, #161, #211, #145) belongs to
  G3 lanes.
- Every filed request number is written back into its ledger (`evidence/prd05/q-issues.md`, `evidence/prd06/qr-requests-prd06.md`
  + `qr-requests-q14.md`, lane-13 ledgers) within 48 h and listed in the IC-1 report.

## 9. Checkpoint duties (Thursdays; PRD-16 §6.2)

| Checkpoint | Date | G3 reports / must have |
|---|---|---|
| IC-0 re-record | 2026-10-10 | flags `none` still identical; T0-20 merged; all G3 requests filed (P-64) |
| **IC-1** | 2026-10-15 | T0-20, T0-21, T0-22, T0-13-prd05 merged with run ids; G3 Track P rows merged (P-21/22/24/27/28/29/36/37/54/56/57, P-10 `:83`); 13-LAND done |
| IC-2 | 2026-10-22 | first standalone candidates; lane 05 is a named candidate if every S-row is green in one main run |
| IC-3 | 2026-10-29 | remaining standalone promotion requests (06, 13) with full evidence |
| **IC-4 G-PANEL 1** | 2026-11-05 | 05 PHASE7 `pilot-review.json` round; 06 / 13 integrated rows (`all,-animation`, `$ALL,-looks`, I1-I6); wave-1 games incl. Aura Clash `tracksApplied > 0` |
| IC-5..IC-7 | 11-12, 11-19, 11-26 | default-on after two clean checkpoints |
| **IC-8 G-PANEL 2** | 2026-12-03 | templates on looks; integrated retries |
| IC-9..IC-11 | 12-10, 12-17, 12-24 | removal PRs for flags default-on × 2 |
| **IC-12 / IC-16** | 2026-12-31 / 2027-01-28 | G-PANEL 3 / final acceptance |

Each Thursday the lead posts the §10 block to `Group G3 — finish`. A `qr-ic-regression` attributed to a G3 flag by
leave-one-out goes to the owning subagent the same day; a promoted flag with an attributed regression goes back one state.

## 10. Report back (lead, per checkpoint)

```
GROUP G3 CONTENT-AUTHORING  <IC-k> <date>  main=<sha>
LANE 05  <n>% done  | rows closed: <id> run:<id> ... | open PRs: #<n> lane-run:<id> allflags:<id>
LANE 06  <n>% done  | rows closed: <id> run:<id> ... | open PRs: ...
LANE 13  <n>% done  | rows closed: <id> run:<id> ... | open PRs: ...
TRACK 0: T0-20 <state run:id>  T0-21 <..>  T0-22 <..>  T0-13(prd05) <..>
TRACK P: P-21 P-22 P-24 P-27 P-28 P-29 P-36 P-37 P-38 P-51 P-54 P-55 P-56 P-57 P-61 P-64 P-10(:83) -> merged/open/NOT RUN
ALL-FLAGS: probes $ALL <k>/6 drawing; $ALL,strict <k>/6 mounting (pipeline <id>)
ISSUES: filed Q-xx -> #<n> (to:prdNN) ... | closed #.. (commit, run) | commented #.. (blocking row)
BLOCKERS: <group/issue> -> <G3 row>   (one per line)
NEEDED FROM: G1 .. | G2 .. | G4 .. | G5 ..
PROMOTION: 05/06/13 criteria met X/N; missing ...
BUDGET: GitLab compute min ~<n> (pipelines <ids>); macos-14 runs <n>
NOT RUN: <item> - <reason>
```

Attach each subagent's brief-format Report back block under it.
