import { expect, test } from "@playwright/test";
import { createLiveProviderContractsReport } from "../../tools/live-provider-contracts/index";

test.describe("Gemini cinematic live provider contract", () => {
  test("returns valid IR when explicitly enabled through server-side transport", async () => {
    const report = await createLiveProviderContractsReport({ enabledProviders: ["gemini"] });
    const adapter = report.adapters.find((entry) => entry.id === "gemini");
    expect(adapter).toMatchObject({ enabled: true, resultOk: true, validIR: true, networkUsed: false });
    expect(report.pass).toBe(true);
  });
});
