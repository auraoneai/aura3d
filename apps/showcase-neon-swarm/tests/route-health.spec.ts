import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-siege-golf/tests/route-health.spec.ts,
// retargeted at the Neon Swarm snapshot.
test.setTimeout(240_000);

test("neon swarm reaches ready state with a nonzero canvas and framed snapshot", async ({ page }) => {
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
    const wave = isRecord(state.wave) ? state.wave : {};
    const player = isRecord(state.player) ? state.player : {};
    const enemies = isRecord(state.enemies) ? state.enemies : {};
    const look = isRecord(state.look) ? state.look : {};
    return {
      framed: state.framed === true,
      phase: typeof state.phase === "string" ? state.phase : "",
      waveIndex: typeof wave.index === "number" ? wave.index : -1,
      waveTotal: typeof wave.total === "number" ? wave.total : 0,
      playerHp: typeof player.hp === "number" ? player.hp : 0,
      enemiesActive: typeof enemies.activeTotal === "number" ? enemies.activeTotal : 0,
      gruntCapacity: typeof enemies.gruntCapacity === "number" ? enemies.gruntCapacity : 0,
      eliteCapacity: typeof enemies.eliteCapacity === "number" ? enemies.eliteCapacity : 0,
      lookId: typeof look.id === "string" ? look.id : ""
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.framed).toBe(true);
  expect(routeState.phase).toBe("playing");
  expect(routeState.waveIndex).toBe(1);
  expect(routeState.waveTotal).toBe(5);
  expect(routeState.playerHp).toBeGreaterThan(0);
  expect(routeState.enemiesActive).toBeGreaterThan(0);
  expect(routeState.gruntCapacity).toBe(360);
  expect(routeState.eliteCapacity).toBe(96);
  expect(routeState.lookId).toBe("neon-arcade");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
