import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-additional-cesium-man-animation",
  title: "A3D Additional Cesium Man Animation",
  subtitle: "Additional character-asset route for the Cesium Man GLB with skinned mesh import, HDR lighting, grounded staging, and live route diagnostics.",
  assetId: "cesium-man",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: 0.28,
    pitch: -0.08,
    zoom: 0.72,
    exposure: 1.16,
    roughnessScale: 0.8,
    metallicScale: 0.92,
    clearcoatBoost: 0.08,
    backgroundBlur: 0.08,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.0022
});
