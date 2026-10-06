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
    const geometry = isRecord(state.geometry) ? state.geometry : {};
    const look = isRecord(state.look) ? state.look : {};
    return {
      status: typeof state.status === "string" ? state.status : "missing",
      checkpointCount: typeof state.checkpointCount === "number" ? state.checkpointCount : 0,
      lookId: typeof look.id === "string" ? look.id : "missing",
      carScale: typeof geometry.carScale === "number" ? geometry.carScale : 0,
      carMetres: Array.isArray(geometry.carMetres) ? geometry.carMetres : [],
      trackMetres: Array.isArray(geometry.trackMetres) ? geometry.trackMetres : [],
      certifyReport: typeof geometry.report === "string" ? geometry.report : "missing"
    };

    function isRecord(recordValue: unknown): recordValue is Readonly<Record<string, unknown>> {
      return typeof recordValue === "object" && recordValue !== null && !Array.isArray(recordValue);
    }
  });

  expect(drawCalls).toBeGreaterThan(0);
  expect(routeState.status).toBe("running");
  expect(routeState.checkpointCount).toBeGreaterThanOrEqual(6);
  expect(routeState.lookId).toBe("golden-hour");
  expect(routeState.carScale).toBe(1);
  expect(routeState.carMetres[0]).toBeGreaterThan(3);
  expect(routeState.trackMetres[0]).toBeGreaterThan(20);
  expect(routeState.certifyReport).toBe("tests/geometry-certification.json");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls, routeState }, null, 2)}\n`);
});
