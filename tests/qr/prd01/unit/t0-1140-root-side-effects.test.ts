/**
 * #1140 follow-up: the published `@aura3d/engine` tarball ships every
 * workspace package under the ROOT `dist/<pkg>/` tree with its imports
 * rewritten to relative paths (tools/finalize-dist). Those files are governed
 * by the root package.json, so a root `"sideEffects": false` drops
 * `dist/engine/lanes/**` and `dist/rendering/lanes/**` from every scaffolded
 * app's production bundle: createAuraApp then mounts on the stub program
 * cache ("program-generator-missing") and the templates lose their generated
 * lighting/shadow/post programs. The root manifest must carry each package's
 * dist side-effect globs re-rooted under `./dist/<pkg>/`.
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
  });
});
