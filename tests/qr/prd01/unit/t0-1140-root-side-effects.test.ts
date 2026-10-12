/**
 * #1140 follow-up: the published `@aura3d/engine` tarball ships every
 * workspace package under the ROOT `dist/<pkg>/` tree with its imports
 * rewritten to relative paths (tools/finalize-dist). Those files are governed
 * by the root package.json, so a root `"sideEffects": false` dropped the lane
 * barrels from every scaffolded app's production bundle: createAuraApp then
 * mounted on the stub program cache ("program-generator-missing").
 *
 * The lane globs alone are not enough: `public/index.ts` reaches the lanes
 * through a bare `import "../lanes/index.js"`, and Rollup/esbuild never
 * execute a side-effect-free barrel's own imports (L4 bundle diag on run
 * 38276326492: lanes `hasModuleSideEffects: true`, `isIncluded: false`). The
 * public entry itself must be side-effectful.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("#1140: root @aura3d/engine manifest keeps the lane side effects", () => {
  it("re-roots every package dist sideEffects glob under ./dist/<pkg>/", () => {
    const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { sideEffects?: unknown };
    expect(Array.isArray(root.sideEffects)).toBe(true);
    const globs = root.sideEffects as string[];
    const missing: string[] = [];
    for (const dir of readdirSync(join(repoRoot, "packages"))) {
      const manifest = join(repoRoot, "packages", dir, "package.json");
      if (!existsSync(manifest)) continue;
      const sideEffects = (JSON.parse(readFileSync(manifest, "utf8")) as { sideEffects?: unknown }).sideEffects;
      if (!Array.isArray(sideEffects)) continue;
      for (const glob of sideEffects as string[]) {
        if (!glob.startsWith("./dist/")) continue;
        const rerooted = `./dist/${dir}/${glob.slice("./dist/".length)}`;
        if (!globs.includes(rerooted)) missing.push(rerooted);
      }
    }
    expect(missing).toEqual([]);
    expect(globs).toContain("./dist/engine/lanes/**/*.js");
    expect(globs).toContain("./dist/rendering/lanes/**/*.js");
    expect(globs).toContain("./dist/engine/public/index.js");
  });

  it("marks the in-repo public entry side-effectful (apps alias @aura3d/engine to source)", () => {
    // esbuild keeps a barrel's bare imports regardless, so this is a manifest
    // check; Rollup (Vite) is the bundler that drops them — proven on L4.
    const engine = JSON.parse(readFileSync(join(repoRoot, "packages/engine/package.json"), "utf8")) as { sideEffects?: string[] };
    expect(engine.sideEffects).toEqual(expect.arrayContaining(["./src/public/index.ts", "./dist/public/index.js"]));
  });
});
