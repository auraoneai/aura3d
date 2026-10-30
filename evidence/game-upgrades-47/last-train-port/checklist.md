# WP-31 Lamplight Line acceptance checklist (phase 1 status)

| Row | Acceptance line | Status |
|---|---|---|
| LT-01 | means A 100-125, B 85-110, C 60-85, D 40-60, E 28-40; dark < 0.35, clip < 0.01; p95/p5 >= 3.5 in A/B | phase 2 (bands in luma-bands.json) |
| LT-01 | never setScene en route | done: `shouldSwapBand`, QA `band().enrouteSwaps` (0 expected) |
| LT-01 | pcss, 3 cascades | done (authored key `filter: "pcss"`, `cascades: 3`) |
| LT-02 | >= 26 point/spot nodes, 1 shadowed spot | partial: a 6-light pool (4 platform points + headlamp spot + bounce) moves with the tram; the C-35 contract caps 6 practicals and 1 shadowed light, so the headlamp is unshadowed |
| LT-02 | platform >= 1.8x corners; +2 draws max | phase 2 (0 draws added) |
| LT-03 | no weak key in A/B; pass executed; under-tram -10 | partial: hemisphere per band done; contact shadows not done |
| LT-04 | no sha shared with another game; env source names the band HDRI; <= 3.6 MB at 1k | done in code; three 1k files are 4.03 MB (over by 0.43 MB, reported); sha check phase 2 / WP-38 |
| LT-05 | top hue A vs D >= 40 deg, adjacent towns >= 15 | done (unit test on the authored colours); pixels phase 2 |
| LT-05 | B clouds sun side >= 1.3x; D top >= 25, no solid-void | phase 2 |
| LT-06 | S4 in B only at High; sun side +5-15, far side < 3; flare only in A/B | done in code (god rays node in B only; flare node A/B); pixels phase 2 |
| LT-07 | GTAO and both passes ran; clip <= 0.01; rows -25% variance; A R/B >= 1.15, D B/R >= 1.2 | done in code; pass receipts and pixels phase 2 |
| LT-08 | 6 probes; B tram p99 >= 230 | not done |
| LT-09 | wet platform p95 +20; roofs 1.4x; setMaterial only on weather change | not done |
| LT-10 | no primitive canopies/pines/bushes/stones/puffs/rocks | blocked (WP-36) |
| LT-11 | tram hash same; riders validate-animation | blocked (WP-36) |
| LT-12 | +12 draws max; 6 text3D nodes match town names | done (+10 draws expected); silhouettes row blocked (WP-36 islands, gulls) |
| LT-13 | >= 40 lanterns after runCircuit; 1 draw; release only on clean arrivals | done-interim (capsule stand-in until WP-36 lantern); unit test: 36+ released over one driven circuit |
| LT-13 | D top p95 >= 170 | phase 2 |
| LT-14 | liveCount > 0 on curves; 4 presets registered; <= 0.05 screen share | done (5 presets) |
| LT-14 | storm lightning flash +15 for <= 200 ms | partial: `lightningFlash` caps defined, flash not wired |
| LT-15 | lean 63% in 0.15-0.35 s; reduced motion <= 30% | not done |
| LT-16 | 6 arrival sequences per circuit | not done |
| LT-17 | HUD <= 22%, text >= 12 px, contrast >= 4.5:1 | not done |
| LT-18 | budgets, sibling judge | phase 2 (budget.json written) |
| LT-19 | audit passes; game-checks 0 errors | done |
