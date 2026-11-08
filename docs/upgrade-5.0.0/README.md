# 5.0.x games upgrade guides

One guide per live game (`docs/workflows/game-inventory.json`, `kind: "game"`, `status: "live"`), generated from section 5 of `docs/project/5.0-games-and-examples-upgrade-plan.md`. `node tools/game-checks/run.mjs <slug>` (check `upgrade-guide`) warns while any `- [ ]` item is open, so tick an item only with its evidence (frames, test run, capture path).

Legend used in the checklists (from the plan): **A1..A18** are the adoption catalog IDs (plan section 4); **GC** = `node tools/game-checks/run.mjs <slug>`; **UT** = the game's targeted vitest folder; **CAP** = the parent's single coordinated ACR capture (`tests/browser/game-luma-capture.spec.ts`); **RG** = real-GPU pass (`tools/real-gpu/run.sh`) for any EXPERIMENTAL flag. W-1..W-8 are the shared work items (plan section 8).

Decision D1 (superseded by the owner decision of 2026-11-07): an EXPERIMENTAL 5.0 feature (WebGPU, worker rendering, reversed/log depth, wide gamut) is on by default in a game once it passes a real-GPU check there, with WebGL2 / standard depth kept as the automatic fallback and a query flag to opt out. Everything else stays behind the lab flags below.

## Lab flags (W-8)

Parser: `apps/showcase-port-shared/lab-flags.ts` (`parseLabFlags`, `readLabFlags`, `labAppOptions`, `labCameraOptions`, `resolveLabBackend`). Flags are off by default except where a game passed a real-GPU check and turned one on (owner decision 2026-11-07): reversed depth (`labCameraOptions(flags, "reversed")`, opt out with `?depth=standard`) in Ion Circuit, the other showcase games that pass it and the five new games (Shape Shift Sprint, Number Surge, Splat Turf, Polarity Orbs, Beat Hopper); the portable shader pilots in Lamplight Line and Duneglide (opt out with `?portable=0`); and the WebGPU backend in Chroma Roll, Dot Dash 3D and Cumulus Dash (`labAppOptions(flags, { backend: "auto" })`, opt out with `?backend=webgl2`). Unknown values are ignored and listed in `flags.ignored`.

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

### WebGPU default per game (real-GPU check 2026-11-08, after the WebGPU draw-overhead work)

Method: headless Chrome on the real GPU (Apple M4 Max, Metal ANGLE for WebGL2, Dawn for WebGPU), 1280x720, production marketing build, title screen, page settled 14 s, then 3 s of `requestAnimationFrame`; the number used is the engine's own rendered-frame rate (`app.diagnostics().fps`). Three paired runs per game in one sweep (backend order alternated per round and game), the median of the three WebGPU/WebGL2 ratios decides. Other agents' work kept the machine loaded (1-minute load 2.4 to 42, logged per run with the raw JSON). Lamplight Line was measured separately with a 30 s settle because its WebGPU start can stall for 15 s or more. Rendering correctness: a reduced-motion WebGL2 vs WebGPU capture of all 25 games (0 errors, static diff 0.1 to 7.2; Cross Hop differs only because its idle eagle sequence is further along) plus a default vs `?backend=webgl2` capture of every newly switched game. Absolute rates are headless and loaded; they are not a performance claim.

Rule: WebGPU becomes the default (`backend: "auto"`, WebGL2 fallback kept, `?backend=webgl2` opts out) only where it renders correctly and runs at >= 0.9x WebGL2.

The earlier ratios (0.28x to 0.88x in all but three games) were mostly WebGPU device overhead per draw: every draw created, wrote, submitted and fence-retired its own uniform buffer, created a sampler and a bind group, rescanned its index buffer and opened its own command encoder, render pass and queue submission (Craterline GP: about 225 of each per frame). Those are now pooled, cached or batched (see the CHANGELOG, "WebGPU draw overhead").

| Game | WebGL2 fps (median) | WebGPU fps (median) | Before | After (n=3) | Default |
|---|---|---|---|---|---|
| Cross Hop | 53.2 | 58.3 | 0.78 | 1.12 | WebGPU (auto) |
| Aura Hoops 3D | 29.7 | 32.3 | 0.50 | 1.09 | WebGPU (auto) |
| Aura FC 3D | 20.9 | 22.8 | 0.65 | 1.09 | WebGPU (auto) |
| Dot Dash 3D | 6.4 | 6.8 | 1.04 | 1.06 | WebGPU (auto, since 61d51c034) |
| Cumulus Dash | 16.2 | 16.8 | 0.90 | 1.04 | WebGPU (auto, since 61d51c034) |
| Chroma Roll | 29.6 | 30.1 | 1.04 | 0.99 | WebGPU (auto, since 61d51c034) |
| Iron Crown | 54.1 | 52.8 | 0.67 | 0.98 | WebGPU (auto) |
| Ion Circuit | 22.0 | 21.1 | 0.81 | 0.97 | WebGPU (auto) |
| Aura Diamond 3D | 33.8 | 31.8 | 0.62 | 0.95 | WebGPU (auto) |
| Saltwind Highway | 15.9 | 15.2 | 0.79 | 0.94 | WebGPU (auto) |
| Top Tennis (Aura Slam) | 28.8 | 27.1 | 0.73 | 0.93 | WebGPU (auto) |
| Bunker Zero | 10.9 | 10.2 | 0.44 | 0.93 | WebGPU (auto) |
| Serpentine Sky Run | 27.1 | 25.1 | 0.82 | 0.93 | WebGPU (auto) |
| The Bellkeeper's Walk | 35.1 | 33.6 | 0.87 | 0.93 | WebGPU (auto) |
| Slingshot Siege | 18.5 | 16.6 | 0.74 | 0.90 (0.90, 0.93, 0.89; borderline) | WebGPU (auto) |
| Duneglide | 18.3 | 17.0 | 0.66 | 0.90 (0.94, 0.89, 0.90; borderline) | WebGPU (auto) |
| Gridlock Courier | 20.7 | 18.4 | 0.58 | 0.89 | WebGL2 |
| Roadster Rush | 53.3 | 45.4 | 0.69 | 0.88 | WebGL2 |
| Teleoperator | 21.4 | 17.9 | 0.69 | 0.83 | WebGL2 |
| Aura Links 3D | 29.1 | 23.7 | 0.57 | 0.81 | WebGL2 |
| Thermal Drift (showcase-heatsink) | 18.1 | 14.4 | 0.54 | 0.79 | WebGL2 |
| Craterline GP | 80.4 | 61.9 | 0.43 | 0.77 | WebGL2 |
| Pip's Big Leap | 13.4 | 10.1 | 0.42 | 0.76 | WebGL2 |
| Lamplight Line (30 s settle) | 5.3 | 4.1 | 0.28 | 0.75 (0.75, 0.89; one run still in its start stall) | WebGL2 |
| Shadowstep Gauntlet | 74.0 | 56.7 | 0.72 | 0.75 | WebGL2 |
| Shape Shift Sprint, Number Surge, Splat Turf, Polarity Orbs, Beat Hopper | | | n/a | n/a | WebGL2: `?backend=webgpu` falls back cleanly (`CUSTOM_SHADER_WGSL_MISSING`, about 30 runner-kit / scenery GLSL materials per game have no WGSL twin) |

The ratio depends on machine load: with little contention the high-frame-rate games (Craterline GP, Shadowstep Gauntlet, Roadster Rush) show WebGPU's remaining fixed per-draw cost, while an earlier sweep under heavy load had Craterline GP at 1.51x. Lamplight Line and Dot Dash 3D re-capture their `update: "once"` reflection probes on every frame (six faces plus a CPU prefilter) on both backends; on WebGPU each face is an asynchronous readback, and Lamplight Line's first WebGPU frames can still stall while Metal compiles its pipelines.

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
