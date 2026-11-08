# 5.0.x games upgrade guides

One guide per live game (`docs/workflows/game-inventory.json`, `kind: "game"`, `status: "live"`), generated from section 5 of `docs/project/5.0-games-and-examples-upgrade-plan.md`. `node tools/game-checks/run.mjs <slug>` (check `upgrade-guide`) warns while any `- [ ]` item is open, so tick an item only with its evidence (frames, test run, capture path).

Legend used in the checklists (from the plan): **A1..A18** are the adoption catalog IDs (plan section 4); **GC** = `node tools/game-checks/run.mjs <slug>`; **UT** = the game's targeted vitest folder; **CAP** = the parent's single coordinated ACR capture (`tests/browser/game-luma-capture.spec.ts`); **RG** = real-GPU pass (`tools/real-gpu/run.sh`) for any EXPERIMENTAL flag. W-1..W-8 are the shared work items (plan section 8).

Decision D1: EXPERIMENTAL 5.0 features (WebGPU, worker rendering, reversed/log depth, wide gamut) never ship as a game default. They are reachable only through the lab flags below.

## Lab flags (W-8)

Parser: `apps/showcase-port-shared/lab-flags.ts` (`parseLabFlags`, `readLabFlags`, `labAppOptions`, `labCameraOptions`). Flags are off by default except where a game passed a real-GPU check and turned one on (owner decision 2026-11-07): reversed depth in Ion Circuit (`labCameraOptions(flags, "reversed")`, opt out with `?depth=standard`) and the portable shader pilots in Lamplight Line and Duneglide (opt out with `?portable=0`). Unknown values are ignored and listed in `flags.ignored`.

| Query | Effect | Option fragment it produces | Label |
|---|---|---|---|
| `?backend=auto` or `?backend=webgpu` | request the WebGPU backend, WebGL2 fallback kept | `renderer: { backend, allowFallback: true }` | EXPERIMENTAL |
| `?worker=1` | worker-owned rendering, main-thread fallback | `worker: { fallback: "main-thread" }` (the game supplies `createWorker`) | EXPERIMENTAL |
| `?depth=reversed` or `?depth=logarithmic` | camera depth mode | `camera({ depth: { mode, allowFallback: true } })` via `labCameraOptions` | EXPERIMENTAL |
| `?gamut=p3` | Display-P3 output (falls back to sRGB, reported in diagnostics) | `output: { outputColorSpace: "display-p3" }` | EXPERIMENTAL |

```ts
import { labAppOptions, labCameraOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";
const lab = readLabFlags();
const app = createAuraApp(canvas, { scene, ...labAppOptions(lab) /* add worker.createWorker yourself */ });
// camera({ ...labCameraOptions(lab) })
```

`?backend=webgl2`, `?worker=0` and `?depth=standard` are not flags (they are the defaults) and are reported as ignored. A game that wires a flag must also show the active backend: use the report below.

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
