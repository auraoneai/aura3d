import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART H / H2: the debug-draw route shows bodies + contacts + normals, the
 * overlay toggle hides everything, and the line budget caps output with
 * telemetry that adds up — all from the real simulation via the engine root.
 */
test.describe("H2 physics debug-draw route (browser)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("bodies, contacts, normals and joints draw; toggle and budget hold", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/physics-debug-draw-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () =>
        window.__AURA3D_PHYSICS_DEBUG_DRAW__?.status === "ready" ||
        window.__AURA3D_PHYSICS_DEBUG_DRAW__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_PHYSICS_DEBUG_DRAW__);
    expect(result?.status, result?.error).toBe("ready");

    // The route shows every layer: bodies, contacts, normals, joints.
    expect(result?.hasCollider).toBe(true);
    expect(result?.hasContact).toBe(true);
    expect(result?.hasNormal).toBe(true);
    expect(result?.hasJoint).toBe(true);

    // Toggle off hides the overlay completely.
    expect(result?.toggledOff).toBe(0);

    // Budget: capped output with telemetry that adds up.
    expect(result?.fullRequested).toBe(result?.lineCount);
    expect(result?.budget?.budgeted).toBe(true);
    expect(result?.budget?.emitted).toBe(8);
    expect(result?.budget?.requested).toBeGreaterThan(8);
    expect(result?.budget?.requested).toBe((result?.budget?.emitted ?? 0) + (result?.budget?.dropped ?? 0));

    // Visible proof: each category stroked its color where the solver reported it.
    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.colliderPixel ?? [];
    expect(ca).toBe(255);
    expect(cg).toBeGreaterThan(120);
    expect(cb).toBeGreaterThan(150);
    const [tr = 0, tg = 0, tb = 0, ta = 0] = result?.contactPixel ?? [];
    expect(ta).toBe(255);
    expect(tg).toBeGreaterThan(150);
    const [nr = 0, ng = 0, nb = 0, na = 0] = result?.normalPixel ?? [];
    expect(na).toBe(255);
    expect(nr).toBeGreaterThan(150);
    expect(ng).toBeGreaterThan(150);
    const [jr = 0, jg = 0, jb = 0, ja = 0] = result?.jointPixel ?? [];
    expect(ja).toBe(255);
    expect(jr).toBeGreaterThan(120);
    expect(jb).toBeGreaterThan(150);
  });
});

declare global {
  interface Window {
    __AURA3D_PHYSICS_DEBUG_DRAW__?: {
      readonly status: "ready" | "error";
      readonly categories?: readonly string[];
      readonly hasCollider?: boolean;
      readonly hasContact?: boolean;
      readonly hasNormal?: boolean;
      readonly hasJoint?: boolean;
      readonly toggledOff?: number;
      readonly lineCount?: number;
      readonly fullRequested?: number;
      readonly budget?: {
        readonly requested: number;
        readonly emitted: number;
        readonly dropped: number;
        readonly budgeted: boolean;
      };
      readonly colliderPixel?: readonly number[];
      readonly contactPixel?: readonly number[];
      readonly normalPixel?: readonly number[];
      readonly jointPixel?: readonly number[];
      readonly error?: string;
    };
  }
}
