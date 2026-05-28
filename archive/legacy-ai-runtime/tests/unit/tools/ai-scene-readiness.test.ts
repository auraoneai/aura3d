import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAISceneReadinessReport, redactReport, redactSecrets } from "../../../tools/ai-scene-readiness";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-ai-scene-readiness-"));
  writeFileSync(join(root, "RuntimeScenePRD.md"), [
    "# Aura3D runtime scene PRD",
    "Do not compete with OpenAI, Anthropic, Gemini, or local models.",
    "Do not require network AI calls for deterministic tests.",
    "Do not require API keys for local development, route health, or CI."
  ].join("\n"));
  return root;
}

describe("tools/ai-scene-readiness", () => {
  it("creates the required no-network report shape", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "packages", "ai-scene", "src", "providers"), { recursive: true });
    mkdirSync(join(root, "apps", "aura-prompt-to-scene"), { recursive: true });
    mkdirSync(join(root, "apps", "aura-cinematic-prompt-lab"), { recursive: true });
    mkdirSync(join(root, "apps", "aura-scene-diff-editor"), { recursive: true });
    mkdirSync(join(root, "apps", "aura-shot-director"), { recursive: true });
    mkdirSync(join(root, "apps", "aura-world-builder"), { recursive: true });
    mkdirSync(join(root, "docs", "ai-scene"), { recursive: true });
    mkdirSync(join(root, "tests", "reports", "ai-scene"), { recursive: true });
    for (const path of [
      "packages/ai-scene/src/index.ts",
      "packages/ai-scene/src/AuraSceneIR.ts",
      "packages/ai-scene/src/AuraSceneCompiler.ts",
      "packages/ai-scene/src/providers/MockProvider.ts",
      "apps/aura-prompt-to-scene/index.html",
      "apps/aura-cinematic-prompt-lab/index.html",
      "apps/aura-scene-diff-editor/index.html",
      "apps/aura-shot-director/index.html",
      "apps/aura-world-builder/index.html",
      "docs/ai-scene/overview.md",
      "tests/reports/ai-scene/route-health.json",
      "tests/reports/ai-scene/claim-scan.json",
      "tests/reports/ai-scene/provider-contracts.json",
      "tests/reports/ai-scene/scene-ir-schema-audit.json",
      "tests/reports/ai-scene/prompt-to-scene-evidence.json",
      "tests/reports/ai-scene/scene-diff-audit.json",
      "tests/reports/ai-scene/cinematic-scene-report.json",
      "tests/reports/ai-scene/quality.json",
      "tests/reports/ai-scene/report-freshness.json",
      "tests/reports/ai-scene/secret-audit.json"
    ]) {
      writeFileSync(join(root, path), "{}\n");
    }

    const report = createAISceneReadinessReport({
      root,
      env: {
        A3D_AI_SCENE_PROVIDER_MODE: "mock",
        OPENAI_API_KEY: "sk-test-secret-should-not-leak"
      }
    });

    expect(report.schema).toBe("a3d-ai-scene-readiness");
    expect(report.pass).toBe(true);
    expect(report.providerMode).toBe("mock");
    expect(report.networkUsed).toBe(false);
    expect(report.inputs.environment.OPENAI_API_KEY).toBe("[REDACTED_SECRET]");
    expect(JSON.stringify(report)).not.toContain("sk-test-secret-should-not-leak");
    expect(report.evidence.every((entry) => entry.present)).toBe(true);
    expect(report.blockedClaims).toEqual([]);
    expect(report.unsupportedCases).toEqual([]);
  });

  it("reports missing AI scene artifacts as unsupported cases", () => {
    const root = fixtureRoot();

    const report = createAISceneReadinessReport({ root });

    expect(report.pass).toBe(false);
    expect(report.unsupportedCases.length).toBeGreaterThan(0);
    expect(report.unsupportedCases.map((entry) => entry.id).join("\n")).toContain("missing:packages/ai-scene/src/index.ts");
  });

  it("redacts API-key-looking values deeply", () => {
    const redacted = redactReport({
      apiKey: "sk-live-value-that-should-not-leak",
      nested: {
        prompt: "token=abc123SECRETvalue and provider key sk-another-secret-value"
      }
    });

    expect(JSON.stringify(redacted)).not.toContain("sk-live-value-that-should-not-leak");
    expect(JSON.stringify(redacted)).not.toContain("sk-another-secret-value");
    expect(redactSecrets("OPENAI_API_KEY=sk-test-secret-abcdef")).toContain("[REDACTED_SECRET]");
  });
});
