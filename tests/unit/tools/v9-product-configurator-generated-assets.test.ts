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
    readonly sourceAsset?: { readonly path: string; readonly byteSize?: number; readonly sha256?: string };
  };
  readonly outputs: Record<string, { readonly path: string; readonly byteSize?: number; readonly sha256?: string }>;
  readonly status: Record<string, boolean>;
  readonly counts: Record<string, number>;
  readonly sourceGlb?: GlbInspection;
  readonly exportedGlb?: GlbInspection;
  readonly supportTruth?: {
    readonly role: string;
    readonly cannotReplace: readonly string[];
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
  readonly materialNames?: readonly string[];
};

describe("v9 Product Configurator generated/support asset manifests", () => {
  it("keeps the generated studio GLB support-only with zero texture-backed hero evidence", () => {
    const manifest = readJson<GeneratedAssetManifest>("fixtures/v9/assets/product-configurator-studio-blender/manifest.json");
    const glb = manifest.outputs.glb;

    expect(manifest.id).toBe("product-configurator-studio-blender");
    expect(manifest.routeLinkage.routeId).toBe("product-configurator");
    expect(manifest.routeLinkage.runtimeRole).toContain("support");
    expect(manifest.source.sourceScript).toBe("tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py");
    expect(manifest.source.inputAssets).toEqual([]);
    expect(manifest.source.derivativeOfExternalAsset).toBe(false);

    expect(glb.path).toBe("fixtures/v9/assets/product-configurator-studio-blender/product-configurator-studio-blender.glb");
    expect(existsSync(resolve(glb.path))).toBe(true);
    expect(glb.byteSize).toBe(statSync(resolve(glb.path)).size);
    expect(glb.sha256).toBe(sha256(glb.path));

    const exported = inspectGlb(resolve(glb.path));
    expect(exported).toMatchObject({
      materialCount: 25,
      textureCount: 0,
      imageCount: 0,
      meshCount: 651,
      nodeCount: 655,
      textureBackedMaterialCount: 0
    });
    expect(exported.materialNames).toEqual(expect.arrayContaining([
      "cool gray porcelain floor panels",
      "transparent configurator ui glass",
      "satin stone hero plinth",
      "warm dim studio diffuser"
    ]));

    expect(manifest.status).toMatchObject({
      generated: true,
      derivative: false,
      textureBacked: false,
      generatedNoTexture: true,
      supportOnly: true,
      acceptableAsFocalHero: false,
      acceptedAsPremiumTextureBackedHero: false,
      visualReviewAccepted: false
    });
    expect(manifest.counts.exportedMaterials).toBe(exported.materialCount);
    expect(manifest.counts.exportedTextures).toBe(exported.textureCount);
    expect(manifest.counts.exportedImages).toBe(exported.imageCount);
    expect(manifest.counts.exportedMeshes).toBe(exported.meshCount);
    expect(manifest.counts.exportedNodes).toBe(exported.nodeCount);
    expect(manifest.counts.exportedTextureBackedMaterials).toBe(exported.textureBackedMaterialCount);
    expect(manifest.exportedGlb).toEqual(withoutMaterialNames(exported));
    expect(manifest.supportTruth?.role).toBe("support-only");
    expect(manifest.supportTruth?.cannotReplace).toContain("fixtures/v8/assets/vehicles/car-concept.glb");
    expect(manifest.acceptanceBoundary).toContain("must not replace the original texture-backed Product hero assets");
    expect(manifest.limitations.join("\n")).toContain("Zero texture-backed material evidence");
  });

  it("keeps the batched car GLB a derivative that cannot replace the original Product hero", () => {
    const manifest = readJson<GeneratedAssetManifest>("fixtures/v9/assets/product-configurator-car-batched/manifest.json");
    const glb = manifest.outputs.glb;
    const sourceAsset = manifest.source.sourceAsset;

    expect(manifest.id).toBe("product-configurator-car-batched");
    expect(manifest.routeLinkage.routeId).toBe("product-configurator");
    expect(manifest.routeLinkage.runtimeRole).toContain("not current source-of-truth hero");
    expect(manifest.source.sourceScript).toBe("tools/v9-advanced-gallery-assets/optimize-product-car-blender.py");
    expect(manifest.source.inputAssets).toEqual(["fixtures/v8/assets/vehicles/car-concept.glb"]);
    expect(manifest.source.derivativeOfExternalAsset).toBe(true);
    if (!sourceAsset) throw new Error("expected batched Product manifest sourceAsset");
    expect(sourceAsset.path).toBe("fixtures/v8/assets/vehicles/car-concept.glb");
    expect(sourceAsset.byteSize).toBe(statSync(resolve(sourceAsset.path)).size);
    expect(sourceAsset.sha256).toBe(sha256(sourceAsset.path));

    expect(glb.path).toBe("fixtures/v9/assets/product-configurator-car-batched/car-concept-batched.glb");
    expect(existsSync(resolve(glb.path))).toBe(true);
    expect(glb.byteSize).toBe(statSync(resolve(glb.path)).size);
    expect(glb.sha256).toBe(sha256(glb.path));

    const source = inspectGlb(resolve(sourceAsset.path));
    const exported = inspectGlb(resolve(glb.path));
    expect(source).toMatchObject({
      materialCount: 29,
      textureCount: 15,
      imageCount: 14,
      meshCount: 97,
      nodeCount: 101,
      textureBackedMaterialCount: 25
    });
    expect(exported).toMatchObject({
      materialCount: 29,
      textureCount: 50,
      imageCount: 13,
      meshCount: 94,
      nodeCount: 98,
      textureBackedMaterialCount: 25
    });

    expect(manifest.status).toMatchObject({
      generated: true,
      derivative: true,
      textureBacked: true,
      generatedNoTexture: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      acceptedAsOriginalHeroReplacement: false,
      visualReviewAccepted: false
    });
    expect(manifest.sourceGlb).toEqual(withoutMaterialNames(source));
    expect(manifest.exportedGlb).toEqual(withoutMaterialNames(exported));
    expect(manifest.counts.sourceMeshes).toBe(source.meshCount);
    expect(manifest.counts.exportedMeshes).toBe(exported.meshCount);
    expect(manifest.supportTruth?.role).toBe("support-only derivative");
    expect(manifest.supportTruth?.cannotReplace).toContain("fixtures/v8/assets/vehicles/car-concept.glb");
    expect(manifest.acceptanceBoundary).toContain("cannot replace fixtures/v8/assets/vehicles/car-concept.glb");
    expect(manifest.limitations.join("\n")).toContain("Mesh and node topology differ");
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
  };
}

function withoutMaterialNames(inspection: GlbInspection): Omit<GlbInspection, "materialNames"> {
  return {
    materialCount: inspection.materialCount,
    textureCount: inspection.textureCount,
    imageCount: inspection.imageCount,
    meshCount: inspection.meshCount,
    nodeCount: inspection.nodeCount,
    textureBackedMaterialCount: inspection.textureBackedMaterialCount
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

function hasTextureInfo(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasTextureInfo);
  const record = value as Record<string, unknown>;
  if (typeof record.index === "number") return true;
  return Object.entries(record).some(([key, child]) => /texture$/iu.test(key) ? hasTextureInfo(child) : hasTextureInfo(child));
}
