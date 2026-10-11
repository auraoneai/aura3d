# S19 — lane bundle budgets (PRD-08 §17)

Measured with esbuild 0.28 (minify, ESM splitting, es2022, metafile inputs) +
gzip level 9 — same recipe as `tools/bundle-size/` (invoked read-only; that
tool is lane 11's and unchanged). Platform packages (math, scene, controls,
rendering internals, assets, physics) are externalized the way the tool
externalizes `three`; the lane-owned `camera-fade.glsl.ts` is still measured.

| Fixture | js bytes | gzip bytes | budget | verdict |
|---------|----------|-----------|--------|---------|
| `tests/qr/prd08/bundle/typical-game.ts` | 33,367 | **11,720** | ≤ 15,000 | PASS |
| `tests/qr/prd08/bundle/everything.ts` | 61,883 | **22,190** | ≤ 24,000 | PASS |

Tree-shake gate (metafile inputs, `bundle.test.ts`): the typical fixture pulls
`rigs/chase` (+ `rigUtils`/`registry`/`staticRig`) and **no** rail/Spline,
BicycleModel, PlatformerMotion, VirtualTouch, or unused genre rig.

## Why the codework was needed

`CameraController` previously imported all nine rig modules to build
`controller.rigs` — the typical fixture pulled **20.7 KB gzip** with every rig
reachable. The registry refactor (each `rigs/<name>.ts` self-registers;
`controller.rigs` proxies to the registry) is what makes the spec's
"rigs must tree-shake" true. Flag-off surface: identical for every
barrel/index/extension consumer (they import all rig modules anyway); direct
leaf importers of `CameraController.js` now pull only the rigs they import —
`rigs.fromSpec`/`initial.spec` throw a descriptive error when
`rigs/fromSpec.js` was never loaded.

## Per-tier CPU / GPU / memory (§17, S19)

Status: **pending remote run id** — measured only on the remote macos-14
`browser-gpu` job (`qr-prd08-camera.yml`); no local numbers exist.

Spec `tests/qr/prd08/browser/tier-budgets.spec.ts` on the harness page
`?scene=tier&scripted=1&maxSubSteps=4&coi=1`; scenarios in
`tests/qr/prd08/harness/scenarios-tier.ts`; thresholds only in
`tests/qr/prd08/checks.ts` (`PRD08_TIER_BUDGETS`); headless mirror
`tests/qr/prd08/unit/tier-budgets.test.ts`. Each tier is forced through
`app.quality.set(tier)` and the scenario fails if `app.quality.tier` differs.

- **CPU (main thread).** A standalone lane set: a second
  `createAuraCameraController` over the app's runtime-node registry and
  `app.quality` (chase rig, `collision: true`), `createFeelBus`, an
  `InterpolationStore` holding the tier's handle cap (300 / 600 / 1000 / 2000),
  occluder fade and its C-01 contributor, `bindFeelSound` listener glue. The
  timed tick is `capturePrevious` + `captureCurrent → resolve → present →
  occluder query → remaining cast demand → fade.update → feel advance → tiered
  screen uniforms → listener`; the game's own sim mover is excluded.
  `performance.now()` runs in a cross-origin-isolated page (COOP/COEP via
  `?coi=1` in `tests/qr/prd08/dev-server.ts`, 5 µs resolution); the spec fails if
  the page is not isolated. Median and p95 over 600 frames are both gated.
- **Casts.** Each frame asks for the lane cap + 1 sphere casts plus one occluder
  query. Per-frame probe stats must equal the §17 cap (1 / 2 / 3 / 3) and Ultra
  must show its dedicated occluder query. On Low the occluder query is refused,
  so fade stays off.
- **Memory.** Lane retained heap. The spec mounts and warms a throwaway lane set,
  drops it (so compiled code and feedback vectors already exist), runs CDP
  `HeapProfiler.collectGarbage` twice, then reads `Runtime.getHeapUsage().usedSize`
  as the baseline. It then mounts and warms the measured set (120 frames), runs
  GC twice again and reads `usedSize`. The delta is what the lane retains.
- **GPU.** `EXT_disjoint_timer_query_webgl2` `TIME_ELAPSED` around each
  scripted presented tick on the mounted app, 240 frames, medians. The lane GPU
  cost is lane features on (fade contributor fed from `app.camera.probe`, plus a
  screen-feel emit every 20 frames) minus off. A missing WebGL2 context or a
  missing timer extension fails the test; it never skips. Any disjoint frame
  fails the run.
- **Net frame.** At 30 Hz ticks with fixedDt 1/60 (2 substeps), the median GPU
  ms per presented frame of the one-submission driver must be below
  `?renderPerSubstep=1`'s.

Artifacts: `tests/reports/prd08/tier-budgets/<tier>.json` (summary + raw
samples) and `summary.csv`.

| Tier | CPU median / p95 ms (≤) | GPU Δ ms (≤) | Retained heap (≤) | Casts (cap) | Handles | Net-frame GPU 1-sub vs per-substep | Run |
|---|---|---|---|---|---|---|---|
| Low | pending (0.35) | pending (0.10) | pending (64 KB) | pending (1) | 300 | pending | pending remote run id |
| Medium | pending (0.45) | pending (0.15) | pending (96 KB) | pending (2) | 600 | pending | pending remote run id |
| High | pending (0.55) | pending (0.20) | pending (128 KB) | pending (3) | 1000 | pending | pending remote run id |
| Ultra | pending (0.70) | pending (0.25) | pending (192 KB) | pending (3 + occluder query) | 2000 | pending | pending remote run id |

Lane defects fixed for S19 (unit: `tests/qr/prd08/unit/camera-tier-budget.test.ts`):

- The camera probe had no per-frame cast cap. It now uses a tier budget
  (`CAMERA_PROBE_TIER_BUDGETS`, read from `app.quality.tier` every presented
  frame), and over-cap casts are refused as no-hit.
- The occluder fade had no tier gate. The contributor now takes a `tier`
  dependency and passes items through untouched on Low.
- `app.feel` published full screen-feel uniforms on every tier. It now publishes
  `screenUniformsForTier(app.quality.tier)`, which on Low is flash + vignette
  only.

Method risks on macos-14 (ANGLE Metal):

- ANGLE may not expose `EXT_disjoint_timer_query_webgl2`. In that case the spec
  fails rather than skipping.
- Metal timer queries cover the GPU work submitted between begin and end. Work
  the app defers to its own rAF render would fall outside the query.
- The screen-feel GPU cost is about 0 until a C-13 consumer exists (PRD 03),
  because today only the uniforms are published.
- The heap delta can carry a few KB of V8 allocation noise.
