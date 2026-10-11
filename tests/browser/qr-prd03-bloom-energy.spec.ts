import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 S9 `post-bloom-energy` (§16.1, PRD-03:2158) on the `prd03-hdr-bloom`
 * inputs: bloom has no hidden gain. Strength 2/4/8 halo energy is
 * proportional to the excess over threshold 1.0 (1/3/7) within ±10%;
 * strength 0.5 and the lit wall add ≤ 0.5% luma (below the knee window
 * [0.75, 1.25]); strength 8 leaves ≤ 2% of pixels at 255. Strength 1 sits
 * inside the knee and is reported only. The three comparison on
 * `prd03-scene18-bloom` (±15%) is a separate capture-lane check.
 * Runs on the remote browser lane (post-quality.yml, macos-14).
 */

interface BloomEnergyCase {
  readonly subject: string;
  readonly haloEnergy: number;
  readonly offEnergy: number;
  readonly addedFraction: number;
  readonly saturatedFraction: number;
}

test.describe("PRD-03 S9 — bloom energy (no hidden gain)", () => {
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let cases: Record<string, BloomEnergyCase>;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.log("[bloom-energy-pageerror]", String(err).slice(0, 300)));
    await page.goto(`${server.origin}/tests/browser/qr-prd03-bloom-energy-harness.html`);
    await page.waitForFunction(
      () => (window as { qrPrd03BloomEnergyReady?: boolean }).qrPrd03BloomEnergyReady === true,
      undefined,
      { timeout: 180_000 }
    );
    const result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03BloomEnergy?: () => Promise<{ cases: BloomEnergyCase[]; frames?: unknown }> }).runQrPrd03BloomEnergy!;
      return await run();
    });
    const frames = (result as { frames?: Record<string, { png: string; meanLuma: number; diagnostics: unknown }> }).frames ?? {};
    for (const [label, frame] of Object.entries(frames)) {
      writeFileSync(testInfo.outputPath(`${label}.png`), Buffer.from(frame.png.split(",")[1]!, "base64"));
      console.log(`[bloom-energy-frame] ${label} meanLuma=${frame.meanLuma.toFixed(2)} ${JSON.stringify(frame.diagnostics).slice(0, 1500)}`);
    }
    console.log("[bloom-energy]", JSON.stringify(result.cases));
    cases = Object.fromEntries(result.cases.map((c) => [c.subject, c]));
    await page.close();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("strength 2/4/8: halo energy ∝ excess (1:3:7) within ±10%", () => {
    const e2 = cases["sphere-2"]!.haloEnergy;
    expect(e2).toBeGreaterThan(0);
    // Normalize by the strength-2 halo (excess 1).
    expect(cases["sphere-4"]!.haloEnergy / e2).toBeGreaterThanOrEqual(3 * 0.9);
    expect(cases["sphere-4"]!.haloEnergy / e2).toBeLessThanOrEqual(3 * 1.1);
    expect(cases["sphere-8"]!.haloEnergy / e2).toBeGreaterThanOrEqual(7 * 0.9);
    expect(cases["sphere-8"]!.haloEnergy / e2).toBeLessThanOrEqual(7 * 1.1);
  });

  test("below the knee: strength 0.5 and the lit wall add ≤ 0.5% luma", () => {
    expect(cases["sphere-0.5"]!.offEnergy).toBeGreaterThan(0);
    expect(cases["wall"]!.offEnergy).toBeGreaterThan(0);
    expect(cases["sphere-0.5"]!.addedFraction).toBeLessThanOrEqual(0.005);
    expect(cases["wall"]!.addedFraction).toBeLessThanOrEqual(0.005);
  });

  test("strength 8: ≤ 2% of pixels at 255", () => {
    expect(cases["sphere-8"]!.saturatedFraction).toBeLessThanOrEqual(0.02);
  });
});
