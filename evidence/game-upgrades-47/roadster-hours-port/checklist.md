# Saltwind Highway (WP-32) acceptance checklist

Status per acceptance line of PRD WP-32. "code" = implemented and unit-tested in phase 1; "phase 2" = needs a remote capture, diagnostics run or judge; "blocked" = waits on a lane. Lane report: `docs/prds/game-upgrades-47/lanes/g22.md`.

| Row | Acceptance | Status |
|---|---|---|
| RH47-01 | no look/low-dpr; dithering true | code (`art/output.ts`); phase 2 confirms in diagnostics |
| RH47-01 | textured === total before the shot | code (`texturesReady()` hook); E-I target wait is a handoff |
| RH47-01 | no banding steps > 2 | phase 2 |
| RH47-02 | sunbreak 100-125, clip < 0.02; redline 60-85; halo 32-48, darkFrac < 0.40, road cell > 45 | phase 2 (bands in `luma-bands.json`) |
| RH47-03 | cascadeCount 3 on High; under-car -25; +30 shadow draws max | code (3 PCSS cascades, contact blob); phase 2 measures |
| RH47-04 | env source names the route; no option-ignored | code (node name `route IBL <route> <id>_1k`); phase 2 confirms diagnostics |
| RH47-04 | car highlight hue within 20 deg of horizon | phase 2 |
| RH47-05 | specs compile | code (glslangValidator, shaders-compile test) |
| RH47-05 | sunbreak top stddev +30%; halo horizon >= 2x zenith | phase 2 |
| RH47-06 | +1 program max | code (city replaces water on Halo: 0 per route) |
| RH47-06 | water >= 3% pixels > 200, stddev >= 30; halo bottom >= 25 with > 1% > 200 | phase 2; shoreline foam not done |
| RH47-07 | <= 1 shaderPass per route | code (`saltwind-road-pass`) |
| RH47-07 | no deprecated/threshold warnings; halo S8 ran on Medium+; sunbreak clip < 0.02 | phase 2 (E-C handoff for the bloom radius default) |
| RH47-08 | absent on reduced motion | code (`streakFor` 0) |
| RH47-08 | corners edge density -20% at top speed, car SSIM >= 0.95 | phase 2; motion blur after velocity MRT blocked (E-C) |
| RH47-09 | >= 4 traffic hue buckets | code (unit test) ; phase 2 in pixels |
| RH47-09 | admission with normal and ORM; >= 0.5% car pixels > 230; meshy <= 10 MB | blocked (WP-36) |
| RH47-10 | road and flank edge density +40%, no moire beyond 150 m; +24 MB max | not done (run 1) |
| RH47-11 | >= 4 landmark kinds per route | code (instanced stand-ins); Meshy models blocked (WP-36) |
| RH47-12 | <= 2,000 | code (1,400) |
| RH47-12 | spray centroid moves >= 8% width laterally over 2 s; visible in >= 5 of 8 states | phase 2 (CPU mirror unit-tested) |
| RH47-13 | each sim event maps to one preset | code (unit test) |
| RH47-13 | liveCount > 0 0.2 s after landing; replay ends at 48.325 s | replay unchanged (reference-replay test); liveCount phase 2 |
| RH47-14 | hue shift >= 6 deg in the intended direction | code (LUT + white balance); phase 2 measures |
| RH47-15 | replay 48.325 s, score 26949, 0 crashes | code (reference-replay test green) |
| RH47-15 | turbine/boat crop moves; rotor angle advances | rotor code + unit test; crops phase 2; boat blocked (WP-36) |
| RH47-16 | intro ends within 1 frame of input; reduced motion disables slow-mo and bars | code (unit test) |
| RH47-16 | motion report passes | phase 2 |
| RH47-17 | game-checks pass, no touch warning; targets >= 44 px | code (unchanged 44 px buttons; game-checks 0 errors) |
| RH47-17 | sign cap height >= 14 px at 60 m | not done (no SDF gate signs yet) |
| RH47-18 | audit passes | code (0 violations, audit record committed) |
| RH47-18 | same_game false >= 0.8 in >= 5 of 6 per pair; every category >= 7 | phase 2 |
| RH47-19 | <= 170 draws everywhere; <= 900k tris; <= 12 MB; <= 12 programs; bundle delta recorded | phase 2 (expected deltas in `budget.json`); LOD/impostors not done |
