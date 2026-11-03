import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_ENGINE_SUBPATHS } from "../../../tools/arch-gates/rules/exportBudget";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const sources: Record<string, string> = {
  "./v5": "packages/engine/src/public/v5.ts",
  "./v5/context": "packages/engine/src/public/v5-context.ts",
  "./v5/game": "packages/game/src/v5.ts",
  "./v5/math/hull": "packages/math/src/independent/hull-entry.ts",
  "./v5/internal": "packages/engine/src/public/v5-internal.ts"
};
const targets: Record<string, string> = {
  "./v5": "./dist/engine/public/v5",
  "./v5/context": "./dist/engine/public/v5-context",
  "./v5/game": "./dist/game/v5",
  "./v5/math/hull": "./dist/math/independent/hull-entry",
  "./v5/internal": "./dist/engine/public/v5-internal"
};

describe("versioned engine entrypoint mappings", () => {
  it("declares each entry once and orders deeper aliases before their parents", () => {
    const registry = readJson("aura.exports.json");
    expect(registry.entries["."]).toEqual({ source: "packages/engine/src/public/index.ts", conditions: true });
    const names = registry.paths.map(([name]: string[]) => name);
    for (const [subpath, source] of Object.entries(sources)) {
      const specifier = `@aura3d/engine/${subpath.slice(2)}`;
      expect(registry.entries[subpath]).toEqual({ source, conditions: true });
      expect(registry.paths.filter(([name]: string[]) => name === specifier)).toEqual([[specifier, source]]);
      expect(names.indexOf(specifier)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(specifier)).toBeLessThan(names.indexOf("@aura3d/engine"));
      if (subpath !== "./v5") expect(names.indexOf(specifier)).toBeLessThan(names.indexOf("@aura3d/engine/v5"));
      expect(existsSync(source)).toBe(true);
    }
  });

  it("uses the correct root and workspace distribution targets", () => {
    const root = readJson("package.json");
    const workspace = readJson("packages/engine/package.json");
    for (const [subpath, target] of Object.entries(targets)) {
      expect(root.exports[subpath]).toEqual({
        types: `${target}.d.ts`,
        browser: `${target}.js`,
        import: `${target}.js`,
        default: `${target}.js`
      });
    }
    expect(root.files).toContain("dist/engine");
    expect(root.files).toContain("dist/game");
    expect(root.files).toContain("dist/math");
    for (const [subpath, target] of Object.entries({
      "./v5": "./dist/public/v5",
      "./v5/context": "./dist/public/v5-context",
      "./v5/internal": "./dist/public/v5-internal"
    })) {
      expect(workspace.exports[subpath]).toEqual({ types: `${target}.d.ts`, import: `${target}.js` });
    }
    expect(root.exports["./lighting"].import).toBe("./dist/rendering/lighting/index.js");
    expect(root.exports["./worker"].import).toBe("./dist/engine/public/worker.js");
  });

  it("allows the exact entries without opening unrelated child paths", () => {
    const allowed = new Set<string>(ALLOWED_ENGINE_SUBPATHS);
    for (const subpath of Object.keys(sources)) expect(allowed.has(subpath)).toBe(true);
    expect(allowed.has("./v5/internal/extra")).toBe(false);
    expect(allowed.has("./v5/unapproved")).toBe(false);
    expect(allowed.has("./v5/math/hull/extra")).toBe(false);
  });

  it("keeps the opt-in hull alias consistent across generated consumer maps", () => {
    const name = "@aura3d/engine/v5/math/hull";
    const source = "packages/math/src/independent/hull-entry.ts";
    const registry = readJson("aura.exports.json");
    const cliRegistry = readJson("packages/aura3d-cli/data/aura.exports.json");
    expect(cliRegistry.entries["./v5/math/hull"]).toEqual(registry.entries["./v5/math/hull"]);
    expect(cliRegistry.paths.filter(([specifier]: string[]) => specifier === name)).toEqual([[name, source]]);
    for (const path of ["tsconfig.base.json", "tsconfig.paths.generated.json"]) {
      expect(readJson(path).compilerOptions.paths[name]).toEqual([source]);
    }
    const aliases = readFileSync("vite.aliases.generated.ts", "utf8");
    const alias = `["${name}", "./${source}"]`;
    expect(aliases).toContain(alias);
    expect(aliases.indexOf(alias)).toBeLessThan(aliases.indexOf('["@aura3d/engine/v5",'));
    const manifest = readJson("tools/finalize-dist/manifest.generated.json");
    expect(manifest.specifiers).toContainEqual({ name, file: source });
    expect(manifest.subpaths).toContainEqual({
      name: "./v5/math/hull", source, dist: "./dist/math/independent/hull-entry.js", conditions: true
    });
  });

  it("resolves the independent hull through its versioned source alias", async () => {
    // The entry names its vector type `HullVector3` (key set pinned in native-independent-hull-entry.test.ts).
    const { ConvexHull, HullVector3: Vector3 } = await import("@aura3d/engine/v5/math/hull");
    const hull = ConvexHull.fromPoints([
      new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)
    ]);
    expect(hull.containsPoint(new Vector3(0.2, 0.2, 0.2))).toBe(true);
    expect(hull.containsPoint(new Vector3(0.6, 0.6, 0.2))).toBe(false);
  });

  it("marks the versioned entry and its lane registrations as side effects", () => {
    const root = readJson("package.json");
    const workspace = readJson("packages/engine/package.json");
    expect(root.sideEffects).toContain("./dist/engine/public/v5.js");
    expect(root.sideEffects).toContain("./dist/engine/lanes/**/*.js");
    expect(workspace.sideEffects).toContain("./src/public/v5.ts");
    expect(workspace.sideEffects).toContain("./dist/public/v5.js");
    expect(workspace.sideEffects).toContain("./src/lanes/**/*.ts");
    expect(workspace.sideEffects).toContain("./dist/lanes/**/*.js");
  });
});
