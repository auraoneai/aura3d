import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/route-health.spec.ts,
// retargeted at the vault snapshot.
test.setTimeout(240_000);

test("vault breakers reaches ready state with a nonzero canvas and framed snapshot", async ({ page }) => {
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
    const table = isRecord(state.table) ? state.table : {};
    return {
      framed: state.framed === true,
      phase: typeof state.state === "string" ? state.state : "",
      score: typeof state.score === "number" ? state.score : -1,
      ballsLeft: typeof state.ballsLeft === "number" ? state.ballsLeft : -1,
      backend: typeof state.backend === "string" ? state.backend : "",
      lookId: typeof look.id === "string" ? look.id : "",
      poseHash: typeof table.poseHash === "string" ? table.poseHash : ""
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.framed).toBe(true);
  expect(routeState.phase).toBe("attract");
  expect(routeState.score).toBe(0);
  expect(routeState.ballsLeft).toBe(3);
  expect(routeState.backend).toBe("rapier");
  expect(routeState.lookId).toBe("neon-arcade");
  expect(routeState.poseHash.length).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
