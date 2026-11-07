# Engine API gaps closed in 5.1 (additive)

Found by the 25 per-game lanes. Everything here is additive except the two removals listed under particles, which were
accepted by the type but never read.

## createGame: renderer, output and worker passthrough

`createGame` (and `Prd09CreateGameOptions`) now accept `renderer`, `output` and `worker`, so the shared lab-flag fragment
can be spread into a game without a cast:

```ts
import { createGame } from "@aura3d/game";
import { labAppOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";

createGame({ id: "my-game", target, scene: () => scene(), ...labAppOptions(readLabFlags()) });
```

- `renderer` and `output` are forwarded to the app (`createAuraApp` options of the same name).
- `worker` is typed `{ createWorker?, fallback?, disposeTimeoutMs? } | undefined` (it was `undefined`/`never`). Games keep a
  synchronous main-thread loop, so only `worker: { fallback: "main-thread" }` is accepted, and it is not forwarded. Any
  other worker request throws `AuraWorkerError` with `code: "worker-unsupported"` before a canvas is acquired. For real
  worker rendering use `createAuraApp` and `await app.stepAsync()`.
- `labAppOptions(flags, createWorker)` returns a fragment whose `worker` carries `createWorker`, which spreads into
  `createAuraApp` without a cast (`LabAppOptionsWithWorker`). `labAppOptions(flags)` is unchanged.

## AuraApp

- `app.setClearColor(color, alpha?)` exists on every main-thread `AuraApp` (it is declared optional on the type, so call
  it as `app.setClearColor?.(color)`; no cast is needed). It is not implemented on worker-owned apps.
- `AuraRendererInfo` and `AuraPrecompileResult` are exported as types from `@aura3d/engine`. `app.info.memory` now also
  carries `bufferBytes` and `textureBytes` when the device reports them (WebGL2 does).
- `app.readiness()` and `app.readyStrict()` are implemented on main-thread and worker apps as documented in
  `docs/migration/4-to-5.md` (B2, 5.1); no change was needed.

## effects.particles options

Eight of the nine options that were accepted but never read are now simulated by the CPU emitter. Only authored values
change anything; a node that sets none of them lowers and simulates exactly as before. When `simulation` resolves to
`"gpu"` (more than the GPU threshold of particles, or `simulation: "gpu"`) the GPU path keeps the legacy disc spawn and
ignores these options.

| Option | Behavior |
| --- | --- |
| `shape` | `point`, `sphere`, `hemisphere`, `cone`, `box`, `disc`, `ring`, `edge` around `position`. Replaces the `radius` disc. |
| `shapeSize` | Number: radius (`box`: cube side). Vector: full box extents, or per-axis radii. Alone it implies `box`. |
| `coneAngleDeg` | Uniform emission cone around `direction`; `shape: "cone"` defaults to 25. Replaces `spread` jitter. |
| `wind` | Constant drift in m/s added to every particle. `"weather"` is ignored. |
| `sizeOverLife` | Size multiplier over life, piecewise-linear over evenly spaced samples. |
| `alphaOverLife` | Alpha multiplier over life; replaces the default fade-in/fade-out. |
| `lifetimeColorRamp` | `#rgb` / `#rrggbb` stops over life; replaces `color`. Any other stop ignores the ramp. |
| `stretch` | `{ mode: "velocity", factor? }` (default 0.02) or `{ mode: "none" }`. |

Builder defaults are not intent: `effects.particles` writes `sizeOverLife: [0.35, 1, 0.58]` and
`alphaOverLife: [0, 0.92, 0]` on every node, so a curve equal to its default is treated as not authored.

Still accepted, no effect yet (kept in the type so the declaration stays additive):

- `intensity` (typed "HDR multiplier", marked `@deprecated`): the emitter does not read it. Pre-multiply `color` for a boost.
  The legacy `AuraEffectNode.intensity` strength field is unchanged.
- `shape: "mesh-surface"`: the emitter keeps the legacy `radius` disc. Use `scatterInArea` / `scatterTransforms` and place emitters.

## New exports

Types only, from `@aura3d/engine`: `AuraRendererInfo`, `AuraPrecompileResult`. New in `@aura3d/engine/contracts`:
`AuraGameWorkerOptions`. Inside `@aura3d/engine`'s production runtime: `sampleCurve` (CpuEmitter, not a public subpath).

## Single-route showcase build

`AURA3D_ONLY_ROUTE=<route> node marketing/scripts/build-showcase-routes.mjs` now builds and checks that route only: the
all-assets and LFS pointer scans, the `showcase-index` redirect target, retired-route redirects and other routes'
catalog aliases are out of scope, and it exits 0 when the selected route builds. Unknown route names fail fast.
