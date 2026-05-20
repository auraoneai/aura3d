import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-orbital-fleet",
  title: "Authored Chronograph Configurator",
  subtitle: "Imported chronograph watch GLB with transmission, material variants, multi-material product detail, and warm HDR reflections.",
  assetId: "chronograph-watch",
  environmentId: "venice-sunset",
  controls: {
    yaw: 0.42,
    pitch: -0.04,
    zoom: 0.74,
    exposure: 1.06,
    roughnessScale: 0.66,
    metallicScale: 1.28,
    clearcoatBoost: 0.36,
    backgroundBlur: 0.12,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0022
});
