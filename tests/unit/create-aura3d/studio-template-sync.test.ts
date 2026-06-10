import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APPS_SRC = "apps/animation-studio-web/src";
const STUDIO_SRC = "packages/create-aura3d/templates/animation-studio/studio/src";

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) collectFiles(path, out);
    else out.push(path);
  }
  return out.sort();
}

describe("animation-studio bundled Studio stays in sync with apps/animation-studio-web", () => {
  // The template's studio/ is a copy of apps/animation-studio-web taken at release
  // time. 1.3.2 shipped a stale fork (the template kept a pre-bugfix App.tsx while
  // the apps copy was fixed). This guard fails whenever the two src trees drift so
  // a release can never ship a stale Studio again. studio/vite.config.ts is
  // intentionally different (it re-bases monorepo paths for scaffolded projects)
  // and is therefore not compared.
  it("every studio src file matches its apps/animation-studio-web counterpart byte-for-byte", () => {
    const studioFiles = collectFiles(STUDIO_SRC).map((path) => relative(STUDIO_SRC, path));
    expect(studioFiles.length).toBeGreaterThan(0);
    for (const file of studioFiles) {
      const appsPath = join(APPS_SRC, file);
      expect(existsSync(appsPath), `${file} exists in apps/animation-studio-web/src`).toBe(true);
      expect(readFileSync(join(STUDIO_SRC, file), "utf8"), `studio/src/${file} matches apps copy`).toBe(readFileSync(appsPath, "utf8"));
    }
  });

  it("styles.css and index.html match the apps copy", () => {
    for (const file of ["index.html"]) {
      const studioPath = join("packages/create-aura3d/templates/animation-studio/studio", file);
      const appsPath = join("apps/animation-studio-web", file);
      expect(readFileSync(studioPath, "utf8"), `studio/${file} matches apps copy`).toBe(readFileSync(appsPath, "utf8"));
    }
  });
});
