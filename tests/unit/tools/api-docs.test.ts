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
      "@aura3d/asset-index",
      "@aura3d/assets",
      "@aura3d/assets/gltf-runtime",
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
      "@aura3d/environments/node",
      "@aura3d/input",
      "@aura3d/lean",
      "@aura3d/lean/game",
      "@aura3d/lean/product",
      "@aura3d/materials",
      "@aura3d/materials/node",
      "@aura3d/math",
      "@aura3d/navigation-recast",
      "@aura3d/physics",
      "@aura3d/physics-rapier",
      /*
       * WS-2.2 subpaths. These are public entry points introduced so a lean import does not drag a
       * rigid-body solver or a WebGPU device onto the critical path, and they belong in this list for
       * the same reason the packages do: an undocumented public surface drifts from what is written
       * down. Sorted here as the generator sorts them, by full specifier.
       */
      "@aura3d/physics/solverless",
      "@aura3d/physics/world",
      "@aura3d/product-studio",
      "@aura3d/react",
      "@aura3d/rendering",
      "@aura3d/rendering/lean-runtime",
      "@aura3d/rendering/webgpu",
      "@aura3d/scene",
      "@aura3d/scripting",
      "@aura3d/three-compat",
      "@aura3d/workflows"
    ]);
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
    // `MAX_WEBGPU_SKINNING_JOINTS` moved to its own leaf module so the barrel can export the
    // constant without statically importing the ~139 KB `WebGPUDevice`, which was defeating the
    // dynamic-import split in `createRenderDevice`. Both symbols remain public.
    expect(docs).toContain("export { MAX_WEBGPU_SKINNING_JOINTS } from \"./WebGPUSkinningLimits\";");
    /*
     * WS-2.2 — `WebGPUDevice` moved OFF the rendering barrel to `@aura3d/engine/rendering/webgpu`.
     *
     * The earlier fix above moved a *constant* out so the barrel would not statically import the
     * device, but the barrel still re-exported the device itself as a value — which is a static graph
     * edge, so the deferral in `createRenderDevice` was still being undone. Measured cost on a one-cube
     * scene: an 18,689-byte gzip chunk on the critical path.
     *
     * Still public, still documented: the barrel keeps the types, and the value has its own entry so a
     * developer writing a custom WebGPU path can construct one (WS-2.8's escape-hatch requirement).
     */
    expect(docs).toContain("## @aura3d/rendering/webgpu");
    expect(docs).toContain("export { WebGPUDevice } from \"./WebGPUDevice\";");
    expect(docs).toContain("## @aura3d/physics/solverless");
    expect(docs).toContain("## @aura3d/physics/world");
    expect(docs).toContain("## @aura3d/assets");
    expect(docs).toContain("export { GLTFLoader, normalizeSkinWeights } from \"./GLTFLoader\";");
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
