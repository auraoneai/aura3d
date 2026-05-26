import { describe, expect, it } from "vitest";
import {
  createAssetImportPreflightReport,
  detectAssetImportFormat
} from "../../../packages/assets/src";

describe("asset import preflight", () => {
  it("detects supported glTF and publishes old-import-profile settings", () => {
    const report = createAssetImportPreflightReport("fixtures/asset-corpus/damaged-helmet.glb?cache=1", {
      profile: "web",
      fileBytes: 12345.4
    });

    expect(report).toMatchObject({
      source: "origin-master-asset-importer-adapted",
      format: "glb",
      profile: "web",
      status: "supported",
      supportedByCurrentLoader: true,
      fileBytes: 12345,
      settings: {
        texture: { maxSize: 2048, compression: "basis", generateMipmaps: true, colorSpace: "srgb" },
        mesh: { optimize: true, generateNormals: true, generateTangents: true, weldVertices: true, targetTriangleCount: 60000 }
      },
      diagnostics: [expect.objectContaining({ code: "ASSET_IMPORT_GLTF_SUPPORTED", severity: "info" })]
    });
    expect(report.stages).toEqual(["identify-format", "normalize-import-settings", "dependency-scan", "gltf-load", "texture-decode", "mesh-optimization", "render-resource-validation"]);
    expect(report.claimBoundary).toContain("OBJ has a bounded native geometry-only loader");
  });

  it("recognizes OBJ as bounded native geometry import", () => {
    const report = createAssetImportPreflightReport("mesh.obj", { profile: "web" });
    expect(report).toMatchObject({
      format: "obj",
      status: "supported",
      supportedByCurrentLoader: true,
      diagnostics: [expect.objectContaining({ code: "ASSET_IMPORT_OBJ_NATIVE_BOUNDED", severity: "info" })]
    });
    expect(report.stages).toEqual(["identify-format", "normalize-import-settings", "dependency-scan", "obj-geometry-parse", "obj-to-gltf-render-resource-path", "mesh-optimization", "render-resource-validation"]);
    expect(report.claimBoundary).toContain("native FBX/USD/USDZ/DAE import");
  });

  it("recognizes non-OBJ DCC formats as conversion-required instead of claiming native support", () => {
    for (const [url, format] of [
      ["old-scene.FBX", "fbx"],
      ["stage.usda", "usd"],
      ["package.usdz", "usdz"],
      ["scene.dae", "dae"]
    ] as const) {
      const report = createAssetImportPreflightReport(url, { profile: "mobile" });
      expect(report.format).toBe(format);
      expect(report.status).toBe("convert-required");
      expect(report.supportedByCurrentLoader).toBe(false);
      expect(report.stages).toContain(`${format}-external-conversion-required`);
      expect(report.diagnostics[0]).toMatchObject({
        code: "ASSET_IMPORT_EXTERNAL_CONVERSION_REQUIRED",
        severity: "warning"
      });
      expect(report.settings.texture).toMatchObject({ maxSize: 1024, compression: "etc2" });
    }
  });

  it("blocks unknown inputs and rejects invalid preflight data", () => {
    expect(detectAssetImportFormat("asset.bin")).toBe("unknown");
    const unknown = createAssetImportPreflightReport("asset.bin");
    expect(unknown).toMatchObject({
      format: "unknown",
      status: "blocked",
      supportedByCurrentLoader: false,
      diagnostics: [expect.objectContaining({ code: "ASSET_IMPORT_FORMAT_BLOCKED", severity: "error" })]
    });
    expect(() => createAssetImportPreflightReport(" ")).toThrow(/URL/);
    expect(() => createAssetImportPreflightReport("model.glb", { fileBytes: -1 })).toThrow(/fileBytes/);
  });
});
