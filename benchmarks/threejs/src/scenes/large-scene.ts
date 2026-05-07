export default {
  id: "large-scene",
  engine: "threejs",
  engineVersion: "0.165.0",
  sceneVersion: 1,
  assetId: "procedural-architecture",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "linear-facade-pan",
  lighting: "key-fill-ambient",
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false
  },
  workload: {
    drawCalls: 1200,
    triangles: 24000,
    materials: 5,
    materialVariants: 0,
    textures: 0,
    animations: 0,
    particles: 0
  }
} as const;
