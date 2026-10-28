# WP-5: frame submission residue (cube CPU in `frame()`)

Branch `beat3js2/wp5-frame-submission-fixes` (on `beat3js2/wp5-frame-submission`), PRD `docs/prds/beat-threejs/PRD-beat-threejs-2-remaining-gaps.md` WP-5 (P2, G4). Software WebGL2 (SwiftShader) on the Azure ACR runner, 640x360, dpr 1, one box with `material.pbr`, ambient light, `quality: "auto"` (direct path). Remote runs via `tools/remote-acr/run.sh`, spec `tests/browser/frame-cost.spec.ts`. Raw runner lines for every figure below are in `evidence/vs-threejs/wp5-frame-submission-raw/` (`base-a`, `new-a`, `base-b`, `new-b`; "base" is `packages/` from `beat3js2/integration`, "new" is this branch, same spec and harness on both).

This file replaces the first version of the WP-5 evidence. That version quoted one A/B with three cold loads per side, mislabelled a last-load figure as a median, and quoted a profile table with no raw lines. The corrections are listed in "Corrections to the first version" at the end.

## Verdict

**P2 is not met.** The target is <= 0.5 ms for the gate figure. Two concurrent A/B pairs, five cold loads per side each, all on the cube:

| `cpuMsMedian` per cold load (ms) | base | new |
| --- | --- | --- |
| pair a | 1.3, 1.3, 1.3, 1.3, 1.3 | 1.3, 1.0, 1.2, 1.2, 1.0 |
| pair b | 1.9, 1.6, 1.5, 1.5, 1.5 | 1.3, 1.0, 1.1, 1.1, 1.0 |
| median of the five loads, pair a / pair b | 1.3 / 1.5 | 1.2 / 1.1 |
| settled (110 warm-up frames), median of the five loads, a / b | 1.1 / 1.3 | 0.9 / 0.9 |

Every one of the ten base loads is >= 1.3 ms and every one of the ten new loads is <= 1.3 ms, so the direction is consistent. The size is 0.1 to 0.4 ms (8% to 27% on the median of loads, 18% to 31% settled), against a timer that resolves 0.1 ms and a runner whose base figure moved from 1.3 to 1.5 between the two pairs. The spec's `cpuMsMedian` field (the P2 gate figure) is the median of the 60 frames of the last cold load only: 1.3 / 1.5 base against 1.0 / 1.0 new. It is a single load, so this document quotes the median across loads (`cpuMsMedianOfLoads`) instead.

Other scenes (median of five loads, pair a / pair b): PBR stand-in `cpuMsMedian` 4.5 / 4.7 base, 3.8 / 4.0 new; settled 3.2 / 3.3 base, 3.0 / 2.9 new. Cube `quality: "production"` `cpuMsMedian` 3.1 / 3.3 base, 3.0 / 3.4 new, which is unchanged within noise (as it should be: the changed paths are the direct path's).

What moved deterministically is allocation (see "Allocation"). What moved on the runner is about 0.2 ms of JavaScript (see "Where the CPU goes").

## Where the CPU goes

Two measurements, both in `frame-cost.spec.ts`.

**1. JS versus GL-call split (interleaved).** After 100 settle frames the 78 state-setting, bind, uniform and draw methods of `WebGL2RenderingContext.prototype` are replaced by no-ops and the frame is timed again. The first version did this once, real then stubbed, which favours the second measurement because the JIT is warmer by then; that single pair is kept below as "round 0". Rounds 1 to 4 alternate real and stubbed on the same page (20 warm-up frames, 180 measured each). Medians in ms:

| | round 0 real / stubbed | rounds 1-4 real (median) | rounds 1-4 stubbed (median) | GL-call share | JS share |
| --- | --- | --- | --- | --- | --- |
| base, pair a | 1.1 / 0.8 | 0.7 | 0.6 (0.5, 0.5, 0.6, 0.6) | about 0.1 | about 0.6 |
| base, pair b | 1.5 / 0.9 | 1.0 | 0.6 | about 0.4 | about 0.6 |
| new, pair a | 1.0 / 0.6 | 0.7 | 0.4 | about 0.3 | about 0.4 |
| new, pair b | 1.0 / 0.6 | 0.7 | 0.4 | about 0.3 | about 0.4 |

Reading: the stubbed (JS-only) frame fell from 0.6 to 0.4 ms in both pairs, which is the part this branch changed. The GL-call share is 0.1 to 0.4 ms on base and 0.3 ms on new, so it did not move beyond the timer resolution and run-to-run spread; the first version's claim that the calls account for "about 0.2 ms" was the new-build number only, and its base figure (0.6) came from the biased round 0. Of a 0.7 ms settled frame about 0.3 ms (40%) is the GL calls themselves on this software rasteriser and about 0.4 ms is JavaScript. The stubbed frame still includes the state-cache wrappers, so 0.4 ms is an upper bound for pure decision logic.

**2. V8 sampling profile** (100 us interval, 400 settled frames, inclusive times). The profile does not resolve a difference of this size. `step()` per frame, ms, computed from the raw `FRAME_COST_PROFILE_INCLUSIVE` lines by `wp5-frame-submission-raw/inclusive-per-frame.mjs`:

| function | base a | new a | base b | new b |
| --- | --- | --- | --- | --- |
| `step` | 0.609 | 0.584 | 0.847 | 0.946 |
| `renderFrame` | 0.475 | 0.450 | 0.641 | 0.738 |
| forward pass `execute` | 0.193 | 0.184 | 0.260 | 0.384 |
| `drawItem` | 0.166 | 0.148 | 0.214 | 0.296 |
| `warmGeneratedProgramsSync` | 0.099 | 0.066 | 0.122 | 0.106 |
| `programKey` | 0.073 | 0.035 | 0.076 | 0.047 |
| `addPasses` | 0.035 | 0.021 | 0.054 | 0.034 |
| `getDiagnostics` | 0.018 | 0.014 | 0.024 | 0.020 |

Pair a shows `step()` 4% lower on new, pair b shows it 12% higher, and the difference sits in `execute`/`drawItem`, which contain the native GL calls and move with runner load. The functions this branch memoised (`programKey`, `addPasses`, `warmGeneratedProgramsSync`, `getDiagnostics`) are lower in both pairs. The first version's "46%" (0.894 to 0.486) is withdrawn: it is not reproduced by either pair, and it had no raw lines.

**Cause of the floor.** The remaining JS is spread over about forty functions, none above 0.15 ms: the compile-update of the scene (`createProductionRuntimeRendererInput` 0.08 to 0.13), the forward-pass draw bookkeeping (`drawItem`), the warm-up pass (`warmGeneratedProgramsSync` 0.07 to 0.11), item collection and culling. They re-derive unchanged inputs for one box every frame. The GL calls (about 0.3 ms) are a fixed cost of 51 calls on SwiftShader (39 base calls before P1, 18 after the state cache, 51 on the fake context which has 3 more texture units than a real driver). The gate figure is also JIT-bound: it is taken after 10 warm-up frames, so it covers code still in the interpreter and baseline tiers (1.0 to 1.3 there against 0.9 settled). A further halving needs frame-level caching of the compiled scene input and of the program selection for unchanged materials, not more micro-removal; that is the next PRD's cut.

## Allocation (deterministic)

Node, counting WebGL2 context (`tests/support/fakeWebGl2.ts`), `process.env` emptied as in a browser, five apps mounted one after another in one process, 600 settle frames then 3,000 measured, V8 `total_allocated_bytes`:

| | first mount | later mounts |
| --- | --- | --- |
| base | 350 / 349 KB per frame | 311 to 325 KB |
| new | 203 / 209 KB per frame | 176 to 187 KB |

Two sessions each; about 40% fewer bytes per frame. The first version's 385 KB to 235 KB came from a different warm state; the ratio is the same. The budget test allows 300 KB, which is at least 43% above every new figure and below every base figure. JS time per frame in node was also sampled, but it varied by 5x between repeated runs on the shared Mac, so no JS-time figure from node is claimed.

## What changed

All of it removes work the frame repeated for unchanged inputs, or allocation it did not need. No cross-frame GL state caching was added (the hard rule): the GL state cache is still reset every frame exactly as before.

- `packages/rendering/src/contracts/program.ts`, `contracts/structuralMemo.ts` (new, internal), `program/ProgramKey.ts`, `program/ProgramFeatures.ts`: `computeProgramKey` and the sparse `programKey` sit behind a small ring of recent (record snapshot, key) pairs compared structurally; the key string is still produced by the unchanged `stableSerialize`. `dropUndefined` works in place on the fresh copy it is given.
- `packages/rendering/src/contracts/core.ts`: `Registry.active(flags)` is memoised per flags object whose `values` map is frozen (all resolved `QrFlags`), invalidated by `register`/unregister; flags objects without a frozen `values` (test doubles) are never cached. The returned list is frozen (see "Registry.active() returns a frozen list").
- `packages/rendering/src/renderer/coreOutputPostRoute.ts`: `withCoreOutputOff` returns one derived frozen flags object per input, instead of a new object every frame, which also let the registry memo hit.
- `packages/engine/src/contracts/urlCache.ts` (new, internal, deliberately not exported from `contracts/index.ts`), `contracts/flags.ts`, `agent-api/compiler/lights.ts`, `agent-api/compiler/shadows.ts`: the page URL / search string is parsed once per distinct string; the ambient `prd02LightingOn` result is memoised per href when there is no `process` (a browser), and still resolved each call when `process.env` exists.
- `packages/rendering/src/WebGL2StateCache.ts`: no tuple allocation on the skip path, numeric keys instead of template strings for texture/buffer/framebuffer shadows, running issued/skipped totals (the snapshot shape is unchanged). `webgl2/Samplers.ts`: numeric unit keys, sampler key built once per (sampler, target kind, mode). `WebGL2Device.ts`: `getDiagnostics` makes single passes over the live sets and reads the state-cache totals without building `stats()`.
- `packages/engine/src/agent-api/app/frameLoop.ts`, `app/routeState.ts`: no per-frame `[w, h]` tuple while the size is unchanged, no per-frame argument allocation for the authored-resize check, and the `data-aura3d-draw-calls` attribute is only written when the number changes.

## Tests, and what each one can catch

`tests/unit/rendering/frame-submission-budget.test.ts` (counting fake context in `tests/support/fakeWebGl2.ts`):

- GL calls per steady frame (one draw, at most 14 uniform uploads, no create/compile/upload calls, at most 56 calls in total, at most 0.25 `getError` reads per frame). **These checks pass on base as well** (51 calls both): they guard against a later regression, they do not show an improvement of this branch.
- Allocation budget, 300 KB per frame: **fails on base (311 KB and up), passes on this branch (176 to 209 KB).** It is the only budget here that distinguishes the two builds.
- A scene mounted after the cube in the same process compiles the same programs and issues the same calls as the same scene in a cold process (`vi.resetModules()` gives the cold process). The scene needs programs the cube's program cannot serve, so a memoised key, flags object or registry list returned for the wrong input shows up as different linked shader sources or call counts. The first version's "cold-start equals second app" test compared two identical apps and could not catch this; it is replaced. Checked by mutation: making `sameStructure` return true for any two objects fails this test, and three tests in the memo file.
- A GL error raised in a steady frame is read by the engine within `ERROR_SAMPLE_INTERVAL` (60) frames: the fake `getError` returns a pending code once, and the test asserts the queue is empty (the engine called `getError`) within 60 frames. The previous fake always returned 0, so the "no errors masked" claim rested only on the read count. The `webgl2-sampled-error-policy` and `webgl2-error-check-mode` tests (unchanged) cover the policy itself.

`tests/unit/rendering/frame-submission-memo.test.ts`: program-key memo against a reference serialiser, mutation aliasing, registry invalidation and non-frozen flags, URL cache, plus new:

- `prd02LightingOn` with `process` undefined (a browser): a changing `location.href` and a revisit of an earlier href give the right answer each time; with `process.env` present the environment is read on every call. The branch under `typeof process === "undefined"` never ran in the earlier tests, because node defines `process`. Checked by mutation: making the memo ignore `href` changes fails the test.
- The list returned by `Registry.active` is frozen and mutating it throws `TypeError`.

Remote (`tests/browser/frame-cost.spec.ts`): five cold loads per scene (was three), `cpuMsMedianOfLoads` and `cpuMsSettledMedianOfLoads` next to the last-load figures, the interleaved JS/GL split, and a new pixel test (below).

## No behaviour change

- **Frames, measured.** The new pixel test renders the cube and the `lit` scene (hemisphere + directional light, rough and metallic PBR, emissive) at `quality: "auto"` and at `quality: "production"`, 20 frames after load so the cube yaw is identical, reads the whole drawing buffer back and prints a sha256. Base and this branch gave the same hashes in both pairs:
  - cube auto `ab439e669667364ba6ae565042adc96c3133490e24f8870a6e2a6992b3767246`, cube production `79585155a8660cfaed0705172e67849f9f4ac21139b32172e17af2e5981416d0`
  - lit auto `c5325644dcaca8b09ad4419abff6e12cd0da1d1398f2451dea38025310c9669c`, lit production `6fa1ac8dcfd376974e8fed2184032db2b3659aad909e20e48f93cbb4768f7aea` (all in the `FRAME_PIXELS` lines of `wp5-frame-submission-raw/*.txt`)
  - So `quality: "production"` output is byte-identical to `beat3js2/integration` on these two scenes, and so is the direct path.
- **auto versus production** (same build, 640x360, 20 frames): cube mean absolute difference 0.006/255, interior 0, max 16 (285 differing pixels, all on the silhouette); lit mean 0.012/255, interior 0.003/255, max 20 (2,839 differing pixels). Both are within the 2/255 mean and interior limits. "Interior" is every pixel that is not within 2 to 3 pixels of a position where either frame has a neighbour-to-neighbour step above 24/255, so the documented MSAA silhouette difference is excluded. The spec asserts the 2/255 limits for the cube.
- Program keys: the memo returns exactly `stableSerialize`'s string (checked against a reference copy of the old serialiser for reordered, sparse, undefined-leaf and mutated-after-memo records).
- `quality: "production"` takes none of the changed paths differently: draws / blits / msaa targets are identical in every run (2 / 1 / the same two 4x targets).
- Unit tests, compared with `beat3js2/integration` in a second worktree, same selection on both (`tests/unit/rendering`, `tests/unit/contracts`, `tests/unit/agent-api`, `tests/qr`, run in parallel on the same machine): this branch 5,348 tests with 123 failing, base 5,340 with 119 failing. Six tests fail only here: `primitive-submission-audit.test.ts` ("the real multi-part fixture"), because the checkout used for this branch holds the Git LFS pointer text for `tests/fixtures/gltf-multipart/body-and-four-wheels.glb` (error `Invalid GLB magic`), while the base worktree holds the real file. With the real files copied in, the file passes 33 of 33 on this branch (the files were then restored). Two tests fail only on base. The remaining 117 failures are on both (missing ignored fixtures and tools). The four tests the first version called load-sensitive were not named in that report; the closest candidates (`game-kits/racket-scoring`, `roadster-hours-port/meshy`, `aura3d-cli/meshy-admission`, `drift-and-deliver-port/city`) pass 31 of 31 on both trees when run alone.
- `tsc --noEmit -p tsconfig.check.json`: 58 errors, none under `packages/` and none in a file this branch changed (the 59th, in the new budget test's scene, was fixed). `tests/browser/**` is outside that config.

## Registry.active() returns a frozen list

The exported helpers that return the list (`frameContributors`, `materialLobes`, `shaderFeaturesFor`, `depthVariantFeaturesFor`) are typed `readonly T[]` in `packages/rendering/src/contracts/*.ts`, so `.sort`, `.push` and `.splice` do not compile against them; the contract never allowed mutation, and before this branch it merely did not enforce it. In-repo callers (`FrameGraph.ts`, `FeatureSelect.ts`, `ProgramGenerator.ts`, `Prd02DepthShaderLibrary.ts`, `PhysicalFeatures.ts`, `engine/contracts/environment.ts`, and the `tests/qr` and `tests/unit/contracts` callers) iterate, `filter`, `find`, `map` or spread-copy it; `resolveEnvironment` copies before sorting. A JavaScript consumer or a type-cast caller that mutates the result now gets `TypeError` instead of silently corrupting its own copy; the freeze is kept on purpose, because a cached array that one caller mutated would change every later frame, and a test pins it. A consumer that needs another order copies the list first.

## Next cut (from the profile)

1. Memoise the compiled renderer input (`updateCompiledSceneReal` / `createProductionRuntimeRendererInput`, 0.08 to 0.13 ms) for a scene whose only change is a runtime node transform.
2. Skip `warmGeneratedProgramsSync` and per-draw `programFeaturesFor` when the material revision, light axes, environment and output colour space are unchanged (0.07 to 0.11 ms); needs a signature that covers `ShaderFeature.select` inputs.
3. Remove the structural-compare cost the memo itself adds by leasing the program handle per material instead of re-keying.
4. Re-measure with the bench harness (`tools/bench-vs-threejs`) once those land; its warm-up is 10 frames, like the gate figure here.

## Corrections to the first version

- "1.5 ms to 1.1 ms" was one A/B with three loads per side, and the figure was the last load's median. Replaced by the two five-load pairs above (about 1.3 to 1.5 down to 1.1 to 1.2 as medians of loads).
- "Settled median 1.0 (base)": the per-load values were [1.2, 1.1, 1.0], whose median is 1.1; the 1.0 was the last load. The spec now reports both the last-load figure and the true median across loads.
- "The 39 GL calls are not the cost" / "about 0.2 ms": withdrawn. The interleaved split puts the GL calls at about 0.3 ms of a 0.7 ms settled frame on new, 0.1 to 0.4 ms on base.
- The inclusive-time table (`step()` 0.894 to 0.486) had no raw lines and is not reproduced by either new pair; replaced by the table above, with raw lines committed.
- "Frames unchanged" and "production byte-identical" rested on draw/blit counts only. They now rest on sha256 of the full frames from both builds.
- "Unit tests: no new failures" had no same-load baseline. It now has one (above).
- The budget test's cold-start check and `getError` check did not exercise what they claimed; they are replaced, and the claims about which checks fail on base are now stated per check.
