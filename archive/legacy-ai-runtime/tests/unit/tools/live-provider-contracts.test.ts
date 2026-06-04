import { describe, expect, it } from "vitest";
import { createCinematicSecretAuditReport, createLiveProviderContractsReport } from "../../../tools/live-provider-contracts/index";

describe("cinematic live provider contracts", () => {
  it("keeps fixture and mock providers deterministic and live adapters disabled by default", async () => {
    const report = await createLiveProviderContractsReport();
    expect(report.schema).toBe("a3d-cinematic-live-provider-contracts");
    expect(report.providerMode).toBe("mock");
    expect(report.backend).toBe("provider-contract");
    expect(report.pass).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.screenshots).toEqual([]);
    expect(report.adapters.map((entry) => entry.id)).toEqual(["openai", "anthropic", "gemini", "local"]);
    expect(report.adapters.every((entry) => entry.enabled === false && entry.resultOk === false && entry.networkUsed === false)).toBe(true);
  });

  it("redacts secret-looking environment values in reports", async () => {
    const report = await createLiveProviderContractsReport({
      env: {
        OPENAI_API_KEY: "test-secret-placeholder",
        A3D_AI_SCENE_PROVIDER_MODE: "mock"
      }
    });
    expect(JSON.stringify(report)).not.toContain("test-secret-placeholder");
    expect(JSON.stringify(report)).toContain("[REDACTED_SECRET]");
  });

  it("generates a cinematic secret-audit report with required release fields", () => {
    const report = createCinematicSecretAuditReport();
    expect(report.schema).toBe("a3d-cinematic-secret-audit");
    expect(typeof report.generatedAt).toBe("string");
    expect(Array.isArray(report.failures)).toBe(true);
    expect(Array.isArray(report.screenshots)).toBe(true);
    expect(report.providerMode).toBe("mock");
    expect(report.backend).toBe("static");
  });
});
