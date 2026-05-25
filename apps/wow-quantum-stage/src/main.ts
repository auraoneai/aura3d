import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-quantum-stage",
  title: "Authored Soldier Animation Asset",
  subtitle: "Current checkout does not include the legacy XBot GLB; this route now uses the available Soldier GLB as the live skinned character source gate.",
  assetId: "soldier",
  environmentId: "studio-small-08",
  controls: {
    yaw: 0.18,
    pitch: -0.04,
    zoom: 0.72,
    exposure: 1.14,
    roughnessScale: 0.76,
    metallicScale: 1.18,
    clearcoatBoost: 0.32,
    backgroundBlur: 0.04,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0018
});
