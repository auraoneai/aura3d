import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const AI_SCENE_TEMPLATES = [
  "ai-scene-prompt-lab",
  "ai-cinematic-previs",
  "ai-product-shot-generator",
  "ai-scene-runtime-basic"
] as const;

test.describe("AI scene template smoke", () => {
  test("package and root template copies are present with no release-prefixed names", () => {
    for (const template of AI_SCENE_TEMPLATES) {
      expect(template).not.toMatch(/^v2/i);
      for (const root of ["packages/create-aura3d/templates", "templates"]) {
        expect(existsSync(resolve(root, template, "README.md")), `${root}/${template}/README.md`).toBe(true);
        expect(existsSync(resolve(root, template, "index.html")), `${root}/${template}/index.html`).toBe(true);
        expect(existsSync(resolve(root, template, "src/main.ts")), `${root}/${template}/src/main.ts`).toBe(true);
        expect(existsSync(resolve(root, template, "package.json")), `${root}/${template}/package.json`).toBe(true);
      }
    }
  });
});
