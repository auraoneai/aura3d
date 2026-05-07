import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectPublicPackageApis, renderApiDocs, validateApiDocs } from "../../../tools/api-docs/index.js";

describe("public API docs", () => {
  it("are generated from every non-private package entrypoint", () => {
    const packages = collectPublicPackageApis(process.cwd());
    const packageNames = packages.map((pkg) => pkg.packageName);

    expect(packageNames).toEqual([
      "@galileo3d/animation",
      "@galileo3d/assets",
      "@galileo3d/audio",
      "@galileo3d/core",
      "@galileo3d/debug",
      "@galileo3d/ecs",
      "@galileo3d/editor",
      "@galileo3d/editor-runtime",
      "@galileo3d/input",
      "@galileo3d/math",
      "@galileo3d/physics",
      "@galileo3d/rendering",
      "@galileo3d/scene",
      "@galileo3d/scripting"
    ]);
    expect(packageNames).not.toContain("@galileo3d/test-utils");
    expect(packages.every((pkg) => pkg.exportStatements.length > 0)).toBe(true);
  });

  it("matches the generated docs file exactly", () => {
    const report = validateApiDocs(process.cwd());

    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(readFileSync(report.outputPath, "utf8")).toBe(renderApiDocs(report.packages));
  });

  it("documents representative public exports from rendering, assets, editor, and runtime packages", () => {
    const docs = readFileSync("docs/api/public-api.md", "utf8");

    expect(docs).toContain("## @galileo3d/rendering");
    expect(docs).toContain("export { Renderer } from \"./Renderer\";");
    expect(docs).toContain("export { WebGPUDevice } from \"./WebGPUDevice\";");
    expect(docs).toContain("## @galileo3d/assets");
    expect(docs).toContain("export { GLTFLoader } from \"./GLTFLoader\";");
    expect(docs).toContain("export { createGLTFRenderResources } from \"./GLTFRenderResources\";");
    expect(docs).toContain("## @galileo3d/editor-runtime");
    expect(docs).toContain("export { EditorRuntime } from \"./EditorRuntime\";");
    expect(docs).toContain("## @galileo3d/core");
    expect(docs).toContain("export * from \"./Engine.js\";");
  });
});
