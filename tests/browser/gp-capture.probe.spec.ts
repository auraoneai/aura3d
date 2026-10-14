
import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { startExampleDevServer } from "./example-dev-server";

test("capture three aim states", async ({ page }) => {
  test.setTimeout(240_000);
  const server = await startExampleDevServer();
  await page.goto(server.origin + "/apps/showcase-gravity-post/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__GRAVITY_POST_EVIDENCE__), undefined, { timeout: 60_000 });
  const shot = () => page.screenshot({ clip: { x: 15, y: 15, width: 700, height: 560 } });
  await page.evaluate(() => { (window as unknown as { __GRAVITY_POST_STEP__: (d: number) => void }).__GRAVITY_POST_STEP__(1 / 30); });
  await shot().then((b) => writeFileSync("/tmp/gp-idle.png", b));
  const aim = (moves: number[][], release: boolean) => page.evaluate(({ m, r }) => {
    const canvas = document.querySelector("[data-testid='gravity-post-stage'] canvas")!;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.x + rect.width / 2, sy = rect.y + rect.height / 2;
    const fire = (t: string, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 7 }));
    fire("pointerdown", sx, sy);
    for (const [dx, dy] of m) fire("pointermove", sx + dx, sy + dy);
    if (r) fire("pointerup", sx + m[m.length - 1][0], sy + m[m.length - 1][1]);
  }, { m: moves, r: release });
  await aim([[-60, 48]], false);
  await page.evaluate(() => { (window as unknown as { __GRAVITY_POST_STEP__: (d: number) => void }).__GRAVITY_POST_STEP__(1 / 30); });
  await shot().then((b) => writeFileSync("/tmp/gp-short.png", b));
  await aim([[-60, 48], [-120, 96]], false);
  await page.evaluate(() => { (window as unknown as { __GRAVITY_POST_STEP__: (d: number) => void }).__GRAVITY_POST_STEP__(1 / 30); });
  await shot().then((b) => writeFileSync("/tmp/gp-long.png", b));
  const ev = await page.evaluate(() => {
    const e = (window as unknown as { __GRAVITY_POST_EVIDENCE__: Record<string, unknown> }).__GRAVITY_POST_EVIDENCE__;
    return { ps: e.predictionSteps, aiming: e.aiming };
  });
  console.log("evidence:", JSON.stringify(ev));
  await server.close();
});
