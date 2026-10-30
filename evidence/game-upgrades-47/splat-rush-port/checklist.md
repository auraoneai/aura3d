# WP-26 acceptance checklist (splat-rush-port)

Status per acceptance line. "unit" = covered by `tests/unit/splat-rush-port/gu47-look.test.ts` or `art-direction.test.ts`; "phase 2" = needs remote captures.

| Row | Acceptance | Status |
|---|---|---|
| CR-00 | replay, sim and parity tests unchanged | unit (existing suites green) |
| CR-00 | rng count identical across looks | unit (`rng count and the trace are identical across looks`) |
| CR-00 | original card within LPIPS 0.02 of 4.6.0 | phase 2 (original scene JSON equals the 4.6.0 build, unit) |
| CR-L1 | toon sun equals backdrop key direction | unit |
| CR-L1 | ball lit/shadow >= 1.35; deck R/B >= 1.12 | phase 2 |
| CR-L2 | ball outer ring >= 15 brighter than body on the lit side | phase 2 |
| CR-L3 | kloppenheim_06 IBL, background off | unit |
| CR-L3 | GLB region 135-160, R/B >= 1.15; gem highlights >= 2% at 230+ | phase 2 |
| CR-S1 | 500/3,500/6,500 m stages differ | unit (stage values); pixel tops >= 15 apart: phase 2 |
| CR-S1 | card top row 70-110, mid-sky hue 15-45 deg | phase 2 |
| CR-S2 | bottom row 90-130 hue 250-290; white < 0.3%; +1 draw | phase 2 (+1 draw by construction) |
| CR-S3 | far road within 20 of sky above; near road keeps 2.5x far stddev | phase 2 |
| CR-P1 | bloom and grade ran; 250+ <= 1%; sun area +10; deck within 4 | phase 2 |
| CR-P2 | edge pixels 3-8% bottom rows, < 0.5% top row; outline stage ran | phase 2 |
| CR-M1 | fresh splats 3-10% at 235+, older < 1% | phase 2 |
| CR-M2 | deck stddev >= 8, mean within 10 of 150; rails 40-80 | phase 2 |
| CR-M3 | gate bounds pinned, one batch, >= 3 drip tips | not done |
| CR-A1 / CR-A2 | 5 paint-world GLBs, gem retextures | blocked (WP-36) |
| CR-V1 | liveCount > 0 within 3 frames; replay unchanged; vfx=off LPIPS 0.01; peak <= 48 draws | unit (planning, seeds, camera false, halving); live count: phase 2 |
| CR-V2 | ball ribbon | not done |
| CR-C1 | roll within ±3, layers off on reduced motion and manual=1 | unit |
| CR-C2 | title rail, game-over orbit | not done |
| CR-AN2 | deterministic poses; tilt within ±6 deg over 60 s | unit |
| CR-H1 / CR-W1 / CR-W2 / CR-AN1 / CR-P3 / CR-V3 / CR-V4 | | not done (see lane report) |
| CR-PF1 | <= 48 draws, <= 45 MB, no compiles after warm, frame <= 1.3x, sibling judge | phase 2 (new programs added to `allProgramSpecs`; warm path unchanged) |
