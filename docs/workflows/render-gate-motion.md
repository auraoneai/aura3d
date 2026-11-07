# Render gate: multi-frame motion check

The single-frame render gate proves a scene drew once. It cannot see a scene that draws one correct frame and then freezes
(5.0.2: a custom shader whose only motion was `uTime`, `world.water` and sky clouds redrew nothing; real-GPU frame
difference 0.000). The motion check captures two frames N seconds apart and asserts they differ.

## Method

- Each frame is reduced to a **64x36 grid of luma** (`0.2126 R + 0.7152 G + 0.0722 B`, 0..255), box-averaged in pure JS.
- Difference = mean over the 2304 cells of `|lumaA - lumaB|`.
- **moving = difference > 0.2** (the agent-eval `animated` threshold, `tools/agent-eval/remote/score-all.mjs` `gridDiff`).
  Configurable: `--motion-threshold <n>`, a per-entry `threshold` in the config, `--motion-grid WxH`, `--interval-ms <n>`.
- The agent-eval downsamples with a browser canvas (`drawImage`, bilinear) and rounds cells to integers; this gate box-averages
  and keeps fractions. Identical frames give 0.000 in both. A moving region smaller than a few grid cells can fall under 0.2;
  lower the per-entry threshold for such entries.
- Frames: wait `settleMs` (default 4000) then screenshot A, wait `intervalMs` (default 1500) then screenshot B. REA also
  captures after the implicit navigation step; the gate uses the **last two** screenshots. Reduced motion is **off**.

## Config

`tools/release/render-gate/motion-config.json` lists the entries (recipes, templates, games). Only entries with
`animated: true` can fail; `animated: false` rows are measured and recorded. `verified: real-gpu-2026-11` means the diff was
measured on a real GPU in the 5.0.2 investigation; `source-read` means flagged from source and not yet measured by this gate
(measure once, then record). Only 5 of the 8 recipes animate; the other 3 are static by design.

## Run (real GPU through REA; no Docker, no Playwright)

```bash
# build the recipes (monorepo source) and serve them on loopback
pnpm exec vite build --config docs/agents/recipes-src/vite.config.ts
pnpm exec vite preview --config docs/agents/recipes-src/vite.config.ts --host 127.0.0.1 --port 4173 &

# serialise browser captures; never hold the lock while building
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 5; done
node tools/release/render-gate/index.mjs --out /tmp/motion-out --motion \
  --recipe-base http://127.0.0.1:4173 --base http://127.0.0.1:8123 \
  --templates-source archives:<plan.json>          # omit to skip nothing: templates need a source
rmdir /tmp/a3d-rea.lock
```

Entries whose base is not supplied (`--recipe-base`, `--base`) are reported as skipped. `--only recipe:water-custom-shader`
narrows the run. The driver is `rea capture-browser-scenario <scenario.json> --format json --full-output`, the same engine as
the MCP tool `rea_call capture_browser_scenario`. The scenario is `buildMotionScenario()` in `motion.mjs`.

Offline analysis of envelopes captured through the MCP tool (save the full envelope as `<kind>-<id>.json`, e.g.
`recipe-water-custom-shader.json`, with the two step screenshots):

```bash
node tools/release/render-gate/index.mjs --out /tmp/motion-out --motion --driver saved --saved-dir <dir>
```

Outputs: `motion-summary.md`, `motion-results.json`, and `<id>-a.png` / `<id>-b.png` for live runs. Exit 0 only when every row passes.

## Probe: uTime-only motion

`tools/release/render-gate/probes/utime-static` is a static, lit page (directional light, camera, a 30x18 panel; no `.runtime`, no
`app.onFrame`) whose custom shader reads `uTime` (`0.5 + 0.5 * sin(uTime)`, a 6.3 s period, so two frames 3 s apart are near
opposite phase). `probes/effects-static` mounts one effect per `?e=` (`none|fog|water|clouds|clouds0|utime`); `&loop=1` adds an empty
`app.onFrame` to force the loop and measure whether the effect really animates. Build both with
`PROBE_OUT=<dir> pnpm exec vite build --config tools/release/render-gate/probes/vite.config.ts`; build the base in a worktree of
`origin/main` with the same probe sources. Capture with the loopback-CDP driver (headless Chrome on Metal, no Playwright, no Docker):

```bash
node tools/release/render-gate/cdp-capture.mjs --dir <dist> --page utime-static/index.html --out evidence/utime-512/utime-fix \
  --settle 4000 --interval 3000 --measure 4000      # writes -a.png, -b.png, .json (diff, console, rAF/s, draws/s, CPU)
```

Probe authoring trap (this was the all-black frame): the probe used a top-level `await app.ready()`. The bundler put the engine in the
still-evaluating entry chunk, and the engine's own dynamic imports (`TemporalHistory`, `ShaderLibrary`) re-enter that chunk, so the
mount never finished (no `renderer-create:resolved` mark, 0 rAF, no draw, no console error, diff 0 for every build). Use
`app.ready().then(...)` in probes. The probe now sets `document.body.dataset.aura3dReady` and logs `probe-ready` / `probe-failed`.

## utime-512 findings

Real GPU: Apple M4 Max, ANGLE Metal, headless Chrome 156, 960x540, diff = 64x36 luma mean-abs-diff, frame B 3 s after frame A.
Base = `origin/main` e5387f3b0, fix = this branch. Evidence: `evidence/utime-512/` (PNG pairs, one json per run, `summary.json`).

| Scene (no `.runtime`, no `onFrame`) | base diff | fix diff | base rAF/s | fix rAF/s |
|---|---|---|---|---|
| custom shader reading `uTime` (utime-static, full-frame panel) | 0.000 | 34.991 | 0 | 60.6 |
| same shader on a small 3x3 block (effects-static `e=utime`) | 0.000 | 0.070 | 0 | 59.9 |
| `world.water` lake | 0.000 | 7.323 | 0 | 59.1 |
| `effects.volumetricFog` (ultra, godRayDensity 1) | 0.000 | 0.000 | 0 | 0 |
| sky gradient with clouds (coverage 0.8, speed 1) | 0.000 | 0.000 | 59.9 | 60.2 |
| sky gradient with still clouds (speed 0) | 0.000 | 0.000 | 0 | 0 |
| no consumer (lit boxes only) | 0.000 | 0.000 | 0 | 0 |

- uTime and water: frozen before, moving after. The small-block row is under the 0.2 threshold because the moving region is a few
  grid cells; the motion config's per-entry `threshold` exists for that.
- Volumetric fog is NOT a time consumer. With the loop forced on (`loop=1`) the fog scene still differs 0.000 between frames 3 s apart
  on both builds, while the fog is drawn (fog vs no-fog frame diff 2.741). Source agrees: the engine never sets `noiseSpeed` /
  `noiseStrength` (both 0), so `u_time` has no effect. No change made. Re-measure if the engine starts exposing the noise scroll.
- Sky clouds: the base already keeps drawing a scene with drifting clouds, because `ProductionEffectSystem.requiresFrames` returns true
  for `coverage > 0 && speed > 0`. The `skyHasAnimatedClouds` branch of this fix is therefore redundant for the idle decision (kept;
  harmless, and it covers a sky node reached without the effect system). Cloud MOTION is unproven: the clouds are close to
  invisible in this probe (preetham and gradient skies) and the forced-loop diff is 0.000, so no claim that clouds visibly move.
- Idle cost, a static lit scene with no time consumer (`e=none`, 5 s window): rAF 0/s, draw calls 0/s, page CPU 0.34 ms/s base and
  0.24 ms/s fix, GPU-process CPU 0 vs 2 ms/s (1 s `ps` resolution, noise). It stays idle. Cost of the new loop where it applies
  (fix, uTime scene): 60 rAF/s, about 90 page CPU ms/s (1.5 ms per frame) and about 83 GPU-process CPU ms/s (1.4 ms per frame); GPU
  shader time itself is not measured.
- `app.step()` capture is unchanged: unit test `autoStart:false never schedules a loop for a uTime scene, explicit renders still draw`
  (tests/unit/engine/utime-continuous-render.test.ts). `step()` was not exercised on a real GPU.
- 5-game safety check (base vs fix, frame B, 10 s settle; games run their own loops so frames move on their own; self diff = base
  frame A vs base frame B of the same load): top-tennis 0.028 (self 27.729), roadster-rush 0.020 (self 13.646), heatsink 0.129 (self
  1.890), duneglide 0.591 (self 0.563, noise level), aura-links-3d 13.548 (self 34.746; its water animates, so mean diff cannot call it
  identical). Frame A pairs differ more (23.249, 12.631, 1.911, 0.304, 18.514) because the intro and load timing differ. Four games are
  indistinguishable from each other at frame B within their own motion; aura-links-3d is not proven identical by this metric.
- Test counts: `tools/release/render-gate/motion.test.mjs` has 15 tests (an earlier report said 17: wrong). The unit file
  `tests/unit/engine/utime-continuous-render.test.ts` has 19 (18 + 1 for the step() case).
