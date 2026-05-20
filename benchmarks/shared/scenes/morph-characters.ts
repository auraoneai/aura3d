import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "morph-characters",
  sceneVersion: 1,
  assetId: "generated-morph-character-v4",
  assetClass: "generated-local-morph-character-workload",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "fixed-character-morph-preview-camera",
  lighting: "key-fill-rim-character-preview",
  materialFeatures: ["unlit-character-materials", "morph-diagnostic-colors"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: true, clips: 2, skinning: false, morphTargets: true, playback: "looped-morph-weight-sweep-workload" },
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false,
    pbr: false,
    skinning: false,
    instancing: false,
    particles: false,
  },
  workload: {
    drawCalls: 18,
    triangles: 12288,
    materials: 3,
    materialVariants: 0,
    textures: 1,
    textureBytes: 65536,
    geometryBytes: 589824,
    shaders: 3,
    animations: 2,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: [
    "real morph glTF visual parity",
    "skinning plus morph playback parity",
    "morph target tangent/normal recomputation parity",
    "external-engine morph animation inspector parity",
  ],
};

export default scene;
