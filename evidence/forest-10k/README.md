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
