import { createAssetViewerWorkflow } from "@aura3d/workflows";
import { mountV3Example } from "../foundation-example-shell";

void mountV3Example({
  id: "foundation-asset-viewer",
  title: "Asset Viewer V3",
  summary: "Load a glTF product fixture through the public workflow SDK, create render resources, auto-frame the camera, and draw it with the renderer.",
  notes: [
    "The example imports only @aura3d/workflows and the shared public example shell.",
    "The workflow handles glTF loading, render-resource creation, lighting, shadows, postprocess, and diagnostics.",
    "Use this as the smallest credible asset viewer starting point."
  ],
  createWorkflow() {
    return createAssetViewerWorkflow({
      url: `${location.origin}/fixtures/workflow-assets/assets/product-camera/product-camera.gltf`,
      camera: "auto-frame",
      lighting: "studioProduct",
      shadows: true,
      postprocess: "product-default"
    });
  }
});
