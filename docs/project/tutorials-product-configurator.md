# Tutorial: G3D V6 Product Configurator

This tutorial maps to the V7 flagship viewer in `apps/product-configurator/` and the reusable template in `templates/production-product-viewer/`.

The product path is G3D only. Three.js is used only by the comparison report, not by the app runtime.

## Core API

```ts
import {
  createProductViewer,
  loadGltfScene,
  loadHdrEnvironment
} from "@galileo3d/engine/production-runtime";

const asset = await loadGltfScene({
  url: "/fixtures/asset-corpus/damaged-helmet.glb",
  assetId: "damaged-helmet",
  assetName: "Damaged Helmet"
});

const environment = await loadHdrEnvironment({
  url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
  id: "studio-small-08",
  label: "Studio Small 08",
  intensity: 1.2
});

const viewer = await createProductViewer({
  canvas,
  asset,
  environment,
  camera: { preset: "product-hero", orbit: true },
  lighting: { ibl: true, shadows: true },
  postprocess: {
    toneMapping: "filmic",
    exposure: 1.08,
    bloom: true,
    fxaa: true,
    colorGrade: true
  }
});

viewer.render();
```

## Controls

The viewer exposes a public controller:

- `viewer.controls.rotate(dx, dy)`
- `viewer.controls.pan(dx, dy)`
- `viewer.controls.dolly(scale)`
- `viewer.controls.reset()`
- `viewer.setEnvironment(environment)`
- `viewer.setSettings(settings)`
- `viewer.captureScreenshot()`
- `viewer.diagnostics()`

Useful settings:

```ts
viewer.setSettings({
  exposure: 1.15,
  iblIntensity: 1.4,
  specularIntensity: 1.1,
  environmentRotation: 0.2,
  backgroundVisible: true,
  backgroundBlur: 0.35,
  shadows: true,
  bloom: true,
  fxaa: true,
  colorGrade: true
});

viewer.render();
```

## Verification

```sh
pnpm exec playwright test tests/browser/runtime-parity-product-viewer.spec.ts --reporter=line
```

The comparison artifact is written to:

```text
tests/reports/v7/product-viewer/product-viewer-report.json
```

That report compares G3D against Three.js using the same asset and HDRI. It must be treated as an honest comparison artifact, not proof of full Three.js parity.
