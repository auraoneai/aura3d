import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "instancing",
  sceneVersion: 1,
  assetId: "generated-instanced-product-parts-foundation",
  assetClass: "generated-local-instanced-product-parts",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "instanced-grid-orbit",
  lighting: "single-key-plus-environment",
  materialFeatures: ["bounded-pbr", "shared-instance-materials"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: false, clips: 0, skinning: false, morphTargets: false, playback: "static-instanced-grid" },
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false,
    pbr: true,
    skinning: false,
    instancing: true,
    particles: false,
  },
  workload: {
    drawCalls: 32,
    triangles: 153600,
    materials: 4,
    materialVariants: 4,
    textures: 1,
    textureBytes: 65536,
    geometryBytes: 3686400,
    shaders: 2,
    animations: 0,
    particles: 0,
    instances: 4096,
  },
  unsupportedFeatures: [],
};

export default scene;
