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

Memory drift against loop 1 is 0% on every gauge (limit 5%). The software renderer's draw-call count varies by 2 between loops and is not asserted.
Night frame mean brightness is 95 against 215 for the same station by day.
