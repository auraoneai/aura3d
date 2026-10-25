import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * 4.1.4 release check (remote only, software WebGL2): Gridlock Courier awaits `warmPrograms` before it marks itself ready,
 * so the first frame after ready draws the whole city. Before the fix the first visible frame drew 47 of 113 calls.
 */
interface Api { ready(): boolean; stepFrames(n: number): unknown; diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null }

test.describe("gridlock first frame", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("the first frame after ready is as complete as the steady state", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/404|favicon/.test(m.text())) errors.push(m.text()); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/examples/drift-and-deliver-port/?manual=1&quality=low&models=0`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_DRIFT_AND_DELIVER__?: Api }).__AURA_DRIFT_AND_DELIVER__?.ready() === true, undefined, { timeout: 540_000 });
    const sample = await page.evaluate(() => {
      const o = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: Api }).__AURA_DRIFT_AND_DELIVER__;
      const first = o.diagnostics()?.drawCalls ?? 0;
      const later: number[] = [];
      for (let i = 0; i < 4; i++) { o.stepFrames(3); later.push(o.diagnostics()?.drawCalls ?? 0); }
      return { first, later, errors: o.diagnostics()?.errors?.length ?? 0 };
    });
    const steady = Math.max(...sample.later);
    console.log("R414_GRIDLOCK", JSON.stringify({ ...sample, steady }));
    expect(sample.errors).toBe(0);
    expect(steady).toBeGreaterThan(20);
    expect(sample.first, "first frame draws the whole scene").toBeGreaterThanOrEqual(Math.floor(steady * 0.9));
    expect(errors).toEqual([]);
  });
});
