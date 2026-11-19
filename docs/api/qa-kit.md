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
| `installQaTelemetryHooks`, `createQaRunMonitor`, `findNonFinitePaths`, `hashQaPixels` | Step and frame timing, non-finite state paths, pixel hashes and stuck detection. See [Run telemetry](#run-telemetry-555). |
| `installVirtualGamepads` | Four scripted W3C `"standard"` gamepads. See [Virtual gamepads](#virtual-gamepads-555). |
| `createQaOfflineAudio`, `analyzeQaAudioSamples` | Clock-locked offline audio render and level, clipping, silence and onset analysis. See [Offline audio checks](#offline-audio-checks-555). |

`createAuraTuneOverlay` is in `@aura3d/engine/devtools`, not the root; see [Feel-tuning overlay](#feel-tuning-overlay-aura3denginedevtools-555).

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

## Run telemetry (5.5.5)

`installQaHooks` also attaches four telemetry hooks at runtime: `checkState()`, `measureFrame()`, `telemetry()` and
`resetTelemetry()`. `installQaTelemetryHooks` is the same call with those hooks in the returned type and an extra
`telemetry` option.

| Export | Signature | Purpose |
| --- | --- | --- |
| `installQaTelemetryHooks` | `<S, I = Record<string, unknown>, X extends object = {}>(name: string, options: QaTelemetryHooksOptions<S, I, X>): InstalledQaTelemetryHooks<S, I, X>` | `installQaHooks` with typed telemetry hooks. `options.telemetry` takes `QaRunMonitorOptions`. |
| `createQaRunMonitor` | `(options?: QaRunMonitorOptions): QaRunMonitor` | Standalone monitor for step cost versus GPU-flushed frame cost, first-seen non-finite state paths and input-aware stuck detection. |
| `findNonFinitePaths` | `(root: unknown, options?: QaFindNonFiniteOptions): Array<{ readonly path: string; readonly value: "NaN" \| "Infinity" \| "-Infinity" }>` | Cycle-safe walk that returns every path (`"player.vel.x"`, `"enemies[0].hp"`) holding `NaN` or `±Infinity`. |
| `hashQaPixels` | `(pixels: QaPixels): QaPixelDigest` | 8-character FNV-1a hash of the RGB bytes plus a `blank` flag (zero pixels, or every pixel the same RGB). |

`QaRunMonitorOptions`: `maxDepth` (default `4`), `maxKeys` per container (default `200`), `stuckAfterSteps` (default `600`)
and an injectable `now` clock. The monitor methods are `recordSteps(count, hasInput, run, readState?)`, `recordInput(count?)`,
`inspectState(state)`, `measurePixels(capture)`, `recordFrame(pixels, durationMs?)`, `snapshot()` and `reset()`.
`snapshot()` returns `{ steps, inputs, stepTiming, frameTiming, nonFinite, stuck }`. `stuck.stuck` turns true when the pixel
hash has not changed for `stuckAfterSteps` steps while new inputs kept arriving.

## Virtual gamepads (5.5.5)

`installVirtualGamepads(options?: QaVirtualGamepadsOptions): QaVirtualGamepads` replaces `navigator.getGamepads()` with four
W3C `"standard"` pads for headless runs. A slot stays `null` until its first button or axis input, then fires
`gamepadconnected`, as real browsers do.

| Method | Effect |
| --- | --- |
| `hold(slot, button, down)` | Press or release a button (`A`, `B`, `X`, `Y`, `LB`, `RB`, `LT`, `RT`, `Select`, `Start`, `L3`, `R3`, `Up`, `Down`, `Left`, `Right`, `Home`) on slot `0..3`. |
| `setAxis(slot, axis, value)` | Set axis `0..3` to a value in `[-1, 1]`. |
| `applyToken(token, down)` | Apply a replay token such as `"Pad1A"`, `"Pad2Left"`, `"Pad1TurnL"`, `"Pad1TurnR"`. D-pad tokens drive buttons 12 to 15 and left-stick axes 0 and 1; `TurnL` / `TurnR` drive right-stick axis 2. Returns `true` when the token matched. |
| `disconnect(slot)` | Disconnect a slot and fire `gamepaddisconnected`. |
| `releaseAll()` | Clear all buttons and axes without disconnecting. |
| `snapshot()` | The four-slot `getGamepads()` result. |
| `uninstall()` | Restore the original `navigator.getGamepads`. |

Options: `navigatorTarget` (default `navigator`), `eventTarget` (default `globalThis`) and `nowMs` (default `performance.now`).

## Offline audio checks (5.5.5)

| Export | Signature | Purpose |
| --- | --- | --- |
| `createQaOfflineAudio` | `(options?: QaOfflineAudioOptions): QaOfflineAudio` | An `OfflineAudioContext` harness to pass as `createGameAudio({ context })`. Its `currentTime` follows the simulation clock, and `AudioParam.value` writes are scheduled at that time instead of applying at `t = 0`. |
| `analyzeQaAudioSamples` | `(channels: readonly Float32Array[], sampleRate: number, durationSeconds?: number): QaAudioTelemetry` | Pure PCM analysis, the same math in Node and the browser. |

`QaOfflineAudioOptions`: `maxDurationSeconds` (clamped to `0.1..120`, default `10`), `sampleRate` (default `22050`),
`channels` (default `2`), `nowSeconds` (an external simulation clock) and `createOfflineContext` (a factory for tests or
shims). The returned harness has `context`, `currentTime`, `advance(dtSeconds)`, `setTime(seconds)` and
`render(durationSeconds?)`, which resolves to a `QaAudioTelemetry`:

| Field | Meaning |
| --- | --- |
| `durationSeconds`, `sampleRate`, `channels` | What was analysed. |
| `peakDb`, `rmsDb` | Peak and RMS level in dBFS (`-Infinity` when silent). |
| `clippedSamples` | Samples with `|sample| >= 1` across channels. |
| `silentWindowRatio` | Share of 100 ms windows below `-60 dBFS`. |
| `soundCount` | Sound onsets: 10 ms windows above `-40 dBFS`, more than twice the previous window, at least 50 ms apart. |
| `silent` | `true` when the peak is `0` or every 100 ms window is below `-60 dBFS`. |

## Feel-tuning overlay (`@aura3d/engine/devtools`, 5.5.5)

`createAuraTuneOverlay<S extends AuraTuneSchema>(options: AuraTuneOverlayOptions<S>): AuraTuneOverlay<S>` builds a dev
panel of sliders (`{ value, min, max, step, label? }`) and choice switches (`{ value, options, label? }`) from a schema.
Overrides are stored under `aura3d:tune:<id>` with the authored baseline (`{ value, was }`), so they are dropped
automatically when the source constant changes.

| Option | Default | Meaning |
| --- | --- | --- |
| `id` | required | Storage key suffix and diff header. |
| `schema` | required | Tuning entries in display order. |
| `onChange` | none | Called on every change from the UI, `set()` or `reset()`. |
| `host` | `document.body` | Mount element; `null` for headless, state-only use. |
| `toggleKey` | `"Backquote"` | `KeyboardEvent.code` that toggles the panel, or `false`. |
| `autoOpenParam` | `"tune"` | Query parameter that opens the panel on load, or `false`. |
| `search`, `storage`, `clipboard`, `eventTarget` | browser globals | Overrides for tests. `storage: null` turns persistence off. Changes also dispatch `CustomEvent("aura:tune")`. |
| `hideHint` | hidden under WebDriver or headless | Hides the corner hint. |

The handle exposes `values`, `baseline`, `element`, `isOpen`, `storageKey`, `open()`, `close()`, `toggle(force?)`,
`set(key, value)` (snapped to the schema, returns `true` when accepted), `save()` (persists and copies `diffBlock()` to the
clipboard, resolves `{ saved, copied, diff }`), `reset({ toBaseline? })`, `diffBlock()` and `dispose()`.

```ts
import { createAuraTuneOverlay } from "@aura3d/engine/devtools";

const tune = createAuraTuneOverlay({
  id: "my-game",
  schema: {
    jumpSpeed: { value: 7.5, min: 4, max: 12, step: 0.1 },
    camera: { value: "chase", options: ["chase", "side"] }
  }
});
export const jumpSpeed = (): number => tune.values.jumpSpeed;
```
