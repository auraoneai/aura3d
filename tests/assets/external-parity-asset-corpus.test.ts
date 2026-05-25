import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext } from "../../packages/assets/src";

const fixtureRoot = resolve("fixtures/assets/v4");
const reportPath = resolve("tests/reports/external-parity-asset-corpus.json");
const expectedCategories = ["product", "architecture", "environment", "character", "materials", "morph", "animation"];

describe("v4 local asset corpus", () => {
  it("contains a generated V4 corpus manifest with required local asset categories and metadata", () => {
    const manifestPath = resolve(fixtureRoot, "manifest.json");
    expect(existsSync(manifestPath), `${manifestPath} missing`).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as V4Manifest;

    expect(manifest.schemaVersion).toBe("g3d-v4-asset-corpus-v1");
    expect(manifest.assetCount).toBeGreaterThanOrEqual(expectedCategories.length);
    expect(manifest.categories).toEqual([...expectedCategories].sort());
    for (const category of expectedCategories) {
      expect(manifest.assets.some((asset) => asset.category === category), `${category} missing`).toBe(true);
    }

    for (const asset of manifest.assets) {
      expect(asset.id).toMatch(/^v4-[a-z0-9-]+$/);
      expect(asset.license).toBe("CC0-1.0");
      expect(asset.features.length).toBeGreaterThan(0);
      expect(existsSync(resolve(asset.localPath))).toBe(true);
      expect(existsSync(resolve(asset.expectedScreenshot))).toBe(true);
      expect(existsSync(resolve(asset.loaderDiagnostics))).toBe(true);
      expect(asset.textureCount).toBeGreaterThanOrEqual(0);
      expect(asset.animations).toBeGreaterThanOrEqual(0);
      expect(asset.skins).toBeGreaterThanOrEqual(0);
      expect(asset.morphTargets).toBeGreaterThanOrEqual(0);
    }
  });

  it("stores per-asset fixture directories with manifests, screenshots, and loader diagnostic baselines", () => {
    for (const category of expectedCategories) {
      const categoryPath = resolve(fixtureRoot, category);
      expect(existsSync(categoryPath), `${categoryPath} missing`).toBe(true);
      const entries = readdirSync(categoryPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      expect(entries.length, `${category} should contain at least one fixture`).toBeGreaterThanOrEqual(1);
      for (const entry of entries) {
        const directory = resolve(categoryPath, entry.name);
        const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")) as V4AssetManifest;
        expect(manifest.schemaVersion).toBe("g3d-v4-local-asset-v1");
        expect(manifest.category).toBe(category);
        expect(manifest.features.length).toBeGreaterThan(0);
        expect(existsSync(resolve(directory, manifest.localFile))).toBe(true);
        expect(existsSync(resolve(manifest.expectedScreenshot))).toBe(true);
        expect(existsSync(resolve(manifest.loaderDiagnostics))).toBe(true);
      }
    }
  });

  it("emits a passing V4 asset corpus report with loader/render diagnostics for every asset", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as V4Report;

    expect(report.schemaVersion).toBe("g3d-v4-asset-corpus-report-v1");
    expect(report.ok).toBe(true);
    expect(report.assetCount).toBe(8);
    expect(report.summary).toMatchObject({
      renderResourcesCreated: 8,
      error: 0,
      textureAssets: 2,
      animatedAssets: 3,
      skinnedAssets: 1,
      morphAssets: 1
    });

    for (const asset of report.assets) {
      expect(asset.renderStatus).toBe("render-resources-created");
      expect(asset.loaderDiagnostics.schemaVersion).toBe("gltf-loader-diagnostics-v1");
      expect(asset.loaderDiagnostics.features).toContain("gltf");
      expect(asset.loaderDiagnostics.meshCount).toBeGreaterThan(0);
      expect(asset.loaderDiagnostics.vertexCount).toBeGreaterThan(0);
      expect(asset.inspection.meshes).toBeGreaterThan(0);
      expect(asset.timings.loadMs).toBeGreaterThanOrEqual(0);
      expect(asset.timings.renderResourceMs).toBeGreaterThanOrEqual(0);
      expect(asset.timings.totalMs).toBeGreaterThanOrEqual(asset.timings.loadMs);
      expect(existsSync(resolve(asset.screenshotPath))).toBe(true);
      expect(existsSync(resolve(asset.diagnosticsPath))).toBe(true);
    }

    expect(report.assets.find((asset) => asset.id === "v4-material-fidelity-card")?.loaderDiagnostics.textureSlots).toEqual(expect.arrayContaining([
      "base-color",
      "metallic-roughness",
      "normal",
      "occlusion",
      "emissive"
    ]));
    expect(report.assets.find((asset) => asset.id === "v4-material-fidelity-card")?.loaderDiagnostics.extensionsUsed).toContain("EXT_texture_avif");
    expect(report.assets.find((asset) => asset.id === "v4-material-fidelity-card")?.loaderDiagnostics.extensionsUsed).toContain("EXT_texture_webp");
    expect(report.assets.find((asset) => asset.id === "v4-skinned-hero")?.loaderDiagnostics.features).toEqual(expect.arrayContaining(["animations", "skins", "skinning"]));
    expect(report.assets.find((asset) => asset.id === "v4-morph-expression")?.loaderDiagnostics.features).toContain("morph-targets");
    expect(report.assets.find((asset) => asset.id === "v4-game-outpost")?.loaderDiagnostics.extensionsUsed).toContain("EXT_mesh_gpu_instancing");
    expect(report.assets.find((asset) => asset.id === "v4-root-motion-clip")?.loaderDiagnostics.extensionsUsed).toContain("KHR_mesh_quantization");
  });

  it("exposes GLTFLoader diagnostics on loaded assets and serialized assets", async () => {
    const fixture = JSON.parse(readFileSync(resolve(fixtureRoot, "materials", "v4-material-fidelity-card", "v4-material-fidelity-card.gltf"), "utf8")) as Record<string, unknown>;
    const asset = await new GLTFLoader().load({ url: dataGLTF(fixture), type: "gltf" }, new LoadContext());

    expect(asset.loaderDiagnostics.features).toEqual(expect.arrayContaining([
      "textures",
      "texture-slot:base-color",
      "texture-slot:normal",
      "material:alpha-blend",
      "material:double-sided"
    ]));
    expect(asset.loaderDiagnostics.textureCount).toBe(4);
    expect(asset.loaderDiagnostics.materialFeatures).toEqual(expect.arrayContaining(["normal-texture", "occlusion-texture", "emissive"]));
    expect(asset.toJSON().loaderDiagnostics).toEqual(asset.loaderDiagnostics);
  });
});

interface V4Manifest {
  readonly schemaVersion: string;
  readonly assetCount: number;
  readonly categories: readonly string[];
  readonly assets: readonly V4AssetManifest[];
}

interface V4AssetManifest {
  readonly schemaVersion?: string;
  readonly id: string;
  readonly category: string;
  readonly localFile: string;
  readonly localPath: string;
  readonly license: string;
  readonly features: readonly string[];
  readonly textureCount: number;
  readonly animations: number;
  readonly skins: number;
  readonly morphTargets: number;
  readonly expectedScreenshot: string;
  readonly loaderDiagnostics: string;
}

interface V4Report {
  readonly schemaVersion: string;
  readonly ok: boolean;
  readonly assetCount: number;
  readonly summary: {
    readonly renderResourcesCreated: number;
    readonly error: number;
    readonly textureAssets: number;
    readonly animatedAssets: number;
    readonly skinnedAssets: number;
    readonly morphAssets: number;
  };
  readonly assets: readonly {
    readonly id: string;
    readonly renderStatus: string;
    readonly screenshotPath: string;
    readonly diagnosticsPath: string;
    readonly loaderDiagnostics: {
      readonly schemaVersion: string;
      readonly features: readonly string[];
      readonly meshCount: number;
      readonly vertexCount: number;
      readonly textureSlots: readonly string[];
      readonly extensionsUsed: readonly string[];
    };
    readonly inspection: {
      readonly meshes: number;
    };
    readonly timings: {
      readonly loadMs: number;
      readonly renderResourceMs: number;
      readonly totalMs: number;
    };
  }[];
}

function dataGLTF(gltf: Record<string, unknown>): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}
