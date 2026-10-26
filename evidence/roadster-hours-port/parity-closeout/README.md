# Saltwind Highway (Roadster Hours): vehicles back on `batched.mesh`

4.3.0 parity closeout. Software WebGL2 on the remote runner (`tools/remote-acr/run.sh`, run ids `pcrender-rh-*` and `pcrender-rhm-*`), route 0. Not real-GPU evidence. "Before" is `origin/parity-closeout` at `c45022372`'s parent tree (per-model `instances.custom` nodes plus an instance pool); "after" puts every vehicle in a `batched.mesh`.

| | Before | After |
|---|---|---|
| Vehicle slots that are batched instances | 35 of 68 (33 on instanced nodes) | 68 of 68 (33 textured) |
| Draw calls, every vehicle shown (`probeBatchedDraws`) | 65 | 65 |
| Draw calls, every vehicle hidden | 62 (the pools kept drawing zero-scale instances) | 54 |
| Vehicle share of draws | 3 batched + 8 instanced nodes | 11 (one per pooled geometry) |
| GL frame (`md` / `de` / `dei`) | 0 / 147 / 48 | 0 / 147 / 48 |
| Port spec (renders, replays the recorded run, 0 console errors) | passes | passes (`pcrender-rh-after-port2`) |
| Mean luma, 960x540 route frames (menu, lineup, 720, air, 1680) | 95.3, 102.4, 102.1, 113.7, 112.2 | 95.3, 101.8, 103.8, 113.2, 111.8 |

Frames: `air-*`, `s0720-*`, `s1680-*` (`-before` / `-after`). The lineup cars ahead of the kicker in the air frame are textured and placed identically; the remaining pixel differences are the clock-driven water.

Multi-draw (`md`) is 0 in both builds: it needs the engine batching tier (`A3D_QR_TIERS_BATCHING`), which is off by default, so multi-geometry batched meshes draw one instanced call per geometry. The port spec asserts the multi-draw bounds only when that tier is on (`rendererBatching.multiDrawBatches > 0`) and otherwise bounds the vehicles at one draw per pooled geometry per pass. Real multi-draw gains need the tier enabled by default in the engine.

Sun shadows were not added: every surface of this game (road, terrain, towers, rails) is a `material.custom` shader, which has no sun-shadow receive include, so an engine sun shadow cannot land on it. The same holds for HEATSINK, Strange Orbit and Serpentine Sky Run. Drift and Deliver, Last Train, Kid Goku and Silt and Signal already ship cascaded sun shadows.
