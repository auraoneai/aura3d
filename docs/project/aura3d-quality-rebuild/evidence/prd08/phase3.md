# PRD-08 Phase 3 exit evidence

Phase 3: feel bus, hit-stop consumers, screen-feel publication, cinematic rails. Exit: S5 (scoped), S10, S11, S9 for M5.

Main run: [38113231509](https://github.com/auraoneai/aura3d/actions/runs/38113231509) on 24933074d. Unit x2 succeeded; browser-gpu and motion are pending.

| Row | Proof | Status on main |
|---|---|---|
| S5 scoped hit-stop | unit `hit-stop.test.ts` (`fixtures/fighters.json`); browser `hit-stop.spec.ts`: fighters a+b frozen 0.07 s ± 1 step, bystander moving, shake energy > 0; no-hit-stop control | unit green 38113231509; browser pending |
| S10 feel accounting | unit `feel-bus.test.ts`, `feel-audio-dispatch.test.ts`, `feel-lint.test.ts`; browser `camera-feel.spec.ts` S10 | unit green 38113231509; browser pending |
| S11 rail continuity | unit `rail-continuity.test.ts` (real rail rig, closed 6-point, speed variation ≤ 5 %, eased-loop control); browser `vehicle-rail.spec.ts` | unit green 38113231509; browser pending |
| S9 M5 | motion job `prd08-motion-rail-shot` | pending motion job |

Hit-stop frames go to `hit-stop/<run-id>/`, and rail/drift JSON to `vehicle-rail/<run-id>/`, from the browser-gpu artifact.
