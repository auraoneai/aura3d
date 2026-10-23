# Runtime safety net (`@aura3d/debug`)

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

`installSafetyNet({ canvas })` samples a 16x16 copy of the canvas after drawn frames. When it stays black for about 23
consecutive samples the page reloads one rung down the ladder (`no-aa`, `no-post`, `aces-tone`, `no-env`, `no-shadow`,
`low-quality`), remembered in `sessionStorage`, and logs `SAFETY_BLACK_FRAME`. After a reload `SAFETY_COMPAT_MODE` names the
rung in force. Pass `safety: { ladder }` to change the rungs. `createBlackFrameWatch` and `isBlackFrame` are exported for
custom wiring.

## Diagnostics panel

`?diag=1` (or `safety: { panel: true }`) overlays the GPU renderer string, WebGL limits and extensions, canvas size, WebGPU
presence, engine draw calls and backend (from `app.diagnostics()`), shader compile/link failures, WebGL context loss, the
safety rung and switches, and the last console errors. `dispose()` restores every patched prototype and console method.

## Reporting

`AuraApp.diagnostics()` is a read-only snapshot, so the safety net does not write into it. It reports through the stable
console codes above, `net.report()` and `globalThis.__AURA_SAFETY__()`.
