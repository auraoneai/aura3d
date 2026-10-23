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
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
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
