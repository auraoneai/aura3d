import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "particles",
  sceneVersion: 1,
  assetId: "generated-particle-field-foundation",
  assetClass: "generated-local-particle-field-workload",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "fixed-particle-field-camera",
  lighting: "emissive-particles-plus-depth-sorted-blend",
  materialFeatures: ["additive-emissive-particles", "bounded-depth-sort-metadata"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: true, clips: 1, skinning: false, morphTargets: false, playback: "looped-particle-simulation-workload" },
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false,
    pbr: false,
    skinning: false,
    instancing: true,
    particles: true,
  },
  workload: {
    drawCalls: 28,
    triangles: 96000,
    materials: 5,
    materialVariants: 0,
    textures: 2,
    textureBytes: 131072,
    geometryBytes: 2304000,
    shaders: 3,
    animations: 0,
    particles: 2400,
    instances: 2400,
  },
  unsupportedFeatures: ["GPU compute particle parity", "soft-particle depth fade parity", "particle editor workflow parity"],
};

export default scene;
