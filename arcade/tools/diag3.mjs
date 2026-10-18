/**
 * Z sweep: place the same model node at a range of depths and record where it
 * stops being drawn. Maps the exact boundary instead of guessing at the cause.
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

await page.evaluate(() => {
  const reg = globalThis.__AURA3D_LIVE_APPS__;
  const app = reg.all()[0];
  reg.pauseAll();
  const ball = app.nodes.require("ball-0");
  if (!ball.__origSetPosition) {
    ball.__origSetPosition = ball.setPosition.bind(ball);
    ball.setPosition = () => ball;
  }
  ball.setVisible(true).setScale([1.8, 1.8, 1.8]);
});

for (const z of [2.6, 1.5, 0, -1.0, -1.6, -2.0, -2.6]) {
  await page.evaluate((z) => {
    const app = globalThis.__AURA3D_LIVE_APPS__.all()[0];
    const ball = app.nodes.require("ball-0");
    ball.__origSetPosition(0, 1.2, z);
    app.step(0);
  }, z);
  await page.waitForTimeout(350);
  const label = `z${z < 0 ? "neg" : "pos"}${Math.abs(z).toFixed(1).replace(".", "")}`;
  await page.screenshot({ path: `${out}/sweep-${label}.png` });
  console.log("shot", label, z);
}

await browser.close();
