import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-neon-city",
  title: "Authored Concept Car Cinema",
  subtitle: "Imported high-triangle concept car GLB with clearcoat, transmission, iridescence, variants, HDR lighting, and cinematic orbit.",
  assetId: "car-concept",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.38,
    pitch: -0.08,
    zoom: 0.82,
    exposure: 1.18,
    roughnessScale: 0.78,
    metallicScale: 1.16,
    clearcoatBoost: 0,
    backgroundBlur: 0.05,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0028
});
