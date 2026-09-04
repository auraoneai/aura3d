import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Scratch single-game capture for visual iteration. NOT part of the suite.
// Env: A3D_SCRATCH_ROUTE (e.g. /apps/showcase-skyline-runner/),
//      A3D_SCRATCH_OUT (png path), A3D_SCRATCH_HOLD (key), A3D_SCRATCH_HOLD_MS,
//      A3D_SCRATCH_QUERY, A3D_SCRATCH_SETTLE ("0" to skip settleSubjectPose),
//      A3D_SCRATCH_EVAL (js to eval before shot).
let server: ExampleDevServer;
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("scratch capture", async ({ browser }, testInfo) => {
  testInfo.setTimeout(240_000);
  const route = process.env.A3D_SCRATCH_ROUTE ?? "/apps/showcase-skyline-runner/";
  const out = process.env.A3D_SCRATCH_OUT ?? "/tmp/scratch-capture.png";
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const query = process.env.A3D_SCRATCH_QUERY ?? "";
  const response = await page.goto(`${server.origin}${route}${query}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  expect(response?.status()).toBeLessThan(400);
  try {
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 45_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 90_000 });
  }
  await page.waitForTimeout(2_400);
  if (process.env.A3D_SCRATCH_SETTLE !== "0") {
    await page.evaluate(() => {
      (window as unknown as { __AURA3D_COMPOSITION_PROBE__?: { settleSubjectPose?: () => unknown } }).__AURA3D_COMPOSITION_PROBE__?.settleSubjectPose?.();
    });
    await page.waitForTimeout(800);
  }
  if (process.env.A3D_SCRATCH_EVAL) console.log(`SCRATCH_EVAL_RESULT ${JSON.stringify(await page.evaluate(process.env.A3D_SCRATCH_EVAL))}`);
  console.log(`SCRATCH_GEOM ${JSON.stringify(await page.evaluate(() => {
    const c = document.querySelector(".runner-stage canvas, canvas");
    const r = c?.getBoundingClientRect();
    return { rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, innerH: window.innerHeight, bodyH: document.body?.scrollHeight };
  }))}`);
  const hold = process.env.A3D_SCRATCH_HOLD;
  if (hold) {
    await page.keyboard.down(hold);
    await page.waitForTimeout(Number(process.env.A3D_SCRATCH_HOLD_MS ?? 1500));
    await page.keyboard.up(hold);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: out });
  await page.locator("canvas").first().screenshot({ path: out.replace(/\.png$/, ".canvas.png") });
  await page.close();
});
