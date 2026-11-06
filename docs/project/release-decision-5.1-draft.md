# Aura3D release decision (draft for the owner)

Date: 2026-11-06 (15:05 PST). Status: draft. No numbers below are new measurements; each is quoted from a file named next to it. Where something has not been run it says "unverified" or "unmeasured".

Bottom line:
1. 5.0.3 is not releasable yet. Rerun 051 on candidate `a0018400` is still in its `packed-a` stage (last log line: `bundle-size` started). The previous run (050, on `e39a0b4a6`) failed two gates, `api-diff` and `api-docs`. Browser acceptance, render gate on the candidate and publishing are not run.
2. The visual gap to three.js is real in the one trial we have (three.js wins 14 of 21 pairs; 11 of 12 with the cheat sheet) and is not a turns problem. The cause is not yet attributed; the pending neutral 24-task benchmark replaces section 2.
3. Recommended 5.1 scope: 19 register gaps, about 29 to 40 engineer-weeks of engine work (sections 3 and 5), proven by one spatial-data viewer benchmarked against an equivalent three.js viewer.

## 1. What 5.0.3 still needs before release

Candidate: branch `release/5.0.3` at `tests/reports/release-503`, HEAD `a00184009` ("keep 5.0.3 public declarations identical to 5.0.2"), on top of `e39a0b4a6` (version, changelog, generated docs, catalog digests). The branch is 81 commits ahead and 4 behind `origin/main` (git status; the 4 are not reviewed here).

Evidence: run 050 = `tests/reports/release-503/tests/reports/release-503/logs/050.log` and `tests/reports/native-5/native-5-source-050/` (ran on `e39a0b4a6`, not on the current HEAD). Run 051 = `logs/051.log` and `native-5-source-051/acr-run-packed-a.log`.

| Gate | Evidence | Status |
|---|---|---|
| Build, pack, package-dist unit, api-baseline, integration, packages-dist, verify-exports, verify-imports, tarballs, bundle-size | 050.log: all PASS (13 of 15 stages passed) | done on `e39a0b4a6`; unverified on `a00184009` (051 at `bundle-size`, no result yet) |
| API compatibility (`api-diff`, packed public-surface diff) | 050: FAIL, "1 breaking changes; 0 declaration diagnostics; 0 runtime diagnostics". Fix commit `a00184009` hooks the WebGPU depth-gap check instead of exporting it; CHANGELOG now says "declarations identical to 5.0.2" | failing in 050; fix unverified until 051 passes `api-diff` |
| API contract (`api-contract`, 121 entrypoints) | 050: PASS | done on `e39a0b4a6`; unverified on `a00184009` |
| Generated API docs | 050: `api-docs-packed` PASS, but `api-docs` FAIL: "docs/api/public-api.md is not current with package entrypoint exports. Run pnpm verify:api-docs -- --write." `a00184009` touches 4 files, none is `docs/api/public-api.md` | failing; may clear because the export change was reverted, otherwise needs a regenerate commit and another run |
| Source tests | 050 ran the packed-a stage set above; the plan's "source pass 54/54" (plan E2) was not reached: 13 passed, 2 failed | unverified (051 in progress) |
| Rendering (render gate: 25 games, 20 templates, real browser) | CHANGELOG 5.0.3 claims all 20 templates rendered and 20 of 25 games show a progress bar; no gate report for `a00184009` was found. Source report `browserAcceptance` for 050 is `not-run` | unverified on the candidate |
| Browser acceptance round 3, WebGPU evidence, device-lost/restored | CHANGELOG "Not fixed / unconfirmed"; 050 `browserAcceptance: not-run` | not run |
| Publishing (npm `next` then `latest`, deprecation of priors, GitHub release, Cloudflare deploy) | Plan E2 checklist item unticked; CHANGELOG is already dated 2026-11-07 | not started |

Release rule I recommend: 5.0.3 ships only when 051 (or a rerun after any further commit) shows all packed-a stages PASS on the exact commit being tagged, the render gate passes on that commit's preview, and the `uTime` item below is resolved at least in docs. If `api-docs` still fails in 051, regenerate and rerun once; if `api-diff` still reports a breaking change, stop and read `api-diff.json` instead of rerunning.

### 1.1 Frozen `uTime` shader water: docs error or engine defect

Observed: with the first cheat sheet (which said `uTime` advances itself) all three task-5 water runs scored checklist 1.0, 0.86, 1.0 while the frame difference between captures 3 s apart was 0.0 (baseline about 24). Source: `evidence/agent-eval-504/RESULTS.md` on `origin/exp/turn-gap-504`.

Code reading in `release-503` (not run): `uTime` is documented as "float seconds" in both stages (`packages/engine/src/agent-api/nodes/types.ts:2920`, `compiler/customMaterial.ts:11`), mapped to `u_time` (`customMaterial.ts:520`), and `u_time` is bound from `options.timeSeconds ?? 0` (`packages/rendering/src/ForwardPass.ts:5054-5055`). I found no non-test caller in `packages/engine` or `packages/rendering` that sets `timeSeconds` outside ForwardPass itself (search not exhaustive).

Verdict: both. The docs (`docs/agents/recipes.md:154,179,499`, `llms.txt:18`) list `uTime` as a working prelude name, and the engine most likely binds it to 0 (hypothesis from code plus the observed zero frame difference; not confirmed by a fix). Plan: (a) in 5.0.3, correct the docs and the comment in `types.ts` to say "declare your own uniform and drive it with `handle.setUniform`" (zero runtime risk); (b) fix the engine to feed the app clock into `timeSeconds` and add a rendered regression test, as a patch after 5.0.3 because it changes frames of any scene that already declares `uTime`; (c) the test: mount a `material.custom` water scene on the real-GPU runner, capture 3 frames at fixed simulated times, assert pairwise frame difference above a threshold chosen from the 24-ish baseline, assert 0 difference when time is paused; add to `tools/release/render-gate`. Typechecking and the checklist judge both missed this, so only rendered multi-frame checks count.

## 2. What explains the visual-quality disadvantage (attribution to be replaced by the neutral benchmark)

Evidence available now is one trial: 7 tasks x 2 arms x 3 runs, one model, one judge (same model), 21 pairs (`origin/lane/503-trial:evidence/agent-eval-503/RESULTS.md`), and the 12-pair rerun in the turn-gap experiment. three.js wins 14 of 21 pairs; with the cheat sheet three.js wins 11 of 12 (mean 16.2 vs 18.1 of 25; baseline 16.8 vs 17.7). Tasks 4 and 5 favour Aura3D (3-0 and 2-1). The neutral 24-task benchmark now running will replace this attribution; nothing here should be quoted externally.

| Candidate cause | Status | Evidence |
|---|---|---|
| Output looks smaller, hazier or flatter in the Aura frames: small cube, hazy low-contrast forest under heavy fog, small dim robot on a large flat floor with a visible edge | evidenced (observation, one judge, montages) | 503 RESULTS "What the frames show" |
| Why: default look settings and documented recipes give flat frames (`environments.neutral` with `metallic: 0.9, roughness: 0.38` still reads flat grey; fog and floor sizing) | hypothesis | 503 RESULTS decision paragraph and plan E3-05 assert it; no controlled test isolates defaults from agent choices |
| Agents converge on identical output when the doc contains a block (task 2 forests pixel-identical, mean 169.2, std 22.1) | evidenced | 504 RESULTS visual section |
| Cheat sheet does not help looks (16.2 vs 16.8, inside judge noise) | evidenced | 504 RESULTS |
| Instances lack shadows: judge flags `castShadow`/`receiveShadow` not set on instances in every task-2 condition (checklist 0.86); `shadow: true` with no receiver on task 1 | evidenced (judge note), visual impact hypothesis | 504 RESULTS "What is unproven"; 503 RESULTS silent no-ops |
| Renderer fidelity itself (tone mapping, AA, lighting model) differs from three.js | hypothesis, no evidence | none in the trials |
| Measurement noise (single judge, n=3 per task, spread 5-22 on one pair, task-5 three.js run nearly white) | evidenced limitation | 503 RESULTS |

## 3. First 5.1 milestone: minimal commercial-capability scope

Principle (E6-00 section 6.2): additive, opt-in, 5.0.3 defaults and golden frames unchanged. Gap ids and efforts are from `tests/reports/e6-00-assessment.md` section 3 (engineer-weeks, estimates not measurements). Selection is mine; the register targets many more items at "5.1".

Single demonstrable deliverable: one Aura3D spatial-data viewer (embedded in a React host) that accepts a simulated sensor stream (point-cloud frames at 10-20 Hz plus moving tracked objects as instances), supports orbit, hover and click on tracked objects and on points, and is benchmarked against an equivalent three.js viewer under the E6-01 protocol. Results are published as a committed JSON plus README (U-01), including losses. If a gap shows up, diagnose it before recommending another engine or a lower-level path.

| Capability | Gap ids | Effort |
|---|---|---|
| Evidence | U-01 benchmark baseline incl. the equivalent three.js runs | 2 |
| Typed mutable-buffer API | U-06 handle contract; P-01 typed `points()`; P-02 in-place points update | 2; 1-2; 2-3 |
| Efficient point-cloud updates | P-02, P-05 WebGL2 point size correctness | 1 |
| Reusable instance updates | I-02 `instances.mesh` allocation, I-07 capacity option | 1-2; 0.6-1 |
| Basic picking and camera | K-01 pick/projection facade; K-03 CPU point picking; K-08 orbit camera with Z-up | 2-3; 4-6; 2-3 |
| React embedding | R-01 handle, R-02 page-global state, R-03 live-data hook, R-04 `onPick`, R-05 input target, R-11 URL flags | 1; 1-2; 2-3; 1; 1; 0.5 |
| Agent-native loop (track B, section 3.1) | D-05 snapshot validator, D-07 typed diagnostics, D-08 `--json` validation | 1-2; 2; 2 |

Sum of the register efforts: engine track A (16 ids) 24.1 to 33.5 engineer-weeks; track B (3 ids) 5 to 6; total 29.1 to 39.5. Not in the register and therefore not estimated: the viewer app, the three.js comparison viewer, the render/inspect glue for the agent loop (plan E3-04). Parallel lanes shorten calendar time but not these totals.

### 3.1 Agent-native verification, re-sequenced into 5.1 (priority 4)

E6-00 places D-07, D-08 and D-09 after 5.1 because they sat behind replay (D-01/D-04). The minimum loop does not need replay, so I move D-05, D-07 and D-08 (with `check-deploy --json` first, 1 week) into 5.1 and leave the rest of D out. The loop: author (scene source, existing templates) -> validate (D-05 `validateSceneSnapshot` on existing scene serialization; `aura3d validate --json`) -> render (existing `tools/release/render-gate` and capture on the real-GPU runner) -> inspect (D-07 coded `diagnostics().issues[]`, frame statistics including multi-frame difference, existing look-lint rows) -> correct (agent edits, rerun). Acceptance: on 10 seeded broken scenes (including frozen shader time, `shadow: true` without receiver, a black frame) the loop reports a coded finding for each and a repaired scene passes, with no human step; the success count is reported as measured, whatever it is. Advanced deterministic replay (D-01 snapshot/seek, D-02 seek, D-03 tiers, D-04 envelope, D-09 headless closed loop, D-10 high-frequency tests) is tracked separately for 5.2 or later with its own acceptance: replay twice from the same input and get identical state digests (Tier A, same build and platform), and the first divergent frame is reported with a typed code.

## 4. Deferred items and why

- Evidence-gated by U-01 (decide after the benchmark): P-03 WebGPU points (4-6, high risk), P-04 stream ring (3), I-03 dirty-range instances, I-04 culling options, K-02 instanced picking, K-04 GPU picking (6-10), K-05 label scale, U-02 incremental scene update (4-6, medium-high risk), U-03 per-frame CPU O(nodes).
- Large, no benchmark case yet: P-06 per-point size/scalar, P-07 chunked LOD, I-06 per-instance attributes, I-09 instanced fat lines, I-10 trail rings, U-05 and R-12 worker mutation path, K-10 screenshot options, R-08 live pixelRatio.
- Small but not needed by the viewer; move to 5.1.x: U-04 on-demand render, P-08 docs, I-05 dead option types, I-01 phase 1 (throw on ignored dense writes; unsplit effort), I-08 trajectory line fast path (2-3; first add if the viewer needs trails), K-06 overlay adapter, K-09 `getWorldMatrix`, R-06 context-loss props, R-07 off-screen observer and multi-instance spec, R-09 host overlay removal, R-10 leak spec, D-02 dropped-time counter, D-03 determinism tiers.
- Replay and scenario track (needs D-01 first, own acceptance in 3.1): D-01, D-04, D-09, D-10.
- Adapter or AuraOne side, not engine core: P-09 decoders, K-07 measurement/annotation, D-06 scenario document, TF store (K-09 second half).
- Not 5.1 and not in the register: E3-05 defaults and look quality, E3-06 guessable API, E3-02 cheat sheet shipping (docs patch once rendered check passes per block), E3-03/04 MCP server. Look quality work waits for the neutral benchmark.

## 5. Effort, regression risks and acceptance criteria (milestone items)

Risk is the register's regression risk to 5.0.3 behaviour. Acceptance is abbreviated from the register; each item also requires existing tests and golden frames to stay green.

| Ids | Effort (eng-weeks) | Regression risk | Measurable acceptance |
|---|---|---|---|
| U-01 | 2 | Low (test-only, runs on ACR, never local) | Committed JSON+README with p50/p95 frame time, memory, dropped frames, upload bytes, hardware for every matrix row, WebGL2 and WebGPU if reachable, three.js rows from the same protocol |
| U-06 | 2 | Low-medium | Kind-narrowed handle types; one documented bulk write across primitive/model/batched; public-API and `aura.exports.json` gates pass |
| P-01, P-02 | 1-2; 2-3 | Low-medium; medium (stale bounds can cull a visible cloud) | 1,000,000-element `Float32Array` cloud mounts with O(1) per-point JS objects and at most one copy; in-place update uses one bulk write plus dirty-range upload; Uint8 RGBA renders identically to float colours |
| P-05 | 1 | Medium (shader edits, golden pixels) | WebGL2 point size matches the documented attenuation in a pixel test at dpr 1 and 2 |
| I-02, I-07 | 1-2; 0.6-1 | Medium; low | 10K `instances.mesh` steady frame allocates 0 typed arrays; pixel-identical output; count above initial size works |
| K-01 | 2-3 | Low-medium | Host subscribes to hover/click on a named node and gets `instanceId`; at most one pick per frame; screen/world round trip within 1e-4 NDC on perspective, orthographic and Z-up cameras; typed `unsupported` in worker mode |
| K-03 | 4-6 | Medium-high (CPU tolerance vs GL point size) | Nearest-point pick on a 100K-point cloud returns the expected index in a unit test; query latency reported at 100K and 1M (unmeasured today) |
| K-08 | 2-3 | Medium (non-Y-up edge cases) | Z-up orbit with pan and wheel zoom in a rendered test; existing Y-up rig tests unchanged |
| R-01..R-05, R-11 | 1; 1-2; 2-3; 1; 1; 0.5 | Low to medium (route-health tooling reads page globals) | Ref exposes `{app, canvas, pause, resume, screenshot}`; two embeds leave no page-global residue after unmount; live-data write does no React render and no `setScene`; `onPick` fires; window input not captured by default; `?a3d-qr=` ignored by default |
| D-05, D-07, D-08 | 1-2; 2; 2 | Low; low-medium; low | Validator round-trips a 5K-node snapshot; `diagnostics().issues[]` carries codes while `errors`/`warnings` stay; `validate` exits 1 with coded rows on invalid input, 0 on valid; the 10-scene loop test of 3.1 |
| Milestone gate | 29.1-39.5 total | | The viewer runs the simulated stream with interaction; benchmark file committed; no 5.0.3 golden frame changes; no performance claim beyond the committed file |

## 6. Claims scorecard

| Claim | Status | Evidence pointer |
|---|---|---|
| All 25 games draw on a real GPU in 5.0.1/5.0.2 | proven (census, owner-run) | Plan E1 (`release-501`, `release-502` real-GPU censuses); 5.0.2 CHANGELOG render gate |
| 20 templates render on a real browser in the 5.0.3 candidate | claimed in CHANGELOG, gate report on `a00184009` not found | `release-503/CHANGELOG.md`; plan E2 |
| Docs release removed 40-turn failures (21/21 finish vs 8/15 before; first-try typecheck 21/21) | proven on this trial (n=3, one model) | 503 RESULTS headline |
| A first-screen cheat sheet cuts turns on measured tasks: median 18 to 4 on tasks 2, 5, 8, 9, finish 12/12, same checklist; holdout tasks 5,9,10 to 5,5,5 | proven for the measured tasks; not proven for arbitrary tasks (sheet contains near-solutions) | 504 RESULTS tables, `turn-gap-findings.md` |
| Cheat sheet or lookup tool improves visual quality | disproven for the sheet (16.2 vs 16.8); lookup not tested for looks | 504 RESULTS visual section |
| Visual parity with three.js | hypothetical, currently contradicted (3 wins of 12, 7 of 21) | 503 and 504 RESULTS; neutral benchmark pending |
| Performance vs three.js (frame time, memory, bundle) | hypothetical; the one data point is bundle size for a one-cube scene 6.4 MB vs 0.5 MB (three.js smaller) | 503 RESULTS decision; E6-00 section 1 (nothing measured); plan E4 (last perf gate 4.5.0) |
| Agent-native advantage over three.js | hypothetical; turns reach parity (3-5 vs 4-5) only with the sheet, tokens 1.4x | 504 RESULTS |
| Spatial-data runtime capability (100K-1M points at 10-20 Hz, 10K instances re-posed, picking, embedding) | hypothetical; E6-00 states "not as a supported, documented path today", all costs unmeasured | E6-00 section 1; U-01 |
| Deterministic replay for agent verification | not supported today (input-only replay, `deterministic: true` literal) | E6-00 section 2.6, D-01/D-03/D-04 |

## 7. Scorecards

### 7.1 Agent-native development

| Metric | Current | Target |
|---|---|---|
| Median turns to a finished scene vs three.js, per task | with sheet 4 vs 4 (tasks 2,5,8,9, n=3); without sheet 10 pooled (range 5-28) vs 4 | within 1.5x of three.js on the 24-task benchmark, n >= 10 |
| Blind-judge win or tie rate vs three.js | 7 of 21 wins, 0 ties (single judge) | >= 50% (plan E3-08) |
| Silent no-ops per run | median 0 to 1 (model judge estimate) | near 0, caught by a coded diagnostic |
| Broken scenes the validate/render/inspect loop catches and repairs without a human | unmeasured (loop not built) | measured on 10 seeded scenes (3.1) |
| Frozen-animation class bugs caught by a rendered multi-frame check | 0 of 3 caught by checklist; caught by frame probe only | 100% in the render gate |

### 7.2 High-performance spatial runtime

| Metric | Current | Target |
|---|---|---|
| p50/p95 frame time, 1K/5K/10K instances re-posed per frame | unmeasured (U-01) | set after U-01 from the three.js protocol runs; not guessed here |
| Point update cost at 100K/250K/1M points, WebGL2 and WebGPU | unmeasured; WebGPU path throws above roughly 155K coloured points per draw (code arithmetic, E6-00) | viewer sustains the simulated stream; number set after U-01 |
| Pick latency (instances, points) | unmeasured | reported at 100K and 1M points |
| Bundle size for a one-cube scene | 6.4 MB (5.0.2) vs 0.5 MB three.js | reduce; target set after the bundle-size review |

### 7.3 Commercial application ecosystem

| Metric | Current | Target |
|---|---|---|
| Foreign React host embeds a viewer without page-global side effects | no handle, page-global state (R-01, R-02); lifecycle solid for one instance | two embeds mount and unmount clean (R-02, R-01 acceptance) |
| Working end-to-end spatial viewer with stream input and interaction | none | one, in 5.1 |
| Games rendering on real GPU | 25 of 25 (5.0.1/5.0.2 census); 5.0.3 render gate unverified | 25 of 25 on the tagged commit |
| Public working examples/templates that render | 20 of 20 claimed in 5.0.3 candidate, gate report not found | 20 of 20 verified by gate on the tag |

## Decisions needed from the owner

None required to start. Items the evidence cannot decide, which affect only later scope: (a) whether LAS/E57 decoders are wanted (adapter track), (b) whether replay targets the native physics backend or Rapier (before D-01), (c) whether a shared-renderer design is acceptable if multi-canvas cost is high (after U-01). All three are listed in E6-00 section 6.1 item 15.
