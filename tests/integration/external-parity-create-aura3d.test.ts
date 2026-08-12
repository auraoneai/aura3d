import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CREATE_AURA3D_TEMPLATES, createA3DProject, writeCreateA3DReport } from "create-aura3d";

test("create-aura3d scaffolds every starter template from public package imports", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "a3d-create-"));
  try {
    const results = [];
    for (const template of CREATE_AURA3D_TEMPLATES) {
      const targetDir = join(tempRoot, template);
      const result = createA3DProject({
        targetDir,
        template,
        packageVersion: "1.0.0",
        rootDir: "packages/create-aura3d"
      });
      results.push(result);
      expect(result.template).toBe(template);
      for (const file of result.files) expect(existsSync(join(targetDir, file))).toBe(true);
      const manifest = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      };
      const auraDependencies = Object.entries(manifest.dependencies)
        .filter(([name]) => name.startsWith("@aura3d/"));
      expect(auraDependencies.length, `${template} must declare a public Aura3D runtime`).toBeGreaterThan(0);
      expect(auraDependencies.every(([, version]) => version === "1.0.0"), `${template} Aura3D versions`).toBe(true);
      const mainPath = join(targetDir, "src/main.ts");
      // animation-studio's entry is a thin bootstrap (render-live-route.ts); its
      // genuine public-API usage lives in the generic scene player it mounts.
      const scenePlayerPath = join(targetDir, "src/scene-player.ts");
      const apiFile = existsSync(mainPath) ? mainPath : scenePlayerPath;
      const source = readFileSync(apiFile, "utf8");
      expect(auraDependencies.some(([name]) => source.includes(`from "${name}`)), `${template} public Aura3D import`).toBe(true);
    }
    writeCreateA3DReport("tests/reports/create-aura3d.json", results[0]!);
    writeFileSync("tests/reports/create-aura3d-templates.json", `${JSON.stringify({ ok: true, templates: results }, null, 2)}\n`);
    expect(CREATE_AURA3D_TEMPLATES).toEqual(expect.arrayContaining(["falling-blocks-starter", "racing-starter"]));
    expect(results).toHaveLength(CREATE_AURA3D_TEMPLATES.length);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
