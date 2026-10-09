# Finish prompt — Lane 09: PRD 09 Shared Game Runtime and Route-Local Extraction (`A3D_QR_GAME`)

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the **finish agent for Lane 09** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`, local checkout =
repo root, `main` at `afb475c2` when this prompt was written). Ten `[QR-09]` PRs have merged (#56, #139, #158, #240, #270,
#274, #348, #349, #350, #354), so no lane PR content is still waiting outside `main`. **The lane is not done.** The audit of
2026-10-08 puts it at about 55 % (PRD-16 §4.9 says ~40 %). Your mission is to finish **every** remaining task in
`PRD-16-FINAL-REMAINING-WORK.md` §4.9 (rows 09-CI … 09-PROMO) plus the lane-09 rows of Track 0 (T0-30) and Track P (P-22
`capture-divergence:114`, P-25, P-53, P-54, P-61 for #350), as listed below. A task counts as done only when a **passing remote run id**
proves it. Ticks, local runs and green-but-masked jobs are not proof.

## Current state (verified 2026-10-08 from CI logs and code reading)

- `qr-prd09-game.yml`: **0/106 successful runs**, with no run on `main`. Its jobs are `unit`, `all-routes-shadow` and `templates-creategame`,
  all on ubuntu, and there is **no macos-14 browser job**. In the latest run, 37773104304, `unit` fails 6 of 156 tests and `all-routes-shadow` fails at `git am`
  (`Patch failed at 0001 migration(aura-clash-showcase) step 5: announcer + crowd bed`: `AuraClashArenaApp.ts: does not
  exist in index`, `auraClashAudioManifest.ts:16`, `auraClashArenaProof.ts:46`).
- `qr-prd09-routes.yml` is green only because `:81` ("Build affected routes from source") and `:86` ("Record default vs
  capture=review views") set `continue-on-error: true`, and `tests/qr/prd09/capture-divergence.spec.ts:114` can `test.skip` itself vacuously.
- Every QR-09 PR merged with `qr-prd09-game` red. #270 and #350 also merged with a failing `Lane gate`.
- `A3D_QR_GAME` = `dev` (`packages/rendering/src/contracts/flags.state.ts:19`). With flags `none`, `main` is pixel-identical to IC-0.
- All-flags captures: benchmark 0/18 drawing (GitLab 2926601350), games 0/9 drawing (2926540757, `Target page closed`,
  `no-draw-timeout`). The benchmark harness passes flags only through `?a3d-qr=` (`tools/quality-rebuild-capture/capture-games.mjs:87-99`)
  and never sets route flags, so the v2 `createGame` boots do not run there. Lane 09 is an unlikely root cause of the benchmark failures, but the
  flag-on risks below are real and must be fixed.
- PRD checklist: 95/96 ticked. Several of those ticks contradict the lane's own evidence, and the PRD file still contains diff3 conflict markers.

## Read first (use `rg -n` plus offset/limit reads; never read a huge file whole)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`: §2.5 (all-flags gate), §3 (Track P rows P-22, P-25,
   P-53, P-54, P-61, P-64), §4.0 (common rules and promotion), **§4.9 (your track)**, §6 (schedule).
2. `PRD-09-shared-game-runtime-route-extraction.md`: §14 checklist (`:1689-1783`), §15 tests (`:1784`), §16.1 standalone
   acceptance (`:1875-1900`), §17 perf (`:1962`), §18-§20 (browsers, mobile, evidence), §21 completion.
3. `CONTRACTS.md`: C-24, C-25, C-05, C-33, C-37 entries; §5 flags; §6 merge protocol.
4. `CI-ROUTING.md` (where each run goes, the commit-tag syntax, the budget) and `AURA3D-QUALITY-MASTER-PLAN.md` (your rows).
5. `_sections/integration-findings.md`, `_sections/issues-triage.md` (Lane 09 table) and `_sections/process-remediation.md`.
6. The original lane prompt, `prompts/LANE-09-shared-game-runtime-route-extraction.prompt.md`, for owned paths and contracts.

**Owned paths:** `packages/game/` (except `src/art/`), `packages/audio/`, `engine/src/game/`, `GameAppRuntime.ts`,
`app/createGameApp.ts`, `nodes/game/`, `input/src/TouchLayouts.ts`, `apps/common/`, `assets/packs/game-sfx-core/`,
`eslint/qr/no-route-capture-flags.js`, `tools/quality-rebuild-capture/route-composition.mjs`,
`docs/project/aura3d-quality-rebuild/migration/`, the PRD-09 file, and the lane workflows `qr-prd09-*.yml`. Anything else goes through a
`qr-request` issue (`gh issue create --label qr-request --label to:prdNN`). Keep working against the stub while you wait.

## Remaining tasks (exact ids; do them in priority order, one small PR each)

### P0: trunk honesty and lane CI

| ID | Task | Done when |
|---|---|---|
| 09-REC / Process: ticks (P-53, P-54) | Delete the `\|\|\|\|\|\|\| 5f5d6088` diff3 markers and the duplicated Phase 2/3 blocks at PRD-09 `:1741-1758` and `:1774-1780` (diff against #158/#240 to keep the right side). Untick `:1701` (postPass), `:1721` (CI), `:1738-1740`, `:1771-1773`, `:1792`, `:1795-1796` ("proven by shadow migration"), `:1800` (`--fail-on-any`) and `:1802` (≤ 10 % evidence). Re-tick an item only with a run id. | no conflict markers; checklist-lint green; tick count matches evidence |
| Red-flag revert (routes) | `.github/workflows/qr-prd09-routes.yml:81,86`: remove both `continue-on-error: true`. In `tests/qr/prd09/capture-divergence.spec.ts:114`, replace `test.skip(affected.length === 0)` with a hard failure when `process.env.CI` is set (shared `requireOrSkip()` per P-22). | routes job is green without masks, or red and honest |
| CI-unit (09-CI) | Fix the 6 failures from run 37773104304. (1) `tests/unit/game-runtime/game-runtime-source-gates.test.ts` ×4: update the fighting-game assertions (`diagnostics: { overlay: true`, `createGameApp("#app"`) to the `createGame` shape from #350, or restore the hitbox overlay through a Q-13 request (the template is lane-13 owned). Retarget the skyline `const playableSurfaceMap =` gate to `apps/showcase-skyline-runner/src/legacy/main.ts`. Point the package-smoke/release-gate wiring at `tools/game-runtime-package-smoke/index` (a lane-15 file, so file a request if needed). (2) `tests/unit/game-runtime/public-game-geometry.test.ts`, "selects chase and top-down racing rigs only from passing composition evidence": restore the throw on missing evidence. (3) `tests/unit/tools/no-route-capture-flags.test.ts`: retarget the fixture from `apps/showcase-bank-shot/src/main.ts:49` to `src/legacy/main.ts`. Add no skips. | `gh run list --workflow qr-prd09-game.yml` shows `unit=success` on a PR and on `main` |
| CI-browser (09-CI) | Add a `macos-14` job to `qr-prd09-game.yml` that serves `packages/game/fixtures/*` and runs `tests/browser/game-shell/*`, `tests/browser/layout.spec.ts`, the touch/audio-live specs and `size-limit` on `packages/game/size-limit.json`, plus the WebKit and Firefox projects (§18). Add `push: branches: [main]` and `schedule` triggers, widen `paths` to the owned source, and upload artifacts on `always()`. | job exists and passes on `main` |
| 09-BEACON = T0-30 (#54) | `packages/game/src/createGame.ts:220-227`: `game.ready()` must reach `playing` only after `driver.firstPresentedFrame()` with drawCalls > 0, not on `app.ready()`. Wire the beacon readiness (`window.__AURA3D_GAME__.state === 'playing'`) into `tools/quality-rebuild-capture/capture-games.mjs`, which today never reads it. That file belongs to lane 12/03, so co-PR it or file a C-33 request. | capture artifact shows readiness reason `beacon` on fixtures + pilots; `playing` never reported with drawCalls 0 |
| 09-LAYOUT / 16.1-4 (P-25) | `tests/browser/layout.spec.ts:29`: restore the 0.15 desktop HUD cap for courier and aura-clash (0.22 is the **mobile** cap). Add 1920×1080 and 390×844 viewports, canvas coverage ≥ 95 % desktop and ≥ 70 % mobile, 0 banned tokens in `innerText` while playing, and a check that `__AURA3D_GAME_TEST__` is undefined in the production bundle. | spec enforces the PRD caps and is green on fixtures |
| §15 browser specs (09-SPECS) | Create `tests/browser/game-shell/{overlay-identity,fx-instances,audio-dsp,juice-pixels,hitstop,shell-flow,context-loss,touch,capture-parity}.spec.ts`. `audio-dsp` uses `OfflineAudioContext` at 48 kHz: RMS > −40 dBFS, pan ≥ 6 dB, occlusion ≥ 18 dB in the 5-10 kHz band, limiter peak ≤ −0.3 dBFS, transparency 0.5 dB, engine fundamental shift ≥ 25 %. `juice-pixels`: luma +25 at N+1, diff 0 at N+13, spark coverage ≥ 0.15 %. `shell-flow` includes the `presentLog` transition check. Add the `window.__AURA3D_GAME_TEST__.stepFrames` hook, compiled only when `MODE==='test'`. | all specs exist and pass on macos-14 in `qr-prd09-game` |
| CI-shadow / Phase 5 (09-MIG) | Regenerate all 18 route patch sets in `migration/patches/<id>/*.patch` against current `main`. Account for the PRD-14 `v2/boot.ts` trees and the deleted `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` (#346). Rerun `all-routes-shadow`. | every patch applies with `git am`; the build/check steps succeed |

### P1

| ID | Task | Done when |
|---|---|---|
| T1 fixtures | Add `packages/game/fixtures/fighter` with a `light-hit` scenario and a third, uninvolved animated node (needed by `hitstop.spec`). Only `fixtures/table` exists today. | fixture builds and `qr-prd09-game` serves it |
| T0.4 postPass (09-P0) | All 18 `migration/baseline.json` entries have `postPass: null`. Make the routes capture job record `app.diagnostics()` postPass at the default URL, then commit `postpass.json`. | 18 non-null entries, with the CI run id cited |
| 16.1-1 conformance (09-CONF) | Replace the 8-line `typeof` checks in `tests/unit/contracts/C-24-game.test.ts` and `C-25-audio.test.ts` with stub and real behaviour suites (session states, beacon, evidence channel, sound graph). Add `tests/unit/contracts/impl/prd09-sound.test.ts`. | green in `qr-contracts` for both stub and real |
| 16.1-2 capture contract | Remove the UNKNOWN/ART/FRAMING branches in `after.json` (aura-clash 2, aurora 4, skyline 6). Run `game-capture-parity.mjs --fail-on-any` on the shadow tree and `capture-parity.spec`, and commit `look-signature.json` per route. | `--fail-on-any` exits 0; signatures equal across default, scenario and `?capture=review` |
| T5.8 evidence share | 17/18 routes fail the ≤ 10 % evidence-LOC gate (only orbital-defense passes, at 7.1 %; courier 11.2 %, pulse-tunnel 60.5 %). Extend the patches to delete the evidence blocks, perf scripts and audio wrappers. Rerun `route-composition.mjs` and recommit `after.json`. | `after.json` shows 18/18 ≤ 10 % |
| 16.1-5 sound | Map synth cues to `game-sfx-core` samples in the `05-sound` patches (bank-shot has 11, courier 12). `sound.proof()` provenance must be all `sample` on bank-shot, courier and aura-clash. Capture `audio.webm`. | provenance is 100 % `sample` on the pilots |
| 16.1-6 feel | Run juice-pixels (DOM path), fx-instances, hitstop and overlay-identity. On the impact pilots, record action-shot FX coverage ≥ 0.15 % or a flash luma delta ≥ 15 in `evidence/prd09/<id>/04-action`. | specs green with a run id; measurements committed |
| Flag-on risk fixes | The six code risks in the next section, each with a unit or browser regression test. | tests green in `qr-prd09-game` and `qr-required` |
| Q-09-x inbound | The issues in "Issues to action/close" below. | each issue closed with a PR or an answer |

### P2

| ID | Task | Done when |
|---|---|---|
| C-25 slot (09-CONF) | `packages/engine/src/lanes/prd09.ts` registers only `instanceTransformsExtension`, and `packages/audio/src/contracts/gameSound.ts` contains only types. Add `defineContractSlot` + `provide(createGameSoundEngine)` gated on `A3D_QR_GAME`, or land a CONTRACTS amendment through a `ccr` PR. | conformance resolves real or stub by flag |
| 16.1-7 loading (09-HUMAN) | Capture `01-title`, `07-loading` and the transitions on the pilot scratch builds. A named human, not the implementer, scores them. | `evidence/prd09/<id>/review.md` with `loading_transitions` ≥ 7 per pilot |
| 16.1-5 human (09-HUMAN) | A named non-implementer scores `sound_audio` from the pilot `audio.webm`. | `review.md` score ≥ 6 |
| 16.1-8 perf | `aura3d perf-report`: 600 frames; CPU spans for session, tween, juice, HUD and sound; `setInstanceTransforms` p95; CDP forced-layout trace; pilot rAF p50 ≤ baseline + 0.5 ms on macos-14. | perf JSON under `evidence/prd09/<run-id>/`, every row within the §17 budget |
| 16.1-9 / §20 evidence | For each fixture and the 3 pilots: shots 01-07, contact sheet, `look-signature.json`, `capture-parity.json`, `composition.json`, `audio.webm` and `review.md` (vision screening). | `evidence/prd09/<id>/` complete |
| §19 mobile | iPhone 13 and Pixel 7 emulation on the macOS route. AWS Device Farm us-west-2 sessions use the `auraone-production-operator` profile only, with recordings at `evidence/prd09/<id>/device-{ios,android}.mp4`. If Device Farm is denied, record the exact action, resource and profile, plus the minimal grant needed. | recordings committed, or the denial recorded |
| 09-OWN (P-61) | #350 edited lane-13 templates (`packages/create-aura3d/templates/*/src/main.ts`), root `package.json` (lane 15) and `tools/finalize-dist/index.ts`. Get the owners' acceptance recorded in the #350 thread or on #351, or revert those hunks. | sign-off recorded |
| Flag promotion (09-PROMO) | See the criteria below. Lane 15 changes `flags.state.ts:19`, at a checkpoint. | `standalone-accepted` label set and the flag state advanced |
| Phase 6 removal | Delete the deprecated `game.hud`, `game.accessibility`, `game.evidence` and `game.touchControls` in `agent-api/nodes/game/index.ts`. This happens only after `A3D_QR_GAME` has been `default-on` for 2 checkpoints. | rg check empty; `REMOVED_QR_FLAGS` updated |
| §16.2 / §21 program | Integrated acceptance at G-PANEL IC-4 (2026-11-05) and later rounds. PRD-14 must first apply the Q-14-1 patches (#278-#302) to the rebased patch sets. Thresholds: `ui_hud`, `typography` and `loading_transitions` ≥ 7; `sound_audio`, `polish_juice` and `mobile_presentation` ≥ 6; review-vs-play parity 18/18. `18-game-scene` and `14-particles` must not regress. | a G-PANEL round records the PRD-09 categories passing |

## Flag-on code risks to fix (code-read; each one needs a regression test)

1. `packages/engine/src/agent-api/app/runtimeNodes.ts:88-97` + `nodes/game/instanceTransforms.ts:152-160`: the C-37 extension
   runs `ext.create(handle, app)` on every handle read. `qrFlagsOf(app)` dereferences `app.diagnostics`, so it throws when `app` is
   undefined (before configure), and it costs one `app.diagnostics()` per handle. Both branches return the same stub. Guard it, cache
   the flags once per app, or attach lazily.
2. `nodes/game/instanceTransforms.ts:131-137` (`stubSetInstanceTransforms`): `node.instances.slice(0, count)` permanently
   shrinks capacity, so the next call with a larger count throws `RangeError INSTANCE_CAPACITY_EXCEEDED` inside a frame update. Keep the
   capacity and the visible count separate, and stop re-decomposing matrices every frame.
3. `packages/game/src/session/GameSession.ts:69-72` + `createGame.ts:168-171`: `session.tick` calls `app.time.advance`, and
   `FixedStepDriver.ts:151` advances the same controller, so time advances twice per frame. Advance exactly once (C-23).
4. `packages/game/src/shell/transition.ts:53-56` and `createGame.ts:156-166` (`armFirstPresented`) wait forever on
   `firstPresentedFrame()`, which resolves only for `frame.source==='raf'` (`GameAppRuntime.ts:196-203`). The overlay stays opaque, so the
   page stays black. Add a timeout that fails visibly, with an error in the beacon and diagnostics, and do not leave the overlay opaque.
5. `packages/game/src/juice/overlay.ts:91-101,139-156`: `fade(to01>0)` holds `fade.target` with no release, so through C-05
   (`engine/src/lanes/prd01/outputSurface.ts:183-190`) the canvas renders black while drawCalls stay > 0. Add an auto-release and assert
   that an empty `{}` overlay means fade 0 (check `Renderer.setOutputOverlay` with lane 01).
6. `packages/engine/src/game/GameAudio.ts:236-243`: under the flag, `createGameAudio` throws for any cue without `asset`/`play`,
   and `createGame.ts:146-152` forwards `flags:['game']`, so a synth cue crashes the boot. Degrade with a diagnostic instead of throwing,
   and audit the template and route cue maps.
7. (latent) `packages/game/src/evidence/channel.ts:141-147`: the `legacyGlobals` getter has no setter, so legacy `window.x = ...` throws
   in strict code once the patches apply. Add a setter, or forward the assignment with a deprecation warning.

## Issues to action / close

- **Inbound (close each one with a PR or a written answer):**
  - #54: beacon after the first presented frame (T0-30).
  - #111: `GameAppRuntime.ts:145` must pass `app.quality` to `createPerformanceGovernor` (C-27). This blocks lane 11.
  - #208: GameAudio PannerNode + occlusion lowpass.
  - #209: `setPlaybackRate(rate, rampMs)`. Likely already implemented; verify and close.
  - #210: master limiter (−6 dB, ratio 12, knee 6), jitter and voice limit; verify `MasterChain`.
  - #211: the 176 Hz `playDefaultCue` is gone; confirm and close.
  - #212: `GameAppRuntime.ts:183` still calls `loop.onFrame → app.step(dt)`. Change it to advance/onTick. This blocks lane 08.
  - #213: `createGame` must call lane-08 `bindFeelSound(app, sound)` and map `reducedMotion`.
  - #228: CCR-08-1 `AuraCameraSpec.up`. Review it with lane 15.
  - #70: `game-sfx-core` cues for the 18 art directions. This blocks lane 14 and the synth-cue removal.
  - #66: verify the `game-capture-parity` `--fail-on-any` flags, then close.
- **Outbound (keep open, follow up, verify on landing):**
  - #232 (C-05 overlay in OutputPass, lane 01): triage says OutputPass implements it. Verify with overlay-identity, then close.
  - #233 (WGSL twin of the juice overlay, lane 11).
  - #241 (C-07 `InstanceBufferLike` accessor, lane 15). This blocks the real `setInstanceTransforms` path.
  - #271 (WebGPU `device.lost` → `onDeviceLost`, lane 11).
  - #310 (checkpoint capture-parity and look-signature jobs, lane 12).
  - #351 (Q-13-1: templates ride `createGame`).
- **Q-14-1 handoffs** #278, #281, #282, #285, #288, #290, #291, #293, #295, #296, #299, #300, #302: comment on each with the
  new patch-set commit once 09-MIG lands. The patch sets they reference do not apply to `main` today.
- File any outbound request that exists only in markdown (P-64) and write the issue number back into the ledger.

## Red flags to revert (none of these may survive this finish)

- `qr-prd09-routes.yml:81,86`: `continue-on-error: true`.
- `tests/browser/layout.spec.ts:29`: desktop cap loosened to 0.22, with the canvas-coverage, mobile and banned-token assertions dropped.
- `tests/qr/prd09/capture-divergence.spec.ts:114`: vacuous `test.skip`.
- PRD-09 `:1741`, `:1774`: diff3 markers and duplicated checklist blocks.
- PRD-09 ticks without evidence: `:1701`, `:1721`, `:1738-1740`, `:1771-1773`, `:1792`, `:1795-1796`, `:1800`, `:1802`.
- `C-24-game.test.ts` and `C-25-audio.test.ts`: `typeof` checks presented as conformance.
- #350's cross-lane edits without sign-off (09-OWN), and its breakage of `game-runtime-source-gates.test.ts`.
- The merge history: all QR-09 PRs merged red. From now on, **nothing merges red**.

## Flag-promotion criteria for `A3D_QR_GAME` (PRD-16 §4.0; lane 15 changes the state at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Lane 09 is also blocked by #241 (15), #271 (11) and #310 (12). Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

- `dev → standalone-accepted` requires all of the following:
  - Track 0 exit is met.
  - Every §16.1 S-row is green in **one** run of `qr-prd09-game` on `main` (macos-14 or GitLab macOS, `--strict`, no masks).
  - Sentinel identity is recorded (`qr_flags=none`, ΔE2000 p99 ≤ the IC-0 noise floor).
  - Every lane-owned C-40 row is `verified` with a run id.
  - checklist-lint is green.
  - Outbound requests are filed.
- `standalone-accepted → integrated-accepted`: the §16.2 categories pass at a G-PANEL round with `qr_flags=all` and leave-one-out `all,-game`.
- `integrated-accepted → default-on`: two consecutive checkpoints with no attributed `qr-ic-regression`.
- `default-on → removed`: two more checkpoints, then a single removal PR for Phase 6.
- Do not ask for promotion before this. Premature asks get withdrawn (P-58).

## Non-negotiable rules

1. **Merge gate.** Every PR merges only when **both** of these are green on its head commit, and you cite both run ids in the PR description:
   - your lane workflow (`qr-prd09-game`, plus `qr-prd09-routes` when routes or patches change),
   - and the **all-flags gate** `qr-required / qr-required`, including `allflags-smoke` (PRD-16 §2.5).

   While Track 0 is open, the `$ALL` arms may be expected-red with an issue link. A PR that turns a previously green arm red fails.
   Until `qr-required` exists (target 10-10), merge only Track 0/P work. Any red-making PR is reverted at once.
2. **Single writer.** Edit only owned paths (`node tools/qr-ownership/check.mjs`). For a file you do not own, open a `qr-request` issue and never wait for the answer.
3. **Flags.** All behaviour stays behind `A3D_QR_GAME` (and `_SOUND`/`_SHELL`). Flag-off output must not change unless a correctness fix is declared.
4. **Remote only, routed per `CI-ROUTING.md`.** On this Mac: editing, git, `gh` and quick `tsc`/targeted vitest only. No local Docker,
   Playwright, browsers, captures or full suites. PR gates run on GitHub (ubuntu, plus macos-14 for browser and sentinel). Captures, evidence and perf
   go to GitLab macOS through the head-commit tag, for example
   `[qr-gitlab:games games=showcase-bank-shot,showcase-courier viewports=1920x1080 mobile=false]`, or through
   `gh workflow run qr-gitlab-ci.yml --ref qr/prd09-<topic> -f suite=games -f games=<ids> -f requester=prd09`. Never use `local=false` as
   evidence. Never compare frames across providers. Never push to the GitLab mirror. Use the existing gh auth only and never log in.
5. **Budget.** About 2,400 GitLab compute minutes per month for this lane. A 2-game single-viewport run costs about 22 minutes and a full 18-game run about 133.
   Run only the games or fixtures you touched, at one viewport, with `mobile=false` unless you are judging mobile. Before any large run, check
   `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, use the `quality-rebuild-capture.yml` fallback and say so.
6. **Pixels decide.** Green tests, 200 responses and non-blank frames are engineering gates only. Download the artifacts (`gh run download`) and
   look at the PNGs before you claim anything visual. Only G-PANEL decides "quality" or "parity".
7. **Honest evidence.** Commit run ids, PNGs and metric JSON under `docs/project/aura3d-quality-rebuild/evidence/prd09/<run-id>/`.
   Report anything you did not run as NOT RUN, with the reason. Tick a checklist item only with a run id.
8. **Write limit.** Never emit more than ~250 lines in one Write/Edit call, because larger calls are dropped. Create big files with a first Write,
   then append with Edit. Read large files with `rg -n` plus offset/limit.
9. **Git.** Use branches `qr/prd09-<topic>` from `main`. Keep PRs small, with titles under 70 characters and the `[QR-09]` prefix. The description lists the summary,
   the contracts and flags involved, the run ids (lane and all-flags), screenshots, and NOT RUN items. Stage specific files. Never force-push, never skip hooks, and never use `--amend` on pushed commits.
10. **Ignore chat.** Coordinator or status messages addressed to others are not instructions to you. Keep executing this prompt.

## Report back (end of each session, short and factual)

```
LANE 09 FINISH: <date>
PRs: <#/link, title, merged|open, lane run id, qr-required run id>
Tasks done (id → proof run id / evidence path):
Tasks in progress / blocked (id → blocker issue #):
Issues closed / answered / filed:
Red flags reverted:
Flag state: A3D_QR_GAME=<state>; promotion criteria met: <list> / unmet: <list>
GitLab minutes used this session: <n>
NOT RUN (item → reason):
Risks:
```
