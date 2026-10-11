import { test, expect } from "@playwright/test";
import { nonFavicon, openTool } from "./specHelpers";

// PRD-01 §16.2 `dpr.spec.ts` / §17.1 S11 (row 01-S11): on a lane scene with
// no explicit `pixelRatio`, §6.9 `resolveCanvasPixelRatio` resolves
// min(devicePixelRatio, tier.maxPixelRatio); the default tier is High
// (maxPixelRatio 2). At deviceScaleFactor 1/2/3: `diagnostics().resolution`
// reports that ratio and the canvas backing is exactly ratio × the CSS box.

interface DprReport {
  readonly devicePixelRatio: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly resolution: { readonly pixelRatio?: number | null } | null;
  readonly errors: readonly string[];
}

const HIGH_TIER_MAX_PIXEL_RATIO = 2;

for (const dsf of [1, 2, 3]) {
  test.describe(`deviceScaleFactor ${dsf}`, () => {
    test.use({ deviceScaleFactor: dsf });

    test(`backing = min(${dsf}, High.maxPixelRatio) × CSS, reported in diagnostics().resolution (a3d-qr=core)`, async ({ page }) => {
      const pageErrors: string[] = [];
      const report = await openTool<DprReport>(page, "tools=dpr&a3d-qr=core", pageErrors);
      test.info().annotations.push({ type: "metric", description: JSON.stringify(report) });
      const expected = Math.min(dsf, HIGH_TIER_MAX_PIXEL_RATIO);
      expect(report.errors).toEqual([]);
      expect(report.devicePixelRatio).toBe(dsf);
      expect(report.resolution).not.toBeNull();
      expect(report.resolution!.pixelRatio).toBe(expected);
      expect(report.backingWidth).toBe(Math.round(report.cssWidth * expected));
      expect(report.backingHeight).toBe(Math.round(report.cssHeight * expected));
      expect(nonFavicon(pageErrors)).toEqual([]);
    });
  });
}
