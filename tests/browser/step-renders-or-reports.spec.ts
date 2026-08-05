import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WS-2.9 — `step()` must render, or say why it cannot.
 *
 * Found while building WS-1.5's material gates, and it cost an hour of debugging a shader that was
 * already correct. Measured on the pre-fix code:
 *
 *   createAuraApp(canvas, { autoStart: false });
 *   for (let i = 0; i < 8; i += 1) app.step(1 / 60);
 *   // -> drawCalls: 0, canvas fully blank, backend "webgl2", warnings [], errors []
 *
 * The production WebGL renderer mounts asynchronously, so a synchronous `step()` in that window fell
 * through to the Canvas-2D path and drew nothing for a WebGL scene — with **no warning and no error**.
 * `step(dt)` is the documented deterministic entry point, so a developer writing a headless capture got
 * a blank image and nothing to go on.
 *
 * The empty diagnostics are the defect, not the blank frame. A renderer that is not ready yet is a
 * legitimate state; reporting it as a successful zero-draw-call frame is not.
 */
test.describe("step() renders or reports", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("stepping before the mount completes raises a diagnostic instead of drawing nothing silently", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(`${server.origin}/tests/browser/step-renders-or-reports-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __stepProbe?: unknown }).__stepProbe) || (window as unknown as { __stepProbeError?: unknown }).__stepProbeError !== undefined, undefined, { timeout: 30_000 })
      .catch(() => undefined);
    const harnessError = await page.evaluate(() => (window as unknown as { __stepProbeError?: string }).__stepProbeError);
    expect(harnessError ?? consoleErrors.join(" | "), "harness must run to completion").toBeFalsy();
    await page.waitForFunction(() => Boolean((window as unknown as { __stepProbe?: unknown }).__stepProbe), undefined, { timeout: 60_000 });
    const probe = await page.evaluate(() => (window as unknown as {
      __stepProbe: {
        readonly beforeReady: { readonly drawCalls: number; readonly warnings: readonly string[]; readonly errors: readonly string[]; readonly litPixels: number };
        readonly afterReady: { readonly drawCalls: number; readonly litPixels: number };
        readonly readyResolved: boolean;
      };
    }).__stepProbe);

    /*
     * Either outcome is acceptable for the frame itself — a synchronous mount would be fine too. What
     * is not acceptable is a blank frame with empty diagnostics, which is what this asserts against.
     */
    if (probe.beforeReady.litPixels < 1_000) {
      expect(
        probe.beforeReady.warnings.length + probe.beforeReady.errors.length,
        "a step() that rendered nothing must report why: empty warnings AND empty errors is the defect"
      ).toBeGreaterThan(0);
      expect(probe.beforeReady.warnings.join(" ")).toContain("before the WebGL renderer finished mounting");
      // The message must name a fix a developer can act on, not just describe the state.
      expect(probe.beforeReady.warnings.join(" ")).toContain("app.ready()");
    }

    // `app.ready()` must exist and resolve — a warning telling someone to await it is useless otherwise.
    expect(probe.readyResolved).toBe(true);
    // And after awaiting it, the same step call must actually render.
    expect(probe.afterReady.litPixels).toBeGreaterThan(1_000);
    expect(probe.afterReady.drawCalls).toBeGreaterThan(0);
  });
});
