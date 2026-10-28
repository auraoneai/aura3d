import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { EXPOSURE_CASES, expectedLinear, threeAcesLuma255 } from "./exposure-reference";

const reportDir = process.env.EXPOSURE_REPORT_DIR ?? "tests/reports/exposure-calibration";
// Direct-light linear output must land within this ratio of the three r185 value (PRD Q1 asks for 10%; the unit fixture holds 3%).
const LINEAR_TOLERANCE = Number(process.env.EXPOSURE_LINEAR_TOLERANCE ?? "0.03");

interface Capture { id: string; toneMapping: string; meanLinear: [number, number, number]; meanSrgb: [number, number, number]; meanLuma: number; warnings: string[] }

test.describe("exposure calibration (Aura3D vs the three r185 light convention)", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("same nominal lights give the same linear output and ACES luma as three", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/exposure-calibration-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __EXPOSURE__?: unknown }).__EXPOSURE__), undefined, { timeout: 60_000 });
    const rows: Array<{ id: string; expectedLinear: number[]; expectedAcesLuma: number; linear: Capture; aces: Capture }> = [];
    for (const c of EXPOSURE_CASES) {
      const call = (tm: string) => page.evaluate(([cc, t]) => (window as unknown as { __EXPOSURE__: { render(a: unknown, b: string): Promise<unknown> } }).__EXPOSURE__.render(cc, t as string), [c, tm] as const) as Promise<Capture>;
      const linear = await call("linear");
      const aces = await call("aces");
      const exp = expectedLinear(c);
      rows.push({ id: c.id, expectedLinear: exp, expectedAcesLuma: threeAcesLuma255(exp), linear, aces });
      console.log(`EXPOSURE_JSON ${JSON.stringify(rows[rows.length - 1])}`);
    }
    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(reportDir, "exposure-calibration.json"), JSON.stringify({ rows, errors }, null, 2));

    for (const row of rows) {
      expect(row.linear.warnings, `${row.id} console`).toEqual([]);
      // A scene with no lights keeps the category environment on purpose (three renders black there); recorded, not asserted.
      if (row.id.startsWith("none")) continue;
      const ratio = row.linear.meanLinear.map((v, i) => v / Math.max(row.expectedLinear[i]!, 1e-6));
      for (const r of ratio) expect(Math.abs(r - 1), `${row.id} linear ratio ${ratio.map((x) => x.toFixed(3)).join("/")}`).toBeLessThanOrEqual(LINEAR_TOLERANCE);
      expect(Math.abs(row.aces.meanLuma / row.expectedAcesLuma - 1), `${row.id} aces luma ${row.aces.meanLuma} vs ${row.expectedAcesLuma.toFixed(1)}`).toBeLessThanOrEqual(0.1);
    }
  });
});
