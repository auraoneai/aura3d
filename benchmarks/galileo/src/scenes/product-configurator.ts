export default {
  id: "product-configurator",
  engine: "galileo",
  engineVersion: "0.0.0-rebuild",
  sceneVersion: 1,
  assetId: "procedural-product",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 30,
  measuredFrames: 120,
  cameraPath: "orbit-hero-30deg",
  lighting: "single-key-plus-fill",
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false
  },
  workload: {
    drawCalls: 4,
    triangles: 6144,
    materials: 3,
    materialVariants: 3,
    textures: 0,
    animations: 0,
    particles: 0
  }
} as const;
