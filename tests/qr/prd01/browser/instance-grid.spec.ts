import { test, expect } from "@playwright/test";
import { nonFavicon, openTool, shotPair, type QrTools } from "./specHelpers";

// PRD-01 §17.1 S4 / §15 Phase 1 (row 01-S4) browser half: an instanced grid
// composed `world · instance · geometry` (20×20 boxes, spacing 0.5, each
// instance rotated 45° about Y with scale [1, 2, 0.5] and size 0.2) covers the
// same screen area as three r185's InstancedMesh of the same transforms:
// mask coverage within ±5 % of three, flag on. The unit half is
// tests/unit/contracts/impl/prd01-geometry.test.ts.

interface GridReport {
  readonly setOutputPresent: boolean;
  readonly errors: readonly string[];
}

test("instance grid mask coverage within ±5 % of three (a3d-qr=core)", async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<GridReport>(page, "tools=instance-grid&a3d-qr=core", pageErrors);
  expect(report.errors).toEqual([]);
  expect(report.setOutputPresent).toBe(true);
  const { aura, three } = await shotPair(page);
  const result = await page.evaluate(async ([a, b]) => {
    const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
    return tools.metrics.maskIoU(await tools.decodePng(a!), await tools.decodePng(b!), { tolerance: 24 });
  }, [aura, three]);
  const ratio = result.coverageA / result.coverageB;
  test.info().annotations.push({
    type: "metric",
    description: `coverage aura=${result.coverageA.toFixed(4)} three=${result.coverageB.toFixed(4)} ratio=${ratio.toFixed(4)} iou=${result.iou.toFixed(4)} centroidΔ=${result.centroidDeltaPx.toFixed(2)}px`
  });
  expect(result.coverageB).toBeGreaterThan(0.01);
  expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.05);
  expect(nonFavicon(pageErrors)).toEqual([]);
});
