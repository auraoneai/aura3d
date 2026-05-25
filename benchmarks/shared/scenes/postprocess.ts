import type { BenchmarkSceneDescriptor } from "./descriptor.js";

const scene: BenchmarkSceneDescriptor = {
  id: "postprocess",
  sceneVersion: 1,
  assetId: "generated-postprocess-lab-v4",
  assetClass: "bounded-local-postprocess-real-scene-readback",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 45,
  measuredFrames: 180,
  cameraPath: "fixed-emissive-product-closeup",
  lighting: "bounded-hdr-input-to-ldr-postprocess",
  materialFeatures: ["bounded-pbr", "emissive-bright-pixels", "linear-to-srgb-output"],
  postprocessState: {
    enabled: true,
    effects: ["tone-mapping", "bloom", "fxaa"],
    sourceEvidence: [
      "packages/rendering/src/PostProcessPass.ts",
      "examples/postprocess-lab/main.ts",
      "examples/material-showroom/main.ts",
      "tests/reports/foundation-rendering.json",
    ],
  },
  animationState: { enabled: false, clips: 0, skinning: false, morphTargets: false, playback: "static-bright-pixel-readback" },
  quality: {
    antialias: true,
    shadows: false,
    postprocess: true,
    pbr: true,
    skinning: false,
    instancing: false,
    particles: false,
  },
  workload: {
    drawCalls: 22,
    triangles: 65536,
    materials: 8,
    materialVariants: 4,
    textures: 4,
    textureBytes: 262144,
    geometryBytes: 1572864,
    shaders: 6,
    animations: 0,
    particles: 0,
    instances: 0,
  },
  unsupportedFeatures: [
    "HDR floating-point render-target parity",
    "SSAO/SSR/TAA/DOF parity",
    "depth-aware soft particles",
    "external-engine product-render postprocess visual parity",
  ],
};

export default scene;
