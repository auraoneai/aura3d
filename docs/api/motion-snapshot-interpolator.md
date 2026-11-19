# createSnapshotInterpolator, mixNumber and mixVec3: draw hand-written snapshots between fixed steps

`import { createSnapshotInterpolator, mixNumber, mixVec3 } from "@aura3d/engine/game"` and `createFixedStepLoop` from `@aura3d/engine`.

Most games draw a 60 Hz fixed-step sim through three hand-written functions: `shownOf(state)` captures what moves, `blendShown(a, b, t)` mixes two steps and returns the newer one when the step jumped (respawn, restart, lap wrap), and `viewOf(state, shown)` puts the blended values back into a view of the state for the renderer. `createSnapshotInterpolator` is that shape as a library call: the snapshot and blend stay in the game, the snap rule is declared once, and an allocation-free mode reuses pooled snapshots. It has the same `afterStep` / `reset` / `present(loop, live)` calls as [`createFixedStepPresenter`](motion-presenter.md).

```ts
const presenter = createSnapshotInterpolator<Shown>({
  snapshot: () => ({ s: run.s, lane: run.lane, traffic: run.traffic.map((c) => ({ s: c.s })) }),
  blend: (a, b, t) => ({ s: mixNumber(a.s, b.s, t), lane: mixNumber(a.lane, b.lane, t), traffic: b.traffic }),
  snap: { distance: 20, position: (p) => p.s }   // a jump further than 20 m shows the new step
});
const loop = createFixedStepLoop({ step: (dt) => { stepRun(run, dt); presenter.afterStep(); }, render });
// render(): draw viewOf(run, presenter.present(loop, live)); after a restart or teleport: presenter.reset()
```

- **present.** While `live` and `alpha < 1` it returns `blend(previous, current, alpha)` (alpha clamped to 0..1), or `current` unblended when `snap` says the step jumped. Otherwise (`alpha >= 1`, `live = false` for menus and manual QA) it returns a fresh snapshot. `source` is the loop (its `alpha`) or a number.
- **snap.** A predicate `(previous, next) => boolean`, or `{ distance, position }`: `position` returns a scalar (`Math.abs` of the change), a tuple or an `{ x, y, z }` (`Math.hypot` of the change); the step snaps when the change is strictly greater than `distance`. Snap rules for parts of the state (a rival or a bolt that wrapped) stay in `blend`.
- **Allocation-free.** Pass `create: () => emptySnapshot()`; the interpolator builds four snapshots up front (two history slots, one latest, one blend result) and passes them to `snapshot(out)` and `blend(a, b, t, out)`. Each value `present` returns is reused later, so read it before the next `afterStep` or `present`. Ion Circuit (heatsink) runs this way.
- **mixNumber / mixVec3.** `a + (b - a) * t`, the exact expression the games wrote, for numbers and for `[x, y, z]` tuples or `{ x, y, z }` objects (`out` writes in place). Angles need the shortest arc: `lerpAngle` from [motion-smoothing](motion-smoothing.md) or the game's own.
- **Prove it.** Run `runMotionGate` at 60, 120 and 144 Hz (see [motion-presenter](motion-presenter.md)). When moving an existing presenter onto it, replay a recorded run through the old and new presenters and compare the presented bytes, as `tests/unit/game/snapshot-interpolator.test.ts` does for Strange Orbit, Ion Circuit and Roadster Hours.
