import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-additional-transmission-sample",
  title: "A3D Additional Transmission Sample",
  subtitle: "Additional material route for a transmission comparison GLB under high-contrast HDR lighting, useful for inspecting glass-like product response.",
  assetId: "transmission-material-sample",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: -0.3,
    pitch: -0.07,
    zoom: 0.72,
    exposure: 1.28,
    roughnessScale: 0.68,
    metallicScale: 0.94,
    clearcoatBoost: 0.34,
    backgroundBlur: 0.06,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0021
});
