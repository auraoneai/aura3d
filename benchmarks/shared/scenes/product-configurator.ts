import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "product-configurator",
  sceneVersion: 2,
  assetId: "generated-headphone-configurator-foundation",
  assetClass: "generated-local-product-gltf",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 45,
  measuredFrames: 180,
  cameraPath: "orbit-hero-with-detail-stop",
  lighting: "procedural-studio-key-fill-environment",
  materialFeatures: ["bounded-pbr", "material-variants", "single-generated-texture"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: false, clips: 0, skinning: false, morphTargets: false, playback: "static-configurator-pose" },
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
    drawCalls: 17,
    triangles: 18324,
    materials: 6,
    materialVariants: 3,
    textures: 1,
    textureBytes: 256,
    geometryBytes: 439776,
    shaders: 3,
    animations: 0,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: ["external commercial glTF product asset", "HDR IBL parity", "texture-compressed material variants", "raytraced/contact shadows"],
};

export default scene;
