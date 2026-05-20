import type { GLTFAsset, GLTFMaterialAsset, GLTFMeshAsset } from "./GLTFLoader";

export interface GLTFSceneAnalysisOptions {
  readonly asset: GLTFAsset;
  readonly url?: string;
  readonly maskWidth?: number;
  readonly maskHeight?: number;
  readonly minCoverage?: number;
  readonly topCategories?: number;
}

export interface GLTFSemanticSegment {
  readonly label: string;
  readonly classIndex: number;
  readonly pixelCount: number;
  readonly coverage: number;
  readonly confidence: number;
  readonly source: "geometry" | "material" | "texture" | "animation" | "scene";
}

export type GLTFComputerVisionBoundingBox = readonly [number, number, number, number];

export interface GLTFObjectDetectionEvidence {
  readonly label: string;
  readonly confidence: number;
  readonly bbox: GLTFComputerVisionBoundingBox;
  readonly classIndex: number;
  readonly meshName: string;
  readonly materialName: string;
}

export interface GLTFObjectTrackEvidence {
  readonly id: number;
  readonly label: string;
  readonly bbox: GLTFComputerVisionBoundingBox;
  readonly confidence: number;
  readonly age: number;
  readonly timeSinceUpdate: number;
  readonly velocity: GLTFComputerVisionBoundingBox;
  readonly historyLength: number;
}

export interface GLTFPoseKeypointEvidence {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly confidence: number;
}

export interface GLTFPoseEvidence {
  readonly label: string;
  readonly confidence: number;
  readonly bbox: GLTFComputerVisionBoundingBox;
  readonly keypoints: readonly GLTFPoseKeypointEvidence[];
}

export interface GLTFSceneAnalysisEvidence {
  readonly source: "origin-master-scene-analyzer-adapted";
  readonly analyzer: "deterministic-gltf-scene-analysis";
  readonly assetId: string;
  readonly mask: {
    readonly width: number;
    readonly height: number;
    readonly classCount: number;
    readonly hash: string;
    readonly dominantClassIndex: number;
  };
  readonly segments: readonly GLTFSemanticSegment[];
  readonly dominantCategories: readonly string[];
  readonly confidence: number;
  readonly objectDetections: readonly GLTFObjectDetectionEvidence[];
  readonly objectTracks: readonly GLTFObjectTrackEvidence[];
  readonly poses: readonly GLTFPoseEvidence[];
  readonly cvSystem: {
    readonly source: "gltf-metadata-not-camera";
    readonly classificationTelemetry: boolean;
    readonly detectionTelemetry: boolean;
    readonly trackingTelemetry: boolean;
    readonly poseTelemetry: boolean;
    readonly inferenceRuntime: "not-used";
    readonly modelLoading: "not-used";
  };
  readonly sceneComplexity: {
    readonly meshCount: number;
    readonly materialCount: number;
    readonly textureCount: number;
    readonly vertexCount: number;
    readonly indexCount: number;
    readonly animationCount: number;
    readonly skinCount: number;
    readonly morphTargetCount: number;
    readonly extensionCount: number;
  };
  readonly productionReadiness: {
    readonly semanticSegmentTelemetry: true;
    readonly deterministicMaskSummary: true;
    readonly deterministicObjectTelemetry: true;
    readonly deterministicTrackingTelemetry: true;
    readonly skeletalPoseTelemetry: boolean;
    readonly complexityBudgetTelemetry: true;
    readonly browserAssetViewerEvidence: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

type SegmentAccumulator = {
  readonly label: string;
  readonly classIndex: number;
  readonly source: GLTFSemanticSegment["source"];
  weight: number;
  confidenceSum: number;
  confidenceSamples: number;
};

export function createGLTFSceneAnalysisEvidence(options: GLTFSceneAnalysisOptions): GLTFSceneAnalysisEvidence {
  const maskWidth = normalizeDimension(options.maskWidth ?? 48, "maskWidth");
  const maskHeight = normalizeDimension(options.maskHeight ?? 32, "maskHeight");
  const minCoverage = Math.max(0, options.minCoverage ?? 0.5);
  const topCategories = Math.max(1, Math.trunc(options.topCategories ?? 5));
  const assetId = normalizeAssetId(options.asset.url || options.url || options.asset.meshes[0]?.name || "gltf-scene");
  const accumulators = collectSegments(options.asset);
  const totalWeight = Math.max(1, [...accumulators.values()].reduce((sum, segment) => sum + segment.weight, 0));
  const segments = [...accumulators.values()]
    .map((segment): GLTFSemanticSegment => ({
      label: segment.label,
      classIndex: segment.classIndex,
      pixelCount: Math.max(1, Math.round((segment.weight / totalWeight) * maskWidth * maskHeight)),
      coverage: Number(((segment.weight / totalWeight) * 100).toFixed(3)),
      confidence: Number((segment.confidenceSum / Math.max(1, segment.confidenceSamples)).toFixed(4)),
      source: segment.source
    }))
    .filter((segment) => segment.coverage >= minCoverage)
    .sort((left, right) => right.coverage - left.coverage || left.classIndex - right.classIndex);
  const mask = createMaskSummary(maskWidth, maskHeight, segments);
  const sceneComplexity = summarizeComplexity(options.asset);
  const objectDetections = createObjectDetections(options.asset);
  const objectTracks = createObjectTracks(objectDetections);
  const poses = createPoseEvidence(options.asset, objectDetections);
  const core = {
    assetId,
    mask,
    dominantCategories: segments.slice(0, topCategories).map((segment) => segment.label),
    objectDetections,
    objectTracks,
    poses,
    sceneComplexity
  };
  return {
    source: "origin-master-scene-analyzer-adapted",
    analyzer: "deterministic-gltf-scene-analysis",
    assetId,
    mask,
    segments,
    dominantCategories: core.dominantCategories,
    confidence: Number((segments.reduce((sum, segment) => sum + segment.confidence * segment.coverage, 0) / Math.max(1, segments.reduce((sum, segment) => sum + segment.coverage, 0))).toFixed(4)),
    objectDetections,
    objectTracks,
    poses,
    cvSystem: {
      source: "gltf-metadata-not-camera",
      classificationTelemetry: segments.length > 0,
      detectionTelemetry: objectDetections.length > 0,
      trackingTelemetry: objectTracks.length > 0,
      poseTelemetry: poses.length > 0,
      inferenceRuntime: "not-used",
      modelLoading: "not-used"
    },
    sceneComplexity,
    productionReadiness: {
      semanticSegmentTelemetry: true,
      deterministicMaskSummary: true,
      deterministicObjectTelemetry: true,
      deterministicTrackingTelemetry: true,
      skeletalPoseTelemetry: poses.length > 0,
      complexityBudgetTelemetry: true,
      browserAssetViewerEvidence: true
    },
    blockedClaims: [
      "neural semantic segmentation parity",
      "pixel-accurate object detection parity",
      "real camera/image computer-vision inference",
      "Unity Sentis/Barracuda runtime parity",
      "Unreal ML Deformer or computer-vision plugin parity"
    ],
    claimBoundary: "This evidence ports the old branch SceneAnalyzer/ObjectDetector/ObjectTracker/PoseEstimator concepts into deterministic glTF scene telemetry: semantic buckets, object boxes, tracks, and skeleton pose keypoints are inferred from loaded asset metadata. It does not run neural segmentation, camera inference, YOLO/SORT/Posenet models, or pixel-accurate object detection, and it does not claim Unity or Unreal ML/CV parity.",
    hash: stableHash(JSON.stringify(core))
  };
}

function collectSegments(asset: GLTFAsset): Map<string, SegmentAccumulator> {
  const segments = new Map<string, SegmentAccumulator>();
  for (const mesh of asset.meshes) {
    const material = asset.materials[mesh.materialIndex ?? -1];
    addSegment(segments, "mesh-geometry", 1, "geometry", Math.max(1, mesh.geometry.vertexCount / 128), 0.88);
    addSegment(segments, lodGeometryLabel(mesh), 2, "geometry", Math.max(1, mesh.geometry.indexCount / 192), 0.82);
    if (mesh.skinIndex !== undefined) addSegment(segments, "skinned-character-geometry", 3, "geometry", 2.5, 0.9);
    if (mesh.morphTargets.length > 0) addSegment(segments, "morph-target-geometry", 4, "geometry", mesh.morphTargets.length * 1.8, 0.9);
    if (mesh.materialVariants.length > 0) addSegment(segments, "variant-material-region", 5, "material", mesh.materialVariants.length * 1.4, 0.84);
    if (material) collectMaterialSegments(segments, material);
  }
  if (asset.textures.length > 0) addSegment(segments, "texture-backed-surface", 10, "texture", asset.textures.length * 1.6, 0.86);
  if (asset.images.length > 0) addSegment(segments, "image-resource-region", 11, "texture", asset.images.length * 1.1, 0.82);
  if (asset.animations.length > 0) addSegment(segments, "animated-scene-region", 12, "animation", asset.animations.length * 2.2, 0.87);
  if (asset.skins.length > 0) addSegment(segments, "skeleton-rig-region", 13, "animation", asset.skins.length * 2.4, 0.89);
  if (asset.cameras.length > 0) addSegment(segments, "camera-authored-scene", 14, "scene", asset.cameras.length, 0.8);
  if (asset.lights.length > 0) addSegment(segments, "punctual-light-scene", 15, "scene", asset.lights.length * 1.2, 0.82);
  if (segments.size === 0) addSegment(segments, "empty-gltf-scene", 0, "scene", 1, 0.25);
  return segments;
}

function collectMaterialSegments(segments: Map<string, SegmentAccumulator>, material: GLTFMaterialAsset): void {
  addSegment(segments, material.unlit ? "unlit-material" : "pbr-material", 20, "material", material.unlit ? 1.1 : 2.8, material.unlit ? 0.76 : 0.9);
  if (material.metallicFactor > 0.05) addSegment(segments, "metallic-surface", 21, "material", 1 + material.metallicFactor * 2, 0.86);
  if (material.roughnessFactor < 0.45) addSegment(segments, "glossy-surface", 22, "material", 1 + (0.45 - material.roughnessFactor) * 2, 0.82);
  if (material.normalTexture) addSegment(segments, "normal-mapped-surface", 23, "texture", 1.5, 0.86);
  if (material.baseColorTexture) addSegment(segments, "albedo-textured-surface", 24, "texture", 1.7, 0.86);
  if (material.metallicRoughnessTexture) addSegment(segments, "metallic-roughness-textured-surface", 25, "texture", 1.5, 0.84);
  if (material.emissiveTexture || material.emissiveStrength > 1 || material.emissiveFactor.some((value) => value > 0)) addSegment(segments, "emissive-surface", 26, "material", 1.2 + material.emissiveStrength * 0.2, 0.84);
  if (material.alphaMode !== "OPAQUE") addSegment(segments, "transparent-surface", 27, "material", material.alphaMode === "BLEND" ? 1.7 : 1.2, 0.83);
  if (material.doubleSided) addSegment(segments, "double-sided-surface", 28, "material", 1.1, 0.8);
  if (material.clearcoat) addSegment(segments, "clearcoat-surface", 29, "material", 1.5, 0.84);
  if (material.transmission || material.diffuseTransmission || material.volume) addSegment(segments, "transmissive-volume-surface", 30, "material", 1.8, 0.82);
  if (material.sheen) addSegment(segments, "sheen-fabric-surface", 31, "material", 1.4, 0.82);
  if (material.anisotropy) addSegment(segments, "anisotropic-surface", 32, "material", 1.4, 0.82);
  if (material.iridescence) addSegment(segments, "iridescent-surface", 33, "material", 1.4, 0.82);
}

function addSegment(
  segments: Map<string, SegmentAccumulator>,
  label: string,
  classIndex: number,
  source: GLTFSemanticSegment["source"],
  weight: number,
  confidence: number
): void {
  const existing = segments.get(label);
  if (existing) {
    existing.weight += Math.max(0, weight);
    existing.confidenceSum += confidence;
    existing.confidenceSamples += 1;
    return;
  }
  segments.set(label, {
    label,
    classIndex,
    source,
    weight: Math.max(0, weight),
    confidenceSum: confidence,
    confidenceSamples: 1
  });
}

function createMaskSummary(width: number, height: number, segments: readonly GLTFSemanticSegment[]): GLTFSceneAnalysisEvidence["mask"] {
  const totalPixels = width * height;
  const mask = new Uint8Array(totalPixels);
  let cursor = 0;
  for (const segment of segments) {
    const count = Math.min(totalPixels - cursor, Math.max(1, Math.round((segment.coverage / 100) * totalPixels)));
    mask.fill(segment.classIndex, cursor, cursor + count);
    cursor += count;
    if (cursor >= totalPixels) break;
  }
  return {
    width,
    height,
    classCount: new Set(segments.map((segment) => segment.classIndex)).size,
    hash: stableHash(String.fromCharCode(...mask)),
    dominantClassIndex: segments[0]?.classIndex ?? 0
  };
}

function summarizeComplexity(asset: GLTFAsset): GLTFSceneAnalysisEvidence["sceneComplexity"] {
  return {
    meshCount: asset.meshes.length,
    materialCount: asset.materials.length,
    textureCount: asset.textures.length,
    vertexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.vertexCount, 0),
    indexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.indexCount, 0),
    animationCount: asset.animations.length,
    skinCount: asset.skins.length,
    morphTargetCount: asset.meshes.reduce((sum, mesh) => sum + mesh.morphTargets.length, 0),
    extensionCount: asset.loaderDiagnostics.extensionsUsed.length
  };
}

function createObjectDetections(asset: GLTFAsset): readonly GLTFObjectDetectionEvidence[] {
  const bounds = globalBounds(asset.meshes);
  return asset.meshes
    .map((mesh, index): GLTFObjectDetectionEvidence => {
      const material = asset.materials[mesh.materialIndex ?? -1];
      const bbox = normalizedBoundsBox(mesh, bounds);
      const materialConfidence = material && !material.unlit ? 0.06 : 0;
      const geometryConfidence = Math.min(0.12, mesh.geometry.vertexCount / 50_000);
      return {
        label: mesh.name || material?.name || `mesh-${index}`,
        confidence: Number(Math.min(0.98, 0.74 + materialConfidence + geometryConfidence).toFixed(4)),
        bbox,
        classIndex: index + 1,
        meshName: mesh.name || `mesh-${index}`,
        materialName: material?.name ?? mesh.material
      };
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 24);
}

function createObjectTracks(detections: readonly GLTFObjectDetectionEvidence[]): readonly GLTFObjectTrackEvidence[] {
  return detections.map((detection, index) => {
    const velocityScale = (index + 1) * 0.001;
    return {
      id: index + 1,
      label: detection.label,
      bbox: detection.bbox,
      confidence: detection.confidence,
      age: 2,
      timeSinceUpdate: 0,
      velocity: [
        Number((velocityScale * 0.8).toFixed(4)),
        Number((velocityScale * -0.45).toFixed(4)),
        0,
        0
      ],
      historyLength: 2
    };
  });
}

function createPoseEvidence(asset: GLTFAsset, detections: readonly GLTFObjectDetectionEvidence[]): readonly GLTFPoseEvidence[] {
  if (asset.skins.length === 0) return [];
  const target = detections[0];
  const bbox = target?.bbox ?? [0.35, 0.18, 0.3, 0.64] as const;
  const [x, y, width, height] = bbox;
  const keypointNames = [
    "head",
    "neck",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "spine",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle"
  ];
  const offsets: readonly (readonly [number, number])[] = [
    [0.5, 0.08],
    [0.5, 0.2],
    [0.28, 0.25],
    [0.72, 0.25],
    [0.18, 0.43],
    [0.82, 0.43],
    [0.12, 0.62],
    [0.88, 0.62],
    [0.5, 0.46],
    [0.36, 0.62],
    [0.64, 0.62],
    [0.32, 0.78],
    [0.68, 0.78],
    [0.3, 0.96],
    [0.7, 0.96]
  ];
  const keypoints = keypointNames.map((name, index): GLTFPoseKeypointEvidence => ({
    name,
    x: Number((x + width * (offsets[index]?.[0] ?? 0.5)).toFixed(4)),
    y: Number((y + height * (offsets[index]?.[1] ?? 0.5)).toFixed(4)),
    confidence: Number((0.74 + Math.min(0.2, asset.skins.length * 0.04) - index * 0.003).toFixed(4))
  }));
  return [{
    label: asset.skins[0]?.name || "gltf-skeleton-pose",
    confidence: Number((keypoints.reduce((sum, keypoint) => sum + keypoint.confidence, 0) / keypoints.length).toFixed(4)),
    bbox,
    keypoints
  }];
}

function globalBounds(meshes: readonly GLTFMeshAsset[]): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? Infinity, mesh.geometry.bounds.min[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? -Infinity, mesh.geometry.bounds.max[axis] ?? 0);
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return { min: [-1, -1, -1], max: [1, 1, 1] };
  return { min, max };
}

function normalizedBoundsBox(mesh: GLTFMeshAsset, bounds: ReturnType<typeof globalBounds>): GLTFComputerVisionBoundingBox {
  const rangeX = Math.max(0.001, bounds.max[0] - bounds.min[0]);
  const rangeY = Math.max(0.001, bounds.max[1] - bounds.min[1]);
  const x = clamp01((mesh.geometry.bounds.min[0] - bounds.min[0]) / rangeX);
  const y = clamp01((bounds.max[1] - mesh.geometry.bounds.max[1]) / rangeY);
  const width = Math.max(0.02, clamp01((mesh.geometry.bounds.max[0] - mesh.geometry.bounds.min[0]) / rangeX));
  const height = Math.max(0.02, clamp01((mesh.geometry.bounds.max[1] - mesh.geometry.bounds.min[1]) / rangeY));
  return [
    Number(x.toFixed(4)),
    Number(y.toFixed(4)),
    Number(Math.min(1 - x, width).toFixed(4)),
    Number(Math.min(1 - y, height).toFixed(4))
  ];
}

function lodGeometryLabel(mesh: GLTFMeshAsset): string {
  const vertices = mesh.geometry.vertexCount;
  if (vertices >= 20_000) return "high-density-geometry";
  if (vertices >= 2_000) return "medium-density-geometry";
  return "low-density-geometry";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 8 || value > 256) throw new Error(`${name} must be an integer from 8 to 256.`);
  return value;
}

function normalizeAssetId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "gltf-scene";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
