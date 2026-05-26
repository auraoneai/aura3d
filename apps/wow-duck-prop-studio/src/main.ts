import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-duck-prop-studio",
  title: "Authored Duck Prop Studio",
  subtitle: "Imported Duck GLB as a compact prop-lighting showcase with HDR studio reflection, grounded staging, and live diagnostics.",
  assetId: "duck",
  environmentId: "studio-small-08",
  controls: {
    yaw: 0.34,
    pitch: -0.08,
    zoom: 0.82,
    exposure: 1.26,
    roughnessScale: 0.76,
    metallicScale: 1.08,
    clearcoatBoost: 0.22,
    backgroundBlur: 0.18,
    backgroundVisible: true,
    shadows: true
  },
  orbitSpeed: -0.003
});
