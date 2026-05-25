import { createAssetViewerWorkflow } from "@galileo3d/workflows";
import { WorkflowWorkbenchApp, type WorkflowScenario } from "../../legacy-common/src/WorkflowWorkbench";

const scenarios: readonly WorkflowScenario[] = [
  {
    id: "product-camera",
    label: "Product Camera",
    description: "glTF product asset with external images, PBR materials, auto framing, and studio lighting.",
    badge: "A1"
  },
  {
    id: "material-spheres",
    label: "Material Spheres",
    description: "Material fidelity fixture proving textured PBR and render-resource wiring in an app.",
    badge: "PBR"
  },
  {
    id: "external-product",
    label: "External Buffers",
    description: "External glTF buffer and image loading path rendered through the public workflow SDK.",
    badge: "EXT"
  }
];

const assetPaths: Record<string, string> = {
  "product-camera": "/fixtures/v3/assets/product-camera/product-camera.gltf",
  "material-spheres": "/fixtures/v3/assets/material-spheres/material-spheres.gltf",
  "external-product": "/fixtures/v3/assets/product-camera/product-camera-external.gltf"
};

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for Asset Lab.");

const app = new WorkflowWorkbenchApp(root, {
  appId: "asset-lab",
  title: "Asset Lab",
  subtitle: "A real asset inspection surface for loading, framing, lighting, and rendering production glTF fixtures.",
  suiteLabel: "V3 App Suite",
  accent: "#57b984",
  scenarios,
  defaultScenarioId: "product-camera",
  async createWorkflow(scenario) {
    return createAssetViewerWorkflow({
      url: `${location.origin}${assetPaths[scenario.id]}`,
      camera: "auto-frame",
      lighting: "studioProduct",
      shadows: true,
      postprocess: "product-default"
    });
  }
});

void app.start();
