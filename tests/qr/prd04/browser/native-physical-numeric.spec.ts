/**
 * Phase B only. This suite executes a real WebGPU compute pass. The candidate
 * measurement is separate from the deliberately incomplete renderer gate.
 */
import { expect, test, type Page } from "@playwright/test";
import { startPrd04DevServer, type ExampleDevServer } from "../dev-server";
import { PHYSICAL_CATEGORIES } from "../oracles/native-physical-cases";

type Report = {
  status: "completed" | "unsupported" | "error";
  reason?: string;
  evidence?: string;
  categories?: string[];
  measurements?: Array<{ id: string; mapping: string; tolerance: string; comparison: { verdict: string; observed: number[] } }>;
  unmapped?: Array<{ id: string; reason: string }>;
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

test("measures independent candidates and detects the perturbed sheen control", async ({ page }) => {
  const report = await readReport(page);
  expect(report.status, report.reason).toBe("completed");
  expect(report.evidence).toContain("no renderer or pixel evidence");
  expect(report.categories).toEqual([...PHYSICAL_CATEGORIES]);
  expect(report.measurements?.length).toBeGreaterThan(0);
  expect(report.measurements?.every((sample) => sample.comparison.observed.every(Number.isFinite))).toBe(true);
  expect(report.negativeControl?.movedAwayFromReference).toBe(true);
});

test("physical-lighting renderer conformance is complete", async ({ page }) => {
  const report = await readReport(page);
  expect(report.status, report.reason).toBe("completed");
  // Do not turn diagnostic differences, unmeasured tolerance, or missing
  // shader implementations into a passing renderer claim. This assertion stays
  // red until the production integration and its independent bounds exist.
  expect(report.conformance?.status, report.conformance?.reasons.join("; ")).toBe("passed");
  expect(report.unmapped).toEqual([]);
  expect(report.measurements?.filter((sample) => sample.mapping === "different-boundary")).toEqual([]);
  expect(report.measurements?.every((sample) => sample.comparison.verdict === "within-tolerance")).toBe(true);
});
