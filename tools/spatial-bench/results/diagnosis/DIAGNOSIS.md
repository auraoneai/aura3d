# E6-02: why Aura3D's streamed points path is slow (diagnosis only)

Branch `lane/512-points-diagnosis`, base `origin/lane/510-e6-baseline` (E6-01 harness). No file under `packages/` was changed. All instrumentation is under `tools/spatial-bench`; the A/B probes use patched COPIES of two engine files under `tools/spatial-bench/experiments/`, swapped in by a build-time Vite plugin that is off unless `SB_EXPERIMENT=1`.

Machine: Apple M4 Max (16 cores, 128 GB), headless Chrome 156 over loopback CDP, ANGLE/Metal, 1280x720, DPR 1. Many agent lanes share this Mac: 1-minute load average ranged 7 to 93 across my runs and is recorded per run. Wall-clock ms are therefore noisy (the same baseline run measured 7.5 fps at load 65 and 40 fps at load 7); conclusions below rest on profile shares and on within-run phase splits, and A/B rows carry their load.

## 1. Verdict

The time is not in the GPU, not in uploads, not in GC, not in a scene recompile. It is **five O(n) JavaScript passes over the whole point set, each doing per-element work through boxed/allocating paths, and the largest of them (bounds inside `snapshot()`, called three times per frame) runs on every rendered frame, ticked or not, while the other four run once per sensor tick**. The renderer main thread is 94-98% busy (Chrome trace); the GPU process is busy 0.4-1.5%.

| | what the trace/profile says (100K points, 10 Hz stream) |
|---|---|
| renderer main thread | 98% busy (5950 of 6047 ms trace span) |
| GPU process (CrGpuMain) | 1% busy (88 ms) ; GPU frame p50 1.43 ms from the renderer's own `EXT_disjoint_timer_query_webgl2` |
| V8 GC | 1.4% of profile (117 ms scavenges); 71 ms of scavenge pauses in a 6 s trace |
| GL upload JS | `bufferSubData` 0.11 ms/frame; 0 `bufferData`, 0 `createBuffer`, 0 `createVertexArray` per frame |
| five O(n) JS passes below | 92% of main-thread busy time (100K profile) |

Cheapest credible fix: a **single engineer-week-class change inside the existing typed-scene architecture** (no new engine, no API change): replace the five eager per-element passes with typed-array bulk operations and lazy bounds. My probe that applies all six small patches (section 5) takes 100K streamed points from 7-40 fps (baseline, strongly load-dependent; E6-01 median 10.4) to a locked 60 fps at 1.6 ms CPU/frame, 250K to 60 fps at 2.0 ms, 1M to 54 fps at 6.9 ms.

## 2. Evidence: where the time goes (profiles)

Raw: `raw/*.cpuprofile.gz` (V8 sampling profiler, 200 us interval, 8 s window, bundle built with `SB_MINIFY=0 SB_SOURCEMAP=1`; `aggregate-profile.mjs` resolves function positions through the source map), `raw/*.trace.json.gz` (Chrome trace with `devtools.timeline`, `gpu`, `viz`, `cc`, `v8.gc`, `blink`). Flat tables: `tables/top-self.*.md`, `tables/trace.*.md`, caller chains `tables/callers.*.txt`.

Top self time, 100K points, `pts-100K-10hz-60fps` (busy 7997 ms of 8197 ms wall; this window contained 283 rendered frames of which 120 applied a tick, load 29; the table is `tables/top-self.pts-100K-10hz-60fps.aura.md`):

| # | function | self ms | self % | inclusive ms | source |
|---|---|---|---|---|---|
| 1 | `normalizeGeometryAttributes` | 1948 | 24.4% | 3105 | packages/engine/src/agent-api/RootGeometry.ts:341 |
| 2 | `computeBounds` | 1570 | 19.6% | 1638 | packages/rendering/src/Geometry.ts:1289 (hot statement :1300) |
| 3 | `readVec3Attribute` | 1157 | 14.5% | 1157 | packages/engine/src/agent-api/RootGeometry.ts:287 (:292, :302) |
| 4 | `updateAttribute` | 961 | 12.0% | 1747 | packages/engine/src/agent-api/app/runtimeNodes.ts:2067 (hot statement :2078) |
| 5 | `setAttribute` | 863 | 10.8% | 963 | packages/rendering/src/VertexBuffer.ts:84 |
| 6 | `runtimeGeometryBounds` | 375 | 4.7% | 2754 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 |
| 7 | `applyAttributeUpdateToGeometry` | 279 | 3.5% | 1252 | packages/engine/src/agent-api/compiler/primitives.ts:1545 |
| 8 | `validateComponent` | 132 | 1.7% | 132 | packages/rendering/src/VertexBuffer.ts:333 |
| 9 | `(garbage collector)` | 101 | 1.3% | 101 | native |
| 10 | `(anonymous)` (`getAttribute` closure) | 60 | 0.8% | 74 | packages/rendering/src/VertexBuffer.ts:110 |
| 11 | `updatedQueryGeometry` | 58 | 0.7% | 786 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 |
| 12 | `sanitizeDiagnosticText` | 37 | 0.5% | 37 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 13 | `copyStaticUnlitUpload` | 25 | 0.3% | 25 | packages/rendering/src/WebGL2Device.ts:398 |

The first seven rows are 91% of busy time and all are JavaScript in the geometry-update/bounds path. GPU upload (`copyStaticUnlitUpload`, `updateBuffer`, native `bufferSubData`) is under 1% in total; GC is 1.3%. The 250K profile (`tables/top-self.pts-250K-10hz-60fps.aura.md`, 96 frames, all ticked) has the same functions in the same positions (`computeBounds` 24.6%, `normalizeGeometryAttributes` 17.8%, `updateAttribute` 16.0%, `setAttribute` 14.0%); per-pass cost is linear in n.

Inclusive structure (100K): `step` 5876 ms (73.5%) -> `createProductionRuntimeRendererInputOwned` 5692 ms (71%), of which `syncRuntimePrimitiveGeometry` 2899 ms (36%: `refreshBounds` 1638 + `applyAttributeUpdateToGeometry` 1252) and three `snapshot()` calls per frame 2757 ms (34.5%: 1843 from `assertFramePivotSupported`, called twice, 915 from `resolveProductionPrimitiveRuntimeState`); `applyTick` (the harness calling `updateAttribute` twice) 1769 ms (22%).

## 3. Per-phase timing (harness extended: `?dbg=phases,glcount,gltime`)

Raw: `raw/*phases*.result.json`, `raw/*gltime*.result.json`. Mean ms, 100K points unless noted; load 12 (`pts-100K-10hz-60fps.aura.phases+glcount`):

| phase | ms | notes |
|---|---|---|
| pack typed array (u8 -> float RGBA, harness side) | 0.23 | not an engine cost; 1.2 ms at 250K |
| `updateAttribute("position")` | 9.4 | 300K floats |
| `updateAttribute("color")` | 11.2 | 400K floats |
| tick total (the two calls) | 20.8 | |
| rendered frame that applied a tick | 50.1 | |
| rendered frame with NO tick | 14.7 | **same node, no new data**: 100K static points via `points()` costs 1.4 ms |
| of the 50.1: bounds/validation/write on the sync | ~35 | = 50.1 - 14.7 |
| GPU frame time (renderer's own timer query) | 1.43 | p50; 3.4 at 250K |

Scene mutation/invalidate (`bumpVersion`, `runtimeNodeChanged`), compile/re-lower (`updateCompiledSceneReal` self 1 ms, no node-tree rebuild), builder `JSON.stringify` (absent), structuredClone (absent), color string parsing (`parseAuraColor*` present only as a wrapper name, self time under 1 ms; the dynamic path takes float RGBA directly) are all negligible in the profile.

GL activity per rendered frame (`glcount`): 1.0 to 1.4 `bufferSubData` (one is a 304-byte uniform buffer; on tick frames one is the vertex buffer), 0 `bufferData`, 0 `createBuffer`, 0 `bindVertexArray` churn beyond 1, 1 `drawElements`, plus 1.2 `getParameter` and 3.2 `getQueryParameter` from the renderer's own timer-query bookkeeping. JS time inside GL calls (`gltime`): `bufferSubData` 0.112 ms/frame, everything else under 0.01 ms/frame.
Upload volume: the **full interleaved vertex buffer is re-uploaded per tick**: 4,000,304 B/frame at 100K (40 B/vertex: position f32x3 + a synthesized up-normal f32x3 + color f32x4), 10 MB at 250K, 40 MB at 1M, versus three.js 16 B/vertex (f32x3 + normalized u8x4). New GL buffers are never created per tick.

## 4. Ranked causes

Shares are of main-thread busy time in the 100K baseline profile; they sum to 92% (this window: 283 rendered frames, 120 ticked, so per-frame costs weigh more than in the always-ticked 250K run). "ms" columns are isolated costs at 100K / 250K / 1M from `src/floor/main.ts` (same machine, `raw/floor.result.json`).

### C1. `snapshot()` eagerly computes `bounds`, three times per frame per runtime primitive (34.5%; the only cost on non-tick frames)
- Where: `runtimeNodes.ts:2294` `snapshot()` builds `bounds: getBounds()` at `:2316` -> `getBounds :1678` -> `runtimeGeometryBounds :1458`, which runs `normalizeGeometryAttributes(geometry)` (`RootGeometry.ts:341`: `readVec3Attribute` `for…of` finite scan over 300K floats at `:292`, plus colors/uvs scans) and then a loop that allocates a 3-element `point` array per vertex (`:1478-1482`). Callers: `renderInput.ts:329` (`assertFramePivotSupported`, invoked at `renderInput.ts:501` and `:704`) and `primitives.ts:518` (`resolveProductionPrimitiveRuntimeState`). Every one of them reads only `pivot` / `instances` / `material`, never `bounds`.
- Evidence: caller table `tables/callers.pts-100K.txt` (1843 ms + 915 ms = 2 : 1 = three calls per frame); no-tick frames cost 14.7 ms at 100K versus 1.4 ms for static `points()`; the cost is paid even at 0 Hz data and at 2 Hz (`pts-100K-2hz-60fps.aura.phases+glcount`: 629 no-tick frames at 14.8 ms). It applies to any `.runtime({ id })` primitive with custom geometry, not just points.
- Fix: make `bounds` a lazy, memoized getter keyed by (geometry revision, world matrix) so `snapshot()` is O(1); compute from the typed position array without per-vertex allocation.
- Effort 0.3 eng-weeks. Risk low-medium (consumers that spread/clone the snapshot would evaluate the getter; check `structuredClone`/`{...snapshot}` users). Acceptance: a no-tick frame with a 100K runtime custom-geometry node costs under 1.5 ms CPU.

### C2. `Geometry.refreshBounds()` decodes every vertex through an allocating accessor (20.5%)
- Where: `primitives.ts:1413` (`tracked.bounds = resource.geometry.refreshBounds()` inside `syncRuntimePrimitiveGeometry`, runs after every position update) -> `Geometry.ts:393` `refreshBounds` -> `Geometry.ts:1289` `computeBounds`, loop at `:1300` `const [x = 0, y = 0, z = 0] = vertexBuffer.getDecodedAttribute(i, "position")` -> `VertexBuffer.ts:114` `getDecodedAttribute` -> `:103-110` `getAttribute` = `Array.from({ length }, closure)` per vertex, plus array-iterator destructuring and six `Math.min/max`.
- Evidence: 1638 ms inclusive (1641 ms by the caller table, all from this call site); isolated `computeBounds` 16.3 / 40.4 / 173 ms versus a typed `Float32Array` min/max 0.07 / 0.28 / 1.11 ms (230x / 145x / 155x). Ladder: adding it takes the render-on-tick frame from 39.5 to 23.7 ms (masks 15 -> 31); leaving it out of the full set costs 39.5 ms versus 3.4 ms (mask 47 vs 63, loads 49 vs 15).
- Fix: compute bounds from the incoming typed array (full-buffer update) or from `vertexBuffer.floats` with stride; fall back to the old path only for non-float32 or partially updated buffers (merge new min/max with cached bounds when the update covers a sub-range).
- Effort 0.2 eng-weeks. Regression risk low-medium (culling/pick bounds must stay conservative for partial updates and for normalized integer positions). Acceptance: `refreshBounds` self time under 0.5 ms at 100K, bounds equal to the old result within float32 epsilon on a randomized property test.

### C3. Per-element validation and writes in `applyAttributeUpdateToGeometry` (15.7%)
- Where: `primitives.ts:1545-1595`. A closure `checked()` (conversion + integer-range lookup + `Math.fround` finite test) is called per float in a validate pass (`:1585`) and again in the write pass; the write pass copies into a scratch `number[]` and calls `VertexBuffer.setAttribute` (`VertexBuffer.ts:84`) per vertex, which re-asserts liveness/index/slot, validates via `for…of` + `validateComponent` (`:333`), writes with `DataView` per component, and calls `markDirty` per vertex (updates min/max and loops over device buffers).
- Evidence: inclusive 1252 ms; `setAttribute` 963 ms inclusive; isolated per-vertex `setAttribute` loop for position+color 6.5 / 15.5 / 60.6 ms versus writing the same data with one typed interleave plus one `writeBytes` 0.31 / 1.1 / 4.8 ms. 100K tick frames drop from about 24 to 3.4 ms when this is the last fix applied (ladder 31 -> 63).
- Fix: float32 fast path: one finite check pass over the typed array, direct stores into the `Float32Array` view at stride, one `markDirtyRange` for the touched span; keep the slow path for integer/normalized/custom attributes.
- Effort 0.4 eng-weeks (the slow-path parity tests are the cost). Risk medium (storage ranges, normalized ints, stride/offset custom attributes, partial `offset` updates, shared-buffer detach via `ensureWritableBuffers`). Acceptance: 100K position+color update under 2 ms; same bytes as old path for float32, int8/16 normalized, strided custom.

### C4. `updateAttribute` validates by materializing a JS array (12.0% self)
- Where: `runtimeNodes.ts:2078` `if (!Array.from(raw).every(Number.isFinite))`: converts the typed array to a boxed-double array (300K/400K elements) on every call, twice per tick. Plus `raw.slice()` (a cheap memcpy, 0.07 ms).
- Evidence: self time 961 ms (1747 ms inclusive with C5); isolated 4.4 / 10.8 / 48.5 ms versus a typed loop 0.17 / 0.29 / 1.82 ms (26x). Leave-one-out: dropping only F1 leaves tick at 11.8 ms instead of 1.1 ms.
- Fix: for typed arrays do `for (i…) Number.isFinite(raw[i])`, and merge the finite check into the C3 pass so the data is scanned once.
- Effort 0.1 eng-weeks. Risk low. Acceptance: `updateAttribute("position")` of 100K under 1 ms.

### C5. Eager query-geometry rebuild on every `updateAttribute` (9.8%)
- Where: `runtimeNodes.ts:2080` -> `updatedQueryGeometry :1416`: runs `normalizeGeometryAttributes` on the whole spec (finite scans again), clones the whole attribute with `source.slice()`, copies the update element-by-element, and spreads a new spec; this keeps `raycast`/`getBounds` data current although nobody queried it. A new spec per tick also defeats any bounds memo (C1).
- Evidence: `updatedQueryGeometry` 786 ms inclusive (`tables/callers.pts-100K.txt`); leave-one-out: dropping only F2 leaves tick at 17.8 ms (load 86) / 9.5 ms (load 12) instead of 1.1 ms.
- Fix: record pending updates and materialize the query geometry lazily when `raycast`, `getBounds`, or `snapshot().geometry` is actually read (and coalesce multiple updates).
- Effort 0.3 eng-weeks. Risk medium (raycast and bounds freshness semantics; last-write-wins ordering across `setGeometry`/`updateAttribute`). Acceptance: raycast after N updates returns the same hits as today; `updateAttribute` makes no O(n) query-spec copies.

### C6. Fat vertex layout and full-buffer re-upload (matters only at 1M; under 1% at 100K)
- 40 B/vertex (synthesized normal for a points topology, float RGBA) versus three.js 16 B. Upload JS stays cheap (0.11 ms/frame at 100K; isolated raw `bufferSubData` 0.19 / 0.33 / 1.22 ms at 40 B versus 0.05 / 0.12 / 0.47 ms at 16 B). GPU time in the baseline is 1.4 / 3.4 / 12-15 ms versus three.js 0.5 / 1.0 / 3.3 ms; with the O(n) JS removed 1M still measures 6.5 ms GPU and 53.9 fps. `copyStaticUnlitUpload` (`WebGL2Device.ts:398`) makes a second full copy of the uploaded bytes (27 ms of 8104).
- Fix: points-specific vertex format (position f32x3 + color u8x4 normalized, no normal) for `topology: "points"` (derives the normal from the view in the shader if lit, or unlit points material).
- Effort 0.5-1 eng-weeks. Risk medium (shader variants, WebGPU parity, material path for points). Only needed to reach 30+ fps at 1M with margin. Not required for the 100K target.

### C7. O(1) per-frame pipeline overhead of about 1.3 ms (static `points()` 1.41 / 1.51 / 1.72 ms at 100K / 250K / 1M)
- Flat across a 10x change in n, so not a points cost: `getParameter` in `prepareFullscreenPresentation` (`webgl2/LegacyPost.ts`, 104 ms of 687 busy in the static profile = 0.22 ms/frame, a synchronous GL state readback), `getError` in `readError` (44 ms = 0.09 ms/frame), `sanitizeDiagnosticText` (`sanitizeDiagnostics.ts:13`, about 0.15 ms/frame even in an empty scene: `ctl-empty` profile busy 202 ms of which 70 ms), timer-query bookkeeping. three.js measures 0.09 ms for the same scene.
- Effort 0.2-0.3 eng-weeks, risk low, optional. After C1-C5 these are about 25% of a 4.6 ms ticked frame and the whole of a 1 ms idle frame; they only matter for the budget margin.

### Ruled out (with evidence)
- GPU: renderer-owned timer query p50 1.43 ms (100K), 3.4 ms (250K); GPU process 0.4-1.5% busy in the trace.
- GL object churn: 0 `createBuffer`/`bufferData` per frame; same buffer re-used (`bufferSubData` only).
- GC: 1.3% of profile (the per-vertex `Array.from`/`point` allocations are short-lived young-generation garbage, so they cost allocation time inside C1 and C2, not collector time).
- Scene recompile / node-tree re-lowering: `updateCompiledSceneReal` has 1 ms self time; no `compileScene` rebuild per tick.
- Color string parsing, `JSON.stringify` of builders, structural diffing: absent from the dynamic path profile.
- Harness overhead: the `phases`/`glcount` instrumentation moved fps within the load noise; the `gltime` per-call timers were used only for the JS-inside-GL-calls figure, not for any fps number.

## 5. A/B probes and the achievable floor

Patched copies: `experiments/runtimeNodes.ts`, `experiments/primitives.ts` (original files copied verbatim plus a header and small gated patches). Bitmask via `?fix=N`: F1 typed finite check (C4), F2 skip eager query-geometry rebuild (C5, upper bound of the lazy fix), F4 allocation-free bounds loop without `normalizeGeometryAttributes` (C1), F8 memoized snapshot bounds (C1), F16 bounds from the incoming typed array (C2), F32 bulk float32 write (C3). `fix=0` is the unmodified behavior in the same bundle. Output frames were checked to match: lit pixels 146,850 (fix 0) versus 146,664 (fix 63) in the 1280x720 non-blank readback at 100K.

Headline (`ab.*` rows in the generated tables below; one run each, load in the table):

| points | baseline fps / JS ms per ticked frame (tick + render) | all six fixes: fps / JS ms per ticked frame | JS ms on a no-tick frame (base -> fixed) | GPU p50 ms (fixed) |
|---|---|---|---|---|
| 100K | 39.9 / 58.1 (load 7); 28 / 70.9 (load 12 run) | 60.0 / 4.4 | 12.4 -> 1.0 | 2.1 |
| 250K | 4.1 / 243 (load 16) | 60.0 / 7.4 | not measurable -> 0.9 | 3.5 |
| 1M | 1.2 / 827 (load 14) | 53.9 / 33.1 | not measurable -> 0.95 | 6.5 |

The 1M remainder (`tables/top-self.ab.pts-1M-10hz-60fps.fix63.profile.md`) is the unavoidable per-element copy: `applyAttributeUpdateToGeometry` 917 ms, `updateAttribute` 413 ms (finite scans + `slice`), `applyTick` 187 ms, `bufferSubData` 122 ms. That is the floor of this API shape (typed array in, interleaved typed write, one validation pass); a no-copy API would remove most of it.

Ladder at 100K (cumulative and leave-one-out, generated table below). Machine-load noise is large; the consistent reads are: F1+F2 remove the entire tick cost (24 -> 1 ms); F16 and F32 each remove roughly 20 ms of the 58 ms render-on-tick cost; F4/F8 remove the 13-17 ms no-tick cost (14.7 ms -> 1-3 ms). Single-fix A/B rows (`ab.*.fix1..fix32`) are not additive and several were run under changing load, so do not rank causes from them; rank from section 2.

Lowest-layer floors (`src/floor/main.ts`, the same point data, `raw/floor.result.json`):

| operation (ms) | 100K | 250K | 1M |
|---|---|---|---|
| raw WebGL2 `bufferSubData` of 16 B/vertex (three.js layout) | 0.05 | 0.12 | 0.47 |
| raw WebGL2 `bufferSubData` of 40 B/vertex (Aura layout) | 0.19 | 0.33 | 1.22 |
| interleave 40 B/vertex from the stream (positions + color u8 -> f32) | 0.26 | 1.00 | 4.21 |
| `@aura3d/rendering` `VertexBuffer.writeBytes` + `upload()` through `WebGL2Device` (public package) | 0.50 | 0.45 | 1.85 |
| the same including interleave | 0.72 | 1.49 | 5.98 |
| today's per-vertex `setAttribute` loop (position + color) | 6.49 | 15.5 | 60.6 |
| today's `computeBounds` | 16.3 | 40.4 | 173 |
| typed min/max | 0.07 | 0.28 | 1.11 |

`@aura3d/engine` does not export the device or `VertexBuffer`; the lowest path reachable from public exports is `@aura3d/rendering` (`WebGL2Device.create`, `VertexBuffer`), which I used for the device-layer rows. So the achievable data-path floor at 100K is about 0.7 ms (interleave + write + upload) versus about 20 ms today for the same bytes, and the engine-level floor with patches is the 4.4 ms ticked frame / 1.0 ms idle frame above.

## 6. Recommended fix path (cheapest credible, typed-scene architecture preserved)

One change set in `packages/engine/src/agent-api` and `packages/rendering/src`, no new public API, no new engine:

| step | change | effort (eng-weeks) | regression risk |
|---|---|---|---|
| 1 | C4: typed finite check in `updateAttribute`, merged with the write pass | 0.1 | low |
| 2 | C2: bounds from the incoming typed array / `floats` view, no per-vertex decode | 0.2 | low-medium |
| 3 | C1: lazy memoized `snapshot().bounds`; O(1) snapshot | 0.3 | low-medium |
| 4 | C5: lazy query-geometry (pending update list materialized on query) | 0.3 | medium |
| 5 | C3: float32 bulk write fast path in `applyAttributeUpdateToGeometry` | 0.4 | medium |
| | **subtotal (reaches the 100K target; probe shows 60 fps)** | **1.3** | |
| 6 | C6: points-specific 16 B vertex layout (needed for 1M margin) | 0.5-1.0 | medium |
| 7 | C7: remove sync readbacks and per-frame diagnostics sanitization from the hot frame | 0.2-0.3 | low |
| | total | 2.0-2.6 | |

Order by value per week: step 3 and step 2 first (they fix every frame, including idle frames, and benefit any custom-geometry runtime node), then steps 1 and 4 (tick cost), then step 5.

Acceptance criteria (measured with this harness on the same machine class, load average under 10, median of 3 reps):
1. 100K points at 10 Hz and 20 Hz sensor rate, 60 fps display target: effective fps at least 55, rendered-frame interval p95 at most 20 ms, zero dropped frames by the harness rule; `updateAttribute` pair at most 2 ms; ticked frame (tick + render) at most 8 ms; no-tick frame at most 1.5 ms. (Probe achieved 60 fps, 1.1 ms tick, 3.4 ms render-on-tick, 1.0 ms no-tick.)
2. 250K points at 10 Hz: effective fps at least 30 at the 30 fps target and at least 55 at 60; ticked frame at most 16 ms. (Probe: 60 fps, 7.4 ms.)
3. 1M points at 10 Hz, 30 fps target: effective fps at least 28 (probe: 53.9 at 60 target with 33 ms ticked frame).
4. No-tick frame cost of a 100K runtime custom-geometry node independent of n (under 1.5 ms).
5. Correctness: bounds and raycast results unchanged versus the old path (property test over float32, int8/int16 normalized, strided custom attributes, partial `offset` updates, `setGeometry` then `updateAttribute` ordering); non-blank pixel check unchanged.
6. `ctl-static-pts-*` and `ctl-empty` do not regress.

## 7. Method notes, limits, and what is not proven

- Profiles are 8-14 s windows at 200 us sampling, taken under varying machine load; percentages are stable across the 100K and 250K runs, absolute ms are not. Treat A/B ms as indicative (loads in the tables).
- `positionTicks` line mapping through the bundle source map resolves to the function start for some functions (notably `computeBounds`); statement lines in this document come from reading the source at the call sites named by the profile callers table.
- The single-fix A/B rows run at different loads and interact (fixes are in different phases), so they are not used for ranking. F2 in the probe is "skip the rebuild", an upper bound for a lazy implementation. F16/F32 probes cover full-buffer float32 position/color updates only.
- GPU time for Aura3D is the renderer's own timer-query result (`diagnostics().renderer.frameTiming`) because an external query nests with it and raises GL errors (documented in the base harness); the external `EXT_disjoint_timer_query_webgl2` was used for three.js in E6-01. The trace's GPU-process busy time is an independent cross-check.
- `renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`. Nothing here speaks for other GPUs or browsers. WebGPU path not measured.
- No claim comparing Aura3D to three.js is made or authorized here beyond restating E6-01's baseline as the starting point.

## 8. Files

- `tools/spatial-bench/diagnose.mjs` (driver: one config, optional `--profile`, `--trace`, `--fix N`, `--dbg phases,glcount,gltime`), `aggregate-profile.mjs`, `profile-callers.mjs`, `trace-summary.mjs`, `diagnosis-tables.mjs`
- `tools/spatial-bench/src/floor/main.ts` + `floor.html` (device-layer and raw-GL floor probe)
- `tools/spatial-bench/experiments/*.ts` and the `SB_EXPERIMENT` plugin in `vite.config.ts` (probe copies; never imported by `packages/`)
- `tools/spatial-bench/results/diagnosis/raw/` (compressed CPU profiles, compressed traces, per-run result JSON), `results/diagnosis/tables/` (flat tables)

Reproduce:

```bash
cd tools/spatial-bench
SB_SOURCEMAP=1 SB_MINIFY=0 SB_OUT=dist-prof node ../../node_modules/vite/bin/vite.js build --config vite.config.ts
SB_EXPERIMENT=1 SB_SOURCEMAP=1 SB_MINIFY=0 SB_OUT=dist-exp node ../../node_modules/vite/bin/vite.js build --config vite.config.ts
node diagnose.mjs --dist dist-prof --cfg pts-100K-10hz-60fps --profile --measure 12000
node aggregate-profile.mjs results/diagnosis/raw/pts-100K-10hz-60fps.aura.cpuprofile.gz --dist dist-prof
node diagnose.mjs --dist dist-exp --cfg pts-100K-10hz-60fps --fix 63 --dbg phases
node diagnose.mjs --dist dist-exp --viewer floor --warmup 300 --measure 3000
node diagnosis-tables.mjs results/diagnosis/raw
```

## 9. Generated tables

Verbatim output of `diagnosis-tables.mjs` (also in `tables/generated-tables.md`).

#### Per-phase JS ms (mean per applied tick / per frame)

| run | load1 | fps | pack | updateAttribute(position) | updateAttribute(color) | tick total | render on tick frame | render on no-tick frame | gpu p50 | bufferSubData calls/frame | bufferData | createBuffer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ladder.pts-100K.fix0.rep1 | 8.8 | 34.3 | 0.22 | 8.64 | 10.25 | 19.11 | 46.2 | 13.4 | 1.45 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix0.rep2 | 19.8 | 20.1 | 0.29 | 10.97 | 12.99 | 24.25 | 58.0 | 16.5 | 1.41 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix1.rep1 | 7.8 | 40.0 | 0.21 | 4.00 | 4.11 | 8.32 | 42.7 | 13.0 | 1.44 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix15.rep1 | 11.2 | 55.2 | 0.23 | 0.26 | 0.28 | 0.77 | 31.5 | 0.7 | 1.46 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix15.rep2 | 9.3 | 49.0 | 0.27 | 0.33 | 0.34 | 0.95 | 39.5 | 0.8 | 1.51 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix3.rep1 | 11.1 | 33.8 | 0.28 | 0.32 | 0.37 | 0.98 | 56.4 | 17.1 | 1.42 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix3.rep2 | 13.1 | 34.5 | 0.28 | 0.30 | 0.35 | 0.93 | 55.8 | 17.0 | 1.46 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix31.rep1 | 11.0 | 58.7 | 0.34 | 0.38 | 0.44 | 1.16 | 23.7 | 1.0 | 1.44 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix47.rep1 | 24.9 | 59.9 | 0.27 | 0.32 | 0.33 | 0.93 | 24.5 | 0.9 | 1.45 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix47.rep2 | 49.2 | 49.7 | 0.44 | 0.54 | 0.56 | 1.55 | 39.5 | 1.3 | 0.81 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix55.rep1 | 40.3 | 60.0 | 0.27 | 0.31 | 0.36 | 0.95 | 4.3 | 2.2 | 1.48 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix55.rep2 | 27.0 | 60.0 | 0.46 | 0.48 | 0.59 | 1.54 | 6.8 | 3.4 | 1.41 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix59.rep1 | 93.2 | 39.0 | 0.45 | 0.50 | 0.54 | 1.50 | 27.1 | 23.6 | 1.42 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix59.rep2 | 10.3 | 57.4 | 0.28 | 0.32 | 0.36 | 0.96 | 17.4 | 15.0 | 1.44 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix61.rep1 | 85.9 | 60.0 | 0.45 | 8.57 | 8.74 | 17.77 | 5.4 | 1.3 | 1.45 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix61.rep2 | 12.1 | 60.0 | 0.24 | 4.57 | 4.70 | 9.52 | 3.0 | 0.8 | 1.70 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix62.rep1 | 8.9 | 60.0 | 0.25 | 4.90 | 6.60 | 11.76 | 2.6 | 0.8 | 1.50 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix63.rep1 | 10.4 | 60.0 | 0.22 | 0.26 | 0.30 | 0.79 | 2.4 | 0.8 | 1.43 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix63.rep2 | 14.9 | 60.0 | 0.32 | 0.37 | 0.43 | 1.12 | 3.4 | 1.0 | 1.47 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix7.rep1 | 9.0 | 36.1 | 0.41 | 0.45 | 0.52 | 1.38 | 59.0 | 2.9 | 1.77 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix7.rep2 | 40.8 | 29.8 | 0.46 | 0.54 | 0.60 | 1.60 | 67.6 | 3.5 | 0.85 | - | 0.00 | 0.00 |
| pts-100K-10hz-60fps.aura.phases+glcount | 12.4 | 28.0 | 0.23 | 9.39 | 11.19 | 20.81 | 50.1 | 14.7 | 1.43 | 1.36 | 0.00 | 0.00 |
| pts-100K-2hz-60fps.aura.phases+glcount | 36.2 | 54.2 | 0.26 | 9.29 | 10.96 | 20.52 | 49.1 | 14.8 | 1.43 | 1.04 | 0.00 | 0.00 |
| pts-250K-10hz-60fps.aura.phases+glcount | 35.4 | 3.2 | 1.19 | 42.60 | 51.65 | 95.44 | 220.0 | - | 3.38 | 2.00 | 0.00 | 0.00 |

#### A/B probes (patched copies under experiments/, bitmask `fix`)

| run | fix | load1 | fps | frame p50 ms | tick ms | render on tick frame ms | cpu/frame mean | updatePosition | updateColor | speedup of (tick+render) vs fix0 |
|---|---|---|---|---|---|---|---|---|---|---|
| ab.pts-100K-10hz-60fps.fix0 | 0 | 6.7 | 39.9 | 16.7 | 17.0 | 41.1 | 23.9 | 7.69 | 9.09 | 1.0x |
| ab.pts-100K-10hz-60fps.fix1 | 1 | 6.7 | 39.9 | 16.7 | 8.3 | 42.4 | 22.6 | 4.00 | 4.10 | 1.1x |
| ab.pts-100K-10hz-60fps.fix16 | 16 | 8.9 | 37.6 | 16.7 | 21.5 | 32.2 | 25.8 | 9.76 | 11.47 | 1.1x |
| ab.pts-100K-10hz-60fps.fix2 | 2 | 11.0 | 37.3 | 16.7 | 11.3 | 47.1 | 26.1 | 4.73 | 6.31 | 1.0x |
| ab.pts-100K-10hz-60fps.fix32 | 32 | 8.6 | 18.9 | 66.6 | 29.4 | 50.5 | 52.3 | 13.34 | 15.74 | 0.7x |
| ab.pts-100K-10hz-60fps.fix4 | 4 | 10.2 | 31.1 | 16.7 | 25.2 | 45.2 | 24.2 | 11.41 | 13.45 | 0.8x |
| ab.pts-100K-10hz-60fps.fix63 | 63 | 8.5 | 60.0 | 16.7 | 1.1 | 3.3 | 1.6 | 0.33 | 0.42 | 13.1x |
| ab.pts-100K-10hz-60fps.fix8 | 8 | 9.5 | 26.3 | 16.7 | 22.1 | 51.8 | 36.4 | 9.98 | 11.83 | 0.8x |
| ab.pts-1M-10hz-60fps.fix0 | 0 | 13.7 | 1.2 | 800.0 | 253.0 | 574.0 | 827.0 | 115.40 | 134.52 | 1.0x |
| ab.pts-1M-10hz-60fps.fix63 | 63 | 10.5 | 53.9 | 16.7 | 10.7 | 22.4 | 6.9 | 3.16 | 4.25 | 25.0x |
| ab.pts-250K-10hz-60fps.fix0 | 0 | 15.9 | 4.1 | 233.4 | 73.2 | 169.8 | 243.0 | 32.80 | 39.50 | 1.0x |
| ab.pts-250K-10hz-60fps.fix63 | 63 | 12.4 | 60.0 | 16.7 | 2.3 | 5.1 | 2.0 | 0.71 | 0.91 | 32.7x |

#### Ladder at 100K points, 10 Hz sensor, 60 fps target (median of 2 reps; JS ms per ticked frame = tick + render)

| fix mask | configuration | reps | load1 med | tick ms | render-on-tick ms | JS work per ticked frame ms | share of baseline removed | fps med |
|---|---|---|---|---|---|---|---|---|
| 0 | baseline (no fixes) | 2 | 19.8 | 24.2 | 58.0 | 82.3 | - | 34.3 |
| 1 | cumulative up to F1 | 1 | 7.8 | 8.3 | 42.7 | 51.0 | 38% | 40.0 |
| 3 | cumulative up to F1+F2 | 2 | 13.1 | 1.0 | 56.4 | 57.3 | 30% | 34.5 |
| 7 | cumulative up to F1+F2+F4 | 2 | 40.8 | 1.6 | 67.6 | 69.2 | 16% | 36.1 |
| 15 | cumulative up to F1+F2+F4+F8 | 2 | 11.2 | 0.9 | 39.5 | 40.4 | 51% | 55.2 |
| 31 | cumulative up to F1+F2+F4+F8+F16 | 1 | 11.0 | 1.2 | 23.7 | 24.9 | 70% | 58.7 |
| 63 | all six | 2 | 14.9 | 1.1 | 3.4 | 4.6 | 94% | 60.0 |
| 62 | all six except F1 typed finite check | 1 | 8.9 | 11.8 | 2.6 | 14.4 | 83% | 60.0 |
| 61 | all six except F2 skip eager query-geometry rebuild | 2 | 85.9 | 17.8 | 5.4 | 23.2 | 72% | 60.0 |
| 59 | all six except F4 alloc-free bounds loop | 2 | 93.2 | 1.5 | 27.1 | 28.6 | 65% | 57.4 |
| 55 | all six except F8 memoised snapshot bounds | 2 | 40.3 | 1.5 | 6.8 | 8.4 | 90% | 60.0 |
| 47 | all six except F16 bounds from incoming array | 2 | 49.2 | 1.5 | 39.5 | 41.0 | 50% | 59.9 |

#### Floor / isolated costs (ms per operation, mean of 40 iterations; ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version))

| operation | 100000 | 250000 | 1000000 |
|---|---|---|---|
| interleave40ms | 0.26 | 1.00 | 4.21 |
| rawSubData40ms | 0.19 | 0.33 | 1.22 |
| rawSubData40finMs | 0.07 | 0.33 | 1.21 |
| rawSubData16ms | 0.05 | 0.12 | 0.47 |
| rawSubData16finMs | 0.03 | 0.07 | 0.48 |
| deviceWriteBytesMs | 0.05 | 0.14 | 0.57 |
| deviceWriteUploadMs | 0.50 | 0.45 | 1.85 |
| deviceWriteUploadFinMs | 0.39 | 0.33 | 1.70 |
| deviceInterleaveWriteUploadMs | 0.72 | 1.49 | 5.98 |
| setAttributeLoopMs | 6.49 | 15.50 | 60.63 |
| computeBoundsMs | 16.31 | 40.43 | 173.17 |
| typedMinMaxMs | 0.07 | 0.28 | 1.11 |
| isFiniteArrayFromEveryMs | 4.41 | 10.80 | 48.47 |
| isFiniteTypedLoopMs | 0.17 | 0.29 | 1.82 |
| sliceCopyMs | 0.07 | 0.16 | 0.68 |
