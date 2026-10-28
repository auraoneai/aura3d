# WP-5: frame submission residue (cube CPU in `frame()`)

Branch `beat3js2/wp5-frame-submission`, PRD `docs/prds/beat-threejs/PRD-beat-threejs-2-remaining-gaps.md` WP-5 (P2, G4). Software WebGL2 (SwiftShader) on the Azure ACR runner, 640x360, dpr 1, one box with `material.pbr`, ambient light, `quality: "auto"` (direct path). Remote runs via `tools/remote-acr/run.sh`, spec `tests/browser/frame-cost.spec.ts`.

## Verdict

**P2 is not met.** The gate figure (median of `frame()` CPU over 60 frames after 10 warm-up frames, `cpuMsMedian`) went from 1.5 ms to 1.1 ms in a concurrent A/B (earlier single runs: 1.3, 1.2, 1.2 before; the candidate run recorded 1.1). A settled frame (110 warm-up frames) went from 1.0 ms to 0.8 ms. The target is <= 0.5 ms. The measured floor and its cause are below.

What did move, deterministically and in the profile: the JS the engine runs per frame fell by 46% (profiled, same time window, settled: 0.894 to 0.486 ms per `step()`), and the bytes allocated per frame fell by about 39% (385 KB to 235 KB, measured in node with a counting WebGL2 context). Frames are unchanged (see "No behaviour change").

## Where the CPU actually goes

Method: the V8 sampling profile that `frame-cost.spec.ts` prints (now with inclusive times, a pruned call tree, 400 frames at a 100 us interval, taken after 60 settle frames), a GL call census of one steady frame, and a JS-versus-GL split (the same page measured with the submission calls replaced by no-ops).

1. **The 39 GL calls are not the cost.** P1 cut the calls 39 to 18 with a cross-frame state cache and moved neither CPU nor frame time. The split measurement agrees: with every draw, bind, uniform, state-setting and clear call stubbed (78 methods) the base frame still cost 0.7 ms median against 1.3 ms with them. On the new build the numbers are 0.6 ms stubbed against 0.8 ms real. The calls account for about 0.2 ms; the rest is JS.
2. **The JS is the pipeline that decides what to submit, executed in full every frame.** Per-frame inclusive time on the base build (ms, concurrent A/B run, 410 frames):

   | function | base | new |
   | --- | --- | --- |
   | `step()` (whole frame) | 0.894 | 0.486 |
   | `Renderer.renderFrame` | 0.666 | 0.382 |
   | forward pass `execute` | 0.280 | 0.161 |
   | `warmGeneratedProgramsSync` (re-derives every draw's program features and key) | 0.130 | 0.051 |
   | `programKey` / `computeProgramKey` (re-serialised 4 to 7 times a frame) | 0.088 | 0.030 |
   | `advance` / `updateCompiledScene` (rebuilds the renderer input) | 0.226 / 0.186 | 0.101 / 0.095 |
   | shadow options (re-reads the page URL, parses it several times) | 0.079 | 0.023 |
   | `getDiagnostics` (copies every live buffer/texture/target set, twice a frame) | 0.034 | 0.012 |
   | `addPasses` + `collect` + `runPhase` (registry `active()` rebuilt and sorted per lookup) | 0.050 | 0.022 |

3. **Cause of the floor.** What remains is spread over about forty functions, none above 0.07 ms: the compile-update of the scene (`createProductionRuntimeRendererInput`, 0.07), the forward-pass draw bookkeeping (`drawItem` 0.126, of which uniforms and texture binds about 0.05), the warm-up pass (0.05), item collection and culling (0.03), `programFeaturesFor`/`getShader` (0.03). These live in the compile and forward-pass files, which re-derive unchanged inputs for one box every frame. The runner is about five times slower per instruction than the machine the node figures come from (0.12 ms per frame locally, with GL calls free). A further halving needs frame-level caching of the compiled scene input and of the program selection for unchanged materials, not more micro-removal; that is the next PRD's cut.
4. **The gate figure is also JIT-bound.** `cpuMsMedian` is taken after 10 warm-up frames, so it covers code that is still in the interpreter and baseline tiers: 1.1 ms there against 0.8 ms after 110 warm-up frames and about 0.5 ms of profiled JS in a fully settled loop. Fewer distinct code paths per frame helps this number most; the memoised lookups do, but not by 2x.
5. **The runner is noisy.** Single runs of the base build gave 1.3, 1.2 and 1.5 ms, and one run of the new build at a busy moment gave 1.4 ms. Any comparison here is therefore done as a concurrent A/B (two ACR runs started together, `wp5-base2` with `packages/` from `beat3js2/integration`, `wp5-new` with this branch, same spec), and the spec now reports one median per cold load plus the minimum.

## What changed

All of it removes work the frame repeated for unchanged inputs, or allocation it did not need. No cross-frame GL state caching was added (the hard rule): the GL state cache is still reset every frame exactly as before.

- `packages/rendering/src/contracts/program.ts`, `contracts/structuralMemo.ts` (new, internal), `program/ProgramKey.ts`, `program/ProgramFeatures.ts`: `computeProgramKey` and the sparse `programKey` sit behind a small ring of recent (record snapshot, key) pairs compared structurally; the key string is still produced by the unchanged `stableSerialize`. `dropUndefined` works in place on the fresh copy it is given.
- `packages/rendering/src/contracts/core.ts`: `Registry.active(flags)` is memoised per flags object whose `values` map is frozen (all resolved `QrFlags`), invalidated by `register`/unregister; flags objects without a frozen `values` (test doubles) are never cached. The returned list is frozen; every caller only iterates it.
- `packages/rendering/src/renderer/coreOutputPostRoute.ts`: `withCoreOutputOff` returns one derived frozen flags object per input, instead of a new object (and a new spread of the values) every frame, which also let the registry memo hit.
- `packages/engine/src/contracts/urlCache.ts` (new, internal, deliberately not exported from `contracts/index.ts`), `contracts/flags.ts`, `agent-api/compiler/lights.ts`, `agent-api/compiler/shadows.ts`: the page URL / search string is parsed once per distinct string; the ambient `prd02LightingOn` result is memoised per href when there is no `process` (a browser), and still resolved each call when `process.env` exists.
- `packages/rendering/src/WebGL2StateCache.ts`: no tuple allocation on the skip path, numeric keys instead of template strings for texture/buffer/framebuffer shadows, running issued/skipped totals (the snapshot shape is unchanged). `webgl2/Samplers.ts`: numeric unit keys, sampler key built once per (sampler, target kind, mode). `WebGL2Device.ts`: `getDiagnostics` makes single passes over the live sets and reads the state-cache totals without building `stats()`.
- `packages/engine/src/agent-api/app/frameLoop.ts`, `app/routeState.ts`: no per-frame `[w, h]` tuple while the size is unchanged, no per-frame argument allocation for the authored-resize check, and the `data-aura3d-draw-calls` attribute is only written when the number changes.
- Tests: `tests/unit/rendering/frame-submission-budget.test.ts` (GL call count, no GPU object creation, getError sampling, per-frame allocation budget, and a cold-start-equals-second-app check, on the counting fake context in `tests/support/fakeWebGl2.ts`), `tests/unit/rendering/frame-submission-memo.test.ts` (the memos against a reference serialiser, mutation aliasing, registry invalidation, non-frozen flags, URL cache). `tests/browser/frame-cost.spec.ts` now reports inclusive profile times and the call tree, per-load medians, the settled median and the JS-versus-GL split; `frame-cost-harness.ts` takes an optional warm-up count.

## Measurements

Remote, software WebGL2, concurrent A/B (`wp5-base2` vs `wp5-new`), ms:

| | base | new |
| --- | --- | --- |
| cube `cpuMsMedian` (gate figure), per cold load | 1.9, 1.3, 1.5 (median 1.5) | 1.1, 1.3, 1.1 (median 1.1) |
| cube settled median, per cold load | 1.2, 1.1, 1.0 (median 1.0) | 0.8, 0.8, 0.8 (median 0.8) |
| PBR stand-in `cpuMsMedian` / settled | 5.2 / 3.4 | 3.8 / 2.6 |
| cube `quality: "production"` `cpuMsMedian` | 3.3 | 2.7 |
| cube, GL calls stubbed (JS only) vs real, median | 0.7 vs 1.3 | 0.6 vs 0.8 |
| profiled `step()` per frame, settled | 0.894 | 0.486 |
| draws / blits / console problems | 1 / 0 / none | 1 / 0 / none |

Earlier single runs of the base build: `cpuMsMedian` 1.3 (`wp5-base`), 1.2 (`wp5-r1`, with part of the changes), 1.4 (`wp5-r3`, busy runner).

Deterministic, node with the counting WebGL2 context (`process.env` emptied, as in a browser), 3,000 frames after 300 settle frames:

| | base | new |
| --- | --- | --- |
| bytes allocated per frame | 385 KB | 235 KB to 250 KB |
| JS time per frame (GL calls cost nothing) | 0.155 to 0.23 ms | 0.113 to 0.14 ms |
| GL calls per steady frame (fake context, 3 more texture units than a real driver) | 51 | 51 |

`frame-submission-budget.test.ts` fails on the base build (362 KB per frame against a 300 KB budget) and passes on this branch; its GL-call and cold-start checks pass on both, which is the "same frames, same calls" evidence.

## No behaviour change

- Program keys: the memo returns exactly `stableSerialize`'s string (checked against a reference copy of the old serialiser for reordered, sparse, undefined-leaf and mutated-after-memo records).
- Errors are not masked: `webgl2-sampled-error-policy`, `webgl2-error-check-mode` and `post-chain-texture-unit-shadow` pass; the sampled `getError` policy and the per-frame state-cache reset are untouched, and the budget test asserts at most one `getError` read per four steady frames on the fake context (one per 60 in practice).
- `quality: "production"` takes none of the changed paths differently: its draws/blits/msaa targets are identical in the A/B above (2 / 1 / the same two 4x targets).
- Unit failures were compared with `beat3js2/integration`: of 399 failing tests in `tests/unit`, `tests/integration` and `tests/qr` on this worktree (missing ignored GLB/HDRI fixtures, `glslangValidator`, the stale `getUniformBlockIndex` mock in `current-routes-webgl2-hot-path`), none fails only on this branch. Four tests that failed only in the one full-suite run on this branch (admission-geometry regeneration, city, racket-scoring, roadster meshy) pass when run alone and are load-sensitive. `tsc -p tsconfig.build.json` passes.
- Visual frames were not captured separately: none of the changes touches shading, state or draw order, and the A/B draw counts, blits and console output are identical. The auto-versus-production pixel gate is WP-1's run.

## Next cut (from the profile)

1. Memoise the compiled renderer input (`updateCompiledSceneReal` / `createProductionRuntimeRendererInput`, 0.095 ms) for a scene whose only change is a runtime node transform.
2. Skip `warmGeneratedProgramsSync` and per-draw `programFeaturesFor` when the material revision, light axes, environment and output colour space are unchanged (0.08 ms together); needs a signature that covers `ShaderFeature.select` inputs.
3. Remove the structural-compare cost the memo itself adds (0.03 ms) by leasing the program handle per material instead of re-keying.
4. Re-measure with the bench harness (`tools/bench-vs-threejs`) once those land; its warm-up is 10 frames, like the gate figure here.

## Raw lines (runner output, `FRAME_COST` / `FRAME_COST_GL_SPLIT`)

```
wp5-base2 cube/auto: cpuMsMedian 1.5, cpuMsSettledMedian 1.0, cpuMsMediansPerLoad [1.9,1.3,1.5], cpuMsSettledMediansPerLoad [1.2,1.1,1.0], drawCalls 1
wp5-base2 pbr/auto : cpuMsMedian 5.2, cpuMsSettledMedian 3.4, drawCalls 15
wp5-base2 cube/production: cpuMsMedian 3.3, drawCalls 2, blits 1
wp5-base2 GL_SPLIT: stubbedMethods 78, realMedian 1.3, stubbedMedian 0.7
wp5-new   cube/auto: cpuMsMedian 1.1, cpuMsSettledMedian 0.8, cpuMsMediansPerLoad [1.1,1.3,1.1], cpuMsSettledMediansPerLoad [0.8,0.8,0.8], drawCalls 1
wp5-new   pbr/auto : cpuMsMedian 3.8, cpuMsSettledMedian 2.6, drawCalls 15
wp5-new   cube/production: cpuMsMedian 2.7, drawCalls 2, blits 1
wp5-new   GL_SPLIT: stubbedMethods 78, realMedian 0.8, stubbedMedian 0.6
```
