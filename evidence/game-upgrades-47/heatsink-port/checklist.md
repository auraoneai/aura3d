# heatsink-port (WP-29, G19) acceptance checklist

Status: done = code in phase 1; P2 = needs a phase-2 capture, judge or measurement; blocked = needs an asset (WP-36) or engine work.

| ID | Acceptance | Status |
|---|---|---|
| IC-01 | bottom cells >= 40; p50 >= 50; darkFrac <= 0.02; clip <= 0.01; shaders-compile passes | code done; shaders-compile passes (twilight programs included); pixels P2 |
| IC-02 | road near the first pad +25; draws +0 | not done (no mat4 emitter-pool uniforms yet; see lane report) |
| IC-03 | shadow map rendered; under-drone -12; model luma ±8%; +6 draws max | code done (key on the shader sun, 3 cascades / 220 m, drone casts; expected +3 draws); pylons shadowLod not done; pixels P2 |
| IC-04 | env reports capture or hdri; drone hue +15 deg toward 260-290; drone luma 60-85 | code done (hdri sunset-dramatic, IBL only, rotated to the sun; `?env=capture` tries capture); pixels P2 |
| IC-05 | darkest top cell >= 65, spread >= 25; hue peaks 170-200 and 290-330; clip <= 0.01 | code done; pixels P2 |
| IC-06 | row-2 hue differs >= 20 deg between #c9a0ff and #ffb02e districts, adjacent >= 8; +0 draws | code done (unit test: fog hue differs >= 20 deg); district captures need a `?at=` param (P2, E-I rows) |
| IC-07 | no dropped passes; sun cell +12; fps -15% max | code done (volumetric fog god rays; lens flare not added); P2 |
| IC-08 | S2:gtao-4x4, mb=true; no dropped passes; clip <= 0.01; p95 <= 235; post >= 7 | code done (agx vs aces rubric choice P2; afterburner vignette pulse not done); P2 |
| IC-09 | chroma +6% now; split tone later | partial: saturation 1.08 done; split tone (temperature/shadows/highlights) not authored |
| IC-10 | bottom-centre mean >= 45, spread >= 60; material >= 7 | code done; P2 |
| IC-11 | triplanar CC0 basalt + lichen | blocked (CC0 basalt set and lichen mask not admitted) |
| IC-12 | heat 1 vs 0: red +30, blue ±5 | not done |
| IC-13 | Meshy sentry and heavy targets | blocked (WP-36) |
| IC-14 | 3 crystal clusters instanced | blocked (WP-36) |
| IC-15 | ribcage arch, start gate | blocked (WP-36) |
| IC-16 | drone2 copper retexture | blocked (WP-36) |
| IC-17 | cliff dwellings, needle spires | blocked (WP-36) |
| IC-18 | wake >= 1.5% of frame at >= 100 km/h; amber under afterburner; +1 draw | code done (unit tests: 60 segments, 1.2 s, cyan/amber head hue); frame share P2 |
| IC-19 | kill area +40 over 0.3 s; liveCount <= 96; vfx=off still passes | code done (preset counts sum to 96); P2 |
| IC-20 | 300 spores, >= 40 points, +1 draw | code done; emitter warning check P2 |
| IC-21 | rotor blur, landing overshoot, crystal wind, pickup pulse, arch chase | not done |
| IC-22 | roll ±3 deg; kick energy; replay pins unchanged; early vs race SSIM < 0.6 | partial: bank roll ±6 deg done; countdown sweep, finish orbit not done |
| IC-23 | ion telemetry HUD, licensed numerals | not done |
| IC-24 | 2.5x scenery, beacons, violet rift, art direction | partial: art direction done (audit passes); scatter density, beacons, rift not done |
| IC-25 | budget rows, quality by pointer and fps | partial: budget.json done; fps < 30 drops post at runtime; measurement P2 |
| IC-26 | captures, sibling judge, card | P2 |

## Phase 3 (4.7.1, 2026-10-31)

| Item | Status |
|---|---|
| Default view vs 4.6.2 (blind 3-judge panel) | new twilight look kept: better 3/0/0 in g19p3r1, g19p3r2, g19p3r3 (head = r3 code); `?look=original` = 4.6.2 (same 0/0/3) |
| Menu backdrop at the world origin (judges' "overhead beam" / "bright patch") | fixed for twilight: menu drawn from the grid slot (read-only view, sim untouched) |
| IC-01 / IC-05 / IC-08 luma bands (`luma-bands.json`, `luma-after.json` from r3) | pass except frame mean 77.2 vs 62-75 (band not widened; reported) |
| IC-12 heat | intensities halved (0.12..0.95) after the mid-action frame |
| IC-23 banner | no longer overlaps the objective line (<= 900 px: 152 px; <= 500 px: 172 px) |
| IC-26 final screens and card | retaken on the phase-3 build (g19p3-scr-2), previews rebuilt; rubric in `look-judgement.json` (min 3.5 shadows; see the lane report) |
| IC-26 sibling judge | 2 of 5 neighbours pass on the r3 frame (roadster-rush, teleoperator); the rest wait on WP-36 assets (drone retexture, rib arch) |
