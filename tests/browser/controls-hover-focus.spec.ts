import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface HoverFocusEvidence {
  readonly hoverTone: string;
  readonly hoverEntries: number;
  readonly changedPlainToHover: number;
  readonly hoverBlueFraction: number;
  readonly changedHoverToSelected: number;
  readonly focusDistance: number;
  readonly focusExpected: number;
  readonly focusCentroidX: number;
  readonly focusCentroidY: number;
  readonly focusStrayPixels: number;
  readonly pass: boolean;
}

const reportDir = "tests/reports/controls-hover-focus";

test.describe("controls hover outline and focus frame", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("hover outline changes pixels and focus framing centers the pick", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/controls-hover-focus-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as Record<string, unknown>;
      return Boolean(scope.__AURA3D_HOVER_FOCUS__ || scope.__AURA3D_HOVER_FOCUS_ERROR__);
    }, undefined, { timeout: 120_000 });

    const harnessError = await page.evaluate(
      () => (window as unknown as Record<string, string | undefined>).__AURA3D_HOVER_FOCUS_ERROR__
    );
    if (harnessError) throw new Error(harnessError);

    const evidence = await page.evaluate(
      () => (window as unknown as Record<string, HoverFocusEvidence>).__AURA3D_HOVER_FOCUS__
    );

    mkdirSync(resolve(reportDir), { recursive: true });
    await page.screenshot({ path: `${reportDir}/controls-hover-focus.png`, fullPage: true });
    writeFileSync(resolve(`${reportDir}/controls-hover-focus.json`), `${JSON.stringify({
      schema: "aura3d-controls-hover-focus/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves the controls HoverOutline decision changes rendered pixels (hover and selected tones) and that frameSelection centers the picked object at the expected distance. Does not claim a full editor outline post-process pass.",
      ...evidence
    }, null, 2)}\n`);

    // Hover decision from the real picking layer.
    expect(evidence.hoverTone).toBe("hover");
    expect(evidence.hoverEntries).toBe(1);
    // The outline is real rendered geometry, not a data structure.
    expect(evidence.changedPlainToHover).toBeGreaterThan(150);
    expect(evidence.hoverBlueFraction).toBeGreaterThan(0.5);
    // Selecting re-tones the same outline.
    expect(evidence.changedHoverToSelected).toBeGreaterThan(40);
    // Focus framing matches the analytic distance and centers the pick.
    expect(evidence.focusDistance).toBeCloseTo(evidence.focusExpected, 6);
    expect(Math.abs(evidence.focusCentroidX - 128)).toBeLessThan(256 * 0.08);
    expect(Math.abs(evidence.focusCentroidY - 128)).toBeLessThan(256 * 0.08);
    expect(evidence.focusStrayPixels).toBe(0);

    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
