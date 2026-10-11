import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 S13 GTAO grounding (`prd03-ao-grounding`, fallback path) and S12
 * god-ray shafts (`prd03-night-fog-banding` 25b) on the flag-on v2 chain.
 * Pixel criteria from PRD-03:2161/2164; the scenes and masks are built in
 * `qr-prd03-ao-godrays-harness.ts`. Runs on the remote browser lane
 * (post-quality.yml, macos-14).
 */

interface AoResult { contactDarkening?: number; openChange?: number; bandPixels?: number; openPixels?: number; error?: string }
interface ShaftResult { shaftAdded?: number; occludedAdded?: number; readPixelsDuringSteps?: number; shaftPixels?: number; pillarPixels?: number; error?: string }

test.describe("PRD-03 S12/S13 — GTAO grounding and god-ray shafts", () => {
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let ao: AoResult;
  let godrays: ShaftResult;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.log("[ao-godrays-pageerror]", String(err).slice(0, 300)));
    await page.goto(`${server.origin}/tests/browser/qr-prd03-ao-godrays-harness.html`);
    await page.waitForFunction(
      () => (window as { qrPrd03AoGodraysReady?: boolean }).qrPrd03AoGodraysReady === true,
      undefined,
      { timeout: 180_000 }
    );
    const result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03AoGodrays?: () => Promise<{ ao: AoResult; godrays: ShaftResult; frames?: unknown }> }).runQrPrd03AoGodrays!;
      return await run();
    });
    const frames = (result as { frames?: Record<string, { png: string; meanLuma: number; diagnostics: unknown }> }).frames ?? {};
    for (const [label, frame] of Object.entries(frames)) {
      // PNG per render under test-results (uploaded on always()) + the post state.
      const file = testInfo.outputPath(`${label}.png`);
      writeFileSync(file, Buffer.from(frame.png.split(",")[1]!, "base64"));
      console.log(`[ao-godrays-frame] ${label} meanLuma=${frame.meanLuma.toFixed(2)} ${JSON.stringify(frame.diagnostics).slice(0, 1500)}`);
    }
    console.log("[ao-godrays]", JSON.stringify({ ao: result.ao, godrays: result.godrays }));
    ao = result.ao;
    godrays = result.godrays;
    await page.close();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("S13: contact band ≥ 15% darker with AO; open floor changes ≤ 2%", () => {
    expect(ao.error ?? null).toBeNull();
    expect(ao.bandPixels!).toBeGreaterThan(100);
    expect(ao.openPixels!).toBeGreaterThan(100);
    expect(ao.contactDarkening!).toBeGreaterThanOrEqual(0.15);
    expect(ao.openChange!).toBeLessThanOrEqual(0.02);
  });

  test("S12 25b: shafts add ≥ 3% luma, the occluded pillar mask ≤ 0.5%, zero readPixels", () => {
    expect(godrays.error ?? null).toBeNull();
    expect(godrays.shaftPixels!).toBeGreaterThan(100);
    expect(godrays.pillarPixels!).toBeGreaterThan(100);
    expect(godrays.shaftAdded!).toBeGreaterThanOrEqual(0.03);
    expect(godrays.occludedAdded!).toBeLessThanOrEqual(0.005);
    expect(godrays.readPixelsDuringSteps).toBe(0);
  });
});
