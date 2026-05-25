import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-kira-ik-room",
  title: "Authored Robot Expressive Rig",
  subtitle: "Current checkout does not include the legacy Kira IK GLB; this route now uses the available Robot Expressive GLB as the live rig showcase.",
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
