# Where the Wind Wanders on Aura3D: rendered frames and measurements

Frames are rendered by `tests/browser/where-the-wind-wanders-port.spec.ts` on the remote software-WebGL2 runner (ACR run
`wind-art-1023111305`, SwiftShader, 960x346 viewport = the original's canvas aspect) and live in `frames/`:
`replay-<step>` at steps 306/700/1172/1500 of the recorded 2,098-step run, `view-*` close-ups, `epilogue-*` voyage frames,
`page-*` the real-time title card, walking, journal and pause screens. `compare-<step>.jpg` are before | after sheets of the
port only. The original's frames are third-party and stay local (`evidence/look-reference-frames/`, gitignored).

Blind judge (`tools/crayon-capture/where-the-wind-wanders-judge.ts`, a MODEL judgement via Kiro Prism, seed 20261023,
4 matched states x 12 passes = 48 trials, 640x360 re-encodes): original picked 48/48 before and 48/48 after (chance 50%;
"same game" never chosen). Structural distance to the original (mean over the 4 frames), before -> after: luma JSD
0.196 -> 0.060, RGB JSD 0.722 -> 0.554, palette distance 0.172 -> 0.113, mean luma gap 15.6 -> 2.6, edge-density ratio 0.37 -> 0.53.
So the look is much closer in colour and brightness, but a model still tells the two apart every time (flat low-poly
trees and props, no painted texture detail, different traveller).

Perf at the time of that run (procedural art only, before the Meshy models): 23 draw calls, ~306k triangles, 18.8k foliage cards, 0 asset bytes. Replay worst delta 7.0e-10.

Current build (2026-10-29, audit lane G23, software GL, not a GPU number): 14 to 24 draw calls at 1280x720 depending on the view
(17 at the start, measured from `diagnostics().drawCalls` in remote runs g23-before-10291933 and g23-after-10291946), and
11 Meshy GLBs totalling 8,396,392 bytes (15,714,716 before the 2026-10-29 compression; see `audit-fix/README.md`).
