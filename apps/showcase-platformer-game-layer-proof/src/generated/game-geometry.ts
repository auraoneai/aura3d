// Generated geometry contract. Do not edit by hand.
const routeId = "showcase-platformer-game-layer-proof";
const worldAsset = "showcaseSideScrollerWorld";
const characterHash = "sha256-93872fc24240a071b6195d6f1339f40b09b3308dc998311252d21ebd9042d8c6";
const worldHash = "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4";
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png";
const screenshotSha256 = "sha256-3f8035ee9afce79750eb310a8795b758dc719c62263dd753b956874ebbd5f5d6";
const geometryReport = "tests/reports/showcase-spec-compiler/platformer-game-layer-proof/game-template/showcase-platformer-game-layer-proof-platformer-playable-surfaces.json";
const manifestHash = "sha256-9d78be7f9a236a153a1afd97e21c867fbad198d86155b88e90719877e1773993";
const authoredPlayableSeconds = 36;
const playableSurfaces = [
  { id: "proof-main-runway", x: 2.4, y: 0, width: 7.4, height: 0.34, kind: "ground" },
  { id: "proof-lower-bridge", x: 9.6, y: 0.12, width: 6.4, height: 0.34, kind: "platform" },
  { id: "proof-mid-span", x: 16.2, y: 0.28, width: 6.6, height: 0.34, kind: "platform" },
  { id: "proof-gap-run", x: 22.8, y: 0.18, width: 5.8, height: 0.34, kind: "platform" },
  { id: "proof-upper-run", x: 29.6, y: 0.34, width: 7.8, height: 0.34, kind: "platform" }
] as const;
const hazardSurfaces = [
  { id: "proof-hazard-gap-01", x: 19.2, y: 0.52, width: 0.42, height: 0.24, kind: "hazard" },
  { id: "proof-hazard-gap-02", x: 27.2, y: 0.58, width: 0.42, height: 0.24, kind: "hazard" }
] as const;
const checkpointSurfaces = [
  { id: "proof-checkpoint-start", x: 6, y: 0.72, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-bridge", x: 11.2, y: 0.84, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-mid", x: 16.8, y: 1, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-hazard", x: 23.4, y: 0.92, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-final", x: 30.6, y: 1.08, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-finish", x: 35.2, y: 1.08, width: 1.1, height: 1.1, kind: "checkpoint" }
] as const;
const finishSurface = { id: "proof-finish-ledges", x: 35.2, y: 0.7, width: 1.1, height: 1.1, kind: "finish" } as const;
const playableSurfaceMap = {
  assetId: worldAsset,
  assetHash: worldHash,
  source: "manifest-authored-overlay-validated",
  surfaces: [...playableSurfaces, finishSurface, ...hazardSurfaces, ...checkpointSurfaces],
  levelLength: 37.2,
  estimatedCompletionSeconds: authoredPlayableSeconds,
  characterScaleRatio: 0.38,
  confidence: 0.8,
  modelAlignment: {
    source: "manifest-authored-overlay-validated",
    modelBounds: { min: [-192.317, -102.591, -85.575], max: [188.919, 206.984, 238.905] },
    modelPoint: [-1.699, -102.591, 76.665],
    gamePoint: { x: 16.1, y: 0 },
    anchorPairs: [
      { id: "proof-main-runway-anchor", modelPoint: [-1.699, -102.591, 76.665], gamePoint: { x: 16.1, y: 0 } },
      { id: "proof-finish-anchor", modelPoint: [120, -102, 145], gamePoint: { x: 35.2, y: 0.7 } }
    ],
    evidence: { routeOverlay: screenshotPath, notes: "Overlay-validated surface anchors bind the playable route to the typed side-scroller world." }
  },
  evidence: {
    sourceAsset: "assets.showcaseSideScrollerWorld",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
    routeOverlay: screenshotPath,
    notes: "Certified platformer proof route uses this retained surface map for contact, hazards, checkpoints, finish progression, and camera framing."
  }
} as const;

const worldAssetBindings = [{ worldAsset, worldAssetHash: worldHash, surfaceSource: "manifest-authored-overlay-validated", confidence: 0.8, surfaceIds: playableSurfaces.map((surface) => surface.id) }] as const;
const level = {
    id: `${routeId}-surface-bound-level`,
    start: { x: 2.4, y: 0.36 },
    finish: { x: 33.5, y: 0.7 },
    moveSpeed: 0.94,
    jumpVelocity: 7.4,
    lowerBound: -1.4,
    platforms: playableSurfaces.map((surface) => ({ id: surface.id, x: surface.x - surface.width / 2, y: surface.y, width: surface.width, height: surface.height })),
    collectibles: [{ id: "proof-coin-01", x: 3.16, y: 1.06, radius: 0.34, value: 50 }, { id: "proof-coin-02", x: 14.3, y: 1.56, value: 50 }, { id: "proof-coin-03", x: 30.3, y: 1.7, value: 50 }],
    hazards: hazardSurfaces.map((hazard) => ({ id: hazard.id, x: hazard.x - hazard.width / 2, y: hazard.y, width: hazard.width, height: hazard.height, respawn: true })),
    checkpoints: checkpointSurfaces.map((checkpoint) => ({ id: checkpoint.id, x: checkpoint.x, y: checkpoint.y, radius: 0.9 }))
  } as const;
const worldBounds = { minX: -1.3, maxX: 36, minY: -1.4, maxY: 2.2 } as const;
const cameraBounds = { minX: -2, maxX: 35.8, minY: -0.8, maxY: 2.6 } as const;
export const gameGeometryContract = { schema: "aura3d-game-geometry-contract/1.0", routeId, category: "platformer", sourceReport: geometryReport, surfaceMap: playableSurfaceMap, playableSurfaces, hazardSurfaces, checkpointSurfaces, finishSurface, worldAssetBindings, level, authoredPlayableSeconds, worldBounds, cameraBounds, evidence: { screenshotPath, screenshotSha256, geometryReport, manifestHash }, assetHashes: { character: characterHash, world: worldHash } } as const;
