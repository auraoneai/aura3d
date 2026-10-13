import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/route-health.spec.ts,
// retargeted at the siege snapshot.
test.setTimeout(240_000);

test("siege golf reaches ready state with a nonzero canvas and framed snapshot", async ({ page }) => {
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
    const hole = isRecord(state.hole) ? state.hole : {};
    const ball = isRecord(state.ball) ? state.ball : {};
    const structures = isRecord(state.structures) ? state.structures : {};
    const look = isRecord(state.look) ? state.look : {};
    return {
      framed: state.framed === true,
      phase: typeof state.phase === "string" ? state.phase : "",
      holeIndex: typeof hole.index === "number" ? hole.index : -1,
      strokes: typeof state.strokes === "number" ? state.strokes : -1,
      ballResting: ball.resting === true,
      structuresTotal: typeof structures.total === "number" ? structures.total : 0,
      structuresStanding: typeof structures.standing === "number" ? structures.standing : -1,
      lookId: typeof look.id === "string" ? look.id : ""
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.framed).toBe(true);
  expect(routeState.phase).toBe("aiming");
  expect(routeState.holeIndex).toBe(0);
  expect(routeState.strokes).toBe(0);
  expect(routeState.ballResting).toBe(true);
  expect(routeState.structuresTotal).toBeGreaterThan(0);
  expect(routeState.structuresStanding).toBe(routeState.structuresTotal);
  expect(routeState.lookId).toBe("daylight-outdoor");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
