import { describe, expect, it } from "vitest";
import { validateDocsVersionAlignment } from "../../../tools/docs-version-alignment/index.js";

describe("docs version alignment", () => {
  it("aligns public package versions, API docs, tutorials, examples, changelog, and governance docs", () => {
    const report = validateDocsVersionAlignment(process.cwd());

    expect(report.ok).toBe(true);
    expect(report.version).toBe("1.3.3");
    expect(report.violations).toEqual([]);
    expect(report.checkedFiles).toEqual(expect.arrayContaining([
      "package.json",
      "CHANGELOG.md",
      "docs/project/security-policy.md",
      "docs/project/support-policy.md",
      "CONTRIBUTING.md",
      "docs/api/public-api.md",
      "docs/project/site-map.md",
      "docs/project/compatibility.md",
      "docs/project/release-checklist.md",
      "docs/project/release-process.md",
      "docs/project/tutorials-getting-started-real-scene.md",
      "docs/project/tutorials-product-configurator.md",
      "packages/rendering/package.json",
      "packages/assets/package.json",
      "packages/editor-runtime/package.json"
    ]));
    expect(report.linkedPaths).toEqual(expect.arrayContaining([
      "docs/api/public-api.md",
      "docs/project/tutorials-getting-started-real-scene.md",
      "CHANGELOG.md"
    ]));
  });
});
