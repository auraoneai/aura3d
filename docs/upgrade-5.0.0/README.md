# 5.0.x games upgrade guides

One guide per live game (`docs/workflows/game-inventory.json`, `kind: "game"`, `status: "live"`), generated from section 5 of `docs/project/5.0-games-and-examples-upgrade-plan.md`. `node tools/game-checks/run.mjs <slug>` (check `upgrade-guide`) warns while any `- [ ]` item is open, so tick an item only with its evidence (frames, test run, capture path).

Legend used in the checklists (from the plan): **A1..A18** are the adoption catalog IDs (plan section 4); **GC** = `node tools/game-checks/run.mjs <slug>`; **UT** = the game's targeted vitest folder; **CAP** = the parent's single coordinated ACR capture (`tests/browser/game-luma-capture.spec.ts`); **RG** = real-GPU pass (`tools/real-gpu/run.sh`) for any EXPERIMENTAL flag. W-1..W-8 are the shared work items (plan section 8).

Decision D1 (superseded by the owner decision of 2026-11-07): an EXPERIMENTAL 5.0 feature (WebGPU, worker rendering, reversed/log depth, wide gamut) is on by default in a game once it passes a real-GPU check there, with WebGL2 / standard depth kept as the automatic fallback and a query flag to opt out. Everything else stays behind the lab flags below.

## Lab flags (W-8)

Parser: `apps/showcase-port-shared/lab-flags.ts` (`parseLabFlags`, `readLabFlags`, `labAppOptions`, `labCameraOptions`, `resolveLabBackend`). Flags are off by default except where a game passed a real-GPU check and turned one on (owner decision 2026-11-07): reversed depth (`labCameraOptions(flags, "reversed")`, opt out with `?depth=standard`) in Ion Circuit, the other showcase games that pass it and the five new games (Shape Shift Sprint, Number Surge, Splat Turf, Polarity Orbs, Beat Hopper); the portable shader pilots in Lamplight Line and Duneglide (opt out with `?portable=0`); and the WebGPU backend in Chroma Roll, Dot Dash 3D, Cumulus Dash, Cross Hop, Aura Hoops 3D, Aura FC 3D, Iron Crown, Ion Circuit, Aura Diamond 3D, Saltwind Highway, Top Tennis, Bunker Zero, Serpentine Sky Run, The Bellkeeper's Walk and Splat Turf, and since WebGPU perf round 2 (5.4.0) Slingshot Siege, Duneglide, Beat Hopper, Shape Shift Sprint, Polarity Orbs and Number Surge (`labAppOptions(flags, { backend: "auto" })`, opt out with `?backend=webgl2`). Unknown values are ignored and listed in `flags.ignored`.

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
| Slingshot Siege | 18.5 | 16.6 | 0.74 | 0.90 (0.90, 0.93, 0.89); review 0.89 (n=5) | WebGPU (auto, round 2: 0.93) |
| Duneglide | 18.3 | 17.0 | 0.66 | 0.90 (0.94, 0.89, 0.90); review 0.89 (n=5) | WebGPU (auto, round 2: 0.95) |
| Gridlock Courier | 20.7 | 18.4 | 0.58 | 0.89 | WebGL2 |
| Roadster Rush | 53.3 | 45.4 | 0.69 | 0.88 | WebGL2 |
| Teleoperator | 21.4 | 17.9 | 0.69 | 0.83 | WebGL2 |
| Aura Links 3D | 29.1 | 23.7 | 0.57 | 0.81 | WebGL2 |
| Thermal Drift (showcase-heatsink) | 18.1 | 14.4 | 0.54 | 0.79 | WebGL2 |
| Craterline GP | 80.4 | 61.9 | 0.43 | 0.77 | WebGL2 |
| Pip's Big Leap | 13.4 | 10.1 | 0.42 | 0.76 | WebGL2 |
| Lamplight Line (30 s settle) | 5.3 | 4.1 | 0.28 | 0.75 (0.75, 0.89; one run still in its start stall) | WebGL2 |
| Shadowstep Gauntlet | 74.0 | 56.7 | 0.72 | 0.75 | WebGL2 |

Independent review re-measure (same tools, fresh build of the lane head, 1-minute load 1.7 to 5.4, 3 paired runs, 5 for the borderline games; WebGPU/WebGL2 median): Aura FC 3D 1.09, Aura Hoops 3D 1.06, Cross Hop 1.06, Ion Circuit 0.98, Iron Crown 0.97, Saltwind Highway 0.94, Aura Diamond 3D 0.94, Bunker Zero 0.93, The Bellkeeper's Walk 0.92, Serpentine Sky Run 0.92 (n=5), Top Tennis 0.91; below the rule: Slingshot Siege 0.89 (0.90, 0.91, 0.89, 0.88, 0.89), Duneglide 0.89 (0.88, 0.89, 0.92, 0.89, 0.93), Gridlock Courier 0.89 (n=5), Roadster Rush 0.85, Craterline GP 0.77. Slingshot Siege and Duneglide therefore stay on WebGL2. WebGL2 frames of the lane head match the base build within the run-to-run noise of each scene (static scenes: Ion Circuit 0.59 vs 0.59 noise, Serpentine Sky Run 0.09 vs 0.09, Bunker Zero 0.02 vs 0.02; animated scenes differ only by animation phase), and every switched game's default page reports the WebGPU backend with 0 errors.

Five new games (WGSL twins for their runner-kit and scenery materials, separate in-play sweep before the draw-overhead work):

| Game | WebGL2 fps (median) | WebGPU fps (median) | WebGPU/WebGL2 | Default |
|---|---|---|---|---|
| Splat Turf | 10.7 | 10.2 | 0.97 median, geomean 0.98 (n=16, in play, never capped) | WebGPU (auto) |
| Beat Hopper | 59.9 | 56.6 | 0.92 median, geomean 0.91 (n=16), but 0.88 median on the 8 pairs where WebGL2 was below the 60 fps cap (capped pairs overstate the ratio) | WebGPU (auto, round 2: 0.95) |
| Shape Shift Sprint 0.86 (n=12), Polarity Orbs 0.86 (n=10), Number Surge 0.71 (n=6) (medians) | 57.6 / 58.6 / 60.1 | 44.1 / 50.2 / 41.5 | < 0.9; round 2: 0.96 / 0.93 / 0.92 | WebGPU (auto, round 2) |

The five new games render the same frame on both backends with their WGSL twins (title-frame mean abs diff 0.2-0.9/255, under 1% of pixels > 16) and idle on the title screen, so they were timed in play (`?autostart=1&autopilot=1&dpr=1&seed=1`, `app.diagnostics().fps`). WebGL2 often sits at the 60 fps vsync cap there, so a WebGPU/WebGL2 ratio against a capped run is an upper bound; Beat Hopper was first turned on at 0.94 (n=5, four of five pairs capped), then reverted by the independent review: across 16 pairs its median is 0.92, but that leans on pairs where WebGL2 sat at the 60 fps cap; its 8 uncapped pairs give 0.88, below the rule. Splat Turf never reaches the cap (5 to 10 fps on both).

### WebGPU perf round 2 (5.4.0, real-GPU check 2026-11-08 evening)

Profiled with Chrome CPU profiles (Pip's Big Leap, Shadowstep Gauntlet, Craterline GP). Fixed: the PRD-02 shadow system was rebuilt every frame (camera-following normal bias in its config key, so new depth programs and pipelines each frame, both backends); generated-PBR uniform packing (8 KB per draw) copied every uniform and sliced ~200 rows, now packed in place (55 -> 25 us per call in a node microbenchmark, same bytes and errors); portable/f32 uniform writes go through a typed view with a cached member set; post-chain stage targets and fullscreen uniform buffers are pooled per descriptor instead of allocated and fence-retired per pass; post passes keep a validation error scope only for their first four uses (one chain-wide scope for auto-exposure frames); prepared shadow plans are validated three times per frame instead of five; the contact-shadow provider proof is taken once per forward pass instead of three times per draw; `drawCallCount()` on the WebGPU device (the per-stage trace was building full diagnostics several times per frame).

Method as above (1280x720, title screen; the five new games in play with `?autostart=1&autopilot=1&dpr=1&seed=1`), lane build of `exp/54b-wgpu-perf2`, 6 paired runs per game (10 for the borderline Gridlock Courier, Roadster Rush and Aura Links 3D), backend order alternated; rounds 4 onwards waited for a 1-minute load below 8 (logged per run, 3.3 to 23.7 for most pairs, a few loaded pairs left in). Lamplight Line and Pip's Big Leap: 5 paired runs from the first, ungated sweep (two of them at load 30 to 59), clearly below the rule. Median WebGPU/WebGL2:

| Game | WebGL2 fps (median) | WebGPU fps (median) | Round 1 | Round 2 | Default |
|---|---|---|---|---|---|
| Shape Shift Sprint (in play) | 72.4 | 68.6 | 0.86 | 0.96 | WebGPU (auto) |
| Duneglide | 19.1 | 18.1 | 0.89 | 0.95 | WebGPU (auto) |
| Beat Hopper (in play) | 73.1 | 69.1 | 0.88 | 0.95 | WebGPU (auto) |
| Slingshot Siege | 19.4 | 17.3 | 0.89 | 0.93 | WebGPU (auto) |
| Polarity Orbs (in play) | 62.5 | 57.8 | 0.86 | 0.93 | WebGPU (auto) |
| Number Surge (in play) | 110.0 | 100.5 | 0.71 | 0.92 | WebGPU (auto) |
| Gridlock Courier (n=10) | 22.0 | 19.9 | 0.89 | 0.90 (0.69 to 0.94) | WebGL2 (borderline, not switched) |
| Roadster Rush (n=10) | 60.7 | 52.7 | 0.85 | 0.90 (0.75 to 1.03) | WebGL2 (borderline, not switched) |
| Shadowstep Gauntlet | 61.7 | 55.8 | 0.75 | 0.88 | WebGL2 |
| Thermal Drift (showcase-heatsink) | 23.6 | 20.8 | 0.79 | 0.87 | WebGL2 |
| Craterline GP | 79.3 | 68.6 | 0.77 | 0.87 | WebGL2 |
| Teleoperator | 21.9 | 19.5 | 0.83 | 0.86 | WebGL2 |
| Aura Links 3D (n=10) | 36.5 | 30.2 | 0.81 | 0.84 | WebGL2 |
| Lamplight Line (n=5) | 5.1 | 4.0 | 0.75 | 0.84 | WebGL2 |
| Pip's Big Leap (n=5) | 15.2 | 13.3 | 0.76 | 0.81 | WebGL2 |

Only games whose median clears 0.9 with margin were switched (the round-1 review reverted two games at 0.89 to 0.90). Rendering: reduced-motion captures of the six switched games, default page vs `?backend=webgl2`, report the WebGPU backend by default with 0 errors and match (mean abs diff 0.17 to 2.4/255); their WebGL2 frames match the 5.3.0 base build within run-to-run noise (Shape Shift Sprint 0.09 vs 0.11 noise, Slingshot Siege 5.05 vs 3.99 for its animated scene). The remaining gap is CPU per draw on the WebGPU path (generated-PBR packing is still the largest WebGPU-only cost in Pip's Big Leap, about 6% of main-thread time) and shows most in high-frame-rate scenes. Absolute rates are headless; they are not a performance claim.

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
