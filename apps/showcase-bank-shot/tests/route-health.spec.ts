import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(240_000);

test("bank shot reaches ready state with a nonzero canvas and framed snapshot", async ({ page }) => {
  await page.goto("/?scene=default");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");
  const canvas = page.locator("#app canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  expect(drawCalls).toBeGreaterThan(0);
  const routeState = await page.evaluate(() => {
    const s = (window as unknown as { __aura3dGameSnapshot?: { framed: boolean; balls: { liveCount: number }; table: { backend: string } } }).__aura3dGameSnapshot;
    return { framed: s?.framed === true, liveCount: s?.balls.liveCount ?? 0, backend: s?.table.backend ?? "" };
  });
  expect(routeState.framed).toBe(true);
  expect(routeState.liveCount).toBe(16);
  expect(routeState.backend).toBe("rapier");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
