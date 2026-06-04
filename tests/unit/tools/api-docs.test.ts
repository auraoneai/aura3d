import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectPublicPackageApis, renderApiDocs, validateApiDocs } from "../../../tools/api-docs/index.js";

describe("public API docs", () => {
  it("are generated from every non-private package entrypoint", () => {
    const packages = collectPublicPackageApis(process.cwd());
    const packageNames = packages.map((pkg) => pkg.packageName);

    expect(packageNames).toEqual([
      "@aura3d/animation",
      "@aura3d/apps",
      "@aura3d/assets",
      "@aura3d/audio",
      "@aura3d/cli",
      "@aura3d/controls",
      "@aura3d/core",
      "create-aura3d",
      "@aura3d/debug",
      "@aura3d/ecs",
      "@aura3d/editor",
      "@aura3d/editor-runtime",
      "@aura3d/engine",
      "@aura3d/environments",
      "@aura3d/input",
      "@aura3d/materials",
      "@aura3d/math",
      "@aura3d/physics",
      "@aura3d/product-studio",
      "@aura3d/react",
      "@aura3d/rendering",
      "@aura3d/scene",
      "@aura3d/scripting",
      "@aura3d/three-compat",
      "@aura3d/workflows"
    ]);
    expect(packageNames).not.toContain("@aura3d/test-utils");
    expect(packages.every((pkg) => pkg.exportStatements.length > 0)).toBe(true);
  });

  it("matches the generated docs file exactly", () => {
    const report = validateApiDocs(process.cwd());

    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(readFileSync(report.outputPath, "utf8")).toBe(renderApiDocs(report.packages));
  });

  it("documents representative public exports from rendering, assets, editor, and engine packages", () => {
    const docs = readFileSync("docs/api/public-api.md", "utf8");

    expect(docs).toContain("## @aura3d/rendering");
    expect(docs).toContain("export { DEFAULT_RENDERER_AUTO_FRAME_OPTIONS, DEFAULT_RENDERER_DIRECT_LIGHTING, DEFAULT_RENDERER_ENVIRONMENT_LIGHTING, Renderer } from \"./Renderer\";");
    expect(docs).toContain("export { WebGPUDevice } from \"./WebGPUDevice\";");
    expect(docs).toContain("## @aura3d/assets");
    expect(docs).toContain("export { GLTFLoader } from \"./GLTFLoader\";");
    expect(docs).toContain("createGLTFRenderResources");
    expect(docs).toContain("from \"./GLTFRenderResources\";");
    expect(docs).toContain("## @aura3d/editor-runtime");
    expect(docs).toContain("export { EditorRuntime } from \"./EditorRuntime\";");
    expect(docs).toContain("## @aura3d/core");
    expect(docs).toContain("export * from \"./Engine.js\";");
    expect(docs).toContain("## @aura3d/product-studio");
    expect(docs).toContain("export { createProductStudio } from \"./ProductStudio\";");
    expect(docs).toContain("## @aura3d/engine");
    expect(docs).not.toContain("## @aura3d/engine-runtime");
    expect(docs).toContain("## @aura3d/workflows");
    expect(docs).toContain("export { createAssetViewerWorkflow } from \"./AssetViewerWorkflow\";");
  });
});
