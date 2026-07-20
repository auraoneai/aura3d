// Generated geometry contract. Do not edit by hand.
const routeId = "showcase-public-platformer-presentation-proof";
const worldAsset = "showcaseSideScrollerWorld";
const characterHash = "sha256-93872fc24240a071b6195d6f1339f40b09b3308dc998311252d21ebd9042d8c6";
const worldHash = "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4";
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-public-platformer-presentation-proof.png";
const screenshotSha256 = "sha256-cbcbbc77e556eedc2b32d307e9cf4f3907178121f04f3f0b36577dfb1941bf5e";
const geometryReport = "tests/reports/showcase-spec-compiler/public-platformer-presentation-proof/game-template/showcase-public-platformer-presentation-proof-platformer-playable-surfaces.json";
const authoredPlayableSeconds = 34;
const playableSurfaces = [
  { id: "public-ground-start", x: 1.8, y: 0, width: 5.2, height: 0.4, kind: "ground" },
  { id: "public-market-hop", x: 6.8, y: 0.62, width: 3.6, height: 0.32, kind: "platform" },
  { id: "public-rooftop-bridge", x: 10.8, y: 1.04, width: 3.8, height: 0.32, kind: "platform" },
  { id: "public-lantern-drop", x: 15.1, y: 0.54, width: 4.2, height: 0.32, kind: "platform" },
  { id: "public-finish-run", x: 20, y: 0.86, width: 5.6, height: 0.32, kind: "platform" }
] as const;
const hazardSurfaces = [
  { id: "public-hazard-gap-01", x: 7.9, y: 0.9, width: 0.55, height: 0.34, kind: "hazard" },
  { id: "public-hazard-gap-02", x: 15.8, y: 0.79, width: 0.55, height: 0.34, kind: "hazard" }
] as const;
const checkpointSurfaces = [
  { id: "public-checkpoint-market", x: 4.4, y: 0.82, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "public-checkpoint-rooftop", x: 10.9, y: 1.42, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "public-checkpoint-lantern", x: 16.7, y: 0.96, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "public-checkpoint-finish", x: 21.1, y: 1.34, width: 1.1, height: 1.1, kind: "checkpoint" }
] as const;
const finishPoint = { id: "public-finish-marker", x: 19.5, y: 1.18 } as const;

const playableSurfaceMap = {
  assetId: worldAsset,
  assetHash: worldHash,
  source: "compiler-authored-overlay-validated",
  surfaces: [...playableSurfaces, ...hazardSurfaces, ...checkpointSurfaces],
  levelLength: 23.2,
  estimatedCompletionSeconds: authoredPlayableSeconds,
  characterScaleRatio: 0.38,
  confidence: 0.88,
  modelAlignment: {
    source: "compiler-authored-overlay-validated",
    modelBounds: { min: [-0.8, 0, -1], max: [22.8, 3.2, 1] },
    modelPoint: [1.8, 0, 0],
    gamePoint: { x: 1.8, y: 0 },
    anchorPairs: [
      { id: "public-platformer-start-anchor", modelPoint: [1.8, 0, 0], gamePoint: { x: 1.8, y: 0 } },
      { id: "public-platformer-finish-anchor", modelPoint: [20, 0.86, 0], gamePoint: { x: 20, y: 0.86 } }
    ],
    evidence: {
      routeOverlay: screenshotPath,
      notes: "Compiler-authored public platformer surface map overlays the retained route-primary screenshot while using the typed side-scroller world as manifest-backed provenance."
    }
  },
  evidence: {
    sourceAsset: "assets.showcaseSideScrollerWorld",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
    routeOverlay: screenshotPath,
    notes: "Public platformer route renders generated playable surfaces for the visible stage while retaining the typed side-scroller world for certified surface-map provenance and release evidence."
  }
} as const;

const worldAssetBindings = [{ worldAsset, worldAssetHash: worldHash, surfaceSource: "compiler-authored-overlay-validated", confidence: 0.88, surfaceIds: playableSurfaces.map((surface) => surface.id) }] as const;
const level = {
    id: `${routeId}-certified-surface-route`,
    start: { x: 0.6, y: 0.4 },
    finish: finishPoint,
    moveSpeed: 0.62,
    jumpVelocity: 7.4,
    lowerBound: -1.5,
    platforms: playableSurfaces.map((surface) => ({
      id: surface.id,
      x: surface.x - surface.width / 2,
      y: surface.y,
      width: surface.width,
      height: surface.height
    })),
    collectibles: [
      { id: "public-coin-01", x: 3.2, y: 1.08, radius: 0.28, value: 50 },
      { id: "public-coin-02", x: 10.9, y: 1.86, radius: 0.28, value: 50 },
      { id: "public-coin-03", x: 19.9, y: 1.58, radius: 0.28, value: 50 }
    ],
    hazards: hazardSurfaces.map((hazard) => ({
      id: hazard.id,
      x: hazard.x - hazard.width / 2,
      y: hazard.y,
      width: hazard.width,
      height: hazard.height,
      respawn: true
    })),
    checkpoints: checkpointSurfaces.map((checkpoint) => ({
      id: checkpoint.id,
      x: checkpoint.x,
      y: checkpoint.y,
      radius: 0.85
    }))
  } as const;
const worldBounds = { minX: -1.2, maxX: 23.1, minY: -1.5, maxY: 3.2 } as const;
const cameraBounds = { minX: -1.6, maxX: 23.8, minY: -0.6, maxY: 3.7 } as const;
export const gameGeometryContract = { schema: "aura3d-game-geometry-contract/1.0", routeId, category: "platformer", sourceReport: geometryReport, surfaceMap: playableSurfaceMap, playableSurfaces, hazardSurfaces, checkpointSurfaces, finishPoint, worldAssetBindings, level, authoredPlayableSeconds, worldBounds, cameraBounds, evidence: { screenshotPath, screenshotSha256, geometryReport, manifestHash: worldHash }, assetHashes: { character: characterHash, world: worldHash } } as const;
