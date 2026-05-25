import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-crystal-cavern",
  title: "Authored Helmet Studio Study",
  subtitle: "Current checkout does not include the legacy sunglasses GLB; this route now uses the available Damaged Helmet GLB for HDR reflection, texture detail, and grounded product lighting.",
  assetId: "damaged-helmet",
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
