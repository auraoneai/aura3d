# Bunker Zero GU47 checklist (WP-21)

Status per acceptance line, phase 1 (code on `gu47/g11`). "phase 2" = needs remote captures, judges or the owner's real-GPU run.

| Row | Acceptance | Status |
|---|---|---|
| look contract | art/direction.ts + audit record, look table (7 variants), VFX pack, identity.md, budget.json, checklist.md | done |
| BZ-20 | 8 bunker-zero targets (E-I shipped them), unit guard passes; 7 per-floor frames and table | `?floor=1..6\|kh` boots the reference view, sim held (done); frames: phase 2 |
| BZ-01 | F1 spread >= 110, darkFrac 0.08-0.35, clip <= 0.02, mean 45-70; no ambient/night-city in src; lighting and shadows >= 7 | code done (no ambient, hemisphere, directionals or look preset; rg clean); bands declared in luma-bands.json; pixels/judge: phase 2. Key spot shadow draws once the E-B local-spot-shadow forward chunk lands (see report) |
| BZ-02 | adjacent floors' hue differs >= 25 deg; lighting >= 7 per floor | lamp hues unit-tested (>= 29 deg); fog at 30% lamp value, IBL and white balance per floor wired; E-I hue capture: phase 2. F5 rect tube authored |
| BZ-03 | muzzle crop +25% on fire frames; liveCount > 0; no muzzle/boom light in src | presets with light layers wired to fire, enemy fire, impacts, blasts; intensity-0 lights and pooled flash nodes deleted (done); crop and liveCount: phase 2 |
| BZ-04 | validate --release; lit wall stddev >= 12; texture/material >= 7 | 9 CC0 ambientCG sets app-local with provenance and hash test, 1 repeat per cell, +-6% jitter (done); validate --release and pixels: phase 2 |
| BZ-05 | no lighting warning; HDRI 1k < 2 MB; ibl_reflections >= 7 on F2, F5 | hangar_interior 1k (1.76 MB), 0.35, background false, per-floor scale (done); box probe blocked: `probes.reflection` is not exported from the public `@aura3d/engine` root (handoff); judge: phase 2 |
| BZ-06 | water crop darker with p95 >= 150; floorEmissive only on F3; mirror <= 4 draws | partial: dark glossy water F2, emissive only F3, wetness F2/F6; mirror blocked (surfaces.mirror ignores runtime visibility); puddle decals not done (31 of the 32 forward decal slots go to BZ-10) |
| BZ-08 | gtao and bloom ran; corners >= 15% darker; post >= 7 | AO 0.65/0.9, bloom 0.82/0.45, grade 1.14/0.82, vignette 0.34, grain 0.04, output ACES (done); stage check: phase 2 |
| BZ-12 | rg for borrowed keys returns nothing; validate --release | blocked (WP-36): borrowed pulse gate, sci-fi crate, reactor pylon, aurora beacon, mech weapons still mounted; asset needs listed |
| BZ-11 | >= 5 clips and 1 skin per humanoid; death before hide | blocked (WP-36 rigs and clips) |
| BZ-19 | all floors within budget; budget.json; owner p50 >= 60 | budget.json committed; draw deltas in report; measured: phase 2 |
| BZ-07 | S4 Medium+; centre > outer bands; darkFrac <= 0.30; shaft p95 >= 140 | done in code: 3x3 ceiling hatch over the Warden (ceiling = 4 instanced slabs), steel collar, night backdrop, moon key, `effects.volumetricFog` shaft enabled on F6 only (`hatch.test.ts`); bands/S4 stage: phase 2 |
| BZ-09 | 2-3 live emitters on active floor, 0 hidden; <= 600 particles | done in code (unit-tested caps); live counts: phase 2. concrete-chip preset shipped |
| BZ-10 | no overBudget; impact decals visible after 20 s fight; environment >= 7 | done in code: 12 seeded scorch/crack floor decals per floor (shared pool), 20 s bullet holes on the wall face hit (ring of 12), hazard bands under doors and before the exit, SDF stencilled floor names; 31 decal nodes <= 32 (`decals.test.ts`); visibility after 20 s fight: phase 2 |
| BZ-13 | instanced pipes/cables | not done (needs WP-36 modules) |
| BZ-14 | no eye spheres; enemy vs wall >= 20 luma; readability >= 7 | done in code (eye spheres and emissive lift gone, rim); pixels: phase 2 |
| BZ-15 | door x/z changes, y constant; liveCount > 0; demo identical | doors slide sideways, dust/debris/pickup bursts, viewmodel sway and reload dip, F5 flicker and F6 beacon (rig) (done); demo check: phase 2 |
| BZ-16 | bars on every floor change; reduced-motion test | letterbox bars 2.5 s on floor change, death roll 12 deg + fade, reduced-motion unit test (done); no sprint in sim so no sprint FOV |
| BZ-17 | font DIN Pro; labels >= 11 px; arc within 45 deg | DIN Pro WOFF self-hosted, labels 11 px, stencil olive/hazard plate with lamp accent, damage arc, blueprint minimap (done); computed font and judge: phase 2 |
| BZ-18 | LUT on F3 shifts hue >= 10 deg | done in code: 6 generated split-tone 17^3 .cube LUTs swapped per floor, `?lut=0` for the on/off A/B, CA pulse on hits >= 18 damage (off under reduced flash) (`lut.test.ts`); hue shift: phase 2 |

## Phase 3 (4.7.1)

| Row | Phase-3 status |
|---|---|
| BZ-04 | the surface maps render now: the refs lacked `kind: "aura-asset-ref"`, so the compiler never resolved their URLs (every phase-1/2 frame was untextured). Maps are 512 px detail maps (per-channel mean 0.8) with a palette-compensated base colour; the boot floor is built first so its maps upload first. Lit wall stddev and texture/material judge: see the lane report |
| BZ-06 | F2 water lifted from `#0b1714` (read as a black hole) to `#1f3a36` |
| BZ-08 | AO 0.9/1.2, contrast 1.2, vignette 0.42 (rubric round) |
| BZ-01 | carried lamp reach 14 m, decay 2 (was 32 m / 1.15, which lit every wall evenly) |
| BZ-14 | hostile rim 0.6 (was 0.35) |
| camera | FOV 66 (was 72), render only |
| BZ-11, BZ-12, BZ-13 | still blocked on WP-36 Meshy assets |
| panel | phase-3 frames vs the phase-2 (current default) frames, 3 blind judges: see the lane report |
