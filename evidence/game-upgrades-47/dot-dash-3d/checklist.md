# Glint Courier (`dot-dash-3d`): WP-23 acceptance checklist (lane g13)

Status: `done` (met in code or unit test), `phase 2` (needs a capture, judge or measurement), `blocked (x)`, `pending`.
Pixel numbers are software WebGL2 on the remote runner (phase 2).

| Row | Acceptance line | Status | Where |
|---|---|---|---|
| look contract | art/direction.ts + audit record, look table, VFX pack, identity, budget, checklist | done | `src/art/direction.ts`, `src/game/look.ts`, `src/game/vfx.ts`, this folder |
| DD47-L1 | left third >= 1.6x right third (today ~1.0) | phase 2 | `luma-bands.json` crops `lamp-third` / `far-third` |
| DD47-L1 | spot sampled and rendered | phase 2 | `lampLight` in world.ts; tests/unit/dot-dash-3d/lighting.test.ts |
| DD47-L1 | no ambient / weak-shadow lint | done | lighting.test.ts, art-direction.test.ts (no ambient, one shadow caster) |
| DD47-L2 | courier 3x3 crop >= 1.5x an empty corridor crop | phase 2 | crops `courier`, `corridor`; `syncPracticals` |
| DD47-L2 | fps within 10% | phase 2 |  |
| DD47-E1 | not neon-arcade; no no-ibl | done | lighting.test.ts (HDRI node, no look preset, probe) |
| DD47-E1 | lamp-side p95 >= p50 + 30 | phase 2 |  |
| DD47-E1 | no lighting warning | phase 2 |  |
| DD47-E2 | every corner cell >= 10 at 1280 and 390 | phase 2 | `luma-bands.json` cells 0/2/6/8 |
| DD47-E2 | darkFrac <= 0.12; no solid-void | phase 2 | `luma-bands.json` |
| DD47-P1 | bench cell variance <= 40% of centre; centre within 10% of DOF-off | phase 2 | crops `board-centre`, `bench-corner` |
| DD47-P1 | stage trace after E-C | phase 2 |  |
| DD47-P2 | p95 >= 200 (124); clip <= 0.01; mean 42-60; mean blue >= 30 | phase 2 | lens stack in buildScene; bands in `luma-bands.json` |
| DD47-P3 | 6 per-board targets; each board's mean RGB differs >= 12 in a channel; garden >= 1.5x zerocore | partial (LUTs: asset need) | per-board grade via `setEffect("colorGrade")`; six .cube LUTs not admitted |
| DD47-M1 | admission checks pass | partial | baked map set not produced (lane report) |
| DD47-M1 | passed corridors +25 over untouched 0.5 s later; no degradations | done in code (pixels phase 2) | `TraceField` + `traces lit` pool; traces.test.ts |
| DD47-M2 | wall/corridor >= 1.8:1; pins 1 draw; material and composition >= 7 | done in code (pixels/judge phase 2) | epoxy roundedBox walls, pin pool (1 draw) |
| DD47-M3 | lens >= 4x slab; halo > 128 at 3 px | done in code (pixels phase 2) | LED shards and can vents glow via instanceColorTarget |
| DD47-A1 | validate --release; no primitive-subject; >= 1.2% of frame (~0.6% today) | blocked (WP-36) |  |
| DD47-A2 | pairwise silhouette IoU <= 0.6; <= 8 draws | blocked (WP-36) |  |
| DD47-A3 | fit-grounding and deployable pass; no primitive-subject on any board | blocked (WP-36) |  |
| DD47-V1 | each fires on its event; >= 40 hot pixels 80 ms after a disable; liveCount <= 60 | done in code (pixels phase 2) | vfx.ts + main.ts; vfx.test.ts (liveCount <= 60, reduced flash) |
| DD47-V2 | lamp crop differs >= 4/255 over 1 s paused; <= 120 particles | done in code (pixels phase 2) | `lamp-motes` emitter |
| DD47-AN1 | roll >= 8 deg in a turn; yaw step <= 45 deg/frame; reduced-motion probe passes | done | motion.test.ts (roll >= 8 deg, step <= 45 deg, 30% on reduced motion) |
| DD47-AN2 | READY+0.6 s spawn half >= 3x far half; equal within 20% at +1.4 s | done in code (pixels phase 2) | `boardWave`, motion.test.ts |
| DD47-C1 | sequences in evidence; captures within 2 of disabled; 19 columns at 390x844 | done in code (captures phase 2) | `maybePlayCinematic`, motion.test.ts |
| DD47-H1 | contrast >= 4.5:1; HUD <= 14% at 390x844; ui_hud >= 7 | partial (DIN Pro: no WOFF2) | styles.css silkscreen chips; contrast >= 9:1 computed |
| DD47-W1 | label contrast >= 3:1; +6 draws max | done in code (pixels phase 2) | +3 draws |
| DD47-PF1 | <= 110 / 90 / 70 draws by tier; JS +20 KB max; fps within 15% | done in code (measured phase 2) | budget.json `expected` |
| DD47-PR1 | same_game false >= 0.8 vs all 6; every category >= 7; 0 warnings; poster no longer navy (11,24,77) | phase 2 |  |
