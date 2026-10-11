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

Per-tier CPU/GPU/memory figures: **NOT RUN** — remote measurement pending
(macos-14 run ids go in the PR body when the lane workflow reports).
