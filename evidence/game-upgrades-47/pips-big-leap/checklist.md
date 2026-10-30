# Pip's Big Leap: WP-16 acceptance checklist (phase 1 status)

Status legend: **done** (code and unit test in this branch), **phase 2** (needs the remote steady-state capture, real-GPU run or judge), **blocked (WP-36)** (needs a generated asset), **blocked (E-x)** (needs an engine change listed as a handoff), **not done**.

| Row | Acceptance line (PRD WP-16) | Status | Where |
|---|---|---|---|
| PBL-L1 | academy 140-160, w1 115-140, w2 125-150, w3 150-175 with p5 <= 70, w4 60-90 with p95 >= 235, w5 85-115, w6 55-80 | phase 2 | bands declared in `luma-bands.json` |
| PBL-L1 | thumb sd >= 45 | phase 2 | `luma-bands.json` (`std`) |
| PBL-L1 | 7 backgrounds | done | `looks.test.ts` |
| PBL-L1 | cascadeCount 3 | done (authored), phase 2 (diagnostics) | key `shadow: { filter: "pcss", cascades: 3 }`, `looks.test.ts` |
| PBL-L1 | no lighting finding | phase 2 | judge |
| PBL-L2 | w4 grid[7] >= 25 over top corners | phase 2 | flicker via `setLight`, `presentation.test.ts` |
| PBL-L2 | w5 throne cell >= 1.3x lanterns off | phase 2 | `throne` QA crop |
| PBL-L2 | <= 6 lights, <= 2 shadowed | done | `diorama.test.ts` (1 shadowed key; practicals unshadowed) |
| PBL-E1 | bottom band sd >= 20 and >= 25 from background | phase 2 | `bottom-band` crop band |
| PBL-E1 | no solid-void | phase 2 | base under every course (`diorama.test.ts`) |
| PBL-E1 | height-mode fog in diagnostics | done (authored), phase 2 (diagnostics) | look fog `mode: "height"`, `setFog` after each mount |
| PBL-E1 | +6 draws max | done (estimate +4) | `budget.json` |
| PBL-E2 | w6 top band 25-50 with >= 20 bright cells | phase 2 | `luma-bands.json` w6 `cells.top` |
| PBL-E2 | w3 row 0 minus row 5 >= 15 | phase 2 | capture rows |
| PBL-E2 | HDRI still the env source | done | `captureEnvironment: false`, `diorama.test.ts` |
| PBL-E3 | exactly one emitter per world | done | `diorama.test.ts` |
| PBL-E3 | live > 0 at 35 s, <= 600 | done (<= 600 authored), phase 2 (live count) | |
| PBL-E3 | top row diff >= 1/255 over 0.5 s; mean within 4 | phase 2 | GL_PAIR |
| PBL-E4 | water crop sd >= 18; +1 pass +3 draws max; swim tests unchanged | not done (C row) | `water` QA crop published |
| PBL-P1 | S2-gtao, S9-bloom, S10b in stagesRan everywhere; no duplicate stage | phase 2 | one bloom per world (`diorama.test.ts`) |
| PBL-P1 | L1 bands hold | phase 2 | |
| PBL-P2 | S6-dof at High | phase 2 | DOF node + focus follow (`presentation.test.ts`) |
| PBL-P2 | Pip crop keeps >= 0.85 variance, corners drop to <= 0.6 | phase 2 | `pip`, `corner-tl`, `corner-tr` crops |
| PBL-P2 | camera and post >= 7 | phase 2 | judge |
| PBL-P3 | S4 in those worlds only | done (authored), phase 2 (stagesRan) | `diorama.test.ts` |
| PBL-P3 | sun cell +8; mean +10 max; clip < 0.03; receipt `effects-god-rays` | phase 2 | |
| PBL-M1 | no face crop > 230 | phase 2 | |
| PBL-M1 | no flat-palette or primitive-subject | phase 2 | judge |
| PBL-M1 | material_quality >= 7 | phase 2 | judge |
| PBL-M2 | lava p95 >= 240, clip < 0.03 | phase 2 | practical emissive lava |
| PBL-M2 | seed +30 over platform | phase 2 | |
| PBL-M2 | hazard hue outside 290-330 | done | plum `#5b3a7a`, hue about 271 |
| PBL-M2 | bramble model, crusted scrolling lava shader | blocked (WP-36) / not done | |
| PBL-A1 | <= 8k tris, <= 2 textures each; validate --release; collision tests unchanged; 0 box platforms; <= 420 draws | blocked (WP-36) | slabs keep the colliders |
| PBL-A2 | rg for borrowed prefixes returns 0; likeness, shared-catalog, asset-provenance 0 errors; modeling >= 7 | blocked (WP-36) | |
| PBL-A3 | validate-animation --require-rig; >= 2 clips per villager in 10 s | blocked (WP-36) | |
| PBL-A4 | PIP_CLIPS hurt/fall/land distinct; validate --map; cape within 0.03 m of socket | blocked (WP-36) | |
| PBL-A5 | landmark >= 8% of spawn frame; judge: different places >= 70% | blocked (WP-36) | |
| PBL-A6 | hash and bounds same; no dark face next to a lit face | blocked (WP-36) | |
| PBL-V1 | 30 s autoplay >= 10 land dusts, one sparkle per seed | done (wiring), phase 2 (count) | evidence `diorama.vfxFired` |
| PBL-V1 | liveCount <= 40 | phase 2 | evidence `diorama.liveCount` |
| PBL-V1 | feet crop sd +8 vs vfx=off | phase 2 | `feet` crop |
| PBL-V2 | glide crop sd +6 | phase 2 | `glide` crop |
| PBL-V2 | trail stopped within 0.5 s of landing | done | stopped on the landing frame (`vfx.test.ts`, `presentation.test.ts`) |
| PBL-V3 | pass in w4 only; mean shift <= 3 | not done (C row) | |
| PBL-AN1 | scale.y < 0.9 on land, > 1.05 at takeoff | done | `presentation.test.ts` |
| PBL-AN1 | foliage diff >= 1.5/255 | phase 2 | flora wind (`instances.*({ wind })`) |
| PBL-AN1 | animation >= 7; collisions unchanged | phase 2 (judge); collisions done | pinwheels, mill wheel, banners, leaf pads: not done (WP-36 props) |
| PBL-C1 | rail rig for 3.5 s then game pose; skip within 1 frame | done | `presentation.test.ts` |
| PBL-C1 | no inside-geometry frames | done (rail above the course), phase 2 (frames) | |
| PBL-C2 | Pip 18-25% of frame height | phase 2 | fov 46, lift 1.7 |
| PBL-C2 | fovKick energy on glide | done | `presentation.test.ts` |
| PBL-C2 | portrait hFOV >= 34 deg | done | `looks.test.ts` |
| PBL-H1 | HUD <= 12% at 390x844 | phase 2 | sizes unchanged |
| PBL-H1 | fonts check 0 | done | `game-checks` |
| PBL-H1 | ui_hud >= 7 | phase 2 | judge; 3 game-art icons blocked (WP-36) |
| PBL-W1 | <= 14 draws | done (5) | `diorama.test.ts` |
| PBL-W1 | same seed gives same transforms | done | `diorama.test.ts` |
| PBL-W1 | environment >= 7, no floating/void notes | phase 2 | judge |
| PBL-PF1 | <= 420 draws in every world (today 460-784) | phase 2 | estimates in `budget.json` |
| PBL-PF1 | <= 9 MB GLB; triangles recorded | phase 2 | |
| Look contract | `art/direction.ts` + audit, look table, VFX pack, identity, budget, checklist | done | `art/direction.audit.json` (0 violations) |
| PRD 6.3 | reduced motion: sequences skipped, no shake, motion <= 30%, emission halved | done | `looks.test.ts`, `presentation.test.ts`, `vfx.test.ts`, `diorama.test.ts` |
| PRD 6.4 | Low tier keeps palette, sky, fog, vignette | done (authored), phase 2 (frames) | DOF/S4 dropped by the engine tier table |
