# Frame comparison: before and after the kit migrations

Question: did moving the ports onto `cameras.chase`, `prefabs.objectiveMarker` and the minimap, `effects.toon`, `installQaHooks` and `createFixedStepLoop` change what they render?

Method: the same deterministic hook script (manual mode, same seeds, same step counts) ran in two builds on the remote software-WebGL2 runner (SwiftShader, headless Chromium, 480x270, `quality=low` where the port has it, JPEG q92). Not real-GPU evidence.

- **pre** = `2c2218d71`, the commit before the first migration (toon, `09a29e514`).
- **t** = `09a29e514`, toon only (Silt & Signal), to isolate the toon step.
- **head** = `34a710b07`, which contains every migration (camera `e67ea0bcf`, marker `0345cf4d5`, QA/loop commits for all ports, group A, B and C docs).

Per frame: mean abs luma difference (0-255) and the percentage of pixels with any channel differing by more than 16. `.a` frames were captured 3 animation frames after the drive, then re-captured as `.b` 6 frames later (continuous animation moves, so `.a` vs `.b` is not a noise measure). Load-to-load variance within one build was measured separately where numbers were not exactly zero (`variance.txt`). The sim state JSON read from each hook was identical pre vs head for every frame.

## Result

| Port (migrations covered) | Frames | pre vs head (mean luma / % px) | Verdict |
|---|---|---|---|
| Drift & Deliver (camera rig, minimap, QA, loop) | 3 | 0 / 0 | equal |
| Kid Goku (camera rig, QA, loop) | 2 | 0.000-0.001 / 0 | equal |
| Ninja Runner (camera rig, QA, loop) | 3 | 0 / 0 | equal |
| Strange Orbit (QA, loop) | 2 | 0 / 0 | equal |
| Where the Wind Wanders (QA, loop) | 2 | 0 / 0 | equal |
| Silt & Signal gatehouse (toon, marker, QA, loop) | 2 loads | 0 / 0 in pre, t and head, both loads | equal |
| Silt & Signal fly240 | 1 | 0 / 0 | equal |
| Silt & Signal chase0 | 2 loads | 0.12-0.13 / 0.05-0.06 | explained: sub-0.1% of pixels; toon step alone gives 0.07 / 0.045, same size as the old build's own load-to-load noise (0.06 / 0.03) |
| Silt & Signal rings | 6 loads per tree | 0 / 0 in all 6 loads of both trees | equal (one earlier head load differed by 5.0 / 9.4%, see below) |
| Roadster Hours (camera rig, QA, loop) | 4 loads x 2 frames | cross-tree 0.40-1.87 / up to 2.1 | explained: old build differs from itself between loads by 0.17-1.84 / up to 2.0, so the cross-tree spread is the same |
| Saiyan Serpentine (QA, loop, sfx) | 4 loads | cross-tree 0-0.41 / up to 0.88 | explained: old build differs from itself by up to 0.48 / 0.98 |

No regression found in any port that finishes on software GL.

## The two open questions

**Silt gatehouse (the 5% difference the toon agent saw).** Not reproducible: the gatehouse frame is pixel-identical in pre, t and head, and identical between two page loads of each. The earlier difference came from run-to-run variance, not from the toon pass. The toon-only step changes at most 0.04% of pixels on the Silt frames that move at all.

**Silt rings, one head load at 5.0 / 9.4%.** In the first run, one of two head loads differed from the other and from pre. The beacon pulse and ripple are driven by `renderTime`, which is wall-clock frame time in both the old and new loop (`sin(time*5)`, `(time*0.8)%1`, identical formulas), so the phase depends on how many frames rendered before the capture. A second run with six loads per tree gave 0 difference everywhere, including pre vs head. Explained as capture-phase noise; the marker poses are also unit-tested against the old formulas.

## Not covered

- **HEATSINK and Last Train** never finish on software GL, so their camera-rig and QA/loop migrations are verified only by unit tests and typecheck.
- **Splat Rush** was already on the kits before this work; **the 15 index games' beacon** change touches evidence, not pixels.
- One resolution, `quality=low`, software GL: it says nothing about real-GPU output. No audio check (nobody listened; audio is parameter-level only).

## Files

- `metrics.json`: per-frame numbers (pre, t, head). `variance.txt`: the load-to-load and six-load runs.
- `pre/`, `t/`, `head/`: the `.a` frames. Tools: `tools/frame-compare/{compare,variance}.mjs` (needs `sharp`). Specs: `tests/browser/framecmp-*.spec.ts` (remote only, `tools/remote-acr/run.sh`).
- Run logs: ACR runs `framecmp-*`; two of the logs were recovered with `az acr task logs` after a local DNS drop cut the stream.
