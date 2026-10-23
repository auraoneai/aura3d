# Roadster Hours port: browser evidence

Remote run `roadster-hours-b14` (Azure ACR Task, SwiftShader WebGL2, 640x360), spec `tests/browser/roadster-hours-port.spec.ts`: 1 passed.

- `start.jpg`, `driving.jpg` (after 14 s of autopilot), `finish.jpg` (after the replayed reference run): 480x270 JPEGs read back through `app.capture`.
- Frame stats: start lumaStd 50.3 / 135 colour buckets, driving lumaStd 48.7 / 142 buckets, different frame hashes.
- Batching: 92 vehicle boxes in one `batched.mesh` (2 pooled geometries). GL counters for one frame: 3 `multiDrawElementsInstancedWEBGL` calls carrying 552 members (the batch is drawn by several passes), 90 plain `drawElements` for everything else. Before the engine fixes below the same frame issued 92 per-vehicle draws.
- Replay: the reference input script captured from the original game replays in the live page to time 48.325 s, score 26949, 1 cell, 0 crashes, identical to the original's final state.
- Reference: `evidence/crayon-capture/roadster-hours-reference.json` (6124 steps, two independent sessions, bit-identical, tolerance 0).

Known visual gaps: boxes for vehicles, flat sky, no post-processing; the water shader aliases into moire at distance.
