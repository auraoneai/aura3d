/**
 * Second isolation probe: does a plain MODEL node render on the far side of the
 * arena, where instanced geometry is being culled? The ball is a model node, so
 * it is the cheapest available test subject — patch its per-frame setter, move
 * it far-side, present one frame.
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5274/";
const out = process.argv[3] ?? "arcade/prism-break/captures/diag";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);

const res = await page.evaluate(() => {
  const reg = globalThis.__AURA3D_LIVE_APPS__;
  const app = reg.all()[0];
  reg.pauseAll();
  const ball = app.nodes.require("ball-0");
  if (!ball.__origSetPosition) {
    ball.__origSetPosition = ball.setPosition.bind(ball);
    ball.setPosition = () => ball; // stop the game overwriting it each frame
  }
  ball.setVisible(true).setScale([2.5, 2.5, 2.5]);
  ball.__origSetPosition(0, 1.0, -2.6); // far side, same place the instance vanished
  app.step(0);
  return { snap: ball.snapshot().position, visible: ball.snapshot().visible };
});
console.log("MODEL_FAR", JSON.stringify(res));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/m1-model-far.png` });

const res2 = await page.evaluate(() => {
  const app = globalThis.__AURA3D_LIVE_APPS__.all()[0];
  const ball = app.nodes.require("ball-0");
  ball.__origSetPosition(0, 1.0, 2.6); // near side, control
  app.step(0);
  return ball.snapshot().position;
});
console.log("MODEL_NEAR", JSON.stringify(res2));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/m2-model-near.png` });

await browser.close();
