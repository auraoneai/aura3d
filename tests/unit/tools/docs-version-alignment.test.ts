import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDocsVersionAlignment } from "../../../tools/docs-version-alignment/index.js";

/**
 * The version the whole repository must agree on, read from the root manifest.
 *
 * This was a hardcoded `"1.5.0"`, which made every release bump fail this test for the one
 * reason a version-alignment gate should never fail: the version changed. The gate's job is to
 * catch a doc that *disagrees* with the package version, not to pin the package version, so it
 * now reads the source of truth. The `violations` assertion below is what actually enforces
 * agreement.
 */
const EXPECTED_VERSION = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

describe("docs version alignment", () => {
  it("aligns public package versions, API docs, tutorials, examples, changelog, and governance docs", () => {
    const report = validateDocsVersionAlignment(process.cwd());

    expect(report.ok).toBe(true);
    expect(report.version).toBe(EXPECTED_VERSION);
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
      "docs/project/release/release-checklist.md",
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
