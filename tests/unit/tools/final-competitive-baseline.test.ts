import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("final competitive before baseline", () => {
  const manifest = JSON.parse(readFileSync("tests/reports/final-competitive-baseline/manifest.json", "utf8")) as {
    immutable: boolean;
    repository: { implementationStartClean: boolean; candidateCommit: string };
    metrics: { packageSourceLines: number; r12DuplicateOwnershipViolations: number };
    images: Array<{ routeId: string; beforeSha256: string; maskedSha256: string; mask: { ocrRegionCount: number } }>;
    sourceFiles: Array<{ path: string; sha256: string }>;
    artifacts: Array<{ path: string; sha256: string }>;
  };

  it("retains four exact and four text/HUD-masked before images", () => {
    expect(manifest.immutable).toBe(true);
    expect(manifest.images).toHaveLength(4);
    expect(new Set(manifest.images.map((image) => image.routeId)).size).toBe(4);
    for (const image of manifest.images) {
      expect(image.beforeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(image.maskedSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(image.maskedSha256).not.toBe(image.beforeSha256);
      expect(image.mask.ocrRegionCount).toBeGreaterThan(0);
    }
  });

  it("binds the implementation start, source, metrics, snapshots, and artifacts", () => {
    expect(manifest.repository.implementationStartClean).toBe(true);
    expect(manifest.repository.candidateCommit).toHaveLength(40);
    expect(manifest.metrics.packageSourceLines).toBeGreaterThan(0);
    expect(manifest.metrics.r12DuplicateOwnershipViolations).toBe(0);
    expect(manifest.sourceFiles.length).toBeGreaterThan(20);
    expect(manifest.artifacts.length).toBeGreaterThan(12);
  });

  it("passes the immutable artifact verifier", () => {
    const output = execFileSync("node", ["tools/final-competitive-baseline/index.mjs", "--verify"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(JSON.parse(output)).toMatchObject({ pass: true });
  });
});
