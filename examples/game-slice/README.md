# Game Slice Demo

## Purpose

This demo is an early game-slice proof that multiple public Galileo3D systems can run together in a browser app. It uses the WebGL2 renderer for visible output while stepping physics, animation, input, particles, and audio-state APIs.

## Run

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts -g game-slice
```

The product demo spec also runs source validation from `tools/demo-validation/product-demo-source-validation.ts`. That guard requires this example to use the public renderer path, expose runtime state, keep this README complete, and avoid 2D-canvas or static-screenshot substitutes.

For browser inspection, serve the repository with the example dev server and open:

```text
/examples/game-slice/index.html
```

## Systems Used

- `Renderer` with the `webgl2` backend
- `PhysicsWorld`
- `AnimationMixer`
- `ParticleSystem`
- `InputSystem`
- `AudioSystem`

## Learning Path

Read `main.ts` as the source of truth for how the slice is assembled; tests only verify the behavior already visible in the app.

1. `Renderer.create({ backend: "webgl2" })` creates the WebGL2 output path.
2. `InputSystem`, `AudioSystem`, `PhysicsWorld`, `ParticleSystem`, and `AnimationMixer` are initialized together near startup.
3. The canvas `pointerdown` handler and focused keyboard input update the same interaction state shown in the app.
4. The animation and physics loop updates runtime state before each `renderer.render` call.
5. `window.__GALILEO3D_GAME_DEMO__` exposes physics body count, live particle count, input snapshot status, audio state, draw calls, and renderer diagnostics.

Use the status panel or DevTools to inspect `window.__GALILEO3D_GAME_DEMO__` while clicking the viewport or pressing Space on the focused canvas.

## Expected Output

A WebGL2-rendered player marker and pickups animate while physics and particle counts update. Pressing or clicking the viewport changes input metrics and updates `window.__GALILEO3D_GAME_DEMO__`.

## Acceptance Target

- `window.__GALILEO3D_GAME_DEMO__.status` is `ready`.
- `renderer` is `webgl2`.
- `metrics.rendererBacked` is `true`.
- `diagnostics.drawCalls` is greater than zero.
- `diagnostics.contextLost` is `false` and `diagnostics.lastError` is `null`.
- Runtime metrics include physics bodies, live particles, input snapshot state, and locked audio state.
- Pointer input increments interaction count.
- Keyboard input through the focused canvas increments interaction count through `InputSystem`.

## Known Limits

- This is a bounded product slice, not a complete game template.
- The visuals use procedural geometry instead of authored art assets.
- Audio is initialized and reported without forcing autoplay.
