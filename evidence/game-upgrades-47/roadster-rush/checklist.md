# Apex Overdrive (roadster-rush) WP-12 acceptance checklist

Status per acceptance line: `code` (implemented, verifiable statically or by unit test), `phase 2` (needs the remote capture, judge or real GPU), `blocked (E-x | WP-36)`. Row status lives in `docs/prds/game-upgrades-47/lanes/g02.md`.

| Row | Acceptance | Status |
|---|---|---|
| AO-L1 | appliedLook golden-hour; no ambient-flattens; gameplay-early mean 60-80, p95 >= 215, darkFrac <= 0.06 | pending |
| AO-L2 | sunset 70-85, dusk 50-65, night 32-48; spread >= 30 (today 22.65); night darkFrac <= 0.35 | pending |
| AO-L3 | night bottom-centre cell mean >= 25, stddev >= 10; draws unchanged; fps -10% max | pending |
| AO-L4 | sun row cascadeCount 3, skipped 0; no weak-key warning; disc node gone; road band darkFrac +0.04 | pending |
| AO-E1 | title top-centre B > R by >= 15; horizon R > B; clip <= 1.5%; night horizon R > B | pending |
| AO-E2 | mid-drive red-pink ground pixels <= 15% (from ~45%); pylons <= 2 draws | pending |
| AO-E3 | top road cell stddev >= 30% below bottom; night top-centre <= 30 | pending |
| AO-P1 | gameplay-early p5 <= 14, p95 >= 210; exactly one grade stage | pending |
| AO-P2 | one bloom at threshold 0.85; sky cell within 3 of bloom off; brake bars +25 | pending |
| AO-P3 | S7 ran, no velocity skip; lane-dash stddev -25% at 64 m/s; receipt effects-motion-blur | pending |
| AO-P4 | S4 ran; sun-side sky +8; overlay peak <= 0.3; receipt effects-god-rays | pending |
| AO-M1 | position hash 0, bounds same; hero p99 >= 240, B > R; rim edge R > B | pending |
| AO-M2 | road cell stddev >= 8; centre road +15 over shoulders; no texture > 2048; no magenta hex in main.ts | pending |
| AO-M3 | hash 0; taxi/bus high-pass energy -30%; draws unchanged | pending |
| AO-M4 | core p95 >= 240, edge <= 120; draws unchanged | pending |
| AO-A1 | no showcaseModernBuildingOne; skyline <= 75 draws; >= 2 top cells stddev >= 12 | pending |
| AO-A2 | sha differs; bounds differ >= 10% on one axis | pending |
| AO-V1 | presets contain all 5; liveCount <= 96 dense; crash <= 0.12 of screen | pending |
| AO-V2 | speedLines accepted at >= 50 m/s; not called on reduced motion; >= 1 landing spark | pending |
| AO-AN1 | roll sign matches lateral velocity in >= 95% of samples; 6,000-step replays unchanged | pending |
| AO-C1 | 2 s title differs from chase by >= 15 mean abs luma; ends within 4.5 s; keydown skips; replays unchanged | pending |
| AO-C2 | height <= 2.8 m at 64 m/s; max roll > 0.5 deg; insideColliderSteps 0 | pending |
| AO-H1 | no DOM rect over the sun disc; active button matches beacon; game-checks 0 errors | pending |
| AO-H2 | no rect outside viewport; targets >= 44 px; HUD <= 12% of canvas | pending |
| AO-W1 | rings in frustum in >= 4 of 5 states; <= 12 draws; no-three and visible-strings pass | pending |
| AO-W2 | <= 32 live; no decal-budget overrun | pending |
| AO-PF1 | desktop dense <= 230, phone <= 190; no S4/S7 on phone; same_game false vs the 3 racers | pending |
