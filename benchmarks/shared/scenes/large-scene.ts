import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "large-scene",
  sceneVersion: 2,
  assetId: "generated-architecture-district-foundation",
  assetClass: "generated-local-large-architecture-workload",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "linear-facade-pan",
  lighting: "key-fill-ambient",
  materialFeatures: ["bounded-pbr", "repeated-building-materials", "lod-metadata"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: false, clips: 0, skinning: false, morphTargets: false, playback: "static-camera-pan-workload" },
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false,
    pbr: true,
    skinning: false,
    instancing: false,
    particles: false,
  },
  workload: {
    drawCalls: 1200,
    triangles: 240000,
    materials: 12,
    materialVariants: 0,
    textures: 3,
    textureBytes: 196608,
    geometryBytes: 5760000,
    shaders: 3,
    animations: 0,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: ["streaming/LOD parity", "occlusion culling parity", "shadowed city lighting"],
};

export default scene;
