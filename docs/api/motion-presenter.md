# createFixedStepPresenter, createRecordBlend and runMotionGate: smooth on 120 and 144 Hz displays

> With three.js you write the interpolation between simulation steps yourself. `createFixedStepPresenter` draws between the last two steps, and `runMotionGate` tests it at 60, 120 and 144 Hz. A game that draws the latest step instead has about half its frames unchanged at 120 and 144 Hz.

`import { createFixedStepPresenter, createRecordBlend, runMotionGate } from "@aura3d/engine/game"` and `createFixedStepLoop` from `@aura3d/engine`.

A 60 Hz fixed-step simulation shown on a 120 Hz display advances the drawn entity on every second frame (an unchanged frame, then a double jump), and an animation driven from it flips between clips. The fix is to draw between the last two simulation steps.

```ts
const loop = createFixedStepLoop({ step: (dt) => { sim.step(dt); presenter.afterStep(); }, render });
const presenter = createFixedStepPresenter({
  snapshot: () => ({ x: sim.x, z: sim.z, yaw: sim.yaw }),
  blend: createRecordBlend({ angleKeys: ["yaw"], snapDistance: 12, position: (p) => [p.x, p.z] })
});
// in render(): draw presenter.present(loop, live) instead of the latest state
```

- `loop.alpha` (new on `createFixedStepLoop`) is `accumulator / stepSeconds` clamped to 0..1. Defaults of the loop are unchanged.
- `presenter.afterStep()` after every step; `presenter.reset()` after a teleport, restart or scene change; `presenter.present(loop, live)` returns the blended state while `live` and the latest state otherwise (menus, manual QA runs), so replays and `stepFrames` are untouched: only the drawn pose changes.
- `createRecordBlend(options)` blends plain records: numbers interpolate, `angleKeys` take the shortest arc, arrays and typed arrays interpolate per element, other values (clip names, flags) take the latest. `snapDistance` with `position` shows the new state when a step moves further than that (wrapped traffic, teleports).
- Feed cameras from the displayed pose with frame-time smoothing (`createSmoothFollow3`), not from the raw step.
- `runMotionGate({ displayHz, step, afterStep, drawn, clip })` drives the real loop at a simulated display rate and returns `stillFraction`, `cv`, `clipFlipsPer10s`, `passed` and `failures`. Run it at 60, 120 and 144 Hz in a unit test (with `jitterSeconds` for uneven frames); a game that draws the latest step fails at 120 and 144 Hz with about half of its frames unchanged.
