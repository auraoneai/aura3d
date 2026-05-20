import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "asset-render",
  sceneVersion: 1,
  assetId: "generated-asset-inspection-corpus-v3",
  assetClass: "generated-local-asset-inspection-gltf",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 45,
  measuredFrames: 180,
  cameraPath: "turntable-inspection",
  lighting: "asset-viewer-neutral-studio",
  materialFeatures: ["bounded-pbr", "texture-slots", "material-inspection"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: true, clips: 4, skinning: false, morphTargets: false, playback: "turntable-static-animation-metadata" },
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
    drawCalls: 24,
    triangles: 42000,
    materials: 9,
    materialVariants: 0,
    textures: 6,
    textureBytes: 393216,
    geometryBytes: 1008000,
    shaders: 4,
    animations: 0,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: ["external drag/drop asset dependencies", "Draco/Meshopt decode timing", "texture inspector UI parity"],
};

export default scene;
