import type {} from "./hud-layout-harness";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * HUD layout gate (PRD-09 §6.10/§15): the three route fixtures' widget lists
 * must mount on the shared kit inside the anchor slots, render every widget
 * into `snapshot()`, stay under each route's screen-fraction budget (15%
 * desktop, 22% mobile), keep the canvas layer at ≥95%/≥70% viewport coverage,
 * and show zero §6.10 banned player-facing tokens while playing.
 */

type HarnessReport = {
  status: "ready" | "error";
  error?: string;
  reports: Array<{
    name: string;
    widgetCount: number;
    anchors: Record<string, string[]>;
    widgetRects: Record<string, { x: number; y: number; w: number; h: number }>;
    screenFraction: number;
    canvasCoverage: number;
    domText: string;
  }>;
};

// §6.10 banned player-facing tokens (case-insensitive); "fps:" only allowed
// behind the settings show-fps toggle, which none of the fixtures enable.
const BANNED_TOKENS = [
  "evidence",
  "proof",
  "backend",
  "rapier",
  "LOS rays",
  "PROTOTYPE",
  "asset passport",
  "checksum",
  "route-health",
  "npm",
  "deploy",
  "fps:",
];

const DESKTOP_CAP = 0.15;
const MOBILE_CAP = 0.22;
const WIDGET_COUNTS: Record<string, number> = { courier: 7, "bank-shot": 6, "aura-clash": 14 };

test.describe("hud layout", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  async function runHarness(page: Page, width: number, height: number): Promise<HarnessReport> {
    await page.setViewportSize({ width, height });
    await page.goto(`${server.origin}/tests/browser/hud-layout-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_HUD__?.status !== undefined, undefined, { timeout: 15_000 });
    const result = await page.evaluate(() => window.__AURA3D_HUD__);
    expect(result?.status, result?.error).toBe("ready");
    return result as HarnessReport;
  }

  function assertCommon(report: HarnessReport, cap: number, minCoverage: number) {
    for (const fixture of report.reports) {
      expect(fixture.widgetCount, fixture.name).toBe(WIDGET_COUNTS[fixture.name]);
      expect(fixture.screenFraction, `${fixture.name} screen fraction`).toBeLessThanOrEqual(cap);
      expect(fixture.canvasCoverage, `${fixture.name} canvas coverage`).toBeGreaterThanOrEqual(minCoverage);
      for (const [id, r] of Object.entries(fixture.widgetRects)) {
        expect(r.w, `${fixture.name}:${id} width`).toBeGreaterThan(0);
        expect(r.h, `${fixture.name}:${id} height`).toBeGreaterThan(0);
      }
      for (const token of BANNED_TOKENS) {
        expect(fixture.domText.toLowerCase(), `${fixture.name} banned token "${token}"`).not.toContain(token.toLowerCase());
      }
    }
  }

  function assertAnchorMap(report: HarnessReport) {
    const courier = report.reports.find((r) => r.name === "courier")!;
    expect(courier.anchors["top"]).toContain("timer");
    expect(courier.anchors["top-right"]).toEqual(expect.arrayContaining(["score", "combo"]));
    expect(courier.anchors["center"]).toContain("nav");

    const clash = report.reports.find((r) => r.name === "aura-clash")!;
    expect(clash.anchors["top-left"]).toEqual(expect.arrayContaining(["p1-health", "p1-meter", "p1-rounds"]));
    expect(clash.anchors["top-right"]).toEqual(expect.arrayContaining(["p2-health", "p2-meter", "p2-rounds"]));
    expect(clash.anchors["left"]).toContain("combo");

    const bank = report.reports.find((r) => r.name === "bank-shot")!;
    expect(bank.anchors["bottom-right"]).toContain("strike");
    expect(bank.anchors["bottom"]).toContain("prompt");
  }

  test("desktop 1280x720: anchors, caps, coverage, banned tokens, no test hook", async ({ page }) => {
    const report = await runHarness(page, 1280, 720);
    assertCommon(report, DESKTOP_CAP, 0.95);
    assertAnchorMap(report);
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__AURA3D_GAME_TEST__)).toBe("undefined");
  });

  test("desktop 1920x1080: anchors, caps, coverage, banned tokens, no test hook", async ({ page }) => {
    const report = await runHarness(page, 1920, 1080);
    assertCommon(report, DESKTOP_CAP, 0.95);
    assertAnchorMap(report);
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__AURA3D_GAME_TEST__)).toBe("undefined");
  });

  test("mobile 390x844: rects on-screen, mobile cap, coverage, banned tokens, no test hook", async ({ page }) => {
    const report = await runHarness(page, 390, 844);
    assertCommon(report, MOBILE_CAP, 0.7);
    for (const fixture of report.reports) {
      for (const [id, r] of Object.entries(fixture.widgetRects)) {
        expect(r.x + r.w, `${fixture.name}:${id} right edge`).toBeLessThanOrEqual(390);
        expect(r.y + r.h, `${fixture.name}:${id} bottom edge`).toBeLessThanOrEqual(844);
      }
    }
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__AURA3D_GAME_TEST__)).toBe("undefined");
  });
});
