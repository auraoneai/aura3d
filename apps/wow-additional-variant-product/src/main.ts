import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-additional-variant-product",
  title: "A3D Additional Variant Product",
  subtitle: "Additional product workflow route for a multi-material variant GLB with close product framing, HDR lighting, and route-health instrumentation.",
  assetId: "variant-product",
  environmentId: "studio-small-08",
  controls: {
    yaw: 0.22,
    pitch: -0.08,
    zoom: 0.6,
    exposure: 1.16,
    roughnessScale: 0.8,
    metallicScale: 1.08,
    clearcoatBoost: 0.22,
    backgroundBlur: 0.08,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0026
});
