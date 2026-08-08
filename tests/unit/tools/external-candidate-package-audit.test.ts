import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("external candidate package audit", () => {
  const report = JSON.parse(readFileSync("tests/reports/external-candidate-package-audit.json", "utf8"));

  it("audits all locked candidates from one isolated lockfile", () => {
    expect(report.packages).toHaveLength(8);
    expect(report.lockfileVersion).toBeGreaterThanOrEqual(3);
    expect(report.packages.every((entry: { tarball: { integrity?: string; packageBytes: number } }) => entry.tarball.integrity?.startsWith("sha512-") && entry.tarball.packageBytes > 0)).toBe(true);
  });

  it("records security and browser bundle results without treating them as selection", () => {
    expect(report.packages.every((entry: { security: { vulnerable: boolean } }) => entry.security.vulnerable === false)).toBe(true);
    expect(report.packages.every((entry: { allExportBrowserBundle: { pass: boolean } }) => typeof entry.allExportBrowserBundle.pass === "boolean")).toBe(true);
    expect(report.claimBoundary).toContain("does not select");
  });
});
