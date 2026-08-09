import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WS-2.5 — a renderable scene never silently falls to the Canvas 2D diagnostic preview.
 *
 * `renderDiagnosticPreviewToCanvas` draws a gradient, a grid, and a rectangle per node. It is a schematic.
 * It was previously the fallback for anything the WebGL path declined, so a developer whose scene failed to
 * qualify got a plausible-looking frame and no indication they were not looking at their renderer — and it
 * has already caused one real defect class: world labels reached the scene graph but were drawn only there,
 * so every production callout was silently dropped while evidence counted the nodes.
 */
test.describe("canvas2d is diagnostic-only", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("a renderable scene on a WebGL-denied canvas errors instead of drawing a gradient", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/canvas2d-diagnostic-only-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __canvas2dProbe?: unknown }).__canvas2dProbe)
        || (window as unknown as { __canvas2dProbeError?: unknown }).__canvas2dProbeError !== undefined,
      undefined,
      { timeout: 60_000 }
    );
    const harnessError = await page.evaluate(() => (window as unknown as { __canvas2dProbeError?: string }).__canvas2dProbeError);
    expect(harnessError, "harness must run to completion").toBeFalsy();

    const probe = await page.evaluate(() => (window as unknown as {
      __canvas2dProbe: {
        readonly denied: { readonly threw: boolean; readonly message: string; readonly asyncErrors: readonly string[]; readonly backend: string; readonly litPixels: number };
        readonly control: { readonly backend: string; readonly litPixels: number; readonly drawCalls: number; readonly errors: readonly string[]; readonly runtimeBackend: string | undefined };
      };
    }).__canvas2dProbe);

    /*
     * The point of the row: refuse, and say why. Either a synchronous throw or a recorded mount error is
     * acceptable — this canvas exists in a browser, so the selection rule correctly attempts WebGL and
     * only learns of the denial inside the async mount.
     *
     * The defect being prevented is the third outcome: fall through to the 2D path, paint a gradient, and
     * report `backend: "canvas2d"` with empty errors.
     */
    const refused = probe.denied.threw || probe.denied.asyncErrors.length > 0;
    expect(refused, "a renderable scene with no WebGL2 must raise a diagnosable error, sync or async").toBe(true);
    expect(probe.denied.message.length, "the refusal must carry an explanation").toBeGreaterThan(0);
    // It must never claim the diagnostic preview as its backend for a renderable scene.
    expect(probe.denied.backend).not.toBe("canvas2d");
    // And it must not have painted a schematic, which is the thing being prevented.
    expect(probe.denied.litPixels, "no gradient frame may be drawn for a renderable scene").toBeLessThan(1_000);

    /*
     * Control, so this cannot pass by breaking rendering generally — which would be the easy way to make
     * the assertion above true and is exactly the failure mode worth guarding.
     */
    expect(probe.control.backend).toBe("webgl2");
    expect(probe.control.litPixels, JSON.stringify(probe.control, null, 2)).toBeGreaterThan(1_000);
    expect(probe.control.runtimeBackend).toBe("production-runtime");
    expect(probe.control.drawCalls).toBeGreaterThan(0);
    expect(probe.control.errors).toEqual([]);

    const evidence = {
      schema: "aura3d-canvas2d-diagnostic-only/1.0",
      generatedAt: new Date().toISOString(),
      pass: refused
        && probe.denied.backend !== "canvas2d"
        && probe.denied.litPixels < 1_000
        && probe.control.runtimeBackend === "production-runtime"
        && probe.control.drawCalls > 0
        && probe.control.litPixels > 1_000,
      probe
    };
    mkdirSync(resolve("tests/reports/public-renderer-normal-path"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/public-renderer-normal-path/canvas2d-boundary.json"),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
    expect(evidence.pass).toBe(true);
  });
});
