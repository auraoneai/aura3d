# App API

Version: `0.1.0-alpha.0`

The app API is the highest-level browser-facing surface in Galileo3D. It wraps the core engine, renderer creation, workflow presets, and diagnostics behind `createG3DApp`.

```ts
import { createG3DApp } from "@galileo3d/engine";
```

The same API is also available from the package module:

```ts
import { createG3DApp } from "@galileo3d/engine/apps";
```

## What It Does

`createG3DApp(options)` creates an app runtime with:

- a `@galileo3d/core` `Engine`;
- optional WebGL2 renderer creation when a canvas is supplied;
- quality presets: `draft`, `balanced`, and `production`;
- workflow presets for asset viewing, product configuration, material studio, scene showcase, and interactive scene demos;
- renderer and engine diagnostics;
- explicit async disposal.

It is intended for productized browser tools and starter templates, not for engine-internal tests that need full low-level control.

## Basic Usage

```ts
import { createG3DApp } from "@galileo3d/engine";

const app = await createG3DApp({
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

## Quality Presets

| Preset | Default intent |
|---|---|
| `draft` | Faster local previews, lower canvas size, fewer expensive presentation defaults. |
| `balanced` | Default development quality for examples and templates. |
| `production` | Higher canvas target and preserve-drawing-buffer behavior for screenshots and review tools. |

These presets are convenience defaults. They are not a production-readiness guarantee.

## Workflow Presets

| Preset | Intended use |
|---|---|
| `asset-viewer` | Load a renderable asset and return a scene source/camera pair. |
| `product-configurator` | Product-scene workflow with variants and viewer defaults. |
| `material-studio` | Material preview and authoring workflow surface. |
| `scene-showcase` | Procedural or fixture-backed scene showcase. |
| `interactive-scene` | Input, picking, and interactive object workflow surface. |

Workflows return renderable source data. If the app owns a renderer, `renderWorkflow(...)` also submits the result and records diagnostics.

## Diagnostics

```ts
const snapshot = app.diagnostics();
```

The snapshot includes:

- app state;
- quality preset resolution;
- workflow run count;
- last workflow;
- last renderer diagnostics when a renderer exists;
- core engine diagnostics.

Use this for route health, smoke tests, UI panels, and benchmark evidence. Do not convert a single diagnostics snapshot into a broad performance or compatibility claim.

## Root Helpers

The root package also exposes app-adjacent helpers:

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
} from "@galileo3d/engine";
```

Use these helpers for product viewers, asset inspection, route diagnostics, and template code.

## Direct Runtime Alternative

Use `@galileo3d/engine/v9` when you need direct rendering control:

```ts
import { G3DRenderer, G3DScene } from "@galileo3d/engine/v9";

const renderer = await G3DRenderer.create({ backend: "webgl2", canvas });
const scene = new G3DScene();

renderer.render(scene);
renderer.dispose();
```

The app API is workflow-oriented. The V9 runtime is scene/rendering-oriented.

## Boundaries

The app API proves that browser routes and templates can consume public package exports. It does not prove:

- full Three.js API parity;
- production renderer readiness;
- complete glTF ecosystem support;
- full WebGPU parity;
- broad Unity/Unreal-style editor replacement.

Keep app API claims scoped to the workflows, routes, tests, and package exports that currently exist.

