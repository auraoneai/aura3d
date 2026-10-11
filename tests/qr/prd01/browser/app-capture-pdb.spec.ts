import { test, expect } from "@playwright/test";
import { nonFavicon, openTool } from "./specHelpers";

// PRD-01 §17.1 S11 / §15 Phase 2 (row 01-S11): C-05 `app.capture()` renders a
// frame and reads it back in the same task, so it reproduces the
// `canvas.toDataURL()` image taken with `preserveDrawingBuffer: true`
// (MAD ≤ 1/255) — both from an app mounted with
// `renderer.debug.preserveDrawingBuffer: true` and from one mounted with the
// §6.9 default `preserveDrawingBuffer: false`. The real WebGL context
// attributes are asserted so each half provably ran in its mode. Flag on.

interface CapturePdbReport {
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  readonly runs: readonly {
    readonly preserveDrawingBuffer: boolean | null;
    readonly width: number;
    readonly height: number;
    readonly madVsReference: number | null;
    readonly maxDiffVsReference: number | null;
    readonly nonBlankFraction: number;
  }[];
  readonly errors: readonly string[];
}

test("app.capture() equals toDataURL with preserveDrawingBuffer true and false (a3d-qr=core)", async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<CapturePdbReport>(page, "tools=capture-pdb&a3d-qr=core", pageErrors);
  test.info().annotations.push({ type: "metric", description: JSON.stringify(report) });
  expect(report.errors).toEqual([]);
  expect(report.referenceWidth).toBeGreaterThan(0);
  expect(report.runs).toHaveLength(2);
  const [withPdb, withoutPdb] = report.runs;
  expect(withPdb!.preserveDrawingBuffer).toBe(true);
  expect(withoutPdb!.preserveDrawingBuffer).toBe(false);
  for (const run of report.runs) {
    expect(run.width).toBe(report.referenceWidth);
    expect(run.height).toBe(report.referenceHeight);
    expect(run.nonBlankFraction).toBeGreaterThan(0.9);
    expect(run.madVsReference).not.toBeNull();
    expect(run.madVsReference!).toBeLessThanOrEqual(1);
  }
  expect(nonFavicon(pageErrors)).toEqual([]);
});
