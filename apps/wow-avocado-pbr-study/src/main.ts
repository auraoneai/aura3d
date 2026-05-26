import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-avocado-pbr-study",
  title: "A3D Avocado PBR Study",
  subtitle: "Imported Avocado GLB used as an organic-material example for color texture, roughness variation, normal detail, HDR fill, and close product framing.",
  assetId: "avocado",
  environmentId: "venice-sunset",
  controls: {
    yaw: 0.28,
    pitch: -0.1,
    zoom: 0.7,
    exposure: 1.2,
    roughnessScale: 0.82,
    metallicScale: 0.72,
    clearcoatBoost: 0.08,
    backgroundBlur: 0.12,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0023
});
