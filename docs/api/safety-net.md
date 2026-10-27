# Runtime safety net (`@aura3d/debug`)

> three.js does not detect a black frame or contain a throwing frame callback. `installSafetyNet` detects black frames and reloads one quality rung down to recover, and `createFrameErrorBoundary` (also in `@aura3d/debug`) keeps the loop running when a frame step throws. Both are opt-in.

Real browsers and GPUs differ from the software renderers used in CI. A page can draw 123 calls and still present a black
frame on one driver, and the only evidence is a screenshot from the player. The safety net is an **opt-in** module that makes
those reports diagnosable and, where possible, self-correcting. It never runs unless you ask for it.

```ts
import { installSafetyNet } from "@aura3d/debug";

const net = installSafetyNet({ safety: true, canvas, app });
const { post, shadow, env, quality } = net.switches; // read before building the scene
// in your frame loop, after the frame is drawn:
net.sample(framesDrawn);
```

`safety` must be `true` or a settings object; with `false`/`undefined` the returned handle is inert (the URL switches are
still parsed so a game can read them unconditionally).

## Quality URL switches

`resolveQualitySwitches({ search? })` is pure and works on its own:

| Query | Effect on `switches` |
| --- | --- |
| `?post=0` `?shadow=0` `?env=0` `?sky=0` `?aa=0` | the matching boolean is `false` |
| `?quality=low` | `quality: "low"` |
| `?tm=aces` | `toneMapping: "aces"` |
| `?heal=0` | `heal: false` (turns the black-frame self-heal off) |
| `?diag=1` | `diag: true` (shows the panel when `panel` is `"query"`, the default) |

A game decides what each switch changes in its own options. Parameters implied by the current self-heal rung are merged
**under** explicit URL parameters, so an author's URL always wins.

## Black-frame self-heal

**Sampling happens in the task that drew the frame.** A WebGL canvas created without `preserveDrawingBuffer` (the default, and
what every showcase game uses) only holds its pixels until the browser composites the frame; read from any other task it
returns zeros. An earlier version of the guard sampled after every `requestAnimationFrame` callback, so on pages with several
callbacks per frame, or draws from timers, healthy games read black and were reloaded two or three rungs down (found on the
4.1.1 production build for Cross Hop, Iron Crown and Bunker Zero). `installFrameTap` fixes that: it wraps the GL draw calls
(`drawArrays`, `drawElements`, the instanced and `WEBGL_multi_draw` forms) and, for the first draw to the default framebuffer
in a task, queues a microtask that calls `onFrame(canvas)` after the drawing code has returned and before the browser
composites. Draws into an offscreen framebuffer do not count. The tap never renders, never changes context attributes and
only reports canvases of at least 128 x 96, so a minimap is never judged; the largest drawing canvas is the world view.
`installBlackFrameGuard({ sampling: "raf" })` keeps the old behaviour for pages without WebGL draw calls.

`installSafetyNet({ canvas })` (or `createBlackFrameWatch` directly) judges the canvas after each drawn frame and reloads one
rung down the ladder (`no-aa`, `no-post`, `aces-tone`, `no-env`, `no-shadow`, `low-quality`) only when the frame is **broken**:
the scene is drawing but the output is black. It is deliberately conservative, because a false positive reloads a healthy
page at lower quality:

- **Ready first.** Nothing is judged until the app is ready: the document has loaded, no loading overlay is visible
  (`#boot`, `#loading`, `.loading`, `[aria-busy="true"]` and similar), no asset fetches are in flight
  (`window.__aura3dInFlightByteFetches`), and your own `isReady()` (for example the app's `ready()` promise) agrees. Frames are
  counted from the moment the app became ready, as frames the app actually drew (not wall-clock time), so a slow CPU
  renderer waits longer.
- **Black, not dark.** The canvas is copied to a 48x32 grid with nearest-neighbour sampling (one texel per block, so thin
  bright features are not averaged away, and any HiDPI size reads the same). A frame is black only if at most 0.2 percent of
  the samples have a colour channel above 4. A dim but valid scene, or a frame with a real HUD drawn into the canvas, is not
  black. Minimap and HUD canvases are skipped when the world canvas is chosen.
- **Persistent.** Black must repeat for 12 consecutive samples (every 4th frame after 30 ready frames) and last for at least
  `max(4 s, 40 x the measured median frame time)`, so a 2-second-per-frame renderer waits 80 seconds. Pass `getDrawCalls` to also
  require the engine to report draw calls greater than zero.
- **Once per load.** The rung is stored in `sessionStorage` and advanced by exactly one per page load. The reason (black
  samples, duration, ready frames, lit texels, maximum channel, median frame time, draw calls) is stored with it, logged as
  `SAFETY_BLACK_FRAME`, and shown after the reload by `SAFETY_COMPAT_MODE` and by `?diag=1`.
- **Relaxes when healthy.** After three lit samples the watch drops to occasional sampling.

`watch.observation()` returns what it has seen (frames, ready frame, samples, black samples, last probe statistics, skips for
not-ready / no draw calls / hidden page, the reason). Pages that run on the engine's `a3d-qr` flag list use
`installBlackFrameGuard()`, which installs the frame tap, steps `-vfxFog`, then `-post`, then `-compiler`, honours
`?heal=0` and never rewrites an author-supplied `a3d-qr`, and publishes `window.__AURA3D_HEAL__` with a live `observation()`.
Pass `safety: { ladder }` to change the rungs. `isBlackFrame`, `analyseFrame`, `findWorldCanvas`, `hasVisibleLoadingOverlay`
`createBlackFrameWatch`, `installFrameTap` and `FrameTap` are exported for custom wiring.

## Diagnostics panel

`?diag=1` (or `safety: { panel: true }`) overlays the GPU renderer string, WebGL limits and extensions, canvas size, WebGPU
presence, engine draw calls and backend (from `app.diagnostics()`), shader compile/link failures, WebGL context loss, the
safety rung and switches, what the black-frame watch has seen and why it reloaded, and the last console errors. `dispose()` restores every patched prototype and console method.

## Reporting

`AuraApp.diagnostics()` is a read-only snapshot, so the safety net does not write into it. It reports through the stable
console codes above, `net.report()` and `globalThis.__AURA_SAFETY__()`.
