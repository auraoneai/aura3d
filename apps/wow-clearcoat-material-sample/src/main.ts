import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-clearcoat-material-sample",
  title: "A3D Clearcoat Material Sample",
  subtitle: "Imported clearcoat material test GLB with reflective studio lighting, normal-map response, and material-extension diagnostics exposed through the A3D route runtime.",
  assetId: "clear-coat-test",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.48,
    pitch: -0.08,
    zoom: 0.74,
    exposure: 1.24,
    roughnessScale: 0.58,
    metallicScale: 1.12,
    clearcoatBoost: 0.46,
    backgroundBlur: 0.06,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0021
});
