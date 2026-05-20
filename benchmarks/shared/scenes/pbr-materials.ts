import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "pbr-materials",
  sceneVersion: 1,
  assetId: "generated-pbr-material-grid-v3",
  assetClass: "generated-local-pbr-material-grid",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "fixed-material-grid",
  lighting: "procedural-environment-reflection-sweep",
  materialFeatures: ["metallic-roughness", "dielectric", "emissive", "normal-map-metadata", "alpha-metadata", "double-sided-metadata"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: false, clips: 0, skinning: false, morphTargets: false, playback: "static-material-grid" },
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
    drawCalls: 64,
    triangles: 196608,
    materials: 16,
    materialVariants: 16,
    textures: 4,
    textureBytes: 262144,
    geometryBytes: 4718592,
    shaders: 5,
    animations: 0,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: ["clearcoat/transmission/sheen visual parity", "HDR prefiltered environment maps", "screenshot pixel diff parity"],
};

export default scene;
