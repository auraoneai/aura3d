# Cumulus Dash at device scale 2: hotfix check

Bug (live in 4.1.3): the port sizes the canvas by hand after the app mounts (`resize: false`), and the renderer kept its mount-size viewport,
so on a 2x display the picture filled only the lower-left part of the frame (black elsewhere). Fix: `packages/engine/src/agent-api/app/frameLoop.ts`
and `canvas.ts` forward a changed authored backing size to `renderer.resize` (commit de5b223d5 on `hotfix-brand`, adapted from game-rework aa5588944).

Remote runner, software WebGL2 (SwiftShader), deviceScaleFactor 2, spec `tests/browser/hotcum-cumulus.spec.ts` (runs `hotcum-before3` on the unpatched
tree, `hotcum-after3` on the patched tree). Share of near-black pixels in a frame region (lower is right):

| Case | Region | Before | After |
|---|---|---|---|
| 1440x900, dsf 2 (canvas 2160x1350) | top-right | 99.6% | 0.28% |
| 1440x900, dsf 2 | right | 100% | 2.07% |
| 390x844, dsf 2 (canvas 585x1266) | top-right | 97.6% | 0% |
| 390x844, dsf 2 | right | 100% | 0% |
| 720x450, dsf 2 (earlier run) | top-right | 95.3% | 0.11% |
| 720x450, dsf 1 (control) | top-right | 0.05% | 0.05% |

The spec fails on the unpatched tree and passes (2 passed, 24.7 min) on the patched tree.
Frames: `before-*.jpg` and `after-*.jpg` in this folder.

Not covered: real GPU; window resize after load (the engine pins the canvas CSS size in px at mount, so a window resize never changed this port's
canvas size, patched or not: separate, older behaviour).
