import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Measures whether a vehicle asset's wheels are *visibly readable*, not merely present.
 *
 * The retained release probe already proves `turboRaceCar` submits all five primitives
 * (`drawCalls: 10` = 5 primitives x 2 passes). That is exactly why this spec exists: primitive
 * submission is not evidence of hero-vehicle fitness. This renders the asset across the azimuths a
 * hero vehicle is presented at and retains per-angle wheel-band measurements plus screenshots, so
 * role-aware admission has real rendered evidence to consume.
 */
const REPORT_DIR = "tests/reports/vehicle-wheel-visibility";
const ASSET_IDS = (process.env.AURA3D_WHEEL_VISIBILITY_ASSETS ?? "turboRaceCar")
  .split(",").map((value) => value.trim()).filter(Boolean);

interface AngleEvidence {
  readonly azimuth: number;
  readonly elevation: number;
  readonly silhouette: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly subjectPixels: number;
  readonly wheelBand: {
    readonly fraction: number;
    readonly pixels: number;
    readonly leftThird: number;
    readonly centerThird: number;
    readonly rightThird: number;
    readonly colorBuckets: number;
    readonly darkFraction: number;
  };
  readonly drawCalls: number;
}

interface WheelVisibilityEvidence {
  readonly schema: string;
  readonly asset: { readonly id: string; readonly url: string; readonly hash: string };
  readonly viewport: readonly [number, number];
  readonly runtimeBackend: string | undefined;
  readonly angles: readonly AngleEvidence[];
}

test.describe("vehicle wheel visibility diagnostic", () => {
  test.setTimeout(Math.max(180_000, ASSET_IDS.length * 90_000));

  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const assetId of ASSET_IDS) {
    test(`retains per-angle wheel-band evidence for ${assetId}`, async ({ context }) => {
      mkdirSync(resolve(REPORT_DIR), { recursive: true });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(
          `${server.origin}/tests/browser/vehicle-wheel-visibility-harness.html?asset=${assetId}`,
          { waitUntil: "domcontentloaded" }
        );
        // Screenshot each angle as the harness advances through them.
        let captured = -1;
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          const state = await page.evaluate(() => ({
            ready: (window as { __AURA3D_WHEEL_VISIBILITY_ANGLE_READY__?: number }).__AURA3D_WHEEL_VISIBILITY_ANGLE_READY__,
            done: Boolean((window as { __AURA3D_WHEEL_VISIBILITY__?: unknown }).__AURA3D_WHEEL_VISIBILITY__),
            error: (window as { __AURA3D_WHEEL_VISIBILITY_ERROR__?: string }).__AURA3D_WHEEL_VISIBILITY_ERROR__
          }));
          if (state.error) throw new Error(state.error);
          if (state.ready !== undefined && state.ready > captured) {
            captured = state.ready;
            const stage = page.locator("#probe-stage");
            await stage.screenshot({ path: resolve(REPORT_DIR, `${assetId}-angle-${captured}.png`) });
          }
          if (state.done) break;
          await page.waitForTimeout(120);
        }

        const evidence = await page.evaluate(
          () => (window as { __AURA3D_WHEEL_VISIBILITY__?: WheelVisibilityEvidence }).__AURA3D_WHEEL_VISIBILITY__
        ) as WheelVisibilityEvidence | undefined;
        expect(errors, `page errors for ${assetId}`).toEqual([]);
        expect(evidence, `wheel visibility evidence for ${assetId}`).toBeTruthy();
        const report = evidence as WheelVisibilityEvidence;
        writeFileSync(
          resolve(REPORT_DIR, `${assetId}.json`),
          `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`
        );

        // Every angle must actually have rendered a subject; otherwise the measurement is vacuous.
        for (const angle of report.angles) {
          expect(angle.drawCalls, `draw calls at azimuth ${angle.azimuth}`).toBeGreaterThan(0);
          expect(angle.subjectPixels, `subject pixels at azimuth ${angle.azimuth}`).toBeGreaterThan(2000);
        }
      } finally {
        await page.close();
      }
    });
  }
});
