# Aura3D 4.1.2 vs three.js 0.185.1: measured benchmark

Five canonical scenes (plus a hello-world baseline) built twice, once in three.js and once in Aura3D, each as a standalone Vite app, then built for production and measured in a browser on the remote runner. Results: `evidence/vs-threejs/results.json` (raw), `evidence/vs-threejs/RESULTS.md` (tables and verdicts), `evidence/vs-threejs/frames/` (captured frames).

Runs from the 4.3.7 re-measure onward follow [`METHODOLOGY.md`](METHODOLOGY.md) (equal-work arms, three independent authors, a real-GPU column, and `gate.mjs`); the description below is the 4.1.2 method.

**What this is not.** The runner is a CPU-only Azure Container Registry task with software WebGL2 (SwiftShader). Frame times here are software-rasteriser times, not GPU times. They show relative CPU/driver cost and draw submission, not what an M-series GPU or a desktop GPU would do. Nothing here is a hardware-GPU claim.

## Scenes

| Scene | What it must do |
| --- | --- |
| `pbr-viewer` | Lit PBR GLB (Cesium milk truck) with HDR environment lighting, one directional shadow, bloom, orbit controls |
| `forest` | 10,000 instanced objects (8,000 trees as trunk + canopy instances, 2,000 rocks), seeded placement, per-instance colour, directional shadow, exponential fog |
| `skinned-character` | Skinned glTF (Soldier) with idle/run states, cross-fade, circular run path, damped follow camera, shadow |
| `game-loop` | "Coin dash": fixed 1/60 s timestep, keyboard input, DOM HUD, pause (P), results (win/time up), restart (R), deterministic scripted replay |
| `shader-water` | Custom GLSL water (vertex waves, noise texture, fresnel, sun glint) and sky dome, plus a custom post pass (vignette + grade) |
| `baseline` | One lit cube. Used only for the bundle floor and a smoke measurement |

Every app renders at 640x360, device pixel ratio 1, ACES tone mapping, no MSAA, and exposes the same `window.__BENCH__` hook (`shared/glue.ts`, identical for both libraries). The scene source is the only thing that differs. Engine-neutral pieces live in `shared/` and are not counted as scene source: the coin-dash rules (`coin-sim.ts`), the DOM HUD (`hud.ts`), the noise canvas painter (`noise-canvas.ts`), the harness glue.

Each scene is `<scene>/<lib>/scene.ts` (the source an author writes), plus a three-line `main.ts`, an `index.html`, and for Aura a `vite.config.ts`.

## Metrics and how each is taken

| Metric | Method |
| --- | --- |
| Lines of code | Non-blank, non-comment lines of `scene.ts` (`harness/static-metrics.mjs`). Extra files are listed separately (`assets.generated.ts`, `vite.config.ts`, `shared/aura-vite.ts`) |
| Tokens | `gpt-tokenizer` with the `o200k_base` encoding over the same comment-stripped `scene.ts`. That is OpenAI's BPE, a proxy for LLM cost: Claude's tokenizer is not public. Words and characters are in `results.json` too |
| Distinct imports / concepts | Distinct non-relative import specifiers, and distinct named imports plus `THREE.X` members used |
| Bundle bytes | `vite build` (Vite 7.3.2, default minify) in the container. Raw, gzip (level 9) and brotli (quality 11) of every emitted `.js` file, summed, plus the largest chunk. Non-JS assets (GLB, HDR) are reported apart |
| Request count / bytes fetched | Playwright `response` events for one load: count, summed `content-length`, JS-only bytes. Static server, no compression, `cache-control: no-store` |
| Time to first frame | `performance.now()` (relative to navigation start) when the first frame finished including `gl.finish()`, after all assets loaded. Median of 3 cold loads in fresh browser contexts |
| Steady-state frame time | 10 warm-up frames, then 60 frames of `frame(1/60)` called back to back. `cpu` = time inside `frame()` (JS + command submission); `total` = until `gl.finish()` returns. Median and p95 |
| Draw calls, triangles | A prototype hook on `WebGL2RenderingContext` counts `drawArrays/Elements/Instanced/RangeElements` and triangles (mode x count x instances) for one steady frame, all passes included (shadow, post). `WEBGL_multi_draw` is not hooked |
| Correctness | Frames captured at identical simulated time (frame 25 and 85 after load). Jensen-Shannon divergence of the 64-bin luma histograms between the two libraries (0 identical, 1 maximal), mean luma difference, mean absolute per-pixel luma difference, plus luma std to catch blank frames. Scene 4 also replays 1800 scripted steps twice and compares state hashes |
| Features out of the box, failure modes | Author-assessed from the scene sources and from what happened during builds and runs (stated as such in `RESULTS.md`) |
| Authoring trial | One author (this agent, who knows three.js far better than Aura3D's API) wrote all ten scenes. Iterations and errors are counted honestly. It is not an independent agent trial and not statistically meaningful |

`forest` uses a reduced frame plan (1 cold load, 12 measured frames, captures at frames 10 and 21) because one Aura3D forest frame takes seconds under software GL; every other scene uses 3 cold loads, 60 measured frames and captures at frames 25 and 85 (frame 280 for the skinned character, so the second capture is mid-run). The plan is recorded in each part of `results.json`.

`three-msaa` apps are the three.js apps with 4x MSAA switched on (`antialias: true`, or a 4-sample `EffectComposer` target), added because Aura3D's default production profile renders into 4x multisampled targets and the plain three.js apps do not antialias. Section 7d of `RESULTS.md` compares against them.

Verdict rule for numeric rows: lower is better; within 5% is a tie; otherwise the lower value wins. Rows that cannot be compared are marked unmeasurable.

## Reproduce

```sh
# groups: A baseline+pbr-viewer+game-loop, B forest, C skinned-character, D shader-water,
#         E three.js with 4x MSAA (all scenes), F pbr-viewer in all three variants (one test per line)
grep -n '^  test(' tests/browser/bench-vs-threejs.spec.ts
RUN_ID=benchvs-b SPECS="tests/browser/bench-vs-threejs.spec.ts:<line of group B>" EXTRA_DIRS="fixtures/environment-corpus/hdri" tools/remote-acr/run.sh
# then, once the image exists, the other groups in parallel on their own runners:
BUILD=0 IMAGE_TAG=run-benchvs-b RUN_ID=benchvs-a SPECS="tests/browser/bench-vs-threejs.spec.ts:<line of group A>" EXTRA_DIRS="fixtures/environment-corpus/hdri" tools/remote-acr/run.sh
node tools/bench-vs-threejs/harness/extract.mjs results.json frames tests/reports/remote-acr/*/acr-run.log
node tools/bench-vs-threejs/harness/static-metrics.mjs tools/bench-vs-threejs static-metrics.json <dir with gpt-tokenizer installed>
node tools/bench-vs-threejs/harness/report.mjs results.json static-metrics.json RESULTS.md [extra-sections.json] [second-run-results.json]
```

Four tests sit on four separate lines so that groups run on separate runners in parallel (`<spec>:<line>` selects one). Inside the container `harness/build-all.mjs` stages the apps, runs `npm install` for `@aura3d/engine@4.1.2`, `@aura3d/assets@4.1.2`, `three@0.185.1` and `vite@7.3.2`, and builds each app. Results leave the container as base64 chunks in the run log (`az acr run` cannot return artifacts).

## Build failures found while setting this up

With a stock Vite config, `vite build` of an app that imports `@aura3d/engine` fails against the published 4.1.2 packages (`"readFileSync" is not exported by "__vite-browser-external"`, from `dist/assets/threejs-compatibility/ThreeCompatAssetRegistry.js`). The shipped `mini-game` template fails the same way on a fresh `npm install`, and its `package-lock.json` is out of sync with its `package.json` (`npm ci` fails). `shared/aura-vite.ts` is the workaround used here: a 10-line plugin that stubs Node built-ins, plus the `@aura3d/assets/vite` decoder plugin.

## Edits outside this directory

`tools/remote-acr/run.sh` and `tools/remote-acr/Dockerfile.playwright` gain three lines and one line to stage `tools/bench-vs-threejs` into the image. `tests/browser/bench-vs-threejs.spec.ts` is the harness spec (Playwright only discovers specs under `tests/browser`).
