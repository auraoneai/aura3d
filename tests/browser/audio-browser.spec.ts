import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("audio browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("unlocks a real browser context and plays a short AudioSource", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/audio-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#audio-start").click();
    await page.waitForFunction(
      () => window.__AURA3D_AUDIO_BROWSER_TEST__?.status === "ready" || window.__AURA3D_AUDIO_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_AUDIO_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.contextState).toBe("running");
    expect(result?.clipDuration).toBeGreaterThan(0);
    expect(result?.sourceStateAfterPlay).toBe("playing");
    expect(result?.sourceStateAfterPause).toBe("paused");
    expect(result?.sourceStateAfterResume).toBe("playing");
    expect(result?.sourceStateAfterStop).toBe("stopped");
    expect(result?.repeatedMounts).toBe(10);
  });

  test("I1: positional emitter, mixer ducking, and footstep hooks run on the real graph", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/audio-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#audio-start").click();
    await page.waitForFunction(
      () => window.__AURA3D_AUDIO_BROWSER_TEST__?.status === "ready" || window.__AURA3D_AUDIO_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_AUDIO_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.positionalConnected).toBe(true);
    expect(result?.positionalAttenuation).toBeCloseTo(1 / 3, 5);
    expect(result?.positionalDopplerAboveOne).toBe(true);
    expect(result?.positionalOcclusion).toBe(0.5);
    expect(result?.mixerDuckedMusic).toBeCloseTo(0.8 * 0.35, 5);
    expect(result?.mixerRestoredMusic).toBeCloseTo(0.8, 5);
    expect(result?.footstepFirst).toBe("step-grass-a");
    expect(result?.footstepFallback).toBe("step-default");
  });
});

declare global {
  interface Window {
    __AURA3D_AUDIO_BROWSER_TEST__?: {
      readonly status: "waiting" | "ready" | "error";
      readonly contextState: string;
      readonly clipDuration: number;
      readonly sourceStateAfterPlay: string;
      readonly sourceStateAfterPause?: string;
      readonly sourceStateAfterResume?: string;
      readonly sourceStateAfterStop: string;
      readonly repeatedMounts?: number;
      readonly positionalConnected?: boolean;
      readonly positionalAttenuation?: number;
      readonly positionalDopplerAboveOne?: boolean;
      readonly positionalOcclusion?: number;
      readonly mixerDuckedMusic?: number;
      readonly mixerRestoredMusic?: number;
      readonly footstepFirst?: string | null;
      readonly footstepFallback?: string | null;
      readonly error?: string;
    };
  }
}
