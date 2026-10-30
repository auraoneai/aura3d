import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 E-A (WP-1) phase-2 receipt: FC Munich-style scene (`interior-industrial` + background #0d1a24). Acceptance: with
 * the look `background` override the top grid row (top 1/8 of the frame) is within 10 luma of the colour's luma.
 * Remote only (tools/remote-acr/run.sh); prints `GU47_EA_BACKGROUND <json>` and writes before/after frames to
 * `artifacts/gu47-ea/` for the lane report.
 */
const BACKGROUND_LUMA = 0x0d * 0.2126 + 0x1a * 0.7152 + 0x24 * 0.0722; // about 24 (8-bit sRGB, Rec. 709 weights)

test("look background override shows the colour, not the look HDRI", async ({ page }) => {
  test.setTimeout(300_000);
  const server: ExampleDevServer = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/gu47/look-background-override.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __GU47_EA__?: unknown }).__GU47_EA__), undefined, { timeout: 60_000 });
    const out = join(process.cwd(), "artifacts", "gu47-ea");
    mkdirSync(out, { recursive: true });
    const results: Record<string, { topRowLuma: number; topRowLuma4: number; meanLuma: number }> = {};
    for (const variant of ["before", "after"] as const) {
      const capture = await page.evaluate(
        (v) => (window as unknown as { __GU47_EA__: { render(v: string): Promise<{ topRowLuma: number; topRowLuma4: number; meanLuma: number; jpeg: string }> } }).__GU47_EA__.render(v),
        variant
      );
      writeFileSync(join(out, `fc-munich-${variant}.jpg`), Buffer.from(capture.jpeg, "base64"));
      results[variant] = { topRowLuma: capture.topRowLuma, topRowLuma4: capture.topRowLuma4, meanLuma: capture.meanLuma };
    }
    console.log(`GU47_EA_BACKGROUND ${JSON.stringify({ backgroundLuma: Number(BACKGROUND_LUMA.toFixed(2)), ...results })}`);
    expect(Math.abs(results.after!.topRowLuma - BACKGROUND_LUMA)).toBeLessThanOrEqual(10);
  } finally {
    await server.close();
  }
});
