import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART D2 smart-city adoption lock (muse3jsparity-PRD): the public
 * Smart City route renders scatter-planned green corridors and carries a
 * scatter frame-budget decision in its route evidence. Strengthens (never
 * weakens) the route-health gates in `showcase-smart-city-optimization`.
 */

const REPORT_PATH = "tests/reports/smart-city-scatter-adoption.json";
const ARTIFACTS = {
  command: "tests/reports/smart-city-scatter-adoption/command.png",
} as const;

test.describe("smart-city scatter + budget adoption (PART D2)", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("route evidence carries the scatter plan and frame-budget decision", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/showcase-smart-city-control/`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__?.status === "ready",
      undefined,
      { timeout: 120_000 }
    );

    const evidence = await page.evaluate(() => window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__);
    const corridor = evidence?.diagnostics?.scatterCorridor as
      | {
          readonly plan: { readonly admittedInstances: number; readonly culledInstances: number; readonly withinBudget: boolean; readonly windStrength: number };
          readonly admission: { readonly candidates: number; readonly submitted: number; readonly culled: number; readonly maxSubmittedDistance: number; readonly minShedDistance: number; readonly cullDistance: number };
          readonly budget: { readonly draws: number; readonly triangles: number; readonly overBudget: boolean; readonly appliedAction: string };
          readonly admittedTrees: number;
        }
      | undefined;
    mkdirSync(resolve("tests/reports/smart-city-scatter-adoption"), { recursive: true });
    writeFileSync(resolve(REPORT_PATH), `${JSON.stringify({ corridor, pageErrors }, null, 2)}\n`);
    await page.locator("#aura-stage").screenshot({ path: resolve(ARTIFACTS.command) });

    expect(pageErrors).toEqual([]);
    expect(corridor).toBeDefined();
    if (!corridor) return;
    // Scatter plan adopted: 168 candidates, 120 admitted, 48 culled.
    expect(corridor.plan.admittedInstances).toBe(120);
    expect(corridor.plan.culledInstances).toBe(48);
    expect(corridor.plan.withinBudget).toBe(true);
    expect(corridor.plan.windStrength).toBeGreaterThan(0);
    expect(corridor.admission.candidates).toBe(168);
    expect(corridor.admission.submitted).toBe(120);
    expect(corridor.admittedTrees).toBe(120);
    // Sorted admission inside the cull distance.
    expect(corridor.admission.maxSubmittedDistance).toBeLessThanOrEqual(corridor.admission.cullDistance);
    expect(corridor.admission.minShedDistance).toBeGreaterThanOrEqual(corridor.admission.maxSubmittedDistance);
    // Budget enforcer adopted: exact box-topology subsystem budget holds.
    expect(corridor.budget.triangles).toBe(120 * 2 * 12);
    expect(corridor.budget.overBudget).toBe(false);
    expect(corridor.budget.appliedAction).toBe("none");
    // Route systems name the adoption.
    expect(evidence?.systems).toContain("scatter-planned green corridors (planScatterInstances + wind pose)");
    expect(evidence?.systems).toContain("scatter frame-budget telemetry (enforceFrameBudget with canopy shed)");
  });
});
