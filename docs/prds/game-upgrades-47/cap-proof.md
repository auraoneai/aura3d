# cap-proof: how a game look upgrade can be proven and kept in budget (input for GameUpgrades47-PRD.md)

Checkout: `/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/audit-integration` (branch `audit-fix/integration`). All paths below are relative to it. `packages/engine/package.json` still says `4.5.0`; `CHANGELOG.md:7` has the `## 4.6.0 (2026-10-29)` entry. Latest tag is `v4.5.0` (no `v4.6.0` tag yet), which matters for `screens-fresh` (see 4).

## 1. Remote runner (the only place frames are made)

- `tools/remote-acr/run.sh`: serverless Azure ACR Tasks on `az-auraone-gurbaksh`, image from `tools/remote-acr/Dockerfile.playwright` (Playwright 1.59.1), task `task.playwright.yaml`, in-image `task-run.sh`. Output `tests/reports/remote-acr/<RUN_ID>/` (`acr-run.log`, `summary.json`).
- Env knobs (`run.sh` header, lines ~22-44): `SPECS`, `RUN_ID`, `BUILD=0` reuse, `KEEP_IMAGE=0` (delete tag after), `CONTEXT_PROFILE=slim|full` (slim drops `public/aura-assets`, ~1.4 GB), `EXTRA_DIRS=apps/showcase-<game>`, `PUBLIC_ASSETS="<files under public/aura-assets>"`. `apps/common` and `apps/showcase-port-shared` always staged.
- Traps (`tools/remote-acr/README.md`): `SPECS` must be shell-safe, no `| ( ) ; & < > $` (README:91); one ACR step stops at 3600 s (README:94), so captures are split by tag (`--grep=@g3`); WebGPU canvases need the `@headed-xvfb` sentinel in `SPECS` (README:97-105), headless Chromium destroys the GPUDevice at first present. No blob artifact egress on ad-hoc runs (run.sh header NOTE): frames come back as base64 in `acr-run.log`.
- Renderer on the runner is software WebGL2 (SwiftShader). It presents about one frame every 5-10 s for a game (`tests/browser/game-luma-capture.spec.ts:15-18`). Lesson V3 (`docs/agents/lessons-learned.md`): cancel a hung run after 20-25 min.

## 2. Steady-state luma capture (the existing numeric look gate)

- `tests/browser/game-luma-targets.ts`: 64 targets = 25 live games and every lighting variant. Variant lists: `DIAMOND_PARKS` (:42), `HOOPS_COURTS` (:43), `FC_VENUES` (:44), `LINKS_COURSES` (:45), `IRON_CROWN_STAGES` (:46), `PIPS_WORLDS` (:47) plus `academy`, `CROSS_HOP_THEMES` 0-5 (:48), `TELEOP_SKIES` noon/golden/fog/night (:50). `GROUP_SIZE = 9` (:38), so groups `@g1`..`@g8`. Unit guard: `tests/unit/game-luma-targets.test.ts` (every live inventory game has a target).
- `tests/browser/game-luma-capture.spec.ts`: 1280x720 viewport (:97), waits for `aura3dReady` or drawCalls > 0 (:25, :100), shots at `GL_SETTLE` default `25,60` s after ready (:21). Canvas-only (HUD hidden, :24). Per shot it logs `GL_META` with mean, p5, p50, p95, darkFrac (y<=8), clipFrac (y>=250), a 3x3 grid of region means (:36-60), and `info.renderPath` + `drawCalls` (:66-73); plus a chunked q0.7 JPEG `GL_JPG` (:54, :83). A target costs about 4 min on the runner.
- Decoders: `evidence/audit-fix/e5/decode-luma.mjs` (log -> frames + `luma-<label>.json`) and `evidence/audit-fix/e5/compare-luma.mjs` (pair two sets, markdown table).
- Measured table, 4.3.7 vs 4.5.0, last shot: `evidence/audit-fix/e5/wave2/sweep/table.md` (43 rows; several targets "not reached" on one side: teleoperator fog, FC favela, Links mareCourse, Cross Hop theme2). All rows `hdr-msaa`. Outliers that matter for look work:
  - `aura-links-3d--neonBay` 2.03 -> 2.26: near-black on both releases. Lane G10 (`audit-fix/g10:docs/audits/lanes/g10.md:34`) adds a warm floodlight key: 27.59, dark pixels 97% -> 44%.
  - `splat-rush-port--default` 192.60 mean with 25.83% clipped (blown out).
  - `aura-fc-3d--uyuni` 231.74 mean (salt flat, near white), `dot-dash-3d` 29.48, `top-tennis` 50.37 (G01 says the pre-conversion reference sits at 56.6-60.1, `docs/audits/lanes/g01.md:76`).
  - Everything else sits between ~50 and ~150. Similar means across very different games is one numeric sign of the "same game" problem, but mean luma alone cannot prove it (see 7).
- PRD-3 WP-9 text is stale: it says 61 targets and `@g1`..`@g7` (`docs/prds/beat-threejs/PRD-beat-threejs-3-after-450.md:184`); the file now has 64 and `@g8` (CHANGELOG 4.6.0 "Steady-state luma capture" bullet).

## 3. Real GPU (owner hardware only)

- `tools/real-gpu/capture.mjs` probes `UNMASKED_RENDERER_WEBGL` and refuses software renderers unless `--allow-software` (capture.mjs:2-3, :27). Defaults 1440 wide, DPR 2 (:23; README:9).
- `tools/real-gpu/run.sh`, `tools/real-gpu/scenarios.json`: only 7 games have scenarios: `top-tennis, teleoperator, hoops, diamond, links, fc, iron-crown`. 18 live games have no real-GPU scenario (NEW in 4.7.0: add one per game in `scenarios.json`).
- Agents must not run it on the Mac (README:13; machine policy). It is an owner step in PRD-3 (OWNER-1, PRD-3 :192). Existing evidence: `evidence/real-gpu/impact-435/` only.
- Lessons R16 and V7 (`docs/agents/lessons-learned.md:24`, `:113`): software GL is not GPU; query the renderer before explaining a GPU-only bug.

## 4. game-checks (static, local, fast)

`node tools/game-checks/run.mjs <slug>|--all [--only id,...] [--json] [--strict]` (`tools/game-checks/run.mjs:2`). Check table `tools/game-checks/lib/index.mjs:699-722`. The ones that touch visuals:

- `lighting` (`index.mjs:590-604`, warn): lights with no `environments.*`, `looks.preset`, `look:` or `environment:` in code. Escape `// lighting: ok`.
- `screens-fresh` (`index.mjs:639-650`, warn): card frame committed before the latest `vX.Y.0` tag (`git describe --match v[0-9]*.[0-9]*.0`, `:624-636`). It compares commit time, not pixels. Today the latest such tag is `v4.5.0`; after `v4.6.0`/`v4.7.0` are tagged, every card committed earlier turns stale.
- `touch-input` (`index.mjs:537-578`, `TOUCH_INPUT_SEVERITY = "warn"` :537).
- `screens-tracked` (`:363`, error when no tracked screens), `fit-grounding` (`:201`), `likeness` (`:239`), `kits` (`:303`), `deployable-assets` (`:279`), `no-three` (`:329`), `shared-catalog` (`:608`). Global: `skin` (`:456`), `meshy-cap`, `counts`, `vercelignore` (`:722`).
- Run now on integration (`--only screens-fresh,lighting,touch-input,screens-tracked`): 0 errors, 21 warnings. `screens-fresh` on 15 games (iron-crown, aura-links-3d, bunker-zero, slingshot-siege, dot-dash-3d, cross-hop, strange-orbit-port, drift-and-deliver-port, heatsink-port, ninja-runner-port, last-train-port, roadster-hours-port, where-the-wind-wanders-port, silt-and-signal-port, cloud-runner-port; the lanes for most are still on `audit-fix/gNN`). `lighting` on `heatsink-port` (`examples/heatsink-port/world.ts:101`). `touch-input` on bunker-zero, drift-and-deliver-port, heatsink-port, last-train-port, roadster-hours-port.
- No check reads pixels. No check compares one game's look to another's. NEW in 4.7.0 candidates: a `look-identity` check (each game declares a distinct look signature: look id or env, palette, fog, post preset) in `tools/game-checks/lib/index.mjs`; and a `luma-band` check that reads the per-game steady-state JSON committed under `evidence/<game>/` and flags frames with darkFrac > 0.6 or clipFrac > 0.05 unless the game declares an exception.

## 5. Rubric and vision judging

- 12-category agent look rubric: `AGENT_LOOK_CATEGORIES` in `packages/aura3d-cli/src/look/rubric.ts:15-19` (lighting, shadows, ibl_reflections, environment_world, atmospheric_effects, material_quality, modeling_assets, composition, camera, postprocessing, animation_quality, ui_hud). Schema `aura3d.look-judgement/1` (:21-33), scores 0-10 in 0.5 steps. Genre recipe rows `GENRE_RECIPE_ROWS` (:36-51: look id, camera, subject %, key light, palette, atmosphere, post preset per genre). Weakest-category hint table `CATEGORY_HINTS` (:58-71).
- Anchors: `packages/aura3d-cli/skills/aura3d-art-direction/references/quality-bar.md` (7 = pass anchor per category; hard lint list at the end). Look-dev loop: `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md:47-75` (until every category >= 7, or 6 rounds, or 2 flat rounds; "a self-judgement is not a pass of the quality bar; only a panel round passes it"). Other refs in the same folder: `look-recipes.md`, `reference-frames.md`, `framing-and-shots.md`, `failure-gallery.md`.
- CLI: `aura3d look judge --validate <file>` and `aura3d look rubric` (`packages/aura3d-cli/src/look/judge.ts:153`, `:161`). `--judge prism` exits 2 `judge-unavailable` (`judge.ts:55-67`) because it imports `judgeWithPrism` from `tools/quality-gate/src/types.js`, which does not export it; the function lives in `tools/quality-gate/src/judge-prism.ts:38`. So model judging through `look judge` is not wired (NEW in 4.7.0: re-export or import from `judge-prism`).
- `aura3d look lint` (`packages/aura3d-cli/src/look/lint-static.ts:204`); runtime lint in `app.diagnostics().look`.
- `aura3d evidence judge` (`packages/aura3d-cli/src/commands/evidence/judge.ts`, registered `commands/evidence/index.ts:7`): blind A/B "same game?" vision judgement of two folders of matched frames through Kiro Prism `/v1/messages`; key from `PRISM_KEY_FILE`/`PRISM_API_KEY`; seeded balanced order, binomial p-value (`judgeLib.ts:125`, `summarize` :164). Built for port fidelity (port vs original). It can be reused for the 4.7.0 goal "games clearly different from each other": feed two different games' frames and require `same_game: false` with high confidence. NEW: a pairwise distinctness run over all 25 card frames, output under `evidence/game-upgrades-47/distinctness/`.
- `tools/quality-gate/src/judge-prism.ts`: Prism vision judge, <= 4 images per turn, separate 1280x720 JPEG q90 images, never a composite (:1-6, :44); a canary ("red", "cube", "left", :31) must pass first. `judge-round.ts` runs rounds.
- Pixel metrics: `tools/quality-gate/metrics/metrics/metrics.py` (`flip` :100, `ssim` :154, `lpips_alex` :226; deps pinned in `requirements.lock`); `promote.py` (flag arm must not regress LPIPS on any scene vs the `none` arm). `tests/qr/prd01/metrics/regionSsim.ts` (windowed SSIM + MAD over a region, Rec.709 luma). These compare against a reference frame, so they suit "did not regress" and "matches the 4.3.7/previous frame", not "looks better".
- Per-port judge outputs exist (`evidence/<port>/judge-*.json`, scripts `tools/crayon-capture/*-judge.ts`).
- `visual-verdicts/aura3d.md` is a site typography/UI audit, not a game-look verdict.
- Memory (not in the repo): subagent image Reads return empty, so frames must be judged through Prism vision or by numbers.

## 6. Performance budgets

- Per-game draw-call budgets are mostly not written down. The one stated: Aura Slam 150 (`docs/agents/build-a-game.md:247`, measured 119; `docs/upgrade-4.5.0/top-tennis.md:59` cites `aura-slam-render.spec.ts:91 <= 150`). Renderer profiles carry `maxRecommendedDrawCalls` 180/260/180/260/320/220 (`packages/engine/src/agent-api/app/rendererOptions.ts:28,38,53,68,83,98`).
- Measured live draw calls (audit `docs/audits/live-games-4.5.0-audit-2026-10-29.md`): Apex 868-895 (:307; G02 cut to 150-175, CHANGELOG 4.6.0), Pips 815-833 (:525), Diamond 658-662 + 1.05M skinned triangles (:643), FC 379 (:700), Hoops 326 (:593), Slingshot 394 (:854), Cross Hop 153-167 (:956), Last Train 165-167 + ~400 MB GPU (:1291), Cloud Runner 164 + 647k triangles + 333 MB textures (:1493), Wind 17 (:1389). Chroma Roll 160 -> 22 (CHANGELOG 4.6.0 G16). Port playbook typical cuts: `docs/workflows/game-conversion-playbook.md:80`.
- Scene-kit budgets: `sceneKitPerformanceBudgets` (`packages/engine/src/agent-api/devtools/sceneKitBudgets.ts:7-18`; e.g. cityBlock max 140 draws, 24 KB gzip, p50 50 fps). Bench runner `benchmark/runner/scene-kit-performance-budget.mjs`. These are kit budgets, not game budgets.
- Bundle: `BUNDLE_SIZES.md` (`pnpm check:bundle-size`, package.json:139). Engine critical path 1,141,998 B gzip vs 190,000 budget (fail, :10); mini-game starter 1,063,602 vs 480,000 (fail, :17). "Do not raise either set of budgets to manufacture a pass" (:38-39). Bundle work is owned by `docs/prds/agent-first-authoring/PRD-agent-first-game-authoring.md` Track C; baseline `evidence/bundle/BASELINE.md`, tool `tools/bundle-report/report.mjs`. Any renderer-capability PR must regenerate the report and state the delta (`BUNDLE_SIZES.md:22-27`).
- Diagnostics to record per game: `AuraDiagnostics` (`packages/engine/src/agent-api/nodes/types.ts:2509`): `fps` (now real presented-frame fps since 4.6.0), `drawCalls`, `renderPath {path, quality, reason, bloomFusion}`, `warnings` (e.g. `CONTACT_SHADOWS_WEAK_KEY`, `QUALITY_URL_IGNORED`, `RENDERER_QUALITY_STRING`), plus `lighting`, `shadows` (`cascadeCount`, `skippedCascades`), `post` (`stagesRan`, `dropped`), `exposure`, `materials`, `effects`, `atmosphere`, `world.scatter`, `appliedLook`, `look`. `info().render.triangles` now counts (4.6.0). `?diag=1` panel. `app.screenshotAsync()` is new in 4.6.0 for clean captures.
- NEW in 4.7.0: a per-game budget row (draw calls, triangles, texture MB, GPU MB, route JS gzip) in `docs/workflows/game-inventory.json` or each `evidence/<game>/` folder; `CONTRACTS.md:1960` already sketches `GameBudgets` (transferToPlayableMB, routeJsGzipKB, drawCalls per tier, gameLogicCpuMs) in `docs/project/aura3d-quality-rebuild/CONTRACTS.md`. Every look upgrade should report diagnostics before and after.

## 7. Posters and screens pipeline

- Inventory: `docs/workflows/game-inventory.json` (generated by `tools/site/gen-game-inventory.mjs`, "Do not edit"; `liveGameCount: 25`). Each game has `screens.{set, dir, card, frameCount}` (e.g. `top-tennis` -> `evidence/aura-slam/screens/final/card-2x.jpg`, 14 frames). Card names vary: `card-2x.jpg`, `card/card-2x.jpg`, `card@2x.jpg`, `card.2x.1440x900.jpg`.
- Final screens: `evidence/<folder>/screens/final/` with `1280-0N-<state>.jpg`, `390-0N-<state>.jpg` (states title, early, action, mid, modes, results), `card-1x/2x.jpg`, `meta.json` (source spec, run ids, capturedAt), `README.md`. Capture specs: `tests/browser/audit-fix/<game>.spec.ts` (18 present on integration; the rest arrive with the G-lane branches).
- Posters: `node tools/site/build-card-images.mjs` -> `public/previews/showcase-index/<slug>.webp` (720x450) and `<slug>@2x.webp` (1440x900), each <= 200 KB, copied to `marketing/public/previews/showcase-index/` (build-card-images.mjs:2-3, :12-16). Index page generator `tools/site/gen-showcase-index.mjs`, catalog `tools/site/games.catalog.json`.
- Lesson B11 (`lessons-learned.md:103`): retake final screens after each minor release and rebuild cards; `screens-fresh`. Lesson V4: commit frames with `git add -f`; `screens-tracked`.
- Live smoke after every deploy: `tests/browser/live-index-games.spec.ts` (lesson B9).

## 8. Planned work landing by 4.7.0

- Beat-three.js part 2 (`beat3js2/*`): all 19 branches have 0 commits ahead of `audit-fix/integration`, i.e. merged (bloom fusion, PCF tap tiers 32/16/8 opt-in, contact-shadow mask, exposure attribution, draw reduction for dense instanced casters).
- Beat-three.js part 3 (`docs/prds/beat-threejs/PRD-beat-threejs-3-after-450.md`, not executed yet): WP-1 keep authored tone mapping on the direct path (forest, skinned character, game loop move off `hdr-msaa`); WP-2 HDR chain cost per pass; WP-3 shadow filter tier; WP-4 CPU in `frame()`; WP-5 cold-start markers; WP-6 program/draw accounting; WP-9 games lane (being executed by the audit-fix program). Guardrails (:227-233): no change to `quality: "production"` output, "no change to game art to hide a regression", never "built on three.js". All 25 games take `hdr-msaa` today (CHANGELOG 4.6.0); if WP-1 lands, games that author only direct-path-compatible output could move to `direct`, which changes pixels and must be captured per game.
- Agent-first authoring PRD (`docs/prds/agent-first-authoring/`): bundle Track C, docs volume.
- Audit-fix 4.6.0: E1-E5 and G01-G09, G12, G15-G17 merged; G10, G11, G13, G14, G18-G25 still on `audit-fix/gNN` (latest commits 2026-10-29 are evidence, retakes, checklist closes). Lane reports `docs/audits/lanes/*.md`; plan `docs/audits/execution-plan.md`.
- `feat/wonder-world-*` (75 and 11 commits ahead) is the separate Veer Wonder World product (`docs/prds/veer-wonder-world/`), not the 25 games.

## 9. Lessons that bite visual work

- Steady state (R20, `lessons-learned.md:28`): first frame is lit by the analytic floor probe; the baked probe lands seconds later (Diamond Skyline right on frame one, 2.6 at steady state). Judge the 25 s and 60 s shots only.
- Lights without environment (R17, :25): since 4.5.0 no implicit room; lights-only GLBs went 39-50% darker. Add `environments.neutral({ intensity })` calibrated on a steady-state capture. Check `lighting`.
- Hemisphere and runtime looks (R18, R19, :26-27): hemisphere now contributes next to an environment (per normal); runtime look swaps no longer double-light. Capture every theme/variant, not only the first.
- Fill/probe trap (memory autopsy 2026-10-12): compiler brightening was the neutral-room probe painted as background over authored dark backgrounds; a red error panel (`WEBGL_LDR_POSTPROCESS_FAILED`) read as ~50 luma. Check the frame, not only the number.
- Mean luma misleads (memory autopsy, not yet in `lessons-learned.md`): many games are dark-background compositions; use foreground or crop stats (the spec's 3x3 grid, G04's car-crop mean in `docs/audits/lanes/g04.md:26`, G16's model luma). NEW: add this as a lesson entry.
- LFS pointers (`docs/upgrade-4.5.0/iron-crown.md:68`; `tests/browser/mech-hangar-runtime.spec.ts:44`): GLBs under `public/aura-assets/*.glb` and `apps/showcase-*/assets/**/*.glb` are LFS (`.gitattributes`); a worktree with pointer stubs gives a black frame with `RENDERER_MOUNT_FAILED`. Not in `lessons-learned.md` either (NEW). Related V1 (:107): slim runner context drops models, black frames; discard black captures.
- Texture upgrade is slow on software GL (R4, :12): white materials for 25-50 s; wait for the QA hook texture status.
- Colour applied twice (R5, :13), failed model blanks the scene (R9, :17), shard-atlas textures (R8, :16), effects tuned without watching real frames (R14, :22).
- V5/V6 (:111-112): read every frame; a skipped comparison is not a pass. V7: software GL is not GPU.
- `?aura3d-render=` typos no longer kill mount (4.6.0), so URL debug switches are safe for captures.

## 10. What a 4.7.0 look-upgrade proof could be, using only what exists plus marked NEW items

1. Before: `game-luma-capture` @g1..@g8 on the 4.6.0 build, decoded with `decode-luma.mjs`, committed per game.
2. Change the game's look.
3. After: same targets; table from `compare-luma.mjs`; require no new darkFrac > 0.6 / clipFrac > 0.05 outside declared exceptions (NEW rule), and diagnostics drawCalls within the game's written budget (NEW budget row).
4. Rubric: `look-judgement.json` per game, validated by `aura3d look judge --validate`; panel judging needs the `judgeWithPrism` wiring fix (NEW).
5. Distinctness: pairwise `aura3d evidence judge` across games' card frames, require `same_game: false` (NEW use).
6. Retake final screens (`tests/browser/audit-fix/<game>.spec.ts`), rebuild posters (`build-card-images.mjs`), `run.mjs --all` with no `screens-fresh`/`lighting` warnings after the `v4.7.0` tag cut.
7. Owner step: `tools/real-gpu/run.sh` on the Mac, scenarios for all 25 (18 NEW).
