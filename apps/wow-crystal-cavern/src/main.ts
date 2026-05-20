import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-crystal-cavern",
  title: "Authored Glass Product Study",
  subtitle: "Imported Khronos sunglasses GLB focused on transmission, volume, IOR, iridescence, glass edges, and HDR reflection.",
  assetId: "sunglasses-khronos",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: -0.18,
    pitch: -0.02,
    zoom: 0.68,
    exposure: 1.18,
    roughnessScale: 0.82,
    metallicScale: 1.1,
    clearcoatBoost: 0.16,
    backgroundBlur: 0.1,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0032
});
