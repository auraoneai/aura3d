import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/route-health.spec.ts,
// retargeted at the turbo snapshot's grounding evidence.
test.setTimeout(240_000);

test("turbo drift reaches ready state with a nonzero canvas, framed snapshot, and seated wheels", async ({ page }) => {
  await page.goto("/?scene=default");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");

  const canvas = page.locator("#app canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  const backing = await canvas.evaluate((el: HTMLCanvasElement) => ({ width: el.width, height: el.height }));
  expect(backing.width).toBeGreaterThan(0);
  expect(backing.height).toBeGreaterThan(0);

  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const routeState = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__aura3dGameSnapshot");
    const state = isRecord(value) ? value : {};
    const look = isRecord(state.look) ? state.look : {};
    const wheels = Array.isArray(state.groundClearance) ? state.groundClearance.filter(isRecord) : [];
    return {
      framed: state.framed === true,
      lookId: typeof look.id === "string" ? look.id : "",
      wheelRadius: typeof state.wheelRadius === "number" ? state.wheelRadius : 0,
      groundedWheels: typeof state.groundedWheels === "number" ? state.groundedWheels : 0,
      clearances: wheels.filter((w) => w.hit === true).map((w) => (typeof w.clearance === "number" ? w.clearance : Number.NaN))
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.framed).toBe(true);
  expect(routeState.lookId).toBe("golden-hour");
  expect(routeState.clearances).toHaveLength(4);
  expect(routeState.groundedWheels).toBeGreaterThan(0);
  for (const clearance of routeState.clearances) {
    expect(clearance).toBeGreaterThanOrEqual(routeState.wheelRadius - 0.02);
  }
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
