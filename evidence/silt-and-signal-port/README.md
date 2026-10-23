# Silt & Signal port: browser evidence

Captured remotely (serverless ACR Tasks, software GL, 1280x720). Frames are not pixel references.

- Round 2 frames (`after-*.jpg`, `after-info.json`): `tests/browser/silt-and-signal-frames.spec.ts`, run `silt-art-20261023T113446Z`. Cel pass (luma banding + outline), tone mapping `none`, exposure 0.65, measured chapter-0 sky/fog. `after-ch0-obj0-notoon.jpg` is the same state with `?toon=0`.
- Round 1 frames (`r1-*.jpg`, `r1-info.json`): PBR with ACES, run `silt-art-20261023T102649Z`. `before-start.jpg` is the original stand-in world (960x540, chapter 0 objective 2).
- Sheets `compare-r1-r2-*.jpg`: round 1 | round 2, port frames only.
- Judge/metrics: `judge-results-standin.json` (stand-in, 1 state), `judge-results-r1.json` (round 1, 1 state x 2 reference frames), `judge-results-r2.json` (round 2, 6 pairs over 5 matched states: chapter 0 objectives 0 to 3 and chapter 1 objective 0, 8 passes each = 48 trials). The model judge is not a human. Originals for the matched states were captured with `tools/crayon-capture/silt-and-signal-ref-frames.ts` (the game's own `qa.chapter` jump, rider at rest, cropped to the game window) and stay local (`evidence/look-reference-frames/` is gitignored).
- `.gitignore` ignores `*.jpg`; this folder and `examples/silt-and-signal-port/assets/textures/` are un-ignored by two negation lines at the end of `.gitignore`.

Simulation parity is measured against `evidence/crayon-capture/silt-and-signal-reference.json`, not these images.
