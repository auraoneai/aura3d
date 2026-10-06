/**
 * PRD-04 §16.1 S7 — procedural material detail.
 *
 * `material.fabric / brushedMetal / blackRubber / frostedGlass` presets on a
 * 1 m sphere at 1280x720 via the `prd04-procedural` driver.
 * Gate: masked Laplacian variance >= 3x the flag-off value per preset (the
 * procedural texture specs are dropped at compile when the flag is off, so the
 * control renders flat by construction — §15.4).
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";
import { maskedLaplacianVariance, subjectMask } from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics";
import { loadProbe, probeFrame } from "./probe";

const PRESETS = ["fabric", "brushedMetal", "blackRubber", "frostedGlass"] as const;

const url = (preset: string, flags: string) =>
  `/tests/qr/prd04/harness/prd04-procedural.html?preset=${preset}&flags=${flags}&width=1280&height=720`;

test.describe("PRD-04 S7 procedural material detail", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04/probes/s7-procedural-control.json"),
      `${JSON.stringify({ probe: "s7-procedural", probes }, null, 2)}\n`
    );
    await server.close();
  });

  for (const preset of PRESETS) {
    test(`material.${preset}: micro-structure >= 3x flag-off`, async ({ page }) => {
      const on = await loadProbe(page, `${server.origin}${url(preset, "materials")}`);
      const off = await loadProbe(page, `${server.origin}${url(preset, "none")}`);
      const onFrame = probeFrame(on);
      const offFrame = probeFrame(off);
      const mask = subjectMask(onFrame.pixels);
      const lapOn = maskedLaplacianVariance(onFrame.pixels, onFrame.width, onFrame.height, mask);
      const lapOff = maskedLaplacianVariance(offFrame.pixels, onFrame.width, onFrame.height, mask);

      probes.push({ preset, lapOn, lapOff, ratio: lapOff > 0 ? lapOn / lapOff : Infinity });
      expect(
        lapOn,
        `material.${preset} masked Laplacian ${lapOn} >= 3x flag-off ${lapOff}`
      ).toBeGreaterThanOrEqual(3 * lapOff);
    });
  }
});
