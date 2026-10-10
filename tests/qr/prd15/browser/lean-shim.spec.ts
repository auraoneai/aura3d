/**
 * PRD-15 §15-SPECS — `lean-shim.spec.ts`.
 *
 * The `@aura3d/lean` shim was deleted in T8.1; this spec pins the deletion:
 * the specifier must resolve nowhere (a served 404/clean module error, never
 * a silent stub), and the lit scene still renders with a ≥40/255 luma gap
 * between lit and shadowed regions — the acceptance keeps the shadow judgment
 * from the fixture captures without restoring the fixtures.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd15DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, probeFrame, type Prd15ProbePayload } from "./probe";

const FLAGS = (process.env.PRD15_FLAGS ?? "none").split(",").filter(Boolean);
const url = (extra = "") =>
  `/tests/qr/prd15/harness/prd15-mount.html?mode=lit&flags=${encodeURIComponent(FLAGS.join(","))}&pixels=1${extra}`;

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe("PRD-15 lean shim (post-T8.1)", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd15"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd15/lean-shim.json"),
      `${JSON.stringify({ spec: "lean-shim", flags: FLAGS, probes }, null, 2)}\n`
    );
    await server.close();
  });

  test("@aura3d/lean resolves nowhere — no silent stub", async ({ page }) => {
    const response = await page.request.get(`${server.origin}/node_modules/@aura3d/lean/dist/index.js`, {
      failOnStatusCode: false
    });
    expect([404, 403], "removed package must not serve a stub").toContain(response.status());
    probes.push({ test: "lean-gone", status: response.status() });
  });

  test("lit vs shadow luma ≥ 40/255", async ({ page }) => {
    const payload: Prd15ProbePayload = await loadProbe(page, `${server.origin}${url()}`);
    probes.push({ test: "luma-gap", drawCalls: payload.drawCalls });
    const frame = probeFrame(payload);
    const { width, height, pixels } = frame;
    // Left half (unoccluded, lit by the directional sun) vs the shadow band
    // behind the occluder on the right — separate region means, not extremes.
    const regionLuma = (x0: number, x1: number, y0: number, y1: number): number => {
      let sum = 0, n = 0;
      for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) {
        for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
          const i = (y * width + x) * 4;
          sum += luma(pixels[i], pixels[i + 1], pixels[i + 2]);
          n++;
        }
      }
      return n ? sum / n : 0;
    };
    const litMean = regionLuma(0.05, 0.3, 0.55, 0.85);
    const shadowMean = regionLuma(0.6, 0.9, 0.55, 0.85);
    probes.push({ litMean, shadowMean });
    expect(litMean - shadowMean, `lit ${litMean.toFixed(1)} vs shadow ${shadowMean.toFixed(1)} luma`).toBeGreaterThanOrEqual(40);
  });
});
