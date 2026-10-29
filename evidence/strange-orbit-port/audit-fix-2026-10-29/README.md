# Craterline GP lighting, audit fix 2026-10-29 (lane G15, LIGHT-01 / SO-4)

Remote software GL (tools/remote-acr/run.sh, SwiftShader), 1280x720, spec `tests/browser/audit-fix/strange-orbit-port.spec.ts`. Page `examples/strange-orbit-port/index.html` (the app wrapper imports the same `main.ts`). Menu shot 60 s after ready; race shot after a deterministic 7 s of pedalling from `begin()` through the QA hooks, then paused. Both poses are identical across runs, so fixed boxes measure the same pixels.

Regions (x0, y0, x1, y1): menu `bike` 620,350-910,525 (player bike GLB); race `rider` 585,405-685,650 (player bike GLB from behind), `pylon` 1090,20-1250,500 (gate pylon GLB), `sky` 100,100-500,350 (custom-shader sky, the control). Numbers are mean Rec. 709 luma of the canvas JPEG (`crop.mjs`, run from the repo root); `meta.jsonl` holds the in-page records.

| Run | Code | env | menu bike | race rider | race pylon | race sky | frame (menu / race) |
|---|---|---|---|---|---|---|---|
| g15ref437-1 | v4.3.7 | none (implicit neutral room) | 124.84 | 102.54 | 49.11 | 36.10 | 86.10 / 42.67 |
| g15before-1 | base b2dba3713 | none | 82.62 | 58.17 | 29.77 | 36.09 | 83.89 / 39.26 |
| g15combo-b | E2 + G15 | 0 | 84.08 | 60.30 | 29.87 | 36.10 | 83.97 / 39.36 |
| g15combo-b | E2 + G15 | 0.5 | 111.69 | 90.03 | 42.05 | 36.10 | 85.33 / 41.50 |
| g15combo-b | E2 + G15 | 0.75 | 122.18 | 99.05 | 46.45 | 36.10 | 86.09 / 42.23 |
| g15combo-a | E2 + G15 | 1.0 | 129.39 | 106.32 | 50.44 | 36.12 | 86.56 / 42.94 |
| g15combo-c | E2 + G15 | 1.25 | 133.84 | 112.68 | 53.77 | 36.14 | 86.69 / 43.55 |
| **g15combo-final** | **E2 + G15** | **0.9** | **124.96** | **103.54** | **48.87** | 36.12 | 86.11 / 42.64 |
| g15after-1 | G15 only | 0.9 | 122.20 | 99.49 | 47.56 | 36.11 | 85.94 / 42.39 |

Against 4.3.7: the base is 34% (bike), 43% (rider) and 39% (pylon) darker. With E2 (directional hemisphere) and `environments.neutral({ intensity: 0.9 })` the three regions are +0.1%, +1.0% and -0.5%. On the G15 branch alone (flat hemisphere mean) they are -2.1%, -3.0% and -3.2%. The sky control stays within 0.05 luma in every run.

Frames: `frames/<run>-so-*__{menu,race}.jpg` (`combo-*` is the env 1.0 run, `combo-b-*` and `combo-c-*` are the sweep).
