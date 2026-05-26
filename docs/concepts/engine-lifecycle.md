# Engine Lifecycle

Version: `1.0.0`

Engine lifecycle covers startup, ticking, diagnostics, route ownership, and disposal.

## Code

- `packages/core/src/index.ts`
- `packages/engine/src/index.ts`
- `packages/apps/src/index.ts`
- `packages/rendering/src/Renderer.ts`

## App Lifecycle

```ts
import { createA3DApp } from "@aura3d/engine";

const app = await createA3DApp({ canvas });
await app.renderWorkflow("scene-showcase", { preset: "gallery" });
console.log(app.diagnostics());
await app.dispose();
```

## Direct Renderer Lifecycle

```ts
import { A3DRenderer, A3DScene } from "@aura3d/engine/advanced-runtime";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const scene = new A3DScene();
renderer.render(scene);
renderer.dispose();
```

## Boundary

Every long-lived renderer, app, device, or resource owner should have a clear dispose path. Lifecycle claims need tests or reports that exercise teardown and resource diagnostics.

## Current Limits

Lifecycle docs describe the public teardown pattern and diagnostics surface. They do not guarantee leak-free behavior for every browser, backend, route, or third-party integration without a matching test or generated report.
