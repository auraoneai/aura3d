import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createPackageProvenanceReport } from "../../../tools/package-provenance/index.js";

describe("package provenance", () => {
  it("binds provenance to a fresh tarball for the current package version", () => {
    const root = provenanceFixture("1.6.0", "1.6.0");
    const report = createPackageProvenanceReport(root);

    expect(report.ok).toBe(true);
    expect(report.builder.version).toBe("1.6.0");
    expect(report.subject.name).toContain("aura3d-engine-1.6.0.tgz");
    expect(report.signature.verified).toBe(true);
  });

  it("rejects a passing smoke report for a stale package version", () => {
    const report = createPackageProvenanceReport(provenanceFixture("1.6.0", "1.4.5"));

    expect(report.ok).toBe(false);
    expect(report.violations.join("\n")).toContain("Install-smoke package version 1.4.5 does not match 1.6.0");
  });

  it("rejects a report whose digest does not match the tarball bytes", () => {
    const root = provenanceFixture("1.6.0", "1.6.0", "0".repeat(64));
    const report = createPackageProvenanceReport(root);

    expect(report.ok).toBe(false);
    expect(report.violations).toContain("Fresh install-smoke tarball sha256 is missing or does not match the tarball bytes.");
  });
});

function provenanceFixture(packageVersion: string, smokeVersion: string, shaOverride?: string): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-provenance-"));
  const tarballPath = `tests/reports/package-install-smoke-fresh/aura3d-engine-${smokeVersion}.tgz`;
  const tarball = Buffer.from(`tarball-${smokeVersion}`);
  const sha256 = shaOverride ?? createHash("sha256").update(tarball).digest("hex");

  mkdirSync(join(root, "tests/reports/package-install-smoke-fresh"), { recursive: true });
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "@aura3d/engine", version: packageVersion })}\n`);
  writeFileSync(join(root, tarballPath), tarball);
  writeFileSync(join(root, "tests/reports/package-install-smoke.json"), `${JSON.stringify({
    ok: true,
    packageName: "@aura3d/engine",
    packageVersion: smokeVersion,
    tarballPath,
    tarballSha256: sha256,
    packMode: "fresh-current-checkout-pack"
  })}\n`);
  return root;
}
