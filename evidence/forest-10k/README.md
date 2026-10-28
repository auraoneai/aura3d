# Forest 10k (18,000 instances) on software WebGL2: lane L-P2 measurements

Method: `tests/browser/forest-10k.spec.ts` on the remote ACR runner (`tools/remote-acr/run.sh`, RUN_ID `forest10k-*`), the bench's forest (8,000 trunks + 8,000 canopies + 2,000 rocks, shadow, fog, 640x360, production profile) built from WORKSPACE source through the example dev server, driven through the bench's forest frame plan (44 frames, 1 cold load). `wallMs` = page open to the last frame of the plan. Software rasteriser (SwiftShader, 2 CPUs): these are not GPU timings. Raw results: `run-*.json`.

| run | change on top of the previous run | wall | first frame | median frame (last 12) | JS in frame |
| --- | --- | --- | --- | --- | --- |
| 4.3.7 baseline (L-W0, `evidence/vs-threejs/RESULTS-4.3.7.md`) | none | 333 s | 16.4 s | 7.32 s | ~28 ms |
| a-1 | dense typed-array instance writes, unchanged-upload skip, allocation-free handedness scan | 334.4 s | 7.57 s | 7.01 s | 20.7 ms |
| b-1 | + per-instance frustum culling of large instanced draws in the forward pass | 313.2 s | 6.56 s | 6.82 s | 19.4 ms |
| c-1 | + shadow proxy geometry (budget 65,536 triangles per node per cascade, floor x0.125 sphere/capsule/torus, x0.25 others) | 291.6 s | 7.04 s | 6.24 s | 19.3 ms |
| d-1 | + cylinder shadow proxies down to x0.125 | 229.7 s | 4.88 s | 4.89 s | 18.6 ms |
| e-1 | same code as d-1 (variance check) | 236.8 s | 5.41 s | 5.16 s | 19.7 ms |

three.js 4x MSAA on the same plan (L-W0): 1.43 s per frame. P6 half 1 (completes in <= 5 min): met in c-1, d-1, e-1 (230 to 237 s). P6 half 2 (<= 3x three.js 4x MSAA = 4.3 s per frame): not met, 4.9 to 5.2 s = 3.4x to 3.6x.

## Where the time goes (perf probe `forest full`, per-pass GPU wait, same runner class)

| pass | before this lane (4.3.x) | with culling + proxy (c-1 code) |
| --- | --- | --- |
| 3 shadow cascades, each | 511 to 560 ms, 1.15 M triangles, 282 draws | 340 to 382 ms, 0.64 M triangles (d-1 code lowers this further) |
| camera pass | 4,283 ms, 1.15 M triangles, 18,001 instances | 3,878 to 4,104 ms, 0.50 M triangles, 7,962 instances |
| total triangles / frame | 4.61 M | 2.42 M |

Ablations (3 frames each, same runner class): no shadows 3.1 s; no shadows and no fog 2.8 s; `environments.none()` 5.8 s vs 5.8 s (the neutral-room IBL is not the cost); fog about 0.3 s.

## Findings

- Halving the camera pass's instances (frustum culling) and triangles (0.50 M vs 1.15 M) moved its time by about 4%: the camera pass is fragment-bound (overdraw of 8,000+ opaque instances into a 4x multisampled RGBA16F target), not vertex-bound. Culling is kept because it is exact and cheap (JS ~0.3 ms for 18,000 instances) and matters on real GPUs.
- Shadow cost scales with triangles x cascades: 3 cascades at 2,048^2 each draw every caster. The proxy geometry cut this the most.
- Remaining floor: about 2.7 s camera-pass shading with no shadows, plus about 1.2 s of shadow sampling inside the camera pass fragment shader (PCF), plus about 0.7 s of depth passes. Closing the last gap to 4.3 s needs a cheaper camera-pass fragment path (quality tier "auto" is lane L-P1) or fewer shadow samples, not more instance work.
- Instance upload and JS were never the cause (L-W0: 98.6% of time in the `readPixels` wait). The typed-array path matters for dynamic updates: 18,000 dense instances cost 0.29 ms of CPU per frame (unit test `tests/unit/engine/instance-matrices-dense.test.ts`).

## Integrated code, cascade cap, and the second half of P6 (after merging `beat3js/integration`)

| run | code | wall | first frame | median frame | min frame |
| --- | --- | --- | --- | --- | --- |
| f-1 | integration (P1, S, K2, K3, M, B, W0) + this lane up to e93a30716 | 234.9 s | 5.95 s | 5.18 s | 4.89 s |
| g-1 | + auto cascades capped at 2 for 8,192+ shadow-casting instances | 223.2 s | 4.79 s | 4.73 s | 4.56 s |
| g-2 | same code as g-1 | 233.6 s | 4.62 s | 5.51 s | 4.60 s |

Run-to-run spread on the same code is about 0.5 to 0.8 s (d-1 vs e-1, g-1 vs g-2), as large as any single change here. Per-pass probe (`pf-full-3`, same code as g-1/g-2): two cascades of 282 draws and 448 k triangles each at 341 and 347 ms, camera pass 3,723 ms at 504 k triangles and 7,962 instances, 569 draws and 1.40 M triangles per frame in total (4.61 M and 851 draws before this lane).

P6 result: half 1 (<= 5 min) is met on every run since c-1 (223 to 237 s). Half 2 (<= 3x three.js 4x MSAA = 4.3 s per frame) is **not met**: best median 4.73 s, typical 4.9 to 5.5 s (3.3x to 3.9x of 1.43 s). The target is left where it is.

What was tried for half 2, and what it bought:
- Cascade cap (2 instead of 3 for dense casters): removes one depth pass, about 0.35 s by the per-pass numbers; inside the run-to-run noise end to end.
- Casters beyond the cascade range: no effect on this scene. All 18,000 instances sit inside +-80 m of the origin and the shadow distance is 150 m, so nothing is out of range.
- Lower cascade resolution: not done. The depth passes are not fill-bound (448 k triangles cost the same 340 ms at 2,048 px as 640 k did), so a smaller map would not buy time and would soften every dense scene.
- Fewer shadow taps in the camera fragment (Vogel 16-tap, tier `pcf5`): not done. It is a compile-time define chosen by the quality tier for every scene; changing it for dense scenes alone needs per-scene tier plumbing that belongs with the quality governor (lane L-P1). The measured price of shadow sampling in the camera pass is about 1.2 s (3.1 s without shadows, 4.1 s with).

Remaining floor, measured: about 2.7 s for the camera pass shading with no shadows (fragment-bound: culling its instances by half moved it 4%), about 1.2 s of shadow sampling in it, and about 0.7 s for two depth passes, of which roughly 280 ms per pass is the 282 draws at 64 instances each (the uniform-array batch size), not triangles. The depth shader has an attribute-instancing mode that would make that one draw per cascade; it is only enabled by `?shadowfit=current` because the 4.3.0 shadow changes were dark with stripes on real GPUs, and which of those changes caused it is not isolated, so it stays off.

## Shadow proxy eligibility and visual check

Rule (code: `qrPrimitiveShadowGeometryFor`, `INSTANCED_SHADOW_PROXY_MIN_INSTANCES = 1024`): a node gets a shadow proxy only if it casts shadows, is a builtin primitive (not `custom`, no authored `geometry`), has at least **1,024 instances**, the page has not set `shadowproxy=off` (or `__A3D_SHADOW_PROXY__ = "off"`), and the proxy is strictly cheaper than its camera geometry (boxes and planes never qualify: their tessellation ignores the segment scale). Authored segment params win exactly as for the camera geometry. The camera geometry, `quality: "production"` output and every node under 1,024 instances are unchanged. The cascade cap applies only to "auto" cascades, from 8,192 shadow-casting instances, and only when the tier would use three or more; `shadow.cascades` set explicitly is never capped; opt-out `__A3D_DENSE_SHADOWS__ = "off"` or `?denseshadows=off`.

Audit (`tests/browser/shadow-proxy-ab.spec.ts`, remote runner, `shadow-proxy-ab.json`): each route loaded twice with both budgets off (noise floor) and once on, screenshots compared, and the pages' own record of built proxies / capped cascades read back. Result under the shipped rule:

| route | verdict |
| --- | --- |
| examples/rendering-large-scene, silt-and-signal-port, roadster-hours-port, ninja-runner-port, drift-and-deliver-port, instanced-texture-probe | no proxy built, no cascade cap: identical to off |
| apps/showcase-vault-breakers, apps/aura-clash-showcase, apps/showcase-smart-city-control | no proxy built, no cascade cap: identical to off |
| apps/showcase-aura-links-3d, showcase-cross-hop, showcase-dot-dash-3d, showcase-blockfall-reactor, templates/arena-shooter | not renderable in the example dev server on the slim remote context (no canvas / 404 / unresolved legacy import); counted from source instead: aura-links about 66 trees per hole (<= 4 nodes of that size), cross-hop pools capped at 260, dot-dash pools capped at 900 (shadow-casting walls 420), blockfall uses boxes and a torus pool, arena-shooter 140 stars. All under 1,024 instances and under 8,192 casters, so neither budget can apply |

No route is affected, so no threshold change and no opt-in switch was needed beyond the global opt-out. The only scenes that qualify today are the forest benchmark nodes (8,000, 8,000 and 2,000 instances) and any author who stamps 1,024+ shadow-casting round instances.
