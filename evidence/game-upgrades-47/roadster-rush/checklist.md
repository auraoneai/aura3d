# Apex Overdrive (roadster-rush) WP-12 acceptance checklist

Status per acceptance line: `code` (implemented, verifiable statically or by unit test), `phase 2` (needs the remote capture, judge or real GPU), `blocked (E-x | WP-36)`. Row status lives in `docs/prds/game-upgrades-47/lanes/g02.md`.

| Row | Acceptance | Status |
|---|---|---|
| AO-L1 | appliedLook golden-hour; no ambient-flattens; gameplay-early mean 60-80, p95 >= 215, darkFrac <= 0.06 | code (golden-hour look, no ambient); pixels phase 2 |
| AO-L2 | sunset 70-85, dusk 50-65, night 32-48; spread >= 30 (today 22.65); night darkFrac <= 0.35 | code (setLight/env/fog per row); pixels phase 2 |
| AO-L3 | night bottom-centre cell mean >= 25, stddev >= 10; draws unchanged; fps -10% max | code (3 sodium + 2 headlights; draws unchanged); pixels and fps phase 2 |
| AO-L4 | sun row cascadeCount 3, skipped 0; no weak-key warning; disc node gone; road band darkFrac +0.04 | code (3 PCSS cascades to 140 m, disc removed); diagnostics phase 2 |
| AO-E1 | title top-centre B > R by >= 15; horizon R > B; clip <= 1.5%; night horizon R > B | code + unit test (zenith B > R by >= 15, horizon R > B); clip phase 2 |
| AO-E2 | mid-drive red-pink ground pixels <= 15% (from ~45%); pylons <= 2 draws | code (haze floor, 2 pylon draws); pixels phase 2; Meshy pylon blocked (WP-36) |
| AO-E3 | top road cell stddev >= 30% below bottom; night top-centre <= 30 | code (fog 43/257, colour per row); pixels phase 2 |
| AO-P1 | gameplay-early p5 <= 14, p95 >= 210; exactly one grade stage | code + unit test (one grade stage, apex-bluehour 17^3 LUT from src/art/lut.ts); pixels phase 2 |
| AO-P2 | one bloom at threshold 0.85; sky cell within 3 of bloom off; brake bars +25 | code (one bloom at 0.85); pixels phase 2 |
| AO-P3 | S7 ran, no velocity skip; lane-dash stddev -25% at 64 m/s; receipt effects-motion-blur | code (High-only, reduced motion off); receipts phase 2 |
| AO-P4 | S4 ran; sun-side sky +8; overlay peak <= 0.3; receipt effects-god-rays | code + unit test (overlay peak <= 0.3); S4 receipt phase 2 |
| AO-M1 | position hash 0, bounds same; hero p99 >= 240, B > R; rim edge R > B | code (bounds same, no texture replaced); stripe blocked (WP-36); pixels phase 2 |
| AO-M2 | road cell stddev >= 8; centre road +15 over shoulders; no texture > 2048; no magenta hex in main.ts | code + unit tests (no magenta hex, textures <= 2048 px); pixels phase 2 |
| AO-M3 | hash 0; taxi/bus high-pass energy -30%; draws unchanged | blocked (WP-36) |
| AO-M4 | core p95 >= 240, edge <= 120; draws unchanged | code + unit test (fresnel cone, scrolling noise, hot core, same nodes; scroll off on reduced motion); pixels phase 2 |
| AO-A1 | no showcaseModernBuildingOne; skyline <= 75 draws; >= 2 top cells stddev >= 12 | code (no showcaseModernBuildingOne; 3 draws); top-cell std phase 2; Meshy kit WP-36 |
| AO-A2 | sha differs; bounds differ >= 10% on one axis | blocked (WP-36); interim rival paint |
| AO-V1 | presets contain all 5; liveCount <= 96 dense; crash <= 0.12 of screen | code + unit test (5 presets, <= 96 particles); cyan player / red rival wakes drawn game-side (2 instanced draws, render/wakes.ts); screen share phase 2 |
| AO-V2 | speedLines accepted at >= 50 m/s; not called on reduced motion; >= 1 landing spark | code + unit test (speed lines >= 50 m/s, not on reduced motion, landing sparks); Rocket Send heat shimmer approximated in the rocket plume shader (no refraction pass) |
| AO-AN1 | roll sign matches lateral velocity in >= 95% of samples; 6,000-step replays unchanged | code + unit test (lean sign >= 95%, replays unchanged) |
| AO-C1 | 2 s title differs from chase by >= 15 mean abs luma; ends within 4.5 s; keydown skips; replays unchanged | code + unit test (ends within 4.5 s, replays unchanged); luma difference phase 2 |
| AO-C2 | height <= 2.8 m at 64 m/s; max roll > 0.5 deg; insideColliderSteps 0 | code + unit test (height <= 2.8 m at 64 m/s, roll > 0.5 deg); collider steps phase 2 |
| AO-H1 | no DOM rect over the sun disc; active button matches beacon; game-checks 0 errors | code + unit test (chip hidden unless dev/capture, no stuck button); DOM rect vs sun crop phase 2; game-checks 0 errors |
| AO-H2 | no rect outside viewport; targets >= 44 px; HUD <= 12% of canvas | code + unit test (arc speedo, AIR ladder, 5 inline glyphs, 44 px targets); rects phase 2 |
| AO-W1 | rings in frustum in >= 4 of 5 states; <= 12 draws; no-three and visible-strings pass | code + unit test (rings every 30 m, <= 12 draws, plain labels); frustum count phase 2 |
| AO-W2 | <= 32 live; no decal-budget overrun | code + unit test (procedural skid/oil/arrow, one instanced plane, capacity 32, no engine decals used); pixels phase 2 |
| AO-PF1 | desktop dense <= 230, phone <= 190; no S4/S7 on phone; same_game false vs the 3 racers | budget written (budget.json); S4/S7 High-only, never on phones (unit test); measured draws and sibling judge phase 2 |
