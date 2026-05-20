# G3D V2: Build A Real Product

> Historical note: This V2 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


EngineReadiness 1 reset the repo direction and created local gates. It did **not** prove that G3D is a real product.

The screenshots below are not product success:

- `tests/reports/product-viewer-v1/product-viewer.png`
- `tests/reports/material-studio-v1/material-studio.png`
- `tests/reports/asset-viewer-v1/asset-viewer.png`
- `tests/reports/rendering-showcase-v1/rendering-showcase.png`

These four screenshots are explicitly rejected. They still look like generated demo output, primitive staging, weak product art, or screenshot-gate bait. They do not count as product evidence, visual baseline, or acceptable output. Passing nonblank/metric tests was not enough.

Do not reuse these files for EngineReadiness 2 evidence:

- Do not copy them into new report folders.
- Do not use them as package-smoke screenshots.
- Do not compare against them as approved baselines.
- Do not describe them as product-quality.
- Do not tune metrics around them.
- Do not keep building small example variants that produce the same look.

The next step is not another visual-quality tool. The next step is to build one real, usable product workflow with better assets, better composition, and actual product code.

## Product Decision

G3D is not currently a game engine, Unity replacement, Unreal replacement, Three.js replacement, or broad renderer parity project.

The next real product is:

**G3D Product Studio: a local browser tool and TypeScript SDK for importing a glTF/GLB product asset, applying sane lighting/material/camera defaults, inspecting problems, and exporting clean product renders.**

The product is real only if a developer can use it to complete this workflow:

1. Open a local app.
2. Load a repo-local product GLB or drop/select another supported GLB.
3. See the product framed, lit, shaded, shadowed, and postprocessed without manual renderer wiring.
4. Switch material/lighting/camera presets.
5. See loader warnings and unsupported feature fallbacks.
6. Export a screenshot and a compact scene manifest.
7. Install the package in a clean app and use the same API.

If that workflow is not usable, G3D still does not have a product.

## Non-Negotiable Standards

- No more counting screenshots that are merely nonblank.
- No proof panels, JSON blocks, debug overlays, grid spam, or metric decoration in product screenshots.
- No generated primitive render kit may be the main proof of product value.
- No broad parity language.
- No Unity/Unreal/Babylon claims.
- No Three.js replacement claim.
- No docs-only completion.
- No checklist row is done until a user-facing workflow, test, report, and artifact exist.
- If an artifact looks bad to a human, it is failed even if metrics pass.

## What EngineReadiness 1 Means

EngineReadiness 1 established:

- A direction away from impossible parity claims.
- A local canonical render path.
- A minimal asset-to-render API.
- A minimal V1 public example set.
- Local engine-readiness reports.

EngineReadiness 1 did **not** establish:

- A product.
- A credible product viewer.
- A credible material studio.
- A credible asset viewer.
- A credible visual identity.
- A package a developer would choose over Three.js.

Treat the EngineReadiness 1 screenshots as temporary pipeline evidence, not as success.

For EngineReadiness 2, treat these exact files as failed/rejected output:

- `tests/reports/product-viewer-v1/product-viewer.png`
- `tests/reports/material-studio-v1/material-studio.png`
- `tests/reports/asset-viewer-v1/asset-viewer.png`
- `tests/reports/rendering-showcase-v1/rendering-showcase.png`

The EngineReadiness 2 implementation must produce new evidence from `apps/product-studio`, not from `examples/*-v1`.

## EngineReadiness 2 Goal

Build one coherent product slice:

**G3D Product Studio V1**

The deliverable is not four demos. The deliverable is one product-quality workflow with a small SDK behind it.

## What To Actually Build

Build this product:

**A local product-rendering studio for ecommerce/catalog renders.**

The user opens `apps/product-studio`, chooses one of three real product assets, changes lighting/material/camera presets, sees warnings when the asset uses unsupported features, and exports a clean PNG plus a scene manifest.

This is the actual build target:

```text
apps/product-studio/
  index.html
  src/main.ts
  src/ProductStudioApp.ts
  src/ProductStudioState.ts
  src/ProductStudioViewport.ts
  src/ProductStudioControls.ts
  src/ProductStudioExports.ts

packages/product-studio/
  package.json
  src/index.ts
  src/ProductStudio.ts
  src/ProductAsset.ts
  src/ProductAssetLoader.ts
  src/ProductRenderScene.ts
  src/ProductLighting.ts
  src/ProductCamera.ts
  src/ProductMaterials.ts
  src/ProductFloor.ts
  src/ProductExport.ts
  src/ProductDiagnostics.ts

fixtures/v2/products/
  camera-kit/
  speaker/
  watch/
```

If the repo structure makes a new package too expensive, build the SDK under `packages/assets/src/product-studio/` and export it from `@galileo3d/assets`, but keep the same public function names.

## Start Here: Filename-By-Filename Build Order

Do the work in this order. Do not start browser screenshot tests, visual metrics, product-readiness tools, or package smoke until build steps 1 through 5 exist in code.

### Step 1: Generate Real Product Assets

Create and implement:

- [ ] `tools/v2-generate-products/index.ts`

This file must write the product assets. It is not a verifier.

It must:

- [ ] Create `fixtures/v2/products/camera-kit/camera-kit.gltf`.
- [ ] Create `fixtures/v2/products/camera-kit/manifest.json`.
- [ ] Create `fixtures/v2/products/speaker/speaker.gltf`.
- [ ] Create `fixtures/v2/products/speaker/manifest.json`.
- [ ] Create `fixtures/v2/products/watch/watch.gltf`.
- [ ] Create `fixtures/v2/products/watch/manifest.json`.
- [ ] Write embedded or sidecar texture data referenced by the glTF files.
- [ ] Use valid glTF 2.0 JSON with named nodes, meshes, materials, textures, images, accessors, bufferViews, and buffers.
- [ ] Generate products with actual product-like structure, not render-time `RenderItem` arrays.
- [ ] Include manifest fields:
  - `id`
  - `displayName`
  - `source`
  - `license`
  - `generated`
  - `assetPath`
  - `partCount`
  - `materialCount`
  - `textureSlots`
  - `bounds`
  - `cameraTargets`
  - `expectedWarnings`

The generator must create these product parts:

- [ ] `camera-kit`: body, lens barrel, lens glass, grip, top dials, shutter button, rear screen, strap lugs, tripod plate.
- [ ] `speaker`: cabinet, grille, woofer cone, tweeter, knobs, rear port, rubber feet.
- [ ] `watch`: case, bezel, crystal, face, hour hand, minute hand, tick markers, crown, strap.

The generator must create these product materials:

- [ ] `camera-kit`: matte black body, rubber grip, brushed metal dials, transparent lens glass, emissive screen.
- [ ] `speaker`: satin cabinet, patterned grille, rubber cone, metallic knobs.
- [ ] `watch`: polished metal case, glass crystal, matte face, bright tick markers, strap material.

The generator must create or reference these texture slots:

- [ ] base color texture.
- [ ] metallic-roughness texture.
- [ ] normal texture.
- [ ] emissive texture where applicable.
- [ ] alpha or transparent material where applicable.

Done means:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json tools/v2-generate-products/index.ts
```

creates the product corpus without needing any renderer, browser, or screenshot test.

EngineReadiness 2 must start here because the rejected V1 screenshots prove the current visual inputs are not good enough. Better tests cannot fix bad assets and weak product composition.

### Step 2: Add The Product Studio Package

Create:

- [ ] `packages/product-studio/package.json`
- [ ] `packages/product-studio/src/index.ts`
- [ ] `packages/product-studio/src/ProductTypes.ts`
- [ ] `packages/product-studio/src/ProductAsset.ts`
- [ ] `packages/product-studio/src/ProductAssetLoader.ts`
- [ ] `packages/product-studio/src/ProductRenderScene.ts`
- [ ] `packages/product-studio/src/ProductLighting.ts`
- [ ] `packages/product-studio/src/ProductCamera.ts`
- [ ] `packages/product-studio/src/ProductMaterials.ts`
- [ ] `packages/product-studio/src/ProductFloor.ts`
- [ ] `packages/product-studio/src/ProductExport.ts`
- [ ] `packages/product-studio/src/ProductDiagnostics.ts`
- [ ] `packages/product-studio/src/ProductStudio.ts`

Update:

- [ ] `pnpm-workspace.yaml` if needed.
- [ ] `package.json` root `exports` if using root package subpath export.
- [ ] root `package.json` `devDependencies` or workspace references if needed.
- [ ] `tsconfig.build.json` only if package inclusion requires it.

#### `packages/product-studio/src/ProductTypes.ts`

Must define:

- [ ] `ProductLightingPreset`
- [ ] `ProductCameraPreset`
- [ ] `ProductMaterialMode`
- [ ] `ProductFloorMode`
- [ ] `ProductPostprocessPreset`
- [ ] `ProductStudioOptions`
- [ ] `ProductAsset`
- [ ] `ProductPart`
- [ ] `ProductMaterialSummary`
- [ ] `ProductTextureSummary`
- [ ] `ProductAssetWarning`
- [ ] `ProductRenderScene`
- [ ] `ProductRenderSceneOptions`
- [ ] `ProductRenderResult`
- [ ] `ProductExportOptions`
- [ ] `ProductSceneManifest`
- [ ] `ProductStudio`

#### `packages/product-studio/src/ProductAssetLoader.ts`

Must implement:

- [ ] `loadProductAsset(url: string, options?: ProductAssetLoadOptions): Promise<ProductAsset>`

It must:

- [ ] Use the existing `GLTFLoader`.
- [ ] Use existing glTF render-resource creation where possible.
- [ ] Extract named product parts from nodes/meshes.
- [ ] Extract material summaries from glTF materials.
- [ ] Extract texture summaries from glTF textures/images.
- [ ] Compute bounds from geometry.
- [ ] Preserve original asset material references.
- [ ] Return warnings for unsupported or partial features.
- [ ] Never return a successful asset with empty bounds unless the product is genuinely empty, which should be an error.

#### `packages/product-studio/src/ProductLighting.ts`

Must implement:

- [ ] `createProductLightingPreset(preset: ProductLightingPreset): ProductLightingConfig`

Preset behavior:

- [ ] `studio`: neutral catalog lighting.
- [ ] `softbox`: broad product softbox lighting.
- [ ] `catalog`: bright ecommerce lighting with restrained shadows.
- [ ] `dramatic`: strong key/rim lighting.
- [ ] `inspection`: flat-ish inspection lighting that still preserves material response.

It must produce:

- [ ] renderer environment lighting.
- [ ] direct lights.
- [ ] shadow options.
- [ ] postprocess recommendation.

#### `packages/product-studio/src/ProductCamera.ts`

Must implement:

- [ ] `createProductCameraFrame(asset: ProductAsset, preset: ProductCameraPreset, viewport: { width: number; height: number }): ProductCameraFrame`
- [ ] `validateProductCameraFrame(frame: ProductCameraFrame, asset: ProductAsset): ProductCameraValidation`

Preset behavior:

- [ ] `auto`: fit full product.
- [ ] `hero`: three-quarter product catalog view.
- [ ] `front`: front orthographic-like perspective.
- [ ] `side`: side view.
- [ ] `top`: top-down view.
- [ ] `detail`: closer view of a meaningful product region from manifest metadata.

It must:

- [ ] Keep product visible.
- [ ] Avoid clipping.
- [ ] Use product bounds and camera target metadata.
- [ ] Produce camera diagnostics.

#### `packages/product-studio/src/ProductMaterials.ts`

Must implement:

- [ ] `createProductMaterialMode(mode: ProductMaterialMode, asset: ProductAsset): ProductMaterialOverride`
- [ ] `applyProductMaterialMode(scene: ProductRenderScene, mode: ProductMaterialMode): ProductRenderScene`

Mode behavior:

- [ ] `asset`: original asset materials.
- [ ] `clay`: neutral clay material across all product parts.
- [ ] `matte-plastic`: matte product plastic override.
- [ ] `polished-metal`: metallic product override.
- [ ] `fallback-issues`: highlight parts with warnings/fallbacks.

It must:

- [ ] Not mutate original asset resources.
- [ ] Preserve texture/material summaries.
- [ ] Report which parts were overridden.

#### `packages/product-studio/src/ProductFloor.ts`

Must implement:

- [ ] `createProductFloor(asset: ProductAsset, mode: ProductFloorMode): ProductFloorRenderItems`

Modes:

- [ ] `none`
- [ ] `matte-shadow`
- [ ] `studio-sweep`

It must:

- [ ] Size floor from product bounds.
- [ ] Place product visually on or above floor.
- [ ] Avoid grid spam.

#### `packages/product-studio/src/ProductRenderScene.ts`

Must implement:

- [ ] `createProductRenderScene(asset: ProductAsset, options?: ProductRenderSceneOptions): Promise<ProductRenderScene>`
- [ ] `updateProductRenderScene(scene: ProductRenderScene, options: Partial<ProductRenderSceneOptions>): ProductRenderScene`

It must:

- [ ] Combine asset render resources, lighting, camera, material mode, floor, shadows, and postprocess.
- [ ] Return a normal renderer `RenderSource` or equivalent input.
- [ ] Include diagnostics and warnings.
- [ ] Avoid app-specific code.

#### `packages/product-studio/src/ProductExport.ts`

Must implement:

- [ ] `exportProductRender(studio: ProductStudio, options?: ProductExportOptions): Promise<Blob | Uint8Array>`
- [ ] `exportProductSceneManifest(scene: ProductRenderScene): ProductSceneManifest`

It must:

- [ ] Export PNG bytes from the actual product studio canvas.
- [ ] Export selected asset, material mode, lighting preset, camera preset, warnings, bounds, and renderer diagnostics.

#### `packages/product-studio/src/ProductDiagnostics.ts`

Must implement:

- [ ] `createProductDiagnostics(scene: ProductRenderScene, renderResult: ProductRenderResult): ProductDiagnostics`

It must report:

- [ ] draw calls.
- [ ] product part count.
- [ ] material count.
- [ ] texture count.
- [ ] warnings.
- [ ] active lighting.
- [ ] active material mode.
- [ ] active camera.
- [ ] camera coverage.
- [ ] export status.

#### `packages/product-studio/src/ProductStudio.ts`

Must implement:

- [ ] `createProductStudio(options: ProductStudioOptions): Promise<ProductStudio>`

Returned object must implement:

- [ ] `render(scene)`
- [ ] `resize(width, height)`
- [ ] `setLighting(preset)`
- [ ] `setCamera(preset)`
- [ ] `setMaterialMode(mode)`
- [ ] `exportPng(options)`
- [ ] `exportSceneManifest()`
- [ ] `dispose()`

#### `packages/product-studio/src/index.ts`

Must export:

- [ ] every public type from `ProductTypes.ts`.
- [ ] `createProductStudio`.
- [ ] `loadProductAsset`.
- [ ] `createProductRenderScene`.
- [ ] `updateProductRenderScene`.
- [ ] `exportProductRender`.
- [ ] `exportProductSceneManifest`.

### Step 3: Add The Product Studio Browser App

Create:

- [ ] `apps/product-studio/index.html`
- [ ] `apps/product-studio/src/main.ts`
- [ ] `apps/product-studio/src/ProductStudioApp.ts`
- [ ] `apps/product-studio/src/ProductStudioState.ts`
- [ ] `apps/product-studio/src/ProductStudioViewport.ts`
- [ ] `apps/product-studio/src/ProductStudioControls.ts`
- [ ] `apps/product-studio/src/ProductStudioExports.ts`
- [ ] `apps/product-studio/src/styles.ts` if the app uses TS-authored styles.

#### `apps/product-studio/src/ProductStudioState.ts`

Must define:

- [ ] current asset id.
- [ ] loaded asset state.
- [ ] selected lighting preset.
- [ ] selected material mode.
- [ ] selected camera preset.
- [ ] selected floor mode.
- [ ] export state.
- [ ] warning state.
- [ ] render diagnostics state.

#### `apps/product-studio/src/ProductStudioViewport.ts`

Must:

- [ ] create the canvas renderer.
- [ ] load/render `ProductRenderScene`.
- [ ] resize cleanly.
- [ ] expose screenshot/export access to the actual canvas.
- [ ] never draw debug overlays by default.

#### `apps/product-studio/src/ProductStudioControls.ts`

Must create real controls:

- [ ] asset selector: `camera-kit`, `speaker`, `watch`.
- [ ] lighting selector: `studio`, `softbox`, `catalog`, `dramatic`, `inspection`.
- [ ] material selector: `asset`, `clay`, `matte-plastic`, `polished-metal`, `fallback-issues`.
- [ ] camera selector: `auto`, `hero`, `front`, `side`, `top`, `detail`.
- [ ] floor selector: `none`, `matte-shadow`, `studio-sweep`.
- [ ] export PNG button.
- [ ] export manifest button.

#### `apps/product-studio/src/ProductStudioExports.ts`

Must:

- [ ] call SDK export functions.
- [ ] keep latest PNG bytes available to tests.
- [ ] keep latest scene manifest JSON available to tests.
- [ ] expose export status in app state.

#### `apps/product-studio/src/ProductStudioApp.ts`

Must:

- [ ] wire state, controls, viewport, and exports together.
- [ ] load `camera-kit` by default.
- [ ] re-render when controls change.
- [ ] show compact warnings and asset summary.
- [ ] expose `window.__G3D_PRODUCT_STUDIO__`.
- [ ] never depend on `examples/product-viewer-v1`, `examples/material-studio-v1`, `examples/asset-viewer-v1`, or `examples/rendering-showcase-v1`.
- [ ] never load or copy the rejected V1 screenshots.

#### `apps/product-studio/src/main.ts`

Must:

- [ ] bootstrap `ProductStudioApp`.
- [ ] report startup errors into app state.

### Step 4: Wire Workspace And Exports

Update:

- [ ] `pnpm-workspace.yaml` to include `packages/product-studio` if needed.
- [ ] root `package.json` exports to expose product studio API.
- [ ] root `package.json` scripts for `v2:*`.
- [ ] `tests/browser/example-dev-server.ts` package import map so browser tests can import the new package.
- [ ] `tsconfig.build.json` if needed.
- [ ] package `files` list if needed for distribution.

### Step 5: Only Then Add Tests And Readiness Tools

After steps 1 through 4 exist, create:

- [ ] `tests/assets/v2-product-assets.test.ts`
- [ ] `tests/unit/product-studio/product-asset-loader.test.ts`
- [ ] `tests/unit/product-studio/product-camera.test.ts`
- [ ] `tests/unit/product-studio/product-lighting.test.ts`
- [ ] `tests/unit/product-studio/product-materials.test.ts`
- [ ] `tests/unit/product-studio/product-export.test.ts`
- [ ] `tests/browser/product-studio-app.spec.ts`
- [ ] `tools/v2-truth/index.ts`
- [ ] `tools/v2-product-assets/index.ts`
- [ ] `tools/v2-sdk/index.ts`
- [ ] `tools/v2-app/index.ts`
- [ ] `tools/v2-product-evidence/index.ts`
- [ ] `tools/v2-package-smoke/index.ts`
- [ ] `tools/v2-product-readiness/index.ts`

These files prove the product. They are not the product.

Every EngineReadiness 2 browser screenshot must come from:

- `apps/product-studio/index.html`

No EngineReadiness 2 screenshot may come from:

- `examples/product-viewer-v1/`
- `examples/material-studio-v1/`
- `examples/asset-viewer-v1/`
- `examples/rendering-showcase-v1/`

## Code To Write

### Product Asset Generator

Create:

- `tools/v2-generate-products/index.ts`

This script must generate real glTF or GLB files under `fixtures/v2/products/`. Do not hand-wave with render items. Do not use `createProductTurntableRenderKit` as the product.

Generate these three assets:

#### `camera-kit`

Parts:

- main camera body
- lens barrel
- lens glass
- grip
- top dials
- shutter button
- rear screen
- strap lugs
- tripod plate

Materials:

- matte black body
- textured rubber grip
- brushed metal dials
- transparent blue lens glass
- emissive rear screen or indicator

Textures:

- rubber grip normal/height texture
- lens radial texture
- subtle body roughness texture

#### `speaker`

Parts:

- speaker cabinet
- front grille
- woofer cone
- tweeter
- control knobs
- rear port
- rubber feet

Materials:

- satin cabinet
- perforated/fabric grille
- dark rubber cone
- metallic knob caps

Textures:

- grille alpha or pattern texture
- cabinet roughness texture
- cone radial normal texture

#### `watch`

Parts:

- watch case
- bezel
- glass crystal
- watch face
- hour/minute hands
- tick markers
- crown
- strap/links

Materials:

- polished metal case
- glass crystal
- matte face
- emissive or bright tick markers
- leather/rubber/metal strap variant

Textures:

- face dial texture
- strap normal/roughness texture
- brushed metal roughness texture

Each generated product must have:

- A glTF/GLB file.
- A `manifest.json`.
- Multiple named nodes.
- Multiple named materials.
- Texture slots in the asset, not only renderer-side procedural materials.
- Bounds metadata.
- Screenshot target metadata:
  - hero camera
  - detail camera
  - front camera
  - side camera

### Product Studio SDK

Create the SDK with these public types and functions:

```ts
export type ProductLightingPreset =
  | "studio"
  | "softbox"
  | "catalog"
  | "dramatic"
  | "inspection";

export type ProductCameraPreset =
  | "auto"
  | "hero"
  | "front"
  | "side"
  | "top"
  | "detail";

export type ProductMaterialMode =
  | "asset"
  | "clay"
  | "matte-plastic"
  | "polished-metal"
  | "fallback-issues";

export interface ProductStudioOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width?: number;
  readonly height?: number;
}

export interface ProductAsset {
  readonly id: string;
  readonly name: string;
  readonly sourceUrl: string;
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  readonly parts: readonly ProductPart[];
  readonly materials: readonly ProductMaterialSummary[];
  readonly warnings: readonly ProductAssetWarning[];
}

export interface ProductRenderSceneOptions {
  readonly lighting?: ProductLightingPreset;
  readonly camera?: ProductCameraPreset;
  readonly materialMode?: ProductMaterialMode;
  readonly floor?: "none" | "matte-shadow" | "studio-sweep";
  readonly postprocess?: "off" | "catalog" | "cinematic";
}

export interface ProductStudio {
  render(scene: ProductRenderScene): Promise<ProductRenderResult> | ProductRenderResult;
  resize(width: number, height: number): void;
  setLighting(preset: ProductLightingPreset): void;
  setCamera(preset: ProductCameraPreset): void;
  setMaterialMode(mode: ProductMaterialMode): void;
  exportPng(options?: ProductExportOptions): Promise<Blob | Uint8Array>;
  exportSceneManifest(): ProductSceneManifest;
  dispose(): void;
}

export function createProductStudio(options: ProductStudioOptions): Promise<ProductStudio>;
export function loadProductAsset(url: string, options?: ProductAssetLoadOptions): Promise<ProductAsset>;
export function createProductRenderScene(asset: ProductAsset, options?: ProductRenderSceneOptions): Promise<ProductRenderScene>;
export function exportProductRender(studio: ProductStudio, options?: ProductExportOptions): Promise<Blob | Uint8Array>;
```

Required SDK internals:

- `ProductAssetLoader.ts`
  - wraps the current glTF loader
  - creates render resources
  - extracts node/material/texture summaries
  - computes bounds
  - records warnings and unsupported features
- `ProductLighting.ts`
  - maps product lighting presets to renderer lighting/postprocess/shadow settings
  - no app-specific light setup
- `ProductCamera.ts`
  - computes camera frames for `auto`, `hero`, `front`, `side`, `top`, and `detail`
  - guarantees the subject remains visible
- `ProductMaterials.ts`
  - implements material override modes
  - preserves original asset material mode
  - creates clay/plastic/metal/fallback materials
- `ProductFloor.ts`
  - creates matte shadow floor or studio sweep as reusable render items
- `ProductExport.ts`
  - exports PNG from the actual canvas
  - exports scene manifest JSON
- `ProductDiagnostics.ts`
  - reports draw calls, texture count, material count, warnings, camera coverage, and active presets

### Product Studio App

Build the app as an actual tool:

```text
┌──────────────────────────────────────────────┐
│ top toolbar: asset / lighting / material / camera / export │
├──────────────────────────────────────────────┤
│                                              │
│              product viewport                │
│                                              │
├──────────────────────────────────────────────┤
│ compact warnings + asset/material summary    │
└──────────────────────────────────────────────┘
```

Required app behavior:

- Default load `camera-kit`.
- Asset selector switches `camera-kit`, `speaker`, `watch`.
- Lighting selector changes the live render.
- Material selector changes the live render.
- Camera selector changes the live render.
- Export PNG button writes or exposes the PNG.
- Export manifest button writes or exposes JSON.
- Warnings panel lists unsupported/fallback features.
- The app exposes a compact `window.__G3D_PRODUCT_STUDIO__` state for tests.

Default screenshot must be mostly viewport/product, not UI.

### What Not To Build

Do not build:

- Another four-example portfolio.
- Another screenshot-only gate.
- Another generic renderer benchmark.
- Another proof panel.
- Another procedural primitive scene.
- A replacement claim.
- A marketing landing page.

Build the actual product studio.

## Product Surface

### 1. SDK API

The SDK must expose a high-level product-rendering API:

```ts
import {
  createProductStudio,
  loadProductAsset,
  createProductRenderScene,
  exportProductRender
} from "@galileo3d/product-studio";

const studio = await createProductStudio({ canvas });
const asset = await loadProductAsset("/fixtures/v2/products/camera-kit/camera-kit.glb");
const scene = await createProductRenderScene(asset, {
  lighting: "softbox",
  camera: "auto",
  materialMode: "asset",
  floor: "matte-shadow",
  postprocess: "catalog"
});

await studio.render(scene);
await exportProductRender(studio, { format: "png" });
```

The actual package path may be a workspace package or a subpath export, but the API must be that simple.

### 2. Browser App

The browser app must be:

- `apps/product-studio/index.html`
- `apps/product-studio/src/main.ts`

It must be a usable tool, not a report page.

Required UI:

- Asset selector for repo-local sample assets.
- Drop/select file control for GLB/GLTF if supported by the current loader path.
- Viewport with the product as the dominant subject.
- Lighting preset selector.
- Material mode selector:
  - asset materials
  - clay
  - polished metal
  - matte plastic
  - issue/fallback material
- Camera preset selector:
  - hero
  - front
  - side
  - top
  - detail
- Screenshot export button.
- Scene manifest export button.
- Compact warnings panel.

The UI must not dominate the screenshot. Default screenshot evidence should be viewport-first.

### 3. Real Product Asset Corpus

EngineReadiness 2 requires repo-local product assets under:

- `fixtures/v2/products/`

Minimum required products:

- `camera-kit`
- `speaker`
- `watch`

Each product must include:

- GLB or glTF asset.
- Manifest JSON.
- At least three mesh parts.
- At least four material regions.
- At least three texture slots across the product set.
- Bounds metadata.
- Expected warnings/fallbacks metadata.
- Source/license metadata.

Generated assets are allowed only if they are generated into real glTF/GLB files and look like products, not loose primitives arranged for metrics.

Do not use the old `createProductTurntableRenderKit` as the primary product proof.

### 4. Product Renderer

Required files:

- `packages/product-studio/src/ProductStudio.ts`
- `packages/product-studio/src/ProductAsset.ts`
- `packages/product-studio/src/ProductRenderScene.ts`
- `packages/product-studio/src/ProductLighting.ts`
- `packages/product-studio/src/ProductCamera.ts`
- `packages/product-studio/src/ProductMaterials.ts`
- `packages/product-studio/src/ProductExport.ts`
- `packages/product-studio/src/index.ts`

If creating a new package is too disruptive, use:

- `packages/assets/src/product-studio/*`
- `packages/rendering/src/product-studio/*`

But the public API must still be exported cleanly.

Required behavior:

- Load supported product GLB/glTF assets.
- Compute stable bounds and camera framing.
- Apply lighting presets without example code.
- Apply material override modes without changing the asset.
- Render with shadows and postprocess through the renderer path.
- Export PNG from canvas.
- Export scene manifest JSON.
- Report unsupported features as warnings.
- Never fail with blank output for a supported asset.

## Required Milestones

Milestones must be completed in order.

### Milestone 0: Stop Counting EngineReadiness 1 As Product Success

Deliverables:

- [ ] `docs/project/v2-roadmap-status.md`
- [ ] `tests/reports/v2-current-reality.json`
- [ ] Mark EngineReadiness 1 screenshots as pipeline evidence only, not product evidence.
- [ ] Mark the four V1 screenshots as rejected output.
- [ ] Update docs so no V1 screenshot is described as product-quality proof.
- [ ] Add a clear note to `docs/project/v2-roadmap-status.md`: "The next deliverable is Product Studio, not more example screenshots."

Exit command:

```sh
pnpm v2:truth
```

Acceptance:

- [ ] Report states that EngineReadiness 1 screenshots do not prove product success.
- [ ] Report lists the four rejected V1 screenshot paths by filename.
- [ ] Report states that EngineReadiness 2 screenshots must come from `apps/product-studio`.
- [ ] Docs block broad parity and product-complete wording.

### Milestone 1: Product Asset Corpus

Deliverables:

- [ ] `tools/v2-generate-products/index.ts`
- [ ] `fixtures/v2/products/camera-kit/camera-kit.glb`
- [ ] `fixtures/v2/products/camera-kit/manifest.json`
- [ ] `fixtures/v2/products/speaker/speaker.glb`
- [ ] `fixtures/v2/products/speaker/manifest.json`
- [ ] `fixtures/v2/products/watch/watch.glb`
- [ ] `fixtures/v2/products/watch/manifest.json`
- [ ] `tools/v2-product-assets/index.ts`
- [ ] `tests/assets/v2-product-assets.test.ts`

Exit command:

```sh
pnpm v2:assets
```

Acceptance:

- [ ] Product assets are generated or authored as actual glTF/GLB assets before any product screenshot test is written.
- [ ] Assets load through the normal loader.
- [ ] Assets have multiple parts and material regions.
- [ ] Assets have real bounds.
- [ ] Assets are not just primitive proof arrangements.
- [ ] Manifest records source/license/generated status.
- [ ] Report generated at `tests/reports/v2-product-assets.json`.

### Milestone 2: Product Studio SDK

Deliverables:

- [ ] `packages/product-studio/package.json`
- [ ] `packages/product-studio/src/index.ts`
- [ ] `packages/product-studio/src/ProductStudio.ts`
- [ ] `packages/product-studio/src/ProductAsset.ts`
- [ ] `packages/product-studio/src/ProductAssetLoader.ts`
- [ ] `packages/product-studio/src/ProductRenderScene.ts`
- [ ] `packages/product-studio/src/ProductLighting.ts`
- [ ] `packages/product-studio/src/ProductCamera.ts`
- [ ] `packages/product-studio/src/ProductMaterials.ts`
- [ ] `packages/product-studio/src/ProductFloor.ts`
- [ ] `packages/product-studio/src/ProductExport.ts`
- [ ] `packages/product-studio/src/ProductDiagnostics.ts`
- [ ] Public exports.
- [ ] Implement the public API exactly enough for `createProductStudio`, `loadProductAsset`, `createProductRenderScene`, and `exportProductRender`.
- [ ] Unit tests for asset load, bounds, lighting preset, material override, camera preset, warnings, and manifest export.
- [ ] Package smoke import coverage for the new API.

Exit command:

```sh
pnpm v2:sdk
```

Acceptance:

- [ ] The SDK contains product workflow code, not only test wrappers around old examples.
- [ ] A caller can load a product and create a render scene in fewer than 30 lines.
- [ ] No caller needs low-level shader, framebuffer, render-device, or pass setup.
- [ ] Unsupported product features create warnings, not blank screens.
- [ ] Report generated at `tests/reports/v2-sdk.json`.

### Milestone 3: Product Studio App

Deliverables:

- [ ] `apps/product-studio/index.html`
- [ ] `apps/product-studio/src/main.ts`
- [ ] `apps/product-studio/src/ProductStudioApp.ts`
- [ ] `apps/product-studio/src/ProductStudioState.ts`
- [ ] `apps/product-studio/src/ProductStudioViewport.ts`
- [ ] `apps/product-studio/src/ProductStudioControls.ts`
- [ ] `apps/product-studio/src/ProductStudioExports.ts`
- [ ] Product Studio controls.
- [ ] Screenshot export.
- [ ] Scene manifest export.
- [ ] Warning/fallback panel.
- [ ] No visible debug overlays by default.

Exit command:

```sh
pnpm v2:app
```

Acceptance:

- [ ] App is built before browser screenshot assertions are tightened.
- [ ] App opens locally.
- [ ] Default asset renders as the dominant subject.
- [ ] Lighting presets visibly change output.
- [ ] Camera presets visibly change framing without losing the product.
- [ ] Material modes visibly change output.
- [ ] Exported PNG exists.
- [ ] Exported scene manifest exists.
- [ ] Report generated at `tests/reports/v2-product-studio-app.json`.

### Milestone 4: Product-Quality Browser Evidence

Deliverables:

- [ ] `tests/browser/product-studio-app.spec.ts`
- [ ] `tests/reports/v2-product-studio/hero.png`
- [ ] `tests/reports/v2-product-studio/material-clay.png`
- [ ] `tests/reports/v2-product-studio/material-metal.png`
- [ ] `tests/reports/v2-product-studio/lighting-softbox.png`
- [ ] `tests/reports/v2-product-studio/lighting-studio.png`
- [ ] `tests/reports/v2-product-studio/camera-detail.png`
- [ ] `tests/reports/v2-product-studio/exported-render.png`
- [ ] `tests/reports/v2-product-studio/exported-scene.json`
- [ ] `tests/reports/v2-product-studio/manifest.json`

Exit command:

```sh
pnpm v2:product-evidence
```

Acceptance:

- [ ] Browser evidence exercises the real app and SDK, not a standalone harness.
- [ ] Screenshots show a real product, not a diagnostic scene.
- [ ] Product is dominant in the viewport.
- [ ] UI does not dominate product screenshots.
- [ ] Material changes are visible.
- [ ] Lighting changes are visible.
- [ ] Camera changes are visible.
- [ ] Exports are generated by the app workflow.
- [ ] Report records warnings and blocked features honestly.

### Milestone 5: Clean Package Consumer

Deliverables:

- [ ] `tools/v2-package-smoke/index.ts`
- [ ] Fresh temporary app.
- [ ] Fresh package tarball install.
- [ ] Browser render from the package API.
- [ ] Screenshot generated from the temporary app, not copied from monorepo reports.

Exit command:

```sh
pnpm v2:package-smoke
```

Acceptance:

- [ ] Temporary app imports the product studio API from the packed package.
- [ ] Temporary app renders one product asset.
- [ ] Temporary app writes a PNG screenshot.
- [ ] Report generated at `tests/reports/v2-package-smoke.json`.
- [ ] Screenshot generated at `tests/reports/v2-package-smoke/screenshot.png`.

### Milestone 6: Real Product Gate

Deliverables:

- [ ] `tools/v2-product-readiness/index.ts`
- [ ] `tests/reports/v2-product-readiness.json`
- [ ] `docs/project/v2-*-roadmap/product-readiness.md`

Exit command:

```sh
pnpm v2:product
```

Acceptance:

- [ ] All prior EngineReadiness 2 milestones pass.
- [ ] Product Studio app evidence is fresh.
- [ ] Package consumer evidence is fresh.
- [ ] Docs describe exactly what is supported and blocked.
- [ ] No broad parity or replacement claim appears in docs, package metadata, app UI, reports, or examples.

## Package Scripts To Add

```json
{
  "v2:truth": "tsx --tsconfig tsconfig.base.json tools/v2-truth/index.ts",
  "v2:assets": "pnpm v2:truth && pnpm exec vitest run tests/assets/v2-product-assets.test.ts --reporter=dot && tsx --tsconfig tsconfig.base.json tools/v2-product-assets/index.ts",
  "v2:sdk": "pnpm typecheck && pnpm exec vitest run tests/unit/product-studio --reporter=dot && tsx --tsconfig tsconfig.base.json tools/v2-sdk/index.ts",
  "v2:app": "pnpm exec playwright test tests/browser/product-studio-app.spec.ts --grep @app --reporter=line && tsx --tsconfig tsconfig.base.json tools/v2-app/index.ts",
  "v2:product-evidence": "pnpm exec playwright test tests/browser/product-studio-app.spec.ts --reporter=line && tsx --tsconfig tsconfig.base.json tools/v2-product-evidence/index.ts",
  "v2:package-smoke": "pnpm build && tsx --tsconfig tsconfig.base.json tools/v2-package-smoke/index.ts",
  "v2:product": "pnpm v2:assets && pnpm v2:sdk && pnpm v2:app && pnpm v2:product-evidence && pnpm v2:package-smoke && tsx --tsconfig tsconfig.base.json tools/v2-product-readiness/index.ts"
}
```

## Prompt To Run

You are working in `/Users/gurbakshchahal/G3D`.

Your job is to execute `docs/project/v2-roadmap-product-asset-pipeline-plan.md` and build a real product slice: **G3D Product Studio V1**.

Do not continue polishing the EngineReadiness 1 V1 example screenshots. Treat those screenshots as pipeline evidence only. The user has rejected them as looking like the same weak demo output, and that rejection is valid.

Start by writing product code, not tests. Implement Milestone 0, then build the product asset generator, the product assets, the Product Studio SDK, and the Product Studio app. Only after those exist should you write screenshot tests and readiness tools. Do not skip to screenshots before the product asset corpus and SDK exist. Do not count a screenshot unless it comes from the product workflow. Do not claim product success until `pnpm v2:product` passes and the completion audit maps every requirement in this file to concrete evidence.

Remember: the existing V1 screenshots are already known bad output. Do not defend them, tune them, recycle them, or continue iterating around them. Build Product Studio.

The final answer must include:

- Commands run.
- Reports generated.
- Screenshots generated.
- Product workflow implemented.
- What is still blocked.
- Whether `pnpm v2:product` passes.

## Completion Audit Checklist

Before declaring EngineReadiness 2 complete, verify all of these against real files and command output:

- [ ] `docs/project/v2-roadmap-product-asset-pipeline-plan.md` exists.
- [ ] `docs/project/v2-roadmap-status.md` exists.
- [ ] Product assets exist under `fixtures/v2/products/`.
- [ ] Product assets load through the normal loader.
- [ ] Product Studio SDK exists and is exported.
- [ ] Product Studio app exists.
- [ ] App can load/select products.
- [ ] App can change lighting presets.
- [ ] App can change material modes.
- [ ] App can change camera presets.
- [ ] App can export PNG.
- [ ] App can export scene manifest.
- [ ] Browser product screenshots exist and are fresh.
- [ ] Package smoke screenshot comes from a temporary package consumer app.
- [ ] `pnpm v2:truth` passes.
- [ ] `pnpm v2:assets` passes.
- [ ] `pnpm v2:sdk` passes.
- [ ] `pnpm v2:app` passes.
- [ ] `pnpm v2:product-evidence` passes.
- [ ] `pnpm v2:package-smoke` passes.
- [ ] `pnpm v2:product` passes.
- [ ] No broad parity/replacement claim appears in active product docs, UI, package metadata, examples, or reports.

## Kill Criteria

Kill or pivot the custom renderer if any of these remain true after a serious EngineReadiness 2 implementation attempt:

- Product Studio cannot render a loaded GLB product without custom per-example renderer code.
- Product screenshots still look like primitive/generated demo output.
- Product asset setup still needs low-level render-device or shader wiring.
- The package API cannot be consumed from a clean temporary app.
- Exported screenshots are copied from monorepo reports instead of generated by the product workflow.
- The only way to make the product look acceptable is to add fake visual detail, proof grids, or metric bait.

If killed, preserve the useful editor/assets/runtime code and pivot G3D to a higher-level tooling layer on top of Three.js or Babylon.js instead of continuing the custom renderer as the core product.
