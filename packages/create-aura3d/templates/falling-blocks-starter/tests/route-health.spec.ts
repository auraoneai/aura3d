import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(240_000);

test("Aura3D falling-blocks starter reaches ready state with instanced board evidence", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");

  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const routeState = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__AURA3D_FALLING_BLOCKS_STARTER__");
    const state = isRecord(value) ? value : {};
    const look = isRecord(state.look) ? state.look : {};
    const board = isRecord(state.board) ? state.board : {};
    const cellAsset = isRecord(board.cellAsset) ? board.cellAsset : {};
    const flash = isRecord(state.flash) ? state.flash : {};
    return {
      score: typeof state.score === "number" ? state.score : -1,
      lines: typeof state.lines === "number" ? state.lines : -1,
      lookId: typeof look.id === "string" ? look.id : "",
      rendering: typeof board.rendering === "string" ? board.rendering : "",
      filledCells: typeof board.filledCells === "number" ? board.filledCells : 0,
      cellAssetId: typeof cellAsset.id === "string" ? cellAsset.id : "",
      flashModelBased: flash.modelBased === true
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.score).toBeGreaterThanOrEqual(0);
  expect(routeState.lines).toBeGreaterThanOrEqual(0);
  expect(routeState.lookId).toBe("neon-arcade");
  expect(routeState.rendering).toBe("instanced-model");
  expect(routeState.filledCells).toBeGreaterThan(0);
  expect(routeState.cellAssetId).toBe("blockCell");
  expect(routeState.flashModelBased).toBe(true);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
