# Renderer Lifecycle

Renderer lifecycle coverage now includes bounded public APIs for display resize and animation-loop ownership:

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

`startAnimationLoop()` owns one active `requestAnimationFrame` loop per renderer. Starting a new loop stops the previous loop. Calling `loop.stop()` cancels the pending frame, and `renderer.dispose()` stops the active loop before disposing GPU/device resources.

## Covered Paths

- WebGL2 context-loss diagnostics and render rejection while lost.
- WebGL2 context-restored diagnostics.
- Renderer disposal and render rejection after disposal.
- Same-canvas renderer recreation after disposal.
- CSS size, DPR, backing-buffer size, viewport, and pixels across resizes.
- Bounded long-running animation-loop ownership with repeated render calls.

## Limits

- Browser tests cover Chromium in this repository configuration, not a full cross-browser/device matrix.
- The renderer reports context restoration, but it does not rebuild all previously uploaded user resources automatically after a real browser context restore.
- Hot module replacement framework adapters are not included; same-canvas recreate is the supported bounded evidence.

## Verification

- `tests/unit/rendering/renderer.test.ts` covers `resizeToDisplay()` and animation-loop stop/dispose behavior.
- `tests/browser/rendering-context-lifecycle.spec.ts` covers context loss, restore, disposal, same-canvas recreate, and a bounded 8-frame render loop.
- `tests/browser/rendering-resize-stress.spec.ts` covers high-DPI CSS/backing-buffer/viewport/pixel alignment.
