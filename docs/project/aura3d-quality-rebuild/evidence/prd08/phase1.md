# PRD-08 Phase 1 exit evidence

Phase 1: loop, time, math primitives, controller skeleton (PRD-08 §16 "Phase 1").
Exit: S1, S2, S3 (store-level), S4, S5 (global), S16, S17 (codemod fixtures).

Main runs (GitHub macos-14 / ubuntu, `qr-prd08-camera.yml`; a macos-14 run on a main commit counts, program ruling 2026-10-11):

| Run | Commit | Jobs |
|---|---|---|
| [38113231509](https://github.com/auraoneai/aura3d/actions/runs/38113231509) | 24933074d (#911 merge) | unit `A3D_QR=none` success, unit `A3D_QR=camera` success; browser-gpu / motion: pending (queued) |

| Row | Proof | Status on main |
|---|---|---|
| S1 one render per tick | unit `render-interpolation.test.ts` (L-4: `app.step` once per tick incl. 0-substep; `renderPerSubstep` control gives 2); browser `frame-pacing.spec.ts` 60/120/144 Hz | unit green 38113231509; browser pending |
| S2 real-time sim under load | unit `frame-loop.test.ts` (L-1/L-2 clamp, maxSubSteps); browser `frame-pacing.spec.ts` 100/250 ms | unit green 38113231509; browser pending |
| S3 no judder (store-level) | unit `render-interpolation.test.ts` L-7 store (midpoint, teleport, scoped freeze, slerp) | green 38113231509 |
| S4 legacy parity | unit `camera-fromspec-parity.test.ts` (42 cases), `camera-controller.test.ts` C-14 golden | green 38113231509 |
| S5 hit-stop (global) | unit `hit-stop.test.ts`, `time-controller.test.ts` | green 38113231509 |
| S16 engineering gates | unit job: lane suites, engine unit files, C-22/C-23 impl conformance (`prd08-time`, `prd08-camera`), ownership check, `typecheck:raw`, `lint` | green 38113231509 (both flag states) |
| S17 codemod fixtures | unit `camera-cast-codemod.test.ts` 5/5; unit-job codemod report step greps all six known cast sites | green 38113231509 |

Frame-pacing CSVs (§20 item 3) go to `frame-pacing/<run-id>/` from the browser-gpu artifact once that job completes.

Status: unit-level exit criteria met on main. The browser half of S1/S2 waits on the browser-gpu job of a main run.
