# T4.2 — `characterAnimation(controller, node, spec)` (PRD-06 §7.1)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


The locomotion-controller → clip-tree binding in
`packages/engine/src/agent-api/GameCharacterAnimation.ts`, exported from
`packages/engine/src/lanes/prd06.ts` (the `game.characterAnimation` alias is
Q-09-1).

## What it does per `update(dt)`

- `dt` is composed `rawDt * app.time.scale * handle.timeScale` (C-23). App
  scale resolves through `setCharacterAnimationAppTimeScale` — the same
  provider shape `compiler/animation.ts` uses for the render path — and
  `handle.timeScale` is read structurally (both stub 1 until prd08).
- Controller state is read structurally: `snapshot()` on
  ArcadeCharacterController / FightingCharacterController (`speed`,
  `velocity`, `grounded`, `jumpedThisFrame`, `state`) or the `.state` bag on
  the procedural `LocomotionController`.
- **1-D blend tree** (`param: "speed"`): piecewise-linear weights between
  sorted control points — `speed` below the first `at` is pure first clip,
  above the last is pure last clip. `smoothing` adds a speed EMA.
- **2-D blend tree** (`param: "velocity2d"`): barycentric weights inside an
  origin-centred angular fan of control points; outside the fan projects
  onto the outer edge; an implicit idle point at the origin is seeded from
  the smallest-magnitude clip when the spec lacks one.
- **One sync group**: all locomotion samples share a normalized phase
  advanced once per frame at the weight-blended cycle rate
  (`Σ wᵢ / durationᵢ`); each sample's `localTime = phase × durationᵢ` —
  three.js `sync` semantics, so walk/run footfalls stay aligned (measured
  sync error 0 ≤ 1% bar).
- **Airborne states**: grounded→false plays `jumpStart` (one-shot, when the
  controller reports a jump edge) then holds `fall`; false→true plays `land`
  blended over `landBlend` (default 0.12 s) back into locomotion.
- **Actions**: `trigger(name)` pushes the action clip onto its `layer`
  (default `"actions"`) with `mask`, `blendIn`/`blendOut` ramps and
  `duration` (explicit or resolved through `resolveAnimationClips`); a second
  trigger on the same layer replaces the previous action.
- **Constraints**: `footIk` / `lookAt` specs are registered once at bind via
  `node.animation.ik.add`; `dispose()` clears them.
- Every update publishes `clipSamples` on `node.setAnimationBinding` — the
  CCR-06-5 field `dispatchActorAnimation` reads under `A3D_QR_ANIMATION` and
  routes to `actor.animation.applyClips`, so the blend lands in the actor's
  PoseMixer with `weight`, `layer`, `syncGroup`, `mask` intact. Weights below
  1e-6 are culled from the published set.

## Gates

`tests/qr/prd06/unit/character-animation.test.ts` — 7/7:
- full 0→5 m/s ramp ends on pure Run; mid-ramp gives the linear 0.5/0.5
  Walk↔Run weights;
- published `localTime/duration` phases agree across Walk and Run (sync
  error 0, ≤ 1% bar);
- `app.time.scale × handle.timeScale` composed into the binding dt (2 × 0.5
  advances the shared phase by one raw second);
- jump-start → fall → land → locomotion state sequence on a grounded toggle;
- masked-layer `trigger("wave")` ramps in on layer `upper` with
  `humanoid: "upper-body"` mask;
- `footIk`/`lookAt` specs hit `ik.add` at bind and `ik.clear` at dispose.

`tsc --noEmit` + eslint clean on the module and test.
