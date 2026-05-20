import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-ocean-temple",
  title: "Authored Lantern Interior Night",
  subtitle: "Imported lantern interior GLB with emissive materials, textured structure, industrial HDRI, and warm cinematic exposure.",
  assetId: "lantern-interior",
  environmentId: "studio-small-08",
  controls: {
    yaw: 0.34,
    pitch: -0.08,
    zoom: 0.82,
    exposure: 1.26,
    roughnessScale: 0.76,
    metallicScale: 1.08,
    clearcoatBoost: 0.22,
    backgroundBlur: 0.18,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.003
});
