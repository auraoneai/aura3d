# prd07-vfx triage — run 38086978485 (main 503624cf2, push, GitHub macos-14)

Row: **07 CI-rerun** (PRD-16 §4.7). First `prd07-vfx.yml` run on main that executes jobs
(#841 made the workflow parse). One line per red job: first error, attributed file:line.
Status is updated as jobs complete; a job not listed below had not completed at writing.

| Job | Job id | Result | First error | Attributed to |
|---|---|---|---|---|
| mobile | 114315418024 | failure (8/8 specs) | `TimeoutError: page.waitForFunction: Timeout 90000ms exceeded` at `juice-automount.spec.ts:41`; every spec times out the same way, including the flags-none sentinels | `tests/browser/example-dev-server.ts:96` (lane 15), see below |
| unit | 114315418017 | success | — | — |
| grep-gate | — | success | — | — |
| bake | — | success | — | — |
| capture | 114315418050 | failure | `09-outdoor-environment` aura3d `capture-timeout` (240 s `waitForFunction`, `capture.mjs:156`); same for 17 and 18 | see "capture" below; the `none` arm never ran |
| typecheck, browser, games | — | PENDING (queued on macos-14 at 2026-10-11 ~06:30Z) | — | to be filled when the jobs complete |

## capture — vite build OK; only 4 of 21 scenes captured; 3 base scenes time out

- **07-BUILD / T0-23: verified.** `vite build --config benchmarks/quality-rebuild/vite.config.ts`
  succeeded ("built in 8.87s"), so `@aura3d/rendering/world` resolves.
- **Lane scenes dropped.** The log reads `4 scenes x aura3d+three`. `capture.mjs:445` keeps only the
  `SCENE_LIST` ids present in the page's `window.__QR_SCENES__` (`ACTIVE_SCENE_IDS`). The C-30
  registry (`benchmarks/quality-rebuild/shared/registry.ts:90-113`) quarantined all 17 prd07 scenes:
  - `missing-adapter`: the adapters were `{aura3d,three}/scenes/prd07/prd07-<slug>.ts`, but
    `adapterPath()` (`registry.ts:69-74`) resolves `prd07/<slug>.ts`.
  - after the rename, `missing-registry-fields: masks,brokenControls`: the spec base
    (`benchmarks/quality-rebuild/scenes/prd07/specs.ts` `base()`) set neither.
  - The four Aura-only scenes (impact-library, trails-beams, fog-transition, underwater) also have
    no three adapter.
  - Lane-07 fix: adapter rename + both fields. 13/17 scenes become active
    (`tests/qr/prd07/unit/scene-registry.test.ts`). The Aura-only four need a registry or adapter
    decision.
- **Base scenes under `vfx,vfx.sky,vfx.fog,vfx.volumetric,vfx.decals`:** aura3d timed out on
  09-outdoor-environment (294 s), 17-large-environment (310 s) and 18-game-scene (271 s).
  14-particles reached ready only after 132 s. three.js was ready on all four in under 5 s.
  - Not yet attributable: the `Capture (flags none)` step had no `if: always()` and was skipped
    after the vfx arm failed. The step now runs unconditionally.
  - The `vfx-attribution` job (`$ALL` vs `$ALL,-vfx`) answers T0-34 on the next main run.

## mobile — 8/8 `waitForFunction` timeouts

Failed specs, with the first frame of each:
- `juice-automount.spec.ts:39` (`:41`) and `:54` (`:56`, flags none)
- `particles-production.spec.ts:43` (`:45`) and `:61` (`:63`, flags none)
- `sky-background.spec.ts:54` and `:64` (`run` at `:46`)
- `sky-daynight-identity.spec.ts:59` and `:69` (`run` at `:51`)

Why this is a harness load failure, not rendering:
- The flags-none sentinels time out exactly like the flag-on specs.
- The #528 `mountReady` race (`tests/qr/prd07/browser/mount-timing.ts`, 20 s) never publishes
  `status: "error"`, so the harness module never evaluated.

Root cause (Node-only local probe of `startExampleDevServer` on 503624cf; no browser):
- Lane harnesses under `tests/qr/prd07/browser/` take the per-module path. Only `/tests/browser/`
  entries are bundled (`tests/browser/example-dev-server.ts:266-272`).
- Crawling `/tests/qr/prd07/browser/particles-production-harness.html` walks 1309 modules in 4.2 s.
  The one real 404 is `/node_modules/.pnpm/node_modules/ktx-parse/dist/ktx-parse.modern.js`,
  mapped at `example-dev-server.ts:96`. The importer is the static
  `import … from "ktx-parse"` at `packages/assets/src/AssetDecoderRegistry.ts:22`
  (`@aura3d/engine` → `@aura3d/assets`). pnpm does not hoist ktx-parse into `.pnpm/node_modules`
  because the lockfile holds 1.0.1 and 1.1.0. One failed static import kills the whole graph.
- Tracked as #865 (to lane 15; lane-07 evidence added). Lane 07 does not edit the file.

Expected to clear once #865 lands: the same mechanism applies to every lane browser spec
(`browser` job, 07-TIMEOUTS / #156).
