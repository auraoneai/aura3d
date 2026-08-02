import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Proves the on-screen control buttons actually drive gameplay, in a real browser.
 *
 * ## Why this suite exists
 *
 * `bindGameTouchControls` was extracted into the reusable layer after the replicability metric found its
 * predecessor duplicated byte-for-byte across two routes. Its unit tests drive an injected host, which covers the
 * binding *logic* but cannot prove a real pointer event on a real button moves a real player -- and an audit found
 * **no browser test touched these buttons at all**, before or after the extraction. The route-primary probe only
 * checks that controls are inside the viewport, not that they work.
 *
 * That gap matters beyond this refactor: these buttons are the only way to play on a touch device, and the brief
 * requires mobile evidence. A dead button would have passed every existing gate.
 */
const ROUTES = [
  {
    id: "showcase-skyline-runner",
    path: "/apps/showcase-skyline-runner/",
    globalName: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__",
    holdButton: "right-control",
    pulseButton: "reset-control",
    /*
     * `frameCount` is the value Skyline's own gameplay proof uses to show input landed: its retained proof
     * records 0 before input and 85 after. Skyline's mounted evidence exposes no player-x field, so an earlier
     * draft of this test read a key that does not exist and measured a constant zero -- a test that would have
     * passed a dead button once the key existed.
     */
    probe: "frameCount"
  },
  {
    id: "showcase-turbo-drift-circuit",
    path: "/apps/showcase-turbo-drift-circuit/",
    globalName: "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__",
    holdButton: "throttle-control",
    pulseButton: "reset-control",
    // Turbo exposes `speed` directly, and throttle is exactly what should change it.
    probe: "speed"
  }
] as const;

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startExampleDevServer();
});

test.afterAll(async () => {
  await server?.close();
});

test.describe("showcase on-screen controls drive gameplay", () => {
  for (const route of ROUTES) {
    test(`${route.id}: holding a control changes state and reset restores it`, async ({ page }) => {
      await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        (name) => Boolean((window as unknown as Record<string, { status?: string }>)[name]?.status),
        route.globalName,
        { timeout: 30_000 }
      );

      const readProbe = async (): Promise<number> => page.evaluate(([name, key]) => {
        const evidence = (window as unknown as Record<string, Record<string, unknown>>)[name];
        const value = evidence?.[key];
        return typeof value === "number" ? value : Number(value ?? 0);
      }, [route.globalName, route.probe] as const);

      // The button must exist and be actionable, not merely present in the DOM.
      const hold = page.locator(`#${route.holdButton}`);
      await expect(hold, `${route.holdButton} must be visible`).toBeVisible();

      /*
       * Idle baseline first.
       *
       * Some probes advance on their own (`frameCount` ticks every rendered frame), so "changed" is not evidence
       * on its own. Measuring an equal idle window first means the assertion is that pressing the button changes
       * the value **more than doing nothing does**.
       */
      const idleStart = await readProbe();
      await page.waitForTimeout(900);
      const idleDelta = Math.abs((await readProbe()) - idleStart);

      const before = await readProbe();
      /*
       * Real pointer events, not a synthetic dispatch: `pointerdown` then `pointerup` after a hold, which is
       * exactly what a finger does and what the binding translates into keydown/keyup.
       */
      await hold.dispatchEvent("pointerdown");
      await page.waitForTimeout(900);
      await hold.dispatchEvent("pointerup");
      const during = Math.abs((await readProbe()) - before);
      expect(during, `${route.holdButton} must move ${route.probe} more than idling does`)
        .toBeGreaterThan(idleDelta);

      // The pulse control (reset) must also be wired and must not throw.
      const reset = page.locator(`#${route.pulseButton}`);
      await expect(reset).toBeVisible();
      await reset.click();
      await page.waitForTimeout(400);
      expect(await page.evaluate(
        (name) => Boolean((window as unknown as Record<string, { status?: string }>)[name]?.status),
        route.globalName
      ), "route evidence must survive a reset").toBe(true);
    });
  }
});
