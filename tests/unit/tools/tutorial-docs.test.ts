import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tutorialPaths = [
  "docs/project/tutorials-getting-started-real-scene.md",
  "docs/project/tutorials-product-configurator.md"
] as const;

describe("tutorial docs", () => {
  it("link every tutorial to a running example and verification command", () => {
    for (const path of tutorialPaths) {
      const docs = readFileSync(path, "utf8");
      expect(docs, `${path} should link to a running example`).toMatch(/\/examples\/[a-z0-9-]+\/index\.html/);
      expect(docs, `${path} should include a runnable verification command`).toContain("pnpm exec playwright test");
    }
  });

  it("provides a getting-started renderer path without relying on test files", () => {
    const docs = readFileSync("docs/project/tutorials-getting-started-real-scene.md", "utf8");

    expect(docs).toContain("Renderer.create");
    expect(docs).toContain('backend: "webgl2"');
    expect(docs).toContain("Geometry.uvSphere");
    expect(docs).toContain("PBRMaterial");
    expect(docs).toContain("diagnostics.drawCalls");
    expect(docs).toContain("does not require reading test files");
  });

  it("covers concept boundary docs for core runtime systems", () => {
    for (const path of [
      "docs/concepts/engine-lifecycle.md",
      "docs/concepts/scene-vs-ecs.md",
      "docs/concepts/rendering.md",
      "docs/concepts/assets.md",
      "docs/concepts/physics.md",
      "docs/concepts/animation.md",
      "docs/concepts/editor-runtime.md"
    ]) {
      const docs = readFileSync(path, "utf8");
      expect(docs, `${path} should explain package boundaries`).toContain("Boundary");
      expect(docs, `${path} should include explicit limits`).toContain("Current Limits");
    }
  });
});
