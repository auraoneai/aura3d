import { test, expect } from "@playwright/test";
import { nonFavicon, openTool } from "./specHelpers";

// PRD-01 §17.1 S6 / §15 Phase 2 (row 01-S6), on a real WebGL2Device:
//  - blend parity: an HDR gradient background (linear 0..4) under a gradient
//    front quad, into RGBA16F, for alpha / premultiplied / additive /
//    multiply — per-pixel RGB MAD ≤ 2/255 vs three r185 (NormalBlending,
//    NormalBlending+premultipliedAlpha, AdditiveBlending, MultiplyBlending);
//  - C-04 browser conformance 4 modes × 3 backgrounds (0, 0.5, HDR 2.0): the
//    device result equals the contract factor table (`resolveBlendMode`)
//    evaluated on the CPU, within 2/255.
// The sort-order unit is tests/qr/prd01/unit/blend-sort-order.test.ts.

interface BlendModesReport {
  readonly parity: readonly { readonly mode: string; readonly mad255: number; readonly max255: number; readonly pixels: number }[];
  readonly conformance: readonly { readonly mode: string; readonly background: number; readonly expected: readonly number[]; readonly actual: readonly number[]; readonly maxDiff255: number }[];
  readonly errors: readonly string[];
}

const MODES = ["alpha", "premultiplied", "additive", "multiply"];

let report: BlendModesReport;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }, testInfo) => {
  const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  report = await openTool<BlendModesReport>(page, "tools=blend-modes&a3d-qr=core", pageErrors);
  await page.close();
});

test("blend-modes tool ran without errors", () => {
  expect(report.errors).toEqual([]);
  expect(nonFavicon(pageErrors)).toEqual([]);
  expect(report.parity.map((row) => row.mode)).toEqual(MODES);
  expect(report.conformance).toHaveLength(12);
});

for (const mode of MODES) {
  test(`${mode}: MAD ≤ 2/255 vs three over the HDR gradient`, () => {
    const row = report.parity.find((entry) => entry.mode === mode);
    expect(row).toBeDefined();
    test.info().annotations.push({ type: "metric", description: `${mode} mad=${row!.mad255.toFixed(3)}/255 max=${row!.max255.toFixed(3)}/255 pixels=${row!.pixels}` });
    expect(row!.pixels).toBeGreaterThan(0);
    expect(row!.mad255).toBeLessThanOrEqual(2);
  });

  test(`${mode}: C-04 conformance on 3 backgrounds (device = contract table)`, () => {
    const rows = report.conformance.filter((entry) => entry.mode === mode);
    expect(rows.map((entry) => entry.background)).toEqual([0, 0.5, 2]);
    for (const entry of rows) {
      test.info().annotations.push({ type: "metric", description: `${mode} bg=${entry.background} expected=${entry.expected.map((v) => v.toFixed(4)).join(",")} actual=${entry.actual.map((v) => v.toFixed(4)).join(",")}` });
      expect(entry.maxDiff255).toBeLessThanOrEqual(2);
    }
  });
}
