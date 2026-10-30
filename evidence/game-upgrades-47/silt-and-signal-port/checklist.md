# Duneglide (silt-and-signal-port) WP-34 acceptance checklist

Status per acceptance line. "unit" = asserted by a unit test in `tests/unit/silt-and-signal-port/`; "phase 2" = needs
E-I captures / measured budgets on the remote runner; "WP-36" = waits for generated assets.

| Row | Acceptance | Status |
|---|---|---|
| DG-L1 | key directions >= 15 deg apart | unit (lighting-rig.test.ts) |
| DG-L1 | ch0/ch6 shadow ratio >= 3; chapter pairs differ >= 12 mean or >= 10 in a cell | phase 2 |
| DG-L2 | hdri source on 5 chapters | unit (look.test.ts) |
| DG-L2 | no lighting warning; day means 95-150, clip < 0.02 | phase 2 |
| DG-L2 | <= 1.5 MB each | open: belfast 1.22, industrial 1.18, outdoor-midday 1.17 pass; kloppenheim_02 1.74 and spruit_sunrise 1.53 MB over (E-A catalogue files) |
| DG-L3 | rim < key in all 7 | unit |
| DG-L3 | rider vs surround >= 25; mean within 5% | phase 2 |
| DG-L4 | <= 8 points (5 per night chapter, art-direction cap 6 practicals) | unit |
| DG-L4 | night darkFrac < 0.35, p95 >= 190, >= 3 hot cells; +2 draws | phase 2 |
| DG-L5 | pcss with 3 cascades in ch0/ch3/ch6 | unit (key shadow filter pcss, cascades 3; Low PCF 1 cascade) |
| DG-L5 | penumbra > 4 px; contact shadows | phase 2 / not done |
| DG-L6 | lens flare | not done (C) |
| DG-S1 | specs compile; <= 15 programs | unit (shaders-compile covers sky-ink, water-ink) |
| DG-S1 | sun p99 >= 245; day tops differ >= 15 | phase 2 |
| DG-S2 | three far-dune rings, silhouettes | not done (one ring, fog-tinted; silhouettes WP-36) |
| DG-S3 | height fog in every chapter | unit |
| DG-S3 | far ground +8, rider within 3 | phase 2 |
| DG-S4 | god rays ch0/ch2 | not done |
| DG-S5 | rain only ch4 | unit (volume node only in ch4) |
| DG-S5 | lightning timed to audio, wet road | not done |
| DG-P1 | ink source both, fade 600 m, 4/6 bands, ?toon=0 | unit |
| DG-P1 | edge ratios, rider perimeter, sky edges | phase 2 |
| DG-P2 | ACES, per-chapter exposure, grade, vignette 0.22, grain 0.03 | unit |
| DG-P2 | clip / dark / chapter means / title 3 s vs 12 s | phase 2 |
| DG-P3 | threshold 1.0, no radius, no warnings | unit |
| DG-P4 | DOF in sequences, boost blur | not done (C) |
| DG-M1 | no green bottom third | done-interim (warm sand vertex colours on the in-repo ground set); 2K sand/scrub/sandstone set: WP-36 |
| DG-M2 | >= 4 hues 12 deg apart, plaster kept, stain band | unit; wall stddev phase 2 |
| DG-M3 | glint, fresnel, streaks, one pass | done (water-ink); pixel numbers phase 2 |
| DG-M4 | jade only on ring, board, HUD | unit (no cyan in the scene; jade beacon and strips); bronze verdigris masts not done |
| DG-A1..A5 | Meshy flora, dwellings, retextures, mast, landmarks | blocked (WP-36); thruster spheres removed (A3 part) |
| DG-V1 | wake gate (< 6 m, > 20 speed; 0 above 10 m), <= 600 | unit; bottom cell +4 phase 2 |
| DG-V2 | twin jade trails on E-F trail | done; length on boost phase 2 |
| DG-V3 | silt-signal burst, impact dust | unit |
| DG-V4 | one emitter per chapter | done (attached mote spawn); strip change phase 2 |
| DG-AN1 | lean / boost / celebrate clips | blocked (WP-36 clips) |
| DG-AN2 | flora sway | not done (waits WP-36 flora) |
| DG-C1 | 4 s rail, bars, skip, no point in collider | unit (rail clearance); skip-within-1-frame phase 2 |
| DG-C2 | roll 0.4x max 6, FOV <= 2 deg/frame, 0 on reduced motion | unit |
| DG-C3 | finish orbit | not done (C) |
| DG-H1 | Graphik + Canela, no #19e6ff in the inked HUD, labels >= 13 px | unit; deployed font checks and overlap phase 2 |
| DG-W1 | none within 40 m of a ring; >= 25; +2 draws | unit |
| DG-W2 | decals | done (one merged decal mesh, +1 draw; plaza stddev phase 2) |
| DG-PF1 | budgets | phase 2 (budget.json before rows) |
