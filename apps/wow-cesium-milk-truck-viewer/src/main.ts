import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-cesium-milk-truck-viewer",
  title: "Authored Cesium Milk Truck Viewer",
  subtitle: "Imported Cesium Milk Truck GLB staged as a physics/vehicle asset gate with HDR lighting and shadow grounding.",
  assetId: "cesium-milk-truck",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: -0.78,
    pitch: 0.06,
    zoom: 0.86,
    exposure: 1.04,
    roughnessScale: 0.7,
    metallicScale: 1.34,
    clearcoatBoost: 0.34,
    backgroundBlur: 0.08,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: 0.002
});
