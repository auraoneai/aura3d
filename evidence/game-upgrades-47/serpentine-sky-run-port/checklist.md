# Serpentine Sky Run (WP-27) acceptance checklist

Status per row: see `docs/prds/game-upgrades-47/lanes/g17.md`. Pixel, judge and measured-budget lines are phase 2 (remote software WebGL2 captures).

| ID | Acceptance | Status |
|---|---|---|
| SSR-01 | neighbouring stages' top-third dE2000 >= 12, any pair >= 8; replay and sim tests unchanged | open |
| SSR-02 | runner crop >= +15 over the verge (today -12.6); mean 140-170; 390x844 runner >= 10 over mean | open |
| SSR-03 | sun cascadeCount 2 sampled; feet patch >= 35 darker shadow on vs off; within MAX_LUMA_DROP | open |
| SSR-04 | top third p5 <= 60 and p95 >= 220 at stages 1, 2, 8; cloud cells stddev >= 25; compile time +10% max | open |
| SSR-05 | clip <= 0.03 and darkFrac <= 0.4 (DROWSE 0.6); road cell <= 215 while orbs hit 250; bloom and vignette ran | open |
| SSR-06 | god-ray stage at High; sun-side +8; frame +15% max; NEW god-ray receipt | open |
| SSR-07 | corners variance -20% at top speed, runner keeps 90%; no blur/CA stages on reduced motion | open |
| SSR-08 | far-road frame diff <= 50% of today; road hue stddev >= 15 deg; middle third <= 190 | open |
| SSR-09 | orbs >= 250 with a 3 px halo; lanterns +60 at stages 4, 7; material >= 7 | open |
| SSR-10 | validate --release; head and spires <= 6 draws; runner hash same; modeling >= 7; provenance checks 0 | open |
| SSR-11 | >= 12 instances in frustum across the 3 bands; within budget; environment >= 7 | open |
| SSR-12 | liveCount rises on every scripted event; nodeCount -32; colours unused by other games | open |
| SSR-13 | >= 2 lightning flashes (+25 mean, 1-3 frames) in 16 s; rain directional ratio >= 1.5; <= 10k particles | open |
| SSR-14 | foot slide <= 0.1 m per stride; no popped frame across a hit; lean >= 8 deg | open |
| SSR-15 | shots in evidence; replay unchanged; reduced motion skips push and kick | open |
| SSR-16 | fonts check 0; contrast >= 4.5:1; no overlap at 390x844; ui_hud >= 7 | open |
| SSR-17 | stage frames pairwise SSIM <= 0.6 and dE >= 8; pavilion region +40 | open |
| SSR-18 | capture <= 95 draws with >= 3 instanced batches; textures <= 70 MB; fps not lower | open |
| SSR-19 | 8 stage targets within budget; `run.mjs --strict` exits 0 | open |
| SSR-20 | every category >= 7 (panel); darkFrac <= 0.4, clip <= 0.03; dE2000 >= 20 and SSIM <= 0.5 vs the 4 siblings; departures in PORTING-NOTES.md | open |
