import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/route-health.spec.ts,
// retargeted at the single-path Gravity Post snapshot.
test.setTimeout(240_000);

test("gravity post reaches ready state with a nonzero canvas and framed snapshot", async ({ page }) => {
  await page.goto("/?scene=default");
  await expect.poll(
    () =>
      page.evaluate(() => {
        const snap = Reflect.get(window, "__aura3dGameSnapshot") as { framed?: boolean } | undefined;
        return snap?.framed === true;
      }),
    { timeout: 150_000 }
  ).toBe(true);

  const canvas = page.locator("#app canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  const backing = await canvas.evaluate((el: HTMLCanvasElement) => ({ width: el.width, height: el.height }));
  expect(backing.width).toBeGreaterThan(0);
  expect(backing.height).toBeGreaterThan(0);

  const routeState = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__aura3dGameSnapshot");
    const state = isRecord(value) ? value : {};
    const look = isRecord(state.look) ? state.look : {};
    return {
      framed: state.framed === true,
      drawCalls: typeof state.drawCalls === "number" ? state.drawCalls : 0,
      podState: typeof state.podState === "string" ? state.podState : "",
      contractIndex: typeof state.contractIndex === "number" ? state.contractIndex : -1,
      contractId: typeof state.contractId === "string" ? state.contractId : "",
      hullsRemaining: typeof state.hullsRemaining === "number" ? state.hullsRemaining : 0,
      lookId: typeof look.id === "string" ? look.id : ""
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(routeState.drawCalls).toBeGreaterThan(0);
  expect(routeState.framed).toBe(true);
  expect(routeState.podState).toBe("ready");
  expect(routeState.contractIndex).toBe(0);
  expect(routeState.contractId).toBe("GP-CON-1");
  expect(routeState.hullsRemaining).toBe(3);
  expect(routeState.lookId).toBe("space-orbit");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(
    resolve("tests/reports/route-health.json"),
    `${JSON.stringify({ ready: true, drawCalls: routeState.drawCalls, routeState }, null, 2)}\n`
  );
});
