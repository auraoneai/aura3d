import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

interface PackageJson {
  version: string;
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function packageVersion(): string {
  return (JSON.parse(read("package.json")) as PackageJson).version;
}

describe("governance documentation", () => {
  it("has support, security, contribution, release, migration, compatibility, and claim docs aligned to package version", () => {
    const version = packageVersion();
    const requiredVersionedDocs = [
      "docs/project/security-policy.md",
      "docs/project/support-policy.md",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "docs/project/release-process.md",
      "docs/project/release-checklist.md",
      "docs/project/claim-guidelines.md",
      "docs/project/migration.md",
      "docs/project/compatibility.md"
    ];

    for (const path of requiredVersionedDocs) {
      expect(existsSync(join(root, path)), `${path} should exist`).toBe(true);
      expect(read(path), `${path} should reference package version ${version}`).toContain(`Version: ${version}`);
    }
  });

  it("binds public claims and release notes to the productStudio claim registry", () => {
    for (const path of [
      "docs/project/security-policy.md",
      "docs/project/support-policy.md",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "docs/project/release-process.md",
      "docs/project/release-checklist.md",
      "docs/project/claim-guidelines.md",
      "docs/project/migration.md",
      "docs/project/compatibility.md"
    ]) {
      expect(read(path), `${path} should bind wording to the claim registry`).toContain("docs/project/product-studio-claim-registry.md");
    }
  });

  it("has issue templates for bugs and feature requests with version and claim-impact fields", () => {
    const bugReport = read(".github/ISSUE_TEMPLATE/bug_report.yml");
    const featureRequest = read(".github/ISSUE_TEMPLATE/feature_request.yml");

    expect(bugReport).toContain("id: version");
    expect(bugReport).toContain("id: reproduction");
    expect(featureRequest).toContain("id: version");
    expect(featureRequest).toContain("id: claim-impact");
  });
});
