# createLocomotion and proceduralLegSwing: legs that match the ground

`import { createLocomotion, proceduralLegSwing } from "@aura3d/engine/game"`

Drive idle, walk, run and sprint clips from the character's real ground speed. Weights follow speed brackets; playback rate is `speed / clip speed` (clamped), so planted feet do not slide.

```ts
const loco = createLocomotion({ gaits: [
  { name: "idle", speed: 0, cycle: 4 },
  { name: "walk", speed: 1.4, cycle: 1.1 },
  { name: "run", speed: 4.2, cycle: 0.7 }
] });
// every frame, with the speed you actually moved this step:
const f = loco.update(groundSpeed, dt);
// f.weights, f.rates (per clip), f.phase (0..1), f.dominant, f.overspeed
```

- `speed` is the clip's root travel speed at rate 1 (measure it from the clip: stride length / cycle time). `cycle` is seconds per stride at rate 1.
- Feed weights to your crossfade or layers and `rates` to the clip playback rates. `overspeed: true` means ground speed is beyond the fastest clip even at the rate clamp: add a faster gait.
- Rigs with no usable leg clip (or locked weights): `proceduralLegSwing(phase, groundSpeed)` returns hip, knee and ankle angles for both legs, opposite arm swing and a pelvis bob. Apply the angles to the bones yourself.
- Verify with `createFootSlideMeter` ([motion-foot-slide.md](motion-foot-slide.md)).
