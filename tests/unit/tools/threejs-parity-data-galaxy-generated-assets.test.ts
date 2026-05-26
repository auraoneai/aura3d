import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

type GeneratedAssetManifest = {
  readonly id: string;
  readonly routeLinkage: {
    readonly routeId: string;
    readonly runtimeRole: string;
  };
  readonly source: {
    readonly sourceScript: string;
    readonly inputAssets: readonly string[];
    readonly derivativeOfExternalAsset: boolean;
  };
  readonly outputs: Record<string, { readonly path: string; readonly byteSize?: number; readonly sha256?: string }>;
  readonly status: Record<string, boolean>;
  readonly counts: Record<string, number>;
  readonly exportedGlb?: {
    readonly materialCount: number;
    readonly textureCount: number;
    readonly imageCount: number;
    readonly meshCount: number;
    readonly nodeCount: number;
    readonly textureBackedMaterialCount: number;
    readonly semanticRoleCounts?: Record<string, number>;
    readonly scaffoldRoleNodeCount?: number;
  };
  readonly semanticRoles?: {
    readonly description: string;
    readonly roleCounts: Record<string, number>;
    readonly exportedRoleCounts: Record<string, number>;
    readonly focalRoles: readonly string[];
    readonly supportScaffoldRoles: readonly string[];
    readonly defaultExcludedRoles: readonly string[];
    readonly focalDrawItems: number;
    readonly supportScaffoldDrawItems: number;
    readonly defaultExcludedDrawItems: number;
    readonly textureBackedFocalMaterials: readonly string[];
    readonly textureBackedSupportMaterials: readonly string[];
  };
  readonly materials?: Record<string, number | readonly string[]>;
  readonly batching?: Record<string, string | boolean>;
  readonly supportTruth?: {
    readonly role: string;
    readonly cannotReplace: readonly string[];
    readonly routeExclusionsMayApply?: readonly string[];
  };
  readonly acceptanceBoundary: string;
  readonly limitations: readonly string[];
};

type GlbInspection = {
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly meshCount: number;
  readonly nodeCount: number;
  readonly textureBackedMaterialCount: number;
  readonly materialNames: readonly string[];
  readonly semanticRoleCounts: Record<string, number>;
  readonly scaffoldRoleNodeCount: number;
};

describe("threejsParity Data Galaxy generated asset manifests", () => {
  it("keeps the Blender data core manifest support-only with generated texture-backed provenance and no hero claim", () => {
    const manifest = readJson<GeneratedAssetManifest>("fixtures/advanced-gallery/assets/data-galaxy-core-blender/manifest.json");
    const glb = manifest.outputs.glb;
    const blend = manifest.outputs.blend;

    expect(manifest.id).toBe("data-galaxy-core-blender");
    expect(manifest.routeLinkage.routeId).toBe("data-galaxy");
    expect(manifest.routeLinkage.runtimeRole).toContain("support");
    expect(manifest.source.sourceScript).toBe("tools/advanced-gallery-assets/generate-data-galaxy-core-blender.py");
    expect(manifest.source.inputAssets).toEqual([]);
    expect(manifest.source.derivativeOfExternalAsset).toBe(false);

    expect(glb.path).toBe("fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb");
    expect(existsSync(resolve(glb.path))).toBe(true);
    expect(glb.byteSize).toBe(statSync(resolve(glb.path)).size);
    expect(glb.sha256).toBe(sha256(glb.path));
    expect(blend.path).toBe("fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.blend");
    expect(blend.byteSize).toBe(statSync(resolve(blend.path)).size);
    expect(blend.sha256).toBe(sha256(blend.path));

    expect(manifest.status).toMatchObject({
      generated: true,
      stub: false,
      derivative: false,
      textureBacked: true,
      generatedNoTexture: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      acceptedAsPremiumTextureBackedHero: false,
      visualReviewAccepted: false
    });
    expect(manifest.counts.materials).toBeGreaterThan(0);
    expect(manifest.counts.textureImages).toBe(3);
    expect(manifest.counts.textureBackedMaterials).toBe(3);
    expect(manifest.materials?.textureCount).toBe(3);
    expect(manifest.materials?.textureBackedMaterialCount).toBe(3);
    expect(manifest.supportTruth?.role).toBe("support-only");
    expect(manifest.supportTruth?.cannotReplace).toContain("accepted current-route visual-review screenshots");
    expect(manifest.acceptanceBoundary).toContain("must not be used as premium focal hero proof");
    expect(manifest.limitations.join("\n")).toContain("embedded procedural data-glyph textures");
    expect(manifest.limitations.join("\n")).toContain("No native GPU-compute particle path");
  });

  it("keeps Data Galaxy generated GLB exported counts separate from Blender-scene manifest counts", () => {
    const manifest = readJson<GeneratedAssetManifest>("fixtures/advanced-gallery/assets/data-galaxy-core-blender/manifest.json");
    const exported = inspectGlb(resolve(manifest.outputs.glb.path));

    expect(exported).toMatchObject({
      materialCount: 9,
      textureCount: 3,
      imageCount: 3,
      meshCount: 20,
      nodeCount: 25,
      textureBackedMaterialCount: 3
    });
    expect(exported.materialNames).toEqual(expect.arrayContaining([
      "cyan neural emission",
      "translucent cyan vector glass",
      "deep blue inference emission"
    ]));
    expect(manifest.counts.textureImages).toBe(exported.imageCount);
    expect(manifest.counts.textureBackedMaterials).toBe(exported.textureBackedMaterialCount);
    expect(manifest.counts.exportedMaterials).toBe(exported.materialCount);
    expect(manifest.counts.exportedTextures).toBe(exported.textureCount);
    expect(manifest.counts.exportedImages).toBe(exported.imageCount);
    expect(manifest.counts.exportedMeshes).toBe(exported.meshCount);
    expect(manifest.counts.exportedNodes).toBe(exported.nodeCount);
    expect(manifest.counts.exportedTextureBackedMaterials).toBe(exported.textureBackedMaterialCount);
    expect(manifest.exportedGlb).toEqual({
      materialCount: exported.materialCount,
      textureCount: exported.textureCount,
      imageCount: exported.imageCount,
      meshCount: exported.meshCount,
      nodeCount: exported.nodeCount,
      textureBackedMaterialCount: exported.textureBackedMaterialCount,
      semanticRoleCounts: exported.semanticRoleCounts,
      scaffoldRoleNodeCount: exported.scaffoldRoleNodeCount
    });
    expect(manifest.materials?.textureCount).toBe(exported.textureCount);
    expect(manifest.materials?.textureBackedMaterialCount).toBe(exported.textureBackedMaterialCount);
    expect(manifest.counts.materials).toBeGreaterThan(exported.materialCount);
    expect(manifest.semanticRoles?.description).toContain("opaque batching preserves role boundaries");
    expect(manifest.semanticRoles?.focalRoles).toEqual(["focal-core", "semantic-cluster"]);
    expect(manifest.semanticRoles?.supportScaffoldRoles).toEqual([]);
    expect(manifest.semanticRoles?.defaultExcludedRoles).toEqual([]);
    expect(manifest.semanticRoles?.exportedRoleCounts).toEqual(exported.semanticRoleCounts);
    expect(manifest.semanticRoles?.roleCounts["focal-core"]).toBeGreaterThan(0);
    expect(manifest.semanticRoles?.roleCounts["semantic-cluster"]).toBeGreaterThan(0);
    expect(manifest.semanticRoles?.roleCounts["signal-bead"]).toBeGreaterThan(0);
    expect(manifest.semanticRoles?.roleCounts["semantic-cluster"]).toBeLessThanOrEqual(12);
    expect(manifest.exportedGlb?.scaffoldRoleNodeCount).toBe(0);
    expect(manifest.semanticRoles?.focalDrawItems).toBe(6);
    expect(manifest.semanticRoles?.supportScaffoldDrawItems).toBe(0);
    expect(manifest.semanticRoles?.defaultExcludedDrawItems).toBe(0);
    expect(manifest.semanticRoles?.textureBackedFocalMaterials).toEqual([
      "cyan neural emission",
      "violet model-state emission",
      "amber anomaly emission"
    ]);
    expect(manifest.semanticRoles?.textureBackedSupportMaterials).toEqual([]);
    expect(manifest.batching?.semanticRolePreservation).toContain("a3d_semantic_role");
    expect(manifest.supportTruth?.routeExclusionsMayApply?.join("\n")).toContain("source-pruned before GLB export");
  });

  it("keeps the deep-space HDR manifest scoped to background evidence only", () => {
    const manifest = readJson<GeneratedAssetManifest>("fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.manifest.json");
    const hdr = manifest.outputs.hdr;

    expect(manifest.id).toBe("data-galaxy-deep-space-hdr");
    expect(manifest.routeLinkage.routeId).toBe("data-galaxy");
    expect(manifest.routeLinkage.runtimeRole).toBe("deep-space background only");
    expect(manifest.source.sourceScript).toBe("tools/advanced-gallery-assets/generate-data-galaxy-deep-space-hdr.mjs");
    expect(manifest.source.inputAssets).toEqual([]);
    expect(manifest.source.derivativeOfExternalAsset).toBe(false);

    expect(hdr.path).toBe("fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr");
    expect(existsSync(resolve(hdr.path))).toBe(true);
    expect(hdr.byteSize).toBe(statSync(resolve(hdr.path)).size);
    expect(hdr.sha256).toBe(sha256(hdr.path));

    expect(manifest.status).toMatchObject({
      generated: true,
      stub: false,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      acceptedAsPhysicalSkyProof: false,
      acceptedAsVolumetricEnvironmentProof: false,
      acceptedAsExrPipelineProof: false,
      acceptedAsPmremParityProof: false
    });
    expect(manifest.counts).toMatchObject({
      materialCount: 0,
      textureCount: 0,
      meshCount: 0,
      drawCount: 0
    });
    expect(manifest.acceptanceBoundary).toContain("Background evidence only");
    expect(manifest.acceptanceBoundary).toContain("does not prove physical sky");
    expect(manifest.acceptanceBoundary).toContain("Data Galaxy focal acceptance");
    expect(manifest.limitations.join("\n")).toContain("Not dynamic cube-camera or PMREM parity proof");
  });
});

function inspectGlb(path: string): GlbInspection {
  const bytes = readFileSync(path);
  expect(bytes.toString("utf8", 0, 4)).toBe("glTF");
  let offset = 12;
  let json: Record<string, unknown> | undefined;
  while (offset < bytes.byteLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(chunk.toString("utf8").replace(/\0+$/u, "")) as Record<string, unknown>;
    }
  }
  expect(json).toBeDefined();
  const materials = arrayOfRecords(json?.materials);
  const textures = arrayOfRecords(json?.textures);
  const images = arrayOfRecords(json?.images);
  const meshes = arrayOfRecords(json?.meshes);
  const nodes = arrayOfRecords(json?.nodes);
  const textureBackedMaterialCount = materials.filter((material) => materialReferencesTexture(material)).length;
  const semanticRoleCounts: Record<string, number> = {};
  for (const node of nodes) {
    const role = recordOfUnknown(node.extras)?.a3d_semantic_role;
    if (typeof role !== "string") continue;
    semanticRoleCounts[role] = (semanticRoleCounts[role] ?? 0) + 1;
  }
  const scaffoldRoleNodeCount = ["support-platform", "floor-trace", "debug-axis", "decorative-pylon", "support-scaffold"]
    .reduce((total, role) => total + (semanticRoleCounts[role] ?? 0), 0);
  return {
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
    meshCount: meshes.length,
    nodeCount: nodes.length,
    textureBackedMaterialCount,
    materialNames: materials
      .map((material) => typeof material.name === "string" ? material.name : "")
      .filter((name) => name.length > 0)
    ,
    semanticRoleCounts,
    scaffoldRoleNodeCount
  };
}

function arrayOfRecords(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function materialReferencesTexture(material: Record<string, unknown>): boolean {
  return hasTextureInfo(material.pbrMetallicRoughness)
    || hasTextureInfo(material.normalTexture)
    || hasTextureInfo(material.occlusionTexture)
    || hasTextureInfo(material.emissiveTexture)
    || hasTextureInfo(material.extensions);
}

function recordOfUnknown(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasTextureInfo(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasTextureInfo);
  const record = value as Record<string, unknown>;
  if (typeof record.index === "number") return true;
  return Object.entries(record).some(([key, child]) => /texture$/iu.test(key) ? hasTextureInfo(child) : hasTextureInfo(child));
}
