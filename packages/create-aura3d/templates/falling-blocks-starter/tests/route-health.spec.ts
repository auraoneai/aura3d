import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("Aura3D falling-blocks starter reaches ready state with line-clear evidence", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");

  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const routeState = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__AURA3D_FALLING_BLOCKS_STARTER__");
    const state = isRecord(value) ? value : {};
    const lineClearProofValue = state.lineClearProof;
    const lineClearProof = isRecord(lineClearProofValue) ? lineClearProofValue : {};
    return {
      score: typeof state.score === "number" ? state.score : -1,
      lines: typeof state.lines === "number" ? state.lines : -1,
      proofLines: typeof lineClearProof.lines === "number" ? lineClearProof.lines : 0
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.score).toBeGreaterThanOrEqual(0);
  expect(routeState.lines).toBeGreaterThanOrEqual(0);
  expect(routeState.proofLines).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
