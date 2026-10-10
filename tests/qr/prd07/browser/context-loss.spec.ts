// PRD-07 §16 — WEBGL_lose_context round-trip: after loseContext() +
// restoreContext(), particle buffers, sim targets, atlases and froxel
// atlases come back through C-29 resourceRegistrySlot — the fountain must
// resume with liveParticles > 0 and real warm pixels.

import { test, expect } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

test.describe("prd07 §16 context loss", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("flags vfx: loseContext+restore restores particles and pixels", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/context-loss-harness.html?a3d-qr=vfx`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_CTX__?.status === "ready" || window.__QR_PRD07_CTX__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );
    const ready = await page.evaluate(() => window.__QR_PRD07_CTX__?.status);
    expect(ready).toBe("ready");

    const probe = await page.evaluate(() => {
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      return { hasContext: Boolean(gl), ext: Boolean(gl?.getExtension("WEBGL_lose_context")) };
    });
    if (!probe.hasContext || !probe.ext) {
      test.skip(true, "no real WebGL2/WEBGL_lose_context on this host");
      return;
    }

    // Warm frames → live particles + warm pixels before loss.
    await page.evaluate(() => {
      const ctx = window.__QR_PRD07_CTX__ as { app?: { step(dt: number): void } };
      ctx.app?.step(0.5);
    });
    const before = await page.evaluate(() => {
      const ctx = window.__QR_PRD07_CTX__ as {
        app?: { diagnostics(): { effects?: { liveParticles?: number } }; step(dt: number): void };
        warmPixels?: () => number;
      };
      ctx.app?.step(0.1);
      return { live: ctx.app?.diagnostics().effects?.liveParticles ?? 0, warm: ctx.warmPixels?.() ?? 0 };
    });
    expect(before.live).toBeGreaterThan(0);
    expect(before.warm).toBeGreaterThan(0);

    // Lose the context; GL commands die while rAF keeps running.
    await page.evaluate(() => {
      document.querySelector("canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      document.querySelector("canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.restoreContext();
    });

    // Step frames so the restore-ordered chain (resourceRegistrySlot rebuild)
    // repopulates buffers/targets, then re-sample.
    await page.evaluate(() => {
      const ctx = window.__QR_PRD07_CTX__ as { app?: { step(dt: number): void } };
      for (let i = 0; i < 30; i += 1) ctx.app?.step(1 / 60);
    });
    const after = await page.evaluate(() => {
      const ctx = window.__QR_PRD07_CTX__ as {
        app?: { diagnostics(): { effects?: { liveParticles?: number }; errors?: readonly string[] } };
        warmPixels?: () => number;
      };
      return {
        live: ctx.app?.diagnostics().effects?.liveParticles ?? 0,
        warm: ctx.warmPixels?.() ?? 0,
        errors: ctx.app?.diagnostics().errors ?? []
      };
    });
    expect(after.errors, JSON.stringify(after.errors)).toEqual([]);
    expect(after.live).toBeGreaterThan(0);
    expect(after.warm).toBeGreaterThan(0);
  });
});
