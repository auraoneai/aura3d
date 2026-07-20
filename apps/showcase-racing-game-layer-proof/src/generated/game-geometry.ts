// Generated geometry contract. Do not edit by hand.
const trackAsset = "showcaseTsukubaCircuit";
const vehicleHash = "sha256-2cb94499492c96cbe6414206c292871cdf8b6c883b5389a4f4c96a05c2ebc935";
const trackHash = "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031";
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png";
const screenshotSha256 = "sha256-3a1345c4fef100b94f36eb99e24244938b9939e6938b519c639bba5ec800b3de";
const geometryReport = "tests/reports/showcase-spec-compiler/racing-game-layer-proof/game-template/showcase-racing-game-layer-proof-racing-track-topology.json";
const manifestHash = "sha256-9d78be7f9a236a153a1afd97e21c867fbad198d86155b88e90719877e1773993";
const routeWidth = 0.18;
const authoredLapSeconds = 36;
const checkpointProgress = [0.167, 0.333, 0.5, 0.667, 0.833, 1] as const;
const roadCenterline = [
  [-1.72, 0.76], [-1.28, 1.18], [-0.42, 1.08], [0.14, 0.52], [0.02, -0.12], [-0.72, -0.4],
  [-1.12, -0.02], [-0.68, 0.5], [0.18, 0.36], [0.92, 0.78], [1.54, 0.42], [1.32, -0.34],
  [0.58, -0.74], [-0.26, -0.88], [-1.18, -0.56], [-1.74, 0.04], [-1.72, 0.76]
].map(([x, z]) => ({ x, z, width: routeWidth }));

const trackTopology = {
  assetId: trackAsset,
  assetHash: trackHash,
  source: "manifest-authored-overlay-validated",
  roadCenterline,
  checkpoints: checkpointProgress.map((progress) => ({ progress, width: routeWidth })),
  lapLengthMeters: 8.742,
  estimatedLapSeconds: authoredLapSeconds,
  confidence: 0.82,
  modelAlignment: {
    source: "manifest-authored-overlay-validated",
    modelBounds: { min: [-9.676, -1, -22.391], max: [25.773, 3.054, 11.481] },
    modelPoint: [8.0485, -1, -5.455],
    gamePoint: { x: -0.1, z: 0.15 },
    anchorPairs: [
      { id: "track-start", modelPoint: [8.0485, -1, -5.455], gamePoint: { x: -0.1, z: 0.15 } },
      { id: "track-far-bend", modelPoint: [20.2, -1, 6.5], gamePoint: { x: 1.54, z: 0.42 } }
    ],
    evidence: { routeOverlay: screenshotPath, notes: "Overlay-validated topology anchors the route to the typed Tsukuba circuit." }
  },
  evidence: {
    sourceAsset: "assets.showcaseTsukubaCircuit",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
    routeOverlay: screenshotPath,
    notes: "Certified racing proof route uses this retained road centerline for checkpoints, lap timing, car placement, and camera framing."
  }
} as const;

const speedModel = {
  kind: "route-length-over-authored-lap-seconds",
  routeLength: 12.379,
  authoredLapSeconds: 36,
  gameUnitsPerSecond: 0.344,
  sceneUnitsPerGameUnit: 0.732,
  sceneUnitsPerSecond: 0.251808,
  responsiveSceneSpeeds: {
    compact: { targetSceneSize: 1.8, sceneUnitsPerGameUnit: 0.549, sceneUnitsPerSecond: 0.188856 },
    standard: { targetSceneSize: 2.4, sceneUnitsPerGameUnit: 0.732, sceneUnitsPerSecond: 0.251808 }
  },
  units: "game-and-scene-units-per-second"
} as const;

const drivableBounds = { minX: -1.9, maxX: 1.7, minZ: -1, maxZ: 1.3 } as const;
const cameraBounds = { minX: -3.2, maxX: 3.2, minZ: -2.4, maxZ: 2.2 } as const;
export const gameGeometryContract = { schema: "aura3d-game-geometry-contract/1.0", routeId: "showcase-racing-game-layer-proof", category: "racing", sourceReport: geometryReport, topology: trackTopology, routeWidth, authoredLapSeconds, speedModel, checkpointProgress, roadCenterline, drivableBounds, cameraBounds, evidence: { screenshotPath, screenshotSha256, geometryReport, manifestHash }, assetHashes: { vehicle: vehicleHash, track: trackHash } } as const;
