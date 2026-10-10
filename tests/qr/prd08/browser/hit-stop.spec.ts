/**
 * hit-stop.spec.ts — PRD-08 S5 in the browser on the lane combat harness
 * (`?scene=fighters`: tests/qr/prd08/fixtures/fighters.json — two fighters +
 * bystander). Global stop (`app.time.hitStop(0.1)`): sim frozen ± 1 fixed step. Scoped
 * `hit-heavy` [a, b] (0.07 s): a and b frozen ± 1 step while the bystander
 * moves and the camera shake carries energy on every frozen frame. Control:
 * an event without `hitStop` leaves every node moving.
 *
 * Frames: the scoped run is replayed frame by frame with a canvas capture per
 * presented frame (pre-hit, every frozen frame, resumed) into
 * tests/reports/prd08/hit-stop/ alongside the per-frame JSON, uploaded by CI
 * and committed under docs/project/aura3d-quality-rebuild/evidence/prd08/
 * hit-stop/<run-id>/.
 *
 * Remote-only: `qr-prd08-camera.yml` browser-gpu (macos-14).
 */
import { expect, test } from "@playwright/test";
import { startPrd08DevServer, type ExampleDevServer } from "../dev-server";
import { checkHitStopGlobal, checkHitStopScoped, checkNoHitStopMoves } from "../checks";
import { captureCanvas, drain, openHarness, pump, pwExpect, scenario, writeEvidence } from "./harness-page";

const FIGHTERS = "?scripted=1&scene=fighters";
const ACTORS = ["fighter-a", "fighter-b"] as const;

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startPrd08DevServer();
});
test.afterAll(async () => {
  await server.close();
});

test.describe("prd08 S5 hit-stop — two fighters + bystander", () => {
  test("scoped hit-heavy [a, b]: actors frozen 0.07 s ± 1 step; bystander and shake continue", async ({ page }) => {
    await openHarness(page, server.origin, FIGHTERS);
    const r = await scenario<Parameters<typeof checkHitStopScoped>[1]>(page, "hit-stop-scoped", {
      event: "hit-heavy",
      actors: ACTORS,
      frames: 12
    });
    writeEvidence("hit-stop", "scoped.json", r);
    checkHitStopScoped(pwExpect, r, 0.07);
  });

  test("global app.time.hitStop(0.1): every node frozen ± 1 step while frames keep presenting", async ({ page }) => {
    await openHarness(page, server.origin, FIGHTERS);
    const r = await scenario<Parameters<typeof checkHitStopGlobal>[1]>(page, "hit-stop-global", { seconds: 0.1 });
    writeEvidence("hit-stop", "global.json", r);
    checkHitStopGlobal(pwExpect, r, 0.1);
    // Global gates EVERYTHING: the bystander is frozen too on the stalled frames.
    const t0 = r.simTime[0]!;
    const stalled = r.simTime.map((t, i) => [t, i] as const).filter(([t]) => Math.abs(t - t0) < 1e-9).map(([, i]) => i);
    for (const i of stalled.slice(1)) {
      const a = r.positions[i]!;
      const b = r.positions[i - 1]!;
      for (let n = 0; n < a.length; n += 1) {
        expect(Math.hypot(a[n]![0] - b[n]![0], a[n]![1] - b[n]![1], a[n]![2] - b[n]![2])).toBeLessThan(1e-9);
      }
    }
  });

  test("control: an event without hitStop leaves the fighters moving", async ({ page }) => {
    await openHarness(page, server.origin, FIGHTERS);
    checkNoHitStopMoves(pwExpect, await scenario(page, "hit-stop-scoped", { event: "land", frames: 10 }));
  });

  test("frames: scoped hit-stop captured per presented frame", async ({ page }) => {
    await openHarness(page, server.origin, FIGHTERS);
    await page.evaluate(() => {
      (window as never as { __AURA3D_PRD08_HARNESS__: { app: { feel: { preset(n: string): void } } } }).__AURA3D_PRD08_HARNESS__.app.feel.preset("fighting");
    });
    await pump(page, 1000 / 60, 18); // 0.3 s = fixture hit.at
    await drain(page);
    await captureCanvas(page, "hit-stop", "frame-00-pre-hit");
    await page.evaluate((actors) => {
      (window as never as { __AURA3D_PRD08_HARNESS__: { app: { feel: { emit(e: string, at: unknown): void } } } }).__AURA3D_PRD08_HARNESS__.app.feel.emit(
        "hit-heavy",
        { actors }
      );
    }, ACTORS);
    const frames: { frame: number; positions: unknown; layerEnergy: number; simTime: number }[] = [];
    for (let i = 1; i <= 9; i += 1) {
      await pump(page, 1000 / 60, 1);
      const [rec] = await drain(page);
      frames.push({ frame: i, positions: rec!.positions, layerEnergy: rec!.layerEnergy, simTime: rec!.simTime });
      await captureCanvas(page, "hit-stop", `frame-${String(i).padStart(2, "0")}`);
    }
    writeEvidence("hit-stop", "frames.json", { nodeIds: ["fighter-a", "fighter-b", "bystander"], frames });
    // The captured run is the asserted behaviour: the first frames hold a/b,
    // the last ones show them moving again.
    const p = (i: number, n: number) => (frames[i]!.positions as number[][])[n]!;
    const d = (i: number, j: number, n: number) => Math.hypot(p(i, n)[0]! - p(j, n)[0]!, p(i, n)[1]! - p(j, n)[1]!, p(i, n)[2]! - p(j, n)[2]!);
    expect(d(1, 0, 0)).toBeLessThan(1e-9);
    expect(d(1, 0, 1)).toBeLessThan(1e-9);
    expect(d(1, 0, 2)).toBeGreaterThan(1e-5);
    expect(d(8, 7, 0)).toBeGreaterThan(1e-3);
    expect(frames[1]!.layerEnergy).toBeGreaterThan(0);
  });
});
