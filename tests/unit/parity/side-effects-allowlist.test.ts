import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Production bundlers tree-shake any module the package.json `sideEffects` allowlist does not name when none of its
 * exports are used. Modules that register themselves at load time (`registerXxx(...)` at the top level) therefore
 * vanish from production builds unless allowlisted, which made `instances.mesh` throw "instancedMesh module was not
 * loaded" on the deployed Drift & Deliver port while the Vite dev server (no tree-shaking) worked fine.
 */
const root = process.cwd();

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function covered(patterns: readonly string[], relPath: string): boolean {
  const normalized = `./${relPath}`;
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsFiles(path));
    else if (/\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

const engineManifest = JSON.parse(readFileSync(join(root, "packages/engine/package.json"), "utf8")) as { sideEffects: string[] };
const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { sideEffects: string[] };
const engineSrc = join(root, "packages/engine/src");

// Top-level self-registration: a statement at column 0 that calls a `register*` function.
const selfRegistering = tsFiles(join(engineSrc, "agent-api"))
  .filter((file) => /^register[A-Za-z]*\(/m.test(readFileSync(file, "utf8")))
  .map((file) => relative(engineSrc, file).split("\\").join("/"));

describe("sideEffects allowlist covers modules that register themselves at load time", () => {
  it("finds the known self-registering agent-api modules", () => {
    expect(selfRegistering).toEqual(expect.arrayContaining([
      "agent-api/nodes/instancedMesh.ts",
      "agent-api/nodes/batched.ts",
      "agent-api/compiler/lines.ts"
    ]));
  });

  it.each(selfRegistering)("packages/engine/package.json allowlists src/%s and its dist output", (relPath) => {
    const src = relPath; // e.g. agent-api/nodes/instancedMesh.ts
    expect(covered(engineManifest.sideEffects, `src/${src}`), `src/${src}`).toBe(true);
    expect(covered(engineManifest.sideEffects, `dist/${src.replace(/\.ts$/, ".js")}`), `dist/${src}`).toBe(true);
  });

  it.each(selfRegistering)("root package.json (published @aura3d/engine) allowlists dist/engine/%s", (relPath) => {
    expect(covered(rootManifest.sideEffects, `dist/engine/${relPath.replace(/\.ts$/, ".js")}`)).toBe(true);
  });
});

describe("example and app entry modules survive production bundles with plain imports", () => {
  const wrappers = readdirSync(join(root, "apps"))
    .filter((name) => /^showcase-.+-port$/.test(name))
    .map((name) => join("apps", name, "src", "main.ts"));

  it("root package.json allowlists examples/, apps/ and templates/ (they load for their side effects)", () => {
    for (const rel of ["examples/strange-orbit-port/main.ts", "apps/showcase-port-shared/diag.ts", "templates/mini-game/src/main.ts"]) {
      expect(covered(rootManifest.sideEffects, rel), rel).toBe(true);
    }
  });

  it.each(wrappers)("%s needs no tree-shake workaround (bare imports, no __AURA_PORT_MODULES__)", (rel) => {
    const source = readFileSync(join(root, rel), "utf8");
    expect(source).not.toContain("__AURA_PORT_MODULES__");
    expect(source).toMatch(/^import "\.\.\/\.\.\/\.\.\/examples\/[a-z0-9-]+-port\/main";$/m);
  });

  it("a real vite production build keeps a bare-imported module that only runs for its side effects", async () => {
    const { build } = await import("vite");
    const { mkdtempSync, mkdirSync, writeFileSync, readdirSync: ls, readFileSync: read } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "aura-sidefx-"));
    mkdirSync(join(dir, "examples", "game"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", private: true, sideEffects: rootManifest.sideEffects }));
    writeFileSync(join(dir, "examples", "game", "main.ts"), "(globalThis as { __SIDEFX_MARKER__?: number }).__SIDEFX_MARKER__ = 1;\n");
    writeFileSync(join(dir, "entry.ts"), 'import "./examples/game/main";\n');
    const run = async (sideEffects: string[] | undefined, out: string): Promise<string> => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", private: true, ...(sideEffects ? { sideEffects } : {}) }));
      await build({ root: dir, logLevel: "silent", configFile: false, build: { outDir: out, minify: false, lib: { entry: join(dir, "entry.ts"), formats: ["es"], fileName: "bundle" } } });
      return ls(join(dir, out)).map((file) => read(join(dir, out, file), "utf8")).join("\n");
    };
    expect(await run(rootManifest.sideEffects, "out-fixed")).toContain("__SIDEFX_MARKER__");
    // Control: the pre-fix allowlist (dist-only patterns) drops the module, which is what emptied the live ports.
    expect(await run(rootManifest.sideEffects.filter((entry) => !/^\.\/(examples|apps|templates)\//.test(entry)), "out-control")).not.toContain("__SIDEFX_MARKER__");
  }, 60_000);
});
