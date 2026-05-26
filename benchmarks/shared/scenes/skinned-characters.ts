import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "skinned-characters",
  sceneVersion: 2,
  assetId: "generated-skinned-character-crowd-foundation",
  assetClass: "generated-local-skinned-character-workload",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "fixed-gameplay-camera",
  lighting: "key-plus-emissive-pickups",
  materialFeatures: ["unlit-character-materials", "emissive-pickup-materials"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: true, clips: 32, skinning: true, morphTargets: false, playback: "looped-run-cycle-crowd-workload" },
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false,
    pbr: false,
    skinning: true,
    instancing: false,
    particles: true,
  },
  workload: {
    drawCalls: 64,
    triangles: 9600,
    materials: 4,
    materialVariants: 0,
    textures: 0,
    textureBytes: 0,
    geometryBytes: 230400,
    shaders: 2,
    animations: 32,
    particles: 400,
    instances: 0,
  },
  unsupportedFeatures: ["real skinned glTF visual parity", "PBR skinning material parity", "animation retargeting parity"],
};

export default scene;
