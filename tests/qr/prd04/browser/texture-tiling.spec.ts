/**
 * PRD-04 §16.1 S6 — texture tiling, grazing angle.
 *
 * Subject: `prd04-tiled-ground` (40 m plane, 1 m CC0 tiles, repeat=40) captured
 * through the 12-frame orbit strip (`strip=1`).
 * Gates:
 *   - temporal per-pixel luma std-dev in the far third of the subject mask
 *     <= 50% of the flag-off value (shimmer suppression)
 *   - `extra.samplerAnisotropy.applied` reports 16 on High, 8 on Medium (R9)
 *   - the FFT row-profile spike (`tileFreqSpike`, far third) <= 3x median —
 *     §16.2's integrated seam check is recorded alongside
 * Control (§15.4): flags=none far-third std-dev must exceed the flag-on value
 * by the same ratio — recorded to tests/reports/prd04/probes/.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, type Prd04ProbePayload } from "./probe";

interface StripReport {
  readonly frames: number;
  readonly farThirdLumaStd: number;
  readonly nearThirdLumaStd: number;
  readonly maskedPixels: number;
  readonly tileFreqSpike: number;
}

function stripOf(payload: Prd04ProbePayload): StripReport {
  const strip = (payload.extra ?? {}).strip as StripReport | undefined;
  expect(strip, "extra.strip present — pass strip=1").toBeTruthy();
  return strip!;
}

const url = (flags: string, quality: string) =>
  `/tests/qr/prd04/harness/prd04-capture.html?engine=aura3d&scene=prd04-tiled-ground&flags=${flags}&strip=1&quality=${quality}`;

test.describe("PRD-04 S6 texture tiling", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04/probes/s6-tiling-control.json"),
      `${JSON.stringify({ probe: "s6-tiling", probes }, null, 2)}\n`
    );
    await server.close();
  });

  test("prd04-tiled-ground: far-third shimmer <= 50% of flag-off", async ({ page }) => {
    const on = await loadProbe(page, `${server.origin}${url("materials", "high")}`);
    const off = await loadProbe(page, `${server.origin}${url("none", "high")}`);
    const stripOn = stripOf(on);
    const stripOff = stripOf(off);
    const aniso = ((on.extra ?? {}).samplerAnisotropy ?? {}) as { requestedApplied?: number; tier?: string };

    expect(stripOn.maskedPixels, "subject mask populated in the far strip").toBeGreaterThan(0);
    expect(
      stripOn.farThirdLumaStd,
      `far-third temporal luma std-dev ${stripOn.farThirdLumaStd} <= 50% of flag-off ${stripOff.farThirdLumaStd}`
    ).toBeLessThanOrEqual(0.5 * stripOff.farThirdLumaStd);
    expect(aniso.requestedApplied, "anisotropy 16 on High").toBe(16);
    expect(stripOn.tileFreqSpike, `tile-freq spike ${stripOn.tileFreqSpike} <= 3x median`).toBeLessThanOrEqual(3);

    probes.push({
      scene: "prd04-tiled-ground",
      farStdOn: stripOn.farThirdLumaStd,
      farStdOff: stripOff.farThirdLumaStd,
      spikeOn: stripOn.tileFreqSpike,
      spikeOff: stripOff.tileFreqSpike,
      controlFails: { shimmer: stripOn.farThirdLumaStd <= 0.5 * stripOff.farThirdLumaStd }
    });
  });

  test("prd04-tiled-ground: Medium reports anisotropy 8", async ({ page }) => {
    const on = await loadProbe(page, `${server.origin}${url("materials", "medium")}`);
    const aniso = ((on.extra ?? {}).samplerAnisotropy ?? {}) as { requestedApplied?: number; tier?: string };
    expect(aniso.tier, "medium tier applied").toBe("medium");
    expect(aniso.requestedApplied, "anisotropy 8 on Medium").toBe(8);
  });
});
