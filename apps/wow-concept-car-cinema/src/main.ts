import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-concept-car-cinema",
  title: "Authored Concept Car Cinema",
  subtitle: "Imported high-triangle concept car GLB with clearcoat, transmission, iridescence, variants, HDR lighting, and cinematic orbit.",
  assetId: "car-concept",
  environmentId: "studio-small-08",
  controls: {
    yaw: -0.38,
    pitch: -0.08,
    zoom: 0.82,
    exposure: 1.18,
    roughnessScale: 0.74,
    metallicScale: 1.18,
    clearcoatBoost: 0.16,
    backgroundBlur: 0.08,
    backgroundVisible: true,
    shadows: true
  },
  lightingRig: {
    keyIntensity: 2.5,
    fillIntensity: 1.1,
    rimIntensity: 1.35
  },
  postProcess: {
    tonemapping: { enabled: true, mode: "aces", exposure: 1.15 },
    bloom: { enabled: true, intensity: 0.22, threshold: 0.8 },
    ssao: { enabled: true, radius: 0.45, intensity: 0.35 },
    fxaa: { enabled: true },
    vignette: { enabled: true, intensity: 0.22 }
  },
  orbitSpeed: 0.0028
});
