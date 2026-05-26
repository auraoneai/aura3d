# Assets

Version: `1.0.0`

Aura3D asset code covers loading, inspection, diagnostics, render-resource conversion, and local corpus validation.

## Code

- `packages/assets/src/index.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/loadRenderableAsset.ts`
- `packages/assets/src/createRenderableScene.ts`
- `packages/assets/src/AssetCorpus.ts`

## Supported Asset Areas

- glTF/GLB parsing and render-resource conversion.
- OBJ/MTL loader helpers.
- HDR/EXR/image/texture helpers.
- Draco, Meshopt, and KTX2/Basis-facing hooks.
- Material extensions, variants, animation, skins, morph targets, cameras, lights, and diagnostics for selected glTF paths.
- Local fixture manifests under `fixtures/` and `tests/assets/corpus/`.

## Boundary

The asset docs should name the exact loader, fixture, report, or route that supports a claim. Do not claim full glTF ecosystem coverage or every external asset pipeline without evidence.

## Current Limits

Asset coverage is strongest for the named fixtures, loaders, and corpus tests in this repository. Unsupported extensions, external pipeline conventions, and broad ecosystem compatibility require separate fixtures and reports before being documented as supported.

## Current Limits

- Asset support is bounded to named loaders, fixtures, and reports; unsupported external asset conventions still need explicit validation.
