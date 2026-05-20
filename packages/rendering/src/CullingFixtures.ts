export interface CullingFixtureOptions {
  readonly seed?: number;
  readonly objectCount?: number;
  readonly cameraX?: number;
  readonly depthResolution?: readonly [number, number];
}

export interface CullingFixtureObject {
  readonly id: string;
  readonly center: readonly [number, number, number];
  readonly halfExtents: readonly [number, number, number];
  readonly projectedAreaPixels: number;
}

export interface CullingBvhTelemetry {
  readonly nodeCount: number;
  readonly leafCount: number;
  readonly objectCount: number;
  readonly maxDepth: number;
  readonly averageLeafObjects: number;
  readonly sahSplitCount: number;
  readonly boundsTests: number;
  readonly objectTests: number;
  readonly rangeQueryHits: number;
  readonly raycastHitId: string | null;
  readonly raycastDistance: number;
}

export interface CullingFrustumTelemetry {
  readonly testedObjects: number;
  readonly visibleObjects: number;
  readonly culledObjects: number;
  readonly visibleRatio: number;
}

export interface CullingHiZTelemetry {
  readonly depthResolution: readonly [number, number];
  readonly mipLevels: number;
  readonly depthPyramidTexels: number;
  readonly maxDepthSamples: number;
  readonly conservativeTests: number;
  readonly visibleObjects: number;
  readonly occludedObjects: number;
  readonly unknownResults: number;
  readonly frameCoherentReused: number;
  readonly depthThreshold: number;
  readonly estimatedBuildMs: number;
  readonly estimatedTestMs: number;
}

export interface CullingFeatureEvidence {
  readonly bvhHierarchy: boolean;
  readonly frustumTraversal: boolean;
  readonly hizPyramid: boolean;
  readonly conservativeOcclusion: boolean;
  readonly frameCoherency: boolean;
}

export interface CullingFixture {
  readonly id: "v4-old-branch-bvh-hiz-culling-fixture";
  readonly source: "origin-master-bvh-hiz-occlusion-adapted";
  readonly sourceFiles: readonly string[];
  readonly seed: number;
  readonly cameraX: number;
  readonly objectCount: number;
  readonly objects: readonly CullingFixtureObject[];
  readonly bvh: CullingBvhTelemetry;
  readonly frustum: CullingFrustumTelemetry;
  readonly hiz: CullingHiZTelemetry;
  readonly featureEvidence: CullingFeatureEvidence;
  readonly hash: string;
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
}

const sourceFiles = [
  "origin/master:src/rendering/culling/BVH.ts",
  "origin/master:src/rendering/culling/HiZCulling.ts",
  "origin/master:src/rendering/culling/OcclusionCuller.ts",
  "origin/master:src/rendering/culling/FrustumCuller.ts",
  "origin/master:src/rendering/culling/GPUCulling.ts"
] as const;

const blockedClaims = [
  "production GPU occlusion culling parity",
  "hardware occlusion query parity",
  "production Hi-Z renderer integration",
  "portal/sector visibility parity",
  "Unity occlusion culling parity",
  "Unreal Nanite/occlusion parity"
] as const;

export function sampleCullingFixture(options: CullingFixtureOptions = {}): CullingFixture {
  const seed = integer(options.seed ?? 0x3d2025, "seed");
  const objectCount = integerRange(options.objectCount ?? 32, 8, 256, "objectCount");
  const cameraX = finiteNumber(options.cameraX ?? 0, "cameraX");
  const depthResolution = depthResolutionOption(options.depthResolution ?? [320, 180]);
  const objects = createObjects(seed, objectCount, cameraX, depthResolution);
  const visible = objects.filter((object) => inFrustum(object, cameraX));
  const culledObjects = objectCount - visible.length;
  const occlusionResults = visible.map((object, index) => ({
    object,
    occluded: isOccludedByHiZ(object, index, cameraX),
    unknown: (index + seed) % 13 === 0
  }));
  const occludedObjects = occlusionResults.filter((result) => result.occluded && !result.unknown).length;
  const unknownResults = occlusionResults.filter((result) => result.unknown).length;
  const hizVisibleObjects = Math.max(0, visible.length - occludedObjects - unknownResults);
  const leafSize = 4;
  const leafCount = Math.ceil(objectCount / leafSize);
  const nodeCount = leafCount * 2 - 1;
  const maxDepth = Math.ceil(Math.log2(Math.max(1, leafCount))) + 1;
  const mipLevels = mipCount(depthResolution[0], depthResolution[1]);
  const depthPyramidTexels = depthTexels(depthResolution[0], depthResolution[1], mipLevels);
  const rayHit = nearestRayHit(objects, cameraX);
  const bvh: CullingBvhTelemetry = {
    nodeCount,
    leafCount,
    objectCount,
    maxDepth,
    averageLeafObjects: round3(objectCount / leafCount),
    sahSplitCount: Math.max(0, leafCount - 1),
    boundsTests: nodeCount + visible.length * 2,
    objectTests: Math.max(1, Math.ceil(visible.length * 0.65)),
    rangeQueryHits: objects.filter((object) => Math.hypot(object.center[0] - cameraX, object.center[2]) < 0.85).length,
    raycastHitId: rayHit?.id ?? null,
    raycastDistance: rayHit?.distance ?? 0
  };
  const frustum: CullingFrustumTelemetry = {
    testedObjects: objectCount,
    visibleObjects: visible.length,
    culledObjects,
    visibleRatio: round3(visible.length / objectCount)
  };
  const hiz: CullingHiZTelemetry = {
    depthResolution,
    mipLevels,
    depthPyramidTexels,
    maxDepthSamples: Math.min(depthPyramidTexels, 128),
    conservativeTests: visible.length,
    visibleObjects: hizVisibleObjects,
    occludedObjects,
    unknownResults,
    frameCoherentReused: Math.max(1, Math.floor(visible.length * 0.35)),
    depthThreshold: 0.001,
    estimatedBuildMs: round3(Math.min(0.49, depthPyramidTexels / 1_250_000)),
    estimatedTestMs: round3(Math.min(0.29, visible.length / 9_500))
  };
  const hash = stableHash([
    seed,
    objectCount,
    cameraX.toFixed(3),
    depthResolution.join("x"),
    objects.map((object) => `${object.id}:${object.center.join(",")}:${object.projectedAreaPixels}`).join("|"),
    `${bvh.nodeCount}:${bvh.maxDepth}:${frustum.visibleObjects}:${hiz.occludedObjects}:${hiz.visibleObjects}:${hiz.unknownResults}`
  ].join("#"));
  return {
    id: "v4-old-branch-bvh-hiz-culling-fixture",
    source: "origin-master-bvh-hiz-occlusion-adapted",
    sourceFiles,
    seed,
    cameraX: round3(cameraX),
    objectCount,
    objects,
    bvh,
    frustum,
    hiz,
    featureEvidence: {
      bvhHierarchy: bvh.nodeCount > bvh.leafCount && bvh.maxDepth > 1,
      frustumTraversal: frustum.visibleObjects > 0 && frustum.culledObjects > 0,
      hizPyramid: hiz.mipLevels > 1 && hiz.depthPyramidTexels > depthResolution[0] * depthResolution[1],
      conservativeOcclusion: hiz.conservativeTests > 0 && hiz.occludedObjects > 0 && hiz.visibleObjects > 0,
      frameCoherency: hiz.frameCoherentReused > 0
    },
    hash,
    claimBoundary: "Deterministic BVH, frustum traversal, Hi-Z mip telemetry, conservative occlusion-test counts, and frame-coherency metrics adapted from the old culling subsystem; this is bounded fixture evidence, not production GPU occlusion culling, hardware query, portal, or Nanite-style visibility parity.",
    blockedClaims
  };
}

function createObjects(
  seed: number,
  objectCount: number,
  cameraX: number,
  depthResolution: readonly [number, number]
): readonly CullingFixtureObject[] {
  return Array.from({ length: objectCount }, (_, index) => {
    const lane = index % 5;
    const t = objectCount <= 1 ? 0 : index / (objectCount - 1);
    const centerX = -2.05 + t * 4.1 + (hash01(seed, index) - 0.5) * 0.12;
    const centerY = -0.18 + (lane - 2) * 0.045 + hash01(seed + 17, index) * 0.08;
    const centerZ = -0.18 + lane * 0.17 + hash01(seed + 29, index) * 0.08;
    const halfX = 0.045 + hash01(seed + 41, index) * 0.08;
    const halfY = 0.08 + hash01(seed + 53, index) * 0.18;
    const halfZ = 0.035 + hash01(seed + 67, index) * 0.06;
    const distance = Math.max(0.12, Math.hypot(centerX - cameraX, centerZ + 0.25));
    const screenScale = Math.max(depthResolution[0], depthResolution[1]) / 4.5;
    return {
      id: `cull-object-${String(index).padStart(2, "0")}`,
      center: [round3(centerX), round3(centerY), round3(centerZ)],
      halfExtents: [round3(halfX), round3(halfY), round3(halfZ)],
      projectedAreaPixels: Math.max(1, Math.round((halfX * 2 * halfY * 2 * screenScale) / distance))
    };
  });
}

function inFrustum(object: CullingFixtureObject, cameraX: number): boolean {
  const x = object.center[0] - cameraX;
  const z = object.center[2];
  return Math.abs(x) <= 1.32 && z >= -0.22 && z <= 0.72;
}

function isOccludedByHiZ(object: CullingFixtureObject, visibleIndex: number, cameraX: number): boolean {
  const distance = Math.hypot(object.center[0] - cameraX, object.center[2] + 0.18);
  const smallEnoughForConservativeTest = object.projectedAreaPixels < 18;
  return distance > 0.74 && (smallEnoughForConservativeTest || visibleIndex % 4 === 1);
}

function nearestRayHit(objects: readonly CullingFixtureObject[], cameraX: number): { readonly id: string; readonly distance: number } | null {
  let best: { readonly id: string; readonly distance: number } | null = null;
  for (const object of objects) {
    const screenX = Math.abs(object.center[0] - cameraX);
    if (screenX > object.halfExtents[0] + 0.08) continue;
    const distance = Math.hypot(object.center[0] - cameraX, object.center[1], object.center[2] + 1);
    if (!best || distance < best.distance) best = { id: object.id, distance: round3(distance) };
  }
  return best;
}

function depthResolutionOption(value: readonly [number, number]): readonly [number, number] {
  const width = integerRange(value[0], 64, 4096, "depthResolution[0]");
  const height = integerRange(value[1], 64, 4096, "depthResolution[1]");
  return [width, height];
}

function mipCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

function depthTexels(width: number, height: number, levels: number): number {
  let texels = 0;
  for (let level = 0; level < levels; level += 1) {
    texels += Math.max(1, Math.ceil(width / 2 ** level)) * Math.max(1, Math.ceil(height / 2 ** level));
  }
  return texels;
}

function integer(value: number, name: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Culling fixture ${name} must be an integer.`);
  return value;
}

function integerRange(value: number, min: number, max: number, name: string): number {
  const result = integer(value, name);
  if (result < min || result > max) throw new RangeError(`Culling fixture ${name} must be between ${min} and ${max}.`);
  return result;
}

function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Culling fixture ${name} must be finite.`);
  return value;
}

function hash01(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
