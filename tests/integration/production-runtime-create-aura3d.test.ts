import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATE_AURA3D_TEMPLATES, createA3DProject } from "../../packages/create-aura3d/src";

describe("create-aura3d templates", () => {
  it("mirrors every starter template and can scaffold it", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "a3d-create-"));
    try {
      for (const template of CREATE_AURA3D_TEMPLATES) {
        expect(existsSync(resolve(`packages/create-aura3d/templates/${template}/index.html`))).toBe(true);
        const result = createA3DProject({
          targetDir: join(tempRoot, template),
          template,
          rootDir: resolve("packages/create-aura3d")
        });
        expect(result.template).toBe(template);
        expect(existsSync(join(result.targetDir, "package.json"))).toBe(true);
        expect(existsSync(join(result.targetDir, "index.html"))).toBe(true);
        const hasMainTs = existsSync(join(result.targetDir, "src", "main.ts"));
        const hasRenderRouteTs = existsSync(join(result.targetDir, "src", "render-live-route.ts"));
        // Only animation-studio legitimately ships without src/main.ts (it uses render-live-route.ts).
        if (template === "animation-studio") {
          expect(hasMainTs || hasRenderRouteTs).toBe(true);
        } else {
          expect(hasMainTs).toBe(true);
        }
        expect(existsSync(join(result.targetDir, "tests", "route-health.spec.ts"))).toBe(true);
        expect(existsSync(join(result.targetDir, "tests", "screenshot.spec.ts"))).toBe(true);
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
