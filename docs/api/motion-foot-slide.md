# createFootSlideMeter: measure "he is just sliding"

`import { createFootSlideMeter } from "@aura3d/engine/game"`

```ts
const meter = createFootSlideMeter({ threshold: 0.15 });
// each fixed step, for each foot you care about:
meter.feed(timeSeconds, footWorldPosition, { groundHeight: 0, bodySpeed });
const r = meter.report(); // { p95PlantedSpeed, maxPlantedSpeed, liftRange, notStepping, passed, ... }
```

- A foot counts as planted when within `plantedHeight` (0.06 m) of the ground; its horizontal world speed should then be near 0. `passed` needs p95 planted speed at or under `threshold` (default 0.15 m/s).
- `notStepping` catches the worst case: the body moves (above `movingSpeed`, 0.5 m/s) but the foot never lifts more than `minLift` (0.03 m), so the legs are not moving at all. A sliding character fails this even though its foot "never leaves the ground".
- Use one meter per foot. Read foot world positions with `boneWorldPosition(actor, footBone)`. Put the report in `evidence/<game>/rework/`.
