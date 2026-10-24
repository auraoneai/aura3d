# Aura3D per-frame cost on software WebGL2: profile, causes, fixes

Method: `tests/browser/perf-frame-cost.spec.ts` (+ `tests/browser/perf-frame-cost/`) on the remote ACR runner (`tools/remote-acr/run.sh`, RUN_ID prefix `perfcost`), built from workspace source through the example dev server. Per scene it records (plain) a 640x360 timing + CDP CPU profile, (counts) GL call counts and (segments) per-pass GPU wait, with a `readPixels` sync at each framebuffer switch. Software rasteriser (SwiftShader, 2 CPUs): these are not GPU timings. `before/` = origin/main at fe4a9d492, `after/` = this change. `glmicro.json` = raw-GL experiments.

## Median ms per frame (total = until GPU done; cpu = JS)

| scene | before total / cpu | after total / cpu | triangles before -> after |
| --- | --- | --- | --- |
| cube | 666 / 5.1 | 50 / 4.8 | 13 |
| forest 450 inst | 1750 / 17.6 | 1107 / 10.5 | 1.02 M (unchanged: under budget) |
| forest 1,800 | 4819 / 36.5 | 1709 / 12.6 | 4.10 M -> 1.64 M |
| forest 4,500 | 10234 / 69.3 | 2894 / 19.4 | 10.2 M -> 1.79 M |
| forest 9,000 | 19254 / 122 | 5067 / 24.8 | 20.5 M -> 3.58 M |
| forest 18,000 (bench "10,000") | 38387 / 243 | 6432 / 36.7 | 41.0 M -> 4.61 M |

## Causes (measured)

1. Cube: 594 of 666 ms is ONE fullscreen draw, the legacy LDR tone-map present. The same tone map written without dead branches costs ~31 ms in raw GL (`glmicro.json` A) while the exact shader costs ~600 ms (J, K, L: independent of source format, MSAA and target). The uber-shader inlined tone+grade up to 25x behind uniform branches. Fix: per-variant compile (`LdrPostprocessShader.ts`). After: 19.5 ms.
2. Forest: instanced primitives used single-object tessellation (sphere 64x32). 18,000 instances = 10.2 M triangles in the main pass, x4 with 3 shadow cascades. Fix: triangle budget per instanced node (`instancedDefaultSegmentScale`).
3. Forest CPU: per-instance box derivation allocated ~15 objects per instance, several times a frame (243 ms JS per frame at 18,000). Fix: `instancedWorldBounds`.

## Not fixed / findings

- Shadow cascades: the fit puts every caster in every cascade (forest: radius 122-129 m, 0.12 m texels in all 3), and the forward pass picks ONE cascade per draw by item-centre depth (`selectForwardShadowMap`). Casters therefore must stay in every ortho; per-cascade culling culls nothing (tried, unit test showed 9000/9000 kept) and a slice-only fit would drop shadows for large items. Needs per-pixel cascade selection first.
- Shadow depth draws instance 64 per call via a uniform array (282 draws per cascade at 18,000).
- Cube remainder (50 ms): 4x MSAA rgba16f target 20, resolve blit 17, present 26; fp16 + MSAA is slow in SwiftShader only.
- Brightness (from code, not measured: the luma readout in the probe returned 0): with no authored environment the `prd02.neutral-room` source always adds a code-generated room IBL (diffuse + specular) on top of authored lights; three.js adds none. `environments.none()` opts out. The bench's own note (128 -> 187 median luma) agrees. Not changed: product decision.
