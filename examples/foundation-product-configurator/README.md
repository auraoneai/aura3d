# Product Configurator V3

This example shows the public workflow for a product configurator surface.

It calls `createProductConfiguratorWorkflow()` with a generated product fixture, then renders the returned product scene and camera. The workflow covers product loading, material mode selection, lighting selection, camera selection, diagnostics, and disposal.

Run the browser gate:

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-product-configurator"
```
