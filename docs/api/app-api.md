# App API

Version: `1.0.0`

The browser app API wraps the core engine, optional renderer creation, workflow presets, and diagnostics behind `createA3DApp`.

```ts
import { createA3DApp } from "@aura3d/engine";
```

The implementation lives in `packages/apps/src/index.ts` and is re-exported by `packages/engine/src/index.ts`.

## What It Creates

`createA3DApp(options)` creates:

- a `@aura3d/core` `Engine`;
- an optional WebGL2 renderer when `canvas` is provided;
- a quality preset resolved by `resolveA3DAppQualityPreset`;
- workflow rendering through `renderWorkflow`;
- diagnostics for app state, quality settings, workflow count, renderer output, and engine diagnostics;
- explicit async disposal.

## Quality Presets

| Preset | Default dimensions | Renderer defaults |
|---|---:|---|
| `draft` | 960 x 540 | `rgba8`, no antialias, no preserveDrawingBuffer |
| `balanced` | 1280 x 720 | `rgba16f`, antialias, preserveDrawingBuffer |
| `production` | 1600 x 1000 | `rgba16f`, antialias, preserveDrawingBuffer |

`width` and `height` in `A3DAppOptions` override the preset dimensions.

## Workflow Presets

The current preset list is exported as `A3D_APP_WORKFLOW_PRESETS`:

- `asset-viewer`
- `product-configurator`
- `material-studio`
- `scene-showcase`
- `interactive-scene`

These presets call workflow factories from `@aura3d/workflows`. If the app owns a renderer, `renderWorkflow` also submits the workflow source and camera to that renderer.

## Basic Usage

```ts
import { createA3DApp } from "@aura3d/engine";

const app = await createA3DApp({
  canvas,
  quality: "balanced"
});

const result = await app.renderWorkflow("product-configurator", {
  productId: "demo-product"
});

console.log(result.source);
console.log(app.diagnostics());

await app.dispose();
```

## Diagnostics

```ts
const snapshot = app.diagnostics();
```

The snapshot includes:

- `appState`;
- resolved quality settings;
- `workflowRuns`;
- `lastWorkflow` when one has run;
- `lastRender` when a renderer exists;
- core engine diagnostics.

Use diagnostics for route health, smoke tests, local panels, and report inputs. Do not treat a single diagnostics snapshot as a broad performance or compatibility claim.

## Root Helpers

The root package also exports app-adjacent helpers:

```ts
import {
  captureScreenshot,
  createAssetDiagnostics,
  createCompatibilityReport,
  createDiagnosticsPanel,
  createEnvironment,
  createMaterialVariantController,
  createRenderDiagnostics,
  inspectAsset,
  loadAsset,
  workflows
} from "@aura3d/engine";
```

These helpers are implemented in `packages/engine/src/index.ts` and delegate to first-party packages.

## Direct Runtime Alternative

Use the direct runtime when you need explicit scene and renderer control:

```ts
import { A3DRenderer, A3DScene } from "@aura3d/engine/advanced-runtime";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const scene = new A3DScene();

renderer.render(scene);
renderer.dispose();
```

The `advanced-runtime` subpath is the stable public entrypoint for direct renderer control.

For explicit WebGPU, request the backend directly and surface any failure to the caller:

```ts
try {
  const renderer = await A3DRenderer.create({ backend: "webgpu", canvas });
  await renderer.renderAsync(scene);
  console.log(renderer.device.info.backend, renderer.device.info.renderer);
  renderer.dispose();
} catch (error) {
  console.error("WebGPU unavailable", error);
}
```

For automatic selection in production-runtime workflows, inspect diagnostics:

```ts
import { ProductionRuntimeRenderer } from "@aura3d/engine/production-runtime";

const renderer = new ProductionRuntimeRenderer({ backend: "auto", width: 1280, height: 720 });
const diagnostics = renderer.getDiagnostics();
console.log(diagnostics.backendSelection.selected, diagnostics.backendSelection.reason);
```

Unsupported WebGPU states should remain explicit. Do not convert a failed explicit `backend: "webgpu"` request into a successful WebGL2 result.

## Boundaries

The app API proves that routes and templates can consume public package exports. It does not, by itself, prove every renderer feature, every asset format, every WebGPU device, or every Three.js example category. Keep app claims tied to the workflows, package exports, tests, routes, and generated reports that actually exist.
