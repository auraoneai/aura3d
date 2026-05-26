# Engine Lifecycle

Version: `0.1.0-alpha.0`

Galileo3D applications should make ownership explicit: create browser resources deliberately, advance systems from a known loop, collect diagnostics, and dispose GPU/audio/listener resources when the view unmounts.

## Startup

Typical startup has four steps:

1. Create or locate the host surface, usually a `<canvas>`.
2. Create app/runtime systems with public APIs such as `createG3DApp(...)`, `G3DRenderer.create(...)`, `Renderer.create(...)`, `AssetManager`, or `PhysicsWorld`.
3. Load or construct scene content.
4. Render once for a deterministic preview or start an application-owned frame loop.

High-level app path:

```ts
import { createG3DApp } from "@galileo3d/engine";

const app = await createG3DApp({ canvas, quality: "balanced" });
await app.renderWorkflow("scene-showcase", { preset: "gallery" });
```

Direct runtime path:

```ts
import { G3DRenderer, G3DScene } from "@galileo3d/engine/v9";

const renderer = await G3DRenderer.create({ backend: "webgl2", canvas });
const scene = new G3DScene();
renderer.render(scene);
```

## Frame Ownership

Interactive apps normally update in this order:

1. input;
2. fixed-step simulation or physics;
3. animation sampling;
4. scene transforms and bounds;
5. render submission;
6. diagnostics and UI.

Galileo3D exposes pieces of this loop, but your app still owns UI state, route changes, framework hooks, and data loading.

## Disposal

Browser GPU memory is not reclaimed just because JavaScript objects are unreachable. Dispose the runtime that created GPU resources:

```ts
await app.dispose();
renderer.dispose();
physicsWorld.clear();
```

Also remove event listeners, abort outstanding asset loads, and release editor previews when replacing canvases during hot reload.

## Diagnostics

Use diagnostics snapshots to prove route behavior and detect leaks:

- app diagnostics from `createG3DApp`;
- renderer diagnostics from render calls;
- asset diagnostics from loaded resources;
- route-health reports under `tests/reports`.

Diagnostics are evidence for the measured route. They are not broad production-readiness proof.

## Boundaries

Current lifecycle work does not yet prove:

- long-running production soak stability;
- complete context-loss recovery;
- complete WebGPU device recreation;
- production memory behavior across every browser/GPU pair.

Keep lifecycle claims tied to tests and routes.

## Boundary

The engine lifecycle boundary is between app-owned UI/framework state and Galileo3D-owned runtime resources.

## Current Limits

Current limits remain the long-running soak, full context-loss recovery, and broad browser/GPU lifecycle coverage listed above.
