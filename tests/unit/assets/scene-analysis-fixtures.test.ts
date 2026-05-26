import { describe, expect, it } from "vitest";
import { createGLTFSceneAnalysisEvidence, type GLTFAsset } from "../../../packages/assets/src";

describe("gltf scene analysis fixtures", () => {
  it("builds deterministic bounded scene-analysis telemetry from a glTF asset", () => {
    const asset = createTestAsset();
    const evidence = createGLTFSceneAnalysisEvidence({
      asset,
      url: "/fixtures/product-studio/products/speaker/speaker.gltf",
      maskWidth: 32,
      maskHeight: 16,
      minCoverage: 0.1,
      topCategories: 4
    });

    expect(evidence).toMatchObject({
      source: "origin-master-scene-analyzer-adapted",
      analyzer: "deterministic-gltf-scene-analysis",
      mask: {
        width: 32,
        height: 16
      },
      sceneComplexity: {
        meshCount: 2,
        materialCount: 2,
        textureCount: 2,
        vertexCount: 2520,
        indexCount: 4992,
        animationCount: 1,
        skinCount: 1,
        morphTargetCount: 1
      },
      productionReadiness: {
        semanticSegmentTelemetry: true,
        deterministicMaskSummary: true,
        complexityBudgetTelemetry: true,
        browserAssetViewerEvidence: true
      }
    });
    expect(evidence.segments.map((segment) => segment.label)).toEqual(expect.arrayContaining([
      "mesh-geometry",
      "medium-density-geometry",
      "pbr-material",
      "metallic-surface",
      "normal-mapped-surface",
      "animated-scene-region",
      "skeleton-rig-region",
      "morph-target-geometry"
    ]));
    expect(evidence.dominantCategories.length).toBeGreaterThan(0);
    expect(evidence.confidence).toBeGreaterThan(0.7);
    expect(evidence.objectDetections.length).toBe(2);
    expect(evidence.objectDetections[0]?.bbox.length).toBe(4);
    expect(evidence.objectDetections.every((detection) => detection.confidence > 0.7)).toBe(true);
    expect(evidence.objectTracks).toHaveLength(evidence.objectDetections.length);
    expect(evidence.objectTracks[0]).toMatchObject({
      id: 1,
      age: 2,
      timeSinceUpdate: 0,
      historyLength: 2
    });
    expect(evidence.poses).toHaveLength(1);
    expect(evidence.poses[0]?.keypoints.length).toBeGreaterThanOrEqual(15);
    expect(evidence.cvSystem).toMatchObject({
      source: "gltf-metadata-not-camera",
      detectionTelemetry: true,
      trackingTelemetry: true,
      poseTelemetry: true,
      inferenceRuntime: "not-used",
      modelLoading: "not-used"
    });
    expect(evidence.mask.classCount).toBeGreaterThan(1);
    expect(evidence.mask.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(evidence.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(evidence.blockedClaims).toEqual(expect.arrayContaining([
      "neural semantic segmentation parity",
      "pixel-accurate object detection parity",
      "Unity Sentis/Barracuda runtime parity",
      "Unreal ML Deformer or computer-vision plugin parity"
    ]));
    expect(evidence.claimBoundary).toContain("does not run neural segmentation");

    expect(createGLTFSceneAnalysisEvidence({
      asset,
      url: "/fixtures/product-studio/products/speaker/speaker.gltf",
      maskWidth: 32,
      maskHeight: 16,
      minCoverage: 0.1,
      topCategories: 4
    }).hash).toBe(evidence.hash);
  });

  it("rejects invalid mask dimensions instead of publishing malformed evidence", () => {
    expect(() => createGLTFSceneAnalysisEvidence({
      asset: createTestAsset(),
      maskWidth: 7
    })).toThrow(/maskWidth/);
    expect(() => createGLTFSceneAnalysisEvidence({
      asset: createTestAsset(),
      maskHeight: 257
    })).toThrow(/maskHeight/);
  });
});

function createTestAsset(): GLTFAsset {
  return {
    url: "/fixtures/product-studio/products/speaker/speaker.gltf",
    disposed: false,
    loaderDiagnostics: {
      schemaVersion: "gltf-loader-diagnostics",
      features: ["meshes", "materials", "animations", "skins", "morph-targets"],
      extensionsUsed: ["KHR_materials_clearcoat"],
      extensionsRequired: [],
      unsupportedExtensions: [],
      unsupportedFeatures: [],
      meshCount: 2,
      primitiveCount: 2,
      vertexCount: 2520,
      indexCount: 4992,
      materialCount: 2,
      textureCount: 2,
      imageCount: 2,
      animationCount: 1,
      skinCount: 1,
      morphTargetCount: 1,
      materialFeatures: ["metallic-roughness", "normal", "clearcoat"],
      textureSlots: ["baseColorTexture", "normalTexture"],
      compression: { draco: false, meshopt: false, ktx2Basis: false }
    },
    images: [{ name: "albedo" }, { name: "normal" }],
    textures: [{ name: "albedo", source: 0 }, { name: "normal", source: 1 }],
    materials: [
      {
        name: "painted-metal",
        unlit: false,
        baseColorFactor: [0.8, 0.1, 0.05, 1],
        baseColorTexture: { texture: 0, texCoord: 0 },
        metallicFactor: 0.7,
        roughnessFactor: 0.28,
        metallicRoughnessTexture: { texture: 0, texCoord: 0 },
        normalTexture: { texture: 1, texCoord: 0, scale: 1 },
        emissiveFactor: [0, 0, 0],
        emissiveStrength: 1,
        clearcoat: { factor: 0.65, roughnessFactor: 0.2 },
        alphaMode: "OPAQUE",
        alphaCutoff: 0.5,
        doubleSided: false
      },
      {
        name: "glass",
        unlit: false,
        baseColorFactor: [0.4, 0.7, 1, 0.35],
        metallicFactor: 0,
        roughnessFactor: 0.08,
        emissiveFactor: [0, 0, 0],
        emissiveStrength: 1,
        transmission: { factor: 0.75 },
        alphaMode: "BLEND",
        alphaCutoff: 0.5,
        doubleSided: true
      }
    ],
    materialVariants: [],
    scenes: [{ name: "main", nodeIndices: [0] }],
    defaultScene: 0,
    meshes: [
      {
        name: "body",
        geometry: {
          vertexCount: 2400,
          indexCount: 4800,
          bounds: { min: [-1, -1, -1], max: [1, 1, 1] }
        },
        positions: [],
        normals: [],
        tangents: [],
        texcoords: [],
        texcoords1: [],
        colors: [],
        joints: [],
        weights: [],
        morphTargets: [{ positions: [[0, 0, 0.1]], normals: [], tangents: [] }],
        morphWeights: [0.5],
        indices: [],
        material: "painted-metal",
        materialIndex: 0,
        materialVariants: [],
        skinIndex: 0
      },
      {
        name: "glass",
        geometry: {
          vertexCount: 120,
          indexCount: 192,
          bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
        },
        positions: [],
        normals: [],
        tangents: [],
        texcoords: [],
        texcoords1: [],
        colors: [],
        joints: [],
        weights: [],
        morphTargets: [],
        morphWeights: [],
        indices: [],
        material: "glass",
        materialIndex: 1,
        materialVariants: []
      }
    ],
    cameras: [],
    lights: [{ name: "key", type: "point", color: [1, 1, 1], intensity: 1 }],
    skins: [{ name: "rig", joints: [0], inverseBindMatrices: [] }],
    animations: [{ name: "turntable", duration: 1, tracks: [] }],
    createScene: () => {
      throw new Error("not needed for scene-analysis fixture tests");
    },
    toJSON: () => ({ url: "/fixtures/product-studio/products/speaker/speaker.gltf" })
  } as unknown as GLTFAsset;
}
