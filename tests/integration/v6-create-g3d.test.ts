import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createG3DProject, type CreateG3DTemplate } from "../../packages/create-g3d/src";

const templates: readonly CreateG3DTemplate[] = [
  "v6-product-viewer",
  "v6-product-configurator",
  "v6-asset-inspector",
  "v6-material-studio",
  "v6-architecture-viewer",
  "v6-webgpu-starter"
];

describe("V6 create-g3d templates", () => {
  it("mirrors every V6 template and can scaffold it", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "g3d-v6-create-"));
    try {
      for (const template of templates) {
        expect(existsSync(resolve(`templates/${template}/index.html`))).toBe(true);
        expect(existsSync(resolve(`packages/create-g3d/templates/${template}/index.html`))).toBe(true);
        const result = createG3DProject({
          targetDir: join(tempRoot, template),
          template,
          rootDir: resolve("packages/create-g3d")
        });
        expect(result.template).toBe(template);
        expect(existsSync(join(result.targetDir, "package.json"))).toBe(true);
        expect(existsSync(join(result.targetDir, "index.html"))).toBe(true);
        expect(existsSync(join(result.targetDir, "src", "main.ts"))).toBe(true);
        expect(existsSync(join(result.targetDir, "asset-manifest.json"))).toBe(true);
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
