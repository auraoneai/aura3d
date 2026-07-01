import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readManifestAssets, type ManifestAsset } from "./showcase-spec-replacement-manifest.js";
import type {
  ShowcaseGeometryModelBounds,
  ShowcasePlatformerPlayableSurface,
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology
} from "./showcase-spec-types.js";

type Vec3 = readonly [number, number, number];
type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

interface ExtractOptions {
  readonly projectDir?: string;
  readonly renderedProbePath?: string;
  readonly routeOverlayPath?: string;
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
}

interface AssetGeometry {
  readonly asset: ManifestAsset;
  readonly primitives: readonly PrimitiveGeometry[];
  readonly bounds: ShowcaseGeometryModelBounds;
}

interface PlatformerSurfacePrimitiveSelection {
  readonly primitives: readonly PrimitiveGeometry[];
  readonly mode: "semantic" | "geometric";
  readonly reasons: readonly string[];
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

const ROAD_PATTERN = /\b(asph|asphalt|road|track|circuit|route|lane|kerb|curb)\b/i;
const ROAD_EXCLUDE_PATTERN = /\b(grass|water|lake|mount|terrain|wall|fence|tree|building|sky)\b/i;
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

export function extractRacingTrackTopologyFromAsset(
  assetId: string,
  options: ExtractOptions = {}
): GeometryExtractionResult<ShowcaseRacingTrackTopology> {
  const geometry = loadAssetGeometry(assetId, options.projectDir ?? process.cwd());
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
  const centerline = createRoadCenterline(roadPrimitives, roadBounds);
  if (centerline.length < 8) {
    return failure(
      [`asset-extraction:racing-road-centerline-ambiguous:${assetId}`],
      [`Road mesh in ${assetId} produced only ${centerline.length} reliable centerline samples.`]
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
  const topology: ShowcaseRacingTrackTopology = {
    assetId,
    assetHash: requireAssetHash(geometry.value.asset),
    source: "asset-mesh-extracted",
    roadCenterline: centerline,
    checkpoints: Array.from({ length: checkpointCount }, (_unused, index) => ({
      progress: round3((index + 1) / checkpointCount),
      width: centerline[index % centerline.length]?.width ?? averageRoadWidth(roadSize)
    })),
    lapLengthMeters: round3(lapLength),
    estimatedLapSeconds: Math.max(30, Math.ceil(lapLength / 0.28)),
    confidence: 0.76,
    modelAlignment: {
      source: "asset-mesh-extracted",
      modelBounds: geometry.value.bounds,
      modelPoint: [center(roadBounds, 0), roadBounds.min[1], center(roadBounds, 2)],
      gamePoint: {
        x: center(roadBounds, 0),
        z: center(roadBounds, 2)
      },
      anchorPairs: createRacingAnchorPairs(centerline, roadBounds),
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
      `estimatedLapSeconds:${topology.estimatedLapSeconds}`
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
  const surfaces = createPlayableSurfaces(horizontalCandidates, surfaceBounds);
  const meshPlayableSurfaces = meshBoundPlayableSurfaces(surfaces);
  const qualityBlockers = platformerMeshSurfaceQualityBlockers(assetId, meshPlayableSurfaces);
  if (qualityBlockers.length > 0) {
    return failure(
      qualityBlockers,
      [
        `${assetId} produced ${meshPlayableSurfaces.length} mesh-bound playable surface(s); public platformer worlds require retained game geometry, not generated checkpoint/finish markers.`,
        ...qualityBlockers,
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
    estimatedCompletionSeconds: Math.max(30, Math.ceil(levelLength / 0.9)),
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
      anchorPairs: createPlatformerAnchorPairs(surfaces, surfaceBounds),
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
      ...surfaceSelection.reasons,
      `surfaceCount:${surfaces.length}`,
      `meshPlayableSurfaceCount:${meshPlayableSurfaces.length}`,
      `estimatedCompletionSeconds:${map.estimatedCompletionSeconds}`
    ]
  };
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
      bounds: boundsForPrimitives(primitives)
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
      vertices: vertices.length > 800 ? decimateVertices(vertices, 800) : vertices
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

function isRoadPrimitive(primitive: PrimitiveGeometry): boolean {
  const label = `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`;
  return ROAD_PATTERN.test(label) && !ROAD_EXCLUDE_PATTERN.test(label);
}

function isPlatformPrimitive(primitive: PrimitiveGeometry): boolean {
  const label = `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`;
  return PLATFORM_PATTERN.test(label) && !PLATFORM_EXCLUDE_PATTERN.test(label);
}

function selectPlatformerSurfacePrimitives(geometry: AssetGeometry): PlatformerSurfacePrimitiveSelection {
  const semantic = geometry.primitives.filter(isPlatformPrimitive);
  if (semantic.length > 0) {
    return {
      primitives: semantic,
      mode: "semantic",
      reasons: [`selected ${semantic.length} primitive(s) by semantic platform/world labels`]
    };
  }

  const geometric = geometry.primitives.filter((primitive) => isGenericPlatformerSurfacePrimitive(primitive, geometry.bounds));
  return {
    primitives: geometric,
    mode: "geometric",
    reasons: geometric.length > 0
      ? [`selected ${geometric.length} primitive(s) by flat horizontal game-surface geometry because the asset uses generic node/material names`]
      : ["semantic labels were absent and no flat horizontal primitive passed the game-surface footprint filter"]
  };
}

function isGenericPlatformerSurfacePrimitive(primitive: PrimitiveGeometry, modelBounds: ShowcaseGeometryModelBounds): boolean {
  const label = `${primitive.nodeName} ${primitive.meshName} ${primitive.materialName}`;
  if (PLATFORM_EXCLUDE_PATTERN.test(label)) return false;
  if (!isHorizontalSurface(primitive)) return false;
  const modelSize = boundsSize(modelBounds);
  const modelFootprint = Math.max(0.001, modelSize[0] * modelSize[2]);
  const primitiveFootprint = primitive.size[0] * primitive.size[2];
  const verticalPosition = (primitive.bounds.max[1] - modelBounds.min[1]) / Math.max(0.001, modelSize[1]);
  const longestAxis = Math.max(primitive.size[0], primitive.size[2]);
  const shortestAxis = Math.min(primitive.size[0], primitive.size[2]);
  return primitiveFootprint >= Math.max(0.08, modelFootprint * 0.00045) &&
    longestAxis >= Math.max(0.7, modelSize[0] * 0.006) &&
    shortestAxis >= 0.16 &&
    verticalPosition <= 0.92;
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

function createRoadCenterline(primitives: readonly PrimitiveGeometry[], bounds: ShowcaseGeometryModelBounds): ShowcaseRacingTrackTopology["roadCenterline"] {
  const allVertices = primitives.flatMap((primitive) => primitive.vertices);
  const centerX = center(bounds, 0);
  const centerZ = center(bounds, 2);
  const bins = 20;
  const samples = Array.from({ length: bins }, (_unused, bin) => {
    const minAngle = -Math.PI + (bin / bins) * Math.PI * 2;
    const maxAngle = -Math.PI + ((bin + 1) / bins) * Math.PI * 2;
    const vertices = allVertices.filter((vertex) => {
      const angle = Math.atan2(vertex[2] - centerZ, vertex[0] - centerX);
      return angle >= minAngle && angle < maxAngle;
    });
    if (vertices.length < 4) return undefined;
    const averageRadius = average(vertices.map((vertex) => Math.hypot(vertex[0] - centerX, vertex[2] - centerZ))) * 0.68;
    const angle = (minAngle + maxAngle) / 2;
    return {
      x: round3(centerX + Math.cos(angle) * averageRadius),
      z: round3(centerZ + Math.sin(angle) * averageRadius),
      width: averageRoadWidth(boundsSize(bounds))
    };
  }).filter((point): point is NonNullable<typeof point> => Boolean(point));
  if (samples.length > 0) {
    const first = samples[0];
    if (first) return [...samples, first];
  }
  return [];
}

function createPlayableSurfaces(primitives: readonly PrimitiveGeometry[], bounds: ShowcaseGeometryModelBounds): readonly ExtractedPlatformerPlayableSurface[] {
  const minX = bounds.min[0];
  const modelToGameScale = platformerModelToGameScale(bounds);
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
    .slice(0, 8);
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
  const hazard: ExtractedPlatformerPlayableSurface = {
    id: "asset-hazard-gap",
    x: round3(maxX * 0.58),
    y: round3((topSurfaces[Math.min(2, topSurfaces.length - 1)]?.y ?? 0.4) + 0.34),
    width: 0.48,
    height: 0.24,
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

function createRacingAnchorPairs(
  centerline: ShowcaseRacingTrackTopology["roadCenterline"],
  bounds: ShowcaseGeometryModelBounds
): NonNullable<ShowcaseRacingTrackTopology["modelAlignment"]["anchorPairs"]> {
  const indices = [0, Math.floor(centerline.length / 3), Math.floor((centerline.length * 2) / 3)];
  return indices.flatMap((index, anchorIndex) => {
    const point = centerline[index];
    return point
      ? [{
        id: `mesh-road-anchor-${anchorIndex + 1}`,
        modelPoint: [point.x, bounds.min[1], point.z] as const,
        gamePoint: { x: point.x, z: point.z }
      }]
      : [];
  });
}

function createPlatformerAnchorPairs(
  surfaces: readonly ShowcasePlatformerPlayableSurface[],
  bounds: ShowcaseGeometryModelBounds
): NonNullable<ShowcasePlatformerPlayableSurfaceMap["modelAlignment"]["anchorPairs"]> {
  const modelToGameScale = platformerModelToGameScale(bounds);
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
  if (hasAmbiguousStackedSurfaceColumn(surfaces)) {
    blockers.push(`asset-extraction:platformer-playable-surface-columns-ambiguous:${assetId}`);
  }
  return blockers;
}

function measurePlatformerSurfaceLength(surfaces: readonly ShowcasePlatformerPlayableSurface[]): number {
  if (surfaces.length === 0) return 0;
  const minX = Math.min(...surfaces.map((surface) => surface.x - surface.width / 2));
  const maxX = Math.max(...surfaces.map((surface) => surface.x + surface.width / 2));
  return round3(maxX - minX);
}

function hasAmbiguousStackedSurfaceColumn(surfaces: readonly ExtractedPlatformerPlayableSurface[]): boolean {
  const columns = new Map<string, ExtractedPlatformerPlayableSurface[]>();
  for (const surface of surfaces) {
    const column = (Math.round(surface.x / PLATFORMER_AMBIGUOUS_COLUMN_STEP) * PLATFORMER_AMBIGUOUS_COLUMN_STEP).toFixed(2);
    columns.set(column, [...(columns.get(column) ?? []), surface]);
  }
  for (const columnSurfaces of columns.values()) {
    if (columnSurfaces.length < PLATFORMER_AMBIGUOUS_COLUMN_MIN_SURFACES) continue;
    const minY = Math.min(...columnSurfaces.map((surface) => surface.y));
    const maxY = Math.max(...columnSurfaces.map((surface) => surface.y));
    if (maxY - minY >= PLATFORMER_AMBIGUOUS_COLUMN_MIN_Y_RANGE) return true;
  }
  return false;
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

function platformerModelToGameScale(bounds: ShowcaseGeometryModelBounds): number {
  const size = boundsSize(bounds);
  const widthScale = PLATFORMER_TARGET_GAME_LENGTH / Math.max(0.001, size[0]);
  return round3(Math.min(PLATFORMER_MAX_GAME_SCALE, Math.max(PLATFORMER_MIN_GAME_SCALE, widthScale)));
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
  return Math.round(value * 1000) / 1000;
}

function formatSize(size: Vec3): string {
  return `[${size.map((value) => value.toFixed(3)).join(",")}]`;
}

function failure(blockers: readonly string[], reasons: readonly string[]): GeometryExtractionFailure {
  return { ok: false, blockers, reasons };
}
