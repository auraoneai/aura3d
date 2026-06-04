import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAISceneClaimScanReport } from "../../../tools/ai-scene-claim-scan";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-ai-scene-claims-"));
  mkdirSync(join(root, "docs", "ai-scene"), { recursive: true });
  writeFileSync(join(root, "RuntimeScenePRD.md"), [
    "# Aura3D runtime scene PRD",
    "Do not require API keys for local development, route health, or CI.",
    "Aura3D gives AI models a real-time 3D world engine."
  ].join("\n"));
  return root;
}

describe("tools/ai-scene-claim-scan", () => {
  it("allows scoped blocked-claim examples from runtime-scene PRD", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "docs", "ai-scene", "security-and-secrets.md"), "Do not require OpenAI API keys for CI.\n");

    const report = createAISceneClaimScanReport({ root });

    expect(report.schema).toBe("a3d-ai-scene-claim-scan");
    expect(report.pass).toBe(true);
    expect(report.networkUsed).toBe(false);
    expect(report.blockedClaims).toEqual([]);
    expect(report.providerMode).toBe("mock");
  });

  it("blocks unscoped provider replacement and final-quality claims", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "README.md"), "Aura3D replaces OpenAI and generates final cinematic quality.\n");

    const report = createAISceneClaimScanReport({
      root,
      env: {
        A3D_AI_SCENE_PROVIDER_MODE: "live",
        ANTHROPIC_API_KEY: "sk-ant-secret-should-not-leak"
      }
    });

    expect(report.pass).toBe(false);
    expect(report.providerMode).toBe("live");
    expect(report.inputs.environment.ANTHROPIC_API_KEY).toBe("[REDACTED_SECRET]");
    expect(JSON.stringify(report)).not.toContain("sk-ant-secret-should-not-leak");
    expect(report.blockedClaims.map((entry) => entry.claim)).toEqual(expect.arrayContaining([
      "Aura3D replaces AI model providers.",
      "Aura3D generates final cinematic quality by default."
    ]));
  });
});
