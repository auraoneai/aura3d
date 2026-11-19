import { loadGltfScene } from "@aura3d/engine/renderer";
import { startProductScene } from "../../wow-common/src/product-scene";

void startProductScene({
  id: "wow-damaged-helmet-pbr-detail",
  loadModel: (viewport) => loadGltfScene({
    url: "/fixtures/asset-corpus/damaged-helmet.glb",
    assetId: "damaged-helmet",
    assetName: "Damaged Helmet",
    viewport
  }),
  lighting: { intensity: 1.35, reflection: 1.2, specular: 1.15, rotation: 0.62 },
  background: false,
  orbit: { yaw: 0.42, pitch: -0.04, zoom: 0.74, radiansPerSecond: -0.13 }
});
