import { describe, expect, it } from "vitest";
import { validateDocsVersionAlignment } from "../../../tools/docs-version-alignment/index.js";

describe("docs version alignment", () => {
  it("aligns public package versions, API docs, tutorials, examples, changelog, and governance docs", () => {
    const report = validateDocsVersionAlignment(process.cwd());

    expect(report.ok).toBe(true);
    expect(report.version).toBe("0.1.0-alpha.0");
    expect(report.violations).toEqual([]);
    expect(report.checkedFiles).toEqual(expect.arrayContaining([
      "package.json",
      "CHANGELOG.md",
      "SECURITY.md",
      "SUPPORT.md",
      "CONTRIBUTING.md",
      "docs/api/public-api.md",
      "docs/site-map.md",
      "docs/compatibility.md",
      "docs/release-checklist.md",
      "docs/release-process.md",
      "docs/tutorials/getting-started-real-scene.md",
      "docs/tutorials/product-configurator.md",
      "docs/examples/product-demos.md",
      "packages/rendering/package.json",
      "packages/assets/package.json",
      "packages/editor-runtime/package.json"
    ]));
    expect(report.linkedPaths).toEqual(expect.arrayContaining([
      "docs/api/public-api.md",
      "docs/tutorials/getting-started-real-scene.md",
      "examples/product-configurator/index.html",
      "examples/architecture-viewer/index.html",
      "examples/game-slice/index.html",
      "CHANGELOG.md"
    ]));
  });
});
