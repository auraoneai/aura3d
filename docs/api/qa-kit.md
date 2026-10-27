# QA and replay kit

> With three.js you write the fixed-timestep loop, the seeded random stream and the test hooks yourself. Here `createFixedStepLoop`, `createCountedRng` and `installQaHooks` are exported from `@aura3d/engine`, so specs, capture tools and replays drive every game the same way.

Public helpers (all exported from `@aura3d/engine`) that replace the hooks and fixed-timestep loops every game used to copy into its own `main.ts`. They exist so browser specs, capture tools and the live smoke can drive a game the same way everywhere, with no engine internals.

| Export | Purpose |
| --- | --- |
| `readQaParams(schema, search?)` | Typed parser for the QA query parameters (`manual=1`, `autostart=1`, `warmup=30`, `seed=7`, `quality=low`). Flags, numbers, ints, enums and strings with defaults. |
| `createFixedStepLoop(options)` (alias `fixedStepLoop`) | Variable frame time in, fixed simulation steps out. Frame clamp (0.1 s), catch-up cap (6 steps), manual mode, `isActive` pause, one `render` per frame, `advance(n)` for exact stepping, `resetAccumulator()` for restarts. |
| `installQaHooks(name, options)` | Installs `window.__AURA_<NAME>__` with the standard hooks plus your extras, and the `__AURA_<NAME>_ERROR__` first-error slot. |
| `createCountedRng(seed)` | mulberry32 stream with a draw counter (`count`, also readable as `draws`), `range`, `int` and `reset`. The library's one mulberry32: the Bunker Zero, Dot Dash, Iron Crown, Apex Overdrive, HEATSINK, Drift & Deliver and Splat Rush games use it instead of inline copies, with bit-identical streams. Matches the stream recorded by the Crayon ports, so replays can assert the exact draw count. |
| `qaHookGlobalName(name)`, `qaErrorGlobalName(name)` | `splat-rush` becomes `__AURA_SPLAT_RUSH__` and `__AURA_SPLAT_RUSH_ERROR__`. |

## Standard hooks

`ready()`, `seed`, `state()`, `stepFrames(n, input?)` (runs, presents once, returns `state()`), `reset(seed?)`, `replay(script, ...rest)`, `begin()`, `traceRow()`, `traceColumns`, `frame(width?, height?, quality?)` (JPEG data URL of the current frame), `pixels()` (RGBA), `info()`, `diagnostics()`, `routeHealth()` and `nodeCount()`. `frame`, `pixels`, `info` and `diagnostics` read the mounted app through the `app` option (a value or a getter), and fail with a named error until an app with `capture()` exists. Game-specific hooks go in `extras` and win on name clashes.

## Example

```ts
import { createAuraApp, createFixedStepLoop, installQaHooks, readQaParams } from "@aura3d/engine";

const config = readQaParams({
  seed: { type: "number", default: 1 },
  manual: { type: "flag" },
  warmup: { type: "number", default: 30 }
});

let app: AuraApp | undefined;
let ready = false;

const loop = createFixedStepLoop({
  manual: config.manual,          // manual: only hooks.stepFrames advances the sim
  isActive: () => ready,
  step: () => sim.advance(readInput()),
  render: () => draw()
});

const qa = installQaHooks("my-game", {
  ready: () => ready,
  seed: config.seed,
  state: () => sim.snapshot(),
  stepFrames: (n, input) => { for (let i = 0; i < n; i++) sim.advance(i === 0 ? { ...IDLE, ...input } : IDLE); draw(); },
  reset: (seed) => { sim = new Sim(seed ?? config.seed); draw(); },
  app: () => app
});

loop.start();
boot().catch((error) => { qa.reportError(error); throw error; });
```

A spec then reads `window.__AURA_MY_GAME__.stepFrames(120)` and compares `state()` with a recorded reference.

## Notes

- The hooks are plain data in, plain data out: never put engine objects in `state()`.
- `reportError` keeps the first error, so later noise cannot hide the cause.
- `manual` mode means the loop never advances on its own; use it for deterministic captures and replays.
- The loop drops backlog beyond `maxCatchUpSteps` instead of replaying it, so a stalled tab does not fast-forward the game.
