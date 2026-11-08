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
