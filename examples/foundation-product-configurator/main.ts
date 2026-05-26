import { createProductConfiguratorWorkflow } from "@aura3d/workflows";
import { mountFoundationExample } from "../foundation-example-shell";

void mountFoundationExample({
  id: "foundation-product-configurator",
  title: "Product Configurator Foundation",
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
        url: `${location.origin}/fixtures/product-studio/products/watch/watch.gltf`,
        manifestUrl: `${location.origin}/fixtures/product-studio/products/watch/manifest.json`
      },
      materialMode: "contrast",
      lighting: "hero-contrast",
      camera: "front-three-quarter"
    });
  }
});
