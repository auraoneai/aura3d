import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createA3DProject, writeCreateA3DReport } from "@aura3d/create-aura3d";

test("create-aura3d scaffolds every ExternalParity template from public package imports", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "a3d-create-"));
  try {
    const templates = ["external-parity-product-viewer", "external-parity-material-studio", "external-parity-asset-gallery", "external-parity-interactive-scene"] as const;
    const results = [];
    for (const template of templates) {
      const targetDir = join(tempRoot, template);
      const result = createA3DProject({
        targetDir,
        template,
        packageVersion: "0.1.0-alpha.0"
      });
      results.push(result);
      expect(result.template).toBe(template);
      for (const file of result.files) {
        expect(existsSync(join(targetDir, file))).toBe(true);
      }
      const manifest = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(manifest.dependencies["@aura3d/engine"]).toBe("0.1.0-alpha.0");
      expect(Object.values(manifest.dependencies).some((value) => value.includes("workspace:"))).toBe(false);
      expect(Object.values(manifest.devDependencies).some((value) => value.includes("workspace:"))).toBe(false);
      const source = readFileSync(join(targetDir, "src/main.ts"), "utf8");
      expect(source).toContain("from \"@aura3d/engine\"");
      expect(source).toContain("createA3DApp");
      expect(source).toContain("workflows");
      expect(source).toContain("createEnvironment");
    }
    writeCreateA3DReport("tests/reports/external-parity-create-aura3d.json", results[0]!);
    writeFileSync("tests/reports/external-parity-create-aura3d-templates.json", `${JSON.stringify({ ok: true, templates: results }, null, 2)}\n`);
    const report = JSON.parse(readFileSync("tests/reports/external-parity-create-aura3d-templates.json", "utf8")) as { templates: typeof results };
    expect(report.templates).toHaveLength(4);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
