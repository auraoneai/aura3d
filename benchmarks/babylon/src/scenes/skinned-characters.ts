export default {
  id: "skinned-characters",
  engine: "babylon",
  engineVersion: "7.16.1",
  sceneVersion: 1,
  assetId: "procedural-game-slice",
  resolution: { width: 1280, height: 720, dpr: 1 },
  warmupFrames: 60,
  measuredFrames: 240,
  cameraPath: "fixed-gameplay-camera",
  lighting: "key-plus-emissive-pickups",
  quality: {
    antialias: true,
    shadows: false,
    postprocess: false
  },
  workload: {
    drawCalls: 64,
    triangles: 9600,
    materials: 4,
    materialVariants: 0,
    textures: 0,
    animations: 32,
    particles: 400
  }
} as const;
