# Metric Definitions

These definitions apply to the prompt benchmark and engine parity benchmark.

## Prompt Metrics

- `compiles`: `true` only when the production build command exits 0.
- `runsInBrowser`: `true` only when the route loads in Playwright Chromium and
  produces a nonblank visual result.
- `visualMatch`: 1-5, neutral scorer only.
- `linesOfUserCode`: count nonblank, non-comment lines in files the developer
  would maintain: `src/**/*`, `index.html`, `vite.config.*`, app CSS, custom
  tests, and hand-written asset manifests. Exclude `node_modules`, `dist`,
  lockfiles, screenshots, logs, generated reports, and copied package code.
- `filesCreated`: count maintained app files. Exclude `node_modules`, `dist`,
  lockfiles, screenshots, logs, and generated reports.
- `hallucinatedApis`: count imported names, called functions, JSX components,
  config keys, or CLI commands that are not present in the selected context
  bundle or installed public package.
- `inventedAssetPaths`: count asset paths not provided by the prompt. For
  prompt 10, `benchmark/assets/sneaker.glb` is the only source asset allowed.
  Typed Aura CLI outputs generated from that source, such as
  `/aura-assets/sneaker.<hash>.glb`, do not count as invented only when the run
  includes typed evidence: generated `src/aura-assets.ts` has a `sneaker`
  entry for that URL, app source imports `assets` from `./aura-assets`, app
  source uses `assets.sneaker`, and the source does not use
  `unsafeModelUrl(...)`. The runner-copied
  `public/benchmark/assets/sneaker.glb` fixture is allowed only when its hash
  matches the prompt asset. Unrelated copied public `.glb` files, hand-written
  generated Aura URLs, and unrelated asset URLs still count as invented paths.
- `repairTurns`: count every post-prompt agent interaction needed before a
  usable render or final failure.
- `timeToFirstUsableRenderMs`: wall-clock from initial prompt delivery to the
  first browser view that compiles, loads, and visibly contains at least one
  prompt-specific element. Failed runs use `null`.
- `bundleSizeGzipBytes`: sum of `gzip -9` bytes for production JS chunks under
  `dist/`. CSS may be recorded separately but does not count for this metric.
- `modifiability`: 1-5, neutral scorer only.

## Metric Winners

For each prompt metric:

- Boolean: if both values match, the metric is a tie. Otherwise `true` wins.
- Counts and sizes: lower wins only if the difference is at least 5%. Smaller
  differences are ties.
- Time: lower wins only if the difference is at least 10%. Smaller differences
  are ties.
- Visual and modifiability scores: higher wins. A one-point difference is
  material.
- Unavailable optional values are ties only when unavailable for both sides.
  If one side fails to produce a required value and the other side produces it,
  the side with the value wins.

Aura3D wins a prompt only when it wins more non-tied metrics than low-level renderer code and
its visual score is at least as high. Tied metrics are not counted in the
majority denominator.

## Engine Metrics

For each engine scene and each implementation, record:

- `routeHealth`: pass/fail plus method used.
- `firstUsableRenderMs`: same start/stop rule as prompt runs.
- `p50Fps`: median FPS after warmup.
- `p95FrameTimeMs`: 95th percentile frame time after warmup.
- `fpsCalibration`: required for engine captures. It must include empty rAF and
  minimal WebGL control measurements from `benchmark/runner/fps-calibration.mjs`.
- `fpsInstrumentationStatus`: omit or use `"pass"` only when calibration passes.
  Use `"invalid"` when controls fail; in that case `p50Fps` and
  `p95FrameTimeMs` must be `null` and the run cannot make a renderer-quality
  FPS claim.
- `drawCalls`: renderer-reported draw calls where available.
- `triangleCount`: renderer-reported or estimated triangles where available.
- `jsHeapPeakBytes`: peak JS heap from browser performance APIs where
  available.
- `gpuMemoryBytes`: only if the browser exposes a reliable value; otherwise
  record `null` and explain.
- `bundleSizeGzipBytes`: same JS gzip rule.
- `sourceLoc`: same maintained-code line count rule.
- `visualParity`: 1-5, neutral scorer only.

Warm up for 5 seconds, then sample for 15 seconds at the fixed viewport.
