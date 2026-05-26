import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-standard-material-spheres",
  title: "A3D Standard Material Spheres",
  subtitle: "Standard material-comparison route for a compact GLB sphere grid showing roughness, metallic response, HDR reflections, and grounded shadows.",
  assetId: "material-spheres",
  environmentId: "venice-sunset",
  controls: {
    yaw: -0.12,
    pitch: -0.06,
    zoom: 0.68,
    exposure: 1.22,
    roughnessScale: 0.72,
    metallicScale: 1.18,
    clearcoatBoost: 0.2,
    backgroundBlur: 0.14,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.0022
});
