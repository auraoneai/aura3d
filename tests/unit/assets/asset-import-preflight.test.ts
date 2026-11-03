import { describe, expect, it, vi } from "vitest";
import {
  createAssetImportPreflightReport,
  createDefaultFormatRegistry,
  createGLTFFormatAdapter,
  detectAssetImportFormat,
  Model3MFLoader,
  OBJLoader,
  PLYLoader,
  STLLoader
} from "../../../packages/assets/src";
import { VOXLoader } from "../../../packages/assets/src/importers";

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
      adapterRegistered: true,
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
      adapterRegistered: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "ASSET_IMPORT_OBJ_NATIVE_BOUNDED", severity: "info" }),
        expect.objectContaining({ code: "ASSET_IMPORT_ADAPTER_REGISTRATION_REQUIRED", severity: "warning" })
      ])
    });
    expect(report.stages).toEqual(["identify-format", "normalize-import-settings", "dependency-scan", "obj-geometry-parse", "obj-to-gltf-render-resource-path", "mesh-optimization", "render-resource-validation"]);
    expect(report.claimBoundary).toContain("native FBX/USD/USDZ/DAE import");
  });

  it("separates native parser availability from a renderer-capable registered adapter", () => {
    const registry = createDefaultFormatRegistry();
    const cases = [
      ["OBJ", "obj", () => registry.register(createGLTFFormatAdapter("obj", ["obj"], new OBJLoader()))],
      ["PLY", "ply", () => registry.register(createGLTFFormatAdapter("ply", ["ply"], new PLYLoader()))],
      ["STL", "stl", () => registry.register(createGLTFFormatAdapter("stl", ["stl"], new STLLoader()))],
      ["3MF", "3mf", () => registry.register(createGLTFFormatAdapter("model3mf", ["3mf"], new Model3MFLoader()))]
    ] as const;
    for (const [suffix, format, install] of cases) {
      const url = `asset.${suffix}?download=1#fragment`;
      expect(detectAssetImportFormat(url)).toBe(format);
      expect(createAssetImportPreflightReport(url, { formatRegistry: registry })).toMatchObject({
        format, status: "supported", supportedByCurrentLoader: true, adapterRegistered: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({ code: "ASSET_IMPORT_ADAPTER_REGISTRATION_REQUIRED" })])
      });
      install();
      const registered = createAssetImportPreflightReport(url, { formatRegistry: registry });
      expect(registered.adapterRegistered).toBe(true);
      expect(registered.diagnostics.map((item) => item.code)).not.toContain("ASSET_IMPORT_ADAPTER_REGISTRATION_REQUIRED");
      expect(registered.claimBoundary).toContain("does not inspect file bytes");
    }
  });

  it("does not report a parser-only adapter as renderer-capable", () => {
    const registry = createDefaultFormatRegistry();
    registry.register({ id: "ply", extensions: ["ply"], loader: new PLYLoader() });
    expect(createAssetImportPreflightReport("asset.ply", { formatRegistry: registry }).adapterRegistered).toBe(false);
  });

  it("recognizes VOX without reading bytes and distinguishes parser availability from adapter registration", () => {
    const url = "models/scene.VoX?download=.obj#fragment";
    const registry = createDefaultFormatRegistry();
    const loader = new VOXLoader();
    const parse = vi.spyOn(loader, "parse");
    const load = vi.spyOn(loader, "load");

    expect(detectAssetImportFormat(url)).toBe("vox");
    expect(detectAssetImportFormat("models/scene.vox.png")).toBe("unknown");
    for (const options of [{}, { formatRegistry: registry }]) {
      const report = createAssetImportPreflightReport(url, options);
      expect(report).toMatchObject({
        format: "vox", status: "supported", supportedByCurrentLoader: true, adapterRegistered: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "ASSET_IMPORT_NATIVE_PARSER_AVAILABLE", message: expect.stringContaining("has not inspected the file") }),
          expect.objectContaining({ code: "ASSET_IMPORT_ADAPTER_REGISTRATION_REQUIRED", severity: "warning" })
        ])
      });
      expect(report.stages).toEqual(["identify-format", "normalize-import-settings", "dependency-scan", "vox-bounded-parse", "vox-to-gltf-render-resource-path", "render-resource-validation"]);
      expect(report.claimBoundary).toContain("does not inspect file bytes");
      expect(report.claimBoundary).toContain("VOX have bounded native parsers requiring explicit adapter registration");
    }

    registry.register({ id: "vox", extensions: ["vox"], loader });
    expect(createAssetImportPreflightReport(url, { formatRegistry: registry }).adapterRegistered).toBe(false);
    registry.unregister("vox");
    registry.register(createGLTFFormatAdapter("vox", ["vox"], loader));
    const registered = createAssetImportPreflightReport(url, { formatRegistry: registry });
    expect(registered.adapterRegistered).toBe(true);
    expect(registered.diagnostics.map((item) => item.code)).not.toContain("ASSET_IMPORT_ADAPTER_REGISTRATION_REQUIRED");
    expect(registered.claimBoundary).toContain("does not inspect file bytes");
    expect(parse).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("does not report an adapter whose loader cannot accept the selected file", () => {
    const registry = createDefaultFormatRegistry();
    registry.register(createGLTFFormatAdapter("ply", ["ply"], new STLLoader()));
    expect(createAssetImportPreflightReport("asset.ply", { formatRegistry: registry }).adapterRegistered).toBe(false);
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
