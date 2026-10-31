# top-tennis (WP-11) acceptance checklist

Every acceptance line of PRD WP-11 with its phase-1 status. `unit` = asserted by a unit test in `tests/unit/aura-slam/`;
`phase 2` = needs a remote capture, receipt or judge; `blocked` = engine or WP-36 asset missing (lane report, Handoffs).

| Row | Acceptance line | Status |
|---|---|---|
| TT-L1 | no `lighting` game-check finding | done (game-checks: no lighting finding) |
| TT-L1 | hard grid[4] / mean(grid[6], grid[8]) <= 1.25 | phase 2 (centre point light removed; 4 corner floods aimed at quadrants) |
| TT-L1 | unit test: sun azimuths differ >= 40 deg | done (unit, gu47-look.test.ts) |
| TT-L1 | 1 directional shadow row per sun venue | done in code (one shadowed key, unit); rows phase 2 |
| TT-L1 | 2 spot rows on hard | partial: floods unshadowed until the forward path renders local tiles (E-B handoff); night key casts meanwhile |
| TT-L2 | contact pass executed | phase 2 (`effects.contactShadows` authored) |
| TT-L2 | filter pcss on sun venues | done in code (unit: key shadow filter pcss, 2048, fit 22 m); diagnostics row phase 2 |
| TT-L2 | no CONTACT_SHADOWS_WEAK_KEY | phase 2 |
| TT-L2 | feet probe >= 35% darker than court 1 m aside | phase 2 (shadow discs removed from the frame) |
| TT-L2 | clay long-shadow probe >= 20% darker than grass | phase 2 |
| TT-L3 | court under each floodlight >= 1.6x court 3 m away; frame 120 draws = frame 60; <= 150 draws | blocked (E-B): probe builder not on the root barrel, box field mismatch, `updateProbe` bookkeeping only |
| TT-E1 | environment.source differs on all 6, none of the 3 look HDRIs | done in code (unit); diagnostics phase 2 |
| TT-E1 | rg finds the 6 files only in aura-slam and asset-lookdev | WP-38 (other games' rows name some of the same files; PRD §6.1 assigns shared primaries) |
| TT-E1 | only the active HDRI fetched (<= 6.5 MB) | done in code (boot venue authored; swap on change; files 1.1-1.8 MB, unit); network log phase 2 |
| TT-E1 | `assets validate --require-license` | phase 2 (HDRI defs carry CC0-1.0 licence metadata) |
| TT-E2 | desert top/bottom row means within 25 | phase 2 |
| TT-E2 | hard difference >= 20 | phase 2 |
| TT-E2 | volumetric stage only on desert High | done in code (unit: plan enables it on desert at high/ultra only) |
| TT-E2 | 4 lightCone nodes on hard | done (unit: 4 cones shown on hard only) |
| TT-E2 | no fog on moon | done (unit) |
| TT-E3 | Earth >= 4% of frame width; moon darkFrac 0.15-0.5; grid[4] >= 90 | done in code (unit: Earth 5.1% of 1280x720, 8.3% of 390x844 width); luma phase 2 |
| TT-P1 | sun venues p95 >= 160 and p95-p5 >= 120 | phase 2 (band declared) |
| TT-P1 | clipFrac <= 0.02 | phase 2 (band declared) |
| TT-P1 | hard mean 38-60, grid[4] >= 70 | phase 2 (band declared) |
| TT-P1 | six means span >= 30 | phase 2 |
| TT-P1 | antiAlias reports smaa | blocked (E-C): no SMAA pass on the production chain |
| TT-P2 | far-stand Laplacian -40%, far athlete -10% max; frame time +15% max; no DOF stage on Medium | done in code (unit: athletes inside the sharp range, stands outside; engine tier runs DOF at High+ only); pixels phase 2 |
| TT-P3 | LUT on/off >= 6 mean dRGB; stands hue differs >= 25 deg | done on the LUTs (unit: >= 6 mean dRGB vs identity, neutral hue >= 25 deg apart); in-frame phase 2 |
| TT-M1 | service-line probe >= 200 on sun venues; court stddev >= 6; texture gates; <= 12 MB maps; -8 draws | see lane report |
| TT-M2 | ivory torso luma >= 170, abs(R-B) <= 20; ball >= 1.8x court; net band >= 60% of court | see lane report |
| TT-M3 | side cells grid[3]/grid[5] >= 12 dE apart between every venue pair | see lane report |
| TT-A1 | pose-parity spec passes; no look/primitive-subject; <= 25k tris per athlete; draws not above today | blocked (WP-36: 11 segment props) |
| TT-A2 | AURA_ASSET_IDS keys only in tennis folders; scoreboard text matches debug() within 1 frame; validate --release | blocked (WP-36: officials and furniture) |
| TT-A3 | stands <= 6 draws; 390x844 top row >= 40, darkFrac <= 0.15 | blocked (WP-36: 5 stand sections) |
| TT-A4 | crowd <= 4 draws; >= 30 saturated seats in frame; update <= 0.3 ms, 0 allocations | see lane report |
| TT-V1 | liveCount >= 6 after a 6-bounce clay rally and after the point | done in code (unit: 6 marks + 6 puffs, marks outlive the point); liveCount phase 2 |
| TT-V1 | burst within 20 dE of particleColor | done in code (bursts use particleColor, unit); pixels phase 2 |
| TT-V1 | `?vfx=off` removes | done (unit: runtime off spawns nothing) |
| TT-V2 | trail 1 draw, >= 25 px | done in code (one `effects.trail` ribbon replaces 8 spheres); pixels phase 2 |
| TT-V2 | reduced-motion ace pose unchanged | done (unit: ace flash and lens punch skipped under reduced motion) |
| TT-V3 | <= 3 extra draws; 4 flare nodes on hard intro; win liveCount > 0 | partial: win confetti (unit); flares not built (no depth occlusion, 4 draws) |
| TT-AN1 | unit test: mean yaw moves >= 25 deg within 0.3 s, no allocation | see lane report |
| TT-AN1 | two rally frames 1 s apart differ >= 10 deg | phase 2 |
| TT-AN2 | net offset non-zero 10-20 frames; no wind node on moon | not done (C; palms WP-36) |
| TT-C1 | both athletes in frame; far athlete >= 45 px; top row >= 40; projectWorldPoint within 4 px | done (unit: in frame at every pan on 5 viewports, far athlete >= 45 px, projection exact); top row phase 2 |
| TT-C2 | ?intro=1 shot at 1.5 s >= 10 m from broadcast eye; ends at TT-C1 pose; key press ends within 1 frame | done (unit: 1.5 s shot distance, hand-back, skip on next frame) |
| TT-C3 | replays = 1; sim dt 0 during replay; <= 2.2 s | not done (C; needs a shell sim pause) |
| TT-H1 | HUD <= 9% of canvas; never over an athlete box; no unlicensed font requests | partial: chip + serve strip inside the scorebug box, licensed faces only; area and athlete-box checks phase 2 (crops published); chip art asset need |
| TT-H2 | cap height >= 10 px; <= 3 draws | done (unit: cap >= 10 px under v2 and classic; 3 text nodes) |
| TT-H3 | audit passes | done (unit: 0 violations on all six venue scenes; `art/direction.audit.json`) |
| TT-H3 | same_game false >= 0.8 vs diamond, hoops and others; every category >= 7 | phase 2 (sibling judge, look judge) |
| TT-W1 | >= 8 distinct models per venue; <= 10 draws; grounding checks clean | blocked (WP-36 props) |
| TT-PF1 | draws within budget per venue; venue download <= 18 MB; render spec passes | phase 2 (stripe boxes pending TT-M1; trail spheres removed; volumetric fog High+ only) |

## Phase 3 (4.7.1)

| Item | Status |
|---|---|
| Moon better than 4.6.2 (blind panel, >= 2 of 3) | done: 3/0/0 (g01p3r1, g01p3r3); default look switched to World Tour (`ORIGINAL_LOOK_VENUES` empty) |
| Every other variant still better than 4.6.2 | done: default, grass, clay, desert, beach 3/0/0 each (g01p3r3) |
| Live 4.7.0 404 (`image/png;base64` without `data:`) | fixed: `emittedAssetUrl` in view/assets.ts + unit test; confirm on the live smoke after deploy |
| Rubric every category >= 7 (PRD 1.2 goal 1) | not met: min 2.5 (ibl_reflections), ui_hud 7; material_quality / modeling_assets blocked on WP-36 (`look-judgement.json`) |
| Sibling distinctness vs aura-diamond-3d >= 0.8 | not met: 0.794 (was 0.766); crowd and athlete models are the tells (WP-36) |
| game-checks 0 errors | done |
| page-parity, look-identity, screens-fresh | fixed |
| borrowed-asset (3) | waiting on WP-36 Meshy assets |
| luma-band | round-3 rows; bands not widened (see lane report: default band predates the panel-verified HDRI swap) |
