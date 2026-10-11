# PRD-08 Phase 2 exit evidence

Phase 2: rigs, springs, layers, collision. Exit: S3 (end-to-end on the lane harness), S6, S7, S8, S15, S9 for M1-M4.

Main run: [38113231509](https://github.com/auraoneai/aura3d/actions/runs/38113231509) on 24933074d. Unit x2 succeeded; browser-gpu and motion are pending.

| Row | Proof | Status on main |
|---|---|---|
| S3 end-to-end | browser `frame-pacing.spec.ts` (120 Hz scripted rAF, monotonic interpolated positions, `interpolation: false` control) | pending browser-gpu |
| S6 chase framing | unit `camera-rigs.test.ts` R-1; browser `camera-feel.spec.ts` S6 | unit green 38113231509; browser pending |
| S7 shake unfiltered | unit `camera-feel.test.ts`, `feel-bus.test.ts`; browser `camera-feel.spec.ts` S7 | unit green 38113231509; browser pending |
| S8 collision | unit `camera-rigs-view.test.ts` probe/damper; browser `camera-feel.spec.ts` S8 (scripted 30 s orbit around a box wall, collision-off control). Static scene walls: `probe-static-scene.test.ts` (#946, #948) | unit green 38113231509; browser pending |
| S15 fade chunk | unit `camera-fade.test.ts`, `camera-fade-shader.test.ts` | unit green 38113231509. The pixel-coverage measurement is BLOCKED on G1 T0-02 |
| S9 M1-M4 | motion job: `prd08-motion-chase-speed`, `-impact-shake`, `-flight-bank`, `-collision` (Aura3D + three r0.185.1), `aura3d prd08 motion-report` | pending motion job |

Motion strips and the report go to `motion/<run-id>/` from the `prd08-motion-report-<run-id>` artifact.
