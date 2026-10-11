/**
 * vehicle-rail.spec.ts — PRD-08 S11 (closed 6-point rail) and S12 (bicycle
 * drift) in the browser, through the mounted app:
 *
 *   S11: `camera.rigs.rail({ loop: "loop" })` over the rail-continuity.test.ts
 *        control polygon, one 12 s lap of presented eye positions at 60 Hz —
 *        per-frame speed variation ≤ 5 %, lap end within 1 % of rail length.
 *        Control: an eased (inOutSine) loop stalls at the seam (> 5 %).
 *   S12: `createGameArcadeVehicle({ model: "bicycle", tyre: { mu: 1 } })`
 *        driving the `car` node with the vehicle-drift.test.ts script.
 *        Control: `model: "unicycle"` never exceeds 0.01 rad.
 *
 * Per-run JSON lands in tests/reports/prd08/vehicle-rail/ (CI artifact).
 * Remote-only: `qr-prd08-camera.yml` browser-gpu (macos-14).
 */
import { expect, test } from "@playwright/test";
import { startPrd08DevServer, type ExampleDevServer } from "../dev-server";
import { checkDrift, checkDriftUnicycle, checkRail } from "../checks";
import { captureCanvas, openHarness, pwExpect, scenario, writeEvidence } from "./harness-page";

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startPrd08DevServer();
});
test.afterAll(async () => {
  await server.close();
});

test.describe("prd08 S11 rail continuity", () => {
  test("closed 6-point rail: speed variation ≤ 5 %, seam ≤ 1 % of rail length", async ({ page }) => {
    await openHarness(page, server.origin);
    const r = await scenario<Parameters<typeof checkRail>[1]>(page, "rail-lap", { lap: 12 });
    writeEvidence("vehicle-rail", "s11-rail.json", r);
    checkRail(pwExpect, r);
  });

  test("control: an eased loop stalls at the seam and exceeds 5 %", async ({ page }) => {
    await openHarness(page, server.origin);
    const r = await scenario<Parameters<typeof checkRail>[1]>(page, "rail-lap", { lap: 12, ease: "inOutSine" });
    const m = r.speeds.reduce((a, b) => a + b, 0) / r.speeds.length;
    expect(Math.max(...r.speeds.map((s) => Math.abs(s - m) / m))).toBeGreaterThan(0.05);
  });
});

test.describe("prd08 S12 bicycle drift", () => {
  test("bicycle: drift ≥ 0.6 s with |slip| > 0.2 rad, counter-steer settles < 0.05 rad within 1.5 s", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&scene=drift&model=bicycle");
    const r = await scenario<Parameters<typeof checkDrift>[1]>(page, "drift-script");
    await captureCanvas(page, "vehicle-rail", "s12-drift-end");
    writeEvidence("vehicle-rail", "s12-drift-bicycle.json", r);
    checkDrift(pwExpect, r);
  });

  test("control: unicycle never exceeds 0.01 rad of slip", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&scene=drift&model=unicycle");
    const r = await scenario<Parameters<typeof checkDriftUnicycle>[1]>(page, "drift-script");
    writeEvidence("vehicle-rail", "s12-drift-unicycle.json", r);
    checkDriftUnicycle(pwExpect, r);
  });
});
