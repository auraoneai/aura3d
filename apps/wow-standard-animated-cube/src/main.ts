import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-standard-animated-cube",
  title: "A3D Standard Animated Cube",
  subtitle: "Starter route for a compact animated GLB with vertex color detail, HDR studio lighting, shadow grounding, and the reusable A3D route runtime.",
  assetId: "animated-colors-cube",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.18,
    pitch: -0.1,
    zoom: 0.48,
    exposure: 1.18,
    roughnessScale: 0.84,
    metallicScale: 0.9,
    clearcoatBoost: 0.1,
    backgroundBlur: 0.1,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.003
});
