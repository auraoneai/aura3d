# Forest and shader-water draw/triangle reduction (PRD-2 WP-9, G5)

Method: remote ACR runner (`tools/remote-acr/run.sh`, software WebGL2 / SwiftShader, 2 CPUs; not GPU timings), workspace-source build through the example dev server. Draw counts and triangle counts are exact GL call counts; frame times are software-rasteriser times. Raw results: `forest-draw-reduction.json`, `forest-10k-run{1,2,3}.json`, `bench-shader-water.counts.json`.

## 1. Why the forest had 569 draws

Per frame: 4 draws in the camera pass (ground plus the three instanced nodes: trunks, canopies, rocks) and 1 on the default framebuffer, and **282 draws in each of the two shadow cascade passes** (cascade cap = 2 for dense casters): 282 x 2 + 4 + 1 = 569. (The task text said five instanced nodes; there are three, and only they cast shadows.)

The 282 are not chunked instanced submissions after culling and not shadow proxies. The camera pass already submits each instanced node as one draw. The depth pass (`DepthPass.drawCasterVariant`) draws instanced casters through a uniform array `u_instanceMatrices[64]`, so every node is split into `ceil(n / 64)` draws per cascade: 8,000 trunks = 125, 8,000 canopies = 125, 2,000 rocks = 32, total 282. `DepthPass` already has a one-draw-per-node attribute-buffer mode (`prd02.depthInstanceAttr`); it was switched off by default in 4.3.2 (`3405d2082`) together with the other 4.3.0 shadow changes after Aura Slam rendered dark on a Mac GPU, and it is only enabled by `__A3D_SHADOW_FIT__ = "current"`.

## 2. Change

`depthUsesInstanceAttributes` (`packages/rendering/src/shadows/Prd02DepthShaderLibrary.ts`) now also returns true in the default (legacy) fit for a single caster node with at least `DENSE_DEPTH_INSTANCE_MIN = 1,024` instances, unless `__A3D_DENSE_DEPTH_DRAWS__ = "off"` (or `?densedepth=off`). The threshold is the same per-node threshold as the instanced shadow proxies (`INSTANCED_SHADOW_PROXY_MIN_INSTANCES`), so the set of scenes it can touch is the set already audited for proxies in `shadow-proxy-ab.json`: none of the 14 audited routes has a node that large; only the forest benchmark does. Nodes below 1,024 instances keep the 4.2.0 uniform-array batches exactly (program key and source unchanged: unit-tested). `quality: "production"` output is byte-identical to the previous behaviour for every scene without a 1,024+ instance caster; the cascade fit, oversize-caster rule, vignette and the other 4.3.0 switches are untouched. No state is cached across frames: the depth instance buffer is created and disposed per draw exactly as the existing attribute path does.

Per-cascade compaction of visible instances was not needed to reach the draw target and was not done. The depth pass still draws all 18,000 instances in each cascade (no per-cascade culling); that would change triangle counts, not draw counts.

## 3. Result (`tests/browser/forest-draw-reduction.spec.ts`, run `w9-draws`)

| | camera pass + default fb | cascade 1 | cascade 2 | total |
| --- | --- | --- | --- | --- |
| before (`?densedepth=off`) | 4 + 1 | 282 | 282 | **569** |
| after (default) | 4 + 1 | 3 | 3 | **11** |

(three.js: 7.) Acceptance (forest draws <= 40): **met, 11**.

Visual check: both loads render the same 3 frames at the same dt; the last frame is read with `gl.readPixels` straight after it is drawn and compared pixel by pixel. 230,400 pixels, **0 differing pixels** (mean 0/255, max 0/255, interior mean 0/255), well inside the mean <= 2/255 and interior <= 2/255 limits. The depth values are bit-identical because the same matrices go through the same multiply; only the delivery path (uniform array vs vertex attribute) changed.

Caveat: this was proven on software WebGL2 only. The earlier 4.3.0 attribute path was part of a change set that rendered dark with stripes on a Mac GPU, and which of those changes caused it is still not isolated. That is why the new default is limited to 1,024+ instance nodes and has an opt-out; a real-GPU receipt (owner step OWNER-1) is needed before the speed or correctness of this path is claimed on hardware.

## 4. Forest timing (`tests/browser/forest-10k.spec.ts`, three parallel runs, median of the last 12 of 44 frames)

| run | wall | first frame | median frame | min | max | CPU in frame() median |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 216.5 s | 4,772 ms | 4,557 ms | 4,478 ms | 4,980 ms | 13.0 ms |
| 2 | 213.3 s | 4,571 ms | 4,608 ms | 4,497 ms | 5,258 ms | 12.9 ms |
| 3 | 225.4 s | 5,143 ms | 4,771 ms | 4,668 ms | 5,165 ms | 13.4 ms |

Median of the three medians: **4,608 ms = 3.22x three.js 4x MSAA (1.43 s)**. Console empty in all three. The WP-3 final code measured 4,701 ms (3.29x) on the same spec, so removing 558 depth draws per frame moved the median by about 2%, which is inside the 0.1 to 0.8 s run-to-run spread documented in `evidence/forest-10k/README.md`. The P6 target (<= 2.5x = 3.575 s) is **not met** and the target is not moved; the cause is unchanged from the README: the camera pass is fragment-bound (about 2.7 s shading plus about 1.2 s of shadow sampling) and the draw count was never the cost on this rasteriser. The draw reduction is a real saving in CPU submission and in GL calls (and matters on real GPUs), not in software-raster time.

## 5. Shader-water triangles (`tools/bench-vs-threejs/shader-water`)

Before: 22,530 (three.js 19,394). Cause, from the sources: the water plane is identical on both sides (`80 x 80`, 96 x 96 segments = 18,432 triangles). The difference is the sky sphere: three.js uses `SphereGeometry(300, 32, 16)` (960 triangles; it omits the degenerate pole triangles) while the Aura3D bench used `primitives.sphere` at its default 64 x 32 segments (4,096 triangles). 18,432 + 4,096 + 2 (post quad) = 22,530.

Change: the Aura3D bench source now passes `params: { widthSegments: 32, heightSegments: 16 }` to the sky sphere (`tools/bench-vs-threejs/shader-water/aura/scene.ts`). Measured on the remote runner (`perf-frame-cost.spec.ts` "bench scenes", `bench-shader-water.counts.json`, 3 frames): **19,458 triangles, 4 draws**, versus three.js 19,394. The remaining +64 is Aura3D's `Geometry.uvSphere` keeping the two pole rings of degenerate triangles (32 per pole) that three.js drops; changing that would change every sphere in the engine and is out of scope here. The row is within 0.33% of three.js but not equal. The bench sky shader is a function of the view direction, so the coarser tessellation matches the three.js scene it is compared against; no engine geometry or game art changed.
