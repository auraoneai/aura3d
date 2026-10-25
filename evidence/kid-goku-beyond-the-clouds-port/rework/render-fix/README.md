# Cumulus Dash: the 3D view filled two thirds of the frame at device scale 2 (render fix)

Group C screenshot problem: at device scale 2 the 3D view sat in the lower-left 960x600 of a 1440x900 frame with black elsewhere. Remote software WebGL2, 720x450 CSS viewport, `?manual=1&quality=low`.

## Cause

The port set `createAuraApp(..., { resize: false, pixelRatio: 1 })` and then, after `app.ready()`, assigned `canvas.width/height = client * min(devicePixelRatio, 1.5)`. The renderer's viewport and offscreen targets were sized from the mount-time backing store (720x450), so at device scale 2 it drew 720 of the 1080 buffer pixels: two thirds of the frame. (Device scale 1 had no mismatch.) Separately, the engine pins an inline CSS size on the canvas at mount, so a window resize never changed the canvas.

Measured before (`before-dsf2-cropped.jpg`): backing 1080x675, CSS 720x450, top-right region 94.7% dark pixels, bottom-right 98.4% dark. At device scale 1 after resizing the window to 960x540 the canvas stayed 720x450.

## Fix

- Engine (`frameLoop.ts`, `canvas.ts: authoredBackingResize`): with `resize: false` a backing size changed after mount is forwarded to the renderer (unit test `tests/unit/render-fix/authored-backing-resize.test.ts`). The six other `resize: false` ports size the canvas before creating the app, so they were not affected.
- Port: delete the hand-written canvas sizing and let the engine do it: `pixelRatio: Math.min(devicePixelRatio, 1.5)`, no `resize: false`. This also follows window and parent resizes.

## Measured after (`render-fix-regression.spec.ts`, run `fixrc-after`)

- Device scale 2: backing 1080x675 for CSS 720x450; top-right region 0.001% dark (mean luma 122.6, was 4.0); bottom-right 0% dark.
- Resize to 960x540 at device scale 2: CSS 960x540, backing 1440x810 (the 1.5 cap); top-right 0.03% dark.
- Device scale 1: resize to 960x540 now gives CSS 960x540 and backing 960x540 (before: stuck at 720x450).
- The spec fails on the unmodified head (run `fixrc-before`: device scale 1 resize test and device scale 2 crop test both fail).

## Frames

`before-dsf1.jpg`, `before-dsf2-cropped.jpg`, `after-dsf2.jpg`, `after-dsf2-resized-960x540.jpg`.

## Released code

This defect is in code released as 4.1.3: on any display with a pixel ratio above 1 (a Retina Mac) Cumulus Dash on production shows the same crop. The fix is on `game-rework` (4.2.0) only.
