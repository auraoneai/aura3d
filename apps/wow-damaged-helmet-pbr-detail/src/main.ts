import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-damaged-helmet-pbr-detail",
  title: "Authored Damaged Helmet PBR Detail",
  subtitle: "Imported Damaged Helmet GLB for close PBR texture, normal, occlusion, emissive-panel, and metallic-response inspection.",
  assetId: "damaged-helmet",
  environmentId: "venice-sunset",
  controls: {
    yaw: 0.42,
    pitch: -0.04,
    zoom: 0.74,
    exposure: 1.06,
    roughnessScale: 0.66,
    metallicScale: 1.28,
    clearcoatBoost: 0.36,
    backgroundBlur: 0.12,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0022
});
