# Benchmark C1: fixed agent-authoring comparison (spec, frozen 2026-11-09)

Plan item C1 (`docs/project/future-engine-work.md`, section 4 and the 5.5.1 task list). The question: did the shipped
native-authoring fixes N1-N8 and the three.js asset bridge B1 cut the turns, tokens, time and cost an AI agent needs to
build a scene in Aura3D, compared with three.js? This file fixes the tasks, arms, measurements and scoring rules
**before any model run exists**. It is not edited after the first paid run. Results go to `REPORT.md` beside it.

Harness: `tools/agent-eval/c1/` (manifest `tasks.json`, task text `tasks/`, checklists `tasks/checklists.json`, probes
`probes.mjs`, decision thresholds `report.mjs`). Baseline: benchmark 505 (24 tasks x 3 runs, summarised in section 4 of
the plan: median turns 25 docs / 14 cheat sheet / 5 three.js, median tokens 1.45M / 420K / 63K). 505 has no single
REPORT file; its runs are on the `bench/505-<category>` branches under `evidence/agent-eval-505/`.

## 1. Tasks (8, one per required category)

Task text is copied verbatim from the 505 lane branches, so the main phase compares directly with 505. Every run also
gets one predefined follow-up edit in the same conversation. The 2026-11-08 draft (garden, lighthouse, plinko) was
replaced before any model run: it had no product viewer, interior or presentation task.

| id | covers | 505 source (branch:file) | 505 median turns docs / sheet / three | follow-up edit |
|---|---|---|---|---|
| 101 | character / animation | `bench/505-animation:10-walking-spider.md` | 13 / 5 / 5 | Space toggles walking and paused; `walking` in state |
| 102 | shader / effect | `bench/505-effects:11-effects-portal.md` | 25 / 11 / 5 | 'Close portal' / 'Open portal' button |
| 103 | outdoor | `bench/505-environments:10-desert-canyon.md` | 25 / 23 / 8 | 'Pause flythrough' / 'Resume flythrough' button; camera position in state |
| 104 | small game | `bench/505-games:12-games-2.md` (stacker) | 19 / 11 / 4 | P pauses (drops ignored, slab frozen, HUD 'Paused') |
| 106 | materials (metal, glass) | `bench/505-materials:10-materials-1.md` | 20 / 16 / 6 | keys 1/2/3 select and spin a sphere; `selected` in state |
| 109 | product viewer | `bench/505-materials:11-materials-2.md` (car paint on a turntable) | 33 / 13 / 6 | 'Red' / 'Blue' / 'Black' paint buttons; `paintColor` in state |
| 110 | interior | `bench/505-animation:11-pendulum-clock.md` (warm room) | 13 / 7 / 4 | 'Lights off' / 'Lights on' night toggle; `lightsOn`, `pendulumAngleDeg` in state |
| 111 | animated presentation | `bench/505-interactive:11-interactive-solar.md` | 37 / 24 / 4 | 'Tour' / 'Stop tour' guided tour, innermost planet first; `touring` in state |

The exact follow-up wording is in `tasks.json`. Caps: 40 turns for the task, 15 for the follow-up. 3 runs per task and
arm: 8 x 3 x 3 = 72 runs.

## 2. Arms

All three arms use the same model, route, caps, sandbox, scaffold (`index.html` with a 640x360 `#app` canvas,
`tsconfig.json`, `package.json` with `build: vite build`) and base tools: `list_dir`, `read_file`, `write_file`,
`edit_file`, `search` (ripgrep), `typecheck` (`tsc --noEmit`), `finish`. No shell, no network. Everything an arm
does counts: authoring, bridge export, CLI tool calls, repairs, and the follow-up.

| arm | packages (npm) | docs in the sandbox | extra tools |
|---|---|---|---|
| `aura`: native Aura3D | `@aura3d/engine`, `@aura3d/assets`, `@aura3d/cli` at 5.5.0; vite 7.3.2; typescript 5.9.3 | `llms.txt` (in 5.5.0 it opens with the first-screen cheat sheet), `AGENTS.md`, `docs/agents/**` (incl. `first-screen.md`, `agent-tools.md`), `.agents/skills/**`, exported from the 5.5.0 release commit | `aura3d`: the N6 CLI agent tools `info`, `examples`, `validate`, `render` (render returns its JSON report and the screenshot as an image) |
| `three`: plain three.js | `three` 0.185.1, `@types/three` 0.185.4; same vite and typescript | none (as in 505) | none |
| `bridge`: three.js + B1 bridge | the `aura` packages plus `three` 0.185.1 and `@types/three` for factories | the `aura` docs (incl. `docs/agents/three-bridge.md`) plus `BRIDGE.md` (how the tools map onto the B1 workflow) | `aura3d` as above, and `import_three`: runs `aura3d import-three recipes/<name>.mjs [--name] [--seed] [--params] --json` |

The bridge arm authors the scene's content (geometry, materials, lights, camera, clips, simple shaders) as a three.js
factory under `recipes/`, imports it with `import_three`, and writes behaviour (input, state, UI, per-frame logic) as
native Aura3D code in `src/`. 505's "cheat sheet" condition (A) swapped `llms.txt` for a separate sheet; in 5.5.0
`llms.txt` is that sheet, so C1 runs the plain doc set (condition `base`).

Two harness details, fixed during the dry run and before any model run:

- The Aura3D arms' `public/` holds what `create-aura3d` ships for looks (`hdri/`, `aura-environments/`, from the
  installed `create-aura3d` of the same version). The 5.5.0 docs tell the agent scaffolds ship these files; without
  them every look preset 404s, which is a page error. Their bytes are reported apart from the app's dist size.
- `typecheck` runs the sandbox's own TypeScript 5.9.3 through its API in the run's worker thread (same diagnostics as
  `tsc --noEmit`). This Mac's process governor throttles `tsc` subprocesses, which would put its waits into tool and
  wall time. Only the newest `render` screenshot stays in the conversation; older ones become a one-line note, which
  keeps requests under Prism's 1.5 MB cap.

## 3. Model and route

Same route as benchmark 505, so the two are comparable: Kiro Prism, Anthropic-compatible Messages API
(`https://prism.auraone.ai/v1/messages`), model `claude-sonnet-5.5`, `max_tokens` 8192 per turn, headers
`X-Prism-Client: aura3d-agent-eval`, `X-Prism-Job-Type: agent-eval` (judges: `agent-eval-judge`), one
`X-Prism-Session` per run. Run order is shuffled with a fixed seed (`buildPlan`, seed 20261108). Concurrency 6;
every run in its own worker thread so tool calls do not inflate other runs' clocks.

## 4. Measurements per run

From the run (`run.json`, schema `aura3d.agent-eval.c1-run/1`), per phase and in total:

- turns; end reason (finished, max_turns, stopped_without_finish, max_output_tokens, infra_error);
- tokens from provider usage: input (uncached + cache read + cache write), output; per turn;
- wall time (agent session, harness work between phases excluded), model time, tool time (inside tool calls,
  including `aura3d render` builds and bridge exports);
- billed cost: provider USD > provider credits x `AGENT_EVAL_USD_PER_CREDIT` > list price on the token split, the
  source stored with every number;
- bridge exports (count, failures, ms), CLI tool calls, typecheck after each phase.

From the scorer (`score.mjs`, after each phase, the agent's tools are no longer involved):

- stock `vite build` (ok, ms) and dist size (total, JS, JS gzip, assets);
- real GPU: headless Chrome (ANGLE Metal) driven over a loopback CDP socket, never Playwright. Load time to the ready
  flag, bytes fetched, runtime fps and p95 frame time over 3 s, page errors, two frames 3 s apart;
- the functional probes (section 5) on a fresh load each; after the follow-up, the follow-up probe and the main probe
  again (regression check).

## 5. Functional correctness (scripted checks, fixed here)

A probe returns named checks; "functional all pass" means every check of the probe passed. A missing state field or
button is a failed check, never a probe error. Main probe / follow-up probe checks:

| id | main probe checks | follow-up probe checks |
|---|---|---|
| 101 | `animatesWithoutInput` | `startsWalking`, `spacePauses`, `pauseFreezesPose`, `spaceResumes` |
| 102 | `portalActive`, `particlesLive`, `timeAdvances`, `animated` | `closeButton`, `closes`, `labelSwitches`, `reopens` |
| 103 | `flythroughMoves` | `flyingAtStart`, `pauseStopsCamera`, `resumeMovesCamera` |
| 104 | `startsPlaying`, `dropStacks`, `gameEnds`, `hudShowsScore`, `restartResets` | `pPauses`, `hudSaysPaused`, `pausedIgnoresDrop`, `pausedFreezesSlab`, `pResumes` |
| 106 | `threeSpheresNamed`, `keyLightDrifts` | `nullBeforeKey`, `key2SelectsMetal`, `key3SelectsFabric`, `key1SelectsGlass` |
| 109 | `clearcoatState`, `turntableTurns`, `turntableRate` (10-30 deg/s), `animated` | `startsRed`, `blueButton`, `frameShiftsBlue` (frame mean B-R rises), `blackButton`, `redRestores` |
| 110 | `pendulumMoves` | `stateExposed`, `pendulumSwings` (angle changes sign within 1.5 s), `lightsOffButton`, `lightsOffDims` (frame mean luma drops >= 10%), `lightsOnRestores` |
| 111 | `readyState` (>= 6 planets with positions), `planetsOrbit`, `focusApi`, `panelShowsName`, `cameraFollows`, `escapeReturns`, `pauseFreezes`, `playResumes` | `tourButton`, `tourOrderInnerToOuter`, `stopTourReturns` |

Animation is "moving" when the mean RGB difference between two frames exceeds 0.2 (as in 505).

## 6. Visual quality (blind rubric on real-GPU frames)

- Input: the two frames 3 s apart from the main phase, per run. Pairs per task and run index: aura vs three,
  bridge vs three, bridge vs aura (24 pairs each, 72 in total). A/B order is randomised with a fixed seed; the judge
  sees only pixels and the task text, never code or library names.
- Rubric (`judge.mjs`, `RUBRIC`): each candidate scored 1-5 on readability, lighting, materials, fidelity to the task,
  polish; then a winner (A, B or tie). Three calls per pair, majority vote; a split is a tie. Win rate = (wins +
  ties / 2) / judged pairs, with a Wilson 95% interval. A side with no frame (its build failed) loses the pair
  without a judge call; a blank frame is judged like any other; a pair with no frame on either side is not judged.
- Secondary: a checklist judge per run (`tasks/checklists.json`, 8-10 items per task, from the 505 lanes) reading the
  source, probe results and build/page errors.

## 7. Aggregation and reporting

- Per arm: medians and ranges (min-max) of turns, input and output tokens, wall time, tool time, billed cost; rates of
  finished, capped, rendered, functional-all-pass (main and follow-up) and regressions; medians of JS gzip, loaded
  bytes, load time, fps. Per task and arm: the same medians.
- Every valid run counts, including capped and failed ones (a run that never builds counts as functional 0). A run is
  invalid only for an infrastructure error (Prism outage, harness crash); those, and only those, are re-run with
  `--only`. A valid run is never re-run because its result is bad.
- 505 comparison: main-phase turns and tokens of the `aura` arm against the 505 docs and cheat-sheet medians of the
  same 8 tasks, and of the `three` arm against 505 three.js.

## 8. Bridge decision rule (thresholds fixed in `report.mjs`)

Keep the bridge as a supported route if, against the `aura` arm on the same version, it has >= 25% lower median wall
time or billed cost at comparable quality and correctness, or clearly better quality at comparable time and cost.

- comparable quality: bridge-vs-aura blind win rate 0.40-0.60; clearly better: >= 0.65;
- comparable correctness: main-phase functional-all-pass rate no more than 10 points lower;
- comparable time and cost: neither more than 10% higher.

The rule is applied to all 8 tasks and separately to the procedural-asset tasks (101 spider, 109 product body,
110 clock case; `assetHeavy` in `tasks.json`). If it passes only on the asset subset, the verdict is "support the
bridge for assets only". If native authoring is competitive (rule not met), native stays the default.

## 9. Budget

Planned spend is printed by `run-c1.mjs --estimate` and recorded in REPORT.md together with the actual billed total.
