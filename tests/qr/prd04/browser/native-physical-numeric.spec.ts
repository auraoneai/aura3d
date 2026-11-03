/**
 * Phase B only. This suite executes a real WebGPU compute pass over the
 * production physical shader functions and applies the source-defined
 * conformance gate (evaluateNativePhysicalConformance).
 */
import { expect, test, type Page } from "@playwright/test";
import { startPrd04DevServer, type ExampleDevServer } from "../dev-server";
import { PHYSICAL_CATEGORIES } from "../oracles/native-physical-cases";

type Report = {
  status: "completed" | "unsupported" | "error";
  reason?: string;
  evidence?: string;
  categories?: string[];
  measurements?: Array<{ id: string; mapping: string; tolerance: { absolute: number; relative: number; rationale: string }; comparison: { verdict: string; observed: number[] } }>;
  unmapped?: Array<{ id: string; reason: string; contract: string; productionFunction: string }>;
  negativeControl?: { movedAwayFromReference: boolean };
  conformance?: { status: string; reasons: string[] };
};

let server: ExampleDevServer;
test.beforeAll(async () => { server = await startPrd04DevServer(); });
test.afterAll(async () => { await server?.close(); });

async function readReport(page: Page): Promise<Report> {
  await page.goto(`${server.origin}/tests/qr/prd04/browser/native-physical-numeric.html`);
  await page.waitForFunction(() => "__AURA_NATIVE_PHYSICAL_NUMERIC__" in window);
  return page.evaluate(() => window.__AURA_NATIVE_PHYSICAL_NUMERIC__ as Report);
}

test("measures production shader functions and detects the perturbed sheen control", async ({ page }) => {
  const report = await readReport(page);
  expect(report.status, report.reason).toBe("completed");
  expect(report.evidence).toContain("no frame or pixel evidence");
  expect(report.categories).toEqual([...PHYSICAL_CATEGORIES]);
  expect(report.measurements?.length).toBeGreaterThan(0);
  expect(report.measurements?.every((sample) => sample.comparison.observed.every(Number.isFinite))).toBe(true);
  expect(report.negativeControl?.movedAwayFromReference).toBe(true);
});

test("physical-lighting renderer conformance is complete", async ({ page }) => {
  const report = await readReport(page);
  expect(report.status, report.reason).toBe("completed");
  // Every mapped probe must be within its stated f32/filtering bound, and every
  // sample the production shader does not compute must carry an explicit
  // model-difference contract naming the production function.
  expect(report.conformance?.status, report.conformance?.reasons.join("; ")).toBe("passed");
  expect(report.unmapped?.every((entry) => entry.contract === "documented-model-difference" && entry.productionFunction.length > 0)).toBe(true);
  expect(report.measurements?.filter((sample) => sample.mapping === "different-boundary")).toEqual([]);
  expect(report.measurements?.every((sample) => sample.comparison.verdict === "within-tolerance")).toBe(true);
});
