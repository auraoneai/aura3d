# Grid Dispatch (teleoperator) GU47 WP-14 checklist

Every acceptance line of PRD WP-14 (GD-00 ... GD-21) with its phase-1 status. Pixel numbers (luma, crops, pairs,
judges) are phase 2 on the remote runner (software WebGL2). Row status and commits: `docs/prds/game-upgrades-47/lanes/g04.md`.

| Row | Acceptance (PRD) | Phase-1 status |
|---|---|---|
| GD-00 | all 4 skies within ±2 luma and same draws before the new nodes exist | code done (resolved flag set equals the old list, unit test); luma: phase 2 |
| GD-01 | cascadeCount 3 on all skies | code done (KEY_SHADOW cascades 3, unit test); diagnostics read: phase 2 |
| GD-01 | dusk mean 75-100, p95 >= 210, clip <= 0.01; noon 95-120; dusk p5 >= 10 below golden today | phase 2 |
| GD-01 | lighting check passes without escape | one shadowed key, no ambient, audit clean (unit test) |
| GD-02 | night mean 40-65, p95 >= 180, darkFrac <= 0.35; road row >= 2x today; facade cells >= 35; <= 560 draws | code done-interim (3 sodium points, lamp 3.0, facade glow); pixels phase 2 |
| GD-03 | headlight pool bottom-centre >= 1.6x sides; brake shot +6; inspectMaterials shows emissive lamp | code done-interim (brake flag, 2 spots, lamp pair; unit tests); pixels phase 2; rear-lamp material WP-36 |
| GD-04 | dusk top row >= 25 below middle; noon top 120-200, no 255 cell; draws not up; no box edge | box sky and sun sphere deleted (unit test); pixels: phase 2 |
| GD-05 | fog: bottom row spans >= 20, top row spans <= 8; fog mean 105-135; dusk towers fade, street darker by >= 15 | phase 2 |
| GD-06 | sun-side top cell +4, bottom cells within 1; S4 in stagesRan; +2 draws max | code done (unit test); pixels phase 2 |
| GD-07 | night p95 >= 190, clip <= 0.01; <= 560 draws (<= 650 with mirror) | partial (roughness 0.22, drizzle, night SSR in place of the box probe; no mirror); pixels phase 2 |
| GD-08 | noon car p95 <= 235, clip <= 0.005; 4 sky means differ >= 10 pairwise | code done (unit test); pixels phase 2 |
| GD-09 | 0.6 s pair: bottom row differs >= 2, top <= 0.5; reduced motion matches; +1 draw | reduced-motion path unit-tested; pair: phase 2 |
| GD-10 | passExecuted noon and dusk; no weak-key warning; noon p5 -6 | code done (unit test); passExecuted phase 2 |
| GD-11 | car crop p95-p5 >= 175, clip <= 0.01, mean 120-150 | code done-interim (per-material overrides); teal strip WP-36; pixels phase 2 |
| GD-12 | 0 game-check errors; `primitives.` lines 19 -> <= 7; no instanced spheres for trees/lamps/signals | see lane report (Meshy part: WP-36) |
| GD-13 | gate passes; two 1 s noon shots differ >= 1.5 on the road cell; +4 draws max | see lane report |
| GD-14 | liveCount > 0 on collision; p95 +10; -1 +2 draws | partial (impact, ring, spray; trails: E-F handoff); liveCount phase 2 |
| GD-15 | emitters within tier budget; 2 fewer primitives; night <= 560 | partial: steam and motes halve on reduced motion/Low (unit test); beacon lightCone blocked (E-F: beam effects have no runtime position), so no primitives removed; draws phase 2 |
| GD-16 | validate-animation passes; foot slide <= 0.05 m; clip order idle, wave, walk | partial: pitch spring and 120 ms signal fade done (unit test); humanoid lines blocked (WP-36) |
| GD-17 | presented fov >= 61 at max speed; skip within 2 frames; reduced motion fov 56, no intro | code done: fovKick/roll, skippable 3-shot intro (skip switches rig at once; off on reduced motion, unit test), results DOF; measured fov and skip frames phase 2 |
| GD-18 | overlap checks pass at 390/1280; tags <= 3% of viewport; contrast >= 4.5:1 | code done (bezel, bracket tags, amber warnings); contrast unit-tested over a white sky; overlap and tag area phase 2 |
| GD-19 | side cells change >= 6 at noon; sign text equals HUD; within GD-20 | partial: sign text = HUD cross street (unit test), parked cars, catenary; Meshy street furniture WP-36; side cells phase 2 |
| GD-20 | chase <= 480 (night <= 560); textureBytes <= 64 MB; JS +25 KB max | phase 2 (measured); caps in code |
| GD-21 | dusk 75-100, noon 95-120, fog 105-135, night 40-65; clip <= 0.01; every category >= 7; same_game false >= 0.8 vs all 7 racers; 0 warnings | boot sky done; targets: E-I handoff; captures and judges: phase 2 |

## Phase 3 (4.7.1), 2026-10-31

Measured on the remote runner (software WebGL2). Steady rows are in `luma-after.json`, and the rubric is in `look-judgement.json`. Details: lane report "Phase 3 (4.7.1)".

| Row | Phase-3 status |
|---|---|
| GD-01 | dusk mean 70, p95 145 (band 75-100 and >= 210: **not met**); noon mean 92.7 (band 95-120: **not met**, 2-3 short); clip 0 on every sky |
| GD-02 | night mean 58, darkFrac 0.21 (**met**); p95 141 (>= 180: **not met**; PRD lamp 3.0 and bloom 0.55 kept) |
| GD-05 | fog mean 75 (band 105-135: **not met**). The 4.7.0 engine stopped turning the god-ray node into scene fog, and the bank is now a pale engine fog that stays < 0.3 at 40 m |
| GD-08 | noon car crop p95 212, clip 0 (**met**); the four sky means differ pairwise by >= 10 (70 / 93 / 75 / 58: dusk vs fog 5, **not met**) |
| GD-10 | contact shadows 0.55 m at intensity 1, AO 0.75, key softness 0.6; draws 456-467 (<= 480 chase / 560 night) |
| GD-11 | car crop: noon mean 122, spread 193 (**met**); pearl pod roughness 0.2, metallic 0.28 |
| GD-21 | every category >= 7: **not met** (minimum 4; ui_hud 7.5; material and modeling blocked on WP-36). same_game false >= 0.8: heatsink-port 0.728 and last-train-port 0.791 (**not met**; the tram livery is a WP-36 retexture) |
| screens | final screens and card frames retaken (runs g04p3-r3-3/-4/-5); `screens-fresh` cleared |
| game-checks | 0 errors; 8 warnings, all luma-band, bands not widened |
