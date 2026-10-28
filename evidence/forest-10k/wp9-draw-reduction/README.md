# Forest and shader-water draw/triangle reduction (PRD-2 WP-9, G5)

Method: remote ACR runner (`tools/remote-acr/run.sh`, software WebGL2 / SwiftShader, 2 CPUs; not GPU timings), workspace-source build through the example dev server. Draw counts and triangle counts are exact GL call counts. Frame times are software-rasteriser times from a shared runner and are indicative only (section 4). Raw results in this folder: `forest-draw-reduction.json`, `forest-10k-run{1,2,3}.json`, `shader-water-sky-density.json`, `shader-water-sky-density-3frame-runs.json`, `bench-shader-water.counts.json`.

This README was corrected after review; section 6 lists what changed and what the first version claimed that was not backed.

## 1. Why the forest had 569 draws

Per frame: 4 draws in the camera pass (ground plus the three instanced nodes: trunks, canopies, rocks) and 1 on the default framebuffer, and **282 draws in each of the two shadow cascade passes** (cascade cap = 2 for dense casters): 282 x 2 + 4 + 1 = 569. (The task text said five instanced nodes; there are three, and only they cast shadows.)

The 282 are not chunked instanced submissions after culling and not shadow proxies. The camera pass already submits each instanced node as one draw. The depth pass (`DepthPass.drawCasterVariant`) draws instanced casters through a uniform array `u_instanceMatrices[64]`, so every node is split into `ceil(n / 64)` draws per cascade: 8,000 trunks = 125, 8,000 canopies = 125, 2,000 rocks = 32, total 282. `DepthPass` already has a one-draw-per-node attribute-buffer mode (`prd02.depthInstanceAttr`); it was switched off by default in 4.3.2 (`3405d2082`) together with the other 4.3.0 shadow changes after Aura Slam rendered dark on a Mac GPU, and it is only enabled by `__A3D_SHADOW_FIT__ = "current"`.

## 2. Change (as corrected after review)

`depthUsesInstanceAttributes` (`packages/rendering/src/shadows/Prd02DepthShaderLibrary.ts`) returns true in the default (legacy) fit only for a caster node that

- has at least `DENSE_DEPTH_INSTANCE_MIN = 1,024` instances, **and**
- carries an engine-assigned instanced shadow proxy (`RenderItem.shadowGeometry`, set by `qrPrimitiveShadowGeometryFor`: castShadow, builtin primitive with no authored geometry, qr core path, 1,024+ instances, proxy strictly cheaper than the camera geometry, page not opted out with `shadowproxy=off`), **and**
- has no `drawRange`, **and**
- the page has not set `__A3D_DENSE_DEPTH_DRAWS__ = "off"` (or `?densedepth=off`).

The first version of this change gated on the instance count alone. Review was right that this was wider than the evidence: the "set already audited for proxies" argument only holds if the depth path is limited to the nodes that get a proxy, and the count gate was not. It also reached instanced GLB or model nodes, custom or authored geometry, boxes (never get a proxy), non-core paths and nodes with a draw range, none of which any run covered. With the proxy requirement:

- Everything outside that set keeps the 4.2.0 uniform-array batches exactly (program key and source unchanged). Unit-tested: `tests/unit/contracts/impl/shadow-legacy-mode.test.ts` (dense without proxy, with draw range, variant feature absent), `tests/unit/contracts/impl/prd02-depth-dense-default-fit.test.ts` (2,000 instances with no proxy = 32 draws, no vertex attributes).
- `tests/unit/engine/instanced-shadow-proxy.test.ts` pins that the forest's three nodes (8,000 cylinders, 8,000 cones, 2,000 spheres) all get a proxy and a box never does, and the browser spec asserts the page reported all three proxies (`trunks`, `canopies`, `rocks`).
- The set of scenes it can change is the set of scenes with a proxied node, which is what `evidence/forest-10k/shadow-proxy-ab.json` audited: 14 routes, only the forest benchmark has such a node. That audit measured proxies, not this depth path, and it was run in software GL; the claim here is only that the affected set is the same set, not that the depth path itself was A/B'd on any other scene.
- Opt-outs: `?densedepth=off` / `__A3D_DENSE_DEPTH_DRAWS__ = "off"` restores uniform-array batches for the proxied nodes; `?shadowproxy=off` / `__A3D_SHADOW_PROXY__ = "off"` removes the proxies and with them this path. Neither is documented outside code comments and this README (no docs edits in this lane).

`quality: "production"` output is therefore unchanged for every scene without a 1,024+ instance builtin-primitive shadow caster, and for those scenes only the delivery path of instance matrices to the cascade depth pass changes. The cascade fit, oversize-caster rule, vignette and the other 4.3.0 switches are untouched.

Per-cascade compaction of visible instances was not needed to reach the draw target and was not done. The depth pass still draws all 18,000 instances in each cascade (no per-cascade culling).

### Resource behaviour of the attribute path (measured in the same run, not assumed)

The attribute path creates one instance vertex buffer and one VAO per dense node per cascade per frame and disposes them after the draw (the VAO key embeds the buffer id). Measured on the forest, last frame of each load (`frameAlloc`): **6 `createBuffer`, 6 `deleteBuffer`, 6 `createVertexArray`, 6 `deleteVertexArray`, 6 `bufferData` calls, 2,304,000 bytes uploaded** (18,000 instances x 64 B x 2 cascades) versus 0 object creations for the uniform-array path. Live buffers and vertex arrays gained over 12 further frames: **0 and 0**. The uniform-array path uploads the same matrix bytes through `uniform` calls, which that hook does not count. What was not measured: the per-frame allocation cost on a real GPU driver (OWNER-1), so no speed or cost claim is made for hardware.

Review of that path found a real defect, fixed here: `WebGL2DrawCallBinder.evictVertexArraysForBuffer` (`packages/rendering/src/webgl2/MultiDraw.ts`) deleted the VAOs of a disposed buffer but never removed the buffer's own entry from `bufferVaoIndex`, and it scanned every entry of that map on each eviction. With one disposed instance buffer per node per cascade per frame, the map would have grown by 6 empty sets per frame for the life of the page and each dispose would have walked all of them. The entry is now deleted on eviction; `tests/qr/prd01/unit/submission-perf.test.ts` ("per-frame instance buffers do not accumulate eviction-index entries") runs 600 frames and fails without the fix. (This is a minimal hunk in a file owned by another lane: WP-5 submission files.) `invalidateGpuObjects` (context loss) already clears both maps. Not exercised in a browser for this path: context loss/restore and a runtime render-path switch while the dense path is active. No cross-frame GL state caching was added; the attribute path holds nothing across frames except the VAO cache, which is keyed by buffer id and evicted on dispose.

## 3. Result (`tests/browser/forest-draw-reduction.spec.ts`, run `w9fix2`)

| | camera pass + default fb | cascade 1 | cascade 2 | total |
| --- | --- | --- | --- | --- |
| before (`?densedepth=off`) | 4 + 1 | 282 | 282 | **569** |
| after (default) | 4 + 1 | 3 | 3 | **11** |
| shadows disabled (control) | 4 + 1 | - | - | 5 |

(three.js: 7.) Acceptance (forest draws <= 40): met, 11.

Visual equivalence, now with the controls review asked for. Both pairs (off, on, off, on; same container, same frames at the same dt, last frame read with `gl.readPixels` straight after it is drawn): 230,400 pixels, **0 differing pixels** each (mean 0/255, max 0/255, interior 0/255), inside the mean <= 2/255 and interior <= 2/255 limits. The equality is not two blank or unshadowed frames: the frames have luma std 65.7, 18,845 distinct colours, the most common colour covers 35% of pixels; a third load with shadows disabled (5 draws) has 17,292 colours and differs from both shadowed frames on **0.78% of pixels (1,806) by more than 4/255**, i.e. the shadows are in the frame and the same in both paths; there were no console errors or warnings in any of the 5 loads. The test asserts all of this (non-flat frame, shadows visible against the shadow-less control, the three proxies reported, balanced GL object counts, empty console), so two identically degraded frames would now fail it. Limit: one 640x360 camera pose, final frame of a short run; software WebGL2 only.

Caveat that stays: this was proven on software WebGL2 only. The earlier 4.3.0 attribute path was part of a change set that rendered dark with stripes on a Mac GPU, and which of those changes caused it is still not isolated. That is why the new default is limited to proxied 1,024+ instance nodes and has an opt-out; a real-GPU receipt (OWNER-1) is needed before the speed or correctness of this path is claimed on hardware.

## 4. Timing (indicative only; P6 not met, no post-WP-9 ratio claimed)

Interleaved A/B in one container (`steady` in `forest-draw-reduction.json`, median of 12 frames each, total includes the GPU wait of the software rasteriser):

| | total ms, pair 1 | total ms, pair 2 | frame() CPU ms, pair 1 | frame() CPU ms, pair 2 |
| --- | --- | --- | --- | --- |
| dense depth OFF | 5,738 | 6,145 | 22.9 | 21.7 |
| dense depth ON | 5,274 | 5,613 | 15.6 | 18.0 |

ON is 8.1% and 8.6% lower in total time and 7 and 4 ms lower in submit CPU in the two pairs. The per-frame ranges overlap (for example ON max 5,904 ms vs OFF min 5,137 ms), 12 frames per load is small, and this is a software rasteriser, so read it as "no regression, probably a few percent faster here", not as a measured speed-up.

Three sequential `forest-10k` runs (one at a time, `forest-10k-run{1,2,3}.json`, median of the last 12 of 44 frames) replace the three parallel runs of the first version, which were not like-for-like with the earlier sequential WP-3 figure and have been discarded:

| run | wall | first frame | median frame | CPU in frame() median |
| --- | --- | --- | --- | --- |
| 1 | 237.4 s | 4,949 ms | 5,175 ms | 14.1 ms |
| 2 | 306.0 s (over the 300 s wall limit, the spec failed on that) | 6,062 ms | 6,774 ms | 16.1 ms |
| 3 | 299.0 s | 7,001 ms | 6,529 ms | 17.0 ms |

The runner itself drifted by 30% to 50% between runs made within the hour (these medians are 5.2 to 6.8 s; the earlier parallel runs read 4.6 to 4.8 s), so no run-to-run or version-to-version comparison is possible from them. In particular the first version's "3.22x three.js" and "about 2% change" are withdrawn: the 1.43 s three.js figure was measured at another time on a runner in another load state, so dividing today's medians by it (3.6x to 4.7x) would be just as unreliable. The P6 target (<= 2.5x) is **not met** and the target is not moved. The explanation that the camera pass is fragment-bound (about 2.7 s shading plus about 1.2 s shadow sampling) is carried over from the earlier `evidence/forest-10k/README.md`; nothing in WP-9 profiled it again. What WP-9 does show is that the draw count fell from 569 to 11 and the interleaved A/B above did not slow down.

## 5. Shader-water triangles (`tools/bench-vs-threejs/shader-water`)

Before: 22,530 (three.js 19,394). From the sources: the water plane is identical on both sides (`80 x 80`, 96 x 96 segments = 18,432 triangles). The difference is the sky sphere: three.js uses `SphereGeometry(300, 32, 16)` while the Aura3D bench used `primitives.sphere` at its default 64 x 32 segments.

Change: the Aura3D bench source passes `params: { widthSegments: 32, heightSegments: 16 }` to the sky sphere (`tools/bench-vs-threejs/shader-water/aura/scene.ts`; `?skysegs=64x32` restores the engine default for the A/B).

Measured with exact GL draw-call sums (`tests/browser/shader-water-sky-density.spec.ts`, `shader-water-sky-density.json`, 8 frames, three loads of the scene):

| | draws | triangles |
| --- | --- | --- |
| sky 64 x 32 (before) | 3 (water 18,432; sky 4,096; one post triangle) | **22,529** |
| sky 32 x 16 (after, default) | 3 (water 18,432; sky 1,024; one post triangle) | **19,457** |
| control: default again | 3 | 19,457 |

(`bench-shader-water.counts.json`, from `perf-frame-cost.spec.ts`, shows 4 draws and 19,458 / 22,530: the same scene with one extra one-triangle post draw.) The measured 3-versus-4-draw difference is unexplained: in 3-frame runs of the new spec the scene drew 4 times in about 2 of 8 loads, and those loads differ from the 3-draw loads by about 5.5/255 over the whole frame (`shader-water-sky-density-3frame-runs.json`); with 8 frames all loads were stable at 3. It is bench-harness startup behaviour, not engine code, and was not investigated here. So Aura3D is now 19,457 (or 19,458) against three.js 19,394 from `RESULTS.md`: +63 or +64. The explanation that the remainder is the two rings of 32 degenerate pole triangles that Aura3D's `Geometry.uvSphere` keeps and three.js drops (three.js 960-triangle sphere) is **derived from reading the sources**, not from a count of the three.js scene in this run; engine sphere tessellation was not changed. The row is within 0.34% of three.js but not equal.

Visual effect of the coarser sky, measured: last-frame difference between 64 x 32 and 32 x 16 sky: mean 0.0013/255 over the frame, max 0.67/255, 0 pixels above 4/255, **0 difference in the sky band (top fifth of the frame)**; the same configuration loaded twice differs by 0. The existing `evidence/vs-threejs/frames/shader-water-aura-*.jpg` were not regenerated for this change; the A/B above is the evidence instead.

## 6. What the review changed in this README

- Gate corrected from "1,024+ instances" to "1,024+ instances with an engine shadow proxy"; the "set already audited" sentence now says what the audit does and does not cover; the "byte-identical" sentence is restated for the actual set.
- Browser test strengthened (non-blank, shadows visible against a shadow-less control, proxies reported, balanced GL objects, empty console, second interleaved pair).
- Per-frame buffer/VAO churn measured instead of asserted; a real leak in the eviction index found and fixed.
- Timing section rewritten: parallel runs discarded, sequential and interleaved runs reported with their noise, ratios withdrawn, fragment-bound explanation labelled as carried over.
- Shader-water: triangle counts, draw list and pixel effect measured; the pole-triangle explanation and three.js count labelled as source-derived.
