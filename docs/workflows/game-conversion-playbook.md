# Game conversion playbook: move an existing browser game onto Aura3D and prove parity

Status: written for 4.1.0, 2026-10-23. Distilled from converting eleven Crayon games (simulation ports plus an art pass) and Aura Slam 3D (`apps/showcase-top-tennis`) in one program. Every command, path and number below was checked against the repo on `origin/main`; items marked **[agent-reported]** come from agent reports in that program and could not be re-checked from files in the repo, and items marked **[unverified]** are not confirmed at all.

Related documents: [`crayon-game-reverse-engineering.md`](./crayon-game-reverse-engineering.md) (how a third-party browser game is extracted), [`threejs-parity-gaps.md`](./threejs-parity-gaps.md) (engine gaps and the per-game status table), [`../aura-slam/ARCHITECTURE.md`](../aura-slam/ARCHITECTURE.md) (the worked example for steps 3 and 4), [`../api/safety-net.md`](../api/safety-net.md), [`../api/cli-asset-tools.md`](../api/cli-asset-tools.md), [`../api/model-loader.md`](../api/model-loader.md), [`../api/qa-kit.md`](../api/qa-kit.md).

The loop in one line: **scope, capture a deterministic reference, write a typed contract, transcribe module by module against the original, gate rendering with metrics, add art through a budgeted pipeline, then test on real hardware and deploy from a clean export.**

## 0. Ground rules for the whole job

- Remote first. Browser suites, builds and anything heavy run on the serverless runner: `RUN_ID=<prefix>-<n> SPECS="tests/browser/<spec>.ts" tools/remote-acr/run.sh`. Useful knobs (see the header of `tools/remote-acr/run.sh`): `CONTEXT_PROFILE=slim|full` (slim is the default and leaves out `public/aura-assets`), `EXTRA_DIRS="apps/showcase-foo"` (dirs added to the build context), `PUBLIC_ASSETS="file.glb ..."`, and the `@headed-xvfb` token in `SPECS` for a headed Chromium under Xvfb. Local Playwright, local Docker and local dev-server runs for heavy work are not allowed.
- The runner is software WebGL2 (SwiftShader). It proves the page boots, draws and logic matches; it cannot prove a real GPU (section 6).
- Never run `pnpm` inside a git worktree whose `node_modules` is a symlink to the main checkout (section 7). Call binaries directly: `<main>/node_modules/.bin/vitest`, `.../tsc`, `node --experimental-strip-types tools/...`.
- Each parallel agent gets its own worktree off `origin/main`, owns disjoint files, and pushes its own commits (section 8).

## 1. Scope and the legal boundary

Decide before any code what is being reproduced and what is not (this is the rule from section 4 of the reverse-engineering doc):

- Reproduce **mechanics, systems, tuning and control contracts**, and match the **look** from measured numbers. Do not copy third-party art, audio, text, names or branding.
- New models come from the licensed Aura3D catalog or from text-prompted generation (section 5), never from the original's textures or from image-to-3D of its screenshots. Prompts describe the object in your own words and never name the original game, brand or characters.
- Third-party captured source stays out of the public tree where it is large or unclear (see `tests/fixtures/crayon/<game>/PROVENANCE.md`); reference frames of third-party games stay local (`evidence/look-reference-frames/` is gitignored). A first-party game (Aura Slam) may commit its own reference frames: use `git add -f` because the repo ignores `*.jpg`.
- Do not call a port "1:1". State what is verified and what is not on the route page (the 15 index games and eleven ports carry honest disclosures; the index text is in `apps/showcase-index/index.html`).
- Decide phases up front. Aura Slam Phase 1 is the match loop (sim, rules, AI, input, rig, render, audio, HUD, menu); Phase 2 (tournament and tour, online play, appearance and character select, about 1.7 MB of bundled scripts plus server endpoints) was deferred with the reason written down (`docs/aura-slam/ARCHITECTURE.md` section 2).

## 2. Deterministic reference capture (do this before touching the game)

Goal: a recording of the **original** that a converted build must reproduce, with a tolerance derived from data.

1. **Make a run deterministic.** Seed `Math.random`, virtualise time (`performance.now`, `Date`, `requestAnimationFrame`), stub the network, and install the hooks before any game script runs. For sandboxed `about:srcdoc` games use a pre-boot hook through the browser context (`context.addInitScript`), as in `tools/crayon-probe/` and `tools/crayon-capture/lib.ts` (Crayon pattern: `tools/crayon-capture/strange-orbit.ts`). If the game already ships stepping hooks use them: Aura Slam exposes `window.advanceTime(ms)`, `render_game_to_text()` and `__TOP_TENNIS_CONTROL__`, and its simulation is seeded only from game time and serve counters (details in `evidence/aura-slam/README.md`).
2. **Drive it the way a human or the AI would**, scripted at fixed steps. Aura Slam recorded six scenarios (five Auto matches across difficulties and venues, one scripted-keys scenario with 286 recorded key events) in one synchronous `page.evaluate` so the real-time loop can never interleave.
3. **Record per-step state plus events**, and a digest over every step (Aura Slam uses FNV-1a with values rounded to 1e-6). Keep the full trace of the scripted run (`evidence/aura-slam/trace-manual-human-policy.json`, 6,001 rows).
4. **Run at least two independent sessions** and compute the variance. Aura Slam's variance was exactly zero (identical digests, step counts and event logs), so the tolerance for a reused sim is "exact digest", and for a re-implementation 1e-6. Crayon captures derive tolerances from data in the same way (`evidence/crayon-capture/*-reference.json`, schema `a3d-crayon-capture/1`).
5. **Capture reference frames** at named states and sizes (Aura Slam: 8 states at 1280x720 and 640x360, 6 venues, 3 mobile frames at 390x844; metrics in `evidence/aura-slam/frames-reference.json`). Two capture sets taken hours apart differed by at most 0.23 mean luma and 0.0014 edge density, which is how the parity thresholds in section 4 were chosen.
6. **Write down the behaviours that live outside the simulation.** For Aura Slam, autoplay, serve-phase movement and the toss-apex swing live inside the adapter's `render()` call, so an extra render (for example a resize) advances game logic. The port had to reproduce one render per step. A reference that ignores this will pass in Node and fail in the page.
7. **Throw away a harness that gave inconsistent digests.** The first Aura Slam harness started before the menu intro finished and did not verify settings; its digests differed between sessions and it was discarded (`evidence/aura-slam/README.md`).

Reproduce a baseline: see the "Reproduce" block in `evidence/aura-slam/README.md` (`tests/browser/aura-slam-capture.spec.ts`, then `tools/aura-slam/extract.mjs` and `build-reference.mjs`).

## 3. Architecture and a typed contract first, then module by module

Do not start by editing the game. Spend the first hour on a written architecture and **types** that other agents can code against.

1. **Inventory the source**: every script, its size, its role, and the target module. Aura Slam: `physics.js` (14.6 KB), `strokes.js` (5.7 KB), `match-engine.js` (147 KB, 2,714 lines), `controls.js` and `mobile-swipe.js` (13.4 KB), `player-pose.js` plus the rig in `main.ts`, `tennis-audio.js`, `game.js`, `menu-flow.js`, `styles.css` (table in `docs/aura-slam/ARCHITECTURE.md` section 2).
2. **Look for purity.** The Aura Slam simulation was already pure, deterministic UMD code with a JSON state, `step(dt)`, `applyInput` and an event stream. That turned the port into a **transcription**, not reverse engineering. Check this first; it decides the cost.
3. **Write the contract** (`examples/aura-slam/contract/`: units, sim state, input frames, events, AI, venues, reference schema, module interfaces). Contract changes after that are **additive only**, with a note in the commit.
4. **Assign disjoint file ownership** (one agent per module; nobody edits another module's files). Dependency rule: sim modules import only the contract and each other and never the DOM or `@aura3d/engine`; view, UI and audio read `MatchState` and events.
5. **Transcribe, do not redesign.** Keep every constant, iteration count and branch order. Where the original is one large closure, a mechanical conversion with a generator is acceptable: `tools/aura-slam/port-sim.mjs` produced `sim/engine.ts` and `tools/aura-slam/ai-port/` produced `sim/ai.ts` (re-running the generator reproduces the file). Tidy and type later, with the tests as the safety net.
6. **Differential tests against the original scripts loaded as data** (UMD `require` in Node, never executed from untrusted contexts). Numbers from the Aura Slam program:
   - physics: `tests/unit/aura-slam/physics.test.ts` asserts case floors of more than 10,000, more than 20,000, 3,000, 3,000 and more than 2,000 per group, at 1e-12; about 90,000 cases in total **[agent-reported]**;
   - strokes: 3,000 cases (`strokes.test.ts`);
   - rules and engine: `engine-differential.test.ts` compares full states tick by tick with a full state compare every 20 ticks over 12,000-tick runs for 7 difficulty, venue and skill combinations, plus 6 point sequences covering deuce, advantage, a 3-3 tiebreak and match point (26 tests **[agent-reported]**; the file has 10 test blocks, some parameterised);
   - AI: `ai-fuzz.test.ts` runs 300 randomised states per function (56 function suites, 16,800 cases **[agent-reported]**) comparing return value or thrown error plus the full resulting state, and `ai-trajectory.test.ts` replays 22 trajectories (5 difficulties by 3 venues for 3,000 steps, swipe variants, two 10,000-step matches) identical at every step;
   - pose: `pose.test.ts` compares 60,000 random actor and match states for bit-identical output against the original `player-pose.js`, and `tests/browser/aura-slam-pose-parity.spec.ts` renders the original rig code and the native rig at 18 fixed poses, which came out pixel-identical (0 differing pixels) **[agent-reported]**;
   - input: `input-swipe.test.ts` asserts more than 20,000 gesture-classifier cases against the original (about 100,000 **[agent-reported]**), and binding validation and persistence are compared over about 30 candidate profiles.
7. **Replay gate G1**: write `tests/unit/aura-slam/replay.test.ts` early; it is skipped while `evidence/aura-slam/reference.json` is missing. The live-page baseline uses a different schema than the Node engine runs, so on landing the test checks the baseline's structure and compares against `tests/browser/aura-slam-golden.json`. A shell-level replay of the scripted-keys scenario through the native page was **not** written, and the original adapter's Auto mode (which nudges the player outside the simulation) did not match the native autopilot at the time of writing.
8. **Extract to the library only after a module is green**, in a separate commit, with the port migrated onto the new kit and the replay tests unchanged (examples: `game.racketSports().ballFlight`, `scoring`, `athleteRig`, `createBindingStore`, `createSampleSlices`).

## 4. Render parity gates and what they can honestly claim

Gates used for Aura Slam (`docs/aura-slam/ARCHITECTURE.md` section 5): G1 sim replay; G2 per-module differential tests; G3 render parity; G4 real input; G5 live safety; G6 size and performance.

G3 metrics, computed by `tools/aura-slam/compare-frames.ts` and the render specs (`tests/browser/aura-slam-render.spec.ts`, `aura-slam-native-vs-live.spec.ts`): luma histogram JSD, RGB histogram JSD, edge-density ratio, mean luma delta, and a court-line mask alignment check. Thresholds set from the baseline noise: luma and RGB JSD at most 0.05, edge ratio 0.9 to 1.1, mean luma delta at most 4 (the baseline noise was about 1 to 2 luma and 0.005 edge density).

Measured on the native Aura Slam court against the live page, 1280x720, six venues, software WebGL2 (`evidence/aura-slam/NATIVE-RENDER.md`, `native-vs-live-metrics.json`): luma JSD 0.004 to 0.015, RGB JSD 0.010 to 0.023, edge ratio 0.90 to 1.03 (beach 0.895, just under the floor), mean luma about +2. Known differences are listed in that file. The end-to-end play-through sheet (`evidence/aura-slam/native-game/`) shows about 18 to 24% more edge detail than the reference, partly from the diagnostics overlay, so edge density in the full game was **out of range** and G3 for the whole game was not met at the time of writing.

Honest limits to write into every report:

- Software WebGL2 is not a GPU. Timing numbers from it are a proxy only. Drift & Deliver's black frame on a real Apple GPU never appeared on this runner.
- Counters can lie: on the Aura Slam live route `app.diagnostics().drawCalls` reads 0 because the adapter renders through the production runtime; use the `?diag=1` panel (section 6) for draw calls.
- A **blind model judge** is a model, not a human. Protocol (`tools/crayon-capture/heatsink-judge.ts`, `heatsink-judge-lib.ts`, per-game copies `*-judge.ts`): seeded randomised A/B order (`--seed`, default 20261023), balanced within each pass, 48 trials in the runs reported (steps times passes), model `claude-sonnet-5.5` through Kiro Prism by default, accuracy compared with chance (50%) by an exact binomial test, a second prompt that asks "same game design?". Do not weaken the prompt between before and after. Results in this program: the judge identified the original in most trials for ten of the eleven ports after the procedural art pass and again after the Meshy pass (Splat Rush's 8 of 48 was a reversed result caused by the original's cards overflowing at the 640x360 test size, not a pass); the best results were HEATSINK 35 of 48 after Meshy (design-same 40 of 48) and Roadster Hours 39 of 48 after the procedural pass. Phase B ("a judge cannot tell them apart") was **not met** (`docs/workflows/threejs-parity-gaps.md` sections 12.6 and 12.7).

## 5. The art pass loop

1. **Measure the target.** `tools/crayon-capture/look-dump.ts` (and `look-dump-features.ts`, `look-dump-summary.ts`) write `evidence/look-specs/<game>.json` and `<game>.features.json`: renderer settings, camera, lights, fog, background, material table, post chain, geometry sizes, key bindings, screens and the `unported` list. Reference frames land in `evidence/look-reference-frames/` (gitignored). Match numbers (exposure, tone mapping, bloom, fog colour), not impressions.
2. **Use the engine's quality features first**: PBR materials, environments and HDRI, cascaded shadows, fog, `effects.*`, instanced props, `material.custom` shaders only for effects. Custom shaders write linear light, so use `#include <colorspace_decode>` / `a3dSrgbToLinear` and set `output: { toneMapping: "none" }` when you need authored colours (`docs/api/public-api.md`, `docs/api/glsl-chunks.md`).
3. **Generate assets with a budget.** Generation goes only through Kiro Prism (`/v1/meshy/openapi/{path}`), never directly, using the Prism credential from its approved location; never print, log or store a credential and never write one into a repo file. Costs measured against the pool: preview 20 credits and refine 10 (a full model is 30); remesh 5, rigging 5, animate 3 and retexture 10 are the published figures and were not measured. Rules that held: text prompts only; look at the preview before refining; do not regenerate to chase small differences; per-game caps plus a global cap enforced by a locked ledger (`aura3d meshy ledger`, `docs/api/cli-asset-tools.md`; during this program a helper under `/tmp/meshy/` with a 10,000-credit global cap did the same job, and the CLI ledger's default global cap is 1,000, so pass `--global-cap`). A rate-limited poll does not mean a task failed: the task usually finishes and is charged, so resume it with `meshy <resource> get <id>` and reconcile instead of re-creating.
4. **Post-process and admit.** `aura3d assets optimize --file in.glb --out out.glb --role hero|vehicle|character|prop|background` (budgets: hero and vehicle 40,000 vertices, character 30,000, background 15,000, prop 6,000; textures at most 2048 px, 1024 for props and backgrounds), `aura3d assets merge-clips` to combine animation clips onto a rig, and `aura3d assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>` for isolated admission (the default inside the monorepo). Keep provenance (prompt text, task ids, date) in `examples/<game>-port/assets/ATTRIBUTION.md` and the `provenance/` folder.
5. **Production bridge rules.** The production bridge refuses `model()` URLs that are http(s) or that lack a `sha256` and provenance, and the scene then draws nothing (drawCalls 0) while game state keeps advancing. Use same-origin paths with hashes (`defineModelAssets` in `docs/api/model-loader.md`, or the per-port `models.ts` pattern) and give every model a procedural fallback (`?models=0`).
6. **Budgets.** New assets per game about 10 MB (whole port at most about 25 MB; Roadster Hours shipped 6.9 MB, Ninja Runner about 18 MB, Drift about 16 MB), draw calls as low as the look allows (merge static pieces per material, instance repeated props with `instances.*`, `scatter*` and `mergeStatic*` in `docs/api/scatter-merge.md`, no shadow casting on small props). Typical results: Ninja Runner 1,249 to 133 draw calls, Cloud Runner 505 to 187, Last Train 677 to 137, Drift 1,980 to 85-123 before the Meshy pass.
7. **Measure before and after at the same states** (frames plus metrics, and the judge) and say plainly what still looks weak; store frames under `evidence/<game>-port/` (use `git add -f` for jpgs that are ours; `evidence/look-reference-frames/` stays out).

## 6. Safety and the real-device checklist

Before anything goes to production:

- Mount the safety net: `installSafetyNet({ safety: true, canvas, app })` from `@aura3d/debug` (`docs/api/safety-net.md`). It parses `?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1`, shows the `?diag=1` GPU panel (GPU name, limits, extensions, draw calls, shader compile and link failures, context loss, recent errors) and runs the black-frame self-heal ladder. It is opt-in. The showcase wrappers use `apps/showcase-port-shared/diag.ts` and `blackframe.ts`.
- Write a live smoke spec with render checks, not just state hooks: page boots, 0 console errors, non-blank canvas (pixel variance), `drawCalls > 0`, state advances, every asset URL returns 200 (`tests/browser/live-ports-smoke.spec.ts`; also `live-ports-hidpi.spec.ts`, `live-ports-gl-limits.spec.ts`, `live-pinfix-ab.spec.ts`). Playwright's `click()` stalls on software GL: use per-game start rules, real pointer events where needed, and long timeouts.
- **Real device check.** Have the owner open the page on a real GPU with `?diag=1` and send a screenshot. This is how the Apple M4 Max (ANGLE Metal, WebGL2, 16 texture units, all extensions present, 123 draw calls and a black frame) report ruled out WebGPU selection (`backend ?? "webgl2"` in `packages/engine/src/agent-api/compiler/renderer.ts`) and texture-unit limits, and pointed at a NaN in a custom shader. Nothing in a software run substitutes for it.
- **Deploy from a clean export, never the working tree.** The dirty shared tree had 16,143 files and failed Vercel's 15,000-item limit (and the retry with `--archive=tgz` failed). The recipe that worked: `git worktree add --detach /tmp/aura3d-deploy <SHA>`; copy `.vercel/project.json` into it; `rsync -a --ignore-existing fixtures/` from the main checkout (brings the gitignored `fixtures/asset-corpus/boom-box.glb`); then `vercel-auraone deploy --prod --yes` from the worktree (about 13.8k files **[agent-reported]**, under the limit); verify the live entry chunk hashes changed and the assets return 200; remove the worktree. Use only the `vercel-auraone` launcher; never login, logout or token variables. `.vercelignore` excludes `artifacts/`, `tests/reports/`, `downloads/` and similar.
- Keep wrappers honest: `node tools/showcase-port-pages/sync.mjs --check` rebuilds each `apps/showcase-<slug>-port/index.html` from the example page; edit the disclosure text per port and keep `apps/showcase-index/index.html` and both `llms.txt` copies in step.

## 7. Pitfalls and how they were fixed

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Whole scene black on a real Apple GPU, HUD fine, engine reports draws | `pow()` of a slightly negative base in a custom shader (headlight beam) gives NaN on Apple GPUs; bloom smears it over the frame | `49da9a63c`: clamped beam, safe `pow` for every `material.custom`, finite-sample guards in output and bloom, self-heal; cause is the leading explanation, not proven on hardware |
| Blank canvas, no error | `instances.*` with an empty array threw at build and draw time, stopping the frame | `2f5856992` (zero instances is a no-op with an `INSTANCES_EMPTY` diagnostic; shared texture cache) |
| Instanced and batched models drawn with white textures | the batched/instanced handler skipped the textured upgrade, so every map slot was dropped; a multi-geometry `batched.mesh` drew nothing without `tiers.batching` | `2302b45c6` |
| Sun shadow darkens half the ground | forward path picks one cascade per item; fragments beyond its depth range compared against cleared depth 1.0 and counted as shadowed (shows with a narrow-fov, far camera) | `a952d9d27` (clamp receiver depth in every directional sampler) |
| Models draw nothing in production but work in dev | production bridge refuses http(s) `model()` URLs and models without `sha256` and provenance | same-origin hashed URLs, `defineModelAssets` (`d6ce480b7`); Silt & Signal's computed asset URLs became `/assets/assets/...` 404s, fixed in `0ce940dfb` |
| Custom-shader colours grey or washed | custom shaders write linear light; the output stage sRGB-encodes and the default ACES operator tones it down; post effects were not the cause | `#include <colorspace_decode>`, tone mapping `none`, doc fix (`a958dcbca`; chunk library `3efcc50c4`) |
| Custom shader draws nothing | a declared uniform or vertex attribute the GL compiler removed made binding fail and the draw was skipped | unused uniform: 4.0.7 (`55cd26d73`); unused attribute: `a958dcbca` (`CUSTOM_ATTRIBUTE_UNUSED` warning) |
| View-space effects (headlight beam) invisible | `material.custom` received identity view and projection matrices on the app path | `8045c31a9` |
| Built page ships an empty entry or instanced scenes draw nothing | `sideEffects` allowlist tree-shook bare imports and self-registering modules | `2ea1c0770`, then the allowlist covers examples, apps and templates in `d6ce480b7` |
| Models look fine but `createGame` is a stub | `@aura3d/engine/game` needed `qualityRebuild: { flags: ["game"] }` | `1b91e0de6` (lane defaults on; the root stub logs `CREATE_GAME_STUB`) |
| `aura3d assets import-meshy` / `validate` edits `aura.assets.json`, `src/aura-assets.ts` (~127k-line typegen diff), `public/aura-assets/*` from many agents | shared root files written by every admission | isolated admission by default (`d255355cd`); never run admission from the repo root in parallel |
| One game shows another game's model | `meshy.mjs prep` wrote `<name>.raw.glb` with no game prefix and kept the first file | game-prefixed names (`<slug>-<role>`) and a required game tag in the ledger (`d255355cd`) |
| Ledger shows fewer credits than were spent | rate-limited polls were recorded as failed | `unconfirmed` settlement that keeps counting, then reconcile (`d255355cd`); compare the ledger with the real pool balance |
| Runtime textures missing on a clean checkout | repo `*.jpg` ignore rule | `.gitignore` negations for runtime textures and evidence (Silt in `909ad506e`, Kid Goku in `a958dcbca`); evidence jpgs need `git add -f` |
| `pnpm` in a worktree tries to delete modules | it ran an install against the symlinked `node_modules` (aborted only for lack of a terminal; the main `node_modules` stayed intact) | call binaries directly; never run `pnpm` there |
| `git add -A` stages `node_modules` symlinks | the repo's `node_modules/` ignore does not match symlinks | add files by path |
| Remote run fails with a shell syntax error mid-run | another agent edited `tools/remote-acr/run.sh` while runs were in flight | use a private copy of the script for long runs; coordinate edits to shared tooling |
| Deploy of the working tree fails or ships half-finished work | 16,143 files, and other agents' uncommitted edits | deploy from a clean worktree of a commit (section 6) |
| Autoplay differs after a window resize | adapter logic advances inside `render()` | one render per step in the port (section 2, step 6) |

## 8. Orchestrating many agents

Lessons from running 20+ agents at once:

- **One worktree per agent**, created off the latest `origin/main`, pushing its own commits and rebasing before each push. The shared checkout was 40 commits behind with 225 uncommitted files by the end; reconciling it needed a dedicated integration pass with a backup first.
- **Additive contract changes only; disjoint file ownership.** Shared generated files (`docs/api/public-api.md`, `CHANGELOG.md`, export ledgers, `llms.txt` and skill mirrors) are touched only in the final commit after a rebase, and regenerated with the repo tools instead of hand-merged. `public-api.md` was already stale on `main` and regenerating it produced a ~540-line unrelated diff, so regenerate it once at release time.
- **Never deploy the shared tree**, and never `git stash` in a worktree (stashes are shared across worktrees).
- **An interim stop is not completion.** Agents routinely stop while remote runs are still building; wait for the final report, and do not count an agent as done until it says so. Several progress counts during this program were overstated for exactly this reason.
- **Compare the ledger with the real balance.** The ledger is bookkeeping; the Prism Meshy dashboard is the truth.
- **Write the spec for the gap you found.** Every engine bug above got a minimal repro, a unit test and a remote pixel test before the fix, and the shadow bug was only reproduced once the right camera (narrow fov, far) was used.
- **Verify claims against the repo.** Two relayed claims were wrong during this program (that `@aura3d/engine/game` was not published, and that the post chain re-encoded custom-shader colours); a fresh published-package install and a measurement settled each.

## 9. Checklist

- [ ] Scope, legal boundary and phases written down.
- [ ] Deterministic reference captured: at least 2 sessions, variance measured, tolerance derived, frames and metrics saved.
- [ ] Architecture and typed contract merged; file ownership assigned.
- [ ] Each module transcribed with differential tests against the original (G2); replay gate G1 written early.
- [ ] Render parity thresholds set from baseline noise (G3); honest limits stated.
- [ ] Assets generated under caps, optimised, admitted in isolation, provenance recorded, production-bridge rules met, draw-call and size budgets met (G6).
- [ ] Safety net mounted; live smoke spec asserts rendering; real-device screenshot with `?diag=1` received.
- [ ] Deployed from a clean export; entry hashes and asset URLs verified; wrappers and disclosures honest.
- [ ] Extractions to the library done only after the module is green, one kit per commit, with the port migrated and tests unchanged.
