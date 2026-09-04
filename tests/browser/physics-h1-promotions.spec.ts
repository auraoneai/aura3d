import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART H / H1: every root rigid-body promotion with browser proof.
 *
 * Each assertion below runs against the real Rapier-owned simulation through
 * the `@aura3d/engine` root (`createPhysicsRuntime`) — stacking, fixed joint,
 * CCD tunnel-guard, sleep/wake and sensor callbacks — with the solver's final
 * state drawn to canvas and pixel-probed.
 */
test.describe("H1 root physics promotions (browser)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("stacking, joint, tunnel-guard, sleep/wake and sensor all hold in the browser", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/physics-h1-promotions-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_H1_PROMOTIONS__?.status === "ready" || window.__AURA3D_H1_PROMOTIONS__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_H1_PROMOTIONS__);
    expect(result?.status, result?.error).toBe("ready");

    // Backend provenance: Rapier is the sole physical-simulation owner.
    expect(result?.backend?.active).toBe("rapier");
    expect(result?.backend?.provider).toBe("rapier-native-ccd+adaptive-substeps");
    expect(result?.backend?.seed).toBe(20260904);

    // Stacking: crates settle in order with real contacts.
    expect(result?.stacking?.ordered).toBe(true);
    expect(result?.stacking?.settled).toBe(true);
    expect(result?.stacking?.contacts).toBeGreaterThan(0);

    // Joint: the fixed joint holds the initial separation under gravity.
    expect(result?.joint?.held).toBe(true);

    // CCD tunnel-guard: substeps engage and the thin wall stops the bullet.
    expect(result?.tunnelGuard?.ccdEngaged).toBe(true);
    expect(result?.tunnelGuard?.stoppedByWall).toBe(true);

    // Sleep/wake + sensor callbacks from root.
    expect(result?.sleepWake?.slept).toBe(true);
    expect(result?.sleepWake?.wokeOnImpulse).toBe(true);
    expect(result?.sensor?.fired).toBe(true);

    // Visible proof: each band drew its subject where the solver put it.
    const [sr = 0, sg = 0, sb = 0, sa = 0] = result?.stackPixel ?? [];
    expect(sa).toBe(255);
    expect(sg).toBeGreaterThan(120);
    const [jr = 0, jg = 0, jb = 0, ja = 0] = result?.jointPixel ?? [];
    expect(ja).toBe(255);
    expect(jr + jg + jb).toBeGreaterThan(120);
    const [wr = 0, wg = 0, wb = 0, wa = 0] = result?.wallPixel ?? [];
    expect(wa).toBe(255);
    expect(wr).toBeGreaterThan(100);
    const [lr = 0, lg = 0, lb = 0, la = 0] = result?.sleepPixel ?? [];
    expect(la).toBe(255);
    expect(lb).toBeGreaterThan(120);
    const [nr = 0, ng = 0, nb = 0, na = 0] = result?.sensorPixel ?? [];
    expect(na).toBe(255);
    expect(nr).toBeGreaterThan(150);
  });
});

declare global {
  interface Window {
    __AURA3D_H1_PROMOTIONS__?: {
      readonly status: "ready" | "error";
      readonly stacking?: {
        readonly finalHeights: readonly number[];
        readonly ordered: boolean;
        readonly settled: boolean;
        readonly contacts: number;
      };
      readonly joint?: { readonly initialGap: number; readonly finalGap: number; readonly held: boolean };
      readonly tunnelGuard?: {
        readonly subSteps: number;
        readonly ccdEngaged: boolean;
        readonly finalX: number;
        readonly stoppedByWall: boolean;
        readonly contacts: number;
      };
      readonly sleepWake?: { readonly slept: boolean; readonly wokeOnImpulse: boolean };
      readonly sensor?: { readonly enters: number; readonly fired: boolean };
      readonly backend?: { readonly active: string; readonly provider: string; readonly seed: number | null };
      readonly stackPixel?: readonly number[];
      readonly jointPixel?: readonly number[];
      readonly wallPixel?: readonly number[];
      readonly sleepPixel?: readonly number[];
      readonly sensorPixel?: readonly number[];
      readonly error?: string;
    };
  }
}
