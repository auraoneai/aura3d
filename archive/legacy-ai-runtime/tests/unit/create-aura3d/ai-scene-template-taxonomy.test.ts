import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createA3DProject, type CreateA3DTemplate } from "../../../packages/create-aura3d/src";

const AI_SCENE_TEMPLATES = [
  "ai-scene-prompt-lab",
  "ai-cinematic-previs",
  "ai-product-shot-generator",
  "ai-scene-runtime-basic"
] as const satisfies readonly CreateA3DTemplate[];

describe("AI scene create-aura3d templates", () => {
  it("uses contextual names instead of release-prefixed names", () => {
    for (const template of AI_SCENE_TEMPLATES) {
      expect(template).not.toMatch(/^v2/i);
      expect(template).toMatch(/^ai-/);
    }
  });

  it("scaffolds every AI scene template from the package template root", () => {
    const root = mkdtempSync(join(tmpdir(), "a3d-ai-template-"));
    for (const template of AI_SCENE_TEMPLATES) {
      const result = createA3DProject({
        targetDir: join(root, template),
        template,
        packageVersion: "workspace:*"
      });
      expect(result.template).toBe(template);
      expect(result.files).toContain("index.html");
      expect(result.files).toContain("src/main.ts");
    }
  });
});
