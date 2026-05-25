import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-robot-parade",
  title: "Authored Robot Expressive Studio",
  subtitle: "Current checkout does not include the legacy material-variant shoe GLB; this route now uses the available Robot Expressive GLB for rigged asset material and studio-lighting inspection.",
  assetId: "robot-expressive",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.72,
    pitch: -0.02,
    zoom: 0.76,
    exposure: 1.12,
    roughnessScale: 0.72,
    metallicScale: 1.28,
    clearcoatBoost: 0.32,
    backgroundBlur: 0.06,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0024
});
