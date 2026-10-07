import type {} from "./audio-live-harness";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Live RPM assertion for the courier engine loop (PRD-09 1739): the real
 * createEngineLoop drives captured AudioBufferSourceNodes — playbackRate must
 * follow rpm/layer anchors and the on/off-load equal-power blend must follow
 * setLoad.
 */
test.describe("audio live engine loop", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("engine loop pitches captured layer sources with rpm and blends load", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/audio-live-harness.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#audio-start").click();
    await page.waitForFunction(
      () => window.__AURA3D_AUDIO_LIVE__?.status === "ready" || window.__AURA3D_AUDIO_LIVE__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_AUDIO_LIVE__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.contextState).toBe("running");
    expect(result?.layerCount).toBe(6);
    expect(result?.bufferedLayers).toBe(6);

    // Idle rpm at load 0: every layer still pitches to rpm, but the
    // equal-power law gives the OFF-load set the mix. The 700 anchor sits
    // at rate 1; higher anchors clamp to 0.7.
    const idle = result?.idleReport ?? [];
    const idleOn = idle.filter((l) => l.onLoad);
    const idleOff = idle.filter((l) => !l.onLoad);
    expect(idleOn[0]?.rate).toBeCloseTo(1.0, 1);
    expect(idleOn[2]?.rate).toBeLessThanOrEqual(0.75);
    expect(idleOff[0]?.gain).toBeGreaterThan(0.9);
    expect(idleOff[2]?.rate).toBeLessThanOrEqual(0.75);
    expect(idleOff[2]?.gain).toBeLessThan(0.2);
    expect(idleOn.reduce((s, l) => s + l.gain, 0)).toBeLessThan(0.2);

    // Max rpm (still load 0): the 4800 off-load anchor lands at rate ~1 and
    // owns the mix.
    const max = result?.maxReport ?? [];
    const maxOn = max.filter((l) => l.onLoad);
    const maxOff = max.filter((l) => !l.onLoad);
    expect(maxOn[2]?.rate).toBeCloseTo(1.0, 1);
    expect(maxOff[2]?.rate).toBeCloseTo(1.0, 1);
    expect(maxOff[2]?.gain).toBeGreaterThan(0.9);
    expect(maxOff[0]?.gain).toBeLessThan(0.2);

    // Route update(): speed 13 at full throttle drives rpm to max + on-load.
    const drive = result?.driveReport ?? [];
    expect(drive.filter((l) => l.onLoad).reduce((s, l) => s + l.gain, 0)).toBeGreaterThan(
      drive.filter((l) => !l.onLoad).reduce((s, l) => s + l.gain, 0)
    );

    // Load law: equal-power blend — setLoad(0) gives the off-load set the mix.
    const off = result?.loadOffGains ?? [];
    const on = result?.loadOnGains ?? [];
    expect(off[3]! + off[4]! + off[5]!).toBeGreaterThan(off[0]! + off[1]! + off[2]!);
    expect(on[0]! + on[1]! + on[2]!).toBeGreaterThan(on[3]! + on[4]! + on[5]!);
  });
});
