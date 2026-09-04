import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("gamefeel + camera rigs browser probe (F2/F3/N2)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("rigs move, shake decays, punch settles, feel changes pixels + telemetry", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/gamefeel-camera-rigs-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_GAMEFEEL_RIGS_TEST__?.status === "ready" || window.__AURA3D_GAMEFEEL_RIGS_TEST__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_GAMEFEEL_RIGS_TEST__);
    expect(result?.status, result?.error).toBe("ready");

    // F2 rigs
    expect(result?.shoulderMoved).toBe(true);
    expect(result?.followConverged).toBe(true);
    expect(result?.orbitClipped).toBe(true);
    expect(result?.orbitClearance).toBeCloseTo(1.7, 5);
    expect(result?.shakeEnergyFirst).toBeGreaterThan(0.5);
    expect(result?.shakeEnergyLast).toBeLessThan(0.05);
    expect(result?.punchPeakFov).toBeLessThan(0);
    expect(result?.punchSettled).toBe(true);
    expect(result?.evidenceFrames).toBe(30);

    // F3 feel: telemetry + real pixels
    expect(result?.flashAccepted).toBe(true);
    expect(result?.dustNodes).toBe(3);
    expect(result?.frozenDuringHitStop).toBe(true);
    expect(result?.budgetOver).toBe(false);
    const [br = 0, bg = 0, bb = 0] = result?.backgroundPixel ?? [];
    const [fr = 0, fg = 0, fb = 0, fa = 0] = result?.flashPixel ?? [];
    expect(fa).toBe(255);
    expect(fr).toBeGreaterThan(br + 60);
    expect(fg).toBeGreaterThan(bg);
    expect(fb).toBeGreaterThan(bb);
    const [lr = 0, lg = 0, lb = 0] = result?.linePixel ?? [];
    expect(lg).toBeGreaterThan(bg + 40);
    expect(lb).toBeGreaterThan(bb + 40);
    const [dr = 0, dg = 0, db = 0] = result?.dustPixel ?? [];
    expect(dr).toBeGreaterThan(br + 60);
    expect(dg).toBeGreaterThan(bg + 60);

    // N2 arcball
    expect(result?.arcballMoved).toBe(true);
    expect(result?.arcballDisposed).toBe(true);

    await page.screenshot({ path: "tests/reports/gamefeel-camera-rigs.png" });
  });
});

declare global {
  interface Window {
    __AURA3D_GAMEFEEL_RIGS_TEST__?: {
      readonly status: "ready" | "error";
      readonly frames?: number;
      readonly shoulderMoved?: boolean;
      readonly followConverged?: boolean;
      readonly orbitClipped?: boolean;
      readonly orbitClearance?: number;
      readonly shakeEnergyFirst?: number;
      readonly shakeEnergyLast?: number;
      readonly punchPeakFov?: number;
      readonly punchSettled?: boolean;
      readonly evidenceFrames?: number;
      readonly flashAccepted?: boolean;
      readonly flashPixel?: readonly number[];
      readonly linePixel?: readonly number[];
      readonly dustPixel?: readonly number[];
      readonly backgroundPixel?: readonly number[];
      readonly dustNodes?: number;
      readonly frozenDuringHitStop?: boolean;
      readonly budgetOver?: boolean;
      readonly arcballMoved?: boolean;
      readonly arcballDisposed?: boolean;
      readonly error?: string;
    };
  }
}
