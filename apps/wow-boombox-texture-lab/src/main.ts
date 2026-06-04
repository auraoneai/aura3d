import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-boombox-texture-lab",
  title: "A3D Avocado Texture Lab",
  subtitle: "Imported Avocado GLB rendered through A3D with organic material texture, normal detail, HDR lighting, and grounded product staging.",
  assetId: "avocado",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.32,
    pitch: -0.05,
    zoom: 0.25,
    exposure: 1.16,
    roughnessScale: 0.7,
    metallicScale: 1.22,
    clearcoatBoost: 0.16,
    backgroundBlur: 0.1,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0026
});
