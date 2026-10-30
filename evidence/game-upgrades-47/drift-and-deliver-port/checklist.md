# WP-28 acceptance checklist (drift-and-deliver-port)

Status per acceptance line. "code" = implemented in phase 1, the number is measured in phase 2 (remote software WebGL2 capture). Row detail: `docs/prds/game-upgrades-47/lanes/g18.md`.

| Row | Acceptance | Status |
|---|---|---|
| GC-L1 | only this game uses venice_sunset; env source names it; <= 1.5 MB; darkFrac <= 0.10, clip <= 0.02 | code (1.44 MB measured; luma phase 2) |
| GC-L2 | 25-45% of road in shadow; cascadeCount 3, pcss; bottom p5 <= 35 | code; phase 2 |
| GC-L3 | pass executed; no weak key; under-car crop >= 20 darker | code (High); phase 2 |
| GC-L4 | >= 6 lamp pools 25 over surround at 2:50; draws unchanged; no dropped features | partial: 5 pool lights (C-35 practical cap) |
| GC-L5 | road ahead +30 with headlights; brake halo +15 | partial: headlight spot; no brake light |
| GC-L6 | 0:10/2:00/2:50 means 115/85/55 ±10; top hue 20-40 to 200-240; darkFrac <= 0.5; switch <= 1 frame | code (continuous per-frame blend); phase 2 |
| GC-S1 | uniforms match PHASES; sunset top saturation >= 0.25; >= 30 stars; no recompiles | code (unit: hue/saturation of the table); phase 2 |
| GC-S2 | horizon band within 20 of sky; >= 1% lit windows at blue hour | code; phase 2 |
| GC-S3 | golden far third warm fraction <= 0.2; 150 m silhouettes >= 15 contrast | code; phase 2 |
| GC-S4 | water moves >= 3 over 1 s, buildings < 1; sunset >= 0.5% water pixels > 220 | code (interim shader); phase 2 |
| GC-S5 | god rays at sunset only | not done (C) |
| GC-M1 | sunset road spread >= 120; >= 1% bottom pixels > 200; texture <= 2048 | partial (no box probe); phase 2 |
| GC-M2 | golden mid saturation >= 0.25 with >= 3 hue clusters; >= 3% lit windows; city draws unchanged | partial (no normal canvas); phase 2 |
| GC-M3 | hashes same; >= 2% courier specular; courier vs road >= 40 | blocked (WP-36) |
| GC-M4 | +6 draws max; kind hues >= 40 deg apart; <= 0.5M tris | blocked (WP-36) |
| GC-A1 | judge names the district in >= 4 of 5; +8 draws, +150k tris max | blocked (WP-36) |
| GC-A2 | signal head 4.0-4.4 m; props in the solids list; +12 draws max | partial: lamps 5 m, signals 4.2 m; props WP-36 |
| GC-V1 | liveCount >= 12 after a 3 s drift; >= 100 skid quads; +3 draws max | code (unit: >= 100 live quads); phase 2 |
| GC-V2 | beacon >= 40 px from 300 m and +30 over sky; delivery +25 peak, recovers in 300 ms; signatureEffect declared | partial (no SDF board); signature declared |
| GC-V3 | +1 draw; bulbs >= 0.3% at 230+ | not done (C) |
| GC-P1 | golden p5 <= 35 and p95 >= 205, clip <= 0.02; stages ran on High | code; phase 2 |
| GC-P2 | LUT on/off hue >= 8 deg, luma within 5 | done-interim (temperature per phase); LUTs are an asset need |
| GC-P3 | tilt-shift title bands | not done (C) |
| GC-C1 | no eye inside buildings; skip in 1 frame; replay hashes unchanged | not done |
| GC-C2 | courier 15-20% of height; no camera-in-building frames | code (5.0 / 2.1 / fov 60, clearance kept); phase 2 |
| GC-H1 | text >= 13 px, no overlap at 390/1280; ui_hud >= 7; no outside fonts | not done (teal minimap only) |
| GC-H2 | +6 draws max; glyphs >= 14 px at 30 m | not done (C) |
| GC-H3 | audit passes; game-checks 0 errors and 0 warnings | done (art-direction clean; 2 warnings need phase-2 captures) |
| GC-AN1 | roll 0 straight, >= 3 deg in drift; replay hashes unchanged | partial (4.6.1 roll; no pitch, no braking tails) |
| GC-AN2 | <= 16 skinned draws; >= 3 walkers; slide < 5 cm | blocked (WP-36) |
| GC-PF1 | <= 130 draws; <= 1.3M tris; <= 22 MB; fps -15% max | budget.json written; phase 2 |
| GC-PF2 | sibling judge same_game false >= 0.8; categories >= 7/8 | phase 2 |
