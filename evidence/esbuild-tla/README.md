# Top-level await in the published engine (4.2.0 baseline and the 4.3.0 fix)

Scratch install of the PUBLISHED `@aura3d/engine@4.2.0` (esbuild 0.25, Vite 7, Rollup 4), entries: root import, `@aura3d/engine/physics`
(`new PhysicsWorld()`), and root + game + physics + scene. Script: `matrix.mjs` (node builtins and optional peers external).

Top-level awaits found in the 4.2.0 dist: `physics-rapier/index.js` (the Rapier WASM init, 2 awaits) and
`aura3d-cli/commands/prd13/run.js` (a dev entry, 1 await).

| Consumer build | 4.2.0 result |
|---|---|
| esbuild, esm, target es2022 / esnext, splitting on or off | builds, `node --check` clean |
| esbuild, esm, target **es2020** | **fails**: `Top-level await is not available in the configured target environment ("es2020")` |
| esbuild, **iife**, any target | **fails**: `Top-level await is currently not supported with the "iife" output format` |
| Vite 7 build, default target | builds |
| Vite 7 build, `build.target: "es2020"` | **fails** (same message from `vite:esbuild-transpile`) |
| Vite 7 build, `build.target: "es2022"` | builds |
| Rollup, `es` | builds |
| Rollup, **iife** | **fails**: `Module format "iife" does not support top-level await` |

The "Unexpected reserved word" seen in the dot-dash-3d test harness is a separate esbuild failure mode: the same top-level await, reachable
from two import cycles (2 of the 10 cyclic import groups in the engine sources reach `physics-rapier`), makes esbuild emit `await` inside non-async `__esm` wrappers.
Published dist bundles at es2022+ did not reproduce it.

## Why the await cannot simply be deleted

`app.physics` is documented and tested as live synchronously (`docs/concepts/physics.md`, `tests/unit/agent-api/lazy-physics-world.test.ts`),
and the engine itself builds worlds inside `createAuraApp` (`GameRuntime`, game kits). Rapier's WASM can only be instantiated
asynchronously on the browser main thread (Chrome rejects synchronous compilation above 4 KB), so a synchronous world needs the module-load await.

## 4.3.0 change

- Default build: unchanged behaviour (still one init await, now isolated in `rapierInit.js`).
- New `aura3d-no-tla` bundler condition (package `imports` map, `#aura3d/rapier-init`) selects `rapierInit.lazy.js`: no top-level await, call
  `await ensurePhysics()` (exported from `@aura3d/engine/physics` and `@aura3d/physics`) before the first world or `createAuraApp`.
- `pnpm verify:no-tla` fails on any other top-level await in shipped dist (also in `verify:npm-release`).
- `tests/unit/consumer-bundle/no-tla.test.ts` bundles the built engine at es2020/es2022, esm/iife, with and without the condition, and runs the
  lazy build in Node (`--conditions=aura3d-no-tla`): a world before `ensurePhysics()` throws a clear error, after it the world steps.
- The prd13 `run.ts` dev entry no longer awaits at the top level.
