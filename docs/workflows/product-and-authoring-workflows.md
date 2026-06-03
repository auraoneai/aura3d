# Product And Authoring Workflows

Version: 1.0.0

A3D includes workflow packages for product viewers, configurators, asset inspection, material studios, animation labs, comparison scenes, and authoring/runtime bridges. These features were created from the product-workflow and advanced-gallery execution records and now live in `@aura3d/workflows`, `@aura3d/product-studio`, `@aura3d/editor-runtime`, and the consolidated root route registry.

## Package Surfaces

| Package | Role |
|---|---|
| `@aura3d/workflows` | Reusable workflow plans for product configurators, asset viewers, material studios, scene showcases, interactive scenes, animation labs, comparison workflows, diagnostics, and production workflow definitions. |
| `@aura3d/product-studio` | Product asset loading, camera framing, diagnostics, export, floors, lighting, material modes, render-scene updates, showcase layout, and product-studio state. |
| `@aura3d/editor-runtime` | Selection, gizmos, inspector models, hierarchy models, timeline, shader graph, project serialization, prefab registry, plugin host, play-mode bridge, diagnostics overlay, and static export. |
| `@aura3d/debug` | Runtime diagnostics and report export used by workflow evidence. |

## Source Owners

- Workflow definitions: `packages/workflows/src/*`
- Production workflow helpers: `packages/workflows/src/production-runtime/*`
- Product studio package: `packages/product-studio/src/*`
- Product studio package: `packages/product-studio/src/*`
- Product route examples: `/apps/advanced-examples-gallery/#product-configurator`, `apps/wow-standard-product-camera/`, `apps/wow-additional-variant-product/`, `apps/wow-additional-transmission-sample/`
- Advanced configurator source: `apps/advanced-examples-gallery/src/productConfigurator*.ts`

## Current Workflows

The public workflow layer includes:

- `createProductConfiguratorWorkflow`
- `createAssetViewerWorkflow`
- `createMaterialStudioWorkflow`
- `createSceneShowcaseWorkflow`
- `createInteractiveSceneWorkflow`
- `createAnimationLabWorkflow`
- `createComparisonWorkflow`
- `createWorkflowDiagnostics`
- `listProductionWorkflowDefinitions`
- `createProductionWorkflowPlan`
- `runProductionExample`

Product-studio helpers include:

- `loadProductAsset`
- `createProductCameraFrame`
- `createProductDiagnostics`
- `exportProductRender`
- `exportProductSceneManifest`
- `createProductLightingPreset`
- `applyProductMaterialMode`
- `createProductRenderScene`
- `createProductShowcaseLayout`
- `createProductStudio`

## Evidence Commands

Use focused workflow gates when changing the package or app surfaces:

```sh
pnpm product-studio:product
pnpm foundation:workflows
pnpm production-runtime:workflows
pnpm production-runtime:apps
pnpm advanced-gallery:pipeline
```

Focused unit coverage includes:

- `tests/unit/workflows/*`
- `tests/unit/product-studio/*`
- `tests/browser/product-studio-app.spec.ts`
- `tests/browser/product-demos.spec.ts`
- `tests/browser/advanced-examples-gallery.spec.ts`

## Documentation Rules

- Product workflow claims must name the package, app route, template, or report that proves them.
- Product configurator claims must distinguish imported product-asset behavior from route-side staging or material overrides.
- Generated support assets are not product-quality proof unless a route/report explicitly accepts them as visible evidence.

## Current Limits

- Workflow helpers are not a full visual editor replacement.
- Product-studio exports are source/release artifacts, not proof of every commerce or AR integration.
- Advanced-gallery product evidence proves the accepted concept-car route, not every possible product category.
- Template scaffolds require local build/run verification before being used as release evidence.
