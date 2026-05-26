import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-standard-product-camera",
  title: "A3D Standard Product Camera",
  subtitle: "Standard product-asset route using the workflow camera GLB with reusable A3D framing, studio lighting, shadow grounding, and live render metrics.",
  assetId: "product-camera",
  environmentId: "studio-small-08",
  controls: {
    yaw: 0.36,
    pitch: -0.1,
    zoom: 0.64,
    exposure: 1.14,
    roughnessScale: 0.78,
    metallicScale: 1.12,
    clearcoatBoost: 0.18,
    backgroundBlur: 0.1,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0024
});
