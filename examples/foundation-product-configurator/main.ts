import { createProductConfiguratorWorkflow } from "@galileo3d/workflows";
import { mountV3Example } from "../foundation-example-shell";

void mountV3Example({
  id: "foundation-product-configurator",
  title: "Product Configurator V3",
  summary: "Load a generated product asset, apply product camera and material policies, and render a configurator-ready scene.",
  notes: [
    "The example uses generated product fixtures and the public product configurator workflow.",
    "The workflow produces a product RenderSource, camera, diagnostics, and disposable asset resources.",
    "Use it as the minimal developer-facing entry point for ecommerce and catalog tools."
  ],
  createWorkflow() {
    return createProductConfiguratorWorkflow({
      asset: {
        id: "watch",
        url: `${location.origin}/fixtures/v2/products/watch/watch.gltf`,
        manifestUrl: `${location.origin}/fixtures/v2/products/watch/manifest.json`
      },
      materialMode: "contrast",
      lighting: "hero-contrast",
      camera: "front-three-quarter"
    });
  }
});
