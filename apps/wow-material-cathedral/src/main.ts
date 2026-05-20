import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-material-cathedral",
  title: "Authored Robot Expressive Rig",
  subtitle: "Imported Robot Expressive GLB with skins, morph targets, animation clips, and studio framing as an animated-asset source gate.",
  assetId: "robot-expressive",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: 0.18,
    pitch: -0.06,
    zoom: 0.72,
    exposure: 1.08,
    roughnessScale: 0.74,
    metallicScale: 1.26,
    clearcoatBoost: 0.24,
    backgroundBlur: 0.04,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0025
});
