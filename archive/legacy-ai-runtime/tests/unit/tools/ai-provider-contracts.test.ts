import { describe, expect, it } from "vitest";
import { createAIProviderContractsReport } from "../../../tools/ai-provider-contracts/index";

describe("ai provider contracts report", () => {
  it("proves no-key mock mode and server-side adapter defaults", async () => {
    const report = await createAIProviderContractsReport();
    expect(report.schema).toBe("a3d-ai-provider-contracts");
    expect(report.providerMode).toBe("mock");
    expect(report.networkUsed).toBe(false);
    expect(report.pass).toBe(true);
    expect(report.adapters.map((entry) => entry.id)).toEqual(["openai", "anthropic", "gemini", "local"]);
    expect(report.adapters.every((entry) => entry.resultOkWithoutTransport === false)).toBe(true);
  });
});
