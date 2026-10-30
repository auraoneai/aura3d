# WP-25 acceptance checklist (strange-orbit-port, lane g15)

Code status per acceptance line; commits and notes in `docs/prds/game-upgrades-47/lanes/g15.md`. Pixel numbers are phase 2 (remote runner, software WebGL2).

| Row | Acceptance | Status |
|---|---|---|
| contract | direction + audit record, look table, VFX pack, identity, budget, checklist | done |
| SO47-L1 | track spread >= 1.4x; shadow patch >= 2x rider width; key literal gone (rg 0); cascadeCount 3, pcss | literal gone + cascades/pcss: done (unit test); spread, patch: phase 2 |
| SO47-L2 | planet-facing half R/B >= 1.25, far half <= 1.0; rider mean 95-125 | code done; phase 2 |
| SO47-L3 | s=200 vs s=450 hue differs >= 25 deg; centre cell RGB distance >= 30 | code done; phase 2 |
| SO47-L4 | patch 6 m ahead +15; shadow rows unchanged; draws +2 max | code done (3 tails, cap 6 practicals); phase 2 |
| SO47-E1 | menu bike within 5% of 124.96; bike chroma 1.3x neutral; source reports capture | done-interim (E-G verify); phase 2 |
| SO47-E2 | planet and ring 15-25% of race pixels; race sky region 50-70 | code done; phase 2 |
| SO47-E3 | middle-row sides stddev <= 0.7x, mean 40-90; GLB vs island within 12 | code done; phase 2 |
| SO47-E4 | >= 6 streaks in 60 s; +3 draws; no aurora on low | meteors done, aurora not done |
| SO47-P1 | darkest 5% B-R >= +6, brightest R-B >= +12; grain in stages | code done (LUT later, asset need); phase 2 |
| SO47-P2 | border edgeDensity -25% on boost, rider within 10%; clip <= 1% | code done (unit test of the ramp); phase 2 |
| SO47-P3 | menu bike edgeDensity >= 2x sky; flare off-screen removes its draws | code done; phase 2 |
| SO47-M1 | hashes same; texture gate passes; judge 3 of 4 | blocked (WP-36) |
| SO47-M2 | 6 rider crops pairwise RGB distance >= 35; 6 liveries counted | tints pairwise >= 35 (unit test); crops phase 2 |
| SO47-A1 | primitives only in `?meshy=0`; validate --release | blocked (WP-36) |
| SO47-W1 | >= 300 rocks in <= 6 draws; edgeDensity >= 0.035; horizon silhouette >= 60% width | 340 in 2 draws + rim 1 (unit test); pixels phase 2 |
| SO47-W2 | paddock >= 10% of start frame; beacons <= 2 draws; beacon crop changes >= 30 | beacons done (2 draws); pulse not done; paddock blocked (WP-36) |
| SO47-V1 | each event logs an effect with liveCount > 0; vfx=off gives 0; tints differ >= 0.2 | code done; phase 2 |
| SO47-V2 | trail >= 120 px on boost; +2 draws for 6 trails | ribbons done; atlas exhaust not done; phase 2 |
| SO47-V3 | >= 3 live after 3 landings; >= 20 darker than track | landing decals done; phase 2 |
| SO47-C1 | fov 64 +-1 cruising, >= 72 at boost; roll >= 1.5 deg; kick energy 0 on reduced motion | done (unit test) |
| SO47-C2 | countdown frames SSIM < 0.5 pairwise with bars; results >= 30 deg off chase | done (unit test for angles); SSIM phase 2 |
| SO47-N1 | landing vertical scale change >= 6% | done (9%) |
| SO47-H1 | no overlap at 390 and 1280; DOM writes only on change | DOM-on-change done; overlap phase 2 |
| SO47-X1 | race <= 150 high, <= 120 low; race mean 60-95, menu 80-110; darkFrac <= 0.3, clip <= 0.02 | Low extras dropped; route fix handed to E-I; bands declared; phase 2 |
