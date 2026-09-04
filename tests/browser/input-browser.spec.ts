import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("input browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures keyboard focus, touch-style pointer IDs, and pointer lock settlement", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/input-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#lock-target").click();
    await page.waitForFunction(
      () => window.__AURA3D_INPUT_BROWSER_TEST__?.status === "ready" || window.__AURA3D_INPUT_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_INPUT_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.keyboardBeforeBlur).toBe(true);
    expect(result?.keyboardAfterBlur).toBe(false);
    expect(result?.pointerButtonDown).toBe(true);
    expect(result?.touchCountDuringDown).toBe(1);
    expect(result?.touchCountAfterUp).toBe(0);
    expect(result?.gamepadAxis).toBeCloseTo(0.75);
    expect(result?.gamepadButtonPressed).toBe(true);
    expect(result?.firstPersonMoved).toBe(true);
    expect(result?.accessibility).toEqual({
      focusable: true,
      role: "application",
      label: "Aura3D interactive 3D viewport",
      describedBy: "input-instructions"
    });
    expect(result?.pointerLock.available).toBe(true);
    expect(result?.pointerLock.requested).toBe(true);
    expect(result?.pointerLock.settled).toBe(true);
    mkdirSync(resolve("tests/reports/controls-picking-xr-context"), { recursive: true });
    writeFileSync(resolve("tests/reports/controls-picking-xr-context/input-modalities.json"), `${JSON.stringify({
      schema: "aura3d.input-modalities/1.0",
      generatedAt: new Date().toISOString(),
      pass: result?.status === "ready"
        && result.keyboardBeforeBlur
        && !result.keyboardAfterBlur
        && result.pointerButtonDown
        && result.touchCountDuringDown === 1
        && result.touchCountAfterUp === 0
        && result.gamepadAxis === 0.75
        && result.gamepadButtonPressed
        && result.firstPersonMoved
        && result.accessibility.focusable
        && result.accessibility.role === "application"
        && Boolean(result.accessibility.label)
        && Boolean(result.accessibility.describedBy)
        && result.pointerLock.settled
        && result.remapRestored
        && result.comboFired
        && result.hapticGateHonest,
      result
    }, null, 2)}\n`);

    // I2: remap + combo + haptics gate + genre touch layouts, proven in the real browser.
    expect(result?.remapRestored).toBe(true);
    expect(result?.remapConflictCount).toBe(1);
    expect(result?.comboFired).toBe(true);
    expect(result?.hapticGateHonest, `haptic via=${result?.hapticVia}`).toBe(true);
    expect(result?.touchGenres).toEqual(["fight", "race", "platform"]);
    expect(result?.touchFightButtons).toBeGreaterThan(0);
    expect(result?.touchRaceButtons).toBeGreaterThan(0);
    expect(result?.touchPlatformButtons).toBeGreaterThan(0);
  });
});

declare global {
  interface Window {
    __AURA3D_INPUT_BROWSER_TEST__?: {
      readonly status: "running" | "ready" | "error";
      readonly keyboardBeforeBlur: boolean;
      readonly keyboardAfterBlur: boolean;
      readonly pointerButtonDown: boolean;
      readonly touchCountDuringDown: number;
      readonly touchCountAfterUp: number;
      readonly gamepadAxis: number;
      readonly gamepadButtonPressed: boolean;
      readonly firstPersonMoved: boolean;
      readonly remapRestored?: boolean;
      readonly remapConflictCount?: number;
      readonly comboFired?: boolean;
      readonly hapticGateHonest?: boolean;
      readonly hapticVia?: string;
      readonly touchGenres?: readonly string[];
      readonly touchFightButtons?: number;
      readonly touchRaceButtons?: number;
      readonly touchPlatformButtons?: number;
      readonly accessibility: {
        readonly focusable: boolean;
        readonly role: string | null;
        readonly label: string | null;
        readonly describedBy: string | null;
      };
      readonly pointerLock: {
        readonly available: boolean;
        readonly requested: boolean;
        readonly settled: boolean;
        readonly granted: boolean;
        readonly error?: string;
      };
      readonly error?: string;
    };
  }
}
