import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-ocean-temple",
  title: "Authored Duck Prop Studio",
  subtitle: "Current checkout does not include the legacy lantern interior GLB; this route now uses the available Duck GLB as a live prop-lighting and grounded-stage showcase.",
  assetId: "duck",
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
