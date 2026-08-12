import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("final subsystem ownership", () => {
  it("covers every package and every package source file exactly once", () => {
    const report = JSON.parse(readFileSync("tests/reports/final-subsystem-ownership.json", "utf8"));
    expect(report.pass).toBe(true);
    expect(report.packageCount).toBe(29);
    expect(new Set(report.subsystems.flatMap((entry: { files: string[] }) => entry.files)).size).toBe(report.sourceFilesClassified);
    expect(report.packages.every((entry: { disposition?: string }) => Boolean(entry.disposition))).toBe(true);
    expect(report.subsystems.every((entry: { compiledCost?: { gzipBytes: number }; maintenanceReferenceCount?: number }) => entry.compiledCost && typeof entry.compiledCost.gzipBytes === "number" && typeof entry.maintenanceReferenceCount === "number")).toBe(true);
  });

  it("does not classify a public package as delete-now", () => {
    const report = JSON.parse(readFileSync("tests/reports/final-subsystem-ownership.json", "utf8"));
    expect(report.packages.filter((entry: { disposition: string }) => entry.disposition === "DELETE-NOW")).toEqual([]);
    expect(report.packages.filter((entry: { published: boolean }) => entry.published).every((entry: { publicExportBlocksImmediateRemoval: boolean }) => entry.publicExportBlocksImmediateRemoval)).toBe(true);
    const internalEngine = report.packages.find((entry: { package: string }) => entry.package === "engine");
    expect(internalEngine.published).toBe(false);
    expect(internalEngine.zeroSourceConsumers).toBe(false);
  });

  it("records the sole Rapier physical adapter after displaced implementations were removed", () => {
    const report = JSON.parse(readFileSync("tests/reports/final-subsystem-ownership.json", "utf8"));
    const dispositions = Object.fromEntries(report.subsystems.map((entry: { id: string; disposition: string }) => [entry.id, entry.disposition]));
    expect(dispositions["physics-evidence-descriptors"]).toBeUndefined();
    expect(dispositions["physics-custom-physical-controllers"]).toBeUndefined();
    expect(dispositions["physics-rapier-contract"]).toBe("EXTERNAL-ADAPTER");
  });

  it("pins current external metadata without selecting an implementation", () => {
    const report = JSON.parse(readFileSync("tests/reports/final-subsystem-ownership.json", "utf8"));
    expect(report.externalCandidates).toHaveLength(7);
    expect(report.externalCandidates.find((entry: { name: string }) => entry.name === "yuka").freshness).toBe("dormant-risk");
    expect(report.externalCandidates.find((entry: { name: string }) => entry.name === "@dimforge/rapier3d-compat").freshness).toBe("active");
    expect(report.externalCandidates.every((entry: { packageAudit?: unknown }) => Boolean(entry.packageAudit))).toBe(true);
    expect(report.externalCandidates.every((entry: { packageAudit: { security: { vulnerable: boolean } } }) => entry.packageAudit.security.vulnerable === false)).toBe(true);
    expect(report.claimBoundary).toContain("selected ownership");
  });

  it("requires an ADR for every new package source file after the Phase 1 lock", () => {
    const report = JSON.parse(readFileSync("tests/reports/final-subsystem-ownership.json", "utf8"));
    expect(report.architectureLock.missingAdrMappings).toEqual([]);
    expect(report.architectureLock.baselineCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});
