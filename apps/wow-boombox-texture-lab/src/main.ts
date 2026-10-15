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
    exposure: 1.15,
    roughnessScale: 0.78,
    metallicScale: 1.08,
    clearcoatBoost: 0.12,
    backgroundBlur: 0.1,
    backgroundVisible: false,
    shadows: true
  },
  lightingRig: {
    keyIntensity: 2.35,
    fillIntensity: 1.05,
    rimIntensity: 1.25
  },
  postProcess: {
    tonemapping: { enabled: true, mode: "aces", exposure: 1.15 },
    bloom: { enabled: true, intensity: 0.22, threshold: 0.8 },
    ssao: { enabled: true, radius: 0.45, intensity: 0.35 },
    fxaa: { enabled: true },
    vignette: { enabled: true, intensity: 0.22 }
  },
  orbitSpeed: 0.0026
});
