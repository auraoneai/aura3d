import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-particle-vortex",
  title: "Authored Antique Camera Interior",
  subtitle: "Imported antique-camera interior GLB with authored texture detail, prop complexity, HDR lighting, and grounded shadow stage.",
  assetId: "antique-camera-interior",
  environmentId: "venice-sunset",
  controls: {
    yaw: 0.38,
    pitch: -0.06,
    zoom: 0.78,
    exposure: 1.12,
    roughnessScale: 0.68,
    metallicScale: 1.18,
    clearcoatBoost: 0.2,
    backgroundBlur: 0.14,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0024
});
