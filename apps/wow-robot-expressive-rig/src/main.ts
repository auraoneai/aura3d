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
    target: [-3, 0, 0],
    exposure: 0.64,
    roughnessScale: 0.82,
    metallicScale: 0.92,
    clearcoatBoost: 0.06,
    backgroundBlur: 0.18,
    backgroundVisible: false,
    shadows: true
  },
  orbitSpeed: 0.0025
});
