# Last Train to the Sea port: Phase D evidence

Remote run `last-train-h-20261023T065059Z` (Azure ACR Task, Playwright 1.59.1, SwiftShader WebGL2): `tests/browser/last-train-port.spec.ts` passed (1 passed, 4.0 min).

- `last-train-port.json`: renderer gauges after each of the three circuits, drift against loop 1, steps and score per circuit, frame brightness stats.
- `*.jpg`: 480x270 frames logged by the spec (docked, boarding, ready, snow at the Drowned Observatory, rain at Monsoon Exchange, Gardens by day and by night, end of each loop).

| | Loop 1 (day) | Loop 2 (night) | Loop 3 (day) |
| --- | --- | --- | --- |
| Steps (original reference) | 42,343 (42,302) | 42,332 (42,310) | 42,332 (42,321) |
| Score (original) | 4,039 (4,039) | 4,039 (4,036) | 4,039 (4,032) |
| approximateGpuMemoryBytes | 20,274,556 | 20,274,556 | 20,274,556 |
| textures / buffers / renderTargets | 4 / 51 / 1 | 4 / 51 / 1 | 4 / 51 / 1 |
| Scene nodes | 216 | 216 | 216 |

Memory drift against loop 1 is 0% on every gauge (limit 5%).

**Re-recorded 2026-10-29** (remote run `g21w3-portspec-131252`, after the Meshy art pass and audit fix D-09; `last-train-port.json` now holds these numbers): `approximateGpuMemoryBytes` 284,631,602 / 271,679,522 / 271,679,522 over the three loops, 59 textures, 6 render targets, 154 to 164 draw calls, scores 4,039 on every loop. The table above is the procedural-art build of 2026-10-23. On the base commit the same scene measured 406,311,360 bytes, 64 textures and 11 render targets at the first station (run `g21w3-before-115656`). The software renderer's draw-call count varies by 2 between loops and is not asserted.
Night frame mean brightness is 95 against 215 for the same station by day.

## Art pass (look and features)

`art-before/` and `art-after/` are 720x405 frames of the same game states captured on the remote runner (headed Chromium under Xvfb, SwiftShader WebGL2, the same engine build) by `tests/browser/last-train-art.spec.ts`; `tools/crayon-capture/last-train-frames.ts` rebuilds them from the run log. `compare-before-after.jpg` pairs them, `compare-after.jpg` is the contact sheet of the new look. `art-metrics.json` holds per-frame brightness and renderer diagnostics. The `0*.jpg` and `10-*.jpg` frames above are from the earlier, pre-art run.

`judge-before.json` / `judge-after.json` are blind A/B judgements by a vision model through Kiro Prism (48 trials each, seed 20261023, balanced order). THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. The original's reference frames (local only, never committed) all show the tram docked at Mango Tide; both sides are cropped to the same HUD-free band.

| | Before | After |
| --- | --- | --- |
| Judge identifies the original (chance 50%) | 48/48 (100%) | 48/48 (100%) |
| "Same game?" yes rate | 0% | 0% |
| Luma histogram JSD (lower is closer) | 0.574 | 0.147 |
| RGB histogram JSD | 0.907 | 0.626 |
| Edge density ratio, port / original (1 is equal) | 0.10 | 0.53 |
| Palette distance | 0.126 | 0.121 |
| Mean luma delta, port minus original | +82 | -35 |
| Draw calls (software GL, docked) | 599-677 | 117-140 |

The day sky is now blue: custom shaders decode their sRGB colours (`#include <colorspace_decode>`) and the app uses `toneMapping: "none"`. Draw calls dropped by merging the tram into nine per-material meshes, instancing islands and the platform kit, merging the track ribbons, and removing shadow casters from small props.

The port is still trivially distinguishable: buildings are painted but flat boxes with no relief, the people are capsules, the tram is a simple model, and there is no animated crowd.
