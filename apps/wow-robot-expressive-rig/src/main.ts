import { startWowShowcase } from "/apps/wow-common/src/showcase.ts";

void startWowShowcase({
  appId: "wow-robot-expressive-rig",
  title: "Authored Robot Expressive Rig",
  subtitle: "Imported Robot Expressive GLB with rigged character source, morph targets, animation clips, HDR lighting, and diagnostics.",
  assetId: "robot-expressive",
  environmentId: "industrial-sunset-puresky",
  controls: {
    yaw: 0.18,
    pitch: -0.06,
    zoom: 0.72,
    target: [-3, 0, 0],
    exposure: 1.08,
    roughnessScale: 0.8,
    metallicScale: 0.96,
    clearcoatBoost: 0.1,
    backgroundBlur: 0.18,
    backgroundVisible: false,
    shadows: true
  },
  lightingRig: {
    keyIntensity: 2.25,
    fillIntensity: 1.0,
    rimIntensity: 1.2
  },
  postProcess: {
    tonemapping: { enabled: true, mode: "aces", exposure: 1.15 },
    bloom: { enabled: true, intensity: 0.22, threshold: 0.8 },
    ssao: { enabled: true, radius: 0.45, intensity: 0.35 },
    fxaa: { enabled: true },
    vignette: { enabled: true, intensity: 0.22 }
  },
  orbitSpeed: 0.0025
});
