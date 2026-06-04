import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAISceneCompletionAuditReport } from "../../../tools/ai-scene-completion-audit";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-ai-scene-completion-"));
  mkdirSync(join(root, "tests", "reports", "ai-scene"), { recursive: true });
  return root;
}

function passingReport(schema: string): string {
  return JSON.stringify({
    schema,
    generatedAt: "2026-05-26T00:00:00.000Z",
    pass: true,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [],
      requiredReports: [],
      environment: { A3D_AI_SCENE_NETWORK: "disabled" }
    },
    evidence: [],
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases: []
  }, null, 2);
}

describe("tools/ai-scene-completion-audit", () => {
  it("passes when required AI scene reports have the required no-network shape", () => {
    const root = fixtureRoot();
    for (const [filename, schema] of [
      ["readiness.json", "a3d-ai-scene-readiness"],
      ["route-health.json", "a3d-ai-scene-route-health"],
      ["provider-contracts.json", "a3d-ai-provider-contracts"],
      ["scene-ir-schema-audit.json", "a3d-scene-ir-schema-audit"],
      ["prompt-to-scene-evidence.json", "a3d-prompt-to-scene-evidence"],
      ["scene-diff-audit.json", "a3d-scene-diff-audit"],
      ["cinematic-scene-report.json", "a3d-cinematic-scene-report"],
      ["claim-scan.json", "a3d-ai-scene-claim-scan"],
      ["quality.json", "a3d-ai-scene-quality"],
      ["report-freshness.json", "a3d-ai-scene-report-freshness"],
      ["secret-audit.json", "a3d-ai-scene-secret-audit"]
    ] as const) {
      writeFileSync(join(root, "tests", "reports", "ai-scene", filename), passingReport(schema));
    }

    const report = createAISceneCompletionAuditReport({ root });

    expect(report.schema).toBe("a3d-ai-scene-completion-audit");
    expect(report.pass).toBe(true);
    expect(report.networkUsed).toBe(false);
    expect(report.blockedClaims).toEqual([]);
    expect(report.unsupportedCases).toEqual([]);
  });

  it("fails missing reports and reports that used network", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "tests", "reports", "ai-scene", "readiness.json"), JSON.stringify({
      ...JSON.parse(passingReport("a3d-ai-scene-readiness")),
      pass: false,
      networkUsed: true,
      blockedClaims: ["OPENAI_API_KEY=sk-secret-should-not-leak"],
      unsupportedCases: [{ detail: "MockProvider missing" }]
    }, null, 2));

    const report = createAISceneCompletionAuditReport({ root });

    expect(report.pass).toBe(false);
    expect(JSON.stringify(report)).not.toContain("sk-secret-should-not-leak");
    expect(report.blockedClaims.join("\n")).toContain("[REDACTED_SECRET]");
    expect(report.unsupportedCases.map((entry) => entry.id).join("\n")).toContain("missing-report:tests/reports/ai-scene/claim-scan.json");
    expect(report.unsupportedCases.map((entry) => entry.id).join("\n")).toContain("network-used:tests/reports/ai-scene/readiness.json");
  });
});
