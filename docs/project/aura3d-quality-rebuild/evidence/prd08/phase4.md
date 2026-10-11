# PRD-08 Phase 4 exit evidence

Phase 4: motion models, controls, audio glue. Exit: S12, S13, S14, S18, S9 for M6.

Main run: [38113231509](https://github.com/auraoneai/aura3d/actions/runs/38113231509) on 24933074d. Unit x2 succeeded; browser-gpu and motion are pending.

| Row | Proof | Status on main |
|---|---|---|
| S12 bicycle drift | unit `vehicle-drift.test.ts`, `bicycle-vehicle.test.ts`; browser `vehicle-rail.spec.ts` drift (with unicycle control) | unit green 38113231509; browser pending. **Open decision:** the script uses a 0.35 s handbrake (from `vehicle-drift.test.ts`, whose note says 0.5 s makes the spin unrecoverable in this model). PRD §16 says 0.5 s; the PRD or the model needs a ruling. |
| S13 platformer accel | unit `platformer-accel.test.ts`, engine `platformer-motion.test.ts` | green 38113231509 |
| S14 touch | unit `touch-controls-mount.test.ts`, `touch-device-prompts.test.ts`; browser `camera-feel.spec.ts` S14 | unit green 38113231509; browser pending. Gap: the browser spec proves the touch device and prompt switch, not end-to-end play by touch or the ≥ 48 px target audit. |
| S18 audio glue | unit `feel-sound.test.ts` (one `setListener` per presented frame), `vehicle-platformer-wiring.test.ts` | green 38113231509 |
| S9 M6 | motion job `prd08-motion-pacing-120` | pending motion job |
