# Renderer Lifecycle

Renderer lifecycle coverage includes public APIs for display resize, animation-loop ownership, context diagnostics, resource disposal, and route-level timing telemetry.

```ts
const display = renderer.resizeToDisplay({
  cssWidth: 320,
  cssHeight: 180,
  devicePixelRatio: window.devicePixelRatio
});

const loop = renderer.startAnimationLoop((timeMs, activeRenderer) => {
  activeRenderer.resizeToDisplay();
  activeRenderer.render(source, camera);
});
```

`resizeToDisplay()` validates CSS size and DPR, rounds to a positive backing-buffer size, resizes the canvas-backed renderer when needed, and returns the CSS size, DPR, backing size, and whether a resize occurred.

## Camera Framing

Renderer-owned `cameraPolicy: "auto-frame"` uses `DEFAULT_RENDERER_AUTO_FRAME_OPTIONS`, an angled studio-preview perspective frame with padding, yaw, pitch, and near/far padding. This is the package-level fallback for scene render sources that do not provide an authored camera, and it is intentionally different from the lower-level identity path used for raw clip-space draw lists.

Use `cameraFrameBounds` when a render source contains presentation geometry that should not define the subject framing. This is the intended path for product turntables, configurators, galleries, and other scenes with a primary object plus decorative stages, backdrops, annotations, or UI proof geometry.

Use `cameraFrameOptions` when a package fixture or viewer needs a tighter or looser studio preview without hand-building camera matrices. It accepts the same `PerspectiveCameraFrameOptions` shape used by `computePerspectiveCameraFrame`, including `paddingRatio`, `minDistance`, `yawRadians`, `pitchRadians`, and near/far padding.

```ts
renderer.render({
  cameraPolicy: "auto-frame",
  cameraFrameBounds: {
    min: [-1.2, -0.6, -0.4],
    max: [1.2, 1.0, 0.5]
  },
  cameraFrameOptions: {
    paddingRatio: 0.04,
    minDistance: 0.5
  },
  renderItems: [
    { geometry: productGeometry, material: productMaterial, label: "product" },
    {
      geometry: backdropGeometry,
      material: backdropMaterial,
      label: "studio-backdrop",
      includeInAutoFrame: false
    }
  ]
});
```

If `cameraFrameBounds` is omitted, auto-frame bounds are computed from render items whose `includeInAutoFrame` value is not `false`. Decorative render items still render; they are only excluded from camera fitting.

Use `cameraPolicy: "require"` for apps that should fail loudly when an authored camera is missing. Use `cameraPolicy: "identity"` or pass a raw iterable of render items only for low-level tests and clip-space primitives.

## Default Environment

High-level scene render sources use `DEFAULT_RENDERER_ENVIRONMENT_LIGHTING` when they do not provide `environmentLighting`. This prevents valid PBR scene renders from silently falling back to a nearly unlit material-local ambient path. Pass `environmentLighting: false` when a test, editor diagnostic view, or custom renderer path intentionally needs no renderer-owned environment contribution.

`startAnimationLoop()` owns one active `requestAnimationFrame` loop per renderer. Starting a new loop stops the previous loop. Calling `loop.stop()` cancels the pending frame, and `renderer.dispose()` stops the active loop before disposing GPU/device resources.

## Covered Paths

- WebGL2 context-loss diagnostics and render rejection while lost.
- WebGL2 context-restored diagnostics.
- Renderer disposal and render rejection after disposal.
- Same-canvas renderer recreation after disposal.
- CSS size, DPR, backing-buffer size, viewport, and pixels across resizes.
- Bounded long-running animation-loop ownership with repeated render calls.
- WebGL2 state-cache diagnostics, including issued/skipped state changes, program switches, texture binds, buffer binds, vertex-array binds, and sampler binds.
- Route-level first-frame and average-frame timing, as shown by `tests/reports/flagship-viewer.json`.

## Limits

- Browser tests cover Chromium in this repository configuration, not a full cross-browser/device matrix.
- The renderer reports context restoration, but it does not rebuild all previously uploaded user resources automatically after a real browser context restore.
- Hot module replacement framework adapters are not included; same-canvas recreate is the supported bounded evidence.
- Current flagship routes still expose user-visible loading costs for real GLB/HDR assets. Lifecycle readiness is not the same thing as instant startup or production-grade streaming.
- The WebGPU backend is explicit and app-owned for fallback. It must not be treated as silently equivalent to WebGL2.

## Verification

- `tests/unit/rendering/renderer.test.ts` covers `resizeToDisplay()` and animation-loop stop/dispose behavior.
- `tests/browser/rendering-context-lifecycle.spec.ts` covers context loss, restore, disposal, same-canvas recreate, and a bounded 8-frame render loop.
- `tests/browser/rendering-resize-stress.spec.ts` covers high-DPI CSS/backing-buffer/viewport/pixel alignment.
- `tests/reports/flagship-viewer.json` records route-level asset, environment, renderer, frame, draw-call, and state-cache timing.
- `tests/reports/current-routes-runtime-import-audit.json` proves the current runtime source roots do not import Three.js implementation paths.
