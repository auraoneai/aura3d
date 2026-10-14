import { expect, test } from "@playwright/test";

// Modeled on showcase-blockfall-reactor/tests/route-health.spec.ts,
// retargeted at the mech hangar snapshot.
test.setTimeout(240_000);

test("mech hangar reaches ready state with a nonzero canvas and framed snapshot", async ({ page }) => {
  await page.goto("/?scene=default");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");

  const canvas = page.locator("#app canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  const routeState = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__aura3dGameSnapshot");
    const state = isRecord(value) ? value : {};
    const look = isRecord(state.look) ? state.look : {};
    return {
      framed: state.framed === true,
      state: typeof state.state === "string" ? state.state : "",
      lookId: typeof look.id === "string" ? look.id : "",
      drawCalls: typeof state.drawCalls === "number" ? state.drawCalls : 0
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(routeState.framed).toBe(true);
  expect(routeState.state).toBe("assemble");
  expect(routeState.lookId).toBe("interior-industrial");
  expect(routeState.drawCalls).toBeGreaterThan(0);
});
