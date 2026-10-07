// PRD-06 T0.3 — the controller's weighted clip samples reach the runtime-node
// animation binding when A3D_QR_ANIMATION is on, and the binding shape is
// unchanged when it is off. Runs through a real createAuraApp in Chromium.

import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __PRD06_CLIP_SAMPLES__?: {
      readonly status: "ready" | "error";
      readonly clipSamples?: readonly { clipName?: string; weight?: number }[];
      readonly bindingKind?: string;
      readonly error?: string;
    };
  }
}

test.describe("PRD-06 clip-samples binding", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("publishes clip samples on the runtime binding under ?a3d-qr=animation", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd06/browser/clip-samples-harness.html?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__PRD06_CLIP_SAMPLES__?.status === "ready" || window.__PRD06_CLIP_SAMPLES__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__PRD06_CLIP_SAMPLES__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.bindingKind).toBe("aura-runtime-node-animation-binding");
    expect(result?.clipSamples?.length).toBeGreaterThan(0);
    expect(result?.clipSamples?.[0]?.clipName).toBe("Walk");
  });

  test("leaves the binding shape unchanged with flags off", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd06/browser/clip-samples-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__PRD06_CLIP_SAMPLES__?.status === "ready" || window.__PRD06_CLIP_SAMPLES__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__PRD06_CLIP_SAMPLES__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.bindingKind).toBe("aura-runtime-node-animation-binding");
    expect(result?.clipSamples).toBeUndefined();
  });
});
