import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-boombox-texture-lab",
  title: "Aura3D Avocado Texture Lab",
  subtitle: "Imported Avocado GLB rendered through Aura3D with organic textures, material detail, controlled studio lighting, and clean product staging.",
  assetId: "avocado",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.18,
    pitch: -0.08,
    zoom: 0.68,
    exposure: 1.04,
    roughnessScale: 0.82,
    metallicScale: 1.05,
    clearcoatBoost: 0.08,
    backgroundBlur: 0.1,
    backgroundVisible: false,
    shadows: false
  },
  orbitSpeed: 0.0026
});
