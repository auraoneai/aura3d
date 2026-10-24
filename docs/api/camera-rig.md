# `cameras.chase`: gameplay chase camera rig

`cameras.chase(options)` returns a pure, deterministic rig (no DOM, clock or randomness). Each frame you pass the followed target and apply the returned pose with `app.camera.setPose`. It is a runtime controller, not a scene node.

```ts
import { cameras } from "@aura3d/engine";

const chase = cameras.chase({
  offset: { back: 5.9, backPerSpeed: 0.048, up: 2.5, lead: 5, lookUp: 1.25, minAboveGround: 1.9 },
  lag: { heading: 2.7, headingMinFollow: 0.34, eye: 8, look: 10, fov: 4 },
  fovKick: { base: 56, perSpeed: 0.28, maxSpeedKick: 12, boost: 7 },
  shake: { perShake: 0.9, speedStart: 22, speedRange: 40, speedAmp: 0.075, mode: "accumulate" }
});

const pose = chase.step({ position: [x, y, z], heading, speed, boosting, shake, groundAt }, dt);
app.camera?.setPose({ position: pose.eye, target: pose.look, fov: pose.fov }, { cut: pose.cut });
```

## Two modes

- **Offset mode** (`position`, `heading`, `speed`): the eye sits `back` behind the smoothed heading, `look` leads by `lead`, `fovKick` opens the field of view with speed and boost, and `shake` adds a two-sine wobble.
- **Framed mode** (`wantEye`, `wantLook`, optional `fovTarget`): you compute the framing on a road frame, rail or menu orbit; the rig only smooths, snaps on the first frame and reports `cut`.

## Lag

A lag value is a per-second exponential rate: `current += (target - current) * (1 - exp(-rate * dt))`. An absent or `Infinity` rate follows exactly. `target.lag` overrides per step (per-phase rates). The first `step`, `target.cut` and `reset()` snap the pose and set `pose.cut`.

## Shake

`shake.mode: "accumulate"` adds the wobble into the smoothed eye (a low-passed shake); `"overlay"` adds it to the output only. `target.shakeOffset` is added to the output eye and never stored (damage shake, bob).

Helpers `approach` and `approachAngle` are exported from the module for ports that smooth other values. Ports migrated onto the rig: Drift & Deliver (offset mode, equivalent to its original `chase.ts` within 1e-9 over a 1,200-step drive), Ninja Runner, Roadster Hours, Kid Goku, Last Train and HEATSINK (framed mode).
