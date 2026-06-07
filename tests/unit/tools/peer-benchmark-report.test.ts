import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface PeerBenchmarkReport {
  readonly schema: string;
  readonly status: string;
  readonly scope: string;
  readonly metricsSource: {
    readonly path: string;
    readonly sha256: string;
    readonly byteSize: number;
    readonly metrics: Record<string, number>;
  };
  readonly screenshots: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly byteSize: number;
    readonly role: string;
  }[];
  readonly claimBoundary: readonly string[];
}

describe("Aura3D peer benchmark report", () => {
  it("references current metrics and screenshot artifacts without overclaiming external-engine parity", () => {
    const reportPath = resolve("benchmark/results/aura3d-106-peer-benchmark-report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as PeerBenchmarkReport;

    expect(report.schema).toBe("aura3d-peer-benchmark-report/v1");
    expect(report.status).toBe("scoped-pass");
    expect(report.scope).toContain("not Unity or Unreal parity evidence");
    expect(report.metricsSource.metrics).toMatchObject({
      auraDrawCalls: 333,
      auraNonDarkPixels: 45866,
      threeChildren: 75,
      threeNonDarkPixels: 13289
    });
    expect(report.screenshots.length).toBeGreaterThanOrEqual(3);

    for (const artifact of [report.metricsSource, ...report.screenshots]) {
      const bytes = readFileSync(resolve(artifact.path));
      expect(statSync(resolve(artifact.path)).size).toBe(artifact.byteSize);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256);
    }

    const serialized = JSON.stringify(report).toLowerCase();
    expect(serialized).not.toContain("beats unity");
    expect(serialized).not.toContain("beats unreal");
    expect(serialized).not.toContain("production parity");
    expect(report.claimBoundary.join(" ")).toContain("must include their own screenshot hashes and runner metrics");
  });
});
