# Engine Lifecycle

```ts
const app = createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene().add(model(assets.robot)).add(lights.studio())
});

const offFrame = app.onFrame(({ dt }) => {
  // Update gameplay or presentation state.
});

offFrame();
app.dispose();
```

`createAuraApp` owns canvas setup, resize, render-loop startup, diagnostics
state, screenshot capture, input disposal for `app.input(...)`, and cleanup.
Create one Aura app per route and keep the returned handle for that route's
lifetime.

## Runtime Flow

- Build a scene with typed assets and helpers such as `scene()`, `model(...)`,
  `lights.*`, `camera.*`, and `primitives.*`.
- Mark mutable nodes with `.runtime(game.runtimeNode("id"))`.
- Read the node through `app.nodes.require(id)`.
- Update app-owned systems in `app.onFrame(...)`.
- Use `app.pause()`, `app.resume()`, and `app.step(dt)` for tests, replay, and
  deterministic evidence.
- Call `app.dispose()` when the route unmounts or is permanently replaced.

Do not call `createAuraApp()` inside a frame callback, input handler, or
gameplay loop.

## Renderer And Fallback Boundary

The lifecycle boundary is `@aura3d/engine`. Root app startup can select a
browser WebGL2 agent runtime, canvas/headless fallback behavior, or report
diagnostic errors depending on environment and scene contents. There is no
public renderer-mode option that turns `createAuraApp` into the complete
production-runtime renderer.

Claims about startup, disposal, route health, renderer backend, or fallback
behavior must cite the specific app API and the browser/test evidence that
exercised it.

## Current Limits

Lifecycle ownership does not guarantee production renderer parity, leak-free third-party integrations, or valid use of multiple apps on one target. Validate backend, disposal, and retained route evidence for the exact environment being claimed.
