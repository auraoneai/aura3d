# Aura Diamond 3D audit-fix evidence (lane G08)

Spec: `tests/browser/audit-fix/aura-diamond-3d.spec.ts`. Runner: `tools/remote-acr/run.sh` (ACR, headless Chromium, software WebGL2). Decoder: `decode.mjs <acr-run.log> <outDir>`.

- `before/`: base `audit-fix/integration` `b2dba3713` (4.5.0 with no lane fixes). Runs `g08-w2-before-grp1`, `-grp2`, `-grp4` to `-grp7`, plus `g08-before-b2` (wave 1, phone and on/off targets). The base has no `?qa-ao` / `?qa-contact` switches, so its `*-noao` and `*-nocontact` targets are the normal render.
- `after/`: lane branch. Runs `g08-w2-after-grp1` to `-grp7` (image from `454f97c46`), `g08-w2-after-qa2` (aimed swings, `38d16705e`), `g08-w2-after-qa3` (results screens after the menu fix, `b2168513d`).
- `meta.jsonl`: one line per shot (luma mean, p5/p50/p95, dark and clipped fractions, game state, `app.diagnostics()` numbers, JS heap). `probes.jsonl`: gameplay probes. `console.txt`: console warnings and errors.

## Steady state (45 s after ready), mean / p50 / dark fraction

| Target | before | after | draw calls before → after | heap MB before → after |
|---|---|---|---|---|
| sandlot 1280x720 | 85.65 / 82 / 0 | 85.98 / 82 / 0.0007 | 691 → 528 | 307 → 273 |
| skyline 1280x720 | 74.49 / 79 / 0.0762 | 73.74 / 79 / 0.0809 | 627 → 370 | 257 → 215 |
| canyon 1280x720 | 110.19 / 117 / 0.0034 | 109.52 / 116 / 0.0041 | 619 → 505 | 290 → 242 |
| ivy 1280x720 | 122.07 / 127 / 0.0006 | 121.55 / 127 / 0.0018 | 654 → 394 | 290 → 257 |
| dome 1280x720 | 67.30 / 55 / 0.0018 | 67.25 / 55 / 0.0018 | 628 → 337 | 273 → 242 |
| lunar 1280x720 | 86.07 / 96 / 0.1354 | 84.15 / 95 / 0.1486 | 610 → 379 | 273 → 228 |
| sandlot 390x844 | 94.14 / 94 / 0 | 92.17 / 93 / 0.0005 | 321 → 276 | 307 → 273 |
| skyline 390x844 | 89.74 / 94 / 0.0048 | 88.03 / 94 / 0.0053 | 295 → 177 | 257 → 215 |
| ivy, AO off (after only) | | 123.51 / 129 / 0.0016 | → 394 | → 257 |
| ivy, contact shadows off (after only) | | 121.49 / 127 / 0.0018 | → 410 | → 257 |
| skyline, AO off (after only) | | 76.75 / 83 / 0.0802 | → 370 | → 215 |

Crop means (after, 1280x720, settle-45s): Ivy batter's feet 155.28 with contact shadows and 155.38 without; catcher's feet 131.07 and 131.00. Mound 167.34 with AO and 171.07 without (Ivy), 108.68 and 114.94 (Skyline).

## Gameplay probes

- Take (no input), `dia-probe-take`: before, nothing is pitched in 600 s (`pitched: false`, count 0-0). After, the pitch comes after the 2 s stance wait and is called "ball — curve 79mph" (count 1-0).
- Swing (Space at varied moments), `dia-probe-swing`: before, every press gives a called strike with no swing grade on software GL. After, each press is graded by timing (WHIFF at -155.6, -164 and -127.6 ms early), and three of them strike the batter out (out 1).
- QA swing, `qa-swing` (`g08-w2-after-grp6`): presses at -250 to +250 ms with the contact point left at zone centre all WHIFF against pitches outside the zone; with no press an in-zone pitch is a called strike and an outside one a ball.
- Aimed QA swing, `qa-swing-aimed` (`g08-w2-after-qa2`): with the contact point on the ball, -250 ms is a WHIFF, -103 ms EARLY (home run), -32 ms GOOD (home run), -1 ms GOOD (groundout, third out). Grades follow timing; outs and the half-inning end happen.
- Park switch, `dia-probe-parks`: before, 27 `bat socket failed: ATTACH_BONE_NOT_FOUND` errors; after, 0. Draw calls after each switch before → after: skyline 549 → 293, canyon 534 → 286, ivy 680 → 379, dome 528 → 286, lunar 627 → 349, sandlot 653 → 358. Heap 527 → 468 MB. No degradations in any park.
- Results screen, `dia-results` (`g08-w2-after-qa3`): "YOU WIN" box score with linescore, hits and LONGEST DRIVE 430 FT, at the top of the menu on 1280x720 and 390x844.
