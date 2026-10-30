# WP-30 acceptance checklist (ninja-runner-port)

Status per acceptance line of PRD WP-30 (lines 1148-1169). "phase 2" = needs a remote software-WebGL2 capture.

| Row | Acceptance | Status |
|---|---|---|
| NR-01 | env source is the HDRI; stops village 115-130, rooftops 95-115, river 75-95, forest 50-70, gate 40-60, >= 12 apart | code done; bands declared in `luma-bands.json`; pixels phase 2 |
| NR-02 | cascadeCount 3, pcss; rooftop bottom p5 <= 35; warm >= 50%; no jump > 10 across 1510 m | 3 cascades PCSS on High (1 PCF on Low); smooth look unit-tested; pixels phase 2 |
| NR-03 | gate bottom row +15 vs lanterns off; p95 >= 210 forest/gate; +0 draws | 6-light pool (4 amber + 2 cyan), `?lanterns=0`; pixels phase 2 |
| NR-04 | p5 <= 25 river/forest/gate; darkFrac <= 0.35 | fills removed; phase 2 |
| NR-05 | rooftop top row 90-140, >= 40% warm; gate top <= 45; compile test passes | compile test passes; pixels phase 2 |
| NR-06 | ridge cell moves >= 15 village to forest; paletteDistance >= 0.1; forest top spread <= half bottom | setFog per district; phase 2 |
| NR-07 | S4 on rooftop, not gate; sun-side +4 | not done |
| NR-08 | hdr-msaa; clip <= 0.03; spread >= 150; post >= 7 | grade wired (no LUT); phase 2 |
| NR-09 | edgeDensityRatio 1.1-1.6; same_game false >= 90% vs cloud-runner-port | full-frame ink; phase 2 |
| NR-10 | dash edge ratio <= 0.9; kick only on dash | not done |
| NR-11 | roof p95 >= p50 + 30 | not done |
| NR-12 | hashes same; props < 8k; <= 24 MB | blocked (WP-36) |
| NR-13 | environment >= 7 on 5 stops; <= 150 draws | blocked (WP-36) |
| NR-14 | liveCount > 0 idle village/forest; zeroPixelFrames 0; kill frame indigo +0.5 pp | presets + ambients wired; phase 2 |
| NR-15 | ribbon live; +0.3% #d4553a vs `?scarf=0`; declared signatureEffect | ribbon wired, signature declared, `?scarf=0`; phase 2 |
| NR-16 | cones +15 | not done |
| NR-17 | 2 weighted actions; clipFlips <= 4/10 s | not done |
| NR-18 | intro bars, height > 20 m | not done |
| NR-19 | ui_hud >= 7; HUD <= 90 px | not done |
| NR-20 | river crop >= 50% warm; paletteDistance >= 0.1 | done; river crop published; phase 2 |
| NR-21 | audit passes; game-checks 0 errors | done |
| NR-22 | 5 rows in the NR-01 bands; spread >= 150; <= 150 draws | `?at=` + crops done; phase 2 |
