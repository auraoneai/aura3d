// Generated geometry contract. Do not edit by hand.
const trackAsset = "showcaseTsukubaCircuit";
const vehicleHash = "sha256-2cb94499492c96cbe6414206c292871cdf8b6c883b5389a4f4c96a05c2ebc935";
const trackHash = "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031";
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png";
const screenshotSha256 = "sha256-3f4c83fa739c76e48787902f7169e683a658618e95e446c092c52ceb140c8c44";
const geometryReport = "tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-racing-track-topology.json";
const routeWidth = 0.38;
const authoredLapSeconds = 38;
const checkpointProgress = [0.167, 0.333, 0.5, 0.667, 0.833, 1] as const;
const roadCenterline = [
  [0.36, -1.16],
  [-0.22, -1.13],
  [-0.72, -1.04],
  [-1.18, -0.82],
  [-1.52, -0.54],
  [-1.77, -0.2],
  [-1.9, 0.1],
  [-1.87, 0.39],
  [-1.78, 0.62],
  [-1.55, 0.88],
  [-1.34, 1.08],
  [-0.9, 1.2],
  [-0.44, 1.22],
  [0.08, 1.18],
  [0.56, 1.06],
  [1.02, 0.84],
  [1.34, 0.58],
  [1.55, 0.22],
  [1.62, -0.16],
  [1.52, -0.52],
  [1.28, -0.84],
  [0.82, -1.04],
  [0.36, -1.16]
].map(([x, z]) => ({ x, z, width: routeWidth }));

const trackTopology = {
  assetId: trackAsset,
  assetHash: trackHash,
  source: "compiler-authored-overlay-validated",
  roadCenterline,
  checkpoints: checkpointProgress.map((progress) => ({ progress, width: routeWidth })),
  lapLengthMeters: 8.742,
  estimatedLapSeconds: authoredLapSeconds,
  confidence: 0.86,
  modelAlignment: {
    source: "compiler-authored-overlay-validated",
    modelBounds: { min: [-9.676, -1, -22.391], max: [25.773, 3.054, 11.481] },
    modelPoint: [8.0485, -1, -5.455],
    gamePoint: { x: 0.36, z: -1.16 },
    anchorPairs: [
      { id: "track-start", modelPoint: [8.0485, -1, -5.455], gamePoint: { x: 0.36, z: -1.16 } },
      { id: "track-far-bend", modelPoint: [20.2, -1, 6.5], gamePoint: { x: 1.34, z: 0.58 } }
    ],
    evidence: {
      routeOverlay: screenshotPath,
      notes: "Compiler-authored topology uses a clean generated racing circuit while retaining the typed Tsukuba asset as the manifest-backed racing topology provenance asset."
    }
  },
  evidence: {
    sourceAsset: "assets.showcaseTsukubaCircuit",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
    routeOverlay: screenshotPath,
    notes: "Public racing route uses a compiler-authored generated circuit for the visible road while retaining the typed circuit asset for certified topology provenance and release evidence."
  }
} as const;

const speedModel = {
  kind: "route-length-over-authored-lap-seconds",
  routeLength: 9.373,
  authoredLapSeconds: 38,
  gameUnitsPerSecond: 0.247,
  sceneUnitsPerGameUnit: 1.151,
  sceneUnitsPerSecond: 0.284297,
  responsiveSceneSpeeds: {
    compact: { targetSceneSize: 5.18, sceneUnitsPerGameUnit: 1.472, sceneUnitsPerSecond: 0.363584 },
    standard: { targetSceneSize: 4.05, sceneUnitsPerGameUnit: 1.151, sceneUnitsPerSecond: 0.284297 }
  },
  units: "game-and-scene-units-per-second"
} as const;

const drivableBounds = { minX: -1.9, maxX: 1.7, minZ: -1, maxZ: 1.3 } as const;
const cameraBounds = { minX: -3.3, maxX: 3.3, minZ: -2.6, maxZ: 2.4 } as const;

export const gameGeometryContract = {
  schema: "aura3d-game-geometry-contract/1.0",
  routeId: "showcase-public-racing-presentation-proof",
  category: "racing",
  sourceReport: geometryReport,
  topology: trackTopology,
  routeWidth, authoredLapSeconds, speedModel, checkpointProgress, roadCenterline,
  drivableBounds, cameraBounds,
  evidence: { screenshotPath, screenshotSha256, geometryReport, manifestHash: trackHash },
  assetHashes: { vehicle: vehicleHash, track: trackHash }
} as const;
