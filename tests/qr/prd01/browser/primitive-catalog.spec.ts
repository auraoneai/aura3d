import { test, expect } from "@playwright/test";
import { nonFavicon, openTool, shotPair, type QrTools } from "./specHelpers";

// PRD-01 §17.1 S3 / §15 Phase 1 (row 01-S3), flag on (`a3d-qr=core`):
//  - per-primitive mask IoU ≥ 0.98 vs three r185 geometry of the same C-07
//    parameters (unlit white on black, same camera);
//  - cylinder cap IoU ≥ 0.97, cap luma within ±10 % of three, cap normal
//    within 10° of +Y (estimated from symmetric 30° tilted-light renders under
//    operator `none`, see metrics/shapeMetrics.ts `capAnalysis`);
//  - sphere silhouette faceting: max radial deviation from a fitted circle
//    ≤ 0.5 px;
//  - 685 boxes produce 1 geometry upload: the live device buffer count of a
//    685-box scene equals that of a 1-box scene (shared geometry).
// Thresholds are the PRD's; a failure here is a lane-01 fix item, not a spec bug.

const FLAGS = "core";
const SHAPES = ["box", "sphere", "plane", "cylinder", "capsule", "torus"] as const;

interface PrimitiveReport {
  readonly setOutputPresent: boolean;
  readonly liveBuffersOne?: number | null;
  readonly liveBuffersMany?: number | null;
  readonly bufferCreatesOne?: number | null;
  readonly bufferCreatesMany?: number | null;
  readonly drawCallsMany?: number | null;
  readonly errors: readonly string[];
}

for (const shape of SHAPES) {
  test(`${shape}: mask IoU ≥ 0.98 vs three (a3d-qr=${FLAGS})`, async ({ page }) => {
    const pageErrors: string[] = [];
    const report = await openTool<PrimitiveReport>(page, `tools=primitive&shape=${shape}&look=mask&a3d-qr=${FLAGS}`, pageErrors);
    expect(report.errors).toEqual([]);
    expect(report.setOutputPresent).toBe(true);
    const { aura, three } = await shotPair(page);
    const result = await page.evaluate(async ([a, b]) => {
      const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
      return tools.metrics.maskIoU(await tools.decodePng(a!), await tools.decodePng(b!), { tolerance: 24 });
    }, [aura, three]);
    test.info().annotations.push({ type: "metric", description: `${shape} iou=${result.iou.toFixed(4)} coverage aura=${result.coverageA.toFixed(4)} three=${result.coverageB.toFixed(4)}` });
    expect(result.coverageB).toBeGreaterThan(0.005);
    expect(result.iou).toBeGreaterThanOrEqual(0.98);
    expect(nonFavicon(pageErrors)).toEqual([]);
  });
}

test(`sphere silhouette: max radial deviation ≤ 0.5 px (a3d-qr=${FLAGS})`, async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<PrimitiveReport>(page, `tools=primitive&shape=sphere&look=mask&a3d-qr=${FLAGS}`, pageErrors);
  expect(report.errors).toEqual([]);
  const { aura, three } = await shotPair(page);
  const fits = await page.evaluate(async ([a, b]) => {
    const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
    return {
      aura: tools.metrics.silhouetteCircleFit(await tools.decodePng(a!)),
      three: tools.metrics.silhouetteCircleFit(await tools.decodePng(b!))
    };
  }, [aura, three]);
  test.info().annotations.push({
    type: "metric",
    description: `aura r=${fits.aura.radius.toFixed(2)} max=${fits.aura.maxDeviationPx.toFixed(3)} rms=${fits.aura.rmsDeviationPx.toFixed(3)}; three r=${fits.three.radius.toFixed(2)} max=${fits.three.maxDeviationPx.toFixed(3)}`
  });
  expect(fits.aura.points).toBeGreaterThan(100);
  expect(fits.aura.radius).toBeGreaterThan(40);
  expect(fits.aura.maxDeviationPx).toBeLessThanOrEqual(0.5);
  expect(nonFavicon(pageErrors)).toEqual([]);
});

test(`cylinder cap: IoU ≥ 0.97, luma ±10 %, normal ≤ 10° of +Y (a3d-qr=${FLAGS})`, async ({ page }) => {
  const shots: Record<string, { aura: string; three: string }> = {};
  const pageErrors: string[] = [];
  for (const light of ["top", "+x", "-x", "+z", "-z"]) {
    const report = await openTool<PrimitiveReport>(page, `tools=primitive&shape=cylinder&look=cap&light=${encodeURIComponent(light)}&a3d-qr=${FLAGS}`, pageErrors);
    expect(report.errors).toEqual([]);
    expect(report.setOutputPresent).toBe(true);
    shots[light] = await shotPair(page);
  }
  const caps = await page.evaluate(async (all) => {
    const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
    const decode = async (side: "aura" | "three") =>
      Promise.all(["top", "+x", "-x", "+z", "-z"].map((light) => tools.decodePng(all[light]![side])));
    const [aTop, aPx, aMx, aPz, aMz] = await decode("aura");
    const [tTop, tPx, tMx, tPz, tMz] = await decode("three");
    return {
      iou: tools.metrics.iouOfMasks(tools.metrics.brightMask(aTop!, 0.5), tools.metrics.brightMask(tTop!, 0.5)),
      aura: tools.metrics.capAnalysis(aTop!, aPx!, aMx!, aPz!, aMz!),
      three: tools.metrics.capAnalysis(tTop!, tPx!, tMx!, tPz!, tMz!)
    };
  }, shots);
  const lumaRatio = caps.aura.capLuma / caps.three.capLuma;
  test.info().annotations.push({
    type: "metric",
    description: `capIoU=${caps.iou.toFixed(4)} lumaRatio=${lumaRatio.toFixed(4)} auraTilt=${caps.aura.normalTiltDeg.toFixed(2)}° threeTilt=${caps.three.normalTiltDeg.toFixed(2)}° capPixels aura=${caps.aura.capPixels} three=${caps.three.capPixels}`
  });
  expect(caps.three.capPixels).toBeGreaterThan(500);
  expect(caps.iou).toBeGreaterThanOrEqual(0.97);
  expect(Math.abs(lumaRatio - 1)).toBeLessThanOrEqual(0.1);
  expect(caps.aura.normalTiltDeg).toBeLessThanOrEqual(10);
  expect(nonFavicon(pageErrors)).toEqual([]);
});

test(`685 boxes → 1 geometry upload (a3d-qr=${FLAGS})`, async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<PrimitiveReport>(page, `tools=box-uploads&a3d-qr=${FLAGS}`, pageErrors, 180_000);
  test.info().annotations.push({ type: "metric", description: JSON.stringify(report) });
  expect(report.errors).toEqual([]);
  expect(report.drawCallsMany ?? 0).toBeGreaterThan(0);
  expect(report.liveBuffersOne).not.toBeNull();
  expect(report.liveBuffersMany).not.toBeNull();
  // Shared geometry per parameter set: 684 more boxes create no more device buffers.
  expect(report.liveBuffersMany! - report.liveBuffersOne!).toBe(0);
  expect(nonFavicon(pageErrors)).toEqual([]);
});
