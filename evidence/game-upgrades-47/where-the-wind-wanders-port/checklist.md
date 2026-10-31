# WP-33 acceptance checklist (where-the-wind-wanders-port, lane g23)

Status per acceptance line. "phase 2" = needs a remote capture, measurement or judge. Commits in `docs/prds/game-upgrades-47/lanes/g23.md`.

| Row | Acceptance | Status |
|---|---|---|
| WW47-L1 | no SUN_DIR const | done (shaders.ts reads uniforms) |
| WW47-L1 | found 3 vs 0: grass R/B +0.12 (unit: sun-lit grass ratio) | done in unit test; pixels phase 2 |
| WW47-L1 | top row changes >= 15 | phase 2 |
| WW47-L1 | unit test on unit vectors and falling elevation | done (daylight.test.ts) |
| WW47-L2 | one sun row sampled with 2 cascades | phase 2 (diagnostics().lighting.shadows) |
| WW47-L2 | cottage shadow 25% darker | phase 2 |
| WW47-L2 | no "no lights" warning; no lighting warning | phase 2 (scene now authors a sun, fill and IBL) |
| WW47-L3 | hero GLB within ±12% of adjacent painted foliage | phase 2 |
| WW47-L3 | env source hdri, no background | done (scene node; unit test) |
| WW47-L4 | cottage shadow centroid moves >= 30 px found 0 to 3 | phase 2 |
| WW47-L4 | 1 sun row at every key; direction within 1 deg of the uniform | done by construction (setLight direction = -uniform); measured phase 2 |
| WW47-L5 | lantern crops >= 1.5x found 0; +2 draws max | phase 2 (halo 0.5 -> 1.6, point 0 -> 5) |
| WW47-S1 | top third falls >= 30 found 0 to epilogue | phase 2 |
| WW47-S1 | > 50 stars on a dark background | phase 2 |
| WW47-S1 | sun disc within 3 deg | phase 2 (disc drawn on the uniform direction; behind the follow camera) |
| WW47-S2 | meadow SSIM < 0.97 over 4 s, sky > 0.995 | phase 2 |
| WW47-S2 | gust spans 1.0-2.5x over 20 s | done (wind.test.ts) |
| WW47-S3 | sea cell spread -20% at found 3, bottom-middle within 5% | phase 2 |
| WW47-P1 | mean 120-145, p5 >= 18, clip <= 2%, dark <= 5% | phase 2 (bands in luma-bands.json) |
| WW47-P1 | no deprecation warnings | done (renderer.quality; bloom without radius) |
| WW47-P2 | god-ray stage at High; sun-side cell +8; NEW receipt | phase 2 |
| WW47-P3 | sky high-pass energy 1.5-3x with mean ±2; post >= 7 | phase 2 |
| WW47-P4 | flare / DOF (C) | not done (C, skipped) |
| WW47-M1 | bell max >= 230, mean 0.7-1.3x tower; no fallback warnings | phase 2 |
| WW47-M2 | edgeDensityRatio >= 0.70; judge | not done (S; next run) |
| WW47-A1 | kite likeness, <= 400 KB, +2 draws, yaw within 25 deg | blocked (WP-36 asset windKite) |
| WW47-A2 | retexture hash diff 0 | blocked (WP-36) |
| WW47-A3 | props validate and fit-grounding | blocked (WP-36) |
| WW47-A4 | hero retexture (C) | blocked (WP-36) |
| WW47-V1 | <= 300 particles, +2 draws; sky SSIM with on/off | done in code (280 max); pixels phase 2 |
| WW47-V2 | liveCount > 0 within 100 ms; >= 200 paper pixels; overlay applied | phase 2 |
| WW47-V3 | burst within 50 ms; no particle > 5% of height | done in code (maxScreen 0.03); measured phase 2 |
| WW47-V4 | chimney smoke (C) | not done (C) |
| WW47-AN1 | gust sail speed >= 1.8x calm; reduced amplitude 0.3 | sails done (2.5x peak, 0.3x reduced); kite and washing line blocked (WP-36) |
| WW47-AN2 | head turn (C) | not done (C) |
| WW47-C1 | no inside-geometry frames; belltower in frame 0; skip within 1 frame | done in unit test (camera-seq.test.ts); frames phase 2 |
| WW47-C2 | traveller 18-22% of height; horizon 30-38% from top | partial (fov 40; offset and lead need sim CAMERA_OFFSET, which sets the input axes: D8) |
| WW47-H1 | no system-ui; font check true; no HUD overlap at 390x844 | partial (fonts done; seal icons WP-36; overlap phase 2) |
| WW47-W1 | dressing fit-grounding | blocked (WP-36 props) |
| WW47-PF1 | High <= 54 draws, Low <= 28 no shadow rows | done in code (foliage never casts; Low no shadows, particles, god rays, paper); measured phase 2 |
| WW47-PF2 | sibling judge, cards, sweep | phase 2 |

## Phase 3 (4.7.1)

| Row | Acceptance | Status |
|---|---|---|
| PRD 6.5 / G23 | each daytime view beats its 4.6.2 frame in a blind 3-judge panel, then defaults to the new look | done: default 2/0/1, found0 2/0/1, found2 3/0/0, found3 3/0/0 (panel g23p3r2b); bell and epilogue from phase 2; `resolveLook` boots GU47 for all six; `?look=original` / `?look=gu47` work both ways |
| PRD 1.2 goal 1 | every rubric category >= 7 | not met: min 4.5 (shadows, ibl_reflections); `look-judgement.json`, before in `look-judgement-before.json`; the round-3 fix for the weakest categories lost the panel (g23p3r3a 0/3/0) and was reverted; material_quality and modeling_assets wait on WP-36 |
| PRD 7.2 | game-checks 0 errors | done: 0 errors, 6 warnings (all luma-band: default/found0 mean ~149-150 vs band 120-145, the 4.6.2 frames read 165; bell is a dusk key with no declared band) |
| PRD 7.2 | final screens and card retaken | done (run g23p3-r2-5; card previews rebuilt) |
| PRD 7.2 | page-parity | done (stale duplicate `<style>` removed) |
