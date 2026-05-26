import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-sheen-material-grid",
  title: "A3D Sheen Material Grid",
  subtitle: "Imported sheen material grid GLB rendered as a fabric-response example with studio HDR lighting, texture detail, and grounded inspection staging.",
  assetId: "sheen-test-grid",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: 0.22,
    pitch: -0.12,
    zoom: 0.76,
    exposure: 1.1,
    roughnessScale: 0.76,
    metallicScale: 0.84,
    clearcoatBoost: 0.18,
    backgroundBlur: 0.08,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.002
});
