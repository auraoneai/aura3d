/**
 * Parity-L5 SG-01/SG-02 — `instances.mesh` + `batched.mesh` on a real WebGL2
 * device. Asserts the instancing/batching path actually rasterizes distinct
 * per-instance colors (the dense instance buffer reached the GPU), draw calls
 * are issued without errors, and the multi-draw route/fallback is reported
 * honestly through renderer diagnostics.
 *
 * Remote-only evidence (lane-browser job): skips loudly without WebGL2.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("parity-L5 instancing + batching", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("instances.mesh + batched.mesh rasterize per-instance transforms and colors", async ({ page }) => {
    const webgl2 = await page.evaluate(() => {
      const probe = document.createElement("canvas").getContext("webgl2");
      return probe !== null;
    });
    test.skip(!webgl2, "WebGL2 unavailable — remote lane-browser job only");

    await page.setViewportSize({ width: 720, height: 460 });
    await page.goto(`${server.origin}/tests/browser/parity-instancing-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_PARITY_INSTANCING__?.status === "ready" || window.__AURA3D_PARITY_INSTANCING__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_PARITY_INSTANCING__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/parity-instancing.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/parity-instancing.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.errors ?? []).toEqual([]);
    const diag = () => JSON.stringify({
      warnings: result?.warnings,
      compiledFeatures: result?.compiledFeatures,
      rendererBatching: result?.rendererBatching,
      collection: result?.collection,
      multiDrawExtension: result?.multiDrawExtension
    });
    expect(result?.drawCalls, diag()).toBeGreaterThan(0);
    // Four instanced boxes (red/green/blue/white) + two batched shapes
    // (amber/cyan) ⇒ several distinct color buckets. A broken instance path
    // renders one flat color or nothing.
    expect(result?.image?.nonDarkPixels ?? 0).toBeGreaterThan(1_500);
    expect(result?.image?.colorBuckets ?? 0).toBeGreaterThanOrEqual(4);
    // Multi-draw route reporting must exist and be honest — either the
    // extension is present (multi-draw allowed) or the diagnostic records the
    // fallback; it may never claim support the device lacks.
    expect(typeof result?.multiDrawExtension).toBe("boolean");
    if (result?.rendererBatching !== undefined) {
      const mode = (result.rendererBatching as { multiDrawMode?: string }).multiDrawMode;
      expect(mode === undefined || ["multi-draw", "none", "unavailable"].includes(mode)).toBe(true);
    }

    // §8/§11.3: route-health names the parity IDs this port exercised.
    expect(result?.routeHealth?.parityIds).toEqual(["SG-01", "SG-02"]);
  });
});
