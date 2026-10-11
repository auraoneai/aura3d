import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * 03-S15 (PRD-03 §8.7 S6 DoF, §8.8 S7 motion blur) through
 * `RendererPostProcessOptions.v2`: the harness asserts the frames ran the v2
 * seam (`postGraphV2LastOutcome() === "v2"`), then measures
 *
 *  - motion blur: streak of a thin bar under the same camera pan stepped at
 *    60 fps and at 30 fps — extents within 10 %, and the streak is wider than
 *    the static bar (blur really applied);
 *  - DoF: bokeh diameter of a near-point source at 30 m with f=50 mm, N=2.8,
 *    focus 3 m on a 1080 px tall frame — 12.3 px ± 15 %.
 *
 * Metrics are written to `tests/reports/qr-prd03-s15.json` (uploaded by
 * post-quality.yml) so the remote run id carries the numbers.
 */

interface StageEvidence { readonly outcome: string; readonly stages: readonly string[]; readonly skipped: readonly string[] }
interface MotionBlurResult {
  readonly staticExtent: number;
  readonly extent60: number;
  readonly extent30: number;
  readonly relDiff: number;
  readonly evidence60: StageEvidence;
  readonly evidence30: StageEvidence;
  readonly error?: string;
}
interface DofResult {
  readonly frameHeight: number;
  readonly sourceDiameter: number;
  readonly blobDiameter: number;
  readonly bokehDiameter: number;
  readonly evidence: StageEvidence;
  readonly error?: string;
}
interface S15Result { readonly motionBlur: MotionBlurResult; readonly dof: DofResult }

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.QR_S15_OUT ?? join(here, "../reports/qr-prd03-s15.json");

test.describe("PRD-03 03-S15 — motion blur + DoF through RendererPostProcessOptions.v2", () => {
  test.describe.configure({ timeout: 300_000 });
  let server: ExampleDevServer;
  let result: S15Result;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.log("[s15-pageerror]", String(err).slice(0, 300)));
    await page.goto(`${server.origin}/tests/browser/qr-prd03-s15-mb-dof-harness.html`);
    await page.waitForFunction(
      () => (window as { qrPrd03S15Ready?: boolean }).qrPrd03S15Ready === true,
      undefined,
      { timeout: 180_000 }
    );
    result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03S15?: () => Promise<S15Result> }).runQrPrd03S15!;
      return await run();
    });
    console.log("[qr-prd03-s15]", JSON.stringify(result));
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ schema: "qr-prd03-s15/v1", ...result }, null, 2));
    await page.close();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("motion blur ran the v2 S7 stage", () => {
    expect(result.motionBlur.error ?? null).toBeNull();
    for (const evidence of [result.motionBlur.evidence60, result.motionBlur.evidence30]) {
      expect(evidence.outcome).toBe("v2");
      expect(evidence.stages).toContain("S7-motion-blur");
      expect(evidence.skipped).not.toContain("S7_VELOCITY_UNAVAILABLE");
    }
  });

  test("motion blur streak exists: wider than the static bar by ≥ 4 px", () => {
    expect(result.motionBlur.staticExtent).toBeGreaterThan(0);
    expect(result.motionBlur.extent60).toBeGreaterThanOrEqual(result.motionBlur.staticExtent + 4);
  });

  test("motion blur at 30 vs 60 fps within 10 %", () => {
    expect(result.motionBlur.relDiff).toBeLessThanOrEqual(0.1);
  });

  test("DoF ran the v2 S6 stage on a 1080 px frame", () => {
    expect(result.dof.error ?? null).toBeNull();
    expect(result.dof.evidence.outcome).toBe("v2");
    expect(result.dof.evidence.stages).toContain("S6-dof");
    expect(result.dof.frameHeight).toBe(1080);
    expect(result.dof.sourceDiameter).toBeGreaterThan(0);
  });

  test("DoF bokeh diameter 12.3 px ± 15 %", () => {
    expect(result.dof.bokehDiameter).toBeGreaterThanOrEqual(12.3 * 0.85);
    expect(result.dof.bokehDiameter).toBeLessThanOrEqual(12.3 * 1.15);
  });
});
