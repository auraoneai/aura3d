import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-robot-expressive-rig",
  title: "Authored Robot Expressive Rig",
  subtitle: "Imported Robot Expressive GLB with rigged character source, morph targets, animation clips, HDR lighting, and diagnostics.",
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
