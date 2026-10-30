# Aura Diamond 3D acceptance checklist (GU47 WP-18, lane G08)

Every acceptance line of WP-18 with its phase-1 status. "phase 2" = needs a remote capture, luma band, judge or measured
budget; "blocked (WP-36)" = needs a generated asset; "blocked (E-x)" = needs an engine change listed as a handoff.

| Row | Acceptance | Status |
|---|---|---|
| DIA-L1 | p95 >= 200 in Harbor/Canyon/Ivy, clip < 2%; Canyon p5 <= 25; Lunar darkFrac 20-40% with p95 >= 200; lookManifest key colours all differ | key colours differ: unit test (look.test.ts); luma: phase 2 |
| DIA-L2 | Skyline darkFrac < 3%, p95 >= 190; Dome p50 >= 85; infield cell >= 1.6x outfield wall; +20 draws max | rig in place; luma: phase 2 |
| DIA-E1 | rg finds none of the 3 hexes; top-row means differ >= 15 in all 15 pairs; licence rows; +6 MB max, one HDRI fetched per park | hexes: unit test; licence rows: public/hdri/ATTRIBUTION.md (E-A); means, MB: phase 2 |
| DIA-E2 | Harbor/Canyon top row >= 20 over middle, Canyon top >= 140; Lunar top <= 12; vision sees stars and sunset | sky nodes mounted; luma, vision: phase 2 |
| DIA-E3 | middle row 40-170 everywhere; bottom-middle gap shrinks 15-35% in day parks; Dome S4 ran with post flag on | fog per park; luma, stagesRan: phase 2 |
| DIA-E4 | rain and reflections seen; Skyline p95 +15; fps -10% max; +6 draws max | phase 2 |
| DIA-P1 | bloom and grain in stagesRan; night p95 +25, clip < 2%; R/B Harbor >= 1.15, Skyline/Lunar <= 0.9, Dome 0.95-1.05 | output preset + grain per park; LUTs blocked (WP-36 asset need); stagesRan, ratios: phase 2 |
| DIA-P2 | DOF stage in walk-up state, not in batting | phase 2 |
| DIA-M1 | no `mow-` planes, -9 draws; gates pass; bottom-row stddev >= 6 | stddev: phase 2 |
| DIA-M2 | Dome reflections seen; Canyon middle cells differ >= 12; probe +2 draws | phase 2 |
| DIA-A1 | `primitives.` 29 -> <= 15; game-checks 0 errors; modeling >= 7 | set pieces blocked (WP-36); judge: phase 2 |
| DIA-A2 | crowd <= 12 draws, <= +400k tris; stands read as full; middle-row stddev >= 18 | fan asset blocked (WP-36); luma: phase 2 |
| DIA-A3 | hash same; ball < 1,000 tris; teams told apart | blocked (WP-36) |
| DIA-V1 | >= 6 registerPreset calls; <= 96 instances; vision sees splinters and dust, not discs | 7 presets, pool fit, atlas sprites: unit test (vfx.test.ts); vision: phase 2 |
| DIA-V2 | vision reads linescore and name; board cell +15 for 2 s after HR; <= 4 updates/s | phase 2 |
| DIA-N1 | motion-gate test passes; layer weight non-zero; cheer within 0.5 s of HR | motion-gate: unit test; rest phase 2 |
| DIA-C1 | >= 4 sequences per QA match; no inside-geometry frames; HR sequence <= 4.5 s, skippable | phase 2 |
| DIA-H1 | text >= 12 px off the batter at 390x844; accent differs per park; no Barlow in CSS | no Barlow: checked; px: phase 2 |
| DIA-W1 | Harbor p95 >= 200; <= 40 draws per park; distinct skyline per park | phase 2 |
| DIA-W2 | <= 450 (1280) and <= 260 (390) in every park; <= 1.2M tris; heap <= 300 MB | phase 2 (budget.json) |
| DIA-X1 | audit 0 errors; same_game false in 4 of 4; >= 14 of 15 park pairs read as different venues; every category >= 7 on Harbor, Skyline, Lunar | audit: 0 violations in all six parks (art-direction.test.ts writes art/direction.audit.json); judge: phase 2 |

Statuses are updated row by row in `docs/prds/game-upgrades-47/lanes/g08.md`.
