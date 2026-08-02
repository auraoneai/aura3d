import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface CaseResult {
  readonly id: string;
  readonly jointCount: number;
  readonly palettePath: string;
  readonly extraInfluences: boolean;
  readonly drawCalls: number;
  readonly changedPixelFraction: number;
  readonly restNonBackgroundPixels: number;
  readonly posedNonBackgroundPixels: number;
  readonly pass: boolean;
  readonly reason: string;
}

const reportDir = "tests/reports/skinning-over-cap";

test.describe("over-cap and eight-influence skinning", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders real pixels from data-texture palettes and second influence sets", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/skinning-over-cap-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as Record<string, unknown>;
      return Boolean(scope.__AURA3D_SKINNING_OVER_CAP__ || scope.__AURA3D_SKINNING_OVER_CAP_ERROR__);
    }, undefined, { timeout: 90_000 });

    const harnessError = await page.evaluate(() => (window as unknown as Record<string, string | undefined>).__AURA3D_SKINNING_OVER_CAP_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const evidence = await page.evaluate(() => (window as unknown as Record<string, { readonly cases: readonly CaseResult[]; readonly pass: boolean }>).__AURA3D_SKINNING_OVER_CAP__);

    mkdirSync(resolve(reportDir), { recursive: true });
    await page.screenshot({ path: `${reportDir}/skinning-over-cap.png`, fullPage: true });
    writeFileSync(resolve(`${reportDir}/skinning-over-cap.json`), `${JSON.stringify({
      schema: "aura3d-skinning-over-cap/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves that joint palettes above the uniform-array limit upload as RGBA32F data textures and deform real pixels, and that a second JOINTS_1/WEIGHTS_1 influence set moves geometry the first four influences cannot. Does not claim Three.js skinning parity.",
      ...evidence
    }, null, 2)}\n`);

    const byId = new Map(evidence.cases.map((entry) => [entry.id, entry]));

    // Over-cap palettes must take the data-texture path and still deform.
    const overCap = byId.get("over-cap-data-texture");
    expect(overCap?.palettePath).toBe("data-texture");
    expect(overCap?.pass, overCap?.reason).toBe(true);

    // Control: below the limit the uniform path is used, proving the selection is real
    // rather than the data-texture path being taken unconditionally.
    const withinCap = byId.get("within-cap-uniform-array");
    expect(withinCap?.palettePath).toBe("uniform-array");
    expect(withinCap?.pass, withinCap?.reason).toBe(true);

    // The eight-influence quad carries zero weight in its first four influences, so a
    // four-influence shader could not move it at all.
    const eightInfluence = byId.get("eight-influence");
    expect(eightInfluence?.extraInfluences).toBe(true);
    expect(eightInfluence?.pass, eightInfluence?.reason).toBe(true);

    // Both features active simultaneously.
    const combined = byId.get("eight-influence-over-cap");
    expect(combined?.palettePath).toBe("data-texture");
    expect(combined?.extraInfluences).toBe(true);
    expect(combined?.pass, combined?.reason).toBe(true);

    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
