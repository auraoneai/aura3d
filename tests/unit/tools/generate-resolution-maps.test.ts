import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPackageExports,
  buildTsconfigPaths,
  buildViteAliases,
  deprecatedStubContent,
  distTarget,
  generateResolutionMaps,
  type AuraExportsFile
} from "../../../tools/generate-resolution-maps/index.js";

const roots: string[] = [];

function fixtureRoot(aura: AuraExportsFile): string {
  const root = mkdtempSync(join(tmpdir(), "genres-"));
  roots.push(root);
  writeFileSync(join(root, "aura.exports.json"), JSON.stringify(aura));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@fixture/engine", exports: {} }, null, 2));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("generate-resolution-maps", () => {
  it("maps package sources to dist targets", () => {
    expect(distTarget("packages/engine/src/agent-api/index.ts", "js")).toBe("./dist/engine/agent-api/index.js");
    expect(distTarget("packages/assets/src/browser-index.ts", "d.ts")).toBe("./dist/assets/browser-index.d.ts");
    expect(() => distTarget("other/index.ts", "js")).toThrow();
  });

  it("a browser field produces a browser condition and a Vite alias to the browser file (a)", () => {
    const aura: AuraExportsFile = {
      package: "@fixture/engine",
      entries: {
        "./materials": {
          source: "packages/materials/src/index.ts",
          browser: "packages/materials/src/browser-index.ts"
        },
        "./core": { source: "packages/core/src/index.ts" }
      },
      paths: [
        ["@fixture/materials", "packages/materials/src/index.ts"],
        ["@fixture/core", "packages/core/src/index.ts"]
      ]
    };
    const exportsObject = buildPackageExports(aura);
    expect(exportsObject["./materials"]).toEqual({
      types: "./dist/materials/index.d.ts",
      browser: "./dist/materials/browser-index.js",
      import: "./dist/materials/index.js",
      default: "./dist/materials/index.js"
    });
    // string-form entry stays a bare string
    expect(exportsObject["./core"]).toBe("./dist/core/index.js");
    const vite = buildViteAliases(aura);
    expect(vite).toContain('["@fixture/materials", "./packages/materials/src/browser-index.ts"]');
    expect(vite).toContain('["@fixture/core", "./packages/core/src/index.ts"]');
  });

  it("adds an explicitly declared CommonJS condition without changing ESM targets", () => {
    const aura: AuraExportsFile = {
      package: "@fixture/engine",
      entries: { "./math": { source: "packages/math/src/index.ts", require: "./dist/math/index.cjs" } },
      paths: []
    };
    expect(buildPackageExports(aura)["./math"]).toEqual({
      types: "./dist/math/index.d.ts",
      browser: "./dist/math/index.js",
      import: "./dist/math/index.js",
      require: "./dist/math/index.cjs",
      default: "./dist/math/index.js"
    });
    expect(() => buildPackageExports({ ...aura, entries: { "./math": { source: "packages/math/src/index.ts", require: "../outside.cjs" } } })).toThrow("invalid CommonJS target");
    expect(() => buildPackageExports({ ...aura, entries: { "./math": { source: "packages/math/src/index.ts", require: "./dist/../outside.cjs" } } })).toThrow("invalid CommonJS target");
  });

  it("a deprecated entry emits a re-export stub source (b)", () => {
    const aura: AuraExportsFile = {
      package: "@fixture/engine",
      entries: {
        "./renderer": { source: "packages/engine/src/renderer/index.ts" }
      },
      deprecated: {
        "./advanced-runtime": {
          source: "packages/engine/src/advanced-runtime/index.ts",
          target: "./renderer",
          removeIn: "4.0.0"
        }
      },
      paths: []
    };
    const stub = deprecatedStubContent(aura, "./advanced-runtime", aura.deprecated!["./advanced-runtime"]!);
    expect(stub).toContain('export * from "../renderer/index.js"');
    // deprecated subpath still resolves in the emitted exports
    const exportsObject = buildPackageExports(aura);
    expect(exportsObject["./advanced-runtime"]).toBe("./dist/engine/advanced-runtime/index.js");
  });

  it("--check reports diffs and --write emits all four artifacts", () => {
    const aura: AuraExportsFile = {
      package: "@fixture/engine",
      entries: { ".": { source: "packages/engine/src/index.ts", conditions: true } },
      paths: [["@fixture/engine", "packages/engine/src/index.ts"]]
    };
    const root = fixtureRoot(aura);
    const failed = generateResolutionMaps(root, "check");
    expect(failed.ok).toBe(false);
    expect(failed.diffs.length).toBeGreaterThan(0);
    const written = generateResolutionMaps(root, "write");
    expect(written.ok).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.exports["."]).toEqual({
      types: "./dist/engine/index.d.ts",
      browser: "./dist/engine/index.js",
      import: "./dist/engine/index.js",
      default: "./dist/engine/index.js"
    });
    const paths = JSON.parse(readFileSync(join(root, "tsconfig.paths.generated.json"), "utf8"));
    expect(paths.compilerOptions.paths["@fixture/engine"]).toEqual(["packages/engine/src/index.ts"]);
    expect(readFileSync(join(root, "vite.aliases.generated.ts"), "utf8")).toContain("@fixture/engine");
    mkdirSync(join(root, "tools/finalize-dist"), { recursive: true });
    const checkAfter = generateResolutionMaps(root, "check");
    expect(checkAfter.ok).toBe(true);
  });

  it("synchronizes the CLI registry and detects drift", () => {
    const aura: AuraExportsFile = {
      package: "@fixture/engine",
      entries: { ".": { source: "packages/engine/src/index.ts", conditions: true } },
      paths: [
        ["@fixture/assets/exporters", "packages/assets/src/exporters/index.ts"],
        ["@fixture/assets", "packages/assets/src/index.ts", { browser: "packages/assets/src/browser-index.ts" }]
      ]
    };
    const root = fixtureRoot(aura);
    mkdirSync(join(root, "packages/aura3d-cli/data"), { recursive: true });
    generateResolutionMaps(root, "write");
    const bundled = join(root, "packages/aura3d-cli/data/aura.exports.json");
    expect(readFileSync(bundled, "utf8")).toBe(readFileSync(join(root, "aura.exports.json"), "utf8"));
    writeFileSync(bundled, "{}\n");
    expect(generateResolutionMaps(root, "check").diffs.some((diff) => diff.includes("data/aura.exports.json"))).toBe(true);
    generateResolutionMaps(root, "write");
    expect(generateResolutionMaps(root, "check").ok).toBe(true);
    const aliases = readFileSync(join(root, "vite.aliases.generated.ts"), "utf8");
    expect(aliases.indexOf('"@fixture/assets/exporters"')).toBeLessThan(aliases.indexOf('"@fixture/assets"'));
    expect(aliases).toContain('["@fixture/assets", "./packages/assets/src/browser-index.ts"]');
  });

  it("maps native entrypoints to their declared source and published targets", () => {
    const root = process.cwd();
    const aura = JSON.parse(readFileSync(join(root, "aura.exports.json"), "utf8")) as AuraExportsFile;
    const paths = Object.fromEntries(aura.paths.map(([specifier, source]) => [specifier, source]));
    expect(paths["@aura3d/assets/exporters"]).toBe("packages/assets/src/exporters/index.ts");
    expect(paths["@aura3d/assets/importers"]).toBe("packages/assets/src/importers.ts");
    expect(paths["@aura3d/debug/helpers"]).toBe("packages/debug/src/helpers.ts");
    expect(paths["@aura3d/rendering/shader-graph"]).toBe("packages/rendering/src/program/ShaderGraphCompiler.ts");
    expect(paths["@aura3d/engine/scatter"]).toBe("packages/engine/src/agent-api/nodes/scatter.ts");
    expect(paths["@aura3d/engine/worker"]).toBe("packages/engine/src/public/worker.ts");
    expect(paths["@aura3d/engine/lighting"]).toBe("packages/rendering/src/lighting/index.ts");
    expect(paths["@aura3d/engine/shader-graph-runtime"]).toBe("packages/engine/src/public/shader-graph-runtime.ts");
    expect(paths["@aura3d/rendering/volumetrics"]).toBe("packages/rendering/src/volumetrics.ts");
    expect(paths["@aura3d/addons/utils/WorkerPool"]).toBe("packages/addons/src/utils/WorkerPool.ts");
    const assets = JSON.parse(readFileSync(join(root, "packages/assets/package.json"), "utf8"));
    const debug = JSON.parse(readFileSync(join(root, "packages/debug/package.json"), "utf8"));
    const addons = JSON.parse(readFileSync(join(root, "packages/addons/package.json"), "utf8"));
    expect(assets.exports["./exporters"].import).toBe("./dist/exporters/index.js");
    expect(assets.exports["./importers"].import).toBe("./dist/importers.js");
    expect(debug.exports["./helpers"].types).toBe("./dist/helpers.d.ts");
    expect(addons.exports["./utils/WorkerPool"].import).toBe("./dist/utils/WorkerPool.js");
  });

  it("keeps the engine lighting entrypoint on the same internalized module as the root runtime", () => {
    const aura = JSON.parse(readFileSync(join(process.cwd(), "aura.exports.json"), "utf8")) as AuraExportsFile;
    expect(aura.entries["./lighting"]).toEqual({ source: "packages/rendering/src/lighting/index.ts", conditions: true });
    expect(buildPackageExports(aura)["./lighting"]).toEqual({
      types: "./dist/rendering/lighting/index.d.ts",
      browser: "./dist/rendering/lighting/index.js",
      import: "./dist/rendering/lighting/index.js",
      default: "./dist/rendering/lighting/index.js"
    });
    const paths = buildTsconfigPaths(aura) as { compilerOptions: { paths: Record<string, string[]> } };
    expect(paths.compilerOptions.paths["@aura3d/engine/lighting"]).toEqual(paths.compilerOptions.paths["@aura3d/rendering/lighting"]);
    const aliases = buildViteAliases(aura);
    expect(aliases).toContain('["@aura3d/engine/lighting", "./packages/rendering/src/lighting/index.ts"]');
    expect(aliases.indexOf('"@aura3d/engine/lighting"')).toBeLessThan(aliases.indexOf('"@aura3d/engine"'));
    expect(aliases.indexOf('"@aura3d/assets/importers"')).toBeLessThan(aliases.indexOf('"@aura3d/assets"'));
  });

  it("loads opt-in source entrypoints without creating browser resources", async () => {
    const [importers, exporters, worker, graph, lighting] = await Promise.all([
      import("@aura3d/assets/importers"),
      import("@aura3d/assets/exporters"),
      import("@aura3d/engine/worker"),
      import("@aura3d/engine/shader-graph-runtime"),
      import("@aura3d/engine/lighting")
    ]);
    expect(typeof importers.parseBVH).toBe("function");
    expect(typeof exporters.exportGLTF).toBe("function");
    expect(typeof worker.createWorkerRenderer).toBe("function");
    expect(typeof worker.workerRendererUrl).toBe("function");
    expect(typeof graph.createCustomShaderMaterial).toBe("function");
    expect(typeof graph.shaderGraphMaterial).toBe("function");
    expect(typeof lighting.NativeLightmapBake).toBe("function");
  });

  it("excludes vite:false rows from Vite aliases but keeps them in tsconfig paths", () => {
    const aura: AuraExportsFile = {
      package: "@fixture/engine",
      entries: {},
      paths: [
        ["@fixture/internal", "packages/engine/src/internal.ts", { vite: false }],
        ["@fixture/public", "packages/engine/src/public.ts"]
      ]
    };
    const paths = buildTsconfigPaths(aura) as { compilerOptions: { paths: Record<string, string[]> } };
    expect(paths.compilerOptions.paths["@fixture/internal"]).toEqual(["packages/engine/src/internal.ts"]);
    const vite = buildViteAliases(aura);
    expect(vite).not.toContain("@fixture/internal");
    expect(vite).toContain("@fixture/public");
  });
});
