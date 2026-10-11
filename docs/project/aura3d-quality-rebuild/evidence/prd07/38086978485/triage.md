# prd07-vfx triage — run 38086978485 (main 503624cf2, push, GitHub macos-14)

Row: **07 CI-rerun** (PRD-16 §4.7). First `prd07-vfx.yml` run on main that executes jobs
(#841 made the workflow parse). One line per red job: first error, attributed file:line.
Status is updated as jobs complete; a job not listed below had not completed at writing.

| Job | Job id | Result | First error | Attributed to |
|---|---|---|---|---|
| mobile | 114315418024 | failure (8/8 specs) | `TimeoutError: page.waitForFunction: Timeout 90000ms exceeded` at `juice-automount.spec.ts:41`; every spec times out the same way, including the flags-none sentinels | `tests/browser/example-dev-server.ts:96` (lane 15), see below |
| unit | 114315418017 | success | — | — |
| grep-gate, bake, typecheck, browser, capture, games | — | PENDING (queued on macos-14 at 2026-10-11 ~02:10Z) | — | to be filled when the jobs complete |

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
