import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createV3ApiAuditReport } from "../../../tools/v3-api-audit/index";

describe("V3 API audit", () => {
  it("covers every current public package and keeps private test utilities out of the product API", () => {
    const report = createV3ApiAuditReport(process.cwd());
    const packageNames = report.packages.map((pkg) => pkg.packageName);

    expect(report.schema).toBe("g3d-v3-api-audit/v1");
    expect(packageNames).toContain("@galileo3d/product-studio");
    expect(packageNames).not.toContain("@galileo3d/test-utils");
    expect(report.privatePackages).toContain("@galileo3d/test-utils");
    expect(report.futurePackages).toEqual([
      {
        packageName: "@galileo3d/workflows",
        expectedAtMilestone: "Milestone 4 - Workflow SDK Package",
        exists: existsSync("packages/workflows/package.json")
      }
    ]);
  });

  it("requires package exports, TypeScript aliases, root subpath exports, and docs coverage", () => {
    const report = createV3ApiAuditReport(process.cwd());

    expect(report.violations).toEqual([]);
    expect(report.pass).toBe(true);
    for (const pkg of report.packages) {
      expect(pkg.exportCount, pkg.packageName).toBeGreaterThan(0);
      expect(pkg.hasPackageExport, pkg.packageName).toBe(true);
      expect(pkg.hasPackageTypes, pkg.packageName).toBe(true);
      expect(pkg.hasPackageImport, pkg.packageName).toBe(true);
      expect(pkg.hasTsconfigPath, pkg.packageName).toBe(true);
      expect(pkg.documentedInPublicApi, pkg.packageName).toBe(true);
      expect(pkg.documentedInV3Map, pkg.packageName).toBe(true);
      expect(pkg.hasRootSubpathExport, pkg.packageName).toBe(true);
    }
  });
});
