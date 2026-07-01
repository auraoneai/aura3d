import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("Aura3D racing starter reaches ready state with gameplay evidence", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");

  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const routeState = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__AURA3D_RACING_STARTER__");
    const state = isRecord(value) ? value : {};
    const lapProofValue = state.lapProof;
    const lapProof = isRecord(lapProofValue) ? lapProofValue : {};
    return {
      status: typeof state.status === "string" ? state.status : "missing",
      checkpointCount: typeof state.checkpointCount === "number" ? state.checkpointCount : 0,
      lapProofStatus: typeof lapProof.status === "string" ? lapProof.status : "missing",
      lapsToWin: typeof lapProof.lapsToWin === "number" ? lapProof.lapsToWin : 0,
      minLapSeconds: typeof lapProof.minLapSeconds === "number" ? lapProof.minLapSeconds : 0,
      routeAlignedToVisibleTrack: lapProof.routeAlignedToVisibleTrack === true
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.status).toBe("running");
  expect(routeState.checkpointCount).toBeGreaterThanOrEqual(6);
  expect(routeState.lapProofStatus).toBe("contract-ready");
  expect(routeState.lapsToWin).toBeGreaterThanOrEqual(3);
  expect(routeState.minLapSeconds).toBeGreaterThanOrEqual(20);
  expect(routeState.routeAlignedToVisibleTrack).toBe(true);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
