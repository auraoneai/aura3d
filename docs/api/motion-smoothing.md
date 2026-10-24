# smoothDamp, createSmoothFollow3 and createRenderInterpolator: no jitter

`import { smoothDamp, createSmoothFollow3, createRenderInterpolator, lerpAngle, jitterReport, secondDifferenceRms } from "@aura3d/engine/game"`

- `smoothDamp(current, target, velocity, smoothTime, dt, maxSpeed?)` is a critically damped follow with no overshoot, frame-rate independent. `createSmoothFollow3(start, { smoothTime })` does it for a position (use for follow cameras and for a character's rendered position).
- `createRenderInterpolator(lerp)` blends the last two fixed simulation states with the frame's `alpha`, so render frames that fall between sim steps do not stutter. Push the state each fixed step; sample with `alpha` each render.
- Do not re-snap a character to the ground every step and do not add a vertical bob larger than the stride needs; both read as shaking.
- Measure: sample the rendered height or camera position over a steady-speed run and call `jitterReport(samples, threshold)`. It returns `rms` and `max` of the second difference and `passed`. Record before and after numbers.
