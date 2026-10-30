# Glint Courier (`dot-dash-3d`): WP-23 acceptance checklist (lane g13)

Status: `done` (met in code or unit test), `phase 2` (needs a capture, judge or measurement), `blocked (x)`, `pending`.
Pixel numbers are software WebGL2 on the remote runner (phase 2).

| Row | Acceptance line | Status | Where |
|---|---|---|---|
| look contract | art/direction.ts + audit record, look table, VFX pack, identity, budget, checklist | pending | `src/art/direction.ts`, `src/game/look.ts`, `src/game/vfx.ts`, this folder |
| DD47-L1 | left third >= 1.6x right third (today ~1.0) | pending | |
| DD47-L1 | spot sampled and rendered | pending | |
| DD47-L1 | no ambient / weak-shadow lint | pending | |
| DD47-L2 | courier 3x3 crop >= 1.5x an empty corridor crop | pending | |
| DD47-L2 | fps within 10% | pending | |
| DD47-E1 | not neon-arcade; no no-ibl | pending | |
| DD47-E1 | lamp-side p95 >= p50 + 30 | pending | |
| DD47-E1 | no lighting warning | pending | |
| DD47-E2 | every corner cell >= 10 at 1280 and 390 | pending | |
| DD47-E2 | darkFrac <= 0.12; no solid-void | pending | |
| DD47-P1 | bench cell variance <= 40% of centre; centre within 10% of DOF-off | pending | |
| DD47-P1 | stage trace after E-C | pending | |
| DD47-P2 | p95 >= 200 (124); clip <= 0.01; mean 42-60; mean blue >= 30 | pending | |
| DD47-P3 | 6 per-board targets; each board's mean RGB differs >= 12 in a channel; garden >= 1.5x zerocore | pending | |
| DD47-M1 | admission checks pass | pending | |
| DD47-M1 | passed corridors +25 over untouched 0.5 s later; no degradations | pending | |
| DD47-M2 | wall/corridor >= 1.8:1; pins 1 draw; material and composition >= 7 | pending | |
| DD47-M3 | lens >= 4x slab; halo > 128 at 3 px | pending | |
| DD47-A1 | validate --release; no primitive-subject; >= 1.2% of frame (~0.6% today) | pending | |
| DD47-A2 | pairwise silhouette IoU <= 0.6; <= 8 draws | pending | |
| DD47-A3 | fit-grounding and deployable pass; no primitive-subject on any board | pending | |
| DD47-V1 | each fires on its event; >= 40 hot pixels 80 ms after a disable; liveCount <= 60 | pending | |
| DD47-V2 | lamp crop differs >= 4/255 over 1 s paused; <= 120 particles | pending | |
| DD47-AN1 | roll >= 8 deg in a turn; yaw step <= 45 deg/frame; reduced-motion probe passes | pending | |
| DD47-AN2 | READY+0.6 s spawn half >= 3x far half; equal within 20% at +1.4 s | pending | |
| DD47-C1 | sequences in evidence; captures within 2 of disabled; 19 columns at 390x844 | pending | |
| DD47-H1 | contrast >= 4.5:1; HUD <= 14% at 390x844; ui_hud >= 7 | pending | |
| DD47-W1 | label contrast >= 3:1; +6 draws max | pending | |
| DD47-PF1 | <= 110 / 90 / 70 draws by tier; JS +20 KB max; fps within 15% | pending | |
| DD47-PR1 | same_game false >= 0.8 vs all 6; every category >= 7; 0 warnings; poster no longer navy (11,24,77) | pending | |
