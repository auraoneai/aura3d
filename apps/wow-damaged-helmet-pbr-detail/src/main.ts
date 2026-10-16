import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-damaged-helmet-pbr-detail",
  title: "Aura3D 4.0 · Damaged Helmet PBR",
  subtitle: "Imported Damaged Helmet GLB for close PBR texture, normal, occlusion, emissive-panel, and metallic-response inspection.",
  assetId: "damaged-helmet",
  environmentId: "venice-sunset",
  controls: {
    yaw: 0.42,
    pitch: -0.04,
    zoom: 0.74,
    exposure: 1.12,
    roughnessScale: 0.76,
    metallicScale: 0.96,
    clearcoatBoost: 0.12,
    backgroundBlur: 0.28,
    backgroundVisible: false,
    shadows: true
  },
  lightingRig: {
    keyIntensity: 2.3,
    fillIntensity: 1.0,
    rimIntensity: 1.28
  },
  postProcess: {
    tonemapping: { enabled: true, mode: "aces", exposure: 1.15 },
    bloom: { enabled: true, intensity: 0.22, threshold: 0.8 },
    ssao: { enabled: true, radius: 2, intensity: 0.32 },
    fxaa: { enabled: true },
    vignette: { enabled: true, intensity: 0.22 }
  },
  orbitSpeed: -0.0022
});
