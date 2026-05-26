import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-soldier-animation-viewer",
  title: "Authored Soldier Animation Viewer",
  subtitle: "Imported Soldier GLB with textured skinned character data and multiple animation clips as the character-gallery source gate.",
  assetId: "soldier",
  environmentId: "venice-sunset",
  controls: {
    yaw: -0.42,
    pitch: 0.04,
    zoom: 0.72,
    exposure: 1.16,
    roughnessScale: 0.7,
    metallicScale: 1.18,
    clearcoatBoost: 0.22,
    backgroundBlur: 0.16,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0022
});
