# Drift & Deliver port: remote browser evidence

## Art pass (Oct 2026): before / after

`frames-before/` and `frames-after/` are 1024x576 JPEGs (`ref-<shot>-clean.jpg`, canvas only, no DOM HUD) of the port at the same 11 shots,
taken by `tests/browser/drift-and-deliver-art-lib.ts` on the remote runner (SwiftShader WebGL2, x64 Linux, quality high).
`compare-before-after-<shot>.jpg` puts them side by side (port only; the original's frames are third-party look reference, kept local and
gitignored in `evidence/look-reference-frames/drift-and-deliver/`, together with the full original | before | after sheets).
Shots: z-idle, z-drive, z-drift, z-boost, x-idle, x-drive, origin, downtown-ne, downtown-sw, outer-e, outer-n (spawns and key scripts in
`tools/crayon-capture/drift-and-deliver-lib.ts` `FRAME_SHOTS`). The original was photographed from its "Chapter 1 - free roam"
start with `tools/crayon-capture/drift-and-deliver-frames.ts` (ACR run `cc1ku` for the clean set; the live loop, not the cutscene camera).
"Before" is the committed port (commit de058cefd, with the headlight-beam engine fix) photographed through a temporary copy of its files.

Blind A/B judge (`tools/crayon-capture/drift-and-deliver-judge.ts`, **a model judgement, not a human one**: `claude-sonnet-5.5` through Kiro Prism,
seed 20261023, balanced A/B per pass, 5 passes x 11 shots = 55 trials, prompt unchanged from the HEATSINK protocol apart from naming the game).
"Round 2" is the first art pass (`judge-after-round2.json`); "round 3" is the performance and brightness pass (`judge-after.json`).

| | before | round 2 | round 3 |
| --- | --- | --- | --- |
| identified the original | 55 / 55 (100%) | 54 / 55 (98.2%) | 55 / 55 (100%, 95% CI 93.5-100%) |
| mean confidence in its pick | 0.97 | 0.79 | 0.79 |
| "same game / same art direction" | 0 / 55 | 0 / 55 | 0 / 55 |
| luma histogram JSD (0 = identical) | 0.614 | 0.340 | 0.312 |
| RGB 4-bit histogram JSD | 0.755 | 0.635 | 0.714 |
| edge density, port / original | 0.215 | 0.539 | 0.593 |
| dominant-palette distance | 0.086 | 0.117 | 0.114 |
| mean luma, port minus original | -26.7 | -35.8 | -13.0 |
| mean RGB over the 11 frames (original 138 / 123 / 101) | 109 / 96 / 81 | 93 / 88 / 85 | 117 / 111 / 106 |

Chance is 50%; more than 70% means distinguishable. The port is still clearly distinguishable: the judge names the car model (the original's
black hypercar), animated crowds and traffic, and repeating facades. Round 3 fixed brightness (luma gap -36 to -13) but the grade is still too neutral:
the original's frames are strongly warm (R 138 > G 123 > B 101) while the port's blue is still high (106), which is why the colour histograms did not
improve. `judge-*.json` hold every trial and its stated tells.

Performance (round 2 to round 3, quality high, 1024x576): draw calls 1,980 to 85-123 per frame (including 2 shadow cascades; the first cut that only merged
the city chunks was 1,151). Cause: instanced meshes (lamps, signals, trees, people) were drawn instance by instance inside every shadow cascade, about 540
draws per cascade for the lamps alone. Now the static props are one merged mesh in palette colours that does not cast shadows, the city is one chunk (10
meshes), wheels are part of each car shell (a car is two draws), the road is one quad, and there are 2 cascades over 150 m. The software-GL render + read-back
proxy (not a GPU frame time) fell from about 78 s per frame (1,151 calls) to 38-55 s (85-123 calls); the round-2 build was not timed. 125,948 city triangles +
135,844 prop triangles, 111 geometries, 32 textures, 20 programs, about 212 MB GPU, 0 errors.

## Earlier frames (headlight fix, 480x270)

`start.jpg`, `driving.jpg`, `boosting.jpg`, `drifting.jpg`, `pickup.jpg` come from `tests/browser/drift-and-deliver-port.spec.ts` before the
art pass (ACR run `chpa`); the spec's final run for round 3 (RUN_ID prefix `drift-art-r3port2`) passed 2/2: boots, draws frames,
the lamp-on frame differs from lamp-off by 8,378 pixels (max delta 97) and relighting reproduces the lit frame exactly, all four original
reference hashes reproduce exactly (6dbb0e7c, 45ad3c05, 305ab087, eedca08b; contacts 0), 225 blocks / 174 pickups / 84 traffic, route health ready,
0 console errors.
