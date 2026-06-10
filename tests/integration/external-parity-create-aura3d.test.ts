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
      expect(manifest.dependencies["@aura3d/engine"]).toBe("1.0.0");
      const mainPath = join(targetDir, "src/main.ts");
      // animation-studio's entry is a thin bootstrap (render-live-route.ts); its
      // genuine public-API usage lives in the generic scene player it mounts.
      const scenePlayerPath = join(targetDir, "src/scene-player.ts");
      const apiFile = existsSync(mainPath) ? mainPath : scenePlayerPath;
      const source = readFileSync(apiFile, "utf8");
      expect(source).toContain("from \"@aura3d/engine\"");
    }
    writeCreateA3DReport("tests/reports/create-aura3d.json", results[0]!);
    writeFileSync("tests/reports/create-aura3d-templates.json", `${JSON.stringify({ ok: true, templates: results }, null, 2)}\n`);
    expect(results).toHaveLength(17);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
