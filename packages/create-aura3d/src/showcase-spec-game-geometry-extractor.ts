import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readManifestAssets, type ManifestAsset } from "./showcase-spec-replacement-manifest.js";
import type {
  ShowcaseGeometryModelBounds,
  ShowcasePlatformerPlayableSurface,
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingDrivableMesh,
  ShowcaseRacingTrackTopology
} from "./showcase-spec-types.js";

type Vec3 = readonly [number, number, number];
type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export interface ExtractOptions {
  readonly projectDir?: string;
  readonly renderedProbePath?: string;
  readonly routeOverlayPath?: string;
  readonly characterAssetId?: string;
  readonly characterScaleRatio?: number;
  readonly characterFootprintWidth?: number;
}

export interface GeometryExtractionSuccess<T> {
  readonly ok: true;
  readonly value: T;
  readonly reasons: readonly string[];
}

export interface GeometryExtractionFailure {
  readonly ok: false;
  readonly blockers: readonly string[];
  readonly reasons: readonly string[];
}

export type GeometryExtractionResult<T> = GeometryExtractionSuccess<T> | GeometryExtractionFailure;

interface GltfDocument {
  readonly json: GltfJson;
  readonly binaryChunk?: Buffer;
}

interface GltfJson {
  readonly asset?: {
    readonly generator?: string;
    readonly extras?: Readonly<Record<string, unknown>>;
  };
  readonly scenes?: readonly GltfScene[];
  readonly scene?: number;
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly GltfMesh[];
  readonly materials?: readonly GltfMaterial[];
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly GltfBufferView[];
  readonly buffers?: readonly GltfBuffer[];
}

interface GltfScene {
  readonly nodes?: readonly number[];
}

interface GltfNode {
  readonly name?: string;
  readonly mesh?: number;
  readonly children?: readonly number[];
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
}

interface GltfMesh {
  readonly name?: string;
  readonly primitives?: readonly GltfPrimitive[];
}

interface GltfPrimitive {
  readonly attributes?: Readonly<Record<string, number>>;
  readonly material?: number;
  readonly indices?: number;
  readonly mode?: number;
}

interface GltfMaterial {
  readonly name?: string;
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType?: number;
  readonly normalized?: boolean;
  readonly count?: number;
  readonly type?: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

interface GltfBufferView {
  readonly buffer?: number;
  readonly byteOffset?: number;
  readonly byteLength?: number;
  readonly byteStride?: number;
}

interface GltfBuffer {
  readonly uri?: string;
  readonly byteLength?: number;
}

interface PrimitiveGeometry {
  readonly nodeName: string;
  readonly meshName: string;
  readonly materialName: string;
  readonly vertexCount: number;
  readonly bounds: ShowcaseGeometryModelBounds;
  readonly center: Vec3;
  readonly size: Vec3;
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly RoadTriangle[];
}

/** A world-space triangle in the XZ plane, retained so road containment can be tested exactly. */
interface RoadTriangle {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
}

interface AssetGeometry {
  readonly asset: ManifestAsset;
  readonly primitives: readonly PrimitiveGeometry[];
  readonly bounds: ShowcaseGeometryModelBounds;
  readonly platformerAuthoring?: PlatformerAuthoringMetadata;
}

interface PlatformerAuthoringMetadata {
  readonly modelToGameScale: number;
  readonly sectionModelSpan: number;
  readonly maxRetainedPlayableSurfaces: number;
  readonly authoredLevelLength?: number;
  readonly authoredCompletionSeconds?: number;
}

interface PlatformerSurfacePrimitiveSelection {
  readonly primitives: readonly PrimitiveGeometry[];
  readonly mode: "semantic" | "geometric";
  readonly reasons: readonly string[];
}

interface PlatformerPrimitivePreparation {
  readonly primitives: readonly PrimitiveGeometry[];
  readonly blockers: readonly string[];
  readonly reasons: readonly string[];
}

interface PlatformerDepthFamily {
  readonly primitives: readonly PrimitiveGeometry[];
  readonly minZ: number;
  readonly maxZ: number;
}

interface ExtractedPlatformerPlayableSurface extends ShowcasePlatformerPlayableSurface {
  readonly modelTopY?: number;
  readonly modelCenterZ?: number;
}

type AnchoredPlatformerPlayableSurface = ExtractedPlatformerPlayableSurface & {
  readonly modelTopY: number;
  readonly modelCenterZ: number;
};

type CandidatePlatformerSurface = AnchoredPlatformerPlayableSurface & {
  readonly kind: "platform";
};

const IDENTITY_MATRIX: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

const RACING_CERTIFIED_GAME_UNITS_PER_SECOND = 1.1;
const RACING_MAX_AUTHORED_LAP_SECONDS = 60;
/**
 * Maximum share of a derived racing centreline permitted to sit off the road
 * surface. Small excursions are tolerated where kerb triangles are modelled with
 * gaps; a route that is mostly off-road is rejected outright.
 */
const RACING_MAX_OFF_ROAD_RATIO = 0.01;
/**
 * Maximum ratio between the widest and tightest radius of a derived racing loop.
 * Real circuits vary; a route that bulges out across an attached apron does not.
 */
const RACING_MAX_LOOP_RADIUS_RATIO = 2;

/**
 * Road-surface material/node naming.
 *
 * The trailing boundary is `(?![a-z])` rather than `\b` on purpose: real assets name
 * their primary driving surface with numbered variants such as `ASPH2`, `Asphalt_01`,
 * or `ROAD2`, and `\b` does not match between `H` and `2` because a digit is a word
 * character. Defect 32 was exactly that — Tsukuba's largest driving surface (`ASPH2`,
 * 2,264 vertices) was silently dropped, so the loop tracer circled the paddock service
 * road instead of the circuit. A leading `(?<![a-z])` keeps `Grass` from matching
 * nothing while still rejecting words that merely contain a token (`broadway`).
 */
const ROAD_PATTERN = /(?<![a-z])(asph|asphalt|road|track|circuit|route|lane|kerb|curb|tarmac)(?![a-z])/i;
const ROAD_EXCLUDE_PATTERN = /(?<![a-z])(grass|water|lake|mount|terrain|wall|fence|tree|building|sky|barrier|warehouse|forest|foliage|foilage|aqua)(?![a-z])/i;
const PLATFORM_PATTERN = /\b(platform|walkway|ground|floor|level|ledge|bridge|runway|road|grass|rock|terrain)\b/i;
const PLATFORM_EXCLUDE_PATTERN = /\b(wall|cloud|sky|tree|character|prop|rail|pole)\b/i;
const PLATFORMER_TARGET_GAME_LENGTH = 38;
const PLATFORMER_MIN_GAME_SCALE = 0.025;
const PLATFORMER_MAX_GAME_SCALE = 0.18;
const PLATFORMER_MIN_MESH_PLAYABLE_SURFACES = 5;
const PLATFORMER_MIN_LEVEL_LENGTH = 12;
const PLATFORMER_AMBIGUOUS_COLUMN_STEP = 0.5;
const PLATFORMER_AMBIGUOUS_COLUMN_MIN_SURFACES = 3;
const PLATFORMER_AMBIGUOUS_COLUMN_MIN_Y_RANGE = 1.5;
const PLATFORMER_DEFAULT_CHARACTER_FOOTPRINT_WIDTH = 0.72;
const PLATFORMER_MAX_HORIZONTAL_TRAVERSAL_GAP = 8;
const PLATFORMER_MAX_UPWARD_TRAVERSAL_STEP = 2.5;
const PLATFORMER_MAX_RETAINED_MESH_SURFACES = 16;
const PLATFORMER_MAX_DECLARED_RETAINED_MESH_SURFACES = 256;
const PLATFORMER_AUTHORED_WORLD_GENERATOR = "Aura3D Skyline Level 1 deterministic GLB compositor";
const PLATFORMER_DECORATIVE_PATTERN = /\b(column|pillar|tower|decor|background|backdrop)\b/i;

/**
 * Memoizes racing extraction per asset. Ranking a replacement candidate list calls
 * this once per candidate, and exact road containment plus the raster loop trace is
 * far more work than the old radius estimate, so repeated calls are cached.
 */
const racingTopologyCache = new Map<string, GeometryExtractionResult<ShowcaseRacingTrackTopology>>();

export function extractRacingTrackTopologyFromAsset(
  assetId: string,
  options: ExtractOptions = {}
): GeometryExtractionResult<ShowcaseRacingTrackTopology> {
  const projectDir = options.projectDir ?? process.cwd();
  const cacheKey = JSON.stringify([
    projectDir,
    assetId,
    options.renderedProbePath ?? "",
    options.routeOverlayPath ?? ""
  ]);
  const cached = racingTopologyCache.get(cacheKey);
  if (cached) return cached;
  const computed = computeRacingTrackTopology(assetId, options, projectDir);
  racingTopologyCache.set(cacheKey, computed);
  return computed;
}

/** Clears the racing extraction memo. Exposed for tests that rewrite asset files in place. */
export function clearRacingTrackTopologyCache(): void {
  racingTopologyCache.clear();
}

/** Internal evidence probe used by the top-down racing audit and regression tests. */
export function diagnoseRacingPrimitiveCoverage(
  assetId: string,
  options: ExtractOptions = {}
): readonly {
  readonly materialName: string;
  readonly triangleCount: number;
  readonly routeCoverage: number;
  readonly bounds: ShowcaseGeometryModelBounds;
}[] {
  const projectDir = options.projectDir ?? process.cwd();
  const geometry = loadAssetGeometry(assetId, projectDir);
  const topology = extractRacingTrackTopologyFromAsset(assetId, options);
  if (!geometry.ok || !topology.ok) return [];
  return geometry.value.primitives.filter(isRoadPrimitive).map((primitive) => {
    const surface = createRoadSurface([primitive]);
    return {
      materialName: primitive.materialName,
      triangleCount: primitive.triangles.length,
      routeCoverage: round4(1 - measureOffRoadRatio(topology.value.roadCenterline, surface)),
      bounds: primitive.bounds
    };
  }).sort((a, b) => b.routeCoverage - a.routeCoverage || b.triangleCount - a.triangleCount);
}

function computeRacingTrackTopology(
  assetId: string,
  options: ExtractOptions,
  projectDir: string
): GeometryExtractionResult<ShowcaseRacingTrackTopology> {
  const geometry = loadAssetGeometry(assetId, projectDir);
  if (!geometry.ok) return geometry;
  const roadPrimitives = geometry.value.primitives.filter(isRoadPrimitive);
  if (roadPrimitives.length === 0) {
    return failure(
      [`asset-extraction:racing-road-mesh-not-found:${assetId}`],
      [`No mesh primitive in ${assetId} has a road/track/asphalt/kerb material or node name.`]
    );
  }
  const roadBounds = boundsForPrimitives(roadPrimitives);
  const roadSize = boundsSize(roadBounds);
  if (Math.max(roadSize[0], roadSize[2]) < 1 || Math.min(roadSize[0], roadSize[2]) < 0.5) {
    return failure(
      [`asset-extraction:racing-road-footprint-too-small:${assetId}`],
      [`Road candidate footprint ${formatSize(roadSize)} is not large enough to derive a public racing route.`]
    );
  }
  const roadSurface = createRoadSurface(roadPrimitives);
  if (roadSurface.triangleCount === 0) {
    return failure(
      [`asset-extraction:racing-road-triangles-unreadable:${assetId}`],
      [`Road primitives in ${assetId} have no readable indexed triangles, so road containment cannot be proven.`]
    );
  }
  // Radial sweep first: it is cheap and exact for star-convex circuits. Fall back to
  // a rasterized loop trace for circuits that double back on themselves.
  const sweptCenterline = createRoadCenterline(roadPrimitives, roadBounds, roadSurface);
  const sweptUsable = sweptCenterline.length >= 8
    && measureOffRoadRatio(sweptCenterline, roadSurface) <= RACING_MAX_OFF_ROAD_RATIO
    && isPlausibleRacingLoop(sweptCenterline);
  const centerline = sweptUsable ? sweptCenterline : traceRoadLoop(roadPrimitives, roadSurface);
  const centerlineMethod = sweptUsable ? "radial-band-sweep" : "raster-loop-trace";
  if (centerline.length < 8) {
    return failure(
      [`asset-extraction:racing-road-centerline-ambiguous:${assetId}`],
      [`Road mesh in ${assetId} produced only ${centerline.length} reliable centerline samples.`]
    );
  }
  // A route that leaves the asphalt is not a certified racing line, regardless of
  // how confident the surrounding metrics look. See defect 31.
  const offRoadRatio = measureOffRoadRatio(centerline, roadSurface);
  if (offRoadRatio > RACING_MAX_OFF_ROAD_RATIO) {
    return failure(
      [`asset-extraction:racing-road-centerline-off-road:${assetId}`],
      [`Derived centreline leaves the road surface for ${(offRoadRatio * 100).toFixed(1)}% of its length (max ${(RACING_MAX_OFF_ROAD_RATIO * 100).toFixed(0)}%).`]
    );
  }
  const lapLength = measureClosedRouteLength(centerline.map((point) => ({ x: point.x, y: point.z })));
  if (lapLength <= 0) {
    return failure(
      [`asset-extraction:racing-road-centerline-zero-length:${assetId}`],
      [`Road mesh in ${assetId} did not produce a measurable closed route.`]
    );
  }
  const checkpointCount = 6;
  const drivableMesh = createDrivableMesh(roadPrimitives);
  const topology: ShowcaseRacingTrackTopology = {
    assetId,
    assetHash: requireAssetHash(geometry.value.asset),
    source: "asset-mesh-extracted",
    /*
     * Centreline points carry the measured surface elevation under each point.
     *
     * Sampling the drivable surface here is what lets a route drop its frozen
     * `TRACK_SURFACE_Y` constant: the vertical road profile becomes data extracted from the
     * asset rather than a number a route author had to guess and then defend in a comment.
     */
    roadCenterline: centerline.map((point) => {
      const surfaceY = roadSurface.elevationAt(point.x, point.z);
      return surfaceY === undefined ? point : { ...point, surfaceY: round3(surfaceY) };
    }),
    checkpoints: Array.from({ length: checkpointCount }, (_unused, index) => ({
      progress: round3((index + 1) / checkpointCount),
      width: centerline[index % centerline.length]?.width ?? averageRoadWidth(roadSize)
    })),
    /*
     * The drivable surface itself, so a route can ground each wheel independently.
     *
     * The centreline profile above still describes the racing line, but a curve cannot
     * express camber or banking across the road's width. Emitting triangles is what lets
     * the racing route delete its surface constants outright instead of trading one
     * approximation for a slightly better one.
     */
    ...(drivableMesh ? { drivableMesh } : {}),
    lapLengthMeters: round3(lapLength),
    estimatedLapSeconds: Math.min(RACING_MAX_AUTHORED_LAP_SECONDS, Math.max(30, Math.ceil(lapLength / RACING_CERTIFIED_GAME_UNITS_PER_SECOND))),
    confidence: 0.76,
    modelAlignment: {
      source: "asset-mesh-extracted",
      modelBounds: geometry.value.bounds,
      // The fallback single anchor is also surface-sampled: it is used when fewer than two
      // anchor pairs survive, and a bounding-box floor would mis-seat the car there too.
      modelPoint: [
        center(roadBounds, 0),
        round3(roadSurface.elevationAt(center(roadBounds, 0), center(roadBounds, 2)) ?? roadSurface.medianElevation),
        center(roadBounds, 2)
      ],
      gamePoint: {
        x: center(roadBounds, 0),
        z: center(roadBounds, 2)
      },
      anchorPairs: createRacingAnchorPairs(centerline, roadSurface),
      evidence: {
        ...(options.routeOverlayPath ? { routeOverlay: options.routeOverlayPath } : {}),
        notes: "Mesh-derived anchors are computed from road/asphalt/kerb primitives in the current GLB and bind the racing route to the visible track asset."
      }
    },
    evidence: {
      sourceAsset: `assets.${assetId}`,
      ...(options.renderedProbePath ? { renderedProbe: options.renderedProbePath } : {}),
      ...(options.routeOverlayPath ? { routeOverlay: options.routeOverlayPath } : {}),
      notes: `Road topology extracted from ${roadPrimitives.length} GLB primitive(s) with road/track material names and bound to the current asset hash.`
    }
  };
  return {
    ok: true,
    value: topology,
    reasons: [
      `mesh-derived racing topology from ${roadPrimitives.length} road primitive(s)`,
      `lapLengthMeters:${topology.lapLengthMeters}`,
      `estimatedLapSeconds:${topology.estimatedLapSeconds}`,
      `centerlineMethod:${centerlineMethod}`,
      `centerlineOffRoadRatio:${offRoadRatio.toFixed(4)}`,
      `roadTriangles:${roadSurface.triangleCount}`,
      `drivableMeshTriangles:${drivableMesh?.triangleCount ?? 0}`
    ]
  };
}

export function extractPlatformerPlayableSurfaceMapFromAsset(
  assetId: string,
  options: ExtractOptions = {}
): GeometryExtractionResult<ShowcasePlatformerPlayableSurfaceMap> {
  const geometry = loadAssetGeometry(assetId, options.projectDir ?? process.cwd());
  if (!geometry.ok) return geometry;
  const surfaceSelection = selectPlatformerSurfacePrimitives(geometry.value);
  if (surfaceSelection.primitives.length === 0) {
    return failure(
      [`asset-extraction:platformer-playable-mesh-not-found:${assetId}`],
      [
        `No semantic or geometric mesh primitive in ${assetId} can be used as a retained playable platform surface.`,
        ...surfaceSelection.reasons
      ]
    );
  }
  const surfaceBounds = boundsForPrimitives(surfaceSelection.primitives);
  const surfaceSize = boundsSize(surfaceBounds);
  const horizontalCandidates = surfaceSelection.primitives
    .filter((primitive) => isHorizontalSurface(primitive))
    .sort(sortPlayableSurfaceCandidate);
  if (horizontalCandidates.length === 0) {
    return failure(
      [`asset-extraction:platformer-horizontal-surfaces-not-found:${assetId}`],
      [`${assetId} has ${surfaceSelection.primitives.length} candidate primitive(s), but none are flat enough for playable surfaces.`]
    );
  }
  const prepared = preparePlatformerSurfacePrimitives(
    assetId,
    horizontalCandidates,
    surfaceBounds,
    platformerCharacterFootprintWidth(options, options.projectDir ?? process.cwd()),
    geometry.value.platformerAuthoring
  );
  if (prepared.blockers.length > 0) {
    return failure(
      prepared.blockers,
      [
        `${assetId} produced ${horizontalCandidates.length} flat candidate primitive(s), but no retained depth-coherent traversable chain met the public platformer geometry floor.`,
        ...prepared.reasons,
        ...surfaceSelection.reasons
      ]
    );
  }
  const surfaces = createPlayableSurfaces(prepared.primitives, surfaceBounds, geometry.value.platformerAuthoring);
  const meshPlayableSurfaces = meshBoundPlayableSurfaces(surfaces);
  const qualityBlockers = platformerMeshSurfaceQualityBlockers(assetId, meshPlayableSurfaces);
  if (qualityBlockers.length > 0) {
    return failure(
      qualityBlockers,
      [
        `${assetId} produced ${meshPlayableSurfaces.length} mesh-bound playable surface(s); public platformer worlds require retained game geometry, not generated checkpoint/finish markers.`,
        ...qualityBlockers,
        ...prepared.reasons,
        ...surfaceSelection.reasons
      ]
    );
  }
  const levelLength = measurePlatformerSurfaceLength(meshPlayableSurfaces);
  const map: ShowcasePlatformerPlayableSurfaceMap = {
    assetId,
    assetHash: requireAssetHash(geometry.value.asset),
    source: "asset-mesh-extracted",
    surfaces,
    levelLength: round3(levelLength),
    estimatedCompletionSeconds: geometry.value.platformerAuthoring?.authoredCompletionSeconds
      ?? Math.max(30, Math.ceil(levelLength / 0.9)),
    characterScaleRatio: 0.42,
    confidence: 0.74,
    modelAlignment: {
      source: "asset-mesh-extracted",
      modelBounds: geometry.value.bounds,
      modelPoint: [center(surfaceBounds, 0), surfaceBounds.min[1], center(surfaceBounds, 2)],
      gamePoint: {
        x: round3(levelLength / 2),
        y: 0
      },
      anchorPairs: createPlatformerAnchorPairs(surfaces, surfaceBounds, geometry.value.platformerAuthoring),
      evidence: {
        ...(options.routeOverlayPath ? { routeOverlay: options.routeOverlayPath } : {}),
        notes: "Mesh-derived playable-surface anchors are computed from flat platform/world primitives and bind the generated level to the visible world asset with the same model-to-game scale used by the generated level."
      }
    },
    evidence: {
      sourceAsset: `assets.${assetId}`,
      ...(options.renderedProbePath ? { renderedProbe: options.renderedProbePath } : {}),
      ...(options.routeOverlayPath ? { routeOverlay: options.routeOverlayPath } : {}),
      notes: `Playable surfaces extracted from ${horizontalCandidates.length} flat ${surfaceSelection.mode} GLB primitive(s) and bound to the current asset hash.`
    }
  };
  return {
    ok: true,
    value: map,
    reasons: [
      `mesh-derived platformer surfaces from ${horizontalCandidates.length} ${surfaceSelection.mode} primitive(s)`,
      ...prepared.reasons,
      ...surfaceSelection.reasons,
      `surfaceCount:${surfaces.length}`,
      `meshPlayableSurfaceCount:${meshPlayableSurfaces.length}`,
      `estimatedCompletionSeconds:${map.estimatedCompletionSeconds}`
    ]
  };
}

function preparePlatformerSurfacePrimitives(
  assetId: string,
  primitives: readonly PrimitiveGeometry[],
  bounds: ShowcaseGeometryModelBounds,
  characterFootprintWidth: number,
  authoring?: PlatformerAuthoringMetadata
): PlatformerPrimitivePreparation {
  const modelToGameScale = platformerModelToGameScale(bounds, authoring);
  const minimumWalkableWidth = Math.max(
    PLATFORMER_DEFAULT_CHARACTER_FOOTPRINT_WIDTH,
    characterFootprintWidth
  );
  const uniquePrimitives = uniquePlayableSurfacePrimitives(primitives);
  const walkable = uniquePrimitives.filter((primitive) =>
    primitive.size[0] * modelToGameScale >= minimumWalkableWidth
  );
  const narrowCount = uniquePrimitives.length - walkable.length;
  if (walkable.length === 0) {
    return {
      primitives: [],
      blockers: [`asset-extraction:platformer-no-walkable-width-surfaces:${assetId}`],
      reasons: [`excluded ${narrowCount} primitive(s) narrower than the ${round3(minimumWalkableWidth)} game-unit character footprint`]
    };
  }

  const families = createPlatformerDepthFamilies(walkable, bounds);
  const selectedFamily = [...families].sort((a, b) =>
    platformerDepthFamilyScore(b, modelToGameScale) - platformerDepthFamilyScore(a, modelToGameScale)
  )[0];
  if (!selectedFamily) {
    return {
      primitives: [],
      blockers: [`asset-extraction:platformer-depth-family-not-found:${assetId}`],
      reasons: []
    };
  }

  const familySurfaces = candidatePlatformerSurfaces(selectedFamily.primitives, bounds, authoring);
  const columnResolution = resolveAmbiguousPlatformerColumns(assetId, familySurfaces);
  const retainedPrimitiveKeys = new Set(columnResolution.surfaces.map((surface) => surface.primitiveKey));
  const columnResolvedPrimitives = selectedFamily.primitives.filter((primitive) =>
    retainedPrimitiveKeys.has(platformerPrimitiveKey(primitive))
  );
  const traversal = selectPlatformerTraversalComponent(columnResolvedPrimitives, bounds, authoring);
  const familyReasons = families
    .filter((family) => family !== selectedFamily)
    .map((family, index) =>
      `excluded depth family ${index + 1} with ${family.primitives.length} primitive(s) at model z ${round3(family.minZ)}..${round3(family.maxZ)}`
    );
  const reasons = [
    `selected depth-coherent family with ${selectedFamily.primitives.length} primitive(s) at model z ${round3(selectedFamily.minZ)}..${round3(selectedFamily.maxZ)}`,
    ...familyReasons,
    ...(narrowCount > 0
      ? [`excluded ${narrowCount} primitive(s) narrower than the ${round3(minimumWalkableWidth)} game-unit character footprint`]
      : []),
    ...columnResolution.reasons,
    ...traversal.reasons,
    ...platformerSemanticHintReasons(traversal.primitives)
  ];
  const blockers = [
    ...columnResolution.blockers,
    ...traversal.blockers
  ];
  return {
    primitives: blockers.length === 0 ? traversal.primitives : [],
    blockers,
    reasons
  };
}

function createPlatformerDepthFamilies(
  primitives: readonly PrimitiveGeometry[],
  bounds: ShowcaseGeometryModelBounds
): readonly PlatformerDepthFamily[] {
  const tolerance = Math.max(0.25, (bounds.max[2] - bounds.min[2]) * 0.04);
  const sorted = [...primitives].sort((a, b) => a.center[2] - b.center[2]);
  const families: PlatformerDepthFamily[] = [];
  for (const primitive of sorted) {
    const primitiveCenterZ = primitive.center[2];
    const family = families.find((candidate) => {
      const centers = candidate.primitives.map((entry) => entry.center[2]);
      return Math.abs(primitiveCenterZ - average(centers)) <= tolerance;
    });
    if (!family) {
      families.push({
        primitives: [primitive],
        minZ: primitiveCenterZ,
        maxZ: primitiveCenterZ
      });
      continue;
    }
    const mergedPrimitives = [...family.primitives, primitive];
    const merged: PlatformerDepthFamily = {
      primitives: mergedPrimitives,
      minZ: Math.min(...mergedPrimitives.map((entry) => entry.center[2])),
      maxZ: Math.max(...mergedPrimitives.map((entry) => entry.center[2]))
    };
    families.splice(families.indexOf(family), 1, merged);
  }
  return families;
}

function platformerDepthFamilyScore(family: PlatformerDepthFamily, modelToGameScale: number): number {
  const minX = Math.min(...family.primitives.map((primitive) => primitive.bounds.min[0]));
  const maxX = Math.max(...family.primitives.map((primitive) => primitive.bounds.max[0]));
  const semanticScore = family.primitives.reduce((score, primitive) => {
    const label = `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`;
    if (PLATFORM_PATTERN.test(label)) return score + 0.25;
    if (PLATFORMER_DECORATIVE_PATTERN.test(label)) return score - 0.25;
    return score;
  }, 0);
  return ((maxX - minX) * modelToGameScale + family.primitives.length * 0.5) * 1_000 + semanticScore;
}

interface PlatformerSurfaceCandidateWithPrimitive extends CandidatePlatformerSurface {
  readonly primitiveKey: string;
}

function candidatePlatformerSurfaces(
  primitives: readonly PrimitiveGeometry[],
  bounds: ShowcaseGeometryModelBounds,
  authoring?: PlatformerAuthoringMetadata
): readonly PlatformerSurfaceCandidateWithPrimitive[] {
  const modelToGameScale = platformerModelToGameScale(bounds, authoring);
  const baseline = Math.min(...primitives.map((primitive) => primitive.bounds.max[1]));
  return primitives.map((primitive, index) => ({
    id: `candidate-platform-${String(index).padStart(2, "0")}`,
    x: round3((primitive.bounds.min[0] - bounds.min[0]) * modelToGameScale + (primitive.size[0] * modelToGameScale) / 2),
    y: round3(Math.max(0, primitive.bounds.max[1] - baseline) * modelToGameScale),
    width: round3(primitive.size[0] * modelToGameScale),
    height: round3(Math.max(0.22, primitive.size[1] * modelToGameScale)),
    modelTopY: round3(primitive.bounds.max[1]),
    modelCenterZ: center(primitive.bounds, 2),
    kind: "platform",
    primitiveKey: platformerPrimitiveKey(primitive)
  }));
}

function resolveAmbiguousPlatformerColumns(
  assetId: string,
  surfaces: readonly PlatformerSurfaceCandidateWithPrimitive[]
): {
  readonly surfaces: readonly PlatformerSurfaceCandidateWithPrimitive[];
  readonly blockers: readonly string[];
  readonly reasons: readonly string[];
} {
  const columns = new Map<string, PlatformerSurfaceCandidateWithPrimitive[]>();
  for (const surface of surfaces) {
    const column = platformerSurfaceColumn(surface.x);
    columns.set(column, [...(columns.get(column) ?? []), surface]);
  }
  const retained = new Set(surfaces);
  const unresolvedColumns: string[] = [];
  const reasons: string[] = [];
  for (const [column, columnSurfaces] of columns) {
    if (columnSurfaces.length < PLATFORMER_AMBIGUOUS_COLUMN_MIN_SURFACES) continue;
    const minY = Math.min(...columnSurfaces.map((surface) => surface.y));
    const maxY = Math.max(...columnSurfaces.map((surface) => surface.y));
    if (maxY - minY < PLATFORMER_AMBIGUOUS_COLUMN_MIN_Y_RANGE) continue;
    const keep = [...columnSurfaces]
      .sort((a, b) => b.width - a.width || a.y - b.y)
      .slice(0, 2);
    for (const surface of columnSurfaces) {
      if (!keep.includes(surface)) retained.delete(surface);
    }
    unresolvedColumns.push(column);
    reasons.push(`resolved stacked column ${column} by retaining its two widest walkable tiers`);
  }
  const resolved = surfaces.filter((surface) => retained.has(surface));
  const resolvedLength = measurePlatformerSurfaceLength(resolved);
  const blockers = unresolvedColumns.length > 0 && (
    resolved.length < PLATFORMER_MIN_MESH_PLAYABLE_SURFACES || resolvedLength < PLATFORMER_MIN_LEVEL_LENGTH
  )
    ? unresolvedColumns.map((column) => `asset-extraction:platformer-column-unresolved:${assetId}:${column}`)
    : [];
  return { surfaces: resolved, blockers, reasons };
}

function selectPlatformerTraversalComponent(
  primitives: readonly PrimitiveGeometry[],
  bounds: ShowcaseGeometryModelBounds,
  authoring?: PlatformerAuthoringMetadata
): PlatformerPrimitivePreparation {
  const surfaces = [...candidatePlatformerSurfaces(primitives, bounds, authoring)].sort((a, b) =>
    (a.x - a.width / 2) - (b.x - b.width / 2) || a.y - b.y
  );
  const components: PlatformerSurfaceCandidateWithPrimitive[][] = [];
  let current: PlatformerSurfaceCandidateWithPrimitive[] = [];
  let currentRight = Number.NEGATIVE_INFINITY;
  let currentHighestReachableY = 0;
  for (const surface of surfaces) {
    const left = surface.x - surface.width / 2;
    const gap = left - currentRight;
    const upwardStep = surface.y - currentHighestReachableY;
    if (current.length > 0 && (gap > PLATFORMER_MAX_HORIZONTAL_TRAVERSAL_GAP || upwardStep > PLATFORMER_MAX_UPWARD_TRAVERSAL_STEP)) {
      components.push(current);
      current = [];
      currentRight = Number.NEGATIVE_INFINITY;
      currentHighestReachableY = surface.y;
    }
    current.push(surface);
    currentRight = Math.max(currentRight, surface.x + surface.width / 2);
    currentHighestReachableY = Math.max(currentHighestReachableY, surface.y);
  }
  if (current.length > 0) components.push(current);
  const ranked = [...components].sort((a, b) => {
    const aLength = measurePlatformerSurfaceLength(a);
    const bLength = measurePlatformerSurfaceLength(b);
    const aQualifies = a.length >= PLATFORMER_MIN_MESH_PLAYABLE_SURFACES && aLength >= PLATFORMER_MIN_LEVEL_LENGTH;
    const bQualifies = b.length >= PLATFORMER_MIN_MESH_PLAYABLE_SURFACES && bLength >= PLATFORMER_MIN_LEVEL_LENGTH;
    return Number(bQualifies) - Number(aQualifies) || bLength - aLength || b.length - a.length;
  });
  const selected = ranked[0] ?? [];
  const selectedLength = measurePlatformerSurfaceLength(selected);
  const qualifies = selected.length >= PLATFORMER_MIN_MESH_PLAYABLE_SURFACES && selectedLength >= PLATFORMER_MIN_LEVEL_LENGTH;
  const primitiveKeys = new Set(selected.map((surface) => surface.primitiveKey));
  const selectedPrimitives = primitives.filter((primitive) => primitiveKeys.has(platformerPrimitiveKey(primitive)));
  const reasons = [
    `selected traversable component with ${selected.length} mesh surface(s) spanning ${round3(selectedLength)} game units`,
    ...(components.length > 1 ? [`excluded ${components.length - 1} disconnected traversal component(s)`] : [])
  ];
  if (qualifies) return { primitives: selectedPrimitives, blockers: [], reasons };
  return {
    primitives: [],
    blockers: [`asset-extraction:platformer-traversable-chain-too-short:${selected.length}:${round3(selectedLength)}`],
    reasons
  };
}

function platformerSemanticHintReasons(primitives: readonly PrimitiveGeometry[]): readonly string[] {
  const labels = primitives.map((primitive) => `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`);
  const positive = labels.filter((label) => PLATFORM_PATTERN.test(label)).length;
  const decorative = labels.filter((label) => PLATFORMER_DECORATIVE_PATTERN.test(label)).length;
  if (positive === 0 && decorative === 0) return ["generic node names contributed no semantic confidence; certification remained geometry-only"];
  return [`semantic hints: ${positive} playable label(s), ${decorative} decorative label(s); hints only affected family ranking`];
}

function platformerPrimitiveKey(primitive: PrimitiveGeometry): string {
  return [
    primitive.bounds.min[0], primitive.bounds.min[1], primitive.bounds.min[2],
    primitive.bounds.max[0], primitive.bounds.max[1], primitive.bounds.max[2]
  ].map((value) => value.toFixed(3)).join(":");
}

function platformerSurfaceColumn(x: number): string {
  return (Math.round(x / PLATFORMER_AMBIGUOUS_COLUMN_STEP) * PLATFORMER_AMBIGUOUS_COLUMN_STEP).toFixed(2);
}

function loadAssetGeometry(assetId: string, projectDir: string): GeometryExtractionResult<AssetGeometry> {
  const asset = readManifestAssets(projectDir).find((entry) => entry.id === assetId);
  if (!asset) return failure([`asset-extraction:asset-not-found:${assetId}`], [`Asset ${assetId} is not present in aura.assets.json.`]);
  const assetPath = asset.outputPath ?? asset.source ?? asset.url;
  if (!assetPath) return failure([`asset-extraction:asset-file-missing:${assetId}`], [`Asset ${assetId} has no local outputPath/source path.`]);
  const absolutePath = resolve(projectDir, assetPath);
  if (!existsSync(absolutePath)) return failure([`asset-extraction:asset-file-not-found:${assetId}`], [`Asset file ${assetPath} does not exist.`]);
  const document = loadGltfDocument(absolutePath);
  if (!document.ok) return document;
  const primitives = collectPrimitiveGeometry(document.value);
  if (primitives.length === 0) return failure([`asset-extraction:no-mesh-primitives:${assetId}`], [`Asset ${assetId} has no readable POSITION mesh primitives.`]);
  return {
    ok: true,
    value: {
      asset,
      primitives,
      bounds: boundsForPrimitives(primitives),
      ...(readPlatformerAuthoringMetadata(document.value) ? {
        platformerAuthoring: readPlatformerAuthoringMetadata(document.value)
      } : {})
    },
    reasons: [`read ${primitives.length} GLB primitive(s) from ${assetPath}`]
  };
}

function loadGltfDocument(absolutePath: string): GeometryExtractionResult<GltfDocument> {
  const buffer = readFileSync(absolutePath);
  if (buffer.length < 20) return failure(["asset-extraction:glb-too-small"], [`${absolutePath} is too small to be a GLB file.`]);
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    return failure(["asset-extraction:only-glb-supported"], [`${absolutePath} is not a binary GLB; mesh geometry extraction currently requires retained GLB assets.`]);
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) return failure([`asset-extraction:unsupported-glb-version:${version}`], [`${absolutePath} uses unsupported GLB version ${version}.`]);
  let offset = 12;
  let json: GltfJson | undefined;
  let binaryChunk: Buffer | undefined;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buffer.length) break;
    const chunk = buffer.subarray(chunkStart, chunkEnd);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").trim()) as GltfJson;
    if (chunkType === 0x004e4942) binaryChunk = chunk;
    offset = chunkEnd;
  }
  if (!json) return failure(["asset-extraction:glb-json-missing"], [`${absolutePath} has no JSON chunk.`]);
  return { ok: true, value: { json, ...(binaryChunk ? { binaryChunk } : {}) }, reasons: ["parsed GLB JSON and binary chunks"] };
}

function collectPrimitiveGeometry(document: GltfDocument): readonly PrimitiveGeometry[] {
  const scene = document.json.scenes?.[document.json.scene ?? 0];
  const sceneNodes = scene?.nodes ?? document.json.nodes?.map((_node, index) => index) ?? [];
  return sceneNodes.flatMap((nodeIndex) => collectNodePrimitives(document, nodeIndex, IDENTITY_MATRIX, []));
}

function collectNodePrimitives(document: GltfDocument, nodeIndex: number, parentTransform: Mat4, path: readonly string[]): readonly PrimitiveGeometry[] {
  const node = document.json.nodes?.[nodeIndex];
  if (!node) return [];
  const nodeName = node.name ?? `node-${nodeIndex}`;
  const transform = multiplyMat4(parentTransform, nodeMatrix(node));
  const currentPath = [...path, nodeName];
  const meshPrimitives = node.mesh === undefined
    ? []
    : collectMeshPrimitives(document, node.mesh, transform, currentPath.join("/"));
  const childPrimitives = (node.children ?? []).flatMap((childIndex) => collectNodePrimitives(document, childIndex, transform, currentPath));
  return [...meshPrimitives, ...childPrimitives];
}

function collectMeshPrimitives(document: GltfDocument, meshIndex: number, transform: Mat4, nodeName: string): readonly PrimitiveGeometry[] {
  const mesh = document.json.meshes?.[meshIndex];
  if (!mesh) return [];
  return (mesh.primitives ?? []).flatMap((primitive, primitiveIndex) => {
    const positionAccessor = primitive.attributes?.POSITION;
    if (positionAccessor === undefined) return [];
    const vertices = readPositionAccessor(document, positionAccessor).map((point) => transformPoint(transform, point));
    if (vertices.length === 0) return [];
    const bounds = boundsForVertices(vertices);
    const materialName = document.json.materials?.[primitive.material ?? -1]?.name ?? `material-${primitive.material ?? "none"}`;
    const size = boundsSize(bounds);
    return [{
      nodeName,
      meshName: mesh.name ?? `mesh-${meshIndex}`,
      materialName,
      vertexCount: vertices.length,
      bounds,
      center: [center(bounds, 0), center(bounds, 1), center(bounds, 2)] as const,
      size,
      vertices: vertices.length > 800 ? decimateVertices(vertices, 800) : vertices,
      triangles: readTriangles(document, primitive, vertices)
    } satisfies PrimitiveGeometry];
  });
}

function readPositionAccessor(document: GltfDocument, accessorIndex: number): readonly Vec3[] {
  const accessor = document.json.accessors?.[accessorIndex];
  const binaryChunk = document.binaryChunk;
  if (!accessor || !binaryChunk || accessor.bufferView === undefined || accessor.componentType !== 5126 || accessor.type !== "VEC3") return [];
  const view = document.json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0) return [];
  const count = accessor.count ?? 0;
  const accessorOffset = accessor.byteOffset ?? 0;
  const viewOffset = view.byteOffset ?? 0;
  const stride = view.byteStride ?? 12;
  const start = viewOffset + accessorOffset;
  const vertices: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = start + index * stride;
    if (offset + 12 > binaryChunk.length) break;
    vertices.push([
      binaryChunk.readFloatLE(offset),
      binaryChunk.readFloatLE(offset + 4),
      binaryChunk.readFloatLE(offset + 8)
    ]);
  }
  return vertices;
}

/**
 * Reads a primitive's triangle list in world space. Triangles are what make an
 * exact point-on-road test possible; a vertex cloud alone cannot distinguish the
 * interior of a ring road from the hole in its middle.
 */
function readTriangles(document: GltfDocument, primitive: GltfPrimitive, vertices: readonly Vec3[]): readonly RoadTriangle[] {
  const mode = primitive.mode ?? 4;
  if (mode !== 4) return [];
  const indices = primitive.indices === undefined
    ? vertices.map((_vertex, index) => index)
    : readIndexAccessor(document, primitive.indices);
  const triangles: RoadTriangle[] = [];
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = vertices[indices[index]!];
    const b = vertices[indices[index + 1]!];
    const c = vertices[indices[index + 2]!];
    if (a && b && c) triangles.push({ a, b, c });
  }
  return triangles;
}

function readIndexAccessor(document: GltfDocument, accessorIndex: number): readonly number[] {
  const accessor = document.json.accessors?.[accessorIndex];
  const binaryChunk = document.binaryChunk;
  if (!accessor || !binaryChunk || accessor.bufferView === undefined) return [];
  const view = document.json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0) return [];
  const componentSize = accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : accessor.componentType === 5121 ? 1 : 0;
  if (componentSize === 0) return [];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count ?? 0;
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = start + index * componentSize;
    if (offset + componentSize > binaryChunk.length) break;
    indices.push(componentSize === 4
      ? binaryChunk.readUInt32LE(offset)
      : componentSize === 2 ? binaryChunk.readUInt16LE(offset) : binaryChunk.readUInt8(offset));
  }
  return indices;
}

function isRoadPrimitive(primitive: PrimitiveGeometry): boolean {
  const label = `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`;
  return ROAD_PATTERN.test(label) && !ROAD_EXCLUDE_PATTERN.test(label);
}

function isPlatformPrimitive(primitive: PrimitiveGeometry): boolean {
  const label = `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`;
  return PLATFORM_PATTERN.test(label) && !PLATFORM_EXCLUDE_PATTERN.test(label);
}

function selectPlatformerSurfacePrimitives(geometry: AssetGeometry): PlatformerSurfacePrimitiveSelection {
  const geometric = geometry.primitives.filter((primitive) =>
    isGenericPlatformerSurfacePrimitive(primitive, geometry.bounds, geometry.platformerAuthoring)
  );
  const positive = geometric.filter(isPlatformPrimitive).length;
  const decorative = geometric.filter((primitive) =>
    PLATFORMER_DECORATIVE_PATTERN.test(`${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`)
  ).length;
  return {
    primitives: geometric,
    mode: "geometric",
    reasons: geometric.length > 0
      ? [`selected ${geometric.length} primitive(s) by flat horizontal game-surface geometry; ${positive} playable and ${decorative} decorative semantic hint(s) remained soft ranking signals`]
      : ["no flat horizontal primitive passed the game-surface footprint filter"]
  };
}

function isGenericPlatformerSurfacePrimitive(
  primitive: PrimitiveGeometry,
  modelBounds: ShowcaseGeometryModelBounds,
  authoring?: PlatformerAuthoringMetadata
): boolean {
  if (!isHorizontalSurface(primitive)) return false;
  const modelSize = boundsSize(modelBounds);
  // A composed authored level repeats local platform modules across a much longer
  // X span. Comparing each module with the entire 923-unit world incorrectly
  // rejects the smaller floating ledges purely because the level has ten districts.
  // The signed compositor metadata supplies the immutable source-section span so
  // local walkability is judged against one authored district, while the normal
  // extractor remains unchanged for arbitrary third-party GLBs.
  const effectiveModelWidth = authoring?.sectionModelSpan ?? modelSize[0];
  const modelFootprint = Math.max(0.001, effectiveModelWidth * modelSize[2]);
  const primitiveFootprint = primitive.size[0] * primitive.size[2];
  const longestAxis = Math.max(primitive.size[0], primitive.size[2]);
  const shortestAxis = Math.min(primitive.size[0], primitive.size[2]);
  return primitiveFootprint >= Math.max(0.08, modelFootprint * 0.00045) &&
    longestAxis >= Math.max(0.7, effectiveModelWidth * 0.006) &&
    shortestAxis >= 0.16;
}

function isHorizontalSurface(primitive: PrimitiveGeometry): boolean {
  const horizontal = Math.max(primitive.size[0], primitive.size[2]);
  const depth = Math.min(primitive.size[0], primitive.size[2]);
  const height = primitive.size[1];
  return horizontal >= 0.8 && depth >= 0.2 && height <= Math.max(0.18, horizontal * 0.16);
}

function sortPlayableSurfaceCandidate(a: PrimitiveGeometry, b: PrimitiveGeometry): number {
  const areaDelta = (b.size[0] * b.size[2]) - (a.size[0] * a.size[2]);
  if (Math.abs(areaDelta) > 0.001) return areaDelta;
  return a.bounds.min[0] - b.bounds.min[0];
}

/**
 * A road-surface occupancy test built from the road primitives' actual triangles.
 *
 * This exists because a radial "average radius" estimate cannot tell the road
 * surface apart from the empty infield it encircles. Defect 31 was exactly that:
 * the previous implementation emitted `averageRadius * 0.68`, which for a ring
 * road lands inside the inner edge, so 100% of the certified centreline sat on
 * grass rather than asphalt.
 */
interface RoadSurface {
  readonly contains: (x: number, z: number) => boolean;
  /**
   * Local-space Y of the drivable surface directly under `(x, z)`, or `undefined` when the point is
   * off the road.
   *
   * Anchor elevation must be sampled from the surface itself, not taken from the road family's
   * bounding box. `roadBounds.min[1]` is the lowest vertex anywhere in the road/kerb/asphalt family,
   * which on a real circuit belongs to a kerb underside, a drainage lip, or a banked far corner --
   * not to the tarmac under the start line. Binding an anchor to that floor tells the route solver
   * the road sits lower than it does, and the whole vehicle is then seated below the visible tarmac.
   *
   * Returns the *highest* triangle under the point: where a kerb or apron overlaps the racing
   * surface in plan view, the drivable surface is the top one.
   */
  readonly elevationAt: (x: number, z: number) => number | undefined;
  /**
   * Median Y across the drivable surface's vertices.
   *
   * Used when a specific point has no surface triangle under it -- most importantly the road family's
   * bounding-box *centre*, which on any circuit that encloses an infield is a hole rather than tarmac.
   * A median is the right fallback because it is a real elevation taken from the drivable surface,
   * unlike `bounds.min[1]`, and it is robust to a minority of banked or stepped triangles.
   */
  readonly medianElevation: number;
  readonly triangleCount: number;
}

/**
 * Build an indexed triangle mesh from the road primitives' triangles.
 *
 * Vertices are welded on a quantised key so shared corners collapse, which typically cuts
 * the position array by about a third and, more importantly, makes the mesh watertight
 * enough that a downward ray cannot slip through a seam between two adjacent road quads.
 *
 * `maxTriangles` bounds the committed artifact. Decimation keeps an evenly spaced subset
 * rather than a contiguous prefix, because dropping a contiguous run would delete a whole
 * corner of the circuit and leave a hole a wheel could fall through.
 */
function createDrivableMesh(
  primitives: readonly PrimitiveGeometry[],
  maxTriangles = 4000
): ShowcaseRacingDrivableMesh | undefined {
  const triangles = primitives.flatMap((primitive) => primitive.triangles);
  if (triangles.length === 0) return undefined;

  const stride = triangles.length > maxTriangles ? Math.ceil(triangles.length / maxTriangles) : 1;
  const kept: RoadTriangle[] = [];
  for (let index = 0; index < triangles.length; index += stride) {
    const triangle = triangles[index];
    if (triangle) kept.push(triangle);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const indexByKey = new Map<string, number>();
  const pushVertex = (vertex: readonly [number, number, number]): number => {
    // Quantise to millimetre-ish precision in model units so float noise does not defeat
    // welding, while staying far finer than any wheel radius.
    const key = `${vertex[0].toFixed(4)}:${vertex[1].toFixed(4)}:${vertex[2].toFixed(4)}`;
    const existing = indexByKey.get(key);
    if (existing !== undefined) return existing;
    const next = positions.length / 3;
    positions.push(round4(vertex[0]), round4(vertex[1]), round4(vertex[2]));
    indexByKey.set(key, next);
    return next;
  };

  for (const triangle of kept) {
    const a = pushVertex(triangle.a);
    const b = pushVertex(triangle.b);
    const c = pushVertex(triangle.c);
    // Skip triangles that collapsed to a line or point during welding: they carry no
    // surface and would make a raycast return a degenerate normal.
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  if (indices.length === 0) return undefined;

  return {
    positions,
    indices,
    sourceTriangleCount: triangles.length,
    triangleCount: indices.length / 3
  };
}

/** Round to 4dp. Model-space road coordinates need finer precision than `round3` gives. */
function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function createRoadSurface(primitives: readonly PrimitiveGeometry[]): RoadSurface {
  const triangles = primitives.flatMap((primitive) => primitive.triangles);
  if (triangles.length === 0) {
    return { contains: () => false, elevationAt: () => undefined, medianElevation: 0, triangleCount: 0 };
  }
  const cells = new Map<string, RoadTriangle[]>();
  const bounds = boundsForPrimitives(primitives);
  const size = boundsSize(bounds);
  const cellSize = Math.max(1e-6, Math.max(size[0], size[2]) / 96);
  const keyFor = (x: number, z: number): string => `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
  for (const triangle of triangles) {
    const minX = Math.min(triangle.a[0], triangle.b[0], triangle.c[0]);
    const maxX = Math.max(triangle.a[0], triangle.b[0], triangle.c[0]);
    const minZ = Math.min(triangle.a[2], triangle.b[2], triangle.c[2]);
    const maxZ = Math.max(triangle.a[2], triangle.b[2], triangle.c[2]);
    for (let cx = Math.floor(minX / cellSize); cx <= Math.floor(maxX / cellSize); cx += 1) {
      for (let cz = Math.floor(minZ / cellSize); cz <= Math.floor(maxZ / cellSize); cz += 1) {
        const key = `${cx}:${cz}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(triangle);
        else cells.set(key, [triangle]);
      }
    }
  }
  const elevations = triangles
    .flatMap((triangle) => [triangle.a[1], triangle.b[1], triangle.c[1]])
    .sort((a, b) => a - b);
  const medianElevation = elevations.length > 0
    ? round3(elevations[Math.floor(elevations.length / 2)] ?? 0)
    : 0;
  return {
    triangleCount: triangles.length,
    medianElevation,
    contains: (x, z) => {
      const bucket = cells.get(keyFor(x, z));
      if (!bucket) return false;
      return bucket.some((triangle) => triangleContainsXZ(triangle, x, z));
    },
    elevationAt: (x, z) => {
      const bucket = cells.get(keyFor(x, z));
      if (!bucket) return undefined;
      let highest: number | undefined;
      for (const triangle of bucket) {
        if (!triangleContainsXZ(triangle, x, z)) continue;
        const y = triangleElevationAtXZ(triangle, x, z);
        if (y === undefined) continue;
        if (highest === undefined || y > highest) highest = y;
      }
      return highest;
    }
  };
}

/**
 * Interpolate a triangle's Y at `(x, z)` using barycentric weights.
 *
 * Returns `undefined` for a triangle that is degenerate in plan view (a vertical wall seen edge-on),
 * which carries no usable surface elevation.
 */
function triangleElevationAtXZ(triangle: RoadTriangle, x: number, z: number): number | undefined {
  const { a, b, c } = triangle;
  const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(denominator) < 1e-12) return undefined;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
  const w = 1 - u - v;
  return u * a[1] + v * b[1] + w * c[1];
}

function triangleContainsXZ(triangle: RoadTriangle, x: number, z: number): boolean {
  const { a, b, c } = triangle;
  const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(denominator) < 1e-12) return false;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
  return u >= 0 && v >= 0 && u + v <= 1;
}

/**
 * Rejects an on-road polyline that is not plausibly a racing line.
 *
 * Staying on asphalt is necessary but not sufficient: a circuit with an attached
 * paddock or pit apron gives the radial sweep somewhere legal but wrong to bulge into,
 * producing a lap that drives out across the apron and back. A racing line has a
 * roughly consistent distance from the centre it encircles, so a route whose radius
 * more than doubles between its tightest and widest point is not one. (Defect 32.)
 */
function isPlausibleRacingLoop(centerline: readonly { readonly x: number; readonly z: number }[]): boolean {
  if (centerline.length < 8) return false;
  const centerX = average(centerline.map((point) => point.x));
  const centerZ = average(centerline.map((point) => point.z));
  const radii = centerline.map((point) => Math.hypot(point.x - centerX, point.z - centerZ));
  const minRadius = Math.min(...radii);
  const maxRadius = Math.max(...radii);
  if (minRadius <= 0) return false;
  return maxRadius / minRadius <= RACING_MAX_LOOP_RADIUS_RATIO;
}

/** Fraction of a closed polyline that lies off the road surface, sampled uniformly. */
function measureOffRoadRatio(
  centerline: readonly { readonly x: number; readonly z: number }[],
  surface: RoadSurface
): number {
  if (centerline.length < 2 || surface.triangleCount === 0) return 1;
  let off = 0;
  let total = 0;
  for (let index = 0; index < centerline.length; index += 1) {
    const from = centerline[index]!;
    const to = centerline[(index + 1) % centerline.length]!;
    const samples = 12;
    for (let step = 0; step < samples; step += 1) {
      const t = step / samples;
      total += 1;
      if (!surface.contains(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) off += 1;
    }
  }
  return total === 0 ? 1 : off / total;
}

/**
 * A rasterized view of the road surface, used to trace a centreline on circuits
 * whose shape is not star-convex about the centroid (a hairpin or an S-complex
 * doubles back, so a single ray crosses several unrelated road bands).
 */
interface RoadRaster {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originZ: number;
  readonly occupied: Uint8Array;
  readonly toWorld: (cell: number) => { readonly x: number; readonly z: number };
}

function createRoadRaster(primitives: readonly PrimitiveGeometry[], surface: RoadSurface): RoadRaster {
  const bounds = boundsForPrimitives(primitives);
  const size = boundsSize(bounds);
  const target = 200;
  const cellSize = Math.max(1e-6, Math.max(size[0], size[2]) / target);
  const width = Math.ceil(size[0] / cellSize) + 3;
  const height = Math.ceil(size[2] / cellSize) + 3;
  const originX = bounds.min[0] - cellSize;
  const originZ = bounds.min[2] - cellSize;
  const occupied = new Uint8Array(width * height);
  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      if (surface.contains(originX + x * cellSize, originZ + z * cellSize)) occupied[z * width + x] = 1;
    }
  }
  return {
    width,
    height,
    cellSize,
    originX,
    originZ,
    occupied,
    toWorld: (cell) => {
      const x = cell % width;
      const z = (cell - x) / width;
      return { x: originX + x * cellSize, z: originZ + z * cellSize };
    }
  };
}

/** Chamfer distance from each road cell to the nearest off-road cell. */
function roadDistanceField(raster: RoadRaster): Float64Array {
  const { width, height, occupied } = raster;
  const distance = new Float64Array(occupied.length);
  const INFINITE = 1e9;
  for (let index = 0; index < occupied.length; index += 1) distance[index] = occupied[index] ? INFINITE : 0;
  const forward: readonly (readonly [number, number, number])[] = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.4142], [1, -1, 1.4142]];
  const backward: readonly (readonly [number, number, number])[] = [[1, 0, 1], [0, 1, 1], [1, 1, 1.4142], [-1, 1, 1.4142]];
  const relax = (x: number, z: number, offsets: readonly (readonly [number, number, number])[]): void => {
    const index = z * width + x;
    if (distance[index] === 0) return;
    for (const [dx, dz, cost] of offsets) {
      const nx = x + dx;
      const nz = z + dz;
      const neighbour = (nx < 0 || nx >= width || nz < 0 || nz >= height) ? 0 : distance[nz * width + nx]!;
      distance[index] = Math.min(distance[index]!, neighbour + cost);
    }
  };
  for (let z = 0; z < height; z += 1) for (let x = 0; x < width; x += 1) relax(x, z, forward);
  for (let z = height - 1; z >= 0; z -= 1) for (let x = width - 1; x >= 0; x -= 1) relax(x, z, backward);
  return distance;
}

/** All connected road regions, largest first. */
function largestRoadComponents(raster: RoadRaster): readonly (readonly number[])[] {
  const { width, height, occupied } = raster;
  const seen = new Uint8Array(occupied.length);
  const components: number[][] = [];
  for (let start = 0; start < occupied.length; start += 1) {
    if (!occupied[start] || seen[start]) continue;
    const stack = [start];
    const component: number[] = [];
    seen[start] = 1;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      component.push(cell);
      const x = cell % width;
      const z = (cell - x) / width;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
          const neighbour = nz * width + nx;
          if (occupied[neighbour] && !seen[neighbour]) {
            seen[neighbour] = 1;
            stack.push(neighbour);
          }
        }
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length);
}

/** Background regions fully enclosed by road, largest first. These are infields. */
function roadInteriorHoles(raster: RoadRaster, road: Uint8Array): readonly (readonly number[])[] {
  const inverted = Uint8Array.from(road, (value) => (value ? 0 : 1));
  const { width, height } = raster;
  const regions = largestRoadComponents({ ...raster, occupied: inverted });
  return regions
    .filter((region) => !region.some((cell) => {
      const x = cell % width;
      const z = (cell - x) / width;
      return x === 0 || z === 0 || x === width - 1 || z === height - 1;
    }))
    .sort((a, b) => b.length - a.length);
}

/** Signed area of a closed polyline, used to pick the loop that encloses the most track. */
function polygonArea(points: readonly { readonly x: number; readonly z: number }[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    total += from.x * to.z - to.x * from.z;
  }
  return Math.abs(total) / 2;
}

/** Turning number of a closed polyline about a point; ±1 means the loop encircles it. */
function windsAround(points: readonly { readonly x: number; readonly z: number }[], x: number, z: number): boolean {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    let delta = Math.atan2(to.z - z, to.x - x) - Math.atan2(from.z - z, from.x - x);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    total += delta;
  }
  return Math.abs(total) > Math.PI;
}

/**
 * Traces a closed racing line for circuits the radial sweep cannot handle.
 *
 * The racing line is the road ribbon that *encircles the infield*, so the seam is cut
 * from an enclosed background region (the infield) outward across the ribbon, and the
 * loop is the cheapest road-only path from one side of that seam back to the other.
 * Cutting the seam at the widest road cell instead — as an earlier version did — put
 * the seam in Tsukuba's paddock apron and traced a loop around the service road rather
 * than the circuit (defect 32). Candidate infields are tried largest-first and the
 * result must actually wind around the infield it was cut from.
 */
function traceRoadLoop(
  primitives: readonly PrimitiveGeometry[],
  surface: RoadSurface
): ShowcaseRacingTrackTopology["roadCenterline"] {
  const raster = createRoadRaster(primitives, surface);
  const { width, height } = raster;
  const components = largestRoadComponents(raster);
  const component = components[0];
  if (!component || component.length < 64) return [];
  const road = new Uint8Array(raster.occupied.length);
  for (const cell of component) road[cell] = 1;
  const distance = roadDistanceField({ ...raster, occupied: road });
  let maxDistance = 0;
  for (const value of distance) if (value > maxDistance) maxDistance = value;
  if (maxDistance <= 0) return [];
  // The maximum distance belongs to the middle of a paddock/apron on real assets,
  // not to the centre of the racing ribbon. Using it as the cost target actively
  // rewarded the Tsukuba shortcut across the service apron. A lower quantile of all
  // occupied cells represents the repeatable half-width of the actual road: edge
  // cells occupy the lower tail, circuit centres the middle, and broad aprons the
  // upper tail. The path cost below is then U-shaped around this lane-width target.
  const occupiedDistances = Array.from(distance)
    .filter((value, index) => road[index] === 1 && value > 0 && value < 1e8)
    .sort((a, b) => a - b);
  const preferredDistance = occupiedDistances[
    Math.min(occupiedDistances.length - 1, Math.floor(occupiedDistances.length * 0.58))
  ] ?? Math.max(1, maxDistance * 0.2);

  const holes = roadInteriorHoles(raster, road);
  let best: { points: readonly { x: number; z: number; width: number }[]; area: number } | undefined;
  for (const hole of holes.slice(0, 4)) {
    let holeX = 0;
    let holeZ = 0;
    for (const cell of hole) {
      const x = cell % width;
      holeX += x;
      holeZ += (cell - x) / width;
    }
    holeX = Math.round(holeX / hole.length);
    holeZ = Math.round(holeZ / hole.length);

    // Cut a complete seam: every road cell on the ray running from the infield centroid
    // outward to the edge of the raster. Stopping at the first gap only nicks the nearest
    // ribbon, which leaves a way around and collapses the "loop" to a few cells.
    const seam: number[] = [];
    for (let x = holeX; x < width; x += 1) {
      if (road[holeZ * width + x]) seam.push(holeZ * width + x);
    }
    if (seam.length === 0) continue;
    const loop = shortestRoadLoop(raster, road, distance, preferredDistance, seam);
    if (loop.length < 24) continue;
    const points = loop.map((cell) => {
      const point = raster.toWorld(cell);
      return { x: point.x, z: point.z, width: Math.max(0.12, distance[cell]! * raster.cellSize * 2) };
    });
    const holeWorld = raster.toWorld(holeZ * width + holeX);
    if (!windsAround(points, holeWorld.x, holeWorld.z)) continue;
    const area = polygonArea(points);
    if (!best || area > best.area) best = { points, area };
  }
  if (!best) return [];

  // Resampling a traced loop chords across corners, and on a tight hairpin that chord can
  // clip the apex. Take the densest count that still keeps every emitted point and every
  // interpolated step on the road, rather than loosening the off-road gate.
  for (const count of [72, 64, 56, 48, 40, 32, 28, 24, 20]) {
    const resampled = resampleLoop(best.points, count);
    if (resampled.length < 8) continue;
    if (resampled.some((point) => !surface.contains(point.x, point.z))) continue;
    const centerline = resampled.map((point) => ({
      x: round3(point.x),
      z: round3(point.z),
      width: round3(point.width)
    }));
    if (measureOffRoadRatio(centerline, surface) > RACING_MAX_OFF_ROAD_RATIO) continue;
    const first = centerline[0]!;
    return [...centerline, { x: first.x, z: first.z, width: first.width }];
  }
  return [];
}

/**
 * Cheapest road-only cycle through a seam: Dijkstra from the cells on one side of the
 * seam to the cells on the other, with the seam itself forbidden so the path is forced
 * the long way around. Cost prefers cells far from the road edge, which keeps the
 * result near the middle of the ribbon.
 */
function shortestRoadLoop(
  raster: RoadRaster,
  road: Uint8Array,
  distance: Float64Array,
  preferredDistance: number,
  seam: readonly number[]
): readonly number[] {
  const { width, height } = raster;
  const blocked = new Uint8Array(road.length);
  for (const cell of seam) blocked[cell] = 1;
  // Also block the full raster row outward from the seam, so a path cannot slip around
  // the seam's far end. Without this the "loop" degenerates to a few cells that hop
  // straight over the seam tip (observed on showcaseMiniRaceTrack: seam 33, loop 4).
  const seamRow = seam.length > 0 ? Math.floor(seam[0]! / width) : -1;
  const seamStartX = Math.min(...seam.map((cell) => cell % width));
  if (seamRow >= 0) {
    for (let x = seamStartX; x < width; x += 1) blocked[seamRow * width + x] = 1;
  }
  // Start and finish must be the *same* crossing of the ribbon, otherwise the cheapest
  // "loop" is a two-cell hop between opposite faces of the seam near its inner end.
  // Anchor both to the widest point of the seam (the middle of the road band) and force
  // the search to travel all the way around.
  let anchor = seam[0]!;
  for (const cell of seam) if (distance[cell]! > distance[anchor]!) anchor = cell;
  const anchorX = anchor % width;
  const anchorZ = (anchor - anchorX) / width;
  const above = (anchorZ - 1) * width + anchorX;
  const below = (anchorZ + 1) * width + anchorX;
  if (anchorZ - 1 < 0 || anchorZ + 1 >= height) return [];
  if (!road[above] || blocked[above] || !road[below] || blocked[below]) return [];
  const starts = [above];
  const goals = new Set<number>([below]);

  const cellCost = (cell: number): number => {
    const laneRatio = distance[cell]! / Math.max(1e-6, preferredDistance);
    const edgePenalty = laneRatio < 1 ? 8 * (1 - laneRatio) ** 2 : 0;
    // A little extra width at a corner is normal; a path several lane-widths from
    // any edge is an apron, paddock or parking surface and must not become a racing
    // shortcut merely because it is asphalt-labelled.
    const apronPenalty = laneRatio > 1.6 ? 5 * (laneRatio - 1.6) ** 2 : 0;
    return 1 + edgePenalty + apronPenalty;
  };
  const best = new Float64Array(road.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(road.length).fill(-1);
  const heap: { cell: number; cost: number }[] = [];
  const push = (cell: number, cost: number): void => {
    heap.push({ cell, cost });
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent]!.cost <= heap[index]!.cost) break;
      [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
      index = parent;
    }
  };
  const pop = (): { cell: number; cost: number } | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left]!.cost < heap[smallest]!.cost) smallest = left;
        if (right < heap.length && heap[right]!.cost < heap[smallest]!.cost) smallest = right;
        if (smallest === index) break;
        [heap[smallest], heap[index]] = [heap[index]!, heap[smallest]!];
        index = smallest;
      }
    }
    return top;
  };
  for (const start of starts) {
    best[start] = cellCost(start);
    push(start, best[start]!);
  }
  let goalCell = -1;
  while (heap.length > 0) {
    const entry = pop();
    if (!entry) break;
    if (entry.cost > best[entry.cell]!) continue;
    if (goals.has(entry.cell)) {
      goalCell = entry.cell;
      break;
    }
    const x = entry.cell % width;
    const z = (entry.cell - x) / width;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        const neighbour = nz * width + nx;
        if (!road[neighbour] || blocked[neighbour]) continue;
        const step = dx !== 0 && dz !== 0 ? 1.4142 : 1;
        const cost = entry.cost + step * cellCost(neighbour);
        if (cost < best[neighbour]!) {
          best[neighbour] = cost;
          previous[neighbour] = entry.cell;
          push(neighbour, cost);
        }
      }
    }
  }
  if (goalCell < 0) return [];
  const path: number[] = [];
  for (let cell = goalCell; cell >= 0; cell = previous[cell]!) path.push(cell);
  path.reverse();
  path.push(seam[Math.floor(seam.length / 2)]!);
  return path;
}

/** Resamples a closed polyline to `count` evenly spaced points. */
function resampleLoop(
  points: readonly { readonly x: number; readonly z: number; readonly width: number }[],
  count: number
): readonly { readonly x: number; readonly z: number; readonly width: number }[] {
  if (points.length < 2) return [];
  const loop = [...points, points[0]!];
  const cumulative = [0];
  for (let index = 1; index < loop.length; index += 1) {
    cumulative.push(cumulative[index - 1]! + Math.hypot(loop[index]!.x - loop[index - 1]!.x, loop[index]!.z - loop[index - 1]!.z));
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total <= 0) return [];
  const output: { x: number; z: number; width: number }[] = [];
  for (let step = 0; step < count; step += 1) {
    const target = (step / count) * total;
    let index = 1;
    while (index < cumulative.length && cumulative[index]! < target) index += 1;
    const from = loop[index - 1]!;
    const to = loop[Math.min(index, loop.length - 1)]!;
    const span = cumulative[index]! - cumulative[index - 1]!;
    const t = span > 1e-9 ? (target - cumulative[index - 1]!) / span : 0;
    output.push({
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
      width: from.width + (to.width - from.width) * t
    });
  }
  return output;
}

/**
 * Derives a drivable centreline by sweeping rays from the road centroid and taking
 * the midpoint of the road *band* the ray crosses, then verifying every emitted
 * point and every interpolated step actually lands on road geometry.
 */
function createRoadCenterline(
  primitives: readonly PrimitiveGeometry[],
  bounds: ShowcaseGeometryModelBounds,
  surface: RoadSurface
): ShowcaseRacingTrackTopology["roadCenterline"] {
  const roadBounds = boundsForPrimitives(primitives);
  const centerX = center(roadBounds, 0);
  const centerZ = center(roadBounds, 2);
  const size = boundsSize(roadBounds);
  const maxRadius = Math.hypot(size[0], size[2]) / 2;
  const bins = 72;
  const radialStep = Math.max(1e-4, maxRadius / 400);
  const samples: { x: number; z: number; width: number }[] = [];
  for (let bin = 0; bin < bins; bin += 1) {
    const angle = -Math.PI + ((bin + 0.5) / bins) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    // Collect contiguous on-road spans along the ray, then keep the widest one.
    const spans: { from: number; to: number }[] = [];
    let spanStart: number | undefined;
    for (let radius = radialStep; radius <= maxRadius; radius += radialStep) {
      const on = surface.contains(centerX + dirX * radius, centerZ + dirZ * radius);
      if (on && spanStart === undefined) spanStart = radius;
      if (!on && spanStart !== undefined) {
        spans.push({ from: spanStart, to: radius - radialStep });
        spanStart = undefined;
      }
    }
    if (spanStart !== undefined) spans.push({ from: spanStart, to: maxRadius });
    const widest = spans.reduce<{ from: number; to: number } | undefined>(
      (best, span) => (!best || span.to - span.from > best.to - best.from ? span : best),
      undefined
    );
    if (!widest) continue;
    const radius = (widest.from + widest.to) / 2;
    const x = centerX + dirX * radius;
    const z = centerZ + dirZ * radius;
    if (!surface.contains(x, z)) continue;
    samples.push({
      x: round3(x),
      z: round3(z),
      width: round3(Math.max(0.12, widest.to - widest.from))
    });
  }
  if (samples.length < 8) return [];
  const simplified = simplifyRoadCenterline(samples, surface);
  if (simplified.length < 8) return [];
  const first = simplified[0]!;
  return [...simplified, { x: first.x, z: first.z, width: first.width }];
}

/**
 * Reduces the dense ray-swept samples to a compact route. A point is dropped only
 * when the shortcut it creates still lies entirely on the road *and* the shortcut
 * does not materially lengthen the straight-line step, which keeps the emitted
 * route evenly spaced instead of collapsing whole corners into one long chord.
 */
function simplifyRoadCenterline(
  samples: readonly { readonly x: number; readonly z: number; readonly width: number }[],
  surface: RoadSurface
): readonly { readonly x: number; readonly z: number; readonly width: number }[] {
  const minPoints = 16;
  const maxPoints = 24;
  const kept = [...samples];
  const spacing = (points: typeof kept): number => {
    let total = 0;
    for (let index = 0; index < points.length; index += 1) {
      const from = points[index]!;
      const to = points[(index + 1) % points.length]!;
      total += Math.hypot(to.x - from.x, to.z - from.z);
    }
    return total / points.length;
  };
  // Drop the point whose removal costs the least deviation, until the route is compact.
  while (kept.length > maxPoints) {
    let bestIndex = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = 0; index < kept.length; index += 1) {
      const previous = kept[(index - 1 + kept.length) % kept.length]!;
      const candidate = kept[index]!;
      const next = kept[(index + 1) % kept.length]!;
      if (!segmentStaysOnRoad(previous, next, surface)) continue;
      const cost = perpendicularDistance(candidate, previous, next);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    kept.splice(bestIndex, 1);
  }
  const averageSpacing = spacing(kept);
  // Reject any remaining chord that is wildly longer than the typical step; such a
  // chord means the sweep skipped a section of track rather than simplifying it.
  for (let index = 0; index < kept.length && kept.length > minPoints; index += 1) {
    const from = kept[index]!;
    const to = kept[(index + 1) % kept.length]!;
    if (Math.hypot(to.x - from.x, to.z - from.z) > averageSpacing * 4) return [];
  }
  return kept;
}

function perpendicularDistance(
  point: { readonly x: number; readonly z: number },
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number }
): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return Math.hypot(point.x - from.x, point.z - from.z);
  return Math.abs(dz * (point.x - from.x) - dx * (point.z - from.z)) / length;
}

function segmentStaysOnRoad(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
  surface: RoadSurface
): boolean {
  const samples = 16;
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    if (!surface.contains(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
  }
  return true;
}

function createPlayableSurfaces(
  primitives: readonly PrimitiveGeometry[],
  bounds: ShowcaseGeometryModelBounds,
  authoring?: PlatformerAuthoringMetadata
): readonly ExtractedPlatformerPlayableSurface[] {
  const minX = bounds.min[0];
  const modelToGameScale = platformerModelToGameScale(bounds, authoring);
  const uniquePrimitives = uniquePlayableSurfacePrimitives(primitives);
  const candidateSurfaces: readonly CandidatePlatformerSurface[] = uniquePrimitives
    .map((primitive, index): CandidatePlatformerSurface => {
    const left = (primitive.bounds.min[0] - minX) * modelToGameScale;
    return {
      id: `candidate-platform-${String(index).padStart(2, "0")}`,
      x: round3(left + (primitive.size[0] * modelToGameScale) / 2),
      y: 0,
      width: round3(Math.max(1.2, primitive.size[0] * modelToGameScale)),
      height: round3(Math.max(0.22, primitive.size[1] * modelToGameScale)),
      modelTopY: round3(primitive.bounds.max[1]),
      modelCenterZ: center(primitive.bounds, 2),
      kind: "platform" as const
    };
  });
  const selectedSurfaces = [...dedupePlayableSurfaces(candidateSurfaces)]
    .sort((a, b) => a.x - b.x)
    .slice(0, authoring?.maxRetainedPlayableSurfaces ?? PLATFORMER_MAX_RETAINED_MESH_SURFACES);
  const selectedBaselineTopY = selectedPlayableSurfaceBaseline(selectedSurfaces);
  const topSurfaces: readonly AnchoredPlatformerPlayableSurface[] = selectedSurfaces.map((surface, index): AnchoredPlatformerPlayableSurface => ({
      ...surface,
      id: index === 0 ? "asset-main-ground" : `asset-platform-${String(index).padStart(2, "0")}`,
      y: round3(Math.max(0, surface.modelTopY - selectedBaselineTopY) * modelToGameScale),
      kind: index === 0 ? "ground" as const : "platform" as const
    }));
  const maxX = Math.max(...topSurfaces.map((surface) => surface.x + surface.width / 2));
  const finish: ExtractedPlatformerPlayableSurface = {
    id: "asset-finish-run",
    x: round3(maxX + 1),
    y: topSurfaces[topSurfaces.length - 1]?.y ?? 0.4,
    width: 1.4,
    height: 0.3,
    kind: "finish"
  };
  const checkpoints = [0.2, 0.36, 0.52, 0.68, 0.84, 0.96].map((progress, index) => ({
    id: `asset-checkpoint-${String(index + 1).padStart(2, "0")}`,
    x: round3(maxX * progress),
    y: round3((topSurfaces[index % topSurfaces.length]?.y ?? 0.4) + 0.9),
    width: 1.1,
    height: 1.1,
    kind: "checkpoint" as const
  }));
  const widestGap = topSurfaces.slice(0, -1).map((surface, index) => {
    const next = topSurfaces[index + 1];
    const right = surface.x + surface.width / 2;
    const left = next.x - next.width / 2;
    return { left, right, width: Math.max(0, left - right), floorY: Math.min(surface.y, next.y) };
  }).sort((a, b) => b.width - a.width)[0];
  const hazardWidth = round3(Math.max(0.12, Math.min(0.3, (widestGap?.width ?? 0.18) * 0.8)));
  const hazard: ExtractedPlatformerPlayableSurface = {
    id: "asset-hazard-gap",
    x: round3(widestGap ? (widestGap.left + widestGap.right) / 2 : maxX * 0.58),
    // Keep hazards beneath landing surfaces so they punish a missed jump without creating a respawn trap on the route.
    y: round3((widestGap?.floorY ?? 0) - 0.34),
    width: hazardWidth,
    height: 0.18,
    kind: "hazard"
  };
  return [...topSurfaces, finish, hazard, ...checkpoints];
}

function dedupePlayableSurfaces(
  surfaces: readonly CandidatePlatformerSurface[]
): readonly CandidatePlatformerSurface[] {
  const seen = new Set<string>();
  return surfaces.filter((surface) => {
    const key = [
      surface.x,
      surface.modelTopY,
      surface.width,
      surface.height
    ].map((value) => value.toFixed(2)).join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedPlayableSurfaceBaseline(
  surfaces: readonly AnchoredPlatformerPlayableSurface[]
): number {
  if (surfaces.length === 0) return 0;
  return Math.min(...surfaces.map((surface) => surface.modelTopY));
}

function uniquePlayableSurfacePrimitives(primitives: readonly PrimitiveGeometry[]): readonly PrimitiveGeometry[] {
  const seen = new Set<string>();
  return primitives.filter((primitive) => {
    const key = [
      primitive.bounds.min[0],
      primitive.bounds.min[1],
      primitive.bounds.min[2],
      primitive.bounds.max[0],
      primitive.bounds.max[1],
      primitive.bounds.max[2]
    ].map((value) => value.toFixed(2)).join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build route-to-model anchors whose Y is the *measured drivable surface* under each anchor point.
 *
 * Previously every anchor used `bounds.min[1]` -- the lowest vertex in the entire road/kerb/asphalt
 * family. On Tsukuba that floor is 0.05 model units below the tarmac at the anchor points, which the
 * 2.55x track fit scale magnifies to 0.128 scene units. The route solver then placed the track so its
 * *bounding-box floor* met the car's contact plane, seating the car 0.128 units below the visible
 * road: about 77% of the hero car's wheel diameter, which reads as a car with no wheels sliced off at
 * the tarmac line.
 *
 * Sampling `surface.elevationAt` makes the anchor describe the surface the car actually drives on, so
 * grounding is correct for any track asset regardless of what stray geometry sits in its road family.
 * When a point has no surface triangle beneath it the median drivable elevation is used, which is
 * still a real measurement of the tarmac rather than a bounding-box artefact.
 */
function createRacingAnchorPairs(
  centerline: ShowcaseRacingTrackTopology["roadCenterline"],
  surface: RoadSurface
): NonNullable<ShowcaseRacingTrackTopology["modelAlignment"]["anchorPairs"]> {
  const indices = [0, Math.floor(centerline.length / 3), Math.floor((centerline.length * 2) / 3)];
  return indices.flatMap((index, anchorIndex) => {
    const point = centerline[index];
    if (!point) return [];
    const elevation = surface.elevationAt(point.x, point.z) ?? surface.medianElevation;
    return [{
      id: `mesh-road-anchor-${anchorIndex + 1}`,
      modelPoint: [point.x, round3(elevation), point.z] as const,
      gamePoint: { x: point.x, z: point.z }
    }];
  });
}

function createPlatformerAnchorPairs(
  surfaces: readonly ShowcasePlatformerPlayableSurface[],
  bounds: ShowcaseGeometryModelBounds,
  authoring?: PlatformerAuthoringMetadata
): NonNullable<ShowcasePlatformerPlayableSurfaceMap["modelAlignment"]["anchorPairs"]> {
  const modelToGameScale = platformerModelToGameScale(bounds, authoring);
  const meshBoundSurfaces = meshBoundPlayableSurfaces(surfaces);
  const anchorSource = meshBoundSurfaces.length >= 3 ? meshBoundSurfaces : surfaces;
  const anchorSurfaces = pickPlatformerAnchorSurfaces(anchorSource
    .filter((surface) => isPlayablePlatformerSurfaceKind(surface.kind))
    .sort((a, b) => a.x - b.x));
  return anchorSurfaces.map((surface, index) => ({
      id: `mesh-surface-anchor-${index + 1}`,
      modelPoint: [
        bounds.min[0] + surface.x / modelToGameScale,
        modelTopForSurface(surface, bounds, modelToGameScale),
        modelCenterZForSurface(surface, bounds)
      ] as const,
      gamePoint: { x: surface.x, y: surface.y }
    }));
}

function modelTopForSurface(
  surface: ShowcasePlatformerPlayableSurface,
  bounds: ShowcaseGeometryModelBounds,
  modelToGameScale: number
): number {
  return hasExtractedSurfaceAnchor(surface) ? surface.modelTopY : round3(bounds.min[1] + surface.y / modelToGameScale);
}

function modelCenterZForSurface(
  surface: ShowcasePlatformerPlayableSurface,
  bounds: ShowcaseGeometryModelBounds
): number {
  return hasExtractedSurfaceAnchor(surface) ? surface.modelCenterZ : center(bounds, 2);
}

function hasExtractedSurfaceAnchor(
  surface: ShowcasePlatformerPlayableSurface
): surface is AnchoredPlatformerPlayableSurface {
  return "modelTopY" in surface &&
    typeof surface.modelTopY === "number" &&
    "modelCenterZ" in surface &&
    typeof surface.modelCenterZ === "number";
}

function isPlayablePlatformerSurfaceKind(kind: ShowcasePlatformerPlayableSurface["kind"]): boolean {
  return kind === "ground" || kind === "platform" || kind === "moving";
}

function meshBoundPlayableSurfaces(
  surfaces: readonly ShowcasePlatformerPlayableSurface[]
): readonly AnchoredPlatformerPlayableSurface[] {
  return surfaces.filter((surface): surface is AnchoredPlatformerPlayableSurface =>
    isPlayablePlatformerSurfaceKind(surface.kind) && hasExtractedSurfaceAnchor(surface)
  );
}

function platformerMeshSurfaceQualityBlockers(
  assetId: string,
  surfaces: readonly ExtractedPlatformerPlayableSurface[]
): readonly string[] {
  const blockers: string[] = [];
  if (surfaces.length < PLATFORMER_MIN_MESH_PLAYABLE_SURFACES) {
    blockers.push(`asset-extraction:platformer-too-few-mesh-playable-surfaces:${assetId}:${surfaces.length}`);
  }
  const levelLength = measurePlatformerSurfaceLength(surfaces);
  if (levelLength < PLATFORMER_MIN_LEVEL_LENGTH) {
    blockers.push(`asset-extraction:platformer-level-length-too-short:${assetId}:${round3(levelLength)}`);
  }
  for (const column of ambiguousStackedSurfaceColumns(surfaces)) {
    blockers.push(`asset-extraction:platformer-column-unresolved:${assetId}:${column}`);
  }
  return blockers;
}

function measurePlatformerSurfaceLength(surfaces: readonly ShowcasePlatformerPlayableSurface[]): number {
  if (surfaces.length === 0) return 0;
  const minX = Math.min(...surfaces.map((surface) => surface.x - surface.width / 2));
  const maxX = Math.max(...surfaces.map((surface) => surface.x + surface.width / 2));
  return round3(maxX - minX);
}

function ambiguousStackedSurfaceColumns(surfaces: readonly ExtractedPlatformerPlayableSurface[]): readonly string[] {
  const columns = new Map<string, ExtractedPlatformerPlayableSurface[]>();
  for (const surface of surfaces) {
    const column = platformerSurfaceColumn(surface.x);
    columns.set(column, [...(columns.get(column) ?? []), surface]);
  }
  const ambiguous: string[] = [];
  for (const [column, columnSurfaces] of columns) {
    if (columnSurfaces.length < PLATFORMER_AMBIGUOUS_COLUMN_MIN_SURFACES) continue;
    const minY = Math.min(...columnSurfaces.map((surface) => surface.y));
    const maxY = Math.max(...columnSurfaces.map((surface) => surface.y));
    if (maxY - minY >= PLATFORMER_AMBIGUOUS_COLUMN_MIN_Y_RANGE) ambiguous.push(column);
  }
  return ambiguous;
}

function pickPlatformerAnchorSurfaces(
  surfaces: readonly ShowcasePlatformerPlayableSurface[]
): readonly ShowcasePlatformerPlayableSurface[] {
  if (surfaces.length <= 3) return surfaces;
  const candidates = [
    surfaces[0],
    surfaces[Math.floor(surfaces.length / 2)],
    surfaces[surfaces.length - 1]
  ].filter((surface): surface is ShowcasePlatformerPlayableSurface => Boolean(surface));
  const seen = new Set<string>();
  const anchors = candidates.filter((surface) => {
    const key = `${surface.x.toFixed(2)}:${surface.y.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (anchors.length >= 3) return anchors;
  for (const surface of surfaces) {
    const key = `${surface.x.toFixed(2)}:${surface.y.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push(surface);
    if (anchors.length >= 3) break;
  }
  return anchors;
}

function platformerModelToGameScale(
  bounds: ShowcaseGeometryModelBounds,
  authoring?: PlatformerAuthoringMetadata
): number {
  if (authoring) return authoring.modelToGameScale;
  const size = boundsSize(bounds);
  const widthScale = PLATFORMER_TARGET_GAME_LENGTH / Math.max(0.001, size[0]);
  return round3(Math.min(PLATFORMER_MAX_GAME_SCALE, Math.max(PLATFORMER_MIN_GAME_SCALE, widthScale)));
}

function readPlatformerAuthoringMetadata(document: GltfDocument): PlatformerAuthoringMetadata | undefined {
  if (document.json.asset?.generator !== PLATFORMER_AUTHORED_WORLD_GENERATOR) return undefined;
  const value = document.json.asset.extras?.platformerGeometry;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const metadata = value as Readonly<Record<string, unknown>>;
  const modelToGameScale = metadata.modelToGameScale;
  const sectionModelSpan = metadata.sectionModelSpan;
  const maxRetainedPlayableSurfaces = metadata.maxRetainedPlayableSurfaces;
  const authoredLevelLength = metadata.authoredLevelLength;
  const authoredCompletionSeconds = metadata.authoredCompletionSeconds;
  if (
    typeof modelToGameScale !== "number" || !Number.isFinite(modelToGameScale) ||
    modelToGameScale <= 0 || modelToGameScale > PLATFORMER_MAX_GAME_SCALE ||
    typeof sectionModelSpan !== "number" || !Number.isFinite(sectionModelSpan) || sectionModelSpan <= 0 ||
    typeof maxRetainedPlayableSurfaces !== "number" || !Number.isInteger(maxRetainedPlayableSurfaces) ||
    maxRetainedPlayableSurfaces < PLATFORMER_MAX_RETAINED_MESH_SURFACES ||
    maxRetainedPlayableSurfaces > PLATFORMER_MAX_DECLARED_RETAINED_MESH_SURFACES ||
    (authoredLevelLength !== undefined && (
      typeof authoredLevelLength !== "number" || !Number.isFinite(authoredLevelLength) || authoredLevelLength <= 0
    )) ||
    (authoredCompletionSeconds !== undefined && (
      typeof authoredCompletionSeconds !== "number" || !Number.isFinite(authoredCompletionSeconds) ||
      authoredCompletionSeconds < 30 || authoredCompletionSeconds > 300
    ))
  ) return undefined;
  return {
    modelToGameScale: round3(modelToGameScale),
    sectionModelSpan: round3(sectionModelSpan),
    maxRetainedPlayableSurfaces,
    ...(typeof authoredLevelLength === "number" ? { authoredLevelLength: round3(authoredLevelLength) } : {}),
    ...(typeof authoredCompletionSeconds === "number" ? {
      authoredCompletionSeconds: round3(authoredCompletionSeconds)
    } : {})
  };
}

function platformerCharacterFootprintWidth(
  options: ExtractOptions,
  projectDir: string
): number {
  if (options.characterFootprintWidth !== undefined) return options.characterFootprintWidth;
  if (!options.characterAssetId) return PLATFORMER_DEFAULT_CHARACTER_FOOTPRINT_WIDTH;
  const character = readManifestAssets(projectDir).find((asset) => asset.id === options.characterAssetId);
  const size = character?.boundsMetadata?.size ?? character?.bounds;
  if (!size) return PLATFORMER_DEFAULT_CHARACTER_FOOTPRINT_WIDTH;
  const characterWidthToHeight = size[0] / Math.max(0.001, size[1]);
  const scaledCharacterWidth = characterWidthToHeight * Math.max(0.01, options.characterScaleRatio ?? 0.42);
  return round3(Math.max(PLATFORMER_DEFAULT_CHARACTER_FOOTPRINT_WIDTH, scaledCharacterWidth));
}

function boundsForPrimitives(primitives: readonly PrimitiveGeometry[]): ShowcaseGeometryModelBounds {
  return boundsForVertices(primitives.flatMap((primitive) => [primitive.bounds.min, primitive.bounds.max]));
}

function boundsForVertices(vertices: readonly Vec3[]): ShowcaseGeometryModelBounds {
  const initial: [number, number, number, number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  ];
  const bounds = vertices.reduce((acc, vertex) => [
    Math.min(acc[0], vertex[0]),
    Math.min(acc[1], vertex[1]),
    Math.min(acc[2], vertex[2]),
    Math.max(acc[3], vertex[0]),
    Math.max(acc[4], vertex[1]),
    Math.max(acc[5], vertex[2])
  ] as [number, number, number, number, number, number], initial);
  return {
    min: [round3(bounds[0]), round3(bounds[1]), round3(bounds[2])],
    max: [round3(bounds[3]), round3(bounds[4]), round3(bounds[5])]
  };
}

function boundsSize(bounds: ShowcaseGeometryModelBounds): Vec3 {
  return [
    round3(bounds.max[0] - bounds.min[0]),
    round3(bounds.max[1] - bounds.min[1]),
    round3(bounds.max[2] - bounds.min[2])
  ];
}

function center(bounds: ShowcaseGeometryModelBounds, axis: 0 | 1 | 2): number {
  return round3((bounds.min[axis] + bounds.max[axis]) / 2);
}

function averageRoadWidth(size: Vec3): number {
  return round3(Math.max(0.12, Math.min(size[0], size[2]) * 0.08));
}

function measureClosedRouteLength(points: readonly { readonly x: number; readonly y: number }[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}

function decimateVertices(vertices: readonly Vec3[], maxCount: number): readonly Vec3[] {
  if (vertices.length <= maxCount) return vertices;
  const step = Math.ceil(vertices.length / maxCount);
  return vertices.filter((_vertex, index) => index % step === 0);
}

function nodeMatrix(node: GltfNode): Mat4 {
  if (node.matrix && node.matrix.length === 16 && node.matrix.every(Number.isFinite)) return node.matrix as Mat4;
  const translation = vectorFromArray(node.translation, [0, 0, 0]);
  const scale = vectorFromArray(node.scale, [1, 1, 1]);
  const rotation = quaternionFromArray(node.rotation, [0, 0, 0, 1]);
  return composeMat4(translation, rotation, scale);
}

function vectorFromArray(value: readonly number[] | undefined, fallback: Vec3): Vec3 {
  return value && value.length >= 3 && value.slice(0, 3).every(Number.isFinite)
    ? [value[0] ?? fallback[0], value[1] ?? fallback[1], value[2] ?? fallback[2]]
    : fallback;
}

function quaternionFromArray(value: readonly number[] | undefined, fallback: readonly [number, number, number, number]): readonly [number, number, number, number] {
  return value && value.length >= 4 && value.slice(0, 4).every(Number.isFinite)
    ? [value[0] ?? fallback[0], value[1] ?? fallback[1], value[2] ?? fallback[2], value[3] ?? fallback[3]]
    : fallback;
}

function composeMat4(translation: Vec3, rotation: readonly [number, number, number, number], scale: Vec3): Mat4 {
  const [x, y, z, w] = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * scale[0],
    (xy + wz) * scale[0],
    (xz - wy) * scale[0],
    0,
    (xy - wz) * scale[1],
    (1 - (xx + zz)) * scale[1],
    (yz + wx) * scale[1],
    0,
    (xz + wy) * scale[2],
    (yz - wx) * scale[2],
    (1 - (xx + yy)) * scale[2],
    0,
    translation[0],
    translation[1],
    translation[2],
    1
  ];
}

function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const valueAt = (index: number): number => {
    const row = index % 4;
    const column = Math.floor(index / 4) * 4;
    return a[row] * b[column] + a[row + 4] * b[column + 1] + a[row + 8] * b[column + 2] + a[row + 12] * b[column + 3];
  };
  return [
    valueAt(0), valueAt(1), valueAt(2), valueAt(3),
    valueAt(4), valueAt(5), valueAt(6), valueAt(7),
    valueAt(8), valueAt(9), valueAt(10), valueAt(11),
    valueAt(12), valueAt(13), valueAt(14), valueAt(15)
  ];
}

function transformPoint(matrix: Mat4, point: Vec3): Vec3 {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function requireAssetHash(asset: ManifestAsset): string {
  return asset.hash ?? "sha256-0000000000000000000000000000000000000000000000000000000000000000";
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  // Normalise negative zero: `-0` survives JSON.stringify as `-0`, which makes otherwise identical
  // regenerated evidence differ byte-for-byte and breaks content-hash comparisons.
  return rounded === 0 ? 0 : rounded;
}

function formatSize(size: Vec3): string {
  return `[${size.map((value) => value.toFixed(3)).join(",")}]`;
}

function failure(blockers: readonly string[], reasons: readonly string[]): GeometryExtractionFailure {
  return { ok: false, blockers, reasons };
}
