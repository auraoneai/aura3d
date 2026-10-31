# Aura Hoops 3D WP-17 acceptance checklist (phase 1 status; numbers are phase 2, software WebGL2)

Statuses mirror `docs/prds/game-upgrades-47/lanes/g07.md`.

| ID | Acceptance | Status |
|---|---|---|
| H47-L1 | 6 distinct HDRI keys | done (courtRigs.ts, unit test) |
| H47-L1 | p95 >= 215 on 5 courts; clip <= 0.03; per-court mean bands; AO feet -4%; 0 lighting warnings | phase 2 |
| H47-L2 | >= 3 sampled shadow rows on Rucker | partial: the C-35 audit caps basketball at one shadowed light; handoff |
| H47-L2 | lamp crop p95 >= 245, clip <= 0.03; feet p5 -8% | phase 2 (lamp heads emissive 6.5) |
| H47-L3 | Shanghai darkFrac <= 0.10, mean 45-65; columns differ >= 12 | phase 2 (rect lights mounted) |
| H47-L4 | Venice intro top row +30; visibility 0 with sun behind camera | phase 2 (flares mounted) |
| H47-E1 | no solid-void; top third spread >= 60; far crop spread | phase 2 (fog to horizon + HDRI); backdrops WP-36 |
| H47-E2 | Shanghai rain (<= 160 streaks) and wetGround nodes; no Manila rain inside canopy | done (unit test) |
| H47-E2 | Shanghai floor p95 >= 200; lightning every ~40 s | lightning done; floor p95 phase 2; reflection probe not done |
| H47-E3 | ocean crop moves >= 2 over 10 s; glint | not done (row data only) |
| H47-E4 | sky band | done in code (Preetham on Venice, Athens); numbers phase 2 |
| H47-P1 | bloom and grade in stagesRan, grain on Rucker/Manila | done in code (unit test); stagesRan phase 2 |
| H47-P2 | DOF only during replay | not done |
| H47-M1 | textured courts, lines painted in | blocked (WP-36 PBR sets) |
| H47-M2 | ball, rim, glass, chain-link materials | not done / WP-36 for textures |
| H47-M3 | kit sheen, number atlas | not done |
| H47-A1 | crowd <= 10 draws, >= 140 transforms | blocked (WP-36 spectators) |
| H47-A2 | Meshy dressing and net | blocked (WP-36) |
| H47-V1 | 5 kinds registered, each juice event maps to one; caps with reducedFlash; draws -12 | done in code (unit test); draws phase 2 |
| H47-V2 | flood cones, god rays | not done |
| H47-V3 | spray-tag decal; audit passes; <= 8 live tags | audit passes; decal not done (tag textures WP-36) |
| H47-AN1 | net tip >= 0.12 m in 200 ms; head yaw error <= 25 deg on 80% of frames | head look-at and backboard shake done (evidence `headLook.within25 / frames`, phase 2); net spring and clips WP-36 |
| H47-C1 | broadcast camera language | not done |
| H47-H1 | no system fonts, licensed face | not done |
| H47-W1 | >= 12 prop keys per court | blocked (WP-36 props) |
| H47-PF1 | <= 320 draws | partial (trail spheres removed on the new look); measured phase 2 |
| H47-PF2 | proof run, judges | phase 2 |

## Phase 3 (4.7.1) update, 2026-10-31

| ID | Acceptance | Status |
|---|---|---|
| PRD D11 | every view's default beats its 4.6.2 frame in a blind panel | done: all six courts better 3/0/0 (g07p3f); `ORIGINAL_LOOK_COURTS` empty |
| H47-E1 | no solid void | done for Rucker/Athens/Orbit (ground to the horizon, Orbit deck disc); Manila and Shanghai HDRI backdrops back (sky-node trap, lane report) |
| H47-E4 | sky band | Venice Preetham only; Athens Preetham off (white-out); engine handoff for sky persistence across court swaps |
| H47-V2 | flood cones, god rays | Manila god rays and motes; Rucker cones and haze off (they washed the chase frame) |
| H47-L4 | Venice flare; Rucker floods | Venice only; Rucker flood flares off (veil) |
| H47-A1 | crowd / stands | own instanced bleachers on all six courts (new look); spectators still WP-36 |
| 7.2 rubric | 12 categories >= 7 | not met: min 4 (ibl_reflections), max 6.5 (ui_hud); `look-judgement.json` validated |
| 7.2 distinctness | >= 0.8 vs every neighbour | top-tennis 0.846, links 0.832 pass; diamond 0.755, fc 0.746 fail |
| 7.2 game-checks | 0 errors, 0 warnings | 0 errors, 13 warnings (12 luma-band: band wrong for panel-verified looks, not widened; 1 borrowed-asset: WP-36) |
| 7.2 final screens | retaken, committed | done (g07p3-f-scr, 34907fcdf) |
