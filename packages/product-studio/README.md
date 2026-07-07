# @aura3d/product-studio

`@aura3d/product-studio` owns product asset loading, camera framing,
diagnostics, export, floor, lighting, material modes, render scenes, and
showcase layouts for Aura3D product workflows.

## Public API

- `loadProductAsset`: product asset loading boundary.
- `createProductCameraFrame`, `validateProductCameraFrame`: product camera
  framing helpers.
- `createProductDiagnostics`: product scene diagnostics.
- `exportProductRender`, `exportProductSceneManifest`: product export helpers.
- `createProductFloor`, `createProductLightingPreset`: floor and lighting
  presets for product scenes.
- `createProductMaterialMode`, `applyProductMaterialMode`: material mode
  selection and application.
- `createProductRenderScene`, `updateProductRenderScene`: product render scene
  construction and updates.
- `createProductShowcaseLayout`: product showcase layout helpers.
- `createProductStudio`: product studio workflow assembly.

## Package Boundary

This package is the product workflow layer. Public examples should still use
typed GLB/glTF assets from the CLI pipeline and only claim product-rendering
capabilities that have route-health, screenshot, and browser evidence.
