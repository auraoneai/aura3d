import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "architecture-viewer",
  sceneVersion: 1,
  assetId: "generated-civic-gallery-v3",
  assetClass: "generated-local-architecture-gltf",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 45,
  measuredFrames: 180,
  cameraPath: "orbit-plan-section-cycle",
  lighting: "procedural-daylight-plus-interior-fill",
  materialFeatures: ["bounded-pbr", "zone-materials", "section-material-state"],
  postprocessState: { enabled: false, effects: [], sourceEvidence: [] },
  animationState: { enabled: false, clips: 0, skinning: false, morphTargets: false, playback: "static-architecture-view" },
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
    drawCalls: 36,
    triangles: 6120,
    materials: 7,
    materialVariants: 3,
    textures: 0,
    textureBytes: 0,
    geometryBytes: 146880,
    shaders: 2,
    animations: 0,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: ["imported BIM/glTF building model", "triangle-accurate CAD picking", "arbitrary clipping planes", "computed CAD dimensions"],
};

export default scene;
