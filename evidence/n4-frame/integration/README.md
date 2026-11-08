# N4 examples under a plain Vite build (integration, 2026-11-08)

Real GPU (headless Chrome, ANGLE Metal), 960x540. Each example was built with Vite's defaults (only `root` and
`outDir` set; no `build.target`, default chunk splitting) and served from the output directory.

- `plain-vite-build-tla-vs-fixed.png`: top-left = examples/auto-frame-clock as merged (top-level `await app.ready()`):
  black. Every lazily loaded engine chunk (renderingLazy, v2Entry, softboxEmbeddedLoader, ...) imports the entry chunk
  back, so an entry module suspended on `await app.ready()` never finishes evaluating and `ready()` waits on a chunk
  that waits on the entry. Then auto-frame-clock, auto-frame-bird, plain-look/garden and plain-look/spider with
  `void app.ready().then(...)`: all render.
- `starter-game-default-vite-build.png`: create-aura3d `starter-game` copied out and built with its own
  `vite.config.ts` (`vite build`): renders. All create-aura3d templates already use `void app.ready().then(...)`; none
  has a top-level await. (LOOK_HDRI_MISSING there is only because the raw template copy has no `public/hdri/`, which
  the scaffolder adds.)

## Top-level await root cause and the docs fix (2026-11-08)

- `tla-minimal-before.png` / `tla-minimal-after.png`: a one-box app (`createAuraApp` + `environments.neutral` + `lights.key` +
  one `primitives.box`) built with `vite build` and no config at all (Vite 7.3.2), served from the output, captured with the
  census tool. Before: module ends in `await app.ready()`: black, no console output, no `data-aura3d-ready`. After: the same
  file with `void app.ready().then(...)`: renders.
- Why it cannot be fixed in the engine: in the built output every lazy chunk (`renderingLazy`, `v2Entry`,
  `neutralEmbeddedLoader`, `softboxEmbeddedLoader`, `assetsImportersLazy`, `TemporalHistory`, `WebGPUDevice`, ...) has a
  static `import ... from "./index-<hash>.js"`, because Rollup places every module that the entry imports statically into the
  entry chunk, and those chunks share core modules with it. The app's own module lives in that same chunk, so its
  top-level await holds the whole chunk in "evaluating", and per the ES module spec the lazy chunks wait for it. Where
  shared modules land is decided by the consumer's bundler; the engine cannot keep its lazy code from sharing modules with
  the entry, and `ready()` cannot resolve before the renderer it reports on has mounted.
- So: every snippet in docs, `llms.txt`/`llms-full.txt`, recipes, `recipes-src`, the skills and their mirrors now uses
  `void app.ready()` / `app.ready().then(...)` or awaits inside a function (create-aura3d templates already did), and
  `LINT_TOP_LEVEL_AWAIT_READY` in `aura3d validate` / `aura3d verify` is an error that also catches `readyStrict()`,
  `readiness()`, `precompile()`, `game.ready()` and `warmPrograms(app)`.
