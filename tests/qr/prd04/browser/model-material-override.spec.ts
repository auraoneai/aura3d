/**
 * PRD-04 §16.1 S3 — model material override.
 *
 * Subjects: `prd04-tinted-hero` (Meshy courierVanMeshyV2Decimated, color
 * "#e85d75") and `prd04-damaged-helmet` (Khronos DamagedHelmet).
 * Gates:
 *   - white tint masked SSIM >= 0.999 vs untinted Aura (override = multiply, not glow)
 *   - red tint masked Laplacian variance >= 90% of untinted Aura (maps kept)
 *   - mean R/G channel ratio rises under the red tint
 *   - shadow-side mean luma <= 1.1x untinted Aura (no emissive lift)
 *   - `inspectMaterials()` reports `baseColor` in enabledMaps
 * Control (§15.4): the same probes under flags=none must fail at least one
 * gate (legacy tint glows/flattens) — recorded to tests/reports/prd04/probes/.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";
import {
  maskedChannelRatio,
  maskedLaplacianVariance,
  maskedSsim,
  shadowQuartileLuma,
  subjectMask
} from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics";
import { loadProbe, probeFrame, type Prd04ProbePayload } from "./probe";

const capture = (scene: string, flags: string, tint: string) =>
  `/tests/qr/prd04/harness/prd04-capture.html?engine=aura3d&scene=${scene}&flags=${flags}&pixels=1&tint=${encodeURIComponent(tint)}`;

test.describe("PRD-04 S3 model material override", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04/probes/s3-tint-control.json"),
      `${JSON.stringify({ probe: "s3-tint", probes }, null, 2)}\n`
    );
    await server.close();
  });

  for (const sceneId of ["prd04-tinted-hero", "prd04-damaged-helmet"]) {
    test(`${sceneId}: tint keeps authored maps under A3D_QR_MATERIALS`, async ({ page }) => {
      const url = (flags: string, tint: string) => `${server.origin}${capture(sceneId, flags, tint)}`;
      const untinted = await loadProbe(page, url("materials", "none"));
      const white = await loadProbe(page, url("materials", "#ffffff"));
      const red = await loadProbe(page, url("materials", "#e85d75"));
      const redOff = await loadProbe(page, url("none", "#e85d75"));

      const base = probeFrame(untinted);
      const mask = subjectMask(base.pixels);
      const lapBase = maskedLaplacianVariance(base.pixels, base.width, base.height, mask);
      const shadowBase = shadowQuartileLuma(base.pixels, mask);
      const rgBase = maskedChannelRatio(base.pixels, mask, 0, 1);

      // Gate 1: white tint is a no-op on retained maps.
      const whiteFrame = probeFrame(white);
      const ssimWhite = maskedSsim(whiteFrame.pixels, base.pixels, base.width, base.height, mask);
      expect(ssimWhite, `${sceneId} white-tint masked SSIM >= 0.999`).toBeGreaterThanOrEqual(0.999);

      // Gate 2/3: red tint keeps texture detail and shifts R/G.
      const redFrame = probeFrame(red);
      const lapRed = maskedLaplacianVariance(redFrame.pixels, base.width, base.height, mask);
      const rgRed = maskedChannelRatio(redFrame.pixels, mask, 0, 1);
      const shadowRed = shadowQuartileLuma(redFrame.pixels, mask);
      expect(lapRed, `${sceneId} red-tint Laplacian >= 90% of untinted (${lapRed} vs ${lapBase})`).toBeGreaterThanOrEqual(
        0.9 * lapBase
      );
      expect(rgRed, `${sceneId} red tint raises masked R/G`).toBeGreaterThan(rgBase);
      expect(shadowRed, `${sceneId} shadow-side luma <= 1.1x`).toBeLessThanOrEqual(1.1 * shadowBase);

      // Gate 4: inspectMaterials reports the retained baseColor map.
      const inspect = ((untinted.extra ?? {}).inspectMaterials ?? []) as { enabledMaps?: readonly string[] }[];
      expect(
        inspect.some((entry) => (entry.enabledMaps ?? []).includes("baseColor")),
        `${sceneId} inspectMaterials lists baseColor`
      ).toBe(true);

      // §15.4 control: flag-off legacy tint must fail at least one gate.
      const offFrame = probeFrame(redOff);
      const lapOff = maskedLaplacianVariance(offFrame.pixels, base.width, base.height, mask);
      const shadowOff = shadowQuartileLuma(offFrame.pixels, mask);
      const controlFails = lapOff < 0.9 * lapBase || shadowOff > 1.1 * shadowBase;
      probes.push({
        scene: sceneId,
        lapBase,
        lapOff,
        shadowBase,
        shadowOff,
        controlFails: { laplacian: lapOff < 0.9 * lapBase, shadowLuma: shadowOff > 1.1 * shadowBase }
      });
      expect(controlFails, `${sceneId} flag-off control must fail Laplacian or shadow-luma`).toBe(true);
    });
  }
});
