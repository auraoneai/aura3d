# Grid Dispatch (teleoperator) GU47 WP-14 checklist

Every acceptance line of PRD WP-14 (GD-00 ... GD-21) with its phase-1 status. Pixel numbers (luma, crops, pairs,
judges) are phase 2 on the remote runner (software WebGL2). Row status and commits: `docs/prds/game-upgrades-47/lanes/g04.md`.

| Row | Acceptance (PRD) | Phase-1 status |
|---|---|---|
| GD-00 | all 4 skies within ±2 luma and same draws before the new nodes exist | code done (resolved flag set equals the old list, unit test); luma: phase 2 |
| GD-01 | cascadeCount 3 on all skies | code done (KEY_SHADOW cascades 3, unit test); diagnostics read: phase 2 |
| GD-01 | dusk mean 75-100, p95 >= 210, clip <= 0.01; noon 95-120; dusk p5 >= 10 below golden today | phase 2 |
| GD-01 | lighting check passes without escape | one shadowed key, no ambient, audit clean (unit test) |
| GD-02 | night mean 40-65, p95 >= 180, darkFrac <= 0.35; road row >= 2x today; facade cells >= 35; <= 560 draws | phase 2 |
| GD-03 | headlight pool bottom-centre >= 1.6x sides; brake shot +6; inspectMaterials shows emissive lamp | phase 2 (rear-lamp material: WP-36) |
| GD-04 | dusk top row >= 25 below middle; noon top 120-200, no 255 cell; draws not up; no box edge | box sky and sun sphere deleted (unit test); pixels: phase 2 |
| GD-05 | fog: bottom row spans >= 20, top row spans <= 8; fog mean 105-135; dusk towers fade, street darker by >= 15 | phase 2 |
| GD-06 | sun-side top cell +4, bottom cells within 1; S4 in stagesRan; +2 draws max | phase 2 |
| GD-07 | night p95 >= 190, clip <= 0.01; <= 560 draws (<= 650 with mirror) | phase 2 |
| GD-08 | noon car p95 <= 235, clip <= 0.005; 4 sky means differ >= 10 pairwise | phase 2 |
| GD-09 | 0.6 s pair: bottom row differs >= 2, top <= 0.5; reduced motion matches; +1 draw | reduced-motion path unit-tested; pair: phase 2 |
| GD-10 | passExecuted noon and dusk; no weak-key warning; noon p5 -6 | phase 2 |
| GD-11 | car crop p95-p5 >= 175, clip <= 0.01, mean 120-150 | phase 2 |
| GD-12 | 0 game-check errors; `primitives.` lines 19 -> <= 7; no instanced spheres for trees/lamps/signals | see lane report (Meshy part: WP-36) |
| GD-13 | gate passes; two 1 s noon shots differ >= 1.5 on the road cell; +4 draws max | see lane report |
| GD-14 | liveCount > 0 on collision; p95 +10; -1 +2 draws | phase 2 (liveCount read) |
| GD-15 | emitters within tier budget; 2 fewer primitives; night <= 560 | see lane report |
| GD-16 | validate-animation passes; foot slide <= 0.05 m; clip order idle, wave, walk | blocked (WP-36 rigged humanoids) |
| GD-17 | presented fov >= 61 at max speed; skip within 2 frames; reduced motion fov 56, no intro | see lane report |
| GD-18 | overlap checks pass at 390/1280; tags <= 3% of viewport; contrast >= 4.5:1 | see lane report |
| GD-19 | side cells change >= 6 at noon; sign text equals HUD; within GD-20 | see lane report |
| GD-20 | chase <= 480 (night <= 560); textureBytes <= 64 MB; JS +25 KB max | phase 2 (measured); caps in code |
| GD-21 | dusk 75-100, noon 95-120, fog 105-135, night 40-65; clip <= 0.01; every category >= 7; same_game false >= 0.8 vs all 7 racers; 0 warnings | boot sky done; targets: E-I handoff; captures and judges: phase 2 |
