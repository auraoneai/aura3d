# Thermal Drift (heatsink) WP-13 acceptance checklist

Status per acceptance line: `done` (verified by a unit test or static check), `code done, phase 2` (implemented; the number needs a remote capture), `blocked (E-x | WP-36)`, `not done`. Lane report: `docs/prds/game-upgrades-47/lanes/g03.md`.

## Look contract (PRD §3.2)

- [x] `art/direction.ts` with `defineArtDirection`, audited clean on all three circuits, `art/direction.audit.json` written: done (`tests/unit/heatsink/art-direction.test.ts`)
- [x] Look table, one row per circuit: done (`src/look.ts`, `tests/unit/heatsink/look.test.ts`)
- [x] VFX preset pack registered with `registerPreset`: done (`src/vfx.ts`, `tests/unit/heatsink/vfx.test.ts`)
- [x] identity.md, budget.json (before rows; after phase 2), checklist.md: done

## Rows

- HS-01: one shadow row, cascadeCount 3, pcss, sampled; no dropped features; drone cell R/B >= 1.4 on MEGACITY/DUSTFALL; 0 lighting warnings: pending
- HS-02: droppedFeatures empty with <= 7 local lights; draws flat; road cell varies >= 8 over 10 frames: pending
- HS-03: source names the circuit HDRI, backgroundDrawn; top-row means differ >= 25 pairwise; no backdrop/band nodes; each HDRI <= 1.5 MB: pending
- HS-04: top-row stddev >= 6 per circuit; <= 9 draws; judge sees a skyline: pending
- HS-05: far-road p95-p5 -40% DUSTFALL, -20% MEGACITY; S4 only on DUSTFALL at High: pending
- HS-06: rain only MEGACITY, dust only DUSTFALL, embers only VESPER; net draws not up; reduced-motion weather liveCount 0: pending
- HS-07: MEGACITY road p95 >= p50 + 60; gates pass; <= 1.5 MB; probe at 1-in-6: pending
- HS-08: hash and bounds same; >= 3 maps, family B emissive; <= 1.5 MB each; judge no longer sees grey blocks: blocked (WP-36)
- HS-09: validate --release; walls <= 2 draws; <= 12 MB; <= 32 model nodes: blocked (WP-36)
- HS-10: hash same; crop hue within 20 deg of spec; <= 1.5 MB: pending
- HS-11: pass in stages; qaHaze diff >= 1.5/255 inside exhaust, < 0.3 outside; edge red +15 at 90% heat; reduced-motion diff < 0.3: pending
- HS-12: nothing skipped; desktop mean 45-70, darkFrac <= 0.20, clip <= 0.02 on every circuit; card >= 40: pending
- HS-13: bursts = beacon events on an autopilot lap; liveCount <= 96; action-frame centre >= 1.5% amber hot pixels: code done, phase 2
- HS-15: no program compiles between 5 s and 60 s; chevron +25% at 90% heat; lava varies >= 10 over 6 frames: pending
- HS-16: adjacent sectors differ >= 12 in a channel; judge names 4 of 5 sector types: pending
- HS-17: subject height 0.15-0.25; banks and shake-decays pass; title pose >= 4 m from chase: pending
- HS-18: card HUD <= 30%; overlay applied; labels >= 12 px; font from aura-fonts.css: pending
- HS-19: view tests at 60/120/144 Hz; sim replay exact; reduced-motion bob 0: pending
- HS-20: laps <= 520 (1280) and <= 420 (390); title <= 700; <= 1.2M tris; payload <= 18 MB: pending
- HS-21: 3 circuit targets at 25/60 s; same_game false >= 0.8; every category >= 7; 0 warnings: `?circuit=` param done (E-I targets exist); captures and judges phase 2
