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
