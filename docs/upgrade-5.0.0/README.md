# 5.0.x games upgrade guides

One guide per live game (`docs/workflows/game-inventory.json`, `kind: "game"`, `status: "live"`), generated from section 5 of `docs/project/5.0-games-and-examples-upgrade-plan.md`. `node tools/game-checks/run.mjs <slug>` (check `upgrade-guide`) warns while any `- [ ]` item is open, so tick an item only with its evidence (frames, test run, capture path).

Legend used in the checklists (from the plan): **A1..A18** are the adoption catalog IDs (plan section 4); **GC** = `node tools/game-checks/run.mjs <slug>`; **UT** = the game's targeted vitest folder; **CAP** = the parent's single coordinated ACR capture (`tests/browser/game-luma-capture.spec.ts`); **RG** = real-GPU pass (`tools/real-gpu/run.sh`) for any EXPERIMENTAL flag. W-1..W-8 are the shared work items (plan section 8).

Decision D1 (superseded by the owner decision of 2026-11-07): an EXPERIMENTAL 5.0 feature (WebGPU, worker rendering, reversed/log depth, wide gamut) is on by default in a game once it passes a real-GPU check there, with WebGL2 / standard depth kept as the automatic fallback and a query flag to opt out. Everything else stays behind the lab flags below.

## Lab flags (W-8)

Parser: `apps/showcase-port-shared/lab-flags.ts` (`parseLabFlags`, `readLabFlags`, `labAppOptions`, `labCameraOptions`, `resolveLabBackend`). Flags are off by default except where a game passed a real-GPU check and turned one on (owner decision 2026-11-07): reversed depth (`labCameraOptions(flags, "reversed")`, opt out with `?depth=standard`) in Ion Circuit, the other showcase games that pass it and the five new games (Shape Shift Sprint, Number Surge, Splat Turf, Polarity Orbs, Beat Hopper); the portable shader pilots in Lamplight Line and Duneglide (opt out with `?portable=0`); and the WebGPU backend in Chroma Roll, Dot Dash 3D, Cumulus Dash and Splat Turf (`labAppOptions(flags, { backend: "auto" })`, opt out with `?backend=webgl2`). Unknown values are ignored and listed in `flags.ignored`.

| Query | Effect | Option fragment it produces | Label |
|---|---|---|---|
| `?backend=auto` or `?backend=webgpu` | request the WebGPU backend, WebGL2 fallback kept | `renderer: { backend, allowFallback: true }` | EXPERIMENTAL |
| `?backend=webgl2` | force WebGL2 (the opt-out for games whose default is `auto`) | no `renderer` fragment (WebGL2 is the engine default) | opt-out |
| `?worker=1` | worker-owned rendering, main-thread fallback | `worker: { fallback: "main-thread" }` (the game supplies `createWorker`) | EXPERIMENTAL |
| `?depth=reversed` or `?depth=logarithmic` | camera depth mode | `camera({ depth: { mode, allowFallback: true } })` via `labCameraOptions` | EXPERIMENTAL |
| `?gamut=p3` | Display-P3 output (falls back to sRGB, reported in diagnostics) | `output: { outputColorSpace: "display-p3" }` | EXPERIMENTAL |

```ts
import { labAppOptions, labCameraOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";
const lab = readLabFlags();
const app = createAuraApp(canvas, { scene, ...labAppOptions(lab) /* add worker.createWorker yourself */ });
// A game whose WebGPU check passed: labAppOptions(lab, { backend: "auto", createWorker }) -> renderer { backend: "auto", allowFallback: true }
// unless ?backend=webgl2. Code that switches on the backend (point-sprite quads, async frames) uses resolveLabBackend(lab, default).
// camera({ ...labCameraOptions(lab, "reversed") })
```

`?worker=0` is not a flag and is reported as ignored. `?depth=standard` and `?backend=webgl2` are the opt-outs for games that default to reversed depth or WebGPU. A game that wires a flag must also show the active backend: use the report below.

### WebGPU default per game (real-GPU check 2026-11-08)

Method: headless Chrome 157 on the real GPU (Apple M4 Max, Metal ANGLE for WebGL2, Dawn for WebGPU), 1280x720, title screen, page settled 16 s, then 3 s of `requestAnimationFrame`; the number used is the engine's own rendered-frame rate (`app.diagnostics().fps`), because some games skip renders while an async frame is in flight and the rAF count then overstates them. 2 to 5 paired runs per game, backend order alternated, another agent's browser work kept the machine loaded (1-minute load 5 to 80, noted per run), so single numbers are noisy and the ratio (geometric mean of the paired WebGPU/WebGL2 ratios) is what decides. Rendering correctness comes from the earlier 25-game sweep (same draws, 0 errors, static diff 0.1-2.8) plus a default-vs-`?backend=webgl2` capture of the three switched games (static diff 0.3, 2.4, 3.1; Cumulus Dash differs only by its moving title camera). Absolute rates are low because this run is headless and loaded; they are not a performance claim.

Rule: WebGPU becomes the default (`backend: "auto"`, WebGL2 fallback kept) only where it renders correctly and runs at >= 0.9x WebGL2.

| Game | WebGL2 fps (median) | WebGPU fps (median) | WebGPU/WebGL2 | Default |
|---|---|---|---|---|
| Chroma Roll | 15.4 | 24.8 | 1.04 (n=5) | WebGPU (auto) |
| Dot Dash 3D | 3.4 | 4.0 | 1.04 (n=5) | WebGPU (auto) |
| Cumulus Dash | 11.4 | 8.3 | 0.90 (n=5, borderline) | WebGPU (auto) |
| The Bellkeeper's Walk | 21.1 | 21.8 | 0.87 (n=5) | WebGL2 |
| Near misses: Saltwind Highway 0.79, Serpentine Sky Run 0.82, Ion Circuit 0.81, Cross Hop 0.78, Slingshot Siege 0.74, Top Tennis 0.73, Shadowstep Gauntlet 0.72 | | | < 0.9 | WebGL2 |
| Further below: Roadster Rush 0.69, Teleoperator 0.69, Iron Crown 0.67, Duneglide 0.66, Aura FC 0.65, Aura Diamond 0.62, Gridlock Courier 0.58, Aura Links 0.57, Thermal Drift (showcase-heatsink) 0.54, Aura Hoops 0.50, Bunker Zero 0.44, Craterline GP 0.43, Pip's Big Leap 0.42, Lamplight Line 0.28 | | | < 0.9 | WebGL2 |
| Splat Turf | 10.7 | 10.2 | 0.97 median, geomean 0.98 (n=16, in play, never capped) | WebGPU (auto) |
| Beat Hopper | 59.9 | 56.6 | 0.92 median, geomean 0.91 (n=16), but 0.88 median on the 8 pairs where WebGL2 was below the 60 fps cap (capped pairs overstate the ratio) | WebGL2 |
| Shape Shift Sprint 0.86 (n=12), Polarity Orbs 0.86 (n=10), Number Surge 0.71 (n=6) (medians) | 57.6 / 58.6 / 60.1 | 44.1 / 50.2 / 41.5 | < 0.9 | WebGL2 |

The five new games render the same frame on both backends with their WGSL twins (title-frame mean abs diff 0.2-0.9/255, under 1% of pixels > 16) and idle on the title screen, so they were timed in play (`?autostart=1&autopilot=1&dpr=1&seed=1`, `app.diagnostics().fps`). WebGL2 often sits at the 60 fps vsync cap there, so a WebGPU/WebGL2 ratio against a capped run is an upper bound; Beat Hopper was first turned on at 0.94 (n=5, four of five pairs capped), then reverted by the independent review: across 16 pairs its median is 0.92, but that leans on pairs where WebGL2 sat at the 60 fps cap; its 8 uncapped pairs give 0.88, below the rule. Splat Turf never reaches the cap (5 to 10 fps on both).

Dot Dash 3D spends most of each WebGL2 frame re-capturing its `update: "once"` reflection probe (6 faces plus a CPU prefilter, from a CPU profile), so its low rate measures that engine cost more than the backend. Thermal Drift and Pip's Big Leap are also 2 to 5 fps headless for reasons not yet profiled.

## Shared helpers added in Wave 0

- `apps/showcase-port-shared/backend-report.ts` (W-6): `readBackendSelection`, `formatBackendSelection`, `readReadiness`, `publishBackendReport(app, hook)`. `?diag=1` (`diag.ts`) now prints `backend requested->active (reason)` when a game's QA hook exposes `backendSelection`. `apps/common/src/runtime.ts` publishes `backendSelection` and `readiness` on `window.__a3dProductionRuntime`.
- `apps/showcase-port-shared/loading-progress.ts` (W-6, A1): `createLoadingProgress({ shell, element })` with `track(promise, weight)`, `set`, `done`; the bar style `.aura3d-loading` is in `quickbar.css`. Not wired into any game yet (per-game lanes do that).
- `tools/agent-examples/refresh-catalog-digests.mjs` (W-5): rewrites only the stale `sha256` fields of `tests/fixtures/native-examples-catalog/expectations.json` after a source edit (`--check` to list without writing). Run it from a checkout where git-lfs assets are materialised, otherwise pointer files look stale. Then run `tests/unit/tools/native-examples-catalog-fixture.test.ts`.
- `node tools/game-checks/run.mjs <slug> --only no-removed-5-0-apis` (W-2): errors on imports of the 38 removed root values (B14), `createGame` from the root (B1) and the 9 removed `@aura3d/engine/*` subpaths (B15).

## Games

| Game | Guide |
|---|---|
| Aura Slam 3D | [top-tennis](./top-tennis.md) |
| Apex Overdrive | [roadster-rush](./roadster-rush.md) |
| Thermal Drift | [heatsink](./heatsink.md) |
| Grid Dispatch | [teleoperator](./teleoperator.md) |
| Iron Crown | [iron-crown](./iron-crown.md) |
| Pip's Big Leap | [pips-big-leap](./pips-big-leap.md) |
| Aura Hoops 3D | [aura-hoops-3d](./aura-hoops-3d.md) |
| Aura Diamond 3D | [aura-diamond-3d](./aura-diamond-3d.md) |
| Aura FC 3D | [aura-fc-3d](./aura-fc-3d.md) |
| Aura Links 3D | [aura-links-3d](./aura-links-3d.md) |
| Bunker Zero | [bunker-zero](./bunker-zero.md) |
| Slingshot Siege | [slingshot-siege](./slingshot-siege.md) |
| Glint Courier | [dot-dash-3d](./dot-dash-3d.md) |
| Cross Hop | [cross-hop](./cross-hop.md) |
| Craterline GP | [strange-orbit-port](./strange-orbit-port.md) |
| Splat | [splat-rush-port](./splat-rush-port.md) |
| Serpentine Sky Run | [serpentine-sky-run-port](./serpentine-sky-run-port.md) |
| Gridlock Courier | [drift-and-deliver-port](./drift-and-deliver-port.md) |
| Ion Circuit | [heatsink-port](./heatsink-port.md) |
| Shadowstep Gauntlet | [ninja-runner-port](./ninja-runner-port.md) |
| Lamplight Line | [last-train-port](./last-train-port.md) |
| Saltwind Highway | [roadster-hours-port](./roadster-hours-port.md) |
| The Bellkeeper's Walk | [where-the-wind-wanders-port](./where-the-wind-wanders-port.md) |
| Duneglide | [silt-and-signal-port](./silt-and-signal-port.md) |
| Cumulus Dash | [cloud-runner-port](./cloud-runner-port.md) |

Neutral-environment exposure per game (W-4 analysis): [neutral-environment-exposure.md](./neutral-environment-exposure.md).
